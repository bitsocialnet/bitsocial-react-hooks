import { useMemo } from "react";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:states:hooks");
import assert from "assert";
import validator from "../lib/validator.js";
import { getPageRpcClients } from "../lib/pkc-compat.js";
import { useCommunities } from "./communities.js";
import { communityPostsCacheExpired } from "../lib/utils/index.js";
// TODO: implement getting peers
const peers = {};
/**
 * @param comment - The comment to get the states from
 * @param community - The community to get the states from
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useClientsStates(options) {
    assert(options == null || typeof options === "object", `useClientsStates options argument '${options}' not an object`);
    const { comment, community } = options !== null && options !== void 0 ? options : {};
    assert(comment == null || typeof comment === "object", `useClientsStates options.comment argument '${comment}' not an object`);
    assert(community == null || typeof community === "object", `useClientsStates options.community argument '${community}' not an object`);
    assert(!(comment && community), `useClientsStates options.comment and options.community arguments cannot be defined at the same time`);
    const commentOrCommunity = comment || community;
    const states = useMemo(() => {
        var _a, _b, _c, _d, _e, _f, _g;
        const states = {};
        // if comment is newer than 5 minutes, don't show updating state so user knows it finished
        if ((commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.cid) && commentOrCommunity.timestamp + 5 * 60 > Date.now() / 1000) {
            return states;
        }
        if (!(commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.clients)) {
            return states;
        }
        const clients = commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.clients;
        const addState = (state, clientUrl) => {
            if (!state || state === "stopped") {
                return;
            }
            if (!states[state]) {
                states[state] = [];
            }
            states[state].push(clientUrl);
        };
        // dont show state if the data is already fetched
        if (!(commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.updatedAt) || communityPostsCacheExpired(commentOrCommunity)) {
            for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.ipfsGateways) {
                addState((_a = clients.ipfsGateways[clientUrl]) === null || _a === void 0 ? void 0 : _a.state, clientUrl);
            }
            for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.kuboRpcClients) {
                addState((_b = clients.kuboRpcClients[clientUrl]) === null || _b === void 0 ? void 0 : _b.state, clientUrl);
            }
            for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.pubsubKuboRpcClients) {
                addState((_c = clients.pubsubKuboRpcClients[clientUrl]) === null || _c === void 0 ? void 0 : _c.state, clientUrl);
            }
            const rpcClients = getPageRpcClients(clients);
            for (const clientUrl in rpcClients) {
                addState((_d = rpcClients[clientUrl]) === null || _d === void 0 ? void 0 : _d.state, clientUrl);
            }
            for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.libp2pJsClients) {
                addState((_e = clients.libp2pJsClients[clientUrl]) === null || _e === void 0 ? void 0 : _e.state, clientUrl);
            }
            for (const chainTicker in clients === null || clients === void 0 ? void 0 : clients.chainProviders) {
                for (const clientUrl in clients.chainProviders[chainTicker]) {
                    addState((_f = clients.chainProviders[chainTicker][clientUrl]) === null || _f === void 0 ? void 0 : _f.state, clientUrl);
                }
            }
            for (const resolverKey in clients === null || clients === void 0 ? void 0 : clients.nameResolvers) {
                addState((_g = clients.nameResolvers[resolverKey]) === null || _g === void 0 ? void 0 : _g.state, resolverKey);
            }
        }
        // find community pages and comment replies pages states
        const pages = (commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.posts) || (commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.replies);
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
            communityAddress: commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.address,
            commentCid: commentOrCommunity === null || commentOrCommunity === void 0 ? void 0 : commentOrCommunity.cid,
            states,
            commentOrCommunity,
        });
        return states;
    }, [commentOrCommunity]);
    return useMemo(() => ({
        states,
        peers,
        state: "initializing",
        error: undefined,
        errors: [],
    }), [states, peers]);
}
/**
 * @param communities - The communities to get the states from
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useCommunitiesStates(options) {
    assert(options == null || typeof options === "object", `useCommunitiesStates options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    const { communities: communitiesInput } = opts;
    validator.validateUseCommunitiesStatesArguments({
        communities: communitiesInput,
        communityRefs: opts.communityRefs,
        communityAddresses: opts.communityAddresses,
    });
    const { communities } = useCommunities({ communities: communitiesInput });
    const states = useMemo(() => {
        var _a;
        const states = {};
        for (const community of communities) {
            if (!(community === null || community === void 0 ? void 0 : community.updatingState)) {
                continue;
            }
            // dont show community state if data is already fetched
            if ((!community.updatedAt || communityPostsCacheExpired(community)) &&
                (community === null || community === void 0 ? void 0 : community.updatingState) !== "stopped" &&
                (community === null || community === void 0 ? void 0 : community.updatingState) !== "succeeded") {
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
                                // but possibly because of a pkc-js bug they are sometimes not
                                if (state !== "stopped" && state === community.updatingState) {
                                    states[community.updatingState].clientUrls.add(clientUrl);
                                }
                            }
                        }
                    }
                    else {
                        for (const clientUrl in community.clients[clientType]) {
                            const state = community.clients[clientType][clientUrl].state;
                            // TODO: client states should always be the same as community.updatingState
                            // but possibly because of a pkc-js bug they are sometimes not
                            if (state !== "stopped" && state === community.updatingState) {
                                states[community.updatingState].clientUrls.add(clientUrl);
                            }
                        }
                    }
                }
            }
            // find community pages states and client urls
            const pagesClientsUrls = {};
            for (const clientType in (_a = community === null || community === void 0 ? void 0 : community.posts) === null || _a === void 0 ? void 0 : _a.clients) {
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
                pagesClientsUrls[pagesState].forEach((clientUrl) => states[pagesState].clientUrls.add(clientUrl));
            }
        }
        // convert sets to arrays
        const _states = {};
        for (const state in states) {
            _states[state] = {
                communityAddresses: [...states[state].communityAddresses],
                clientUrls: [...states[state].clientUrls],
            };
        }
        log("useCommunitiesStates", {
            requestedCommunities: communitiesInput,
            states: _states,
            communities,
        });
        return _states;
    }, [communities]);
    return useMemo(() => ({
        states,
        peers,
        state: "initializing",
        error: undefined,
        errors: [],
    }), [states, peers]);
}
//# sourceMappingURL=states.js.map