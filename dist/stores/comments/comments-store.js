var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import localForageLru from "../../lib/localforage-lru/index.js";
const commentsDatabase = localForageLru.createInstance({
    name: "bitsocialReactHooks-comments",
    size: 5000,
});
import Logger from "@pkcprotocol/pkc-logger";
export const log = Logger("bitsocial-react-hooks:comments:stores");
import utils from "../../lib/utils/index.js";
import createStore from "zustand";
import accountsStore from "../accounts/index.js";
import repliesPagesStore from "../replies-pages/index.js";
import { normalizeCommentCommunityAddress } from "../../lib/pkc-compat.js";
let pkcGetCommentPending = {};
const liveComments = {};
const liveCommentPromises = {};
// settles when every comment.stop() in progress for the CID has returned
const liveCommentStops = {};
const commentAutoUpdateSubscribers = {};
// hooks and stores waiting for the update requested on open: a frozen useComment until it
// settles, and the authors-comments store, which never leaves
const openingUpdateWaiters = {};
const stopCommentAfterNextUpdate = {};
const sparseCommentFollowupRequested = {};
// set when the current update attempt emitted an error, until the next attempt starts
const commentUpdateAttemptFailed = {};
// refreshComment calls waiting for their update cycle to end
const pendingRefreshes = {};
// CIDs whose pending refreshes outlived the last auto-update subscriber, e.g. the hook that called
// refresh() unmounted
const refreshesOutlivedSubscribers = {};
// CIDs whose last hook or refresh left while their one-shot update may still be retrying
const oneShotUpdateConsumersLeft = {};
const initializedComments = new WeakSet();
const trackedListeners = new WeakSet();
// reset all event listeners in between tests
export const listeners = [];
const removeCommentListener = (comment, event, listener) => {
    if (typeof (comment === null || comment === void 0 ? void 0 : comment.off) === "function") {
        comment.off(event, listener);
        return;
    }
    if (typeof (comment === null || comment === void 0 ? void 0 : comment.removeListener) === "function") {
        comment.removeListener(event, listener);
    }
};
const getCommentAutoUpdateSubscribersCount = (commentCid) => Object.keys(commentAutoUpdateSubscribers[commentCid] || {}).length;
const hasCommentAutoUpdateSubscribers = (commentCid) => getCommentAutoUpdateSubscribersCount(commentCid) > 0;
const hasOpeningUpdateWaiters = (commentCid) => Object.keys(openingUpdateWaiters[commentCid] || {}).length > 0;
// hooks and refreshes that keep a failing one-shot update retrying
const hasOneShotUpdateConsumers = (commentCid) => hasCommentAutoUpdateSubscribers(commentCid) ||
    hasOpeningUpdateWaiters(commentCid) ||
    (Boolean(pendingRefreshes[commentCid]) && !refreshesOutlivedSubscribers[commentCid]);
const markOneShotUpdateConsumerLeft = (commentCid) => {
    if (!hasOneShotUpdateConsumers(commentCid)) {
        oneShotUpdateConsumersLeft[commentCid] = true;
    }
};
const mergeCommentData = (commentCid, ...commentDataList) => {
    const mergedCommentData = { cid: commentCid };
    for (const commentData of commentDataList) {
        if (commentData && typeof commentData === "object") {
            Object.assign(mergedCommentData, utils.clone(commentData));
        }
    }
    mergedCommentData.cid = commentCid;
    return mergedCommentData;
};
const releaseLiveComment = (commentCid, comment) => {
    const liveComment = comment || liveComments[commentCid];
    if (liveComment) {
        const listenerIndex = listeners.indexOf(liveComment);
        if (listenerIndex !== -1) {
            listeners.splice(listenerIndex, 1);
        }
    }
    if (!comment || liveComments[commentCid] === liveComment) {
        delete liveComments[commentCid];
    }
};
const maybeReleaseStoppedLiveComment = (commentCid, comment) => {
    if (!comment || hasCommentAutoUpdateSubscribers(commentCid)) {
        return;
    }
    if (liveComments[commentCid] !== comment) {
        return;
    }
    releaseLiveComment(commentCid, comment);
};
const commentsStore = createStore((setState, getState) => {
    const addCommentError = (commentCid, error) => {
        setState((state) => {
            let commentErrors = state.errors[commentCid] || [];
            commentErrors = [...commentErrors, error];
            return Object.assign(Object.assign({}, state), { errors: Object.assign(Object.assign({}, state.errors), { [commentCid]: commentErrors }) });
        });
    };
    const persistComment = (commentCid, nextComment) => __awaiter(void 0, void 0, void 0, function* () {
        const normalizedComment = normalizeCommentCommunityAddress(utils.clone(nextComment));
        // Store the update before the database write. pkc-js emits "updatingstatechange" right after
        // "update", so waiting on the write would let "succeeded" land on a CID-only entry, and a
        // frozen useComment would settle on that empty shell.
        setState((state) => ({
            comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: normalizedComment }),
        }));
        // add comment replies pages to repliesPagesStore so they can be used in useComment
        repliesPagesStore.getState().addRepliesPageCommentsToStore(nextComment);
        yield commentsDatabase.setItem(commentCid, normalizedComment);
        log("commentsStore comment update", { commentCid, updatedComment: normalizedComment });
        return normalizedComment;
    });
    const clearCommentUpdateFollowup = (commentCid) => {
        delete sparseCommentFollowupRequested[commentCid];
    };
    const endOpeningUpdate = (commentCid) => {
        if (!getState().openingUpdatesPending[commentCid]) {
            return;
        }
        setState((state) => {
            const openingUpdatesPending = Object.assign({}, state.openingUpdatesPending);
            delete openingUpdatesPending[commentCid];
            return { openingUpdatesPending };
        });
    };
    // When the last auto-update subscriber leaves during the opening update or a refresh, stopping
    // would abort it and leave a frozen useComment on a cached copy or a refresh that never
    // settles, so stop when that update ends instead.
    const deferStopUntilRequestedUpdateEnds = (commentCid) => {
        if (!getState().openingUpdatesPending[commentCid] && !pendingRefreshes[commentCid]) {
            return false;
        }
        stopCommentAfterNextUpdate[commentCid] = true;
        return true;
    };
    // ensureLiveComment waits for these before it hands the comment out again
    const trackLiveCommentStop = (commentCid, stopCall) => {
        const stopped = Promise.resolve(stopCall).then(() => { }, () => { });
        const previousStops = liveCommentStops[commentCid];
        const stops = previousStops ? Promise.all([previousStops, stopped]).then(() => { }) : stopped;
        liveCommentStops[commentCid] = stops;
        void stops.then(() => {
            if (liveCommentStops[commentCid] === stops) {
                delete liveCommentStops[commentCid];
            }
        });
    };
    const stopLiveComment = (commentCid, comment) => __awaiter(void 0, void 0, void 0, function* () {
        clearCommentUpdateFollowup(commentCid);
        // a stopped comment gets no further update from this cycle
        endOpeningUpdate(commentCid);
        const liveComment = comment || liveComments[commentCid];
        if (typeof (liveComment === null || liveComment === void 0 ? void 0 : liveComment.stop) !== "function") {
            return;
        }
        try {
            const stopCall = liveComment.stop();
            trackLiveCommentStop(commentCid, stopCall);
            yield stopCall;
        }
        catch (error) {
            log.trace("comment.stop error", { commentCid, comment: liveComment, error });
        }
    });
    const maybeStopCommentAfterOneShotUpdate = (commentCid, comment) => {
        if (!stopCommentAfterNextUpdate[commentCid]) {
            return;
        }
        delete stopCommentAfterNextUpdate[commentCid];
        delete oneShotUpdateConsumersLeft[commentCid];
        if (hasCommentAutoUpdateSubscribers(commentCid)) {
            return;
        }
        void stopLiveComment(commentCid, comment).finally(() => {
            maybeReleaseStoppedLiveComment(commentCid, comment);
        });
    };
    const toCommentUpdateError = (error) => error instanceof Error ? error : Error("comment update failed");
    const emitCommentError = (comment, error) => {
        const emit = comment === null || comment === void 0 ? void 0 : comment.emit;
        if (typeof emit !== "function") {
            return;
        }
        try {
            emit.call(comment, "error", error);
        }
        catch (emitError) {
            if (emitError !== error) {
                log.trace("comment.update error event error", { comment, error: emitError });
            }
        }
    };
    const handleCommentUpdateError = (commentCid, comment, error) => {
        var _a, _b;
        const updateError = toCommentUpdateError(error);
        clearCommentUpdateFollowup(commentCid);
        if (!((_a = getState().errors[commentCid]) === null || _a === void 0 ? void 0 : _a.includes(updateError))) {
            emitCommentError(comment, updateError);
            if (!((_b = getState().errors[commentCid]) === null || _b === void 0 ? void 0 : _b.includes(updateError))) {
                addCommentError(commentCid, updateError);
            }
        }
        maybeStopCommentAfterOneShotUpdate(commentCid, comment);
        endOpeningUpdate(commentCid);
        return updateError;
    };
    const isSparseCommentUpdate = (comment) => !!(comment === null || comment === void 0 ? void 0 : comment.timestamp) && !(comment === null || comment === void 0 ? void 0 : comment.updatedAt);
    // A CID-only comment update can settle after immutable IPFS data; one follow-up
    // update gives PKC a chance to load mutable community data such as replies.
    const shouldRequestSparseCommentFollowup = (commentCid, comment) => !sparseCommentFollowupRequested[commentCid] &&
        (stopCommentAfterNextUpdate[commentCid] || hasCommentAutoUpdateSubscribers(commentCid)) &&
        isSparseCommentUpdate(comment);
    const shouldWaitForSparseCommentFollowup = (commentCid, comment) => sparseCommentFollowupRequested[commentCid] && isSparseCommentUpdate(comment);
    // pkc-js ends an update cycle that found no newer CommentUpdate with "waiting-retry". A
    // retriable failure also ends in "waiting-retry", after an error event, and must keep retrying.
    // Once the comment has a CommentUpdate, an error-free "waiting-retry" settles a one-shot update
    // or refresh; until then, keep waiting for the first one.
    const isUnchangedUpdateCycleEnd = (updatingState, commentCid, comment) => updatingState === "waiting-retry" &&
        !commentUpdateAttemptFailed[commentCid] &&
        typeof (comment === null || comment === void 0 ? void 0 : comment.updatedAt) === "number";
    // A one-shot update keeps retrying after a retriable error while anything waits for it, and for
    // callers that never register. Once the hooks and refreshes that used it have all left, e.g. a
    // frozen useComment of a comment whose community is unreachable unmounted, its next retry ends
    // it instead of retrying for the rest of the session.
    const isUnusedOneShotRetry = (updatingState, commentCid) => updatingState === "waiting-retry" &&
        Boolean(stopCommentAfterNextUpdate[commentCid]) &&
        Boolean(oneShotUpdateConsumersLeft[commentCid]) &&
        !hasOneShotUpdateConsumers(commentCid);
    const initializeComment = (commentCid, comment, account) => {
        var _a, _b, _c, _d;
        if (initializedComments.has(comment)) {
            liveComments[commentCid] = comment;
            return;
        }
        initializedComments.add(comment);
        liveComments[commentCid] = comment;
        (_a = comment === null || comment === void 0 ? void 0 : comment.on) === null || _a === void 0 ? void 0 : _a.call(comment, "update", (updatedComment) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c;
            updatedComment = normalizeCommentCommunityAddress(utils.clone(updatedComment));
            // A newer CommentUpdate ends the opening update, also for a reply whose cycle pkc-js never
            // ends. pkc-js emits "update" for other changes too, like a resolved author name.
            const isNewerCommentUpdate = ((_a = updatedComment.updatedAt) !== null && _a !== void 0 ? _a : 0) > ((_c = (_b = getState().comments[commentCid]) === null || _b === void 0 ? void 0 : _b.updatedAt) !== null && _c !== void 0 ? _c : 0);
            const persisted = persistComment(commentCid, updatedComment);
            if (isNewerCommentUpdate) {
                endOpeningUpdate(commentCid);
            }
            yield persisted;
        }));
        (_b = comment === null || comment === void 0 ? void 0 : comment.on) === null || _b === void 0 ? void 0 : _b.call(comment, "updatingstatechange", (updatingState) => {
            setState((state) => ({
                comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: Object.assign(Object.assign({}, state.comments[commentCid]), { updatingState }) }),
            }));
            if (updatingState === "succeeded" &&
                shouldRequestSparseCommentFollowup(commentCid, comment)) {
                sparseCommentFollowupRequested[commentCid] = true;
                requestCommentUpdate(commentCid, comment, {
                    stopAfterNextUpdate: !!stopCommentAfterNextUpdate[commentCid],
                });
                return;
            }
            if (updatingState === "succeeded" &&
                (comment.updatedAt || sparseCommentFollowupRequested[commentCid])) {
                clearCommentUpdateFollowup(commentCid);
            }
            if (updatingState === "failed") {
                clearCommentUpdateFollowup(commentCid);
            }
            if (updatingState === "succeeded" ||
                updatingState === "failed" ||
                isUnchangedUpdateCycleEnd(updatingState, commentCid, comment) ||
                isUnusedOneShotRetry(updatingState, commentCid)) {
                maybeStopCommentAfterOneShotUpdate(commentCid, comment);
                endOpeningUpdate(commentCid);
            }
            if (updatingState !== "waiting-retry") {
                delete commentUpdateAttemptFailed[commentCid];
            }
        });
        (_c = comment === null || comment === void 0 ? void 0 : comment.on) === null || _c === void 0 ? void 0 : _c.call(comment, "error", (error) => {
            commentUpdateAttemptFailed[commentCid] = true;
            addCommentError(commentCid, error);
        });
        // set clients on comment so the frontend can display it, dont persist in db because a reload cancels updating
        utils.clientsOnStateChange(comment === null || comment === void 0 ? void 0 : comment.clients, (clientState, clientType, clientUrl, chainTicker) => {
            setState((state) => {
                var _a;
                // make sure not undefined, sometimes happens in e2e tests
                if (!state.comments[commentCid]) {
                    return {};
                }
                const clients = Object.assign({}, (_a = state.comments[commentCid]) === null || _a === void 0 ? void 0 : _a.clients);
                const client = { state: clientState };
                if (chainTicker) {
                    const chainProviders = Object.assign(Object.assign({}, clients[clientType][chainTicker]), { [clientUrl]: client });
                    clients[clientType] = Object.assign(Object.assign({}, clients[clientType]), { [chainTicker]: chainProviders });
                }
                else {
                    clients[clientType] = Object.assign(Object.assign({}, clients[clientType]), { [clientUrl]: client });
                }
                return {
                    comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: Object.assign(Object.assign({}, state.comments[commentCid]), { clients }) }),
                };
            });
        });
        // when publishing a comment, you don't yet know its CID
        // so when a new comment is fetched, check to see if it's your own
        // comment, and if yes, add the CID to your account comments database
        // if comment.timestamp isn't defined, it means the next update will contain the timestamp and author
        // which is used in addCidToAccountComment
        if (!(comment === null || comment === void 0 ? void 0 : comment.timestamp)) {
            (_d = comment === null || comment === void 0 ? void 0 : comment.once) === null || _d === void 0 ? void 0 : _d.call(comment, "update", () => accountsStore
                .getState()
                .accountsActionsInternal.addCidToAccountComment(comment)
                .catch((error) => log.error("accountsActionsInternal.addCidToAccountComment error", { comment, error })));
        }
        if (!trackedListeners.has(comment)) {
            trackedListeners.add(comment);
            listeners.push(comment);
        }
    };
    // pkc-js stop() marks the comment stopped before it tears down the update loop, and update()
    // in between joins that loop, after which the comment never updates again
    const waitForLiveCommentStops = (commentCid) => __awaiter(void 0, void 0, void 0, function* () {
        while (liveCommentStops[commentCid]) {
            yield liveCommentStops[commentCid];
        }
    });
    // addCommentToStore passes cacheChecked, because it has read the cache already
    const ensureLiveComment = (commentCid, account, commentData, options) => __awaiter(void 0, void 0, void 0, function* () {
        yield waitForLiveCommentStops(commentCid);
        if (liveComments[commentCid]) {
            return liveComments[commentCid];
        }
        if (liveCommentPromises[commentCid]) {
            return liveCommentPromises[commentCid];
        }
        const liveCommentPromise = (() => __awaiter(void 0, void 0, void 0, function* () {
            // Whichever action creates the live comment, seed it from the cache: a comment created
            // without its CommentIpfs emits that alone first, which would replace a cached CommentUpdate.
            const cachedCommentData = (options === null || options === void 0 ? void 0 : options.cacheChecked)
                ? undefined
                : yield readCachedComment(commentCid);
            const liveComment = normalizeCommentCommunityAddress(yield createCommentSeededFromCache(commentCid, account, cachedCommentData, commentData));
            initializeComment(commentCid, liveComment, account);
            return liveComment;
        }))();
        liveCommentPromises[commentCid] = liveCommentPromise;
        try {
            return yield liveCommentPromise;
        }
        finally {
            if (liveCommentPromises[commentCid] === liveCommentPromise) {
                delete liveCommentPromises[commentCid];
            }
        }
    });
    const requestCommentUpdate = (commentCid, comment, options) => {
        var _a;
        if (options === null || options === void 0 ? void 0 : options.stopAfterNextUpdate) {
            stopCommentAfterNextUpdate[commentCid] = true;
        }
        else {
            delete stopCommentAfterNextUpdate[commentCid];
        }
        // Resolves whether update() started or attached to an update loop.
        return (_a = comment === null || comment === void 0 ? void 0 : comment.update) === null || _a === void 0 ? void 0 : _a.call(comment).then(() => true, (error) => {
            const updateError = handleCommentUpdateError(commentCid, comment, error);
            log.trace("comment.update error", { commentCid, comment, error: updateError });
            return false;
        });
    };
    // Whether the cycle update() began or joined has already ended, for a shared loop that will
    // emit nothing more until its next poll (see waitForCommentUpdateCycle).
    const isJoinedUpdateCycleSettled = (commentCid, comment) => typeof (comment === null || comment === void 0 ? void 0 : comment.updatedAt) === "number" &&
        (comment.updatingState === "succeeded" ||
            isUnchangedUpdateCycleEnd(comment.updatingState, commentCid, comment)) &&
        !shouldWaitForSparseCommentFollowup(commentCid, comment);
    // Waits for the update cycle that startUpdate() begins or joins. pkc-js runs one update loop
    // per CID: when another instance already updates this comment (for example the account's own
    // reply, whose update subscribes to its post), update() mirrors that shared loop instead of
    // starting a cycle, and when auto-update subscribers keep this comment updating, update() does
    // nothing. Either loop only emits again on its next poll, up to a minute later on a quiet
    // community, but its latest CommentUpdate is current, so joining a loop that has already
    // settled settles as soon as update() returns.
    const waitForCommentUpdateCycle = (commentCid, comment, startUpdate) => new Promise((resolve, reject) => {
        var _a, _b, _c;
        let settled = false;
        const settle = () => {
            settled = true;
            cleanup();
            resolve(normalizeCommentCommunityAddress(utils.clone(comment)));
        };
        const isSettledUpdatingState = (updatingState) => updatingState === "succeeded" ||
            isUnchangedUpdateCycleEnd(updatingState, commentCid, comment);
        const onUpdatingStateChange = (updatingState) => {
            var _a;
            // Nothing else waits for this cycle, which may never end, e.g. without a CommentUpdate, so
            // settle at its next retry, where the store stops the comment if nothing else uses it.
            if (updatingState === "waiting-retry" && refreshesOutlivedSubscribers[commentCid]) {
                settle();
                return;
            }
            if (isSettledUpdatingState(updatingState)) {
                if (shouldWaitForSparseCommentFollowup(commentCid, comment)) {
                    return;
                }
                settle();
                return;
            }
            if (updatingState === "failed") {
                settled = true;
                cleanup();
                reject(((_a = getState().errors[commentCid]) === null || _a === void 0 ? void 0 : _a.slice(-1)[0]) || Error("comment update failed"));
            }
        };
        const onError = (error) => {
            settled = true;
            cleanup();
            reject(error);
        };
        const cleanup = () => {
            removeCommentListener(comment, "updatingstatechange", onUpdatingStateChange);
            removeCommentListener(comment, "error", onError);
        };
        (_a = comment === null || comment === void 0 ? void 0 : comment.on) === null || _a === void 0 ? void 0 : _a.call(comment, "updatingstatechange", onUpdatingStateChange);
        (_b = comment === null || comment === void 0 ? void 0 : comment.on) === null || _b === void 0 ? void 0 : _b.call(comment, "error", onError);
        void ((_c = startUpdate()) === null || _c === void 0 ? void 0 : _c.then((updateStarted) => {
            if (!updateStarted || settled || !isJoinedUpdateCycleSettled(commentCid, comment)) {
                return;
            }
            // No event will end this cycle, so detach a one-shot update here as the event would.
            maybeStopCommentAfterOneShotUpdate(commentCid, comment);
            settle();
        }));
    });
    return {
        comments: {},
        errors: {},
        openingUpdatesPending: {},
        addCommentToStore(commentCid, account, commentData) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a;
                const { comments } = getState();
                const pendingKey = commentCid + account.id;
                // comment is in store already, do nothing
                let comment = comments[commentCid];
                if (comment || pkcGetCommentPending[pendingKey]) {
                    return;
                }
                pkcGetCommentPending[pendingKey] = true;
                // only hooks that leave during this fetch end its failing update early
                delete oneShotUpdateConsumersLeft[commentCid];
                try {
                    // try to find comment in database
                    comment = yield getCommentFromDatabase(commentCid, account, commentData);
                    if (!comment) {
                        comment = yield ensureLiveComment(commentCid, account, commentData, {
                            cacheChecked: true,
                        });
                        comment = normalizeCommentCommunityAddress(comment);
                        log("commentsStore.addCommentToStore", { commentCid, comment, account });
                        setState((state) => ({
                            comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: utils.clone(comment) }),
                            openingUpdatesPending: Object.assign(Object.assign({}, state.openingUpdatesPending), { [commentCid]: true }),
                        }));
                    }
                    else {
                        comment = normalizeCommentCommunityAddress(comment);
                        setState((state) => ({
                            comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: utils.clone(comment) }),
                            openingUpdatesPending: Object.assign(Object.assign({}, state.openingUpdatesPending), { [commentCid]: true }),
                        }));
                        // add comment replies pages to repliesPagesStore so they can be used in useComment
                        repliesPagesStore.getState().addRepliesPageCommentsToStore(comment);
                        comment = yield ensureLiveComment(commentCid, account, mergeCommentData(commentCid, comment, commentData), { cacheChecked: true });
                    }
                    if (comment) {
                        const liveComment = comment;
                        void ((_a = requestCommentUpdate(commentCid, liveComment, { stopAfterNextUpdate: true })) === null || _a === void 0 ? void 0 : _a.then((updateStarted) => {
                            if (updateStarted && isJoinedUpdateCycleSettled(commentCid, liveComment)) {
                                maybeStopCommentAfterOneShotUpdate(commentCid, liveComment);
                                endOpeningUpdate(commentCid);
                            }
                        }));
                    }
                }
                catch (e) {
                    endOpeningUpdate(commentCid);
                    addCommentError(commentCid, e);
                    throw e;
                }
                finally {
                    pkcGetCommentPending[pendingKey] = false;
                }
            });
        },
        startCommentAutoUpdate(commentCid, subscriberId, account, commentData) {
            return __awaiter(this, void 0, void 0, function* () {
                const hadAutoUpdateSubscribers = hasCommentAutoUpdateSubscribers(commentCid);
                commentAutoUpdateSubscribers[commentCid] = Object.assign(Object.assign({}, (commentAutoUpdateSubscribers[commentCid] || {})), { [subscriberId]: true });
                delete refreshesOutlivedSubscribers[commentCid];
                if (hadAutoUpdateSubscribers && liveComments[commentCid]) {
                    return;
                }
                const storedComment = getState().comments[commentCid];
                const liveComment = yield ensureLiveComment(commentCid, account, mergeCommentData(commentCid, storedComment, commentData));
                if (!storedComment) {
                    setState((state) => ({
                        comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: utils.clone(liveComment) }),
                    }));
                }
                if (!hasCommentAutoUpdateSubscribers(commentCid)) {
                    if (deferStopUntilRequestedUpdateEnds(commentCid)) {
                        return;
                    }
                    yield stopLiveComment(commentCid, liveComment);
                    maybeReleaseStoppedLiveComment(commentCid, liveComment);
                    return;
                }
                requestCommentUpdate(commentCid, liveComment);
            });
        },
        stopCommentAutoUpdate(commentCid, subscriberId) {
            return __awaiter(this, void 0, void 0, function* () {
                if (commentAutoUpdateSubscribers[commentCid]) {
                    delete commentAutoUpdateSubscribers[commentCid][subscriberId];
                    if (Object.keys(commentAutoUpdateSubscribers[commentCid]).length === 0) {
                        delete commentAutoUpdateSubscribers[commentCid];
                    }
                }
                if (pendingRefreshes[commentCid] && !hasCommentAutoUpdateSubscribers(commentCid)) {
                    refreshesOutlivedSubscribers[commentCid] = true;
                }
                markOneShotUpdateConsumerLeft(commentCid);
                if (hasCommentAutoUpdateSubscribers(commentCid) ||
                    deferStopUntilRequestedUpdateEnds(commentCid)) {
                    return;
                }
                delete stopCommentAfterNextUpdate[commentCid];
                delete oneShotUpdateConsumersLeft[commentCid];
                const liveComment = liveComments[commentCid];
                yield stopLiveComment(commentCid, liveComment);
                maybeReleaseStoppedLiveComment(commentCid, liveComment);
            });
        },
        // keeps a failing update requested on open retrying while a hook waits for it
        addOpeningUpdateWaiter(commentCid, waiterId) {
            openingUpdateWaiters[commentCid] = Object.assign(Object.assign({}, openingUpdateWaiters[commentCid]), { [waiterId]: true });
        },
        removeOpeningUpdateWaiter(commentCid, waiterId) {
            if (!openingUpdateWaiters[commentCid]) {
                return;
            }
            delete openingUpdateWaiters[commentCid][waiterId];
            if (!hasOpeningUpdateWaiters(commentCid)) {
                delete openingUpdateWaiters[commentCid];
            }
            markOneShotUpdateConsumerLeft(commentCid);
        },
        refreshComment(commentCid, account, commentData) {
            return __awaiter(this, void 0, void 0, function* () {
                // counted from the start, so a subscriber that leaves while the refresh stops the comment
                // defers its stop instead of stopping the comment again
                pendingRefreshes[commentCid] = (pendingRefreshes[commentCid] || 0) + 1;
                // a new refresh wants its whole cycle, so earlier refreshes wait for the cycle end again too
                delete refreshesOutlivedSubscribers[commentCid];
                try {
                    const storedComment = getState().comments[commentCid];
                    const liveComment = yield ensureLiveComment(commentCid, account, mergeCommentData(commentCid, storedComment, commentData));
                    if (!hasCommentAutoUpdateSubscribers(commentCid) &&
                        (liveComment === null || liveComment === void 0 ? void 0 : liveComment.updatingState) !== "stopped") {
                        yield stopLiveComment(commentCid, liveComment);
                    }
                    // another stop may have begun meanwhile, e.g. when the update requested on open ended
                    yield waitForLiveCommentStops(commentCid);
                    return yield waitForCommentUpdateCycle(commentCid, liveComment, () => requestCommentUpdate(commentCid, liveComment, {
                        stopAfterNextUpdate: !hasCommentAutoUpdateSubscribers(commentCid),
                    }));
                }
                finally {
                    const remainingRefreshes = (pendingRefreshes[commentCid] || 0) - 1;
                    if (remainingRefreshes > 0) {
                        pendingRefreshes[commentCid] = remainingRefreshes;
                    }
                    else {
                        delete pendingRefreshes[commentCid];
                        delete refreshesOutlivedSubscribers[commentCid];
                    }
                    markOneShotUpdateConsumerLeft(commentCid);
                }
            });
        },
    };
});
const getCommentFromDatabase = (commentCid, account, initialCommentData) => __awaiter(void 0, void 0, void 0, function* () {
    const commentData = yield commentsDatabase.getItem(commentCid);
    if (!commentData) {
        return;
    }
    try {
        const comment = normalizeCommentCommunityAddress(yield account.pkc.createComment(mergeCommentData(commentCid, commentData, initialCommentData)));
        return comment;
    }
    catch (e) {
        // need to log this always or it could silently fail in production and cache never be used
        console.error("failed pkc.createComment(cachedComment)", {
            cachedComment: commentData,
            error: e,
        });
    }
});
const readCachedComment = (commentCid) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return (yield commentsDatabase.getItem(commentCid));
    }
    catch (error) {
        log.error("commentsStore cached comment read error", { commentCid, error });
    }
});
// Like getCommentFromDatabase, skips a cache entry pkc-js can no longer parse, e.g. after a schema
// change, and creates the comment from the caller's data alone.
const createCommentSeededFromCache = (commentCid, account, cachedCommentData, commentData) => __awaiter(void 0, void 0, void 0, function* () {
    if (cachedCommentData) {
        try {
            return yield account.pkc.createComment(normalizeCommentCommunityAddress(mergeCommentData(commentCid, cachedCommentData, commentData)));
        }
        catch (error) {
            console.error("failed pkc.createComment(cachedComment)", {
                cachedComment: cachedCommentData,
                error,
            });
        }
    }
    return account.pkc.createComment(normalizeCommentCommunityAddress(mergeCommentData(commentCid, commentData)));
});
// reset store in between tests
const originalState = commentsStore.getState();
// async function because some stores have async init
export const resetCommentsStore = () => __awaiter(void 0, void 0, void 0, function* () {
    pkcGetCommentPending = {};
    for (const commentCid in commentAutoUpdateSubscribers) {
        delete commentAutoUpdateSubscribers[commentCid];
    }
    for (const commentCid in openingUpdateWaiters) {
        delete openingUpdateWaiters[commentCid];
    }
    for (const commentCid in stopCommentAfterNextUpdate) {
        delete stopCommentAfterNextUpdate[commentCid];
    }
    for (const commentCid in sparseCommentFollowupRequested) {
        delete sparseCommentFollowupRequested[commentCid];
    }
    for (const commentCid in commentUpdateAttemptFailed) {
        delete commentUpdateAttemptFailed[commentCid];
    }
    for (const commentCid in pendingRefreshes) {
        delete pendingRefreshes[commentCid];
    }
    for (const commentCid in refreshesOutlivedSubscribers) {
        delete refreshesOutlivedSubscribers[commentCid];
    }
    for (const commentCid in oneShotUpdateConsumersLeft) {
        delete oneShotUpdateConsumersLeft[commentCid];
    }
    for (const commentCid in liveCommentPromises) {
        delete liveCommentPromises[commentCid];
    }
    for (const commentCid in liveCommentStops) {
        delete liveCommentStops[commentCid];
    }
    for (const commentCid in liveComments) {
        delete liveComments[commentCid];
    }
    // remove all event listeners
    yield Promise.all(listeners.map((listener) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            if (typeof (listener === null || listener === void 0 ? void 0 : listener.stop) === "function") {
                yield listener.stop();
            }
        }
        catch (_b) { }
        (_a = listener === null || listener === void 0 ? void 0 : listener.removeAllListeners) === null || _a === void 0 ? void 0 : _a.call(listener);
    })));
    listeners.length = 0;
    // destroy all component subscriptions to the store
    commentsStore.destroy();
    // restore original state
    commentsStore.setState(originalState);
});
// reset database and store in between tests
export const resetCommentsDatabaseAndStore = () => __awaiter(void 0, void 0, void 0, function* () {
    yield localForageLru.createInstance({ name: "bitsocialReactHooks-comments" }).clear();
    yield resetCommentsStore();
});
export default commentsStore;
//# sourceMappingURL=comments-store.js.map