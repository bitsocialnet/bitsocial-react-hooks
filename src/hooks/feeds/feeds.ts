import { useEffect, useMemo, useState } from "react";
import { useAccount } from "../accounts";
import validator from "../../lib/validator";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:feeds:hooks");
import assert from "assert";
import {
  Feed,
  Feeds,
  UseBufferedFeedsOptions,
  UseBufferedFeedsResult,
  UseFeedOptions,
  UseFeedResult,
  CommentsFilter,
} from "../../types";
import useFeedsStore from "../../stores/feeds";
import { addCommentModerationToComments } from "../../lib/utils/comment-moderation";
import shallow from "zustand/shallow";

/**
 * @param communityAddresses - The addresses of the communities, e.g. ['memes.eth', '12D3KooW...']
 * @param sortType - The sorting algo for the feed: 'hot' | 'new' | 'active' | 'topHour' | 'topDay' | 'topWeek' | 'topMonth' | 'topYear' | 'topAll' | 'controversialHour' | 'controversialDay' | 'controversialWeek' | 'controversialMonth' | 'controversialYear' | 'controversialAll'
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useFeed(options?: UseFeedOptions): UseFeedResult {
  assert(
    !options || typeof options === "object",
    `useFeed options argument '${options}' not an object`,
  );
  let {
    communityAddresses,
    sortType,
    accountName,
    postsPerPage,
    filter,
    newerThan,
    accountComments,
    modQueue,
  } = options || {};
  sortType = getSortType(sortType, newerThan);

  validator.validateUseFeedArguments(
    communityAddresses,
    sortType,
    accountName,
    postsPerPage,
    filter,
    newerThan,
    accountComments,
  );
  const account = useAccount({ accountName });
  const addFeedToStore = useFeedsStore((state) => state.addFeedToStore);
  const incrementFeedPageNumber = useFeedsStore((state) => state.incrementFeedPageNumber);
  const resetFeed = useFeedsStore((state) => state.resetFeed);
  const uniqueCommunityAddresses = useUniqueSorted(communityAddresses);
  const feedName = useFeedName(
    account?.id,
    sortType,
    uniqueCommunityAddresses,
    postsPerPage,
    filter,
    newerThan,
    accountComments,
    modQueue,
  );
  const [errors, setErrors] = useState<Error[]>([]);
  const communityAddressesWithNewerPosts = useFeedsStore(
    (state) => state.feedsCommunityAddressesWithNewerPosts[feedName],
  );

  // add feed to store
  useEffect(() => {
    if (!uniqueCommunityAddresses?.length || !account) {
      return;
    }
    const isBufferedFeed = false;
    addFeedToStore(
      feedName,
      uniqueCommunityAddresses,
      sortType,
      account,
      isBufferedFeed,
      postsPerPage,
      filter,
      newerThan,
      accountComments,
      modQueue,
    ).catch((error: unknown) => log.error("useFeed addFeedToStore error", { feedName, error }));
  }, [feedName]);

  const feedKey = feedName ?? "";
  const feed = useFeedsStore((state) => state.loadedFeeds[feedKey]);
  const updatedFeed = useFeedsStore((state) => state.updatedFeeds[feedKey]);
  const bufferedFeed = useFeedsStore((state) => state.bufferedFeeds[feedKey]);
  let hasMore = useFeedsStore((state) => state.feedsHaveMore[feedKey]);
  if (!feedName || typeof hasMore !== "boolean") {
    hasMore = true;
  }
  if (!communityAddresses?.length) {
    hasMore = false;
  }

  const loadMore = async () => {
    try {
      if (!uniqueCommunityAddresses || !account) {
        throw Error("useFeed cannot load more feed not initalized yet");
      }
      incrementFeedPageNumber(feedName);
    } catch (e: any) {
      // wait 100 ms so infinite scroll doesn't spam this function
      await new Promise((r) => setTimeout(r, 50));
      setErrors([...errors, e]);
    }
  };

  const reset = async () => {
    try {
      if (!uniqueCommunityAddresses || !account) {
        throw Error("useFeed cannot reset feed not initalized yet");
      }
      await resetFeed(feedName);
    } catch (e: any) {
      // wait 100 ms so infinite scroll doesn't spam this function
      await new Promise((r) => setTimeout(r, 50));
      setErrors([...errors, e]);
    }
  };

  if (account && communityAddresses?.length) {
    log("useFeed", {
      feedLength: feed?.length || 0,
      hasMore,
      communityAddresses,
      sortType,
      account,
      feedsStoreOptions: useFeedsStore.getState().feedsOptions,
      feedsStore: useFeedsStore.getState(),
    });
  }

  const state = !hasMore ? "succeeded" : "fetching-ipns";
  const normalizedFeed = useMemo(() => addCommentModerationToComments(feed), [feed]);
  const normalizedBufferedFeed = useMemo(
    () => addCommentModerationToComments(bufferedFeed),
    [bufferedFeed],
  );
  const normalizedUpdatedFeed = useMemo(
    () => addCommentModerationToComments(updatedFeed),
    [updatedFeed],
  );

  return useMemo(
    () => ({
      feed: normalizedFeed,
      bufferedFeed: normalizedBufferedFeed,
      updatedFeed: normalizedUpdatedFeed,
      hasMore,
      communityAddressesWithNewerPosts: communityAddressesWithNewerPosts || [],
      loadMore,
      reset,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      normalizedFeed,
      normalizedBufferedFeed,
      normalizedUpdatedFeed,
      feedName,
      hasMore,
      errors,
      communityAddressesWithNewerPosts,
    ],
  );
}

/**
 * Use useBufferedFeeds to buffer multiple feeds in the background so what when
 * they are called by useFeed later, they are already preloaded.
 *
 * @param feedOptions - The options of the feed
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useBufferedFeeds(options?: UseBufferedFeedsOptions): UseBufferedFeedsResult {
  assert(
    !options || typeof options === "object",
    `useBufferedFeeds options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { feedsOptions = [], accountName } = opts;
  validator.validateUseBufferedFeedsArguments(feedsOptions, accountName);
  const account = useAccount({ accountName });
  const addFeedToStore = useFeedsStore((state) => state.addFeedToStore);

  // do a bunch of calculations to get feedsOptionsFlattened and feedNames
  const feedsOpts = feedsOptions;
  const { communityAddressesArrays, sortTypes, postsPerPages, filters, newerThans } =
    useMemo(() => {
      const communityAddressesArrays = [];
      const sortTypes = [];
      const postsPerPages = [];
      const filters = [];
      const newerThans = [];
      for (const feedOptions of feedsOpts) {
        communityAddressesArrays.push(feedOptions.communityAddresses ?? []);
        sortTypes.push(getSortType(feedOptions.sortType, feedOptions.newerThan));
        postsPerPages.push(feedOptions.postsPerPage);
        filters.push(feedOptions.filter);
        newerThans.push(feedOptions.newerThan);
      }
      return { communityAddressesArrays, sortTypes, postsPerPages, filters, newerThans };
    }, [feedsOpts]);
  const uniqueCommunityAddressesArrays = useUniqueSortedArrays(communityAddressesArrays);
  const feedNames = useFeedNames(
    account?.id,
    sortTypes,
    uniqueCommunityAddressesArrays,
    postsPerPages,
    filters,
    newerThans,
  );

  const bufferedFeeds = useFeedsStore((state) => {
    const bufferedFeeds: Feeds = {};
    for (const feedName of feedNames) {
      bufferedFeeds[feedName] = state.bufferedFeeds[feedName];
    }
    return bufferedFeeds;
  }, shallow);

  // add feed to store
  useEffect(() => {
    for (const [i] of uniqueCommunityAddressesArrays.entries()) {
      const sortType = sortTypes[i] ?? "hot";
      const uniqueCommunityAddresses = uniqueCommunityAddressesArrays[i];
      validator.validateFeedSortType(sortType);
      const feedName = feedNames[i];
      if (!uniqueCommunityAddresses || !account) {
        return;
      }
      const fkey = feedName ?? "";
      if (!bufferedFeeds[fkey]) {
        const isBufferedFeed = true;
        addFeedToStore(feedName, uniqueCommunityAddresses, sortType, account, isBufferedFeed).catch(
          (error: unknown) =>
            log.error("useBufferedFeeds addFeedToStore error", { feedName, error }),
        );
      }
    }
  }, [feedNames]);

  // only give to the user the buffered feeds he requested
  const bufferedFeedsArray: Feed[] = useMemo(() => {
    const bufferedFeedsArray: Feed[] = [];
    for (const feedName of feedNames) {
      const key = feedName ?? "";
      bufferedFeedsArray.push(addCommentModerationToComments(bufferedFeeds[key]));
    }
    return bufferedFeedsArray;
  }, [bufferedFeeds, feedNames]);

  if (account && feedsOptions?.length) {
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

  return useMemo(
    () => ({
      bufferedFeeds: bufferedFeedsArray,
      state,
      error: undefined,
      errors: [],
    }),
    [bufferedFeedsArray, feedsOptions],
  );
}

/**
 * Util to find unique and sorted community addresses for multiple feed options
 */
function useUniqueSortedArrays(stringsArrays?: string[][]) {
  return useMemo(() => {
    const uniqueSorted: string[][] = [];
    const arrs = stringsArrays ?? [];
    for (const stringsArray of arrs) {
      uniqueSorted.push([...new Set(stringsArray.sort())]);
    }
    return uniqueSorted;
  }, [stringsArrays]);
}

function useUniqueSorted(stringsArray?: string[]) {
  return useMemo(() => {
    if (!stringsArray) {
      return [];
    }
    return [...new Set(stringsArray.sort())];
  }, [stringsArray]);
}

function useFeedName(
  accountId: string,
  sortType: string,
  uniqueCommunityAddresses: string[],
  postsPerPage?: number,
  filter?: CommentsFilter,
  newerThan?: number,
  accountComments?: UseFeedOptions["accountComments"],
  modQueue?: string[],
) {
  const filterKey = filter?.key;
  const accountCommentsNewerThan = accountComments?.newerThan;
  const accountCommentsAppend = accountComments?.append;
  return useMemo(() => {
    return (
      accountId +
      "-" +
      sortType +
      "-" +
      uniqueCommunityAddresses +
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
      modQueue
    );
  }, [
    accountId,
    sortType,
    uniqueCommunityAddresses,
    postsPerPage,
    filterKey,
    newerThan,
    accountCommentsNewerThan,
    accountCommentsAppend,
    modQueue?.toString(),
  ]);
}

function useFeedNames(
  accountId: string,
  sortTypes: (string | undefined)[],
  uniqueCommunityAddressesArrays: string[][],
  postsPerPages: (number | undefined)[],
  filters: (CommentsFilter | undefined)[],
  newerThans: (number | undefined)[],
) {
  return useMemo(() => {
    const feedNames = [];
    for (const [i] of sortTypes.entries()) {
      feedNames.push(
        accountId +
          "-" +
          (sortTypes[i] ?? "hot") +
          "-" +
          uniqueCommunityAddressesArrays[i] +
          "-" +
          postsPerPages[i] +
          "-" +
          filters[i]?.key +
          "-" +
          newerThans[i],
      );
    }
    return feedNames;
  }, [accountId, sortTypes, uniqueCommunityAddressesArrays, postsPerPages, filters, newerThans]);
}

const NEWER_THAN_LIMITS = [
  [60 * 60 * 24, "Day"],
  [60 * 60 * 24 * 7, "Week"],
  [60 * 60 * 24 * 31, "Month"],
  [60 * 60 * 24 * 365, "Year"],
] as const;

const getSortType = (sortType?: string, newerThan?: number): string => {
  const base = sortType || "hot";
  if (!newerThan || (base !== "topAll" && base !== "controversialAll")) return base;
  let time: string | undefined;
  for (const [limit, name] of NEWER_THAN_LIMITS) {
    if (newerThan <= limit) {
      time = name;
      break;
    }
  }
  if (!time) return base;
  return base === "topAll" ? `top${time}` : `controversial${time}`;
};
