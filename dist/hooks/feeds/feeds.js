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
import { useAccount } from "../accounts";
import validator from "../../lib/validator";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:feeds:hooks");
import assert from "assert";
import useFeedsStore from "../../stores/feeds";
import { addCommentModerationToComments } from "../../lib/utils/comment-moderation";
import shallow from "zustand/shallow";
/**
 * @param subplebbitAddresses - The addresses of the subplebbits, e.g. ['memes.eth', '12D3KooW...']
 * @param sortType - The sorting algo for the feed: 'hot' | 'new' | 'active' | 'topHour' | 'topDay' | 'topWeek' | 'topMonth' | 'topYear' | 'topAll' | 'controversialHour' | 'controversialDay' | 'controversialWeek' | 'controversialMonth' | 'controversialYear' | 'controversialAll'
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useFeed(options) {
    assert(!options || typeof options === "object", `useFeed options argument '${options}' not an object`);
    let { subplebbitAddresses, sortType, accountName, postsPerPage, filter, newerThan, accountComments, modQueue, } = options || {};
    sortType = getSortType(sortType, newerThan);
    validator.validateUseFeedArguments(subplebbitAddresses, sortType, accountName, postsPerPage, filter, newerThan, accountComments);
    const account = useAccount({ accountName });
    const addFeedToStore = useFeedsStore((state) => state.addFeedToStore);
    const incrementFeedPageNumber = useFeedsStore((state) => state.incrementFeedPageNumber);
    const resetFeed = useFeedsStore((state) => state.resetFeed);
    const uniqueSubplebbitAddresses = useUniqueSorted(subplebbitAddresses);
    const feedName = useFeedName(account === null || account === void 0 ? void 0 : account.id, sortType, uniqueSubplebbitAddresses, postsPerPage, filter, newerThan, accountComments, modQueue);
    const [errors, setErrors] = useState([]);
    const subplebbitAddressesWithNewerPosts = useFeedsStore((state) => state.feedsSubplebbitAddressesWithNewerPosts[feedName]);
    // add feed to store
    useEffect(() => {
        if (!(uniqueSubplebbitAddresses === null || uniqueSubplebbitAddresses === void 0 ? void 0 : uniqueSubplebbitAddresses.length) || !account) {
            return;
        }
        const isBufferedFeed = false;
        addFeedToStore(feedName, uniqueSubplebbitAddresses, sortType, account, isBufferedFeed, postsPerPage, filter, newerThan, accountComments, modQueue).catch((error) => log.error("useFeed addFeedToStore error", { feedName, error }));
    }, [feedName]);
    const feedKey = feedName !== null && feedName !== void 0 ? feedName : "";
    const feed = useFeedsStore((state) => state.loadedFeeds[feedKey]);
    const updatedFeed = useFeedsStore((state) => state.updatedFeeds[feedKey]);
    const bufferedFeed = useFeedsStore((state) => state.bufferedFeeds[feedKey]);
    let hasMore = useFeedsStore((state) => state.feedsHaveMore[feedKey]);
    if (!feedName || typeof hasMore !== "boolean") {
        hasMore = true;
    }
    if (!(subplebbitAddresses === null || subplebbitAddresses === void 0 ? void 0 : subplebbitAddresses.length)) {
        hasMore = false;
    }
    const loadMore = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!uniqueSubplebbitAddresses || !account) {
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
            if (!uniqueSubplebbitAddresses || !account) {
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
    if (account && (subplebbitAddresses === null || subplebbitAddresses === void 0 ? void 0 : subplebbitAddresses.length)) {
        log("useFeed", {
            feedLength: (feed === null || feed === void 0 ? void 0 : feed.length) || 0,
            hasMore,
            subplebbitAddresses,
            sortType,
            account,
            feedsStoreOptions: useFeedsStore.getState().feedsOptions,
            feedsStore: useFeedsStore.getState(),
        });
    }
    const state = !hasMore ? "succeeded" : "fetching-ipns";
    const normalizedFeed = useMemo(() => addCommentModerationToComments(feed), [feed]);
    const normalizedBufferedFeed = useMemo(() => addCommentModerationToComments(bufferedFeed), [bufferedFeed]);
    const normalizedUpdatedFeed = useMemo(() => addCommentModerationToComments(updatedFeed), [updatedFeed]);
    return useMemo(() => ({
        feed: normalizedFeed,
        bufferedFeed: normalizedBufferedFeed,
        updatedFeed: normalizedUpdatedFeed,
        hasMore,
        subplebbitAddressesWithNewerPosts: subplebbitAddressesWithNewerPosts || [],
        loadMore,
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
        subplebbitAddressesWithNewerPosts,
    ]);
}
/**
 * Use useBufferedFeeds to buffer multiple feeds in the background so what when
 * they are called by useFeed later, they are already preloaded.
 *
 * @param feedOptions - The options of the feed
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useBufferedFeeds(options) {
    assert(!options || typeof options === "object", `useBufferedFeeds options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    const { feedsOptions = [], accountName } = opts;
    validator.validateUseBufferedFeedsArguments(feedsOptions, accountName);
    const account = useAccount({ accountName });
    const addFeedToStore = useFeedsStore((state) => state.addFeedToStore);
    // do a bunch of calculations to get feedsOptionsFlattened and feedNames
    const feedsOpts = feedsOptions;
    const { subplebbitAddressesArrays, sortTypes, postsPerPages, filters, newerThans } = useMemo(() => {
        var _a;
        const subplebbitAddressesArrays = [];
        const sortTypes = [];
        const postsPerPages = [];
        const filters = [];
        const newerThans = [];
        for (const feedOptions of feedsOpts) {
            subplebbitAddressesArrays.push((_a = feedOptions.subplebbitAddresses) !== null && _a !== void 0 ? _a : []);
            sortTypes.push(getSortType(feedOptions.sortType, feedOptions.newerThan));
            postsPerPages.push(feedOptions.postsPerPage);
            filters.push(feedOptions.filter);
            newerThans.push(feedOptions.newerThan);
        }
        return { subplebbitAddressesArrays, sortTypes, postsPerPages, filters, newerThans };
    }, [feedsOpts]);
    const uniqueSubplebbitAddressesArrays = useUniqueSortedArrays(subplebbitAddressesArrays);
    const feedNames = useFeedNames(account === null || account === void 0 ? void 0 : account.id, sortTypes, uniqueSubplebbitAddressesArrays, postsPerPages, filters, newerThans);
    const bufferedFeeds = useFeedsStore((state) => {
        const bufferedFeeds = {};
        for (const feedName of feedNames) {
            bufferedFeeds[feedName] = state.bufferedFeeds[feedName];
        }
        return bufferedFeeds;
    }, shallow);
    // add feed to store
    useEffect(() => {
        var _a;
        for (const [i] of uniqueSubplebbitAddressesArrays.entries()) {
            const sortType = (_a = sortTypes[i]) !== null && _a !== void 0 ? _a : "hot";
            const uniqueSubplebbitAddresses = uniqueSubplebbitAddressesArrays[i];
            validator.validateFeedSortType(sortType);
            const feedName = feedNames[i];
            if (!uniqueSubplebbitAddresses || !account) {
                return;
            }
            const fkey = feedName !== null && feedName !== void 0 ? feedName : "";
            if (!bufferedFeeds[fkey]) {
                const isBufferedFeed = true;
                addFeedToStore(feedName, uniqueSubplebbitAddresses, sortType, account, isBufferedFeed).catch((error) => log.error("useBufferedFeeds addFeedToStore error", { feedName, error }));
            }
        }
    }, [feedNames]);
    // only give to the user the buffered feeds he requested
    const bufferedFeedsArray = useMemo(() => {
        const bufferedFeedsArray = [];
        for (const feedName of feedNames) {
            const key = feedName !== null && feedName !== void 0 ? feedName : "";
            bufferedFeedsArray.push(addCommentModerationToComments(bufferedFeeds[key]));
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
/**
 * Util to find unique and sorted subplebbit addresses for multiple feed options
 */
function useUniqueSortedArrays(stringsArrays) {
    return useMemo(() => {
        const uniqueSorted = [];
        const arrs = stringsArrays !== null && stringsArrays !== void 0 ? stringsArrays : [];
        for (const stringsArray of arrs) {
            uniqueSorted.push([...new Set(stringsArray.sort())]);
        }
        return uniqueSorted;
    }, [stringsArrays]);
}
function useUniqueSorted(stringsArray) {
    return useMemo(() => {
        if (!stringsArray) {
            return [];
        }
        return [...new Set(stringsArray.sort())];
    }, [stringsArray]);
}
function useFeedName(accountId, sortType, uniqueSubplebbitAddresses, postsPerPage, filter, newerThan, accountComments, modQueue) {
    const filterKey = filter === null || filter === void 0 ? void 0 : filter.key;
    const accountCommentsNewerThan = accountComments === null || accountComments === void 0 ? void 0 : accountComments.newerThan;
    const accountCommentsAppend = accountComments === null || accountComments === void 0 ? void 0 : accountComments.append;
    return useMemo(() => {
        return (accountId +
            "-" +
            sortType +
            "-" +
            uniqueSubplebbitAddresses +
            "-" +
            postsPerPage +
            "-" +
            filterKey +
            "-" +
            newerThan +
            "-" +
            accountCommentsNewerThan +
            "-" +
            accountCommentsAppend +
            "-" +
            modQueue);
    }, [
        accountId,
        sortType,
        uniqueSubplebbitAddresses,
        postsPerPage,
        filterKey,
        newerThan,
        accountCommentsNewerThan,
        accountCommentsAppend,
        modQueue === null || modQueue === void 0 ? void 0 : modQueue.toString(),
    ]);
}
function useFeedNames(accountId, sortTypes, uniqueSubplebbitAddressesArrays, postsPerPages, filters, newerThans) {
    return useMemo(() => {
        var _a, _b;
        const feedNames = [];
        for (const [i] of sortTypes.entries()) {
            feedNames.push(accountId +
                "-" +
                ((_a = sortTypes[i]) !== null && _a !== void 0 ? _a : "hot") +
                "-" +
                uniqueSubplebbitAddressesArrays[i] +
                "-" +
                postsPerPages[i] +
                "-" +
                ((_b = filters[i]) === null || _b === void 0 ? void 0 : _b.key) +
                "-" +
                newerThans[i]);
        }
        return feedNames;
    }, [accountId, sortTypes, uniqueSubplebbitAddressesArrays, postsPerPages, filters, newerThans]);
}
const NEWER_THAN_LIMITS = [
    [60 * 60 * 24, "Day"],
    [60 * 60 * 24 * 7, "Week"],
    [60 * 60 * 24 * 31, "Month"],
    [60 * 60 * 24 * 365, "Year"],
];
const getSortType = (sortType, newerThan) => {
    const base = sortType || "hot";
    if (!newerThan || (base !== "topAll" && base !== "controversialAll"))
        return base;
    let time;
    for (const [limit, name] of NEWER_THAN_LIMITS) {
        if (newerThan <= limit) {
            time = name;
            break;
        }
    }
    if (!time)
        return base;
    return base === "topAll" ? `top${time}` : `controversial${time}`;
};
