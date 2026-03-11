import assert from "assert";
import localForageLru from "../../lib/localforage-lru";
const communitiesDatabase = localForageLru.createInstance({
  name: "plebbitReactHooks-communities",
  size: 500,
});
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:communities:stores");
import { Community, Communities, Account, CreateCommunityOptions } from "../../types";
import utils from "../../lib/utils";
import createStore from "zustand";
import accountsStore from "../accounts";
import communitiesPagesStore from "../communities-pages";
import {
  createPlebbitCommunity,
  getPlebbitCommunity,
  getPlebbitCommunityAddresses,
  getPlebbitCreateCommunity,
  getPlebbitGetCommunity,
} from "../../lib/plebbit-compat";

let plebbitGetCommunityPending: { [key: string]: boolean } = {};

// reset all event listeners in between tests
const listeners: any = [];

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

    async addCommunityToStore(communityAddress: string, account: Account) {
      assert(
        communityAddress !== "" && typeof communityAddress === "string",
        `communitiesStore.addCommunityToStore invalid communityAddress argument '${communityAddress}'`,
      );
      assert(
        typeof getPlebbitCreateCommunity(account?.plebbit) === "function",
        `communitiesStore.addCommunityToStore invalid account argument '${account}'`,
      );

      // community is in store already, do nothing
      const { communities } = getState();
      let community: Community | undefined = communities[communityAddress];
      const pendingKey = communityAddress + account.id;
      if (community || plebbitGetCommunityPending[pendingKey]) {
        return;
      }

      // start trying to get community
      plebbitGetCommunityPending[pendingKey] = true;
      let errorGettingCommunity: any;
      try {
        // try to find community in owner communities
        if (getPlebbitCommunityAddresses(account.plebbit).includes(communityAddress)) {
          try {
            community = await createPlebbitCommunity(account.plebbit, {
              address: communityAddress,
            });
          } catch (e) {
            errorGettingCommunity = e;
          }
        }

        // try to find community in database
        let fetchedAt: number | undefined;
        if (!community) {
          const communityData: any = await communitiesDatabase.getItem(communityAddress);
          if (communityData) {
            fetchedAt = communityData.fetchedAt;
            delete communityData.fetchedAt; // not part of plebbit-js schema
            try {
              community = await createPlebbitCommunity(account.plebbit, communityData);
            } catch (e) {
              fetchedAt = undefined;
              // need to log this always or it could silently fail in production and cache never be used
              console.error("failed plebbit.createCommunity(cachedCommunity)", {
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

        // community not in database, try to fetch from plebbit-js
        if (!community) {
          try {
            community = await createPlebbitCommunity(account.plebbit, {
              address: communityAddress,
            });
          } catch (e) {
            errorGettingCommunity = e;
          }
        }

        // failure getting community
        if (!community) {
          if (errorGettingCommunity) {
            setState((state: CommunitiesState) => {
              let communityErrors = state.errors[communityAddress] || [];
              communityErrors = [...communityErrors, errorGettingCommunity];
              return { ...state, errors: { ...state.errors, [communityAddress]: communityErrors } };
            });
          }

          throw (
            errorGettingCommunity ||
            Error(
              `communitiesStore.addCommunityToStore failed getting community '${communityAddress}'`,
            )
          );
        }

        // success getting community
        const firstCommunityState = utils.clone({ ...community, fetchedAt });
        await communitiesDatabase.setItem(communityAddress, firstCommunityState);
        log("communitiesStore.addCommunityToStore", { communityAddress, community, account });
        setState((state: any) => ({
          communities: { ...state.communities, [communityAddress]: firstCommunityState },
        }));

        // the community has published new posts
        community.on("update", async (updatedCommunity: Community) => {
          updatedCommunity = utils.clone(updatedCommunity);

          // add fetchedAt to be able to expire the cache
          // NOTE: fetchedAt is undefined on owner communities because never stale
          updatedCommunity.fetchedAt = Math.floor(Date.now() / 1000);

          await communitiesDatabase.setItem(communityAddress, updatedCommunity);
          log("communitiesStore community update", {
            communityAddress,
            updatedCommunity,
            account,
          });
          setState((state: any) => ({
            communities: { ...state.communities, [communityAddress]: updatedCommunity },
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
              [communityAddress]: { ...state.communities[communityAddress], updatingState },
            },
          }));
        });

        community.on("error", (error: Error) => {
          setState((state: CommunitiesState) => {
            let communityErrors = state.errors[communityAddress] || [];
            communityErrors = [...communityErrors, error];
            return { ...state, errors: { ...state.errors, [communityAddress]: communityErrors } };
          });
        });

        // set clients on community so the frontend can display it, dont persist in db because a reload cancels updating
        utils.clientsOnStateChange(
          community?.clients,
          (clientState: string, clientType: string, clientUrl: string, chainTicker?: string) => {
            setState((state: CommunitiesState) => {
              // make sure not undefined, sometimes happens in e2e tests
              if (!state.communities[communityAddress]) {
                return {};
              }
              const clients = { ...state.communities[communityAddress]?.clients };
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
                  [communityAddress]: { ...state.communities[communityAddress], clients },
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
        plebbitGetCommunityPending[pendingKey] = false;
      }
    },

    async refreshCommunity(communityAddress: string, account: Account) {
      assert(
        communityAddress !== "" && typeof communityAddress === "string",
        `communitiesStore.refreshCommunity invalid communityAddress argument '${communityAddress}'`,
      );
      assert(
        typeof getPlebbitGetCommunity(account?.plebbit) === "function",
        `communitiesStore.refreshCommunity invalid account argument '${account}'`,
      );

      const refreshedCommunity = utils.clone(
        await getPlebbitCommunity(account.plebbit, { address: communityAddress }),
      );
      refreshedCommunity.fetchedAt = Math.floor(Date.now() / 1000);

      await communitiesDatabase.setItem(communityAddress, refreshedCommunity);
      log("communitiesStore.refreshCommunity", {
        communityAddress,
        refreshedCommunity,
        account,
      });
      setState((state: any) => ({
        communities: { ...state.communities, [communityAddress]: refreshedCommunity },
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
        typeof account?.plebbit?.createCommunity === "function",
        `communitiesStore.editCommunity invalid account argument '${account}'`,
      );

      // if not added to store first, community.update() is never called
      await getState().addCommunityToStore(communityAddress, account);

      // `communityAddress` is different from  `communityEditOptions.address` when editing the community address
      const community = await createPlebbitCommunity(account.plebbit, {
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
        typeof account?.plebbit?.createCommunity === "function",
        `communitiesStore.createCommunity invalid account argument '${account}'`,
      );

      const community = await createPlebbitCommunity(account.plebbit, createCommunityOptions);

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
        typeof account?.plebbit?.createCommunity === "function",
        `communitiesStore.deleteCommunity invalid account argument '${account}'`,
      );

      const community = await createPlebbitCommunity(account.plebbit, {
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
  plebbitGetCommunityPending = {};
  // remove all event listeners
  listeners.forEach((listener: any) => listener.removeAllListeners());
  // destroy all component subscriptions to the store
  communitiesStore.destroy();
  // restore original state
  communitiesStore.setState(originalState);
};

// reset database and store in between tests
export const resetCommunitiesDatabaseAndStore = async () => {
  await localForageLru.createInstance({ name: "plebbitReactHooks-communities" }).clear();
  await resetCommunitiesStore();
};

export default communitiesStore;
