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
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:feeds:stores");
import createStore from "zustand";
import localForageLru from "../../lib/localforage-lru/index.js";
import { communityPostsCacheExpired } from "../../lib/utils/index.js";
import { getPkcGetCommunity } from "../../lib/pkc-compat.js";
import { deriveFeedSortType } from "../../lib/feed-sort-type.js";
import { getCommunityRefKeys } from "../../lib/community-ref.js";
import accountsStore from "../accounts/index.js";
import communitiesStore from "../communities/index.js";
import communitiesPagesStore from "../communities-pages/index.js";
import { getFeedsCommunitiesFirstPageCids, getLoadedFeeds, getUpdatedFeeds, getBufferedFeedsWithoutLoadedFeeds, getFeedsCommunitiesPostCounts, getFeedsHaveMore, getAccountsBlockedAddresses, feedsHaveChangedBlockedAddresses, accountsBlockedAddressesChanged, getAccountsBlockedCids, feedsHaveChangedBlockedCids, accountsBlockedCidsChanged, feedsCommunitiesChanged, getFeedsCommunities, getFeedsCommunitiesLoadedCount, getFeedsCommunitiesPostsPagesFirstUpdatedAts, getFilteredSortedFeeds, getFeedsCommunityKeysWithNewerPosts, } from "./utils.js";
// reddit loads approximately 25 posts per page
// while infinite scrolling
export const defaultPostsPerPage = 25;
// keep large buffer because fetching cids is slow
const communityPostsLeftBeforeNextPage = 50;
// don't updateFeeds more than once per updateFeedsMinIntervalTime
let updateFeedsPending = false;
let updateFeedsAgain = false;
const updateFeedsMinIntervalTime = 100;
const feedsStore = createStore((setState, getState) => ({
    feedsOptions: {},
    bufferedFeeds: {},
    loadedFeeds: {},
    updatedFeeds: {},
    bufferedFeedsCommunitiesPostCounts: {},
    feedsHaveMore: {},
    feedsCommunityKeysWithNewerPosts: {},
    addFeedToStore(feedName, communities, communityKeys, sortType, account, isBufferedFeed, postsPerPage, filter, newerThan, accountComments, modQueue, requestedSortType) {
        return __awaiter(this, void 0, void 0, function* () {
            // init here because must be called after async accounts store finished initializing
            initializeFeedsStore();
            assert(feedName && typeof feedName === "string", `feedsStore.addFeedToStore feedName '${feedName}' invalid`);
            assert(Array.isArray(communities), `addFeedToStore.addFeedToStore communities '${communities}' invalid`);
            assert(Array.isArray(communityKeys), `addFeedToStore.addFeedToStore communityKeys '${communityKeys}' invalid`);
            const derivedCommunityKeys = getCommunityRefKeys(communities);
            assert(communityKeys.length === derivedCommunityKeys.length &&
                communityKeys.every((communityKey, index) => communityKey === derivedCommunityKeys[index]), `addFeedToStore.addFeedToStore communityKeys '${communityKeys}' do not match communities`);
            assert(sortType && typeof sortType === "string", `addFeedToStore.addFeedToStore sortType '${sortType}' invalid`);
            assert(typeof getPkcGetCommunity(account === null || account === void 0 ? void 0 : account.pkc) === "function", `addFeedToStore.addFeedToStore account '${account}' invalid`);
            assert(typeof isBufferedFeed === "boolean" ||
                isBufferedFeed === undefined ||
                isBufferedFeed === null, `addFeedToStore.addFeedToStore isBufferedFeed '${isBufferedFeed}' invalid`);
            assert(!filter || typeof (filter === null || filter === void 0 ? void 0 : filter.filter) === "function", `addFeedToStore.addFeedToStore filter.filter '${filter === null || filter === void 0 ? void 0 : filter.filter}' invalid`);
            assert(!filter || typeof (filter === null || filter === void 0 ? void 0 : filter.key) === "string", `addFeedToStore.addFeedToStore filter.key '${filter === null || filter === void 0 ? void 0 : filter.key}' invalid`);
            assert(!newerThan || typeof newerThan === "number", `addFeedToStore.addFeedToStore newerThan '${newerThan}' invalid`);
            postsPerPage = postsPerPage || defaultPostsPerPage;
            assert(typeof postsPerPage === "number", `addFeedToStore.addFeedToStore postsPerPage '${postsPerPage}' invalid`);
            assert(!accountComments || typeof (accountComments === null || accountComments === void 0 ? void 0 : accountComments.newerThan) === "number", `addFeedToStore.addFeedToStore accountComments.newerThan '${accountComments === null || accountComments === void 0 ? void 0 : accountComments.newerThan}' invalid`);
            assert(!modQueue || Array.isArray(modQueue), `addFeedToStore.addFeedToStore modQueue '${modQueue}' invalid`);
            const { feedsOptions, updateFeeds } = getState();
            // feed is in store already, do nothing
            // if the feed already exist but is at page 0, reset it to page 1
            if (feedsOptions[feedName] && feedsOptions[feedName].pageNumber !== 0) {
                return;
            }
            // to add a buffered feed, add a feed with pageNumber 0
            const feedOptions = {
                communities,
                communityKeys,
                sortType,
                requestedSortType: requestedSortType || sortType,
                accountId: account.id,
                pageNumber: isBufferedFeed === true ? 0 : 1,
                postsPerPage,
                newerThan,
                filter,
                accountComments,
                // TODO: allow multiple modQueue at once, fow now only use first in array
                modQueue,
            };
            log("feedsActions.addFeedToStore", feedOptions);
            setState(({ feedsOptions }) => ({
                feedsOptions: Object.assign(Object.assign({}, feedsOptions), { [feedName]: feedOptions }),
            }));
            addCommunitiesToCommunitiesStore(communities, account);
            // update feeds right away to use the already loaded communities and pages
            // if no new communities are added by the feed, like for a sort type change,
            // a feed update will never be triggered, so must be triggered it manually
            updateFeeds();
        });
    },
    incrementFeedPageNumber(feedName) {
        const { feedsOptions, loadedFeeds, updateFeeds } = getState();
        assert(feedsOptions[feedName], `feedsActions.incrementFeedPageNumber feed name '${feedName}' does not exist in feeds store`);
        log("feedsActions.incrementFeedPageNumber", { feedName });
        assert(feedsOptions[feedName].pageNumber * feedsOptions[feedName].postsPerPage <=
            loadedFeeds[feedName].length, `feedsActions.incrementFeedPageNumber cannot increment feed page number before current page has loaded`);
        setState(({ feedsOptions, loadedFeeds }) => {
            const feedOptions = Object.assign(Object.assign({}, feedsOptions[feedName]), { pageNumber: feedsOptions[feedName].pageNumber + 1 });
            return { feedsOptions: Object.assign(Object.assign({}, feedsOptions), { [feedName]: feedOptions }) };
        });
        // do not update feed at the same time as increment a page number or it might cause
        // a race condition, rather schedule a feed update
        updateFeeds();
    },
    expandFeedTimeWindow(feedName, newerThan) {
        const { feedsOptions, loadedFeeds, updateFeeds } = getState();
        assert(feedsOptions[feedName], `feedsActions.expandFeedTimeWindow feed name '${feedName}' does not exist in feeds store`);
        assert(newerThan === undefined || typeof newerThan === "number", `feedsActions.expandFeedTimeWindow newerThan '${newerThan}' invalid`);
        const currentFeedOptions = feedsOptions[feedName];
        const currentNewerThan = currentFeedOptions.newerThan;
        if (currentNewerThan === newerThan) {
            return;
        }
        const isExpandedTimeWindow = typeof currentNewerThan === "number" &&
            (newerThan === undefined || newerThan > currentNewerThan);
        assert(isExpandedTimeWindow, `feedsActions.expandFeedTimeWindow newerThan '${newerThan}' must broaden the current window '${currentNewerThan}'`);
        const nextSortType = deriveFeedSortType(currentFeedOptions.requestedSortType, newerThan);
        assert(nextSortType === currentFeedOptions.sortType, `feedsActions.expandFeedTimeWindow cannot change sort type from '${currentFeedOptions.sortType}' to '${nextSortType}'`);
        const loadedFeed = loadedFeeds[feedName] || [];
        const shouldPrefetchExpandedPage = currentFeedOptions.pageNumber > 0 &&
            loadedFeed.length >= currentFeedOptions.pageNumber * currentFeedOptions.postsPerPage;
        setState(({ feedsOptions }) => ({
            feedsOptions: Object.assign(Object.assign({}, feedsOptions), { [feedName]: Object.assign(Object.assign({}, currentFeedOptions), { newerThan, pageNumber: shouldPrefetchExpandedPage
                        ? currentFeedOptions.pageNumber + 1
                        : currentFeedOptions.pageNumber }) }),
        }));
        updateFeeds();
    },
    resetFeed(feedName) {
        return __awaiter(this, void 0, void 0, function* () {
            const { feedsOptions, updateFeeds } = getState();
            assert(feedsOptions[feedName], `feedsActions.resetFeed feed name '${feedName}' does not exist in feeds store`);
            assert(feedsOptions[feedName].pageNumber >= 1, `feedsActions.resetFeed cannot reset feed page number '${feedsOptions[feedName].pageNumber}' lower than 1`);
            log("feedsActions.resetFeed", { feedName });
            const { modQueue, sortType, communities, communityKeys, accountId } = feedsOptions[feedName];
            const account = accountsStore.getState().accounts[accountId];
            assert(account, `feedsActions.resetFeed account id '${accountId}' does not exist in accounts store`);
            setState(({ feedsOptions, loadedFeeds, updatedFeeds }) => {
                const feedOptions = Object.assign(Object.assign({}, feedsOptions[feedName]), { pageNumber: 1 });
                return {
                    feedsOptions: Object.assign(Object.assign({}, feedsOptions), { [feedName]: feedOptions }),
                    loadedFeeds: Object.assign(Object.assign({}, loadedFeeds), { [feedName]: [] }),
                    updatedFeeds: Object.assign(Object.assign({}, updatedFeeds), { [feedName]: [] }),
                };
            });
            if (modQueue === null || modQueue === void 0 ? void 0 : modQueue[0]) {
                const { communities } = communitiesStore.getState();
                const { invalidateCommunityPages } = communitiesPagesStore.getState();
                const loadedCommunities = communityKeys
                    .map((communityKey) => communities[communityKey])
                    .filter((community) => Boolean(community));
                yield Promise.all(loadedCommunities.map((community) => invalidateCommunityPages(community, sortType, modQueue, account.id)));
            }
            yield Promise.all(communities.map((communityRef, communityIndex) => communitiesStore
                .getState()
                .refreshCommunity(communityRef, account)
                .catch((error) => log.error("feedsStore.resetFeed refreshCommunity error", {
                feedName,
                community: communityRef,
                communityKey: communityKeys[communityIndex],
                error,
            }))));
            updateFeeds();
        });
    },
    // recalculate all feeds using new communities.post.pages, communitiesPagesStore and page numbers
    updateFeeds() {
        if (updateFeedsPending) {
            updateFeedsAgain = true;
            return;
        }
        updateFeedsPending = true;
        // don't update feeds more than once per updateFeedsMinIntervalTime
        const timeUntilNextUpdate = Date.now() % updateFeedsMinIntervalTime;
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            // get state from all stores
            const previousState = getState();
            const { feedsOptions, updateFeeds } = previousState;
            const { communities } = communitiesStore.getState();
            const { communitiesPages } = communitiesPagesStore.getState();
            const { accounts } = accountsStore.getState();
            // calculate new feeds
            const filteredSortedFeeds = getFilteredSortedFeeds(feedsOptions, communities, communitiesPages, accounts, communitiesPagesStore.getState().comments);
            const bufferedFeedsWithoutPreviousLoadedFeeds = getBufferedFeedsWithoutLoadedFeeds(filteredSortedFeeds, previousState.loadedFeeds);
            const loadedFeeds = yield getLoadedFeeds(feedsOptions, filteredSortedFeeds, previousState.loadedFeeds, bufferedFeedsWithoutPreviousLoadedFeeds, accounts);
            // after loaded feeds are caculated, remove new loaded feeds (again) from buffered feeds
            const bufferedFeeds = getBufferedFeedsWithoutLoadedFeeds(bufferedFeedsWithoutPreviousLoadedFeeds, loadedFeeds);
            const bufferedFeedsCommunitiesPostCounts = getFeedsCommunitiesPostCounts(feedsOptions, bufferedFeeds);
            const feedsHaveMore = getFeedsHaveMore(feedsOptions, bufferedFeeds, communities, communitiesPages, accounts);
            const feedsCommunityKeysWithNewerPosts = getFeedsCommunityKeysWithNewerPosts(feedsOptions, filteredSortedFeeds, loadedFeeds, previousState.feedsCommunityKeysWithNewerPosts);
            const updatedFeeds = yield getUpdatedFeeds(feedsOptions, filteredSortedFeeds, previousState.updatedFeeds, loadedFeeds, accounts);
            // set new feeds
            setState((state) => ({
                bufferedFeeds,
                loadedFeeds,
                updatedFeeds,
                bufferedFeedsCommunitiesPostCounts,
                feedsHaveMore,
                feedsCommunityKeysWithNewerPosts,
            }));
            log.trace("feedsStore.updateFeeds", {
                feedsOptions,
                bufferedFeeds,
                loadedFeeds,
                updatedFeeds,
                bufferedFeedsCommunitiesPostCounts,
                feedsHaveMore,
                communities,
                communitiesPages,
                feedsCommunityKeysWithNewerPosts,
            });
            updateFeedsPending = false;
            // If a community/page update arrived during this calculation, run one
            // more pass so feedsHaveMore and loadedFeeds cannot stay on stale input.
            if (updateFeedsAgain) {
                updateFeedsAgain = false;
                updateFeeds();
            }
        }), timeUntilNextUpdate);
    },
}));
let feedsStoreInitialized = false;
const initializeFeedsStore = () => __awaiter(void 0, void 0, void 0, function* () {
    if (feedsStoreInitialized) {
        return;
    }
    // TODO: optimize subscriptions e.g. updateFeedsOnFeedsCommunitiesChange(communities)
    // subscribe to communities store changes
    communitiesStore.subscribe(updateFeedsOnFeedsCommunitiesChange);
    // subscribe to bufferedFeedsCommunitiesPostCounts change
    feedsStore.subscribe(addCommunitiesPagesOnLowBufferedFeedsCommunitiesPostCounts);
    // subscribe to communities pages store changes
    communitiesPagesStore.subscribe(updateFeedsOnFeedsCommunitiesPagesChange);
    // subscribe to accounts store change (for blocked addresses)
    accountsStore.subscribe(updateFeedsOnAccountsBlockedAddressesChange);
    // subscribe to accounts store change (for blocked cids)
    accountsStore.subscribe(updateFeedsOnAccountsBlockedCidsChange);
    // subscribe to accounts store changes (for account comments)
    accountsStore.subscribe(updateFeedsOnAccountsCommentsChange);
    feedsStoreInitialized = true;
});
let previousBlockedAddresses = [];
let previousAccountsBlockedAddresses = [];
const updateFeedsOnAccountsBlockedAddressesChange = (accountsStoreState) => {
    const { accounts } = accountsStoreState;
    // blocked addresses haven't changed, do nothing
    const accountsBlockedAddresses = [];
    for (const i in accounts) {
        accountsBlockedAddresses.push(accounts[i].blockedAddresses);
    }
    if (!accountsBlockedAddressesChanged(previousAccountsBlockedAddresses, accountsBlockedAddresses)) {
        return;
    }
    previousAccountsBlockedAddresses = accountsBlockedAddresses;
    const blockedAddresses = getAccountsBlockedAddresses(accounts);
    // blocked addresses haven't changed, do nothing
    if (blockedAddresses.toString() === previousBlockedAddresses.toString()) {
        return;
    }
    const { feedsOptions, updateFeeds, bufferedFeeds } = feedsStore.getState();
    const _feedsHaveChangedBlockedAddresses = feedsHaveChangedBlockedAddresses(feedsOptions, bufferedFeeds, blockedAddresses, previousBlockedAddresses);
    previousBlockedAddresses = blockedAddresses;
    // if changed blocked addresses arent used in the feeds, do nothing
    // NOTE: because of this, if an author address is unblocked, feeds won't update until some other event causes a feed update
    if (!_feedsHaveChangedBlockedAddresses) {
        return;
    }
    updateFeeds();
};
let previousBlockedCids = [];
let previousAccountsBlockedCids = [];
const updateFeedsOnAccountsBlockedCidsChange = (accountsStoreState) => {
    const { accounts } = accountsStoreState;
    // blocked cids haven't changed, do nothing
    const accountsBlockedCids = [];
    for (const i in accounts) {
        accountsBlockedCids.push(accounts[i].blockedCids);
    }
    if (!accountsBlockedCidsChanged(previousAccountsBlockedCids, accountsBlockedCids)) {
        return;
    }
    previousAccountsBlockedCids = accountsBlockedCids;
    const blockedCids = getAccountsBlockedCids(accounts);
    // blocked cids haven't changed, do nothing
    if (blockedCids.toString() === previousBlockedCids.toString()) {
        return;
    }
    const { feedsOptions, updateFeeds, bufferedFeeds } = feedsStore.getState();
    const _feedsHaveChangedBlockedCids = feedsHaveChangedBlockedCids(feedsOptions, bufferedFeeds, blockedCids, previousBlockedCids);
    previousBlockedCids = blockedCids;
    // if changed blocked cids arent used in the feeds, do nothing
    // NOTE: because of this, if a cid is unblocked, feeds won't update until some other event causes a feed update
    if (!_feedsHaveChangedBlockedCids) {
        return;
    }
    updateFeeds();
};
let previousCommunitiesPages = {};
const updateFeedsOnFeedsCommunitiesPagesChange = (communitiesPagesStoreState) => {
    const { communitiesPages } = communitiesPagesStoreState;
    // no changes, do nothing
    if (communitiesPages === previousCommunitiesPages) {
        return;
    }
    previousCommunitiesPages = communitiesPages;
    // currently only the feeds use communitiesPagesStore, so any change must
    // trigger a feed update, if in the future another hook uses the communitiesPagesStore
    // we should check if the communities pages changed are actually used by the feeds before
    // triggering an update
    feedsStore.getState().updateFeeds();
};
let previousBufferedFeedsCommunitiesPostCountsPageCids = [];
let previousBufferedFeedsCommunities = new Map();
let previousBufferedFeedsCommunitiesPostCounts = {};
const addCommunitiesPagesOnLowBufferedFeedsCommunitiesPostCounts = (feedsStoreState) => {
    const { bufferedFeedsCommunitiesPostCounts, feedsOptions } = feedsStore.getState();
    const { communities } = communitiesStore.getState();
    // if feeds communities have changed, we must try adding them even if buffered posts counts haven't changed
    const bufferedFeedsCommunities = getFeedsCommunities(feedsOptions, communities);
    const _feedsCommunitiesChanged = feedsCommunitiesChanged(previousBufferedFeedsCommunities, bufferedFeedsCommunities);
    const bufferedFeedsCommunitiesPostCountsChanged = previousBufferedFeedsCommunitiesPostCounts !== bufferedFeedsCommunitiesPostCounts;
    // if feeds communities havent changed and buffered posts counts also havent changed, do nothing
    if (!_feedsCommunitiesChanged && !bufferedFeedsCommunitiesPostCountsChanged) {
        return;
    }
    previousBufferedFeedsCommunities = bufferedFeedsCommunities;
    previousBufferedFeedsCommunitiesPostCounts = bufferedFeedsCommunitiesPostCounts;
    // in case feeds community changed, but the first page cids haven't
    const bufferedFeedsCommunitiesPostCountsPageCids = getFeedsCommunitiesFirstPageCids(bufferedFeedsCommunities);
    const bufferedFeedsCommunitiesPostCountsPageCidsChanged = bufferedFeedsCommunitiesPostCountsPageCids.toString() !==
        previousBufferedFeedsCommunitiesPostCountsPageCids.toString();
    if (!bufferedFeedsCommunitiesPostCountsPageCidsChanged &&
        !bufferedFeedsCommunitiesPostCountsChanged) {
        return;
    }
    previousBufferedFeedsCommunitiesPostCountsPageCids = bufferedFeedsCommunitiesPostCountsPageCids;
    const { addNextCommunityPageToStore } = communitiesPagesStore.getState();
    const { accounts } = accountsStore.getState();
    // bufferedFeedsCommunitiesPostCounts have changed, check if any of them are low
    for (const feedName in bufferedFeedsCommunitiesPostCounts) {
        const account = accounts[feedsOptions[feedName].accountId];
        const communitiesPostCounts = bufferedFeedsCommunitiesPostCounts[feedName];
        const { sortType, modQueue } = feedsOptions[feedName];
        for (const communityAddress in communitiesPostCounts) {
            // don't fetch more pages if community address is blocked
            if (account === null || account === void 0 ? void 0 : account.blockedAddresses[communityAddress]) {
                continue;
            }
            // community hasn't loaded yet
            if (!communities[communityAddress]) {
                continue;
            }
            // if community posts cache is expired, don't use, wait for next community update
            if (communityPostsCacheExpired(communities[communityAddress])) {
                continue;
            }
            // community post count is low, fetch next community page
            if (communitiesPostCounts[communityAddress] <= communityPostsLeftBeforeNextPage) {
                addNextCommunityPageToStore(communities[communityAddress], sortType, account, modQueue).catch((error) => log.error("feedsStore communitiesActions.addNextCommunityPageToStore error", {
                    communityAddress,
                    community: communities[communityAddress],
                    sortType,
                    error,
                }));
            }
        }
    }
};
let previousFeedsCommunitiesFirstPageCids = [];
let previousFeedsCommunities = new Map();
let previousFeedsCommunitiesLoadedCount = 0;
let previousFeedsCommunitiesPostsPagesFirstUpdatedAts = "";
const updateFeedsOnFeedsCommunitiesChange = (communitiesStoreState) => {
    const { communities } = communitiesStoreState;
    const { feedsOptions, updateFeeds } = feedsStore.getState();
    // feeds communities haven't changed, do nothing
    const feedsCommunities = getFeedsCommunities(feedsOptions, communities);
    if (!feedsCommunitiesChanged(previousFeedsCommunities, feedsCommunities)) {
        return;
    }
    previousFeedsCommunities = feedsCommunities;
    // decide if feeds communities have changed by looking at all feeds communities page cids
    // (in case that a community changed, but its first page cid didn't)
    const feedsCommunitiesFirstPageCids = getFeedsCommunitiesFirstPageCids(feedsCommunities);
    // first page cids haven't changed, do nothing
    if (feedsCommunitiesFirstPageCids.toString() === previousFeedsCommunitiesFirstPageCids.toString()) {
        // if no new feed communities have loaded, do nothing
        // in case a sub loads with no first page cid and first pages cids don't change, need to trigger hasMore update
        const feedsCommunitiesLoadedCount = getFeedsCommunitiesLoadedCount(feedsCommunities);
        if (feedsCommunitiesLoadedCount === previousFeedsCommunitiesLoadedCount) {
            // if community.posts.pages haven't changed, do nothing
            const feedsCommunitiesPostsPagesFirstUpdatedAts = getFeedsCommunitiesPostsPagesFirstUpdatedAts(feedsCommunities);
            if (feedsCommunitiesPostsPagesFirstUpdatedAts ===
                previousFeedsCommunitiesPostsPagesFirstUpdatedAts) {
                return;
            }
            previousFeedsCommunitiesPostsPagesFirstUpdatedAts = feedsCommunitiesPostsPagesFirstUpdatedAts;
        }
        previousFeedsCommunitiesLoadedCount = feedsCommunitiesLoadedCount;
    }
    // feeds communities have changed, update feeds
    previousFeedsCommunitiesFirstPageCids = feedsCommunitiesFirstPageCids;
    updateFeeds();
};
let previousAccountsCommentsCount = 0;
let previousAccountsCommentsCids = "";
const updateFeedsOnAccountsCommentsChange = (accountsStoreState) => {
    const { accountsComments } = accountsStoreState;
    const accountsCommentsCount = Object.values(accountsComments).reduce((count, accountComments) => count + accountComments.length, 0);
    // no changes, do nothing
    if (accountsCommentsCount === previousAccountsCommentsCount) {
        // if cids haven't changed (account comments receive cids after pending), do nothing
        const accountsCommentsCids = Object.values(accountsComments).reduce((cids, accountComments) => cids + String(accountComments.map((comment) => comment.cid || "")), "");
        if (accountsCommentsCids === previousAccountsCommentsCids) {
            return;
        }
        previousAccountsCommentsCids = accountsCommentsCids;
    }
    previousAccountsCommentsCount = accountsCommentsCount;
    // TODO: only update the feeds that are relevant to the new accountComment.parentCid/postCid
    feedsStore.getState().updateFeeds();
};
const addCommunitiesToCommunitiesStore = (communityRefs, account) => {
    const addCommunityToStore = communitiesStore.getState().addCommunityToStore;
    for (const communityRef of communityRefs) {
        addCommunityToStore(communityRef, account).catch((error) => log.error("feedsStore communitiesActions.addCommunityToStore error", {
            communityRef,
            error,
        }));
    }
};
// reset store in between tests
const originalState = feedsStore.getState();
// async function because some stores have async init
export const resetFeedsStore = () => __awaiter(void 0, void 0, void 0, function* () {
    previousBufferedFeedsCommunitiesPostCounts = {};
    previousBufferedFeedsCommunitiesPostCountsPageCids = [];
    previousBufferedFeedsCommunities = new Map();
    previousBlockedAddresses = [];
    previousAccountsBlockedAddresses = [];
    previousBlockedCids = [];
    previousAccountsBlockedCids = [];
    previousFeedsCommunitiesFirstPageCids = [];
    previousFeedsCommunities = new Map();
    previousFeedsCommunitiesLoadedCount = 0;
    previousFeedsCommunitiesPostsPagesFirstUpdatedAts = "";
    previousCommunitiesPages = {};
    previousAccountsCommentsCount = 0;
    previousAccountsCommentsCids = "";
    updateFeedsPending = false;
    updateFeedsAgain = false;
    // destroy all component subscriptions to the store
    feedsStore.destroy();
    // restore original state
    feedsStore.setState(originalState);
    feedsStoreInitialized = false;
});
// reset database and store in between tests
export const resetFeedsDatabaseAndStore = () => __awaiter(void 0, void 0, void 0, function* () {
    yield localForageLru.createInstance({ name: "bitsocialReactHooks-communitiesPages" }).clear();
    yield resetFeedsStore();
});
export default feedsStore;
//# sourceMappingURL=feeds-store.js.map