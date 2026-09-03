var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "../accounts/index.js";
import validator from "../../lib/validator.js";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:feeds:hooks");
import assert from "assert";
import useFeedsStore from "../../stores/feeds/index.js";
import useAccountsStore from "../../stores/accounts/index.js";
import { addCommentModerationToComments } from "../../lib/utils/comment-moderation.js";
import { addOptimisticVoteCountsToComments } from "../../lib/utils/optimistic-vote-counts.js";
import shallow from "zustand/shallow";
import { getCommunityRefKeys, getUniqueSortedCommunityRefs, } from "../../lib/community-ref.js";
import { serializeFeedKey } from "../../lib/serialize-feed-key.js";
/**
 * @param communities - The communities to fetch, e.g. [{name: 'memes.eth'}, {publicKey: '12D3KooW...'}]
 * @param sortType - A sort name published by the community. Omit it to use the preloaded sort.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useFeed(options) {
    assert(!options || typeof options === "object", `useFeed options argument '${options}' not an object`);
    const opts = options || {};
    let { communities, sortType, accountName, postsPerPage, filter, newerThan, accountComments, modQueue, } = opts;
    validator.validateUseFeedArguments({
        communities,
        communityRefs: opts.communityRefs,
        communityAddresses: opts.communityAddresses,
        sortType,
        accountName,
        postsPerPage,
        filter,
        newerThan,
        accountComments,
    });
    const account = useAccount({ accountName });
    const accountVotes = useAccountsStore((state) => (account === null || account === void 0 ? void 0 : account.id) ? state.accountsVotes[account.id] : undefined);
    const addFeedToStore = useFeedsStore((state) => state.addFeedToStore);
    const incrementFeedPageNumber = useFeedsStore((state) => state.incrementFeedPageNumber);
    const expandFeedTimeWindow = useFeedsStore((state) => state.expandFeedTimeWindow);
    const resetFeed = useFeedsStore((state) => state.resetFeed);
    const normalizedCommunityRefs = useMemo(() => communities || [], [communities]);
    const uniqueCommunityRefs = useUniqueSortedCommunityRefs(normalizedCommunityRefs);
    const uniqueCommunityKeys = useMemo(() => getCommunityRefKeys(uniqueCommunityRefs), [uniqueCommunityRefs]);
    const feedName = useFeedName(account === null || account === void 0 ? void 0 : account.id, sortType, uniqueCommunityKeys, postsPerPage, filter, newerThan, accountComments, modQueue);
    const [errors, setErrors] = useState([]);
    const communityKeysWithNewerPosts = useFeedsStore((state) => state.feedsCommunityKeysWithNewerPosts[feedName]);
    // add feed to store
    useEffect(() => {
        if (!uniqueCommunityRefs.length || !account) {
            return;
        }
        const isBufferedFeed = false;
        addFeedToStore(feedName, uniqueCommunityRefs, uniqueCommunityKeys, sortType, account, isBufferedFeed, postsPerPage, filter, newerThan, accountComments, modQueue).catch((error) => log.error("useFeed addFeedToStore error", { feedName, error }));
    }, [feedName]);
    const feedKey = feedName;
    const feed = useFeedsStore((state) => state.loadedFeeds[feedKey]);
    const updatedFeed = useFeedsStore((state) => state.updatedFeeds[feedKey]);
    const bufferedFeed = useFeedsStore((state) => state.bufferedFeeds[feedKey]);
    let hasMore = useFeedsStore((state) => state.feedsHaveMore[feedKey]);
    if (!feedName || typeof hasMore !== "boolean") {
        hasMore = true;
    }
    if (!normalizedCommunityRefs.length) {
        hasMore = false;
    }
    const loadMore = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!uniqueCommunityRefs.length || !account) {
                throw Error("useFeed cannot load more feed not initalized yet");
            }
            incrementFeedPageNumber(feedName);
        }
        catch (e) {
            // wait 100 ms so infinite scroll doesn't spam this function
            yield new Promise((r) => setTimeout(r, 50));
            setErrors([...errors, e]);
        }
    });
    const reset = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!uniqueCommunityRefs.length || !account) {
                throw Error("useFeed cannot reset feed not initalized yet");
            }
            yield resetFeed(feedName);
        }
        catch (e) {
            // wait 100 ms so infinite scroll doesn't spam this function
            yield new Promise((r) => setTimeout(r, 50));
            setErrors([...errors, e]);
        }
    });
    const expandTimeWindow = (nextNewerThan) => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!uniqueCommunityRefs.length || !account) {
                throw Error("useFeed cannot expand time window before feed initialized yet");
            }
            expandFeedTimeWindow(feedName, nextNewerThan);
        }
        catch (e) {
            yield new Promise((r) => setTimeout(r, 50));
            setErrors([...errors, e]);
        }
    });
    if (account && normalizedCommunityRefs.length) {
        log("useFeed", {
            feedLength: (feed === null || feed === void 0 ? void 0 : feed.length) || 0,
            hasMore,
            communities: normalizedCommunityRefs,
            communityKeys: uniqueCommunityKeys,
            sortType,
            account,
            feedsStoreOptions: useFeedsStore.getState().feedsOptions,
            feedsStore: useFeedsStore.getState(),
        });
    }
    const state = !hasMore ? "succeeded" : "fetching-ipns";
    // apply the account's pending votes like useComment/useComments/useReplies do, so voting from a
    // feed updates the score immediately instead of only once the community publishes the new counts
    const normalizedFeed = useMemo(() => addOptimisticVoteCountsToComments(addCommentModerationToComments(feed), accountVotes), [feed, accountVotes]);
    const normalizedBufferedFeed = useMemo(() => addOptimisticVoteCountsToComments(addCommentModerationToComments(bufferedFeed), accountVotes), [bufferedFeed, accountVotes]);
    const normalizedUpdatedFeed = useMemo(() => addOptimisticVoteCountsToComments(addCommentModerationToComments(updatedFeed), accountVotes), [updatedFeed, accountVotes]);
    return useMemo(() => ({
        feed: normalizedFeed,
        bufferedFeed: normalizedBufferedFeed,
        updatedFeed: normalizedUpdatedFeed,
        hasMore,
        communityKeysWithNewerPosts: communityKeysWithNewerPosts || [],
        loadMore,
        expandTimeWindow,
        reset,
        state,
        error: errors[errors.length - 1],
        errors,
    }), [
        normalizedFeed,
        normalizedBufferedFeed,
        normalizedUpdatedFeed,
        feedName,
        hasMore,
        errors,
        communityKeysWithNewerPosts,
    ]);
}
/**
 * Use useBufferedFeeds to buffer multiple feeds in the background so what when
 * they are called by useFeed later, they are already preloaded.
 *
 * @param feedOptions - The options of the feed
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useBufferedFeeds(options) {
    assert(!options || typeof options === "object", `useBufferedFeeds options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    const { feedsOptions = [], accountName } = opts;
    validator.validateUseBufferedFeedsArguments({ feedsOptions, accountName });
    const account = useAccount({ accountName });
    const addFeedToStore = useFeedsStore((state) => state.addFeedToStore);
    // do a bunch of calculations to get feedsOptionsFlattened and feedNames
    const feedsOpts = feedsOptions;
    const { communityRefsArrays, communityKeysArrays, sortTypes, postsPerPages, filters, newerThans, } = useMemo(() => {
        const communityRefsArrays = [];
        const communityKeysArrays = [];
        const sortTypes = [];
        const postsPerPages = [];
        const filters = [];
        const newerThans = [];
        for (const feedOptions of feedsOpts) {
            validator.validateUseFeedArguments({
                communities: feedOptions.communities,
                communityRefs: feedOptions.communityRefs,
                communityAddresses: feedOptions.communityAddresses,
                sortType: feedOptions.sortType,
                accountName,
                postsPerPage: feedOptions.postsPerPage,
                filter: feedOptions.filter,
                newerThan: feedOptions.newerThan,
                accountComments: feedOptions.accountComments,
            });
            const normalizedCommunityRefs = getUniqueSortedCommunityRefs(feedOptions.communities || []);
            communityRefsArrays.push(normalizedCommunityRefs);
            communityKeysArrays.push(getCommunityRefKeys(normalizedCommunityRefs));
            sortTypes.push(feedOptions.sortType);
            postsPerPages.push(feedOptions.postsPerPage);
            filters.push(feedOptions.filter);
            newerThans.push(feedOptions.newerThan);
        }
        return {
            communityRefsArrays,
            communityKeysArrays,
            sortTypes,
            postsPerPages,
            filters,
            newerThans,
        };
    }, [feedsOpts]);
    const feedNames = useFeedNames(account === null || account === void 0 ? void 0 : account.id, sortTypes, communityKeysArrays, postsPerPages, filters, newerThans);
    const bufferedFeeds = useFeedsStore((state) => {
        const bufferedFeeds = {};
        for (const feedName of feedNames) {
            bufferedFeeds[feedName] = state.bufferedFeeds[feedName];
        }
        return bufferedFeeds;
    }, shallow);
    // add feed to store
    useEffect(() => {
        for (const [i] of communityRefsArrays.entries()) {
            const sortType = sortTypes[i];
            const uniqueCommunityRefs = communityRefsArrays[i];
            const uniqueCommunityKeys = communityKeysArrays[i];
            validator.validateFeedSortType(sortType);
            const feedName = feedNames[i];
            if (!account || !uniqueCommunityRefs.length) {
                continue;
            }
            if (!bufferedFeeds[feedName]) {
                const isBufferedFeed = true;
                addFeedToStore(feedName, uniqueCommunityRefs, uniqueCommunityKeys, sortType, account, isBufferedFeed, undefined, undefined, undefined, undefined, undefined).catch((error) => log.error("useBufferedFeeds addFeedToStore error", { feedName, error }));
            }
        }
    }, [feedNames]);
    // only give to the user the buffered feeds he requested
    const bufferedFeedsArray = useMemo(() => {
        const bufferedFeedsArray = [];
        for (const feedName of feedNames) {
            bufferedFeedsArray.push(addCommentModerationToComments(bufferedFeeds[feedName]));
        }
        return bufferedFeedsArray;
    }, [bufferedFeeds, feedNames]);
    if (account && (feedsOptions === null || feedsOptions === void 0 ? void 0 : feedsOptions.length)) {
        log("useBufferedFeeds", {
            bufferedFeeds,
            feedsOptions,
            account,
            accountName,
            feedsStoreOptions: useFeedsStore.getState().feedsOptions,
            feedsStore: useFeedsStore.getState(),
        });
    }
    const state = "fetching-ipns";
    return useMemo(() => ({
        bufferedFeeds: bufferedFeedsArray,
        state,
        error: undefined,
        errors: [],
    }), [bufferedFeedsArray, feedsOptions]);
}
function useUniqueSortedCommunityRefs(communityRefs) {
    return useMemo(() => {
        return getUniqueSortedCommunityRefs(communityRefs);
    }, [communityRefs]);
}
function useFeedName(accountId, sortType, uniqueCommunityKeys, postsPerPage, filter, newerThan, accountComments, modQueue) {
    const filterKey = filter === null || filter === void 0 ? void 0 : filter.key;
    const accountCommentsNewerThan = accountComments === null || accountComments === void 0 ? void 0 : accountComments.newerThan;
    const accountCommentsAppend = accountComments === null || accountComments === void 0 ? void 0 : accountComments.append;
    return useMemo(() => {
        return serializeFeedKey([
            accountId,
            sortType,
            uniqueCommunityKeys,
            postsPerPage,
            filterKey,
            newerThan,
            accountCommentsNewerThan,
            accountCommentsAppend,
            modQueue,
        ]);
    }, [
        accountId,
        sortType,
        uniqueCommunityKeys,
        postsPerPage,
        filterKey,
        newerThan,
        accountCommentsNewerThan,
        accountCommentsAppend,
        modQueue === null || modQueue === void 0 ? void 0 : modQueue.toString(),
    ]);
}
function useFeedNames(accountId, sortTypes, uniqueCommunityKeysArrays, postsPerPages, filters, newerThans) {
    return useMemo(() => {
        var _a;
        const feedNames = [];
        for (const [i] of sortTypes.entries()) {
            feedNames.push(serializeFeedKey([
                accountId,
                sortTypes[i],
                uniqueCommunityKeysArrays[i],
                postsPerPages[i],
                (_a = filters[i]) === null || _a === void 0 ? void 0 : _a.key,
                newerThans[i],
            ]));
        }
        return feedNames;
    }, [accountId, sortTypes, uniqueCommunityKeysArrays, postsPerPages, filters, newerThans]);
}
//# sourceMappingURL=feeds.js.map