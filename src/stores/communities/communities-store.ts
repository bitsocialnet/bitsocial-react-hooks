import assert from "assert";
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

let pkcGetCommunityPending: { [key: string]: boolean } = {};

const COMMUNITY_ERROR_UPDATE_GRACE_MS = 1000;
const pendingCommunityErrorTimers: {
  [communityKey: string]: ReturnType<typeof setTimeout>[];
} = {};

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

// reset all event listeners in between tests
const listeners: any = [];

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

const scheduleCommunityError = (setState: Function, communityKey: string, error: Error) => {
  const timeout = setTimeout(() => {
    pendingCommunityErrorTimers[communityKey] = (
      pendingCommunityErrorTimers[communityKey] || []
    ).filter((pendingTimeout) => pendingTimeout !== timeout);
    if ((pendingCommunityErrorTimers[communityKey] || []).length === 0) {
      delete pendingCommunityErrorTimers[communityKey];
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
  addCommunityToStore: Function;
  refreshCommunity: Function;
  editCommunity: Function;
  createCommunity: Function;
  deleteCommunity: Function;
};

const communitiesStore = createStore<CommunitiesState>(
  (setState: Function, getState: Function) => ({
    communities: {},
    errors: {},

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
        if (!community) {
          const communityData: any = await communitiesDatabase.getItem(communityKey);
          if (communityData) {
            fetchedAt = communityData.fetchedAt;
            delete communityData.fetchedAt; // not part of pkc-js schema
            try {
              community = await createPkcCommunity(account.pkc, communityData);
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
        const firstCommunityState = utils.clone({ ...community, fetchedAt });
        await communitiesDatabase.setItem(communityKey, firstCommunityState);
        log("communitiesStore.addCommunityToStore", {
          communityAddressOrRef,
          communityKey,
          community,
          account,
        });
        setState((state: any) => ({
          communities: { ...state.communities, [communityKey]: firstCommunityState },
        }));

        // the community has published new posts
        community.on("update", async (updatedCommunity: Community) => {
          clearPendingCommunityErrors(communityKey);
          setState((state: CommunitiesState) => ({
            ...state,
            errors: clearStoredCommunityErrors(state, communityKey),
          }));
          updatedCommunity = utils.clone(updatedCommunity);

          // add fetchedAt to be able to expire the cache
          // NOTE: fetchedAt is undefined on owner communities because never stale
          updatedCommunity.fetchedAt = Math.floor(Date.now() / 1000);

          await communitiesDatabase.setItem(communityKey, updatedCommunity);
          log("communitiesStore community update", {
            communityAddressOrRef,
            communityKey,
            updatedCommunity,
            account,
          });
          setState((state: any) => ({
            ...state,
            communities: { ...state.communities, [communityKey]: updatedCommunity },
          }));

          // if a community has a role with an account's address add it to the account.communities
          accountsStore
            .getState()
            .accountsActionsInternal.addCommunityRoleToAccountsCommunities(updatedCommunity);

          // add page comments to communitiesPagesStore so they can be used in useComment
          communitiesPagesStore.getState().addCommunityPageCommentsToStore(updatedCommunity);
        });

        community.on("updatingstatechange", (updatingState: string) => {
          setState((state: CommunitiesState) => ({
            communities: {
              ...state.communities,
              [communityKey]: { ...state.communities[communityKey], updatingState },
            },
          }));
        });

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
                return {};
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
        community
          .update()
          .catch((error: unknown) => log.trace("community.update error", { community, error }));
      } finally {
        pkcGetCommunityPending[pendingKey] = false;
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
      await communitiesDatabase.removeItem(communityAddress);
      log("communitiesStore.deleteCommunity", { communityAddress, community, account });
      setState((state: any) => ({
        communities: { ...state.communities, [communityAddress]: undefined },
      }));
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
