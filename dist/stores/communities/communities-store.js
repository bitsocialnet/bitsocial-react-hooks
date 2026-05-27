var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import assert from "assert";
import localForageLru from "../../lib/localforage-lru/index.js";
const communitiesDatabase = localForageLru.createInstance({
    name: "bitsocialReactHooks-communities",
    size: 500,
});
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:communities:stores");
import utils from "../../lib/utils/index.js";
import createStore from "zustand";
import accountsStore from "../accounts/index.js";
import communitiesPagesStore from "../communities-pages/index.js";
import { getCommunityLookupOptions, getCommunityRefKey } from "../../lib/community-ref.js";
import { createPkcCommunity, getPkcCommunity, getPkcCommunityAddresses, getPkcCreateCommunity, getPkcGetCommunity, } from "../../lib/pkc-compat.js";
export const COMMUNITY_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
let pkcGetCommunityPending = {};
// Key pollers by community so delete/reset can stop the matching live instance.
const communityUpdatePollers = {};
// reset all event listeners in between tests
const listeners = [];
const COMMUNITY_ERROR_UPDATE_GRACE_MS = 1000;
const pendingCommunityErrorTimers = {};
const createCommunityWithLookupFallback = (pkc, communityLookupOptions, communityKey) => __awaiter(void 0, void 0, void 0, function* () {
    const supportsAddressLookup = "address" in communityLookupOptions;
    const community = yield createPkcCommunity(pkc, communityLookupOptions);
    if ((community === null || community === void 0 ? void 0 : community.address) || supportsAddressLookup) {
        return community;
    }
    throw Error(`communitiesStore.addCommunityToStore failed getting community '${communityKey}'`);
});
const updateCommunity = (community, { communityAddressOrRef, communityKey, }) => {
    community.update().catch((error) => log.trace("community.update error", {
        communityAddressOrRef,
        communityKey,
        community,
        error,
    }));
};
const startCommunityUpdatePolling = (community, { communityAddressOrRef, communityKey, }) => {
    stopCommunityUpdatePolling(communityKey);
    updateCommunity(community, { communityAddressOrRef, communityKey });
    communityUpdatePollers[communityKey] = {
        community,
        updateInterval: setInterval(() => updateCommunity(community, { communityAddressOrRef, communityKey }), COMMUNITY_UPDATE_INTERVAL_MS),
    };
};
const stopCommunityUpdatePolling = (communityKey) => {
    const polling = communityUpdatePollers[communityKey];
    if (!polling) {
        return;
    }
    clearPendingCommunityErrors(communityKey);
    clearInterval(polling.updateInterval);
    polling.community.removeAllListeners();
    const listenerIndex = listeners.indexOf(polling.community);
    if (listenerIndex >= 0) {
        listeners.splice(listenerIndex, 1);
    }
    delete communityUpdatePollers[communityKey];
};
const clearPendingCommunityErrors = (communityKey) => {
    var _a;
    (_a = pendingCommunityErrorTimers[communityKey]) === null || _a === void 0 ? void 0 : _a.forEach((timeout) => clearTimeout(timeout));
    delete pendingCommunityErrorTimers[communityKey];
};
const clearStoredCommunityErrors = (state, communityKey) => {
    if (!state.errors[communityKey]) {
        return state.errors;
    }
    const nextErrors = Object.assign({}, state.errors);
    delete nextErrors[communityKey];
    return nextErrors;
};
const isRetriableCommunityLoadError = (error) => {
    const details = error.details;
    return Boolean(details &&
        typeof details === "object" &&
        "retriableError" in details &&
        details.retriableError === true);
};
const scheduleCommunityError = (setState, communityKey, error) => {
    if (isRetriableCommunityLoadError(error)) {
        return;
    }
    const timeout = setTimeout(() => {
        const pendingTimeouts = pendingCommunityErrorTimers[communityKey];
        if (!(pendingTimeouts === null || pendingTimeouts === void 0 ? void 0 : pendingTimeouts.includes(timeout))) {
            return;
        }
        const remainingTimeouts = pendingTimeouts.filter((pendingTimeout) => pendingTimeout !== timeout);
        if (remainingTimeouts.length === 0) {
            delete pendingCommunityErrorTimers[communityKey];
        }
        else {
            pendingCommunityErrorTimers[communityKey] = remainingTimeouts;
        }
        setState((state) => {
            const communityErrors = state.errors[communityKey] || [];
            return Object.assign(Object.assign({}, state), { errors: Object.assign(Object.assign({}, state.errors), { [communityKey]: [...communityErrors, error] }) });
        });
    }, COMMUNITY_ERROR_UPDATE_GRACE_MS);
    pendingCommunityErrorTimers[communityKey] = [
        ...(pendingCommunityErrorTimers[communityKey] || []),
        timeout,
    ];
};
const communitiesStore = createStore((setState, getState) => ({
    communities: {},
    errors: {},
    addCommunityToStore(communityAddressOrRef, account) {
        return __awaiter(this, void 0, void 0, function* () {
            const communityLookupOptions = getCommunityLookupOptions(communityAddressOrRef);
            const communityKey = typeof communityAddressOrRef === "string"
                ? communityAddressOrRef
                : getCommunityRefKey(communityAddressOrRef);
            assert(communityKey !== "" && typeof communityKey === "string", `communitiesStore.addCommunityToStore invalid communityAddress argument '${communityAddressOrRef}'`);
            assert(typeof getPkcCreateCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `communitiesStore.addCommunityToStore invalid account argument '${account}'`);
            // community is in store already, do nothing
            const { communities } = getState();
            let community = communities[communityKey];
            const pendingKey = communityKey + account.id;
            if (community || pkcGetCommunityPending[pendingKey]) {
                return;
            }
            // start trying to get community
            pkcGetCommunityPending[pendingKey] = true;
            let errorGettingCommunity;
            try {
                // try to find community in owner communities
                if (getPkcCommunityAddresses(account.pkc).includes(communityKey)) {
                    try {
                        community = yield createCommunityWithLookupFallback(account.pkc, communityLookupOptions, communityKey);
                    }
                    catch (e) {
                        errorGettingCommunity = e;
                    }
                }
                // try to find community in database
                let fetchedAt;
                if (!community) {
                    const communityData = yield communitiesDatabase.getItem(communityKey);
                    if (communityData) {
                        fetchedAt = communityData.fetchedAt;
                        delete communityData.fetchedAt; // not part of pkc-js schema
                        try {
                            community = yield createPkcCommunity(account.pkc, communityData);
                        }
                        catch (e) {
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
                        community = yield createCommunityWithLookupFallback(account.pkc, communityLookupOptions, communityKey);
                    }
                    catch (e) {
                        errorGettingCommunity = e;
                    }
                }
                // failure getting community
                if (!community) {
                    if (errorGettingCommunity) {
                        setState((state) => {
                            let communityErrors = state.errors[communityKey] || [];
                            communityErrors = [...communityErrors, errorGettingCommunity];
                            return Object.assign(Object.assign({}, state), { errors: Object.assign(Object.assign({}, state.errors), { [communityKey]: communityErrors }) });
                        });
                    }
                    throw (errorGettingCommunity ||
                        Error(`communitiesStore.addCommunityToStore failed getting community '${communityKey}'`));
                }
                // success getting community
                const firstCommunityState = utils.clone(Object.assign(Object.assign({}, community), { fetchedAt }));
                yield communitiesDatabase.setItem(communityKey, firstCommunityState);
                log("communitiesStore.addCommunityToStore", {
                    communityAddressOrRef,
                    communityKey,
                    community,
                    account,
                });
                setState((state) => ({
                    communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: firstCommunityState }),
                }));
                // the community has published new posts
                community.on("update", (updatedCommunity) => __awaiter(this, void 0, void 0, function* () {
                    clearPendingCommunityErrors(communityKey);
                    setState((state) => (Object.assign(Object.assign({}, state), { errors: clearStoredCommunityErrors(state, communityKey) })));
                    updatedCommunity = utils.clone(updatedCommunity);
                    // add fetchedAt to be able to expire the cache
                    // NOTE: fetchedAt is undefined on owner communities because never stale
                    updatedCommunity.fetchedAt = Math.floor(Date.now() / 1000);
                    yield communitiesDatabase.setItem(communityKey, updatedCommunity);
                    log("communitiesStore community update", {
                        communityAddressOrRef,
                        communityKey,
                        updatedCommunity,
                        account,
                    });
                    setState((state) => (Object.assign(Object.assign({}, state), { communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: updatedCommunity }) })));
                    // if a community has a role with an account's address add it to the account.communities
                    accountsStore
                        .getState()
                        .accountsActionsInternal.addCommunityRoleToAccountsCommunities(updatedCommunity);
                    // add page comments to communitiesPagesStore so they can be used in useComment
                    communitiesPagesStore.getState().addCommunityPageCommentsToStore(updatedCommunity);
                }));
                community.on("updatingstatechange", (updatingState) => {
                    setState((state) => ({
                        communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: Object.assign(Object.assign({}, state.communities[communityKey]), { updatingState }) }),
                    }));
                });
                community.on("error", (error) => {
                    scheduleCommunityError(setState, communityKey, error);
                });
                // set clients on community so the frontend can display it, dont persist in db because a reload cancels updating
                utils.clientsOnStateChange(community === null || community === void 0 ? void 0 : community.clients, (clientState, clientType, clientUrl, chainTicker) => {
                    setState((state) => {
                        var _a;
                        // make sure not undefined, sometimes happens in e2e tests
                        if (!state.communities[communityKey]) {
                            return {};
                        }
                        const clients = Object.assign({}, (_a = state.communities[communityKey]) === null || _a === void 0 ? void 0 : _a.clients);
                        const client = { state: clientState };
                        if (chainTicker) {
                            const chainProviders = Object.assign(Object.assign({}, clients[clientType][chainTicker]), { [clientUrl]: client });
                            clients[clientType] = Object.assign(Object.assign({}, clients[clientType]), { [chainTicker]: chainProviders });
                        }
                        else {
                            clients[clientType] = Object.assign(Object.assign({}, clients[clientType]), { [clientUrl]: client });
                        }
                        return {
                            communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: Object.assign(Object.assign({}, state.communities[communityKey]), { clients }) }),
                        };
                    });
                });
                listeners.push(community);
                startCommunityUpdatePolling(community, { communityAddressOrRef, communityKey });
            }
            finally {
                pkcGetCommunityPending[pendingKey] = false;
            }
        });
    },
    refreshCommunity(communityAddressOrRef, account) {
        return __awaiter(this, void 0, void 0, function* () {
            const communityLookupOptions = getCommunityLookupOptions(communityAddressOrRef);
            const communityKey = typeof communityAddressOrRef === "string"
                ? communityAddressOrRef
                : getCommunityRefKey(communityAddressOrRef);
            assert(communityKey !== "" && typeof communityKey === "string", `communitiesStore.refreshCommunity invalid communityAddress argument '${communityAddressOrRef}'`);
            assert(typeof getPkcGetCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `communitiesStore.refreshCommunity invalid account argument '${account}'`);
            const refreshedCommunity = utils.clone(yield getPkcCommunity(account.pkc, communityLookupOptions));
            refreshedCommunity.fetchedAt = Math.floor(Date.now() / 1000);
            yield communitiesDatabase.setItem(communityKey, refreshedCommunity);
            log("communitiesStore.refreshCommunity", {
                communityAddressOrRef,
                communityKey,
                refreshedCommunity,
                account,
            });
            setState((state) => ({
                communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: refreshedCommunity }),
            }));
            communitiesPagesStore.getState().addCommunityPageCommentsToStore(refreshedCommunity);
            return refreshedCommunity;
        });
    },
    // user is the owner of the community and can edit it locally
    editCommunity(communityAddress, communityEditOptions, account) {
        return __awaiter(this, void 0, void 0, function* () {
            assert(communityAddress !== "" && typeof communityAddress === "string", `communitiesStore.editCommunity invalid communityAddress argument '${communityAddress}'`);
            assert(communityEditOptions && typeof communityEditOptions === "object", `communitiesStore.editCommunity invalid communityEditOptions argument '${communityEditOptions}'`);
            assert(typeof getPkcCreateCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `communitiesStore.editCommunity invalid account argument '${account}'`);
            // if not added to store first, community.update() is never called
            yield getState().addCommunityToStore(communityAddress, account);
            // `communityAddress` is different from  `communityEditOptions.address` when editing the community address
            const community = yield createPkcCommunity(account.pkc, {
                address: communityAddress,
            });
            // could fix some test issues
            community.on("error", console.log);
            yield community.edit(communityEditOptions);
            const updatedCommunity = utils.clone(community);
            // edit db of both old and new community address to not break the UI
            yield communitiesDatabase.setItem(communityAddress, updatedCommunity);
            yield communitiesDatabase.setItem(community.address, updatedCommunity);
            log("communitiesStore.editCommunity", {
                communityAddress,
                communityEditOptions,
                community,
                account,
            });
            setState((state) => ({
                communities: Object.assign(Object.assign({}, state.communities), { 
                    // edit react state of both old and new community address to not break the UI
                    [communityAddress]: updatedCommunity, [community.address]: updatedCommunity }),
            }));
        });
    },
    // internal action called by accountsActions.createCommunity
    createCommunity(createCommunityOptions, account) {
        return __awaiter(this, void 0, void 0, function* () {
            assert(!createCommunityOptions || typeof createCommunityOptions === "object", `communitiesStore.createCommunity invalid createCommunityOptions argument '${createCommunityOptions}'`);
            if (!(createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.signer)) {
                assert(!(createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.address), `communitiesStore.createCommunity createCommunityOptions.address '${createCommunityOptions === null || createCommunityOptions === void 0 ? void 0 : createCommunityOptions.address}' must be undefined to create a community`);
            }
            assert(typeof getPkcCreateCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `communitiesStore.createCommunity invalid account argument '${account}'`);
            const community = yield createPkcCommunity(account.pkc, createCommunityOptions);
            // could fix some test issues
            community.on("error", console.log);
            // if not added to store first, community.update() is never called
            yield getState().addCommunityToStore(community.address, account);
            yield communitiesDatabase.setItem(community.address, utils.clone(community));
            log("communitiesStore.createCommunity", { createCommunityOptions, community, account });
            setState((state) => ({
                communities: Object.assign(Object.assign({}, state.communities), { [community.address]: utils.clone(community) }),
            }));
            return community;
        });
    },
    // internal action called by accountsActions.deleteCommunity
    deleteCommunity(communityAddress, account) {
        return __awaiter(this, void 0, void 0, function* () {
            assert(communityAddress && typeof communityAddress === "string", `communitiesStore.deleteCommunity invalid communityAddress argument '${communityAddress}'`);
            assert(typeof getPkcCreateCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `communitiesStore.deleteCommunity invalid account argument '${account}'`);
            const community = yield createPkcCommunity(account.pkc, {
                address: communityAddress,
            });
            // could fix some test issues
            community.on("error", console.log);
            yield community.delete();
            stopCommunityUpdatePolling(communityAddress);
            yield communitiesDatabase.removeItem(communityAddress);
            log("communitiesStore.deleteCommunity", { communityAddress, community, account });
            setState((state) => ({
                communities: Object.assign(Object.assign({}, state.communities), { [communityAddress]: undefined }),
            }));
        });
    },
}));
// reset store in between tests
const originalState = communitiesStore.getState();
// async function because some stores have async init
export const resetCommunitiesStore = () => __awaiter(void 0, void 0, void 0, function* () {
    pkcGetCommunityPending = {};
    Object.keys(pendingCommunityErrorTimers).forEach(clearPendingCommunityErrors);
    // remove all event listeners
    listeners.forEach((listener) => listener.removeAllListeners());
    listeners.length = 0;
    Object.keys(communityUpdatePollers).forEach(stopCommunityUpdatePolling);
    // destroy all component subscriptions to the store
    communitiesStore.destroy();
    // restore original state
    communitiesStore.setState(originalState);
});
// reset database and store in between tests
export const resetCommunitiesDatabaseAndStore = () => __awaiter(void 0, void 0, void 0, function* () {
    yield localForageLru.createInstance({ name: "bitsocialReactHooks-communities" }).clear();
    yield resetCommunitiesStore();
});
export default communitiesStore;
//# sourceMappingURL=communities-store.js.map