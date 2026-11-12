var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import assert from "../../lib/assert.js";
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
// How long a community keeps updating after nothing uses it anymore. pkc-js forgets the record
// CIDs and gateway ETags it already loaded when a community stops, so every restart downloads the
// whole record again, while a running loop downloads it once per publish. Communities publish
// between every ~20 seconds when busy and every 15 minutes when idle, so 2 minutes keeps quick
// back-and-forth navigation from re-downloading records and bounds what an abandoned busy
// community costs to about one restart's worth of downloads.
export const COMMUNITY_UPDATE_STOP_GRACE_MS = 2 * 60 * 1000;
let pkcGetCommunityPending = {};
const liveCommunities = {};
// hooks and feeds that need a community kept updating, the loop stops after the last one leaves
const communityUpdateSubscribers = {};
const communityStopTimers = {};
// reset all event listeners in between tests
const listeners = [];
const COMMUNITY_ERROR_UPDATE_GRACE_MS = 1000;
const pendingCommunityErrorTimers = {};
const omitLastRetriableError = (syncStatus) => {
    const nextSyncStatus = Object.assign({}, syncStatus);
    delete nextSyncStatus.lastRetriableError;
    return nextSyncStatus;
};
const getNowSeconds = () => Math.floor(Date.now() / 1000);
const normalizeCommunitySyncState = (updatingState) => {
    if (updatingState === "waiting-retry") {
        return "retrying";
    }
    if (updatingState === "succeeded" || updatingState === "failed" || updatingState === "stopped") {
        return updatingState;
    }
    return "loading";
};
const getNextSyncStatuses = (state, communityKey, syncState) => {
    const previousStatus = state.syncStatuses[communityKey];
    const timestamp = getNowSeconds();
    const shouldRecordAttempt = syncState === "loading" && (previousStatus === null || previousStatus === void 0 ? void 0 : previousStatus.syncState) !== "loading";
    const nextStatus = Object.assign(Object.assign(Object.assign(Object.assign({}, previousStatus), { syncState }), (shouldRecordAttempt ? { lastFetchAttemptAt: timestamp } : undefined)), (syncState === "succeeded" ? { lastSuccessfulFetchAt: timestamp } : undefined));
    return Object.assign(Object.assign({}, state.syncStatuses), { 
        // a success ends the retries, so their error is no longer current
        [communityKey]: syncState === "succeeded" ? omitLastRetriableError(nextStatus) : nextStatus });
};
const updateCommunitySyncStatus = (setState, communityKey, syncState) => {
    setState((state) => (Object.assign(Object.assign({}, state), { syncStatuses: getNextSyncStatuses(state, communityKey, syncState) })));
};
// identifies a signed community record, to recognize pkc-js re-emitting a record already in the store
const getCommunityRecordId = (community) => {
    var _a;
    const signature = (_a = community === null || community === void 0 ? void 0 : community.signature) === null || _a === void 0 ? void 0 : _a.signature;
    if (typeof signature !== "string" || typeof (community === null || community === void 0 ? void 0 : community.updatedAt) !== "number") {
        return;
    }
    return `${community.updatedAt}:${signature}`;
};
const createCommunityWithLookupFallback = (pkc, communityLookupOptions, communityKey) => __awaiter(void 0, void 0, void 0, function* () {
    const supportsAddressLookup = "address" in communityLookupOptions;
    const community = yield createPkcCommunity(pkc, communityLookupOptions);
    if ((community === null || community === void 0 ? void 0 : community.address) || supportsAddressLookup) {
        return community;
    }
    throw Error(`communitiesStore.addCommunityToStore failed getting community '${communityKey}'`);
});
const getCommunityKey = (communityAddressOrRef) => typeof communityAddressOrRef === "string"
    ? communityAddressOrRef
    : getCommunityRefKey(communityAddressOrRef);
const hasCommunityUpdateSubscribers = (communityKey) => { var _a; return (((_a = communityUpdateSubscribers[communityKey]) === null || _a === void 0 ? void 0 : _a.size) || 0) > 0; };
const updateCommunity = (communityKey, liveCommunity) => {
    const { community, communityAddressOrRef } = liveCommunity;
    liveCommunity.updateCall = Promise.resolve()
        .then(() => community.update())
        .catch((error) => log.trace("community.update error", {
        communityAddressOrRef,
        communityKey,
        community,
        error,
    }));
};
const startCommunityUpdatePolling = (communityKey, liveCommunity) => {
    clearInterval(liveCommunity.updateInterval);
    liveCommunity.openingUpdatePending = true;
    liveCommunity.stopWhenOpeningUpdateEnds = false;
    updateCommunity(communityKey, liveCommunity);
    liveCommunity.updateInterval = setInterval(() => updateCommunity(communityKey, liveCommunity), COMMUNITY_UPDATE_INTERVAL_MS);
};
const pauseCommunityUpdatePolling = (communityKey) => {
    const liveCommunity = liveCommunities[communityKey];
    if (!(liveCommunity === null || liveCommunity === void 0 ? void 0 : liveCommunity.updateInterval)) {
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
    const stopping = (() => __awaiter(void 0, void 0, void 0, function* () {
        yield updateCall;
        if (typeof community.stop !== "function") {
            return;
        }
        try {
            yield community.stop();
        }
        catch (error) {
            log.trace("community.stop error", { communityKey, community, error });
        }
    }))();
    liveCommunity.stopping = stopping;
    stopping.finally(() => {
        if (liveCommunity.stopping === stopping) {
            liveCommunity.stopping = undefined;
        }
    });
    log("communitiesStore community update loop stopped", { communityKey });
};
const resumeCommunityUpdatePolling = (communityKey) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const liveCommunity = liveCommunities[communityKey];
    if (!liveCommunity || liveCommunity.updateInterval) {
        return;
    }
    // update() is a no-op until a stop in progress ends
    if (liveCommunity.stopping) {
        yield liveCommunity.stopping;
    }
    if (liveCommunities[communityKey] !== liveCommunity ||
        liveCommunity.updateInterval ||
        !hasCommunityUpdateSubscribers(communityKey)) {
        return;
    }
    liveCommunity.replayRecordId = getCommunityRecordId(liveCommunity.community);
    liveCommunity.replayRefreshesFetchedAt = false;
    startCommunityUpdatePolling(communityKey, liveCommunity);
    log("communitiesStore community update loop restarted", { communityKey });
    // joining a shared pkc-js instance that another consumer kept updating emits no state change
    // until its next fetch, so take its current state
    yield liveCommunity.updateCall;
    const { updatingState } = liveCommunity.community;
    if (liveCommunity.updateInterval &&
        typeof updatingState === "string" &&
        updatingState !== "stopped" &&
        ((_a = communitiesStore.getState().syncStatuses[communityKey]) === null || _a === void 0 ? void 0 : _a.stoppedUntilUsed)) {
        liveCommunity.onUpdatingStateChange(updatingState);
    }
});
const clearCommunityStopTimer = (communityKey) => {
    clearTimeout(communityStopTimers[communityKey]);
    delete communityStopTimers[communityKey];
};
const scheduleCommunityUpdateStop = (communityKey) => {
    clearCommunityStopTimer(communityKey);
    communityStopTimers[communityKey] = setTimeout(() => {
        delete communityStopTimers[communityKey];
        const liveCommunity = liveCommunities[communityKey];
        if (hasCommunityUpdateSubscribers(communityKey) || !(liveCommunity === null || liveCommunity === void 0 ? void 0 : liveCommunity.updateInterval)) {
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
const endOpeningCommunityUpdate = (communityKey, liveCommunity) => {
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
const stopCommunityUpdatePolling = (communityKey) => {
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
// returning the same state skips notifying subscribers when there is nothing to clear
const clearStoredCommunityErrorsState = (state, communityKey) => {
    const syncStatus = state.syncStatuses[communityKey];
    const hasRetriableError = (syncStatus === null || syncStatus === void 0 ? void 0 : syncStatus.lastRetriableError) !== undefined;
    if (!state.errors[communityKey] && !hasRetriableError) {
        return state;
    }
    return Object.assign(Object.assign({}, state), { errors: clearStoredCommunityErrors(state, communityKey), syncStatuses: hasRetriableError
            ? Object.assign(Object.assign({}, state.syncStatuses), { [communityKey]: omitLastRetriableError(syncStatus) }) : state.syncStatuses });
};
export const isRetriableCommunityLoadError = (error) => {
    const details = error.details;
    return Boolean(details &&
        typeof details === "object" &&
        "retriableError" in details &&
        details.retriableError === true);
};
const recordRetriableCommunityError = (setState, communityKey, error) => {
    setState((state) => {
        const syncStatus = state.syncStatuses[communityKey];
        // a deleted community has no sync status left to report on
        if (!syncStatus) {
            return state;
        }
        return {
            syncStatuses: Object.assign(Object.assign({}, state.syncStatuses), { [communityKey]: Object.assign(Object.assign({}, syncStatus), { lastRetriableError: error }) }),
        };
    });
};
const scheduleCommunityError = (setState, communityKey, error) => {
    if (isRetriableCommunityLoadError(error)) {
        recordRetriableCommunityError(setState, communityKey, error);
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
    syncStatuses: {},
    addCommunityToStore(communityAddressOrRef, account) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
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
            updateCommunitySyncStatus(setState, communityKey, "initializing");
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
                let isFromCache = false;
                if (!community) {
                    const communityData = yield communitiesDatabase.getItem(communityKey);
                    const lookupName = "name" in communityLookupOptions ? communityLookupOptions.name : undefined;
                    const lookupPublicKey = "publicKey" in communityLookupOptions ? communityLookupOptions.publicKey : undefined;
                    const lookupAddress = "address" in communityLookupOptions ? communityLookupOptions.address : undefined;
                    const hasCachedPosts = Object.keys(((_a = communityData === null || communityData === void 0 ? void 0 : communityData.posts) === null || _a === void 0 ? void 0 : _a.pageCids) || {}).length > 0 ||
                        Object.keys(((_b = communityData === null || communityData === void 0 ? void 0 : communityData.posts) === null || _b === void 0 ? void 0 : _b.pages) || {}).length > 0;
                    const isUnresolvedNameCache = communityData &&
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
                            community = yield createPkcCommunity(account.pkc, communityData);
                            isFromCache = Boolean(community);
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
                const firstCommunityState = utils.clone(Object.assign(Object.assign({}, community), (fetchedAt !== undefined ? { fetchedAt } : undefined)));
                // a cache hit already is the database entry, rewriting it would only delay the store
                // update behind an IndexedDB write of the whole record
                if (!isFromCache) {
                    yield communitiesDatabase.setItem(communityKey, firstCommunityState);
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
                setState((state) => ({
                    communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: firstCommunityState }),
                }));
                const liveCommunity = {
                    community,
                    communityAddressOrRef,
                    // pkc-js re-emits the record a community was created with when update() starts
                    replayRecordId: isFromCache ? getCommunityRecordId(firstCommunityState) : undefined,
                    replayRefreshesFetchedAt: true,
                    openingUpdatePending: false,
                    stopWhenOpeningUpdateEnds: false,
                    onUpdatingStateChange: (updatingState) => {
                        setState((state) => {
                            const syncStatuses = getNextSyncStatuses(state, communityKey, normalizeCommunitySyncState(updatingState));
                            const _a = syncStatuses[communityKey], { stoppedUntilUsed: _stoppedUntilUsed } = _a, syncStatus = __rest(_a, ["stoppedUntilUsed"]);
                            // the loop is not running when the store stopped the community itself
                            syncStatuses[communityKey] =
                                updatingState === "stopped" && !liveCommunity.updateInterval
                                    ? Object.assign(Object.assign({}, syncStatus), { stoppedUntilUsed: true }) : syncStatus;
                            return {
                                syncStatuses,
                                communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: Object.assign(Object.assign({}, state.communities[communityKey]), { updatingState }) }),
                            };
                        });
                        if (updatingState === "succeeded" ||
                            updatingState === "failed" ||
                            updatingState === "waiting-retry") {
                            endOpeningCommunityUpdate(communityKey, liveCommunity);
                        }
                    },
                };
                // the community has published new posts
                community.on("update", (updatedCommunity) => __awaiter(this, void 0, void 0, function* () {
                    clearPendingCommunityErrors(communityKey);
                    setState((state) => clearStoredCommunityErrorsState(state, communityKey));
                    const isRecordReplay = liveCommunity.replayRecordId !== undefined &&
                        getCommunityRecordId(updatedCommunity) === liveCommunity.replayRecordId;
                    liveCommunity.replayRecordId = undefined;
                    if (isRecordReplay && !liveCommunity.replayRefreshesFetchedAt) {
                        // a restarted loop replays the record the store already has, it was not fetched now
                        return;
                    }
                    if (isRecordReplay) {
                        // the replayed record is already in the store and the database, only refresh fetchedAt
                        // like a fetched update would, without cloning and rewriting the whole record
                        setState((state) => {
                            const storedCommunity = state.communities[communityKey];
                            if (!storedCommunity) {
                                return state;
                            }
                            return {
                                communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: Object.assign(Object.assign({}, storedCommunity), { fetchedAt: getNowSeconds() }) }),
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
                    setState((state) => (Object.assign(Object.assign({}, state), { communities: Object.assign(Object.assign({}, state.communities), { [communityKey]: updatedCommunity }) })));
                    log("communitiesStore community update", {
                        communityAddressOrRef,
                        communityKey,
                        updatedCommunity,
                        account,
                    });
                    yield communitiesDatabase.setItem(communityKey, updatedCommunity);
                    // if a community has a role with an account's address add it to the account.communities
                    accountsStore
                        .getState()
                        .accountsActionsInternal.addCommunityRoleToAccountsCommunities(updatedCommunity);
                    // add page comments to communitiesPagesStore so they can be used in useComment
                    communitiesPagesStore.getState().addCommunityPageCommentsToStore(updatedCommunity);
                    endOpeningCommunityUpdate(communityKey, liveCommunity);
                }));
                community.on("updatingstatechange", liveCommunity.onUpdatingStateChange);
                community.on("error", (error) => {
                    scheduleCommunityError(setState, communityKey, error);
                });
                // set clients on community so the frontend can display it, dont persist in db because a reload cancels updating
                utils.clientsOnStateChange(community === null || community === void 0 ? void 0 : community.clients, (clientState, clientType, clientUrl, chainTicker) => {
                    setState((state) => {
                        var _a;
                        // make sure not undefined, sometimes happens in e2e tests
                        if (!state.communities[communityKey]) {
                            return state;
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
                liveCommunities[communityKey] = liveCommunity;
                startCommunityUpdatePolling(communityKey, liveCommunity);
                // joining a shared pkc-js instance that another consumer, e.g. a comment's update loop,
                // keeps updating emits no state change until its next fetch, so take its current state
                void ((_c = liveCommunity.updateCall) === null || _c === void 0 ? void 0 : _c.then(() => {
                    var _a;
                    const { updatingState } = liveCommunity.community;
                    if (liveCommunities[communityKey] === liveCommunity &&
                        liveCommunity.updateInterval &&
                        typeof updatingState === "string" &&
                        updatingState !== "stopped" &&
                        ((_a = getState().syncStatuses[communityKey]) === null || _a === void 0 ? void 0 : _a.syncState) === "initializing") {
                        liveCommunity.onUpdatingStateChange(updatingState);
                    }
                }));
                // loaded without a subscriber, e.g. by a store-level caller: update until the grace period
                // ends, and at least until the first fetch ends
                if (!hasCommunityUpdateSubscribers(communityKey)) {
                    scheduleCommunityUpdateStop(communityKey);
                }
            }
            catch (error) {
                updateCommunitySyncStatus(setState, communityKey, "failed");
                throw error;
            }
            finally {
                pkcGetCommunityPending[pendingKey] = false;
            }
        });
    },
    // keep a community updating while a subscriber (a mounted hook or feed) needs it, and restart
    // its update loop if it stopped after its previous subscribers left
    startCommunityAutoUpdate(communityAddressOrRef, subscriberId, account) {
        return __awaiter(this, void 0, void 0, function* () {
            const communityKey = getCommunityKey(communityAddressOrRef);
            assert(communityKey !== "" && typeof communityKey === "string", `communitiesStore.startCommunityAutoUpdate invalid communityAddress argument '${communityAddressOrRef}'`);
            assert(subscriberId && typeof subscriberId === "string", `communitiesStore.startCommunityAutoUpdate invalid subscriberId argument '${subscriberId}'`);
            if (!communityUpdateSubscribers[communityKey]) {
                communityUpdateSubscribers[communityKey] = new Set();
            }
            communityUpdateSubscribers[communityKey].add(subscriberId);
            clearCommunityStopTimer(communityKey);
            const liveCommunity = liveCommunities[communityKey];
            if (liveCommunity) {
                liveCommunity.stopWhenOpeningUpdateEnds = false;
                yield resumeCommunityUpdatePolling(communityKey);
                return;
            }
            yield getState().addCommunityToStore(communityAddressOrRef, account);
        });
    },
    // the community stops updating a grace period after its last subscriber leaves
    stopCommunityAutoUpdate(communityAddressOrRef, subscriberId) {
        return __awaiter(this, void 0, void 0, function* () {
            const communityKey = getCommunityKey(communityAddressOrRef);
            const subscribers = communityUpdateSubscribers[communityKey];
            if (!(subscribers === null || subscribers === void 0 ? void 0 : subscribers.delete(subscriberId))) {
                return;
            }
            if (subscribers.size > 0) {
                return;
            }
            delete communityUpdateSubscribers[communityKey];
            if (liveCommunities[communityKey]) {
                scheduleCommunityUpdateStop(communityKey);
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
            setState((state) => {
                const syncStatuses = Object.assign({}, state.syncStatuses);
                delete syncStatuses[communityAddress];
                const errors = Object.assign({}, state.errors);
                delete errors[communityAddress];
                return {
                    communities: Object.assign(Object.assign({}, state.communities), { [communityAddress]: undefined }),
                    errors,
                    syncStatuses,
                };
            });
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
    Object.keys(liveCommunities).forEach(stopCommunityUpdatePolling);
    Object.keys(communityStopTimers).forEach(clearCommunityStopTimer);
    for (const communityKey in communityUpdateSubscribers) {
        delete communityUpdateSubscribers[communityKey];
    }
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