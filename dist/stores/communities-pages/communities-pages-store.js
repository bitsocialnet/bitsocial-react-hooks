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
// include communities pages store with feeds for debugging
export const log = Logger("bitsocial-react-hooks:feeds:stores");
import accountsStore from "../accounts/index.js";
import communitiesStore from "../communities/index.js";
import localForageLru from "../../lib/localforage-lru/index.js";
import createStore from "zustand";
import assert from "assert";
import { createPkcCommunity, getPkcCreateCommunity, normalizeCommentCommunityAddress, } from "../../lib/pkc-compat.js";
import { resolvePostSortType } from "../../lib/page-sorts.js";
const communitiesPagesDatabase = localForageLru.createInstance({
    name: "bitsocialReactHooks-communitiesPages",
    size: 500,
});
const getCommunityPageStoreKey = (pageCid, pageType, accountId) => {
    if (pageType === "modQueue") {
        assert(accountId && typeof accountId === "string", `getCommunityPageStoreKey accountId '${accountId}' invalid for modQueue`);
        return `${accountId}:${pageCid}`;
    }
    return pageCid;
};
/** Freshness for comparison: max(updatedAt, timestamp, 0). Used to decide add vs replace per CID. Exported for coverage. */
export const getCommentFreshness = (comment) => { var _a, _b; return Math.max((_a = comment === null || comment === void 0 ? void 0 : comment.updatedAt) !== null && _a !== void 0 ? _a : 0, (_b = comment === null || comment === void 0 ? void 0 : comment.timestamp) !== null && _b !== void 0 ? _b : 0, 0); };
// reset all event listeners in between tests
const listeners = [];
const communitiesPagesStore = createStore((setState, getState) => ({
    // TODO: eventually clear old pages and comments from memory
    communitiesPages: {},
    comments: {},
    addNextCommunityPageToStore: (community, sortType, account, modQueue) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        assert((community === null || community === void 0 ? void 0 : community.address) && typeof (community === null || community === void 0 ? void 0 : community.address) === "string", `communitiesPagesStore.addNextCommunityPageToStore community '${community}' invalid`);
        assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `communitiesPagesStore.addNextCommunityPageToStore sortType '${sortType}' invalid`);
        assert(typeof getPkcCreateCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `communitiesPagesStore.addNextCommunityPageToStore account '${account}' invalid`);
        assert(!modQueue || Array.isArray(modQueue), `communitiesPagesStore.addNextCommunityPageToStore modQueue '${modQueue}' invalid`);
        let pageType = "posts";
        if (modQueue === null || modQueue === void 0 ? void 0 : modQueue[0]) {
            // TODO: allow multiple modQueue at once, fow now only use first in array
            // TODO: fix 'sortType' is not accurate variable name when pageType is 'modQueue'
            sortType = modQueue[0];
            pageType = "modQueue";
        }
        // check the preloaded posts on community.posts.pages first, then the community.posts.pageCids
        const communityFirstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
        if (!communityFirstPageCid) {
            log(`communitiesPagesStore.addNextCommunityPageToStore community '${community === null || community === void 0 ? void 0 : community.address}' sortType '${sortType}' no communityFirstPageCid`);
            return;
        }
        // all communities pages in store
        const { communitiesPages } = getState();
        // only specific pages of the community+sortType
        const communityPages = getCommunityPages(community, sortType, communitiesPages, pageType, account.id);
        // if no pages exist yet, add the first page
        let pageCidToAdd;
        if (!communityPages.length) {
            pageCidToAdd = communityFirstPageCid;
        }
        else {
            const nextCid = (_a = communityPages[communityPages.length - 1]) === null || _a === void 0 ? void 0 : _a.nextCid;
            // if last nextCid is undefined, reached end of pages
            if (!nextCid) {
                log.trace("communitiesPagesStore.addNextCommunityPageToStore no more pages", {
                    communityAddress: community.address,
                    sortType,
                    account,
                });
                return;
            }
            pageCidToAdd = nextCid;
        }
        // page is already added or pending
        const pageStoreKeyToAdd = getCommunityPageStoreKey(pageCidToAdd, pageType, account.id);
        if (communitiesPages[pageStoreKeyToAdd] || fetchPagePending[pageStoreKeyToAdd]) {
            return;
        }
        fetchPagePending[pageStoreKeyToAdd] = true;
        let page;
        try {
            page = yield fetchPage(pageCidToAdd, community.address, account, pageType);
            log.trace("communitiesPagesStore.addNextCommunityPageToStore community.posts.getPage", {
                pageCid: pageCidToAdd,
                communityAddress: community.address,
                account,
            });
        }
        catch (e) {
            throw e;
        }
        finally {
            fetchPagePending[pageStoreKeyToAdd] = false;
        }
        // find new comments in the page
        const flattenedComments = utils.flattenCommentsPages(page);
        const { comments } = getState();
        let hasNewComments = false;
        const newComments = {};
        if (pageType !== "modQueue") {
            for (const comment of flattenedComments) {
                const normalizedComment = normalizeCommentCommunityAddress(comment);
                const existing = comments[normalizedComment.cid];
                if (normalizedComment.cid &&
                    (!existing || getCommentFreshness(normalizedComment) > getCommentFreshness(existing))) {
                    // don't clone the comment to save memory, comments remain a pointer to the page object
                    newComments[normalizedComment.cid] = normalizedComment;
                    hasNewComments = true;
                }
            }
        }
        setState(({ communitiesPages, comments }) => {
            const newState = {
                communitiesPages: Object.assign(Object.assign({}, communitiesPages), { [pageStoreKeyToAdd]: page }),
            };
            if (hasNewComments) {
                newState.comments = Object.assign(Object.assign({}, comments), newComments);
            }
            return newState;
        });
        log("communitiesPagesStore.addNextCommunityPageToStore", {
            pageCid: pageCidToAdd,
            communityAddress: community.address,
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
                .accountsActionsInternal.addCidToAccountComment(normalizeCommentCommunityAddress(comment))
                .catch((error) => log.error("communitiesPagesStore.addNextCommunityPageToStore addCidToAccountComment error", { comment, error }));
        }
    }),
    invalidateCommunityPages: (community, sortType, modQueue, accountId) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        assert((community === null || community === void 0 ? void 0 : community.address) && typeof (community === null || community === void 0 ? void 0 : community.address) === "string", `communitiesPagesStore.invalidateCommunityPages community '${community}' invalid`);
        assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `communitiesPagesStore.invalidateCommunityPages sortType '${sortType}' invalid`);
        assert(!modQueue || Array.isArray(modQueue), `communitiesPagesStore.invalidateCommunityPages modQueue '${modQueue}' invalid`);
        let pageType = "posts";
        if (modQueue === null || modQueue === void 0 ? void 0 : modQueue[0]) {
            // TODO: allow multiple modQueue at once, for now only use first in array
            // TODO: fix 'sortType' is not accurate variable name when pageType is 'modQueue'
            sortType = modQueue[0];
            pageType = "modQueue";
        }
        const firstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
        if (!firstPageCid) {
            return;
        }
        const { communitiesPages } = getState();
        const firstPageKey = getCommunityPageStoreKey(firstPageCid, pageType, accountId);
        const pageKeysToInvalidate = new Set([firstPageKey]);
        let nextPageCid = (_a = communitiesPages[firstPageKey]) === null || _a === void 0 ? void 0 : _a.nextCid;
        while (nextPageCid) {
            const nextPageKey = getCommunityPageStoreKey(nextPageCid, pageType, accountId);
            pageKeysToInvalidate.add(nextPageKey);
            nextPageCid = (_b = communitiesPages[nextPageKey]) === null || _b === void 0 ? void 0 : _b.nextCid;
        }
        yield Promise.all([...pageKeysToInvalidate].map((pageKey) => communitiesPagesDatabase.removeItem(pageKey)));
        setState(({ communitiesPages }) => {
            const nextCommunitiesPages = Object.assign({}, communitiesPages);
            for (const pageKey of pageKeysToInvalidate) {
                delete nextCommunitiesPages[pageKey];
            }
            return { communitiesPages: nextCommunitiesPages };
        });
    }),
    // communities contain preloaded pages, those page comments must be added separately
    addCommunityPageCommentsToStore: (community) => {
        var _a;
        if (!((_a = community.posts) === null || _a === void 0 ? void 0 : _a.pages)) {
            return;
        }
        // find new comments in the page
        const flattenedComments = utils.flattenCommentsPages(community.posts.pages);
        const { comments } = getState();
        let hasNewComments = false;
        const newComments = {};
        for (const comment of flattenedComments) {
            const existing = comments[comment.cid];
            if (comment.cid &&
                (!existing || getCommentFreshness(comment) > getCommentFreshness(existing))) {
                // don't clone the comment to save memory, comments remain a pointer to the page object
                newComments[comment.cid] = comment;
                hasNewComments = true;
            }
        }
        if (!hasNewComments) {
            return;
        }
        setState(({ comments }) => {
            return { comments: Object.assign(Object.assign({}, comments), newComments) };
        });
        log("communitiesPagesStore.addCommunityPageCommentsToStore", { community, newComments });
    },
}));
// set clients states on communities store so the frontend can display it, dont persist in db because a reload cancels updating
const onCommunityPostsClientsStateChange = (communityAddress) => (clientState, clientType, sortType, clientUrl) => {
    communitiesStore.setState((state) => {
        // make sure not undefined, sometimes happens in e2e tests
        if (!state.communities[communityAddress]) {
            return {};
        }
        const client = { state: clientState };
        const community = Object.assign({}, state.communities[communityAddress]);
        community.posts = Object.assign({}, community.posts);
        community.posts.clients = Object.assign({}, community.posts.clients);
        community.posts.clients[clientType] = Object.assign({}, community.posts.clients[clientType]);
        community.posts.clients[clientType][sortType] = Object.assign({}, community.posts.clients[clientType][sortType]);
        community.posts.clients[clientType][sortType][clientUrl] = client;
        return { communities: Object.assign(Object.assign({}, state.communities), { [community.address]: community }) };
    });
};
const fetchPageCommunities = {}; // cache created community clients per account because creating them can be slow
let fetchPagePending = {};
const fetchPage = (pageCid, communityAddress, account, pageType) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // community page is cached
    const pageStoreKey = getCommunityPageStoreKey(pageCid, pageType, account.id);
    const cachedCommunityPage = yield communitiesPagesDatabase.getItem(pageStoreKey);
    if (cachedCommunityPage) {
        return cachedCommunityPage;
    }
    if (!fetchPageCommunities[account.id] || fetchPageCommunities[account.id].pkc !== account.pkc) {
        fetchPageCommunities[account.id] = { pkc: account.pkc, communities: {} };
    }
    const accountCommunities = fetchPageCommunities[account.id].communities;
    if (!accountCommunities[communityAddress]) {
        accountCommunities[communityAddress] = yield createPkcCommunity(account.pkc, {
            address: communityAddress,
        });
        listeners.push(accountCommunities[communityAddress]);
        // set clients states on communities store so the frontend can display it
        utils.pageClientsOnStateChange((_a = accountCommunities[communityAddress][pageType]) === null || _a === void 0 ? void 0 : _a.clients, onCommunityPostsClientsStateChange(communityAddress));
    }
    const onError = (error) => log.error(`communitiesPagesStore community '${communityAddress}' failed community.posts.getPage page cid '${pageCid}':`, error);
    const fetchedCommunityPage = yield utils.retryInfinity(() => accountCommunities[communityAddress][pageType].getPage({ cid: pageCid }), { onError });
    yield communitiesPagesDatabase.setItem(pageStoreKey, utils.clone(fetchedCommunityPage));
    return fetchedCommunityPage;
});
/**
 * Util function to get all pages in the store for a
 * specific community+sortType using `CommunityPage.nextCid`
 */
export const getCommunityPages = (community, sortType, communitiesPages, pageType, accountId) => {
    var _a;
    assert(communitiesPages && typeof communitiesPages === "object", `getCommunityPages communitiesPages '${communitiesPages}' invalid`);
    const pages = [];
    const firstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
    // community has no pages
    // TODO: if a loaded community doesn't have a first page, it's unclear what we should do
    // should we try to use another sort type by default, like 'hot', or should we just ignore it?
    // 'return pages' to ignore it for now
    if (!firstPageCid) {
        return pages;
    }
    const firstPage = communitiesPages[getCommunityPageStoreKey(firstPageCid, pageType, accountId)];
    if (!firstPage) {
        return pages;
    }
    pages.push(firstPage);
    while (true) {
        const nextCid = (_a = pages[pages.length - 1]) === null || _a === void 0 ? void 0 : _a.nextCid;
        const nextPageKey = nextCid && getCommunityPageStoreKey(nextCid, pageType, accountId);
        const communityPage = nextPageKey && communitiesPages[nextPageKey];
        if (!communityPage) {
            return pages;
        }
        pages.push(communityPage);
    }
};
export const getCommunityFirstPageCid = (community, sortType, pageType = "posts") => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    assert(community && typeof community === "object", `getCommunityFirstPageCid community '${community}' invalid`);
    assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `getCommunityFirstPageCid sortType '${sortType}' invalid`);
    const resolvedSortType = pageType === "posts" ? resolvePostSortType(community, sortType) : sortType;
    if (!resolvedSortType) {
        return;
    }
    // community has preloaded posts for sort type
    if ((_c = (_b = (_a = community[pageType]) === null || _a === void 0 ? void 0 : _a.pages) === null || _b === void 0 ? void 0 : _b[resolvedSortType]) === null || _c === void 0 ? void 0 : _c.comments) {
        return (_f = (_e = (_d = community[pageType]) === null || _d === void 0 ? void 0 : _d.pages) === null || _e === void 0 ? void 0 : _e[resolvedSortType]) === null || _f === void 0 ? void 0 : _f.nextCid;
    }
    return (_h = (_g = community[pageType]) === null || _g === void 0 ? void 0 : _g.pageCids) === null || _h === void 0 ? void 0 : _h[resolvedSortType];
    // TODO: if a loaded community doesn't have a first page, it's unclear what we should do
    // should we try to use another sort type by default, like 'hot', or should we just ignore it?
};
// reset store in between tests
const originalState = communitiesPagesStore.getState();
// async function because some stores have async init
export const resetCommunitiesPagesStore = () => __awaiter(void 0, void 0, void 0, function* () {
    fetchPagePending = {};
    for (const accountId in fetchPageCommunities) {
        delete fetchPageCommunities[accountId];
    }
    // remove all event listeners
    listeners.forEach((listener) => listener.removeAllListeners());
    listeners.length = 0;
    // destroy all component subscriptions to the store
    communitiesPagesStore.destroy();
    // restore original state
    communitiesPagesStore.setState(originalState);
});
// reset database and store in between tests
export const resetCommunitiesPagesDatabaseAndStore = () => __awaiter(void 0, void 0, void 0, function* () {
    yield localForageLru.createInstance({ name: "bitsocialReactHooks-communitiesPages" }).clear();
    yield resetCommunitiesPagesStore();
});
export default communitiesPagesStore;
//# sourceMappingURL=communities-pages-store.js.map