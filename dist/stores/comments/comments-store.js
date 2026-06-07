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
const commentAutoUpdateSubscribers = {};
const stopCommentAfterNextUpdate = {};
const sparseCommentFollowupRequested = {};
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
        yield commentsDatabase.setItem(commentCid, normalizedComment);
        log("commentsStore comment update", { commentCid, updatedComment: normalizedComment });
        setState((state) => ({
            comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: normalizedComment }),
        }));
        // add comment replies pages to repliesPagesStore so they can be used in useComment
        repliesPagesStore.getState().addRepliesPageCommentsToStore(nextComment);
        return normalizedComment;
    });
    const clearCommentUpdateFollowup = (commentCid) => {
        delete sparseCommentFollowupRequested[commentCid];
    };
    const stopLiveComment = (commentCid, comment) => __awaiter(void 0, void 0, void 0, function* () {
        clearCommentUpdateFollowup(commentCid);
        const liveComment = comment || liveComments[commentCid];
        if (typeof (liveComment === null || liveComment === void 0 ? void 0 : liveComment.stop) !== "function") {
            return;
        }
        try {
            yield liveComment.stop();
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
        return updateError;
    };
    const isSparseCommentUpdate = (comment) => !!(comment === null || comment === void 0 ? void 0 : comment.timestamp) && !(comment === null || comment === void 0 ? void 0 : comment.updatedAt);
    // A CID-only comment update can settle after immutable IPFS data; one follow-up
    // update gives PKC a chance to load mutable community data such as replies.
    const shouldRequestSparseCommentFollowup = (commentCid, comment) => !sparseCommentFollowupRequested[commentCid] &&
        (stopCommentAfterNextUpdate[commentCid] || hasCommentAutoUpdateSubscribers(commentCid)) &&
        isSparseCommentUpdate(comment);
    const shouldWaitForSparseCommentFollowup = (commentCid, comment) => sparseCommentFollowupRequested[commentCid] && isSparseCommentUpdate(comment);
    const initializeComment = (commentCid, comment, account) => {
        var _a, _b, _c, _d;
        if (initializedComments.has(comment)) {
            liveComments[commentCid] = comment;
            return;
        }
        initializedComments.add(comment);
        liveComments[commentCid] = comment;
        (_a = comment === null || comment === void 0 ? void 0 : comment.on) === null || _a === void 0 ? void 0 : _a.call(comment, "update", (updatedComment) => __awaiter(void 0, void 0, void 0, function* () {
            updatedComment = normalizeCommentCommunityAddress(utils.clone(updatedComment));
            yield persistComment(commentCid, updatedComment);
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
            if (updatingState === "succeeded" || updatingState === "failed") {
                maybeStopCommentAfterOneShotUpdate(commentCid, comment);
            }
        });
        (_c = comment === null || comment === void 0 ? void 0 : comment.on) === null || _c === void 0 ? void 0 : _c.call(comment, "error", (error) => {
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
    const ensureLiveComment = (commentCid, account, commentData) => __awaiter(void 0, void 0, void 0, function* () {
        if (liveComments[commentCid]) {
            return liveComments[commentCid];
        }
        if (liveCommentPromises[commentCid]) {
            return liveCommentPromises[commentCid];
        }
        const liveCommentPromise = (() => __awaiter(void 0, void 0, void 0, function* () {
            const initialComment = normalizeCommentCommunityAddress(mergeCommentData(commentCid, commentData));
            const liveComment = normalizeCommentCommunityAddress(yield account.pkc.createComment(initialComment));
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
        (_a = comment === null || comment === void 0 ? void 0 : comment.update) === null || _a === void 0 ? void 0 : _a.call(comment).catch((error) => {
            const updateError = handleCommentUpdateError(commentCid, comment, error);
            log.trace("comment.update error", { commentCid, comment, error: updateError });
        });
    };
    const waitForCommentUpdateCycle = (commentCid, comment) => new Promise((resolve, reject) => {
        var _a, _b;
        const onUpdatingStateChange = (updatingState) => {
            var _a;
            if (updatingState === "succeeded") {
                if (shouldWaitForSparseCommentFollowup(commentCid, comment)) {
                    return;
                }
                cleanup();
                resolve(normalizeCommentCommunityAddress(utils.clone(comment)));
                return;
            }
            if (updatingState === "failed") {
                cleanup();
                reject(((_a = getState().errors[commentCid]) === null || _a === void 0 ? void 0 : _a.slice(-1)[0]) || Error("comment update failed"));
            }
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const cleanup = () => {
            removeCommentListener(comment, "updatingstatechange", onUpdatingStateChange);
            removeCommentListener(comment, "error", onError);
        };
        (_a = comment === null || comment === void 0 ? void 0 : comment.on) === null || _a === void 0 ? void 0 : _a.call(comment, "updatingstatechange", onUpdatingStateChange);
        (_b = comment === null || comment === void 0 ? void 0 : comment.on) === null || _b === void 0 ? void 0 : _b.call(comment, "error", onError);
    });
    return {
        comments: {},
        errors: {},
        addCommentToStore(commentCid, account, commentData) {
            return __awaiter(this, void 0, void 0, function* () {
                const { comments } = getState();
                const pendingKey = commentCid + account.id;
                // comment is in store already, do nothing
                let comment = comments[commentCid];
                if (comment || pkcGetCommentPending[pendingKey]) {
                    return;
                }
                pkcGetCommentPending[pendingKey] = true;
                try {
                    // try to find comment in database
                    comment = yield getCommentFromDatabase(commentCid, account, commentData);
                    if (!comment) {
                        comment = yield ensureLiveComment(commentCid, account, commentData);
                        comment = normalizeCommentCommunityAddress(comment);
                        log("commentsStore.addCommentToStore", { commentCid, comment, account });
                        setState((state) => ({
                            comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: utils.clone(comment) }),
                        }));
                    }
                    else {
                        comment = normalizeCommentCommunityAddress(comment);
                        setState((state) => ({
                            comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: utils.clone(comment) }),
                        }));
                        // add comment replies pages to repliesPagesStore so they can be used in useComment
                        repliesPagesStore.getState().addRepliesPageCommentsToStore(comment);
                        comment = yield ensureLiveComment(commentCid, account, mergeCommentData(commentCid, comment, commentData));
                    }
                    if (comment) {
                        requestCommentUpdate(commentCid, comment, { stopAfterNextUpdate: true });
                    }
                }
                catch (e) {
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
                if (hasCommentAutoUpdateSubscribers(commentCid)) {
                    return;
                }
                delete stopCommentAfterNextUpdate[commentCid];
                const liveComment = liveComments[commentCid];
                yield stopLiveComment(commentCid, liveComment);
                maybeReleaseStoppedLiveComment(commentCid, liveComment);
            });
        },
        refreshComment(commentCid, account, commentData) {
            return __awaiter(this, void 0, void 0, function* () {
                const storedComment = getState().comments[commentCid];
                const liveComment = yield ensureLiveComment(commentCid, account, mergeCommentData(commentCid, storedComment, commentData));
                if (!hasCommentAutoUpdateSubscribers(commentCid) &&
                    (liveComment === null || liveComment === void 0 ? void 0 : liveComment.updatingState) !== "stopped") {
                    yield stopLiveComment(commentCid, liveComment);
                }
                const waitForUpdate = waitForCommentUpdateCycle(commentCid, liveComment);
                requestCommentUpdate(commentCid, liveComment, {
                    stopAfterNextUpdate: !hasCommentAutoUpdateSubscribers(commentCid),
                });
                return waitForUpdate;
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
// reset store in between tests
const originalState = commentsStore.getState();
// async function because some stores have async init
export const resetCommentsStore = () => __awaiter(void 0, void 0, void 0, function* () {
    pkcGetCommentPending = {};
    for (const commentCid in commentAutoUpdateSubscribers) {
        delete commentAutoUpdateSubscribers[commentCid];
    }
    for (const commentCid in stopCommentAfterNextUpdate) {
        delete stopCommentAfterNextUpdate[commentCid];
    }
    for (const commentCid in sparseCommentFollowupRequested) {
        delete sparseCommentFollowupRequested[commentCid];
    }
    for (const commentCid in liveCommentPromises) {
        delete liveCommentPromises[commentCid];
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