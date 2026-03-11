import { useMemo } from "react";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:states:hooks");
import assert from "assert";
import {
  UseClientsStatesOptions,
  UseClientsStatesResult,
  UseCommunitiesStatesOptions,
  UseCommunitiesStatesResult,
} from "../types";
import { useCommunities } from "./communities";
import { communityPostsCacheExpired } from "../lib/utils";

// TODO: implement getting peers
const peers = {};

/**
 * @param comment - The comment to get the states from
 * @param community - The community to get the states from
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useClientsStates(options?: UseClientsStatesOptions): UseClientsStatesResult {
  assert(
    options == null || typeof options === "object",
    `useClientsStates options argument '${options}' not an object`,
  );
  const { comment, community } = options ?? {};
  assert(
    comment == null || typeof comment === "object",
    `useClientsStates options.comment argument '${comment}' not an object`,
  );
  assert(
    community == null || typeof community === "object",
    `useClientsStates options.community argument '${community}' not an object`,
  );
  assert(
    !(comment && community),
    `useClientsStates options.comment and options.community arguments cannot be defined at the same time`,
  );
  const commentOrCommunity = comment || community;

  const states = useMemo(() => {
    const states: { [state: string]: string[] } = {};

    // if comment is newer than 5 minutes, don't show updating state so user knows it finished
    if (commentOrCommunity?.cid && commentOrCommunity.timestamp + 5 * 60 > Date.now() / 1000) {
      return states;
    }

    if (!commentOrCommunity?.clients) {
      return states;
    }
    const clients = commentOrCommunity?.clients;

    const addState = (state: string | undefined, clientUrl: string) => {
      if (!state || state === "stopped") {
        return;
      }
      if (!states[state]) {
        states[state] = [];
      }
      states[state].push(clientUrl);
    };

    // dont show state if the data is already fetched
    if (!commentOrCommunity?.updatedAt || communityPostsCacheExpired(commentOrCommunity)) {
      for (const clientUrl in clients?.ipfsGateways) {
        addState(clients.ipfsGateways[clientUrl]?.state, clientUrl);
      }
      for (const clientUrl in clients?.kuboRpcClients) {
        addState(clients.kuboRpcClients[clientUrl]?.state, clientUrl);
      }
      for (const clientUrl in clients?.pubsubKuboRpcClients) {
        addState(clients.pubsubKuboRpcClients[clientUrl]?.state, clientUrl);
      }
      for (const clientUrl in clients?.plebbitRpcClients) {
        addState(clients.plebbitRpcClients[clientUrl]?.state, clientUrl);
      }
      for (const clientUrl in clients?.libp2pJsClients) {
        addState(clients.libp2pJsClients[clientUrl]?.state, clientUrl);
      }
      for (const chainTicker in clients?.chainProviders) {
        for (const clientUrl in clients.chainProviders[chainTicker]) {
          addState(clients.chainProviders[chainTicker][clientUrl]?.state, clientUrl);
        }
      }
    }

    // find community pages and comment replies pages states
    const pages = commentOrCommunity?.posts || commentOrCommunity?.replies;
    if (pages) {
      for (const clientType in pages.clients) {
        for (const sortType in pages.clients[clientType]) {
          for (const clientUrl in pages.clients[clientType][sortType]) {
            let state = pages.clients[clientType][sortType][clientUrl].state;
            if (state === "stopped") {
              continue;
            }
            state += `-page-${sortType}`;
            if (!states[state]) {
              states[state] = [];
            }
            states[state].push(clientUrl);
          }
        }
      }
    }

    log("useClientsStates", {
      communityAddress: commentOrCommunity?.address,
      commentCid: commentOrCommunity?.cid,
      states,
      commentOrCommunity,
    });

    return states;
  }, [commentOrCommunity]);

  return useMemo(
    () => ({
      states,
      peers,
      state: "initializing",
      error: undefined,
      errors: [],
    }),
    [states, peers],
  );
}

/**
 * @param communityAddresses - The community addresses to get the states from
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useCommunitiesStates(
  options?: UseCommunitiesStatesOptions,
): UseCommunitiesStatesResult {
  assert(
    options == null || typeof options === "object",
    `useCommunitiesStates options argument '${options}' not an object`,
  );
  const { communityAddresses } = options ?? {};
  assert(
    communityAddresses == null || Array.isArray(communityAddresses),
    `useCommunitiesStates communityAddresses '${communityAddresses}' not an array`,
  );
  for (const communityAddress of communityAddresses ?? []) {
    assert(
      typeof communityAddress === "string",
      `useCommunitiesStates communityAddresses '${communityAddresses}' communityAddress '${communityAddress}' not a string`,
    );
  }
  const { communities } = useCommunities({ communityAddresses });

  const states = useMemo(() => {
    const states: {
      [state: string]: { communityAddresses: Set<string>; clientUrls: Set<string> };
    } = {};
    for (const community of communities) {
      if (!community?.updatingState) {
        continue;
      }

      // dont show community state if data is already fetched
      if (
        (!community.updatedAt || communityPostsCacheExpired(community)) &&
        community?.updatingState !== "stopped" &&
        community?.updatingState !== "succeeded"
      ) {
        if (!states[community.updatingState]) {
          states[community.updatingState] = {
            communityAddresses: new Set(),
            clientUrls: new Set(),
          };
        }
        states[community.updatingState].communityAddresses.add(community.address);

        // find client urls
        for (const clientType in community.clients) {
          if (clientType === "chainProviders") {
            for (const chainTicker in community.clients.chainProviders) {
              for (const clientUrl in community.clients.chainProviders[chainTicker]) {
                const state = community.clients.chainProviders[chainTicker][clientUrl].state;
                // TODO: client states should always be the same as community.updatingState
                // but possibly because of a plebbit-js bug they are sometimes not
                if (state !== "stopped" && state === community.updatingState) {
                  states[community.updatingState].clientUrls.add(clientUrl);
                }
              }
            }
          } else {
            for (const clientUrl in community.clients[clientType]) {
              const state = community.clients[clientType][clientUrl].state;
              // TODO: client states should always be the same as community.updatingState
              // but possibly because of a plebbit-js bug they are sometimes not
              if (state !== "stopped" && state === community.updatingState) {
                states[community.updatingState].clientUrls.add(clientUrl);
              }
            }
          }
        }
      }

      // find community pages states and client urls
      const pagesClientsUrls: { [state: string]: string[] } = {};
      for (const clientType in community?.posts?.clients) {
        for (const sortType in community.posts.clients[clientType]) {
          for (const clientUrl in community.posts.clients[clientType][sortType]) {
            let state = community.posts.clients[clientType][sortType][clientUrl].state;
            if (state !== "stopped") {
              state += `-page-${sortType}`;
              if (!pagesClientsUrls[state]) {
                pagesClientsUrls[state] = [];
              }
              pagesClientsUrls[state].push(clientUrl);
            }
          }
        }
      }
      // add communityAddresses and clientUrls
      for (const pagesState in pagesClientsUrls) {
        if (!states[pagesState]) {
          states[pagesState] = { communityAddresses: new Set(), clientUrls: new Set() };
        }
        states[pagesState].communityAddresses.add(community.address);
        pagesClientsUrls[pagesState].forEach((clientUrl: string) =>
          states[pagesState].clientUrls.add(clientUrl),
        );
      }
    }

    // convert sets to arrays
    const _states: { [state: string]: { communityAddresses: string[]; clientUrls: string[] } } = {};
    for (const state in states) {
      _states[state] = {
        communityAddresses: [...states[state].communityAddresses],
        clientUrls: [...states[state].clientUrls],
      };
    }

    log("useCommunitiesStates", {
      communityAddresses,
      states: _states,
      communities,
    });

    return _states;
  }, [communities]);

  return useMemo(
    () => ({
      states,
      peers,
      state: "initializing",
      error: undefined,
      errors: [],
    }),
    [states, peers],
  );
}
