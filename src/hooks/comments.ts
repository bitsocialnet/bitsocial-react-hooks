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

const getCommentsState = (comments: (Comment | undefined)[]) =>
  comments.every((comment) => getCommentStateAndReplyCount(comment).state === "succeeded")
    ? "succeeded"
    : "fetching-ipfs";

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
  const currentCommentCidRef = useRef<string | undefined>(commentCid);
  currentCommentCidRef.current = commentCid;
  const [frozenComment, setFrozenComment] = useState<Comment | undefined>();
  const [freezeSettledCid, setFreezeSettledCid] = useState<string>();

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
  const freezeSettledForCurrentCid = freezeSettledCid === commentCid;

  useEffect(() => {
    if (autoUpdate) {
      setFrozenComment(undefined);
      setFreezeSettledCid(undefined);
      return;
    }

    setFrozenComment(undefined);
    setFreezeSettledCid(undefined);
  }, [commentCid, autoUpdate]);

  useEffect(() => {
    if (autoUpdate) {
      return;
    }
    if (!commentCid) {
      setFrozenComment(undefined);
      setFreezeSettledCid(undefined);
      return;
    }
    if (freezeSettledForCurrentCid || !selectedComment) {
      return;
    }

    setFrozenComment(selectedComment);
    if (selectedCommentState === "succeeded") {
      setFreezeSettledCid(commentCid);
    }
  }, [autoUpdate, commentCid, selectedComment, selectedCommentState, freezeSettledForCurrentCid]);

  const frozenCommentForCurrentCid = frozenComment?.cid === commentCid ? frozenComment : undefined;
  let comment = autoUpdate
    ? selectedComment
    : freezeSettledForCurrentCid
      ? frozenCommentForCurrentCid
      : frozenCommentForCurrentCid || selectedComment;
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
    if (!commentCid || !account) {
      throw Error("useComment cannot refresh comment not initialized yet");
    }

    const refreshCommentCid = commentCid;
    const refreshedComment = await refreshCommentInStore(refreshCommentCid, account);
    if (!autoUpdate && refreshedComment && currentCommentCidRef.current === refreshCommentCid) {
      setFrozenComment(refreshedComment);
      setFreezeSettledCid(refreshCommentCid);
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
  const commentCidsKey = JSON.stringify(commentCids);
  const commentsKey = `${account?.id || ""}:${commentCidsKey}`;
  const currentCommentsKeyRef = useRef(commentsKey);
  currentCommentsKeyRef.current = commentsKey;
  const [frozenComments, setFrozenComments] = useState<(Comment | undefined)[]>([]);
  const [frozenCommentsKey, setFrozenCommentsKey] = useState<string>();
  const [freezeSettledKey, setFreezeSettledKey] = useState<string>();

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
  }, [commentCidsKey, account?.id, onlyIfCached]);

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
  }, [commentCidsKey, account?.id, onlyIfCached, autoUpdate]);

  if (account && commentCids?.length) {
    log("useComments", {
      commentCids,
      commentsStoreComments,
      commentsStore: useCommentsStore.getState().comments,
      account,
    });
  }

  // if comment from community pages exists and is fresher (or current missing), use it instead
  const liveComments = useMemo(() => {
    const result = [...commentsStoreComments];
    for (const i in result) {
      const candidate = communitiesPagesComments[i];
      if (candidate) result[i] = preferFresher(result[i], candidate);
    }
    return result;
  }, [commentsStoreComments, communitiesPagesComments]);

  const liveCommentsSettled = liveComments.every(
    (comment) => getCommentStateAndReplyCount(comment).state === "succeeded",
  );
  const freezeSettledForCurrentKey = freezeSettledKey === commentsKey;

  useEffect(() => {
    if (autoUpdate) {
      setFrozenComments([]);
      setFrozenCommentsKey(undefined);
      setFreezeSettledKey(undefined);
      return;
    }

    setFrozenComments([]);
    setFrozenCommentsKey(undefined);
    setFreezeSettledKey(undefined);
  }, [commentsKey, autoUpdate]);

  useEffect(() => {
    if (autoUpdate || freezeSettledForCurrentKey) {
      return;
    }

    setFrozenComments(liveComments);
    setFrozenCommentsKey(commentsKey);
    if (liveCommentsSettled) {
      setFreezeSettledKey(commentsKey);
    }
  }, [autoUpdate, commentsKey, freezeSettledForCurrentKey, liveComments, liveCommentsSettled]);

  const frozenCommentsForCurrentSelection =
    frozenCommentsKey === commentsKey ? frozenComments : undefined;
  const comments = autoUpdate ? liveComments : frozenCommentsForCurrentSelection || liveComments;
  const normalizedComments = useMemo(() => addCommentModerationToComments(comments), [comments]);

  // succeed if no comments are undefined
  const state = getCommentsState(normalizedComments);

  const refresh = useCallback(async () => {
    if (!account) {
      throw Error("useComments cannot refresh comments not initialized yet");
    }
    const uniqueCommentCids = [...new Set(commentCids)];
    const refreshedComments = await Promise.all(
      uniqueCommentCids.map((commentCid) => refreshCommentInStore(commentCid, account)),
    );

    if (!autoUpdate && currentCommentsKeyRef.current === commentsKey) {
      const latestCommunitiesPagesComments = useCommunitiesPagesStore.getState().comments;
      const refreshedCommentsByCid = uniqueCommentCids.reduce(
        (
          refreshedCommentsMap: { [commentCid: string]: Comment | undefined },
          commentCid,
          index,
        ) => {
          refreshedCommentsMap[commentCid] = refreshedComments[index];
          return refreshedCommentsMap;
        },
        {},
      );
      setFrozenComments(
        commentCids.map((commentCid) =>
          preferFresher(
            refreshedCommentsByCid[commentCid || ""],
            latestCommunitiesPagesComments[commentCid || ""],
          ),
        ),
      );
      setFrozenCommentsKey(commentsKey);
      setFreezeSettledKey(commentsKey);
    }
  }, [account, autoUpdate, commentCids, commentsKey, refreshCommentInStore]);

  return useMemo(
    () => ({
      comments: normalizedComments,
      state,
      refresh,
      error: undefined,
      errors: [],
    }),
    [normalizedComments, commentsKey, refresh, state],
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
