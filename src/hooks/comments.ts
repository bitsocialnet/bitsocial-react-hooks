import { useEffect, useState, useMemo } from "react";
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
import useSubplebbitsPagesStore from "../stores/subplebbits-pages";
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
  const { commentCid, accountName, onlyIfCached } = options ?? {};
  const account = useAccount({ accountName });
  const commentFromStore = useCommentsStore((state: any) => state.comments[commentCid || ""]);
  const addCommentToStore = useCommentsStore((state: any) => state.addCommentToStore);
  const subplebbitsPagesComment = useSubplebbitsPagesStore(
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

  let comment = commentFromStore;

  if (commentCid && subplebbitsPagesComment) {
    comment = preferFresher(comment, subplebbitsPagesComment);
  }
  if (commentCid && repliesPagesComment) {
    comment = preferFresher(comment, repliesPagesComment);
  }

  // if comment is still not defined, but account comment is, use account comment
  // check `comment.timestamp` instead of `comment` in case comment exists but in a loading state
  const commentFromStoreNotLoaded = !comment?.timestamp;
  if (commentCid && commentFromStoreNotLoaded && accountComment) {
    comment = accountComment;
  }

  let state = comment?.updatingState || "initializing";
  // force 'fetching-ipns' even if could be something else, so the frontend can use
  // the correct loading skeleton
  if (comment?.timestamp) {
    state = "fetching-update-ipns";
  }
  // force succeeded even if the commment is fecthing a new update
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

  if (account && commentCid) {
    log("useComment", {
      commentCid,
      comment,
      replyCount,
      state,
      commentFromStore,
      subplebbitsPagesComment,
      repliesPagesComment,
      accountComment,
      commentsStore: useCommentsStore.getState().comments,
      account,
      onlyIfCached,
    });
  }

  return useMemo(
    () => ({
      ...comment,
      replyCount,
      state,
      error: errors?.[errors.length - 1],
      errors: errors || [],
    }),
    [comment, commentCid, errors],
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
  const { commentCids = [], accountName, onlyIfCached } = options ?? {};
  const account = useAccount({ accountName });
  const commentsStoreComments: (Comment | undefined)[] = useCommentsStore(
    (state: any) => commentCids.map((commentCid) => state.comments[commentCid || ""]),
    shallow,
  );
  const subplebbitsPagesComments: (Comment | undefined)[] = useSubplebbitsPagesStore(
    (state: any) => commentCids.map((commentCid) => state.comments[commentCid || ""]),
    shallow,
  );

  const addCommentToStore = useCommentsStore((state: any) => state.addCommentToStore);

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

  if (account && commentCids?.length) {
    log("useComments", {
      commentCids,
      commentsStoreComments,
      commentsStore: useCommentsStore.getState().comments,
      account,
    });
  }

  // if comment from subplebbit pages exists and is fresher (or current missing), use it instead
  const comments = useMemo(() => {
    const result = [...commentsStoreComments];
    for (const i in result) {
      const candidate = subplebbitsPagesComments[i];
      if (candidate) result[i] = preferFresher(result[i], candidate);
    }
    return result;
  }, [commentsStoreComments, subplebbitsPagesComments]);

  // succeed if no comments are undefined
  const state = comments.indexOf(undefined) === -1 ? "succeeded" : "fetching-ipfs";

  return useMemo(
    () => ({
      comments,
      state,
      error: undefined,
      errors: [],
    }),
    [comments, commentCids?.toString()],
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
    // don't automatically block subplebbit because what subplebbit it comes from
    // a malicious subplebbit could try to block other subplebbits, etc
    const blockSubplebbit = false;
    commentIsValid(comment, { validateReplies, blockSubplebbit }, account.plebbit).then(
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
