import assert from "../../lib/assert";
import localForageLru from "../../lib/localforage-lru";
const communitiesDatabase = localForageLru.createInstance({
  name: "bitsocialReactHooks-communities",
  size: 500,
});
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:communities:stores");
import {
  Community,
  Communities,
  Account,
  CommunityIdentifier,
  CommunitySyncState,
  CreateCommunityOptions,
} from "../../types";
import utils from "../../lib/utils";
import createStore from "zustand";
import accountsStore from "../accounts";
import communitiesPagesStore from "../communities-pages";
import { getCommunityLookupOptions, getCommunityRefKey } from "../../lib/community-ref";
import {
  createPkcCommunity,
  getPkcCommunity,
  getPkcCommunityAddresses,
  getPkcCreateCommunity,
  getPkcGetCommunity,
} from "../../lib/pkc-compat";

export const COMMUNITY_UPDATE_INTERVAL_MS = 15 * 60 * 1000;

// How long a community keeps updating after nothing uses it anymore. pkc-js forgets the record
// CIDs and gateway ETags it already loaded when a community stops, so every restart downloads the
// whole record again, while a running loop downloads it once per publish. Communities publish
// between every ~20 seconds when busy and every 15 minutes when idle, so 2 minutes keeps quick
// back-and-forth navigation from re-downloading records and bounds what an abandoned busy
// community costs to about one restart's worth of downloads.
export const COMMUNITY_UPDATE_STOP_GRACE_MS = 2 * 60 * 1000;

let pkcGetCommunityPending: { [key: string]: boolean } = {};

// The pkc-js instance kept for each community in the store, keyed by community so
// delete/reset can stop it and subscribers can stop and restart its update loop.
type LiveCommunity = {
  community: any;
  communityAddressOrRef: string | CommunityIdentifier;
  // defined while the update loop runs
  updateInterval?: ReturnType<typeof setInterval>;
  updateCall?: Promise<void>;
  stopping?: Promise<void>;
  // update() re-emits the record the instance already holds, recognized so it is not stored as
  // a new fetch
  replayRecordId?: string;
  // the cached record replayed on the first update() counts as fetched, a record replayed on a
  // restart keeps the fetchedAt of its real fetch
  replayRefreshesFetchedAt: boolean;
  // the loop started and has neither fetched a record nor failed yet
  openingUpdatePending: boolean;
  stopWhenOpeningUpdateEnds: boolean;
  onUpdatingStateChange: (updatingState: string) => void;
};
const liveCommunities: { [communityKey: string]: LiveCommunity } = {};
// hooks and feeds that need a community kept updating, the loop stops after the last one leaves
const communityUpdateSubscribers: { [communityKey: string]: Set<string> } = {};
const communityStopTimers: { [communityKey: string]: ReturnType<typeof setTimeout> } = {};

// reset all event listeners in between tests
const listeners: any = [];

const COMMUNITY_ERROR_UPDATE_GRACE_MS = 1000;
const pendingCommunityErrorTimers: {
  [communityKey: string]: ReturnType<typeof setTimeout>[];
} = {};

interface CommunitySyncStatus {
  syncState: CommunitySyncState;
  lastFetchAttemptAt?: number;
  lastSuccessfulFetchAt?: number;
  // why the community is being retried; retriable errors stay out of `errors` so they do not
  // flash in the UI, but a community that never loads needs a reason to show
  lastRetriableError?: Error;
  // stopped because nothing used it, the next subscriber restarts it
  stoppedUntilUsed?: true;
}

const omitLastRetriableError = (syncStatus: CommunitySyncStatus): CommunitySyncStatus => {
  const nextSyncStatus = { ...syncStatus };
  delete nextSyncStatus.lastRetriableError;
  return nextSyncStatus;
};

const getNowSeconds = () => Math.floor(Date.now() / 1000);

const normalizeCommunitySyncState = (updatingState: string): CommunitySyncState => {
  if (updatingState === "waiting-retry") {
    return "retrying";
  }
  if (updatingState === "succeeded" || updatingState === "failed" || updatingState === "stopped") {
    return updatingState;
  }
  return "loading";
};

const getNextSyncStatuses = (
  state: CommunitiesState,
  communityKey: string,
  syncState: CommunitySyncState,
) => {
  const previousStatus = state.syncStatuses[communityKey];
  const timestamp = getNowSeconds();
  const shouldRecordAttempt = syncState === "loading" && previousStatus?.syncState !== "loading";
  const nextStatus: CommunitySyncStatus = {
    ...previousStatus,
    syncState,
    ...(shouldRecordAttempt ? { lastFetchAttemptAt: timestamp } : undefined),
    ...(syncState === "succeeded" ? { lastSuccessfulFetchAt: timestamp } : undefined),
  };
  return {
    ...state.syncStatuses,
    // a success ends the retries, so their error is no longer current
    [communityKey]: syncState === "succeeded" ? omitLastRetriableError(nextStatus) : nextStatus,
  };
};

const updateCommunitySyncStatus = (
  setState: Function,
  communityKey: string,
  syncState: CommunitySyncState,
) => {
  setState((state: CommunitiesState) => ({
    ...state,
    syncStatuses: getNextSyncStatuses(state, communityKey, syncState),
  }));
};

// identifies a signed community record, to recognize pkc-js re-emitting a record already in the store
const getCommunityRecordId = (community: any): string | undefined => {
  const signature = community?.signature?.signature;
  if (typeof signature !== "string" || typeof community?.updatedAt !== "number") {
    return;
  }
  return `${community.updatedAt}:${signature}`;
};

const createCommunityWithLookupFallback = async (
  pkc: any,
  communityLookupOptions: { address?: string; name?: string; publicKey?: string },
  communityKey: string,
) => {
  const supportsAddressLookup = "address" in communityLookupOptions;
  const community = await createPkcCommunity(pkc, communityLookupOptions);
  if (community?.address || supportsAddressLookup) {
    return community;
  }
  throw Error(`communitiesStore.addCommunityToStore failed getting community '${communityKey}'`);
};

const getCommunityKey = (communityAddressOrRef: string | CommunityIdentifier) =>
  typeof communityAddressOrRef === "string"
    ? communityAddressOrRef
    : getCommunityRefKey(communityAddressOrRef);

const hasCommunityUpdateSubscribers = (communityKey: string) =>
  (communityUpdateSubscribers[communityKey]?.size || 0) > 0;

const updateCommunity = (communityKey: string, liveCommunity: LiveCommunity) => {
  const { community, communityAddressOrRef } = liveCommunity;
  liveCommunity.updateCall = Promise.resolve()
    .then(() => community.update())
    .catch((error: unknown) =>
      log.trace("community.update error", {
        communityAddressOrRef,
        communityKey,
        community,
        error,
      }),
    );
};

const startCommunityUpdatePolling = (communityKey: string, liveCommunity: LiveCommunity) => {
  clearInterval(liveCommunity.updateInterval);
  liveCommunity.openingUpdatePending = true;
  liveCommunity.stopWhenOpeningUpdateEnds = false;
  updateCommunity(communityKey, liveCommunity);
  liveCommunity.updateInterval = setInterval(
    () => updateCommunity(communityKey, liveCommunity),
    COMMUNITY_UPDATE_INTERVAL_MS,
  );
};

const pauseCommunityUpdatePolling = (communityKey: string) => {
  const liveCommunity = liveCommunities[communityKey];
  if (!liveCommunity?.updateInterval) {
    return;
  }
  clearInterval(liveCommunity.updateInterval);
  liveCommunity.updateInterval = undefined;
  liveCommunity.openingUpdatePending = false;
  liveCommunity.stopWhenOpeningUpdateEnds = false;
  liveCommunity.replayRecordId = undefined;
  clearPendingCommunityErrors(communityKey);
  const { community, updateCall } = liveCommunity;
  // stopping while update() is still attaching to the shared updating instance would leave its
  // listeners attached, so wait for the call to return first
  const stopping = (async () => {
    await updateCall;
    if (typeof community.stop !== "function") {
      return;
    }
    try {
      await community.stop();
    } catch (error) {
      log.trace("community.stop error", { communityKey, community, error });
    }
  })();
  liveCommunity.stopping = stopping;
  stopping.finally(() => {
    if (liveCommunity.stopping === stopping) {
      liveCommunity.stopping = undefined;
    }
  });
  log("communitiesStore community update loop stopped", { communityKey });
};

const resumeCommunityUpdatePolling = async (communityKey: string) => {
  const liveCommunity = liveCommunities[communityKey];
  if (!liveCommunity || liveCommunity.updateInterval) {
    return;
  }
  // update() is a no-op until a stop in progress ends
  if (liveCommunity.stopping) {
    await liveCommunity.stopping;
  }
  if (
    liveCommunities[communityKey] !== liveCommunity ||
    liveCommunity.updateInterval ||
    !hasCommunityUpdateSubscribers(communityKey)
  ) {
    return;
  }
  liveCommunity.replayRecordId = getCommunityRecordId(liveCommunity.community);
  liveCommunity.replayRefreshesFetchedAt = false;
  startCommunityUpdatePolling(communityKey, liveCommunity);
  log("communitiesStore community update loop restarted", { communityKey });
  // joining a shared pkc-js instance that another consumer kept updating emits no state change
  // until its next fetch, so take its current state
  await liveCommunity.updateCall;
  const { updatingState } = liveCommunity.community;
  if (
    liveCommunity.updateInterval &&
    typeof updatingState === "string" &&
    updatingState !== "stopped" &&
    communitiesStore.getState().syncStatuses[communityKey]?.stoppedUntilUsed
  ) {
    liveCommunity.onUpdatingStateChange(updatingState);
  }
};

const clearCommunityStopTimer = (communityKey: string) => {
  clearTimeout(communityStopTimers[communityKey]);
  delete communityStopTimers[communityKey];
};

const scheduleCommunityUpdateStop = (communityKey: string) => {
  clearCommunityStopTimer(communityKey);
  communityStopTimers[communityKey] = setTimeout(() => {
    delete communityStopTimers[communityKey];
    const liveCommunity = liveCommunities[communityKey];
    if (hasCommunityUpdateSubscribers(communityKey) || !liveCommunity?.updateInterval) {
      return;
    }
    // stopping before the first fetch ends would leave a store-level caller without the record
    // it loaded the community for
    if (liveCommunity.openingUpdatePending) {
      liveCommunity.stopWhenOpeningUpdateEnds = true;
      return;
    }
    pauseCommunityUpdatePolling(communityKey);
  }, COMMUNITY_UPDATE_STOP_GRACE_MS);
};

const endOpeningCommunityUpdate = (communityKey: string, liveCommunity: LiveCommunity) => {
  if (!liveCommunity.openingUpdatePending) {
    return;
  }
  liveCommunity.openingUpdatePending = false;
  if (!liveCommunity.stopWhenOpeningUpdateEnds) {
    return;
  }
  liveCommunity.stopWhenOpeningUpdateEnds = false;
  if (!hasCommunityUpdateSubscribers(communityKey)) {
    pauseCommunityUpdatePolling(communityKey);
  }
};

const stopCommunityUpdatePolling = (communityKey: string) => {
  clearCommunityStopTimer(communityKey);
  const liveCommunity = liveCommunities[communityKey];
  if (!liveCommunity) {
    return;
  }

  clearPendingCommunityErrors(communityKey);
  clearInterval(liveCommunity.updateInterval);
  liveCommunity.updateInterval = undefined;
  liveCommunity.community.removeAllListeners();
  const listenerIndex = listeners.indexOf(liveCommunity.community);
  if (listenerIndex >= 0) {
    listeners.splice(listenerIndex, 1);
  }
  delete liveCommunities[communityKey];
};

const clearPendingCommunityErrors = (communityKey: string) => {
  pendingCommunityErrorTimers[communityKey]?.forEach((timeout) => clearTimeout(timeout));
  delete pendingCommunityErrorTimers[communityKey];
};

const clearStoredCommunityErrors = (state: CommunitiesState, communityKey: string) => {
  if (!state.errors[communityKey]) {
    return state.errors;
  }
  const nextErrors = { ...state.errors };
  delete nextErrors[communityKey];
  return nextErrors;
};

// returning the same state skips notifying subscribers when there is nothing to clear
const clearStoredCommunityErrorsState = (state: CommunitiesState, communityKey: string) => {
  const syncStatus = state.syncStatuses[communityKey];
  const hasRetriableError = syncStatus?.lastRetriableError !== undefined;
  if (!state.errors[communityKey] && !hasRetriableError) {
    return state;
  }
  return {
    ...state,
    errors: clearStoredCommunityErrors(state, communityKey),
    syncStatuses: hasRetriableError
      ? { ...state.syncStatuses, [communityKey]: omitLastRetriableError(syncStatus) }
      : state.syncStatuses,
  };
};

export const isRetriableCommunityLoadError = (error: Error) => {
  const details = (error as Error & { details?: unknown }).details;
  return Boolean(
    details &&
    typeof details === "object" &&
    "retriableError" in details &&
    (details as { retriableError?: unknown }).retriableError === true,
  );
};

const recordRetriableCommunityError = (setState: Function, communityKey: string, error: Error) => {
  setState((state: CommunitiesState) => {
    const syncStatus = state.syncStatuses[communityKey];
    // a deleted community has no sync status left to report on
    if (!syncStatus) {
      return state;
    }
    return {
      syncStatuses: {
        ...state.syncStatuses,
        [communityKey]: { ...syncStatus, lastRetriableError: error },
      },
    };
  });
};

const scheduleCommunityError = (setState: Function, communityKey: string, error: Error) => {
  if (isRetriableCommunityLoadError(error)) {
    recordRetriableCommunityError(setState, communityKey, error);
    return;
  }

  const timeout = setTimeout(() => {
    const pendingTimeouts = pendingCommunityErrorTimers[communityKey];
    if (!pendingTimeouts?.includes(timeout)) {
      return;
    }

    const remainingTimeouts = pendingTimeouts.filter(
      (pendingTimeout) => pendingTimeout !== timeout,
    );
    if (remainingTimeouts.length === 0) {
      delete pendingCommunityErrorTimers[communityKey];
    } else {
      pendingCommunityErrorTimers[communityKey] = remainingTimeouts;
    }
    setState((state: CommunitiesState) => {
      const communityErrors = state.errors[communityKey] || [];
      return {
        ...state,
        errors: { ...state.errors, [communityKey]: [...communityErrors, error] },
      };
    });
  }, COMMUNITY_ERROR_UPDATE_GRACE_MS);

  pendingCommunityErrorTimers[communityKey] = [
    ...(pendingCommunityErrorTimers[communityKey] || []),
    timeout,
  ];
};

export type CommunitiesState = {
  communities: Communities;
  errors: { [communityAddress: string]: Error[] };
  syncStatuses: { [communityAddress: string]: CommunitySyncStatus };
  addCommunityToStore: Function;
  startCommunityAutoUpdate: Function;
  stopCommunityAutoUpdate: Function;
  refreshCommunity: Function;
  editCommunity: Function;
  createCommunity: Function;
  deleteCommunity: Function;
};

const communitiesStore = createStore<CommunitiesState>(
  (setState: Function, getState: Function) => ({
    communities: {},
    errors: {},
    syncStatuses: {},

    async addCommunityToStore(
      communityAddressOrRef: string | CommunityIdentifier,
      account: Account,
    ) {
      const communityLookupOptions = getCommunityLookupOptions(communityAddressOrRef);
      const communityKey =
        typeof communityAddressOrRef === "string"
          ? communityAddressOrRef
          : getCommunityRefKey(communityAddressOrRef);
      assert(
        communityKey !== "" && typeof communityKey === "string",
        `communitiesStore.addCommunityToStore invalid communityAddress argument '${communityAddressOrRef}'`,
      );
      assert(
        typeof getPkcCreateCommunity(account?.pkc) === "function",
        `communitiesStore.addCommunityToStore invalid account argument '${account}'`,
      );

      // community is in store already, do nothing
      const { communities } = getState();
      let community: Community | undefined = communities[communityKey];
      const pendingKey = communityKey + account.id;
      if (community || pkcGetCommunityPending[pendingKey]) {
        return;
      }

      // start trying to get community
      pkcGetCommunityPending[pendingKey] = true;
      updateCommunitySyncStatus(setState, communityKey, "initializing");
      let errorGettingCommunity: any;
      try {
        // try to find community in owner communities
        if (getPkcCommunityAddresses(account.pkc).includes(communityKey)) {
          try {
            community = await createCommunityWithLookupFallback(
              account.pkc,
              communityLookupOptions,
              communityKey,
            );
          } catch (e) {
            errorGettingCommunity = e;
          }
        }

        // try to find community in database
        let fetchedAt: number | undefined;
        let isFromCache = false;
        if (!community) {
          const communityData: any = await communitiesDatabase.getItem(communityKey);
          const lookupName =
            "name" in communityLookupOptions ? communityLookupOptions.name : undefined;
          const lookupPublicKey =
            "publicKey" in communityLookupOptions ? communityLookupOptions.publicKey : undefined;
          const lookupAddress =
            "address" in communityLookupOptions ? communityLookupOptions.address : undefined;
          const hasCachedPosts =
            Object.keys(communityData?.posts?.pageCids || {}).length > 0 ||
            Object.keys(communityData?.posts?.pages || {}).length > 0;
          const isUnresolvedNameCache =
            communityData &&
            lookupName &&
            !lookupPublicKey &&
            !lookupAddress &&
            !communityData.publicKey &&
            !communityData.updatedAt &&
            !communityData.updateCid &&
            !communityData.title &&
            !communityData.description &&
            !hasCachedPosts;
          if (communityData && !isUnresolvedNameCache) {
            fetchedAt = communityData.fetchedAt;
            delete communityData.fetchedAt; // not part of pkc-js schema
            try {
              community = await createPkcCommunity(account.pkc, communityData);
              isFromCache = Boolean(community);
            } catch (e) {
              fetchedAt = undefined;
              // need to log this always or it could silently fail in production and cache never be used
              console.error("failed pkc.createCommunity(cachedCommunity)", {
                cachedCommunity: communityData,
                error: e,
              });
            }
          }
          if (community) {
            // add page comments to communitiesPagesStore so they can be used in useComment
            communitiesPagesStore.getState().addCommunityPageCommentsToStore(community);
          }
        }

        // community not in database, try to fetch from pkc-js
        if (!community) {
          try {
            community = await createCommunityWithLookupFallback(
              account.pkc,
              communityLookupOptions,
              communityKey,
            );
          } catch (e) {
            errorGettingCommunity = e;
          }
        }

        // failure getting community
        if (!community) {
          if (errorGettingCommunity) {
            setState((state: CommunitiesState) => {
              let communityErrors = state.errors[communityKey] || [];
              communityErrors = [...communityErrors, errorGettingCommunity];
              return { ...state, errors: { ...state.errors, [communityKey]: communityErrors } };
            });
          }

          throw (
            errorGettingCommunity ||
            Error(`communitiesStore.addCommunityToStore failed getting community '${communityKey}'`)
          );
        }

        // success getting community
        const firstCommunityState = utils.clone({
          ...community,
          ...(fetchedAt !== undefined ? { fetchedAt } : undefined),
        });
        // a cache hit already is the database entry, rewriting it would only delay the store
        // update behind an IndexedDB write of the whole record
        if (!isFromCache) {
          await communitiesDatabase.setItem(communityKey, firstCommunityState);
        }
        // another load of this community, e.g. by another account, finished first and keeps it
        // updating, so this instance is discarded before it starts updating
        if (liveCommunities[communityKey]) {
          return;
        }
        log("communitiesStore.addCommunityToStore", {
          communityAddressOrRef,
          communityKey,
          community,
          account,
        });
        setState((state: any) => ({
          communities: { ...state.communities, [communityKey]: firstCommunityState },
        }));

        const liveCommunity: LiveCommunity = {
          community,
          communityAddressOrRef,
          // pkc-js re-emits the record a community was created with when update() starts
          replayRecordId: isFromCache ? getCommunityRecordId(firstCommunityState) : undefined,
          replayRefreshesFetchedAt: true,
          openingUpdatePending: false,
          stopWhenOpeningUpdateEnds: false,
          onUpdatingStateChange: (updatingState: string) => {
            setState((state: CommunitiesState) => {
              const syncStatuses = getNextSyncStatuses(
                state,
                communityKey,
                normalizeCommunitySyncState(updatingState),
              );
              const { stoppedUntilUsed: _stoppedUntilUsed, ...syncStatus } =
                syncStatuses[communityKey];
              // the loop is not running when the store stopped the community itself
              syncStatuses[communityKey] =
                updatingState === "stopped" && !liveCommunity.updateInterval
                  ? { ...syncStatus, stoppedUntilUsed: true }
                  : syncStatus;
              return {
                syncStatuses,
                communities: {
                  ...state.communities,
                  [communityKey]: { ...state.communities[communityKey], updatingState },
                },
              };
            });
            if (
              updatingState === "succeeded" ||
              updatingState === "failed" ||
              updatingState === "waiting-retry"
            ) {
              endOpeningCommunityUpdate(communityKey, liveCommunity);
            }
          },
        };

        // the community has published new posts
        community.on("update", async (updatedCommunity: Community) => {
          clearPendingCommunityErrors(communityKey);
          setState((state: CommunitiesState) =>
            clearStoredCommunityErrorsState(state, communityKey),
          );

          const isRecordReplay =
            liveCommunity.replayRecordId !== undefined &&
            getCommunityRecordId(updatedCommunity) === liveCommunity.replayRecordId;
          liveCommunity.replayRecordId = undefined;
          if (isRecordReplay && !liveCommunity.replayRefreshesFetchedAt) {
            // a restarted loop replays the record the store already has, it was not fetched now
            return;
          }
          if (isRecordReplay) {
            // the replayed record is already in the store and the database, only refresh fetchedAt
            // like a fetched update would, without cloning and rewriting the whole record
            setState((state: CommunitiesState) => {
              const storedCommunity = state.communities[communityKey];
              if (!storedCommunity) {
                return state;
              }
              return {
                communities: {
                  ...state.communities,
                  [communityKey]: { ...storedCommunity, fetchedAt: getNowSeconds() },
                },
              };
            });
            // pass the cloned record, account state keeps references to its roles
            accountsStore
              .getState()
              .accountsActionsInternal.addCommunityRoleToAccountsCommunities(firstCommunityState);
            return;
          }

          updatedCommunity = utils.clone(updatedCommunity);

          // add fetchedAt to be able to expire the cache
          // NOTE: fetchedAt is undefined on owner communities because never stale
          updatedCommunity.fetchedAt = Math.floor(Date.now() / 1000);

          // pkc-js reports the fetch succeeded right after this event, so store the record first:
          // a succeeded sync state must not be shown with the previous record, e.g. a stale one
          // kept while the community was not updating
          setState((state: any) => ({
            ...state,
            communities: { ...state.communities, [communityKey]: updatedCommunity },
          }));
          log("communitiesStore community update", {
            communityAddressOrRef,
            communityKey,
            updatedCommunity,
            account,
          });
          await communitiesDatabase.setItem(communityKey, updatedCommunity);

          if (!getState().communities[communityKey]) {
            // deleteCommunity removed the community during the write above: don't leave the record
            // cached or give its roles back to the accounts the deletion just removed it from
            await communitiesDatabase.removeItem(communityKey);
          } else {
            // if a community has a role with an account's address add it to the account.communities
            accountsStore
              .getState()
              .accountsActionsInternal.addCommunityRoleToAccountsCommunities(updatedCommunity);

            // add page comments to communitiesPagesStore so they can be used in useComment
            communitiesPagesStore.getState().addCommunityPageCommentsToStore(updatedCommunity);
          }

          endOpeningCommunityUpdate(communityKey, liveCommunity);
        });

        community.on("updatingstatechange", liveCommunity.onUpdatingStateChange);

        community.on("error", (error: Error) => {
          scheduleCommunityError(setState, communityKey, error);
        });

        // set clients on community so the frontend can display it, dont persist in db because a reload cancels updating
        utils.clientsOnStateChange(
          community?.clients,
          (clientState: string, clientType: string, clientUrl: string, chainTicker?: string) => {
            setState((state: CommunitiesState) => {
              // make sure not undefined, sometimes happens in e2e tests
              if (!state.communities[communityKey]) {
                return state;
              }
              const clients = { ...state.communities[communityKey]?.clients };
              const client = { state: clientState };
              if (chainTicker) {
                const chainProviders = { ...clients[clientType][chainTicker], [clientUrl]: client };
                clients[clientType] = { ...clients[clientType], [chainTicker]: chainProviders };
              } else {
                clients[clientType] = { ...clients[clientType], [clientUrl]: client };
              }
              return {
                communities: {
                  ...state.communities,
                  [communityKey]: { ...state.communities[communityKey], clients },
                },
              };
            });
          },
        );

        listeners.push(community);
        liveCommunities[communityKey] = liveCommunity;
        startCommunityUpdatePolling(communityKey, liveCommunity);
        // joining a shared pkc-js instance that another consumer, e.g. a comment's update loop,
        // keeps updating emits no state change until its next fetch, so take its current state
        void liveCommunity.updateCall?.then(() => {
          const { updatingState } = liveCommunity.community;
          if (
            liveCommunities[communityKey] === liveCommunity &&
            liveCommunity.updateInterval &&
            typeof updatingState === "string" &&
            updatingState !== "stopped" &&
            getState().syncStatuses[communityKey]?.syncState === "initializing"
          ) {
            liveCommunity.onUpdatingStateChange(updatingState);
          }
        });
        // loaded without a subscriber, e.g. by a store-level caller: update until the grace period
        // ends, and at least until the first fetch ends
        if (!hasCommunityUpdateSubscribers(communityKey)) {
          scheduleCommunityUpdateStop(communityKey);
        }
      } catch (error) {
        updateCommunitySyncStatus(setState, communityKey, "failed");
        throw error;
      } finally {
        pkcGetCommunityPending[pendingKey] = false;
      }
    },

    // keep a community updating while a subscriber (a mounted hook or feed) needs it, and restart
    // its update loop if it stopped after its previous subscribers left
    async startCommunityAutoUpdate(
      communityAddressOrRef: string | CommunityIdentifier,
      subscriberId: string,
      account: Account,
    ) {
      const communityKey = getCommunityKey(communityAddressOrRef);
      assert(
        communityKey !== "" && typeof communityKey === "string",
        `communitiesStore.startCommunityAutoUpdate invalid communityAddress argument '${communityAddressOrRef}'`,
      );
      assert(
        subscriberId && typeof subscriberId === "string",
        `communitiesStore.startCommunityAutoUpdate invalid subscriberId argument '${subscriberId}'`,
      );
      if (!communityUpdateSubscribers[communityKey]) {
        communityUpdateSubscribers[communityKey] = new Set();
      }
      communityUpdateSubscribers[communityKey].add(subscriberId);
      clearCommunityStopTimer(communityKey);

      const liveCommunity = liveCommunities[communityKey];
      if (liveCommunity) {
        liveCommunity.stopWhenOpeningUpdateEnds = false;
        await resumeCommunityUpdatePolling(communityKey);
        return;
      }
      await getState().addCommunityToStore(communityAddressOrRef, account);
    },

    // the community stops updating a grace period after its last subscriber leaves
    async stopCommunityAutoUpdate(
      communityAddressOrRef: string | CommunityIdentifier,
      subscriberId: string,
    ) {
      const communityKey = getCommunityKey(communityAddressOrRef);
      const subscribers = communityUpdateSubscribers[communityKey];
      if (!subscribers?.delete(subscriberId)) {
        return;
      }
      if (subscribers.size > 0) {
        return;
      }
      delete communityUpdateSubscribers[communityKey];
      if (liveCommunities[communityKey]) {
        scheduleCommunityUpdateStop(communityKey);
      }
    },

    async refreshCommunity(communityAddressOrRef: string | CommunityIdentifier, account: Account) {
      const communityLookupOptions = getCommunityLookupOptions(communityAddressOrRef);
      const communityKey =
        typeof communityAddressOrRef === "string"
          ? communityAddressOrRef
          : getCommunityRefKey(communityAddressOrRef);
      assert(
        communityKey !== "" && typeof communityKey === "string",
        `communitiesStore.refreshCommunity invalid communityAddress argument '${communityAddressOrRef}'`,
      );
      assert(
        typeof getPkcGetCommunity(account?.pkc) === "function",
        `communitiesStore.refreshCommunity invalid account argument '${account}'`,
      );

      const refreshedCommunity = utils.clone(
        await getPkcCommunity(account.pkc, communityLookupOptions),
      );
      refreshedCommunity.fetchedAt = Math.floor(Date.now() / 1000);

      await communitiesDatabase.setItem(communityKey, refreshedCommunity);
      log("communitiesStore.refreshCommunity", {
        communityAddressOrRef,
        communityKey,
        refreshedCommunity,
        account,
      });
      setState((state: any) => ({
        communities: { ...state.communities, [communityKey]: refreshedCommunity },
      }));

      communitiesPagesStore.getState().addCommunityPageCommentsToStore(refreshedCommunity);

      return refreshedCommunity;
    },

    // user is the owner of the community and can edit it locally
    async editCommunity(communityAddress: string, communityEditOptions: any, account: Account) {
      assert(
        communityAddress !== "" && typeof communityAddress === "string",
        `communitiesStore.editCommunity invalid communityAddress argument '${communityAddress}'`,
      );
      assert(
        communityEditOptions && typeof communityEditOptions === "object",
        `communitiesStore.editCommunity invalid communityEditOptions argument '${communityEditOptions}'`,
      );
      assert(
        typeof getPkcCreateCommunity(account?.pkc) === "function",
        `communitiesStore.editCommunity invalid account argument '${account}'`,
      );

      // if not added to store first, community.update() is never called
      await getState().addCommunityToStore(communityAddress, account);

      // `communityAddress` is different from  `communityEditOptions.address` when editing the community address
      const community = await createPkcCommunity(account.pkc, {
        address: communityAddress,
      });

      // could fix some test issues
      community.on("error", console.log);

      await community.edit(communityEditOptions);

      const updatedCommunity = utils.clone(community);
      // edit db of both old and new community address to not break the UI
      await communitiesDatabase.setItem(communityAddress, updatedCommunity);
      await communitiesDatabase.setItem(community.address, updatedCommunity);
      log("communitiesStore.editCommunity", {
        communityAddress,
        communityEditOptions,
        community,
        account,
      });
      setState((state: any) => ({
        communities: {
          ...state.communities,
          // edit react state of both old and new community address to not break the UI
          [communityAddress]: updatedCommunity,
          [community.address]: updatedCommunity,
        },
      }));
    },

    // internal action called by accountsActions.createCommunity
    async createCommunity(createCommunityOptions: CreateCommunityOptions, account: Account) {
      assert(
        !createCommunityOptions || typeof createCommunityOptions === "object",
        `communitiesStore.createCommunity invalid createCommunityOptions argument '${createCommunityOptions}'`,
      );
      if (!createCommunityOptions?.signer) {
        assert(
          !createCommunityOptions?.address,
          `communitiesStore.createCommunity createCommunityOptions.address '${createCommunityOptions?.address}' must be undefined to create a community`,
        );
      }
      assert(
        typeof getPkcCreateCommunity(account?.pkc) === "function",
        `communitiesStore.createCommunity invalid account argument '${account}'`,
      );

      const community = await createPkcCommunity(account.pkc, createCommunityOptions);

      // could fix some test issues
      community.on("error", console.log);

      // if not added to store first, community.update() is never called
      await getState().addCommunityToStore(community.address, account);

      await communitiesDatabase.setItem(community.address, utils.clone(community));
      log("communitiesStore.createCommunity", { createCommunityOptions, community, account });
      setState((state: any) => ({
        communities: { ...state.communities, [community.address]: utils.clone(community) },
      }));
      return community;
    },

    // internal action called by accountsActions.deleteCommunity
    async deleteCommunity(communityAddress: string, account: Account) {
      assert(
        communityAddress && typeof communityAddress === "string",
        `communitiesStore.deleteCommunity invalid communityAddress argument '${communityAddress}'`,
      );
      assert(
        typeof getPkcCreateCommunity(account?.pkc) === "function",
        `communitiesStore.deleteCommunity invalid account argument '${account}'`,
      );

      const community = await createPkcCommunity(account.pkc, {
        address: communityAddress,
      });

      // could fix some test issues
      community.on("error", console.log);

      await community.delete();
      stopCommunityUpdatePolling(communityAddress);
      await communitiesDatabase.removeItem(communityAddress);
      log("communitiesStore.deleteCommunity", { communityAddress, community, account });
      setState((state: CommunitiesState) => {
        const syncStatuses = { ...state.syncStatuses };
        delete syncStatuses[communityAddress];
        const errors = { ...state.errors };
        delete errors[communityAddress];
        return {
          communities: { ...state.communities, [communityAddress]: undefined },
          errors,
          syncStatuses,
        };
      });
    },
  }),
);

// reset store in between tests
const originalState = communitiesStore.getState();
// async function because some stores have async init
export const resetCommunitiesStore = async () => {
  pkcGetCommunityPending = {};
  Object.keys(pendingCommunityErrorTimers).forEach(clearPendingCommunityErrors);
  // remove all event listeners
  listeners.forEach((listener: any) => listener.removeAllListeners());
  listeners.length = 0;
  Object.keys(liveCommunities).forEach(stopCommunityUpdatePolling);
  Object.keys(communityStopTimers).forEach(clearCommunityStopTimer);
  for (const communityKey in communityUpdateSubscribers) {
    delete communityUpdateSubscribers[communityKey];
  }
  // destroy all component subscriptions to the store
  communitiesStore.destroy();
  // restore original state
  communitiesStore.setState(originalState);
};

// reset database and store in between tests
export const resetCommunitiesDatabaseAndStore = async () => {
  await localForageLru.createInstance({ name: "bitsocialReactHooks-communities" }).clear();
  await resetCommunitiesStore();
};

export default communitiesStore;
