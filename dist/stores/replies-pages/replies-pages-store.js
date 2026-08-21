var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import utils from "../../lib/utils/index.js";
import Logger from "@pkcprotocol/pkc-logger";
// include replies pages store with feeds for debugging
export const log = Logger("bitsocial-react-hooks:replies:stores");
import accountsStore from "../accounts/index.js";
import commentsStore from "../comments/index.js";
import { addChildrenRepliesFeedsToAddToStore } from "./utils.js";
import localForageLru from "../../lib/localforage-lru/index.js";
import createStore from "zustand";
import assert from "assert";
import { resolveReplySortType } from "../../lib/page-sorts.js";
const repliesPagesDatabase = localForageLru.createInstance({
    name: "bitsocialReactHooks-repliesPages",
    size: 500,
});
// reset all event listeners in between tests
const listeners = [];
const repliesPagesStore = createStore((setState, getState) => ({
    // TODO: eventually clear old pages and comments from memory
    repliesPages: {},
    comments: {},
    addNextRepliesPageToStore: (comment, sortType, account) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        assert((comment === null || comment === void 0 ? void 0 : comment.cid) && typeof (comment === null || comment === void 0 ? void 0 : comment.cid) === "string", `repliesPagesStore.addNextRepliesPageToStore comment '${comment}' invalid`);
        assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `repliesPagesStore.addNextRepliesPageToStore sortType '${sortType}' invalid`);
        const resolvedSortType = resolveReplySortType(comment, sortType);
        if (!resolvedSortType) {
            return;
        }
        sortType = resolvedSortType;
        assert(typeof ((_a = account === null || account === void 0 ? void 0 : account.pkc) === null || _a === void 0 ? void 0 : _a.createComment) === "function", `repliesPagesStore.addNextRepliesPageToStore account '${account}' invalid`);
        // check the preloaded replies on comment.replies.pages first, then the comment.replies.pageCids
        const repliesFirstPageCid = getRepliesFirstPageCid(comment, sortType);
        if (!repliesFirstPageCid) {
            log(`repliesPagesStore.addNextRepliesPageToStore comment '${comment === null || comment === void 0 ? void 0 : comment.cid}' sortType '${sortType}' no repliesFirstPageCid`);
            return;
        }
        // all replies pages in store
        const repliesPagesStore = getState();
        // only specific pages of the comment+sortType
        const repliesPages = getRepliesPages(comment, sortType, repliesPagesStore.repliesPages);
        // if no pages exist yet, add the first page
        let pageCidToAdd;
        if (!repliesPages.length) {
            pageCidToAdd = repliesFirstPageCid;
        }
        else {
            const nextCid = (_b = repliesPages[repliesPages.length - 1]) === null || _b === void 0 ? void 0 : _b.nextCid;
            // if last nextCid is undefined, reached end of pages
            if (!nextCid) {
                log.trace("repliesPagesStore.addNextRepliesPageToStore no more pages", {
                    commentCid: comment.cid,
                    sortType,
                    account,
                });
                return;
            }
            pageCidToAdd = nextCid;
        }
        // page is already added or pending
        if (repliesPagesStore.repliesPages[pageCidToAdd] ||
            fetchPagePending[account.id + pageCidToAdd]) {
            return;
        }
        fetchPagePending[account.id + pageCidToAdd] = true;
        let page;
        try {
            page = yield fetchPage(pageCidToAdd, comment, account);
            log.trace("repliesPagesStore.addNextRepliesPageToStore comment.replies.getPage", {
                pageCid: pageCidToAdd,
                page,
                commentCid: comment.cid,
                communityAddress: comment.communityAddress,
                account,
            });
        }
        catch (e) {
            throw e;
        }
        finally {
            fetchPagePending[account.id + pageCidToAdd] = false;
        }
        // find new comments in the page (missing-or-fresher: insert when absent or incoming is fresher)
        const flattenedComments = utils.flattenCommentsPages(page);
        const { comments } = getState();
        let hasNewComments = false;
        const newComments = {};
        for (const comment of flattenedComments) {
            if (!comment.cid)
                continue;
            const existing = comments[comment.cid];
            const incomingFresh = Math.max(comment.updatedAt || 0, comment.timestamp || 0, 0);
            const existingFresh = existing
                ? Math.max(existing.updatedAt || 0, existing.timestamp || 0, 0)
                : -1;
            if (!existing || incomingFresh > existingFresh) {
                // don't clone the comment to save memory, comments remain a pointer to the page object
                newComments[comment.cid] = comment;
                hasNewComments = true;
            }
        }
        // add missing children replies feeds
        addChildrenRepliesFeedsToAddToStore(page, comment);
        setState(({ repliesPages, comments }) => {
            const newState = { repliesPages: Object.assign(Object.assign({}, repliesPages), { [pageCidToAdd]: page }) };
            if (hasNewComments) {
                newState.comments = Object.assign(Object.assign({}, comments), newComments);
            }
            return newState;
        });
        log("repliesPagesStore.addNextRepliesPageToStore", {
            pageCid: pageCidToAdd,
            commentCid: comment.cid,
            sortType,
            page,
            account,
        });
        // when publishing a comment, you don't yet know its CID
        // so when a new comment is fetched, check to see if it's your own
        // comment, and if yes, add the CID to your account comments database
        for (const comment of flattenedComments) {
            accountsStore
                .getState()
                .accountsActionsInternal.addCidToAccountComment(comment)
                .catch((error) => log.error("repliesPagesStore.addNextRepliesPageToStore addCidToAccountComment error", {
                comment,
                error,
            }));
        }
    }),
    // comments contain preloaded pages, those page comments must be added separately
    addRepliesPageCommentsToStore: (comment) => {
        var _a;
        if (!((_a = comment.replies) === null || _a === void 0 ? void 0 : _a.pages)) {
            return;
        }
        // find new comments in the page (missing-or-fresher: insert when absent or incoming is fresher)
        const flattenedComments = utils.flattenCommentsPages(comment.replies.pages);
        const { comments } = getState();
        let hasNewComments = false;
        const newComments = {};
        for (const c of flattenedComments) {
            if (!c.cid)
                continue;
            const existing = comments[c.cid];
            const incomingFresh = Math.max(c.updatedAt || 0, c.timestamp || 0, 0);
            const existingFresh = existing
                ? Math.max(existing.updatedAt || 0, existing.timestamp || 0, 0)
                : -1;
            if (!existing || incomingFresh > existingFresh) {
                // don't clone the comment to save memory, comments remain a pointer to the page object
                newComments[c.cid] = c;
                hasNewComments = true;
            }
        }
        if (!hasNewComments) {
            return;
        }
        setState(({ comments }) => {
            return { comments: Object.assign(Object.assign({}, comments), newComments) };
        });
        log("repliesPagesStore.addRepliesPageCommentsToStore", { comment, newComments });
    },
}));
// set clients states on comments store so the frontend can display it, dont persist in db because a reload cancels updating
const onCommentRepliesClientsStateChange = (commentCid) => (clientState, clientType, sortType, clientUrl) => {
    commentsStore.setState((state) => {
        // make sure not undefined, sometimes happens in e2e tests
        if (!state.comments[commentCid]) {
            return {};
        }
        const client = { state: clientState };
        const comment = Object.assign({}, state.comments[commentCid]);
        comment.replies = Object.assign({}, comment.replies);
        comment.replies.clients = Object.assign({}, comment.replies.clients);
        comment.replies.clients[clientType] = Object.assign({}, comment.replies.clients[clientType]);
        comment.replies.clients[clientType][sortType] = Object.assign({}, comment.replies.clients[clientType][sortType]);
        comment.replies.clients[clientType][sortType][clientUrl] = client;
        return { comments: Object.assign(Object.assign({}, state.comments), { [commentCid]: comment }) };
    });
};
const fetchPageComments = {}; // cache pkc.createComment because sometimes it's slow
let fetchPagePending = {};
const fetchPage = (pageCid, comment, account) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // replies page is cached
    const cachedRepliesPage = yield repliesPagesDatabase.getItem(pageCid);
    if (cachedRepliesPage) {
        return cachedRepliesPage;
    }
    if (!fetchPageComments[comment.cid]) {
        fetchPageComments[comment.cid] = yield account.pkc.createComment({
            cid: comment.cid,
            postCid: comment.postCid,
            communityAddress: comment.communityAddress,
            depth: comment.depth,
        });
        listeners.push(fetchPageComments[comment.cid]);
        // set clients states on communities store so the frontend can display it
        utils.pageClientsOnStateChange((_a = fetchPageComments[comment.cid].replies) === null || _a === void 0 ? void 0 : _a.clients, onCommentRepliesClientsStateChange(comment.cid));
    }
    const onError = (error) => log.error(`repliesPagesStore comment '${comment.cid}' failed comment.replies.getPage page cid '${pageCid}':`, error);
    const fetchedRepliesPage = yield utils.retryInfinity(() => fetchPageComments[comment.cid].replies.getPage({ cid: pageCid }), { onError });
    yield repliesPagesDatabase.setItem(pageCid, utils.clone(fetchedRepliesPage));
    return fetchedRepliesPage;
});
/**
 * Util function to get all pages in the store for a
 * specific comment+sortType using `RepliesPage.nextCid`
 */
export const getRepliesPages = (comment, sortType, repliesPages) => {
    var _a;
    assert(repliesPages && typeof repliesPages === "object", `getRepliesPages repliesPages '${repliesPages}' invalid`);
    const pages = [];
    const firstPageCid = getRepliesFirstPageCid(comment, sortType);
    // comment has no pages
    // TODO: if a loaded comment doesn't have a first page, it's unclear what we should do
    // should we try to use another sort type by default, like 'best', or should we just ignore it?
    // 'return pages' to ignore it for now
    if (!firstPageCid) {
        return pages;
    }
    const firstPage = repliesPages[firstPageCid];
    if (!firstPage) {
        return pages;
    }
    pages.push(firstPage);
    while (true) {
        const nextCid = (_a = pages[pages.length - 1]) === null || _a === void 0 ? void 0 : _a.nextCid;
        const repliesPage = nextCid && repliesPages[nextCid];
        if (!repliesPage) {
            return pages;
        }
        pages.push(repliesPage);
    }
};
export const getRepliesFirstPageCid = (comment, sortType) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    assert(comment === null || comment === void 0 ? void 0 : comment.cid, `getRepliesFirstPageCid comment '${comment}' invalid`);
    assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `getRepliesFirstPageCid sortType '${sortType}' invalid`);
    const resolvedSortType = resolveReplySortType(comment, sortType);
    if (!resolvedSortType) {
        return;
    }
    // comment has preloaded replies for sort type
    if ((_c = (_b = (_a = comment.replies) === null || _a === void 0 ? void 0 : _a.pages) === null || _b === void 0 ? void 0 : _b[resolvedSortType]) === null || _c === void 0 ? void 0 : _c.comments) {
        return (_f = (_e = (_d = comment.replies) === null || _d === void 0 ? void 0 : _d.pages) === null || _e === void 0 ? void 0 : _e[resolvedSortType]) === null || _f === void 0 ? void 0 : _f.nextCid;
    }
    return (_h = (_g = comment.replies) === null || _g === void 0 ? void 0 : _g.pageCids) === null || _h === void 0 ? void 0 : _h[resolvedSortType];
    // TODO: if a loaded comment doesn't have a first page, it's unclear what we should do
    // should we try to use another sort type by default, like 'best', or should we just ignore it?
};
// reset store in between tests
const originalState = repliesPagesStore.getState();
// async function because some stores have async init
export const resetRepliesPagesStore = () => __awaiter(void 0, void 0, void 0, function* () {
    fetchPagePending = {};
    // remove all event listeners
    listeners.forEach((listener) => listener.removeAllListeners());
    // destroy all component subscriptions to the store
    repliesPagesStore.destroy();
    // restore original state
    repliesPagesStore.setState(originalState);
});
// reset database and store in between tests
export const resetRepliesPagesDatabaseAndStore = () => __awaiter(void 0, void 0, void 0, function* () {
    yield localForageLru.createInstance({ name: "bitsocialReactHooks-repliesPages" }).clear();
    yield resetRepliesPagesStore();
});
export default repliesPagesStore;
//# sourceMappingURL=replies-pages-store.js.map