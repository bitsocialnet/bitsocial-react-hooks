import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "./accounts";
import validator from "../lib/validator";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:comments:hooks");
import assert from "assert";
import {
  Comment,
  UseCommentsOptions,
  UseCommentsResult,
  UseCommentOptions,
  UseCommentResult,
  UseValidateCommentOptions,
  UseValidateCommentResult,
} from "../types";
import useCommentsStore from "../stores/comments";
import useAccountsStore from "../stores/accounts";
import { commentIsValid } from "../lib/utils";
import {
  addCommentModeration,
  addCommentModerationToComments,
} from "../lib/utils/comment-moderation";
import useCommunitiesPagesStore from "../stores/communities-pages";
import useRepliesPagesStore from "../stores/replies-pages";
import shallow from "zustand/shallow";

export function getCommentFreshness(comment: Comment | undefined): number {
  if (!comment) return 0;
  return Math.max(comment.updatedAt ?? 0, comment.timestamp ?? 0, 0);
}

export function preferFresher(
  current: Comment | undefined,
  candidate: Comment | undefined,
): Comment | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  return getCommentFreshness(candidate) > getCommentFreshness(current) ? candidate : current;
}

const getCommentStateAndReplyCount = (comment: Comment | undefined) => {
  let state = comment?.updatingState || "initializing";
  // force 'fetching-ipns' even if could be something else, so the frontend can use
  // the correct loading skeleton
  if (comment?.timestamp) {
    state = "fetching-update-ipns";
  }
  // force succeeded even if the comment is fecthing a new update
  if (comment?.updatedAt) {
    state = "succeeded";
  }

  // force succeeded if the comment is newer than 5 minutes, no need to display loading skeleton if comment was just created
  let replyCount = comment?.replyCount;
  if (
    comment?.replyCount === undefined &&
    comment?.timestamp &&
    comment?.timestamp > Date.now() / 1000 - 5 * 60
  ) {
    state = "succeeded";
    // set replyCount because some frontend are likely to check if replyCount === undefined to show a loading skeleton
    replyCount = 0;
  }

  return { state, replyCount };
};

let commentAutoUpdateSubscriptionCount = 0;
let commentsAutoUpdateSubscriptionCount = 0;

/**
 * @param commentCid - The IPFS CID of the comment to get
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useComment(options?: UseCommentOptions): UseCommentResult {
  assert(
    !options || typeof options === "object",
    `useComment options argument '${options}' not an object`,
  );
  const { commentCid, accountName, onlyIfCached, autoUpdate = true } = options ?? {};
  const account = useAccount({ accountName });
  const commentFromStore = useCommentsStore((state: any) => state.comments[commentCid || ""]);
  const addCommentToStore = useCommentsStore((state: any) => state.addCommentToStore);
  const startCommentAutoUpdate = useCommentsStore((state: any) => state.startCommentAutoUpdate);
  const stopCommentAutoUpdate = useCommentsStore((state: any) => state.stopCommentAutoUpdate);
  const refreshCommentInStore = useCommentsStore((state: any) => state.refreshComment);
  const communitiesPagesComment = useCommunitiesPagesStore(
    (state: any) => state.comments[commentCid || ""],
  );
  const repliesPagesComment = useRepliesPagesStore(
    (state: any) => state.comments[commentCid || ""],
  );
  const errors = useCommentsStore((state: any) => state.errors[commentCid || ""]);

  // get account comment of the cid if any
  const accountCommentInfo = useAccountsStore(
    (state: any) => state.commentCidsToAccountsComments[commentCid || ""],
  );
  const accountComment = useAccountsStore(
    (state: any) =>
      state.accountsComments[accountCommentInfo?.accountId || ""]?.[
        Number(accountCommentInfo?.accountCommentIndex)
      ],
  );
  const autoUpdateSubscriptionId = useRef(`useComment-${++commentAutoUpdateSubscriptionCount}`);
  const [frozenComment, setFrozenComment] = useState<Comment | undefined>();
  const [freezeSettled, setFreezeSettled] = useState(true);

  useEffect(() => {
    if (!commentCid || !account) {
      return;
    }
    validator.validateUseCommentArguments(commentCid, account);
    if (!commentFromStore && !onlyIfCached) {
      // if comment isn't already in store, add it
      addCommentToStore(commentCid, account).catch((error: unknown) =>
        log.error("useComment addCommentToStore error", { commentCid, error }),
      );
    }
  }, [commentCid, account?.id, onlyIfCached]);

  useEffect(() => {
    if (!commentCid || !account || onlyIfCached || !autoUpdate) {
      return;
    }

    startCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current, account).catch(
      (error: unknown) =>
        log.error("useComment startCommentAutoUpdate error", { commentCid, error }),
    );

    return () => {
      stopCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current).catch((error: unknown) =>
        log.error("useComment stopCommentAutoUpdate error", { commentCid, error }),
      );
    };
  }, [commentCid, account?.id, onlyIfCached, autoUpdate]);

  let selectedComment = commentFromStore;

  if (commentCid && communitiesPagesComment) {
    selectedComment = preferFresher(selectedComment, communitiesPagesComment);
  }
  if (commentCid && repliesPagesComment) {
    selectedComment = preferFresher(selectedComment, repliesPagesComment);
  }

  // if comment is still not defined, but account comment is, use account comment
  // check `comment.timestamp` instead of `comment` in case comment exists but in a loading state
  const commentFromStoreNotLoaded = !selectedComment?.timestamp;
  if (commentCid && commentFromStoreNotLoaded && accountComment) {
    selectedComment = accountComment;
  }

  const selectedCommentState = getCommentStateAndReplyCount(selectedComment).state;

  useEffect(() => {
    if (autoUpdate) {
      setFrozenComment(undefined);
      setFreezeSettled(true);
      return;
    }

    setFrozenComment(undefined);
    setFreezeSettled(false);
  }, [commentCid, autoUpdate]);

  useEffect(() => {
    if (autoUpdate) {
      return;
    }
    if (!commentCid) {
      setFrozenComment(undefined);
      setFreezeSettled(true);
      return;
    }
    if (freezeSettled || !selectedComment) {
      return;
    }

    setFrozenComment(selectedComment);
    if (selectedCommentState === "succeeded") {
      setFreezeSettled(true);
    }
  }, [autoUpdate, commentCid, selectedComment, selectedCommentState, freezeSettled]);

  let comment = autoUpdate ? selectedComment : frozenComment || selectedComment;
  comment = addCommentModeration(comment);

  const { state, replyCount } = getCommentStateAndReplyCount(comment);

  if (account && commentCid) {
    log("useComment", {
      commentCid,
      comment,
      replyCount,
      state,
      commentFromStore,
      communitiesPagesComment,
      repliesPagesComment,
      accountComment,
      commentsStore: useCommentsStore.getState().comments,
      account,
      onlyIfCached,
      autoUpdate,
    });
  }

  const refresh = useCallback(async () => {
    try {
      if (!commentCid || !account) {
        throw Error("useComment cannot refresh comment not initialized yet");
      }
      if (!autoUpdate) {
        setFreezeSettled(false);
      }
      const refreshedComment = await refreshCommentInStore(commentCid, account);
      if (!autoUpdate) {
        setFrozenComment(refreshedComment);
        setFreezeSettled(true);
      }
    } catch (error) {
      if (!autoUpdate) {
        setFreezeSettled(true);
      }
      throw error;
    }
  }, [account, autoUpdate, commentCid, refreshCommentInStore]);

  return useMemo(
    () => ({
      ...comment,
      replyCount,
      state,
      refresh,
      error: errors?.[errors.length - 1],
      errors: errors || [],
    }),
    [comment, commentCid, errors, refresh, state, replyCount],
  );
}

/**
 * @param commentCids - The IPFS CIDs of the comments to get
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useComments(options?: UseCommentsOptions): UseCommentsResult {
  assert(
    !options || typeof options === "object",
    `useComments options argument '${options}' not an object`,
  );
  const { commentCids = [], accountName, onlyIfCached, autoUpdate = true } = options ?? {};
  const account = useAccount({ accountName });
  const commentsStoreComments: (Comment | undefined)[] = useCommentsStore(
    (state: any) => commentCids.map((commentCid) => state.comments[commentCid || ""]),
    shallow,
  );
  const communitiesPagesComments: (Comment | undefined)[] = useCommunitiesPagesStore(
    (state: any) => commentCids.map((commentCid) => state.comments[commentCid || ""]),
    shallow,
  );

  const addCommentToStore = useCommentsStore((state: any) => state.addCommentToStore);
  const startCommentAutoUpdate = useCommentsStore((state: any) => state.startCommentAutoUpdate);
  const stopCommentAutoUpdate = useCommentsStore((state: any) => state.stopCommentAutoUpdate);
  const refreshCommentInStore = useCommentsStore((state: any) => state.refreshComment);
  const autoUpdateSubscriptionId = useRef(`useComments-${++commentsAutoUpdateSubscriptionCount}`);

  useEffect(() => {
    if (!commentCids || !account) {
      return;
    }
    validator.validateUseCommentsArguments(commentCids, account);
    if (onlyIfCached) {
      return;
    }
    const uniqueCommentCids = new Set(commentCids);
    for (const commentCid of uniqueCommentCids) {
      addCommentToStore(commentCid, account).catch((error: unknown) =>
        log.error("useComments addCommentToStore error", { commentCid, error }),
      );
    }
  }, [commentCids?.toString(), account?.id, onlyIfCached]);

  useEffect(() => {
    if (!commentCids || !account || onlyIfCached || !autoUpdate) {
      return;
    }

    const uniqueCommentCids = [...new Set(commentCids)];
    for (const commentCid of uniqueCommentCids) {
      startCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current, account).catch(
        (error: unknown) =>
          log.error("useComments startCommentAutoUpdate error", { commentCid, error }),
      );
    }

    return () => {
      for (const commentCid of uniqueCommentCids) {
        stopCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current).catch(
          (error: unknown) =>
            log.error("useComments stopCommentAutoUpdate error", { commentCid, error }),
        );
      }
    };
  }, [commentCids?.toString(), account?.id, onlyIfCached, autoUpdate]);

  if (account && commentCids?.length) {
    log("useComments", {
      commentCids,
      commentsStoreComments,
      commentsStore: useCommentsStore.getState().comments,
      account,
    });
  }

  // if comment from community pages exists and is fresher (or current missing), use it instead
  const comments = useMemo(() => {
    const result = [...commentsStoreComments];
    for (const i in result) {
      const candidate = communitiesPagesComments[i];
      if (candidate) result[i] = preferFresher(result[i], candidate);
    }
    return result;
  }, [commentsStoreComments, communitiesPagesComments]);
  const normalizedComments = useMemo(() => addCommentModerationToComments(comments), [comments]);

  // succeed if no comments are undefined
  const state = normalizedComments.indexOf(undefined) === -1 ? "succeeded" : "fetching-ipfs";

  const refresh = useCallback(async () => {
    if (!account) {
      throw Error("useComments cannot refresh comments not initialized yet");
    }
    const uniqueCommentCids = [...new Set(commentCids)];
    await Promise.all(
      uniqueCommentCids.map((commentCid) => refreshCommentInStore(commentCid, account)),
    );
  }, [account, commentCids, refreshCommentInStore]);

  return useMemo(
    () => ({
      comments: normalizedComments,
      state,
      refresh,
      error: undefined,
      errors: [],
    }),
    [normalizedComments, commentCids?.toString(), refresh, state],
  );
}

export function useValidateComment(options?: UseValidateCommentOptions): UseValidateCommentResult {
  assert(
    !options || typeof options === "object",
    `useValidateComment options argument '${options}' not an object`,
  );
  let { comment, validateReplies, accountName } = options ?? {};
  validateReplies = validateReplies ?? true;
  const [validated, setValidated] = useState<boolean | undefined>();
  const [errors] = useState([]);
  const account = useAccount({ accountName });

  useEffect(() => {
    if (!comment || !account?.plebbit) {
      setValidated(undefined);
      return;
    }
    // don't automatically block community because what community it comes from
    // a malicious community could try to block other communities, etc
    const blockCommunity = false;
    commentIsValid(comment, { validateReplies, blockCommunity }, account.plebbit).then(
      (validated) => setValidated(validated),
    );
  }, [comment, validateReplies, account?.plebbit]);

  let state = "initializing";
  if (validated === true) {
    state = "succeeded";
  }
  if (validated === false) {
    state = "failed";
  }

  // start valid at true always because most of the time the value will be true and we dont want to cause a rerender
  let valid = true;
  if (validated == false) {
    valid = false;
  }
  // if comment isn't defined, it would be confusing for valid to be true
  if (!comment) {
    valid = false;
  }

  return useMemo(
    () => ({
      valid,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [valid, state],
  );
}
