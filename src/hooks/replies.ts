import { useEffect, useState, useMemo } from "react";
import { useAccount } from "./accounts";
import validator from "../lib/validator";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:replies:hooks");
import assert from "assert";
import { UseRepliesOptions, UseRepliesResult } from "../types";
import { addCommentModerationToComments } from "../lib/utils/comment-moderation";
import useRepliesStore, {
  RepliesState,
  feedOptionsToFeedName,
  getRepliesFirstPageSkipValidation,
} from "../stores/replies";
import useAccountsStore from "../stores/accounts";
import { addOptimisticVoteCountsToComments } from "../lib/utils/optimistic-vote-counts";

/** Pure helper to append an error to the errors array; used for deterministic coverage of reset/loadMore catch paths. */
export function appendErrorToErrors(prevErrors: Error[], e: Error): Error[] {
  return [...prevErrors, e];
}

export function useReplies(options?: UseRepliesOptions): UseRepliesResult {
  assert(
    !options || typeof options === "object",
    `useReplies options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  let {
    comment,
    sortType,
    accountName,
    onlyIfCached,
    flat,
    flatDepth,
    accountComments,
    repliesPerPage,
    filter,
    validateOptimistically,
    streamPage,
  } = opts;
  flatDepth = typeof flatDepth === "number" ? flatDepth : 0;
  validateOptimistically = validateOptimistically !== false;
  const invalidFlatDepth =
    flat && typeof comment?.depth === "number" && flatDepth !== comment.depth;
  validator.validateUseRepliesArguments(
    comment,
    sortType,
    accountName,
    onlyIfCached,
    flat,
    accountComments,
    repliesPerPage,
    filter,
  );

  const [errors, setErrors] = useState<Error[]>([]);

  // add replies to store
  const account = useAccount({ accountName });
  const accountVotes = useAccountsStore((state: any) =>
    account?.id ? state.accountsVotes[account.id] : undefined,
  );
  const feedOptions = {
    commentCid: comment?.cid,
    commentDepth: comment?.depth,
    postCid: comment?.postCid,
    sortType,
    accountId: account?.id,
    onlyIfCached,
    repliesPerPage,
    flat,
    accountComments,
    filter,
    streamPage,
  };
  const repliesFeedName = feedOptionsToFeedName(feedOptions);
  const addFeedToStoreOrUpdateComment = useRepliesStore(
    (state: RepliesState) => state.addFeedToStoreOrUpdateComment,
  );
  useEffect(() => {
    if (!comment?.cid || !account || invalidFlatDepth) {
      return;
    }
    addFeedToStoreOrUpdateComment(comment, feedOptions).catch((error: unknown) =>
      log.error("useReplies addFeedToStoreOrUpdateComment error", {
        repliesFeedName,
        comment,
        feedOptions,
        error,
      }),
    );
  }, [repliesFeedName, comment]);

  let replies = useRepliesStore((state: RepliesState) => state.loadedFeeds[repliesFeedName || ""]);
  let bufferedReplies = useRepliesStore(
    (state: RepliesState) => state.bufferedFeeds[repliesFeedName || ""],
  );
  let updatedReplies = useRepliesStore(
    (state: RepliesState) => state.updatedFeeds[repliesFeedName || ""],
  );
  let hasMore = useRepliesStore(
    (state: RepliesState) => state.feedsHaveMore[repliesFeedName || ""],
  );
  hasMore = comment
    ? repliesFeedName && typeof hasMore === "boolean"
      ? hasMore
      : !onlyIfCached
    : false;

  const incrementFeedPageNumber = useRepliesStore(
    (state: RepliesState) => state.incrementFeedPageNumber,
  );
  let loadMore = async () => {
    try {
      if (!comment?.cid || !account) {
        throw Error("useReplies cannot load more replies not initalized yet");
      }
      incrementFeedPageNumber(repliesFeedName);
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 50));
      setErrors(appendErrorToErrors(errors, e));
    }
  };

  const resetFeed = useRepliesStore((state: RepliesState) => state.resetFeed);
  let reset = async () => {
    try {
      if (!comment?.cid || !account) {
        throw Error("useReplies cannot reset replies not initalized yet");
      }
      resetFeed(repliesFeedName);
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 50));
      setErrors(appendErrorToErrors(errors, e));
    }
  };

  // optimistically avoid the initial validation delay by using skipped validation until validated feed is loaded
  const skipValidation = useMemo(() => {
    if (validateOptimistically && !replies && comment?.cid && account?.id) {
      return getRepliesFirstPageSkipValidation(comment, feedOptions);
    }
  }, [validateOptimistically, replies, comment?.cid, account?.id, comment, repliesFeedName]);
  if (validateOptimistically && !replies && skipValidation?.replies?.length) {
    replies = skipValidation.replies;
    hasMore = skipValidation.hasMore;
  }

  // don't display nested replies when flat
  // to start flat replies at a depth other than 0, e.g. a twitter reply thread, change flatDepth
  if (invalidFlatDepth) {
    replies = emptyArray;
    bufferedReplies = emptyArray;
    updatedReplies = emptyArray;
    hasMore = false;
    loadMore = emptyFunction;
    reset = emptyFunction;
  }

  if (account && comment?.cid) {
    log("useReplies", {
      repliesLength: replies?.length || 0,
      hasMore,
      comment,
      sortType,
      onlyIfCached,
      flat,
      flatDepth,
      repliesStoreOptions: useRepliesStore.getState().feedsOptions,
      repliesStore: useRepliesStore.getState(),
      invalidFlatDepth,
    });
  }

  const state = !hasMore ? "succeeded" : "fetching";
  const normalizedReplies = useMemo(
    () => addOptimisticVoteCountsToComments(addCommentModerationToComments(replies), accountVotes),
    [replies, accountVotes],
  );
  const normalizedBufferedReplies = useMemo(
    () =>
      addOptimisticVoteCountsToComments(
        addCommentModerationToComments(bufferedReplies),
        accountVotes,
      ),
    [bufferedReplies, accountVotes],
  );
  const normalizedUpdatedReplies = useMemo(
    () =>
      addOptimisticVoteCountsToComments(
        addCommentModerationToComments(updatedReplies),
        accountVotes,
      ),
    [updatedReplies, accountVotes],
  );

  return useMemo(
    () => ({
      replies: normalizedReplies,
      bufferedReplies: normalizedBufferedReplies,
      updatedReplies: normalizedUpdatedReplies,
      hasMore,
      loadMore,
      reset,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      normalizedReplies,
      normalizedBufferedReplies,
      normalizedUpdatedReplies,
      repliesFeedName,
      hasMore,
      errors,
    ],
  );
}

const emptyArray: any = [];
const emptyFunction = async () => {};
