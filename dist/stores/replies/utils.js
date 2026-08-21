var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { getRepliesPages, getRepliesFirstPageCid } from "../replies-pages/index.js";
import repliesSorter from "../feeds/feed-sorter.js";
import accountsStore from "../accounts/index.js";
import { flattenCommentsPages, commentIsValid, removeInvalidComments } from "../../lib/utils/index.js";
import { areEquivalentCommunityAddresses } from "../../lib/community-address.js";
import Logger from "@pkcprotocol/pkc-logger";
import { resolveReplySortType } from "../../lib/page-sorts.js";
const log = Logger("bitsocial-react-hooks:replies:stores");
/**
 * Calculate the feeds from all the loaded replies pages, filter and sort them
 */
export const getFilteredSortedFeeds = (feedsOptions, comments, repliesPages, accounts) => {
    // calculate each feed
    let feeds = {};
    for (const feedName in feedsOptions) {
        const { commentCid, sortType: requestedSortType, accountId, filter, flat, } = feedsOptions[feedName];
        // find all fetched replies
        let bufferedFeedReplies = [];
        const comment = comments[commentCid];
        const sortType = getSortTypeFromComment(comment, feedsOptions[feedName]);
        const requestedSortIsUnavailable = requestedSortType !== undefined && sortType === undefined;
        // comment has loaded and cache not expired
        if (comment && !requestedSortIsUnavailable) {
            // use comment preloaded replies if any
            const preloadedReplies = getPreloadedReplies(comment, sortType);
            if (preloadedReplies) {
                for (const reply of preloadedReplies) {
                    // replies are manually validated, could have fake communityAddress
                    if (!areEquivalentCommunityAddresses(reply.communityAddress, comment.communityAddress)) {
                        break;
                    }
                    bufferedFeedReplies.push(reply);
                }
            }
            // add all replies from comment replies pages
            const _repliesPages = getRepliesPages(comment, sortType, repliesPages);
            for (const repliesPage of _repliesPages) {
                if (repliesPage === null || repliesPage === void 0 ? void 0 : repliesPage.comments) {
                    for (const reply of repliesPage.comments) {
                        // replies are manually validated, could have fake communityAddress
                        if (!areEquivalentCommunityAddresses(reply.communityAddress, comment.communityAddress)) {
                            break;
                        }
                        bufferedFeedReplies.push(reply);
                    }
                }
            }
        }
        if (flat) {
            bufferedFeedReplies = flattenCommentsPages({ comments: bufferedFeedReplies });
        }
        // sort the feed before filtering to get more accurate results
        const sortedBufferedFeedReplies = repliesSorter.sort(sortType, bufferedFeedReplies);
        // filter the feed
        const filteredSortedBufferedFeedReplies = [];
        for (const reply of sortedBufferedFeedReplies) {
            // TODO: maybe skip if comment community address, comment cid or comment author is blocked?
            // feedOptions filter function
            if (filter && !filter.filter(reply)) {
                continue;
            }
            filteredSortedBufferedFeedReplies.push(reply);
        }
        feeds[feedName] = filteredSortedBufferedFeedReplies;
    }
    return feeds;
};
const getPreloadedReplies = (comment, sortType) => {
    var _a, _b, _c;
    const resolvedSortType = resolveReplySortType(comment, sortType);
    if (!resolvedSortType) {
        return;
    }
    return (_c = (_b = (_a = comment.replies) === null || _a === void 0 ? void 0 : _a.pages) === null || _b === void 0 ? void 0 : _b[resolvedSortType]) === null || _c === void 0 ? void 0 : _c.comments;
};
const previousPageNumbers = {};
const pageNumberIncreased = (feedName, pageNumber, loadedFeed, bufferedFeed) => {
    const isFirstPage = !loadedFeed && (bufferedFeed === null || bufferedFeed === void 0 ? void 0 : bufferedFeed.length);
    // first page should always update
    // pageNumber has changed should always update
    if (isFirstPage || previousPageNumbers[feedName] !== pageNumber) {
        previousPageNumbers[feedName] = pageNumber;
        return true;
    }
    return false;
};
const alwaysStreamPage = (feedOptions) => {
    // feedOptions.streamPage set to true means always stream page
    if (feedOptions.streamPage) {
        return true;
    }
    // always stream top level replies and/or flat
    return feedOptions.commentDepth > 0 && !feedOptions.flat ? false : true;
};
const getApprovalPublicationKey = (comment) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    return [
        (_a = comment.timestamp) !== null && _a !== void 0 ? _a : "",
        (_b = comment.parentCid) !== null && _b !== void 0 ? _b : "",
        (_c = comment.postCid) !== null && _c !== void 0 ? _c : "",
        (_d = comment.communityAddress) !== null && _d !== void 0 ? _d : "",
        (_f = (_e = comment.author) === null || _e === void 0 ? void 0 : _e.address) !== null && _f !== void 0 ? _f : "",
        (_g = comment.title) !== null && _g !== void 0 ? _g : "",
        (_h = comment.content) !== null && _h !== void 0 ? _h : "",
        (_j = comment.link) !== null && _j !== void 0 ? _j : "",
    ].join("\0");
};
const isPurgedAccountReply = (reply) => typeof (reply === null || reply === void 0 ? void 0 : reply.index) === "number" && !!reply.cid && reply.purged === true;
const canonicalFeedRefreshedAfterReply = (reply, feedUpdatedAt) => typeof feedUpdatedAt !== "number" ||
    typeof reply.timestamp !== "number" ||
    feedUpdatedAt > reply.timestamp;
const shouldHidePurgedAccountReply = (reply, hidePurgedAccountReplies, feedUpdatedAt) => hidePurgedAccountReplies &&
    isPurgedAccountReply(reply) &&
    canonicalFeedRefreshedAfterReply(reply, feedUpdatedAt);
export const getLoadedFeeds = (feedsOptions_1, loadedFeeds_1, bufferedFeeds_1, accounts_1, ...args_1) => __awaiter(void 0, [feedsOptions_1, loadedFeeds_1, bufferedFeeds_1, accounts_1, ...args_1], void 0, function* (feedsOptions, loadedFeeds, bufferedFeeds, accounts, options = {}) {
    var _a;
    const loadedFeedsMissingReplies = {};
    for (const feedName in feedsOptions) {
        const { pageNumber, repliesPerPage, accountId, streamPage } = feedsOptions[feedName];
        // TODO: fix design issue, pageNumber shouldnt be increased when loadMore is called and repliesPerPage not reached
        // if not always streaming replies, and page number didn't increase, skip updating
        // so UI isn't displaced when new nested replies are added
        if (!alwaysStreamPage(feedsOptions[feedName]) &&
            !pageNumberIncreased(feedName, pageNumber, loadedFeeds[feedName], bufferedFeeds[feedName])) {
            continue;
        }
        const pkc = (_a = accounts[accountId]) === null || _a === void 0 ? void 0 : _a.pkc;
        const loadedFeedReplyCount = pageNumber * repliesPerPage;
        const currentLoadedFeed = loadedFeeds[feedName] || [];
        // don't count account replies
        const missingRepliesCount = loadedFeedReplyCount - currentLoadedFeed.filter((reply) => reply.index === undefined).length;
        // get new replies from buffered feed
        const bufferedFeed = bufferedFeeds[feedName] || [];
        let missingReplies = [];
        for (const reply of bufferedFeed) {
            if (missingReplies.length >= missingRepliesCount) {
                missingReplies = yield removeInvalidComments(missingReplies, { validateReplies: false }, pkc);
                // only stop if there were no invalid comments
                if (missingReplies.length >= missingRepliesCount) {
                    break;
                }
            }
            missingReplies.push(reply);
        }
        // the current loaded feed already exist and doesn't need new replies
        if (missingReplies.length === 0 && loadedFeeds[feedName]) {
            continue;
        }
        loadedFeedsMissingReplies[feedName] = missingReplies;
    }
    let newLoadedFeeds = {};
    for (const feedName in loadedFeedsMissingReplies) {
        newLoadedFeeds[feedName] = [
            ...(loadedFeeds[feedName] || []),
            ...loadedFeedsMissingReplies[feedName],
        ];
    }
    // add account comments
    newLoadedFeeds = Object.assign(Object.assign({}, loadedFeeds), newLoadedFeeds);
    const accountCommentsChangedFeeds = options.addAccountComments === false
        ? false
        : addAccountsComments(feedsOptions, newLoadedFeeds, options.feedsHaveMore, options.feedsUpdatedAts);
    // do nothing if there are no missing replies
    if (Object.keys(loadedFeedsMissingReplies).length === 0 && !accountCommentsChangedFeeds) {
        return loadedFeeds;
    }
    return newLoadedFeeds;
});
export const addAccountsComments = (feedsOptions, loadedFeeds, feedsHaveMore, feedsUpdatedAts) => {
    let loadedFeedsChanged = false;
    const accountsComments = accountsStore.getState().accountsComments || {};
    for (const feedName in feedsOptions) {
        const { accountId, accountComments: accountCommentsOptions, commentCid, postCid, commentDepth, flat, } = feedsOptions[feedName];
        const { newerThan, append } = accountCommentsOptions || {};
        if (!newerThan) {
            continue;
        }
        const newerThanTimestamp = newerThan === Infinity ? 0 : Math.floor(Date.now() / 1000) - newerThan;
        const isNewerThan = (reply) => reply.timestamp > newerThanTimestamp;
        const hidePurgedAccountReplies = (feedsHaveMore === null || feedsHaveMore === void 0 ? void 0 : feedsHaveMore[feedName]) === false;
        const feedUpdatedAt = feedsUpdatedAts === null || feedsUpdatedAts === void 0 ? void 0 : feedsUpdatedAts[feedName];
        const accountComments = accountsComments[accountId] || [];
        const accountReplies = accountComments.filter((reply) => {
            if (shouldHidePurgedAccountReply(reply, hidePurgedAccountReplies, feedUpdatedAt)) {
                return false;
            }
            if (!isNewerThan(reply)) {
                return false;
            }
            if (flat) {
                // if flat, add all account replies with greater comment depth
                return reply.postCid === postCid && reply.depth > commentDepth;
            }
            return reply.parentCid === commentCid;
        });
        const validAccountIndices = new Set(accountReplies.map((r) => r.index));
        const accountCidToReply = new Map();
        for (const r of accountReplies) {
            if (r.cid)
                accountCidToReply.set(r.cid, r);
        }
        let loadedFeed = loadedFeeds[feedName] || [];
        const approvedPublicationKeys = new Set(loadedFeed
            .filter((reply) => reply.pendingApproval !== true)
            .map((reply) => getApprovalPublicationKey(reply)));
        // prune stale local-account entries and replace when cid matches but index changed
        const prunedLoadedFeed = [];
        for (const reply of loadedFeed) {
            if (reply.index === undefined) {
                prunedLoadedFeed.push(reply);
                continue;
            }
            if (shouldHidePurgedAccountReply(reply, hidePurgedAccountReplies, feedUpdatedAt)) {
                loadedFeedsChanged = true;
                continue;
            }
            if (reply.pendingApproval === true &&
                approvedPublicationKeys.has(getApprovalPublicationKey(reply))) {
                loadedFeedsChanged = true;
                continue;
            }
            if (reply.cid) {
                const freshAccountReply = accountCidToReply.get(reply.cid);
                if (freshAccountReply && freshAccountReply.index !== reply.index) {
                    prunedLoadedFeed.push(freshAccountReply);
                    loadedFeedsChanged = true;
                    continue;
                }
            }
            if (!validAccountIndices.has(reply.index)) {
                loadedFeedsChanged = true;
                continue;
            }
            prunedLoadedFeed.push(reply);
        }
        loadedFeed = loadedFeeds[feedName] = prunedLoadedFeed;
        if (!accountReplies.length) {
            continue;
        }
        // if a loaded comment doesn't have a cid, then it's pending
        // and pending account comments should always have unique timestamps
        const loadedFeedMap = new Map();
        loadedFeed.forEach((reply, loadedFeedIndex) => {
            if (reply.cid)
                loadedFeedMap.set(reply.cid, loadedFeedIndex);
            if (typeof reply.index === "number")
                loadedFeedMap.set(reply.index, loadedFeedIndex);
            if (!reply.cid)
                loadedFeedMap.set(reply.timestamp, loadedFeedIndex);
            if (reply.pendingApproval !== true) {
                loadedFeedMap.set(getApprovalPublicationKey(reply), loadedFeedIndex);
            }
        });
        for (const accountReply of accountReplies) {
            // account reply with cid already added
            if (accountReply.cid && loadedFeedMap.has(accountReply.cid)) {
                continue;
            }
            if (accountReply.pendingApproval === true &&
                loadedFeedMap.has(getApprovalPublicationKey(accountReply))) {
                continue;
            }
            // account reply without cid already added, but now we have the cid
            if (accountReply.cid && loadedFeedMap.has(accountReply.index)) {
                const loadedFeedIndex = loadedFeedMap.get(accountReply.index);
                // update the feed with the accountReply.cid now that we have it
                loadedFeed[loadedFeedIndex] = accountReply;
                loadedFeedsChanged = true;
                continue;
            }
            if (loadedFeedMap.has(accountReply.index)) {
                continue;
            }
            // pending account reply without cid already added
            if (!accountReply.cid && loadedFeedMap.has(accountReply.timestamp)) {
                continue;
            }
            if (append) {
                loadedFeed.push(accountReply);
            }
            else {
                loadedFeed.unshift(accountReply);
            }
            loadedFeedsChanged = true;
        }
    }
    return loadedFeedsChanged;
};
export const getBufferedFeedsWithoutLoadedFeeds = (bufferedFeeds, loadedFeeds) => {
    var _a, _b, _c, _d, _e;
    // contruct a list of replies already loaded to remove them from buffered feeds
    const loadedFeedsReplies = {};
    for (const feedName in loadedFeeds) {
        loadedFeedsReplies[feedName] = new Set();
        for (const reply of loadedFeeds[feedName]) {
            loadedFeedsReplies[feedName].add(reply.cid);
        }
    }
    const newBufferedFeeds = {};
    for (const feedName in bufferedFeeds) {
        newBufferedFeeds[feedName] = [];
        let bufferedFeedReplyChanged = false;
        for (const [i, reply] of bufferedFeeds[feedName].entries()) {
            if ((_a = loadedFeedsReplies[feedName]) === null || _a === void 0 ? void 0 : _a.has(reply.cid)) {
                continue;
            }
            newBufferedFeeds[feedName].push(reply);
            if (!bufferedFeedReplyChanged &&
                (((_b = newBufferedFeeds[feedName][i]) === null || _b === void 0 ? void 0 : _b.cid) !== ((_c = bufferedFeeds[feedName][i]) === null || _c === void 0 ? void 0 : _c.cid) ||
                    (((_d = newBufferedFeeds[feedName][i]) === null || _d === void 0 ? void 0 : _d.updatedAt) || 0) >
                        (((_e = bufferedFeeds[feedName][i]) === null || _e === void 0 ? void 0 : _e.updatedAt) || 0))) {
                bufferedFeedReplyChanged = true;
            }
        }
        if (!bufferedFeedReplyChanged &&
            newBufferedFeeds[feedName].length === bufferedFeeds[feedName].length) {
            newBufferedFeeds[feedName] = bufferedFeeds[feedName];
        }
    }
    return newBufferedFeeds;
};
export const getUpdatedFeeds = (feedsOptions, filteredSortedFeeds, updatedFeeds, loadedFeeds, accounts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const newUpdatedFeeds = Object.assign({}, updatedFeeds);
    const feedNames = new Set([
        ...Object.keys(filteredSortedFeeds || {}),
        ...Object.keys(loadedFeeds || {}),
        ...Object.keys(updatedFeeds || {}),
    ]);
    for (const feedName of feedNames) {
        const pkc = (_b = accounts[(_a = feedsOptions[feedName]) === null || _a === void 0 ? void 0 : _a.accountId]) === null || _b === void 0 ? void 0 : _b.pkc;
        const loadedFeed = loadedFeeds[feedName] || [];
        const previousUpdatedFeed = updatedFeeds[feedName] || [];
        const updatedFeed = [...loadedFeed];
        let updatedFeedChanged = false;
        // Keep updated feeds in lock-step with loaded feeds so local deletions
        // (e.g. abandoned pending replies) disappear without requiring a feed reset.
        if (previousUpdatedFeed.length !== updatedFeed.length) {
            updatedFeedChanged = true;
        }
        const filteredRepliesByCid = new Map();
        for (const reply of filteredSortedFeeds[feedName] || []) {
            if (reply === null || reply === void 0 ? void 0 : reply.cid) {
                filteredRepliesByCid.set(reply.cid, reply);
            }
        }
        for (let i = 0; i < updatedFeed.length; i++) {
            const loadedReply = updatedFeed[i];
            if (!(loadedReply === null || loadedReply === void 0 ? void 0 : loadedReply.cid)) {
                continue;
            }
            const previousUpdatedReply = previousUpdatedFeed[i];
            if ((previousUpdatedReply === null || previousUpdatedReply === void 0 ? void 0 : previousUpdatedReply.cid) === loadedReply.cid &&
                (previousUpdatedReply.updatedAt || 0) > (loadedReply.updatedAt || 0)) {
                updatedFeed[i] = previousUpdatedReply;
                updatedFeedChanged = true;
            }
            const candidateReply = filteredRepliesByCid.get(loadedReply.cid);
            if (!candidateReply) {
                continue;
            }
            if ((candidateReply.updatedAt || 0) <= (((_c = updatedFeed[i]) === null || _c === void 0 ? void 0 : _c.updatedAt) || 0)) {
                continue;
            }
            if (!(yield commentIsValid(candidateReply, { validateReplies: false }, pkc))) {
                continue;
            }
            updatedFeed[i] = candidateReply;
            updatedFeedChanged = true;
        }
        if (updatedFeedChanged) {
            newUpdatedFeeds[feedName] = updatedFeed;
            continue;
        }
        if (!updatedFeeds[feedName]) {
            newUpdatedFeeds[feedName] = updatedFeed;
        }
    }
    return newUpdatedFeeds;
});
// find how many replies are in each comments in a buffereds feeds
// NOTE: not useful, could use feed.length, copied over from useFeed and easier to keep it
export const getFeedsReplyCounts = (feedsOptions, feeds) => {
    var _a;
    const feedsReplyCounts = {};
    for (const feedName in feedsOptions) {
        feedsReplyCounts[feedName] = ((_a = feeds[feedName]) === null || _a === void 0 ? void 0 : _a.length) || 0;
    }
    return feedsReplyCounts;
};
/**
 * Get which feeds have more replies, i.e. have not reached the final page of all comments
 */
export const getFeedsHaveMore = (feedsOptions, bufferedFeeds, comments, repliesPages, accounts) => {
    var _a;
    const feedsHaveMore = {};
    for (const feedName in feedsOptions) {
        // if the feed still has buffered replies, then it still has more
        if ((_a = bufferedFeeds[feedName]) === null || _a === void 0 ? void 0 : _a.length) {
            feedsHaveMore[feedName] = true;
            continue;
        }
        const { commentCid, sortType: requestedSortType, onlyIfCached } = feedsOptions[feedName];
        // TODO: maybe skip if comment cid is blocked?
        const comment = comments[commentCid];
        // if at least comment hasn't loaded yet, then the feed still has more
        if (!(comment === null || comment === void 0 ? void 0 : comment.updatedAt)) {
            feedsHaveMore[feedName] = !onlyIfCached;
            continue;
        }
        const sortType = getSortTypeFromComment(comment, feedsOptions[feedName]);
        if (requestedSortType !== undefined && sortType === undefined) {
            feedsHaveMore[feedName] = false;
            continue;
        }
        const firstPageCid = getRepliesFirstPageCid(comment, sortType);
        // TODO: if a loaded comment doesn't have a first page, it's unclear what we should do
        // should we try to use another sort type by default, like 'best', or should we just ignore it?
        // 'continue' to ignore it for now
        if (!firstPageCid) {
            feedsHaveMore[feedName] = false;
            continue;
        }
        const pages = getRepliesPages(comment, sortType, repliesPages);
        // if first page isn't loaded yet, then the feed still has more
        if (!pages.length) {
            feedsHaveMore[feedName] = !onlyIfCached;
            continue;
        }
        const lastPage = pages[pages.length - 1];
        if (lastPage.nextCid) {
            feedsHaveMore[feedName] = !onlyIfCached;
            continue;
        }
        // if buffered feeds are empty and no last page of any comment has a next page, then has more is false
        feedsHaveMore[feedName] = false;
    }
    return feedsHaveMore;
};
// get all comments replies pages cids of all feeds, use to check if a commentsStore change should trigger updateFeeds
export const getFeedsComments = (feedsOptions, comments) => {
    const feedsComments = new Map();
    for (const feedName in feedsOptions) {
        feedsComments.set(feedsOptions[feedName].commentCid, comments[feedsOptions[feedName].commentCid]);
    }
    return feedsComments;
};
export const feedsCommentsChanged = (previousFeedsComments, feedsComments) => {
    if (previousFeedsComments.size !== feedsComments.size) {
        return true;
    }
    for (let commentCid of previousFeedsComments.keys()) {
        // check if the object is still the same
        if (previousFeedsComments.get(commentCid) !== feedsComments.get(commentCid)) {
            return true;
        }
    }
    return false;
};
// get all comments replies pages cids of all feeds, use to check if a commentsStore change should trigger updateFeeds
export const getFeedsCommentsFirstPageCids = (feedsComments) => {
    // find all the feeds comments first page cids
    const feedsCommentsFirstPageCids = new Set();
    for (const comment of feedsComments.values()) {
        if (!(comment === null || comment === void 0 ? void 0 : comment.replies)) {
            continue;
        }
        // check pages
        if (comment.replies.pages) {
            for (const page of Object.values(comment.replies.pages)) {
                if (page === null || page === void 0 ? void 0 : page.nextCid) {
                    feedsCommentsFirstPageCids.add(page === null || page === void 0 ? void 0 : page.nextCid);
                }
            }
        }
        // check pageCids
        if (comment.replies.pageCids) {
            for (const pageCid of Object.values(comment.replies.pageCids)) {
                if (pageCid) {
                    feedsCommentsFirstPageCids.add(pageCid);
                }
            }
        }
    }
    return [...feedsCommentsFirstPageCids].sort();
};
// get all comments replies pages first reply updatedAts, use to check if a commentsStore change should trigger updateFeeds
export const getFeedsCommentsRepliesPagesFirstUpdatedAts = (feedsComments) => {
    var _a, _b, _c;
    let feedsCommentsRepliesPagesFirstUpdatedAts = "";
    for (const comment of feedsComments.values()) {
        for (const page of Object.values(((_a = comment === null || comment === void 0 ? void 0 : comment.replies) === null || _a === void 0 ? void 0 : _a.pages) || {})) {
            if ((_c = (_b = page === null || page === void 0 ? void 0 : page.comments) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.updatedAt) {
                feedsCommentsRepliesPagesFirstUpdatedAts +=
                    page.comments[0].cid + page.comments[0].updatedAt;
            }
        }
    }
    return feedsCommentsRepliesPagesFirstUpdatedAts;
};
// get number of feeds comments that are loaded
export const getFeedsCommentsLoadedCount = (feedsComments) => {
    let count = 0;
    for (const comment of feedsComments.values()) {
        if (comment === null || comment === void 0 ? void 0 : comment.updatedAt) {
            count++;
        }
    }
    return count;
};
// selected sort type could be missing from comment, or not optimized
export const getSortTypeFromComment = (comment, feedOptions) => resolveReplySortType(comment, feedOptions.sortType);
//# sourceMappingURL=utils.js.map