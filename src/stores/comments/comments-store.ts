import localForageLru from "../../lib/localforage-lru";
const commentsDatabase = localForageLru.createInstance({
  name: "bitsocialReactHooks-comments",
  size: 5000,
});
import Logger from "@pkcprotocol/pkc-logger";
export const log = Logger("bitsocial-react-hooks:comments:stores");
import { Comment, Comments, Account } from "../../types";
import utils from "../../lib/utils";
import createStore from "zustand";
import accountsStore from "../accounts";
import repliesPagesStore from "../replies-pages";
import { normalizeCommentCommunityAddress } from "../../lib/pkc-compat";

let pkcGetCommentPending: { [key: string]: boolean } = {};
const liveComments: { [commentCid: string]: Comment } = {};
const liveCommentPromises: { [commentCid: string]: Promise<Comment> | undefined } = {};
const commentAutoUpdateSubscribers: {
  [commentCid: string]: { [subscriberId: string]: true };
} = {};
const stopCommentAfterNextUpdate: { [commentCid: string]: boolean } = {};
const initializedComments = new WeakSet<object>();
const trackedListeners = new WeakSet<object>();

// reset all event listeners in between tests
export const listeners: any = [];

export type CommentsState = {
  comments: Comments;
  errors: { [commentCid: string]: Error[] };
  addCommentToStore: Function;
  startCommentAutoUpdate: Function;
  stopCommentAutoUpdate: Function;
  refreshComment: Function;
};

const removeCommentListener = (comment: any, event: string, listener: (...args: any[]) => void) => {
  if (typeof comment?.off === "function") {
    comment.off(event, listener);
    return;
  }
  if (typeof comment?.removeListener === "function") {
    comment.removeListener(event, listener);
  }
};

const getCommentAutoUpdateSubscribersCount = (commentCid: string) =>
  Object.keys(commentAutoUpdateSubscribers[commentCid] || {}).length;

const hasCommentAutoUpdateSubscribers = (commentCid: string) =>
  getCommentAutoUpdateSubscribersCount(commentCid) > 0;

const mergeCommentData = (
  commentCid: string,
  ...commentDataList: (Comment | undefined)[]
): Comment => {
  const mergedCommentData: Comment = { cid: commentCid };
  for (const commentData of commentDataList) {
    if (commentData && typeof commentData === "object") {
      Object.assign(mergedCommentData, utils.clone(commentData));
    }
  }
  mergedCommentData.cid = commentCid;
  return mergedCommentData;
};

const releaseLiveComment = (commentCid: string, comment?: Comment) => {
  const liveComment = comment || liveComments[commentCid];
  if (liveComment) {
    const listenerIndex = listeners.indexOf(liveComment);
    if (listenerIndex !== -1) {
      listeners.splice(listenerIndex, 1);
    }
  }
  if (!comment || liveComments[commentCid] === liveComment) {
    delete liveComments[commentCid];
  }
};

const maybeReleaseStoppedLiveComment = (commentCid: string, comment?: Comment) => {
  if (!comment || hasCommentAutoUpdateSubscribers(commentCid)) {
    return;
  }
  if (liveComments[commentCid] !== comment) {
    return;
  }
  releaseLiveComment(commentCid, comment);
};

const commentsStore = createStore<CommentsState>((setState: Function, getState: Function) => {
  const addCommentError = (commentCid: string, error: Error) => {
    setState((state: CommentsState) => {
      let commentErrors = state.errors[commentCid] || [];
      commentErrors = [...commentErrors, error];
      return { ...state, errors: { ...state.errors, [commentCid]: commentErrors } };
    });
  };

  const persistComment = async (commentCid: string, nextComment: Comment) => {
    const normalizedComment = normalizeCommentCommunityAddress(utils.clone(nextComment)) as Comment;
    await commentsDatabase.setItem(commentCid, normalizedComment);
    log("commentsStore comment update", { commentCid, updatedComment: normalizedComment });
    setState((state: CommentsState) => ({
      comments: { ...state.comments, [commentCid]: normalizedComment },
    }));

    // add comment replies pages to repliesPagesStore so they can be used in useComment
    repliesPagesStore.getState().addRepliesPageCommentsToStore(nextComment);

    return normalizedComment;
  };

  const stopLiveComment = async (commentCid: string, comment?: Comment) => {
    const liveComment = comment || liveComments[commentCid];
    if (typeof liveComment?.stop !== "function") {
      return;
    }
    try {
      await liveComment.stop();
    } catch (error) {
      log.trace("comment.stop error", { commentCid, comment: liveComment, error });
    }
  };

  const maybeStopCommentAfterOneShotUpdate = (commentCid: string, comment: Comment) => {
    if (!stopCommentAfterNextUpdate[commentCid]) {
      return;
    }
    delete stopCommentAfterNextUpdate[commentCid];
    if (hasCommentAutoUpdateSubscribers(commentCid)) {
      return;
    }
    void stopLiveComment(commentCid, comment).finally(() => {
      maybeReleaseStoppedLiveComment(commentCid, comment);
    });
  };

  const initializeComment = (commentCid: string, comment: Comment, account: Account) => {
    if (initializedComments.has(comment as object)) {
      liveComments[commentCid] = comment;
      return;
    }
    initializedComments.add(comment as object);
    liveComments[commentCid] = comment;

    comment?.on?.("update", async (updatedComment: Comment) => {
      updatedComment = normalizeCommentCommunityAddress(utils.clone(updatedComment)) as Comment;
      await persistComment(commentCid, updatedComment);
    });

    comment?.on?.("updatingstatechange", (updatingState: string) => {
      setState((state: CommentsState) => ({
        comments: {
          ...state.comments,
          [commentCid]: { ...state.comments[commentCid], updatingState },
        },
      }));

      if (updatingState === "succeeded" || updatingState === "failed") {
        maybeStopCommentAfterOneShotUpdate(commentCid, comment);
      }
    });

    comment?.on?.("error", (error: Error) => {
      addCommentError(commentCid, error);
    });

    // set clients on comment so the frontend can display it, dont persist in db because a reload cancels updating
    utils.clientsOnStateChange(
      comment?.clients,
      (clientState: string, clientType: string, clientUrl: string, chainTicker?: string) => {
        setState((state: CommentsState) => {
          // make sure not undefined, sometimes happens in e2e tests
          if (!state.comments[commentCid]) {
            return {};
          }
          const clients = { ...state.comments[commentCid]?.clients };
          const client = { state: clientState };
          if (chainTicker) {
            const chainProviders = { ...clients[clientType][chainTicker], [clientUrl]: client };
            clients[clientType] = { ...clients[clientType], [chainTicker]: chainProviders };
          } else {
            clients[clientType] = { ...clients[clientType], [clientUrl]: client };
          }
          return {
            comments: {
              ...state.comments,
              [commentCid]: { ...state.comments[commentCid], clients },
            },
          };
        });
      },
    );

    // when publishing a comment, you don't yet know its CID
    // so when a new comment is fetched, check to see if it's your own
    // comment, and if yes, add the CID to your account comments database
    // if comment.timestamp isn't defined, it means the next update will contain the timestamp and author
    // which is used in addCidToAccountComment
    if (!comment?.timestamp) {
      comment?.once?.("update", () =>
        accountsStore
          .getState()
          .accountsActionsInternal.addCidToAccountComment(comment)
          .catch((error: any) =>
            log.error("accountsActionsInternal.addCidToAccountComment error", { comment, error }),
          ),
      );
    }

    if (!trackedListeners.has(comment as object)) {
      trackedListeners.add(comment as object);
      listeners.push(comment);
    }
  };

  const ensureLiveComment = async (commentCid: string, account: Account, commentData?: Comment) => {
    if (liveComments[commentCid]) {
      return liveComments[commentCid];
    }
    if (liveCommentPromises[commentCid]) {
      return liveCommentPromises[commentCid] as Promise<Comment>;
    }

    const liveCommentPromise = (async () => {
      const initialComment = normalizeCommentCommunityAddress(
        mergeCommentData(commentCid, commentData),
      );
      const liveComment = normalizeCommentCommunityAddress(
        await account.pkc.createComment(initialComment),
      ) as Comment;
      initializeComment(commentCid, liveComment, account);
      return liveComment;
    })();
    liveCommentPromises[commentCid] = liveCommentPromise;

    try {
      return await liveCommentPromise;
    } finally {
      if (liveCommentPromises[commentCid] === liveCommentPromise) {
        delete liveCommentPromises[commentCid];
      }
    }
  };

  const requestCommentUpdate = (
    commentCid: string,
    comment: Comment,
    options?: { stopAfterNextUpdate?: boolean },
  ) => {
    if (options?.stopAfterNextUpdate) {
      stopCommentAfterNextUpdate[commentCid] = true;
    } else {
      delete stopCommentAfterNextUpdate[commentCid];
    }

    comment
      ?.update?.()
      .catch((error: unknown) => log.trace("comment.update error", { commentCid, comment, error }));
  };

  const waitForCommentUpdateCycle = (commentCid: string, comment: Comment) =>
    new Promise<Comment>((resolve, reject) => {
      const onUpdatingStateChange = (updatingState: string) => {
        if (updatingState === "succeeded") {
          cleanup();
          resolve(normalizeCommentCommunityAddress(utils.clone(comment)) as Comment);
          return;
        }
        if (updatingState === "failed") {
          cleanup();
          reject(getState().errors[commentCid]?.slice(-1)[0] || Error("comment update failed"));
        }
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        removeCommentListener(comment, "updatingstatechange", onUpdatingStateChange);
        removeCommentListener(comment, "error", onError);
      };

      comment?.on?.("updatingstatechange", onUpdatingStateChange);
      comment?.on?.("error", onError);
    });

  return {
    comments: {},
    errors: {},

    async addCommentToStore(commentCid: string, account: Account, commentData?: Comment) {
      const { comments } = getState();
      const pendingKey = commentCid + account.id;

      // comment is in store already, do nothing
      let comment: Comment | undefined = comments[commentCid];
      if (comment || pkcGetCommentPending[pendingKey]) {
        return;
      }
      pkcGetCommentPending[pendingKey] = true;

      try {
        // try to find comment in database
        comment = await getCommentFromDatabase(commentCid, account, commentData);

        if (!comment) {
          comment = await ensureLiveComment(commentCid, account, commentData);
          comment = normalizeCommentCommunityAddress(comment);
          log("commentsStore.addCommentToStore", { commentCid, comment, account });
          setState((state: CommentsState) => ({
            comments: { ...state.comments, [commentCid]: utils.clone(comment) },
          }));
        } else {
          comment = normalizeCommentCommunityAddress(comment);
          setState((state: CommentsState) => ({
            comments: { ...state.comments, [commentCid]: utils.clone(comment) },
          }));

          // add comment replies pages to repliesPagesStore so they can be used in useComment
          repliesPagesStore.getState().addRepliesPageCommentsToStore(comment);

          comment = await ensureLiveComment(
            commentCid,
            account,
            mergeCommentData(commentCid, comment, commentData),
          );
        }

        if (comment) {
          requestCommentUpdate(commentCid, comment, { stopAfterNextUpdate: true });
        }
      } catch (e: any) {
        addCommentError(commentCid, e);
        throw e;
      } finally {
        pkcGetCommentPending[pendingKey] = false;
      }
    },

    async startCommentAutoUpdate(
      commentCid: string,
      subscriberId: string,
      account: Account,
      commentData?: Comment,
    ) {
      const hadAutoUpdateSubscribers = hasCommentAutoUpdateSubscribers(commentCid);
      commentAutoUpdateSubscribers[commentCid] = {
        ...(commentAutoUpdateSubscribers[commentCid] || {}),
        [subscriberId]: true,
      };

      if (hadAutoUpdateSubscribers && liveComments[commentCid]) {
        return;
      }

      const storedComment = getState().comments[commentCid];
      const liveComment = await ensureLiveComment(
        commentCid,
        account,
        mergeCommentData(commentCid, storedComment, commentData),
      );

      if (!storedComment) {
        setState((state: CommentsState) => ({
          comments: { ...state.comments, [commentCid]: utils.clone(liveComment) },
        }));
      }

      if (!hasCommentAutoUpdateSubscribers(commentCid)) {
        await stopLiveComment(commentCid, liveComment);
        maybeReleaseStoppedLiveComment(commentCid, liveComment);
        return;
      }

      requestCommentUpdate(commentCid, liveComment);
    },

    async stopCommentAutoUpdate(commentCid: string, subscriberId: string) {
      if (commentAutoUpdateSubscribers[commentCid]) {
        delete commentAutoUpdateSubscribers[commentCid][subscriberId];
        if (Object.keys(commentAutoUpdateSubscribers[commentCid]).length === 0) {
          delete commentAutoUpdateSubscribers[commentCid];
        }
      }

      if (hasCommentAutoUpdateSubscribers(commentCid)) {
        return;
      }

      delete stopCommentAfterNextUpdate[commentCid];
      const liveComment = liveComments[commentCid];
      await stopLiveComment(commentCid, liveComment);
      maybeReleaseStoppedLiveComment(commentCid, liveComment);
    },

    async refreshComment(commentCid: string, account: Account, commentData?: Comment) {
      const storedComment = getState().comments[commentCid];
      const liveComment = await ensureLiveComment(
        commentCid,
        account,
        mergeCommentData(commentCid, storedComment, commentData),
      );

      if (
        !hasCommentAutoUpdateSubscribers(commentCid) &&
        liveComment?.updatingState !== "stopped"
      ) {
        await stopLiveComment(commentCid, liveComment);
      }

      const waitForUpdate = waitForCommentUpdateCycle(commentCid, liveComment);
      requestCommentUpdate(commentCid, liveComment, {
        stopAfterNextUpdate: !hasCommentAutoUpdateSubscribers(commentCid),
      });
      return waitForUpdate;
    },
  };
});

const getCommentFromDatabase = async (
  commentCid: string,
  account: Account,
  initialCommentData?: Comment,
) => {
  const commentData: any = await commentsDatabase.getItem(commentCid);
  if (!commentData) {
    return;
  }
  try {
    const comment = normalizeCommentCommunityAddress(
      await account.pkc.createComment(
        mergeCommentData(commentCid, commentData, initialCommentData),
      ),
    );
    return comment;
  } catch (e) {
    // need to log this always or it could silently fail in production and cache never be used
    console.error("failed pkc.createComment(cachedComment)", {
      cachedComment: commentData,
      error: e,
    });
  }
};

// reset store in between tests
const originalState = commentsStore.getState();
// async function because some stores have async init
export const resetCommentsStore = async () => {
  pkcGetCommentPending = {};
  for (const commentCid in commentAutoUpdateSubscribers) {
    delete commentAutoUpdateSubscribers[commentCid];
  }
  for (const commentCid in stopCommentAfterNextUpdate) {
    delete stopCommentAfterNextUpdate[commentCid];
  }
  for (const commentCid in liveCommentPromises) {
    delete liveCommentPromises[commentCid];
  }
  for (const commentCid in liveComments) {
    delete liveComments[commentCid];
  }

  // remove all event listeners
  await Promise.all(
    listeners.map(async (listener: any) => {
      try {
        if (typeof listener?.stop === "function") {
          await listener.stop();
        }
      } catch {}
      listener?.removeAllListeners?.();
    }),
  );
  listeners.length = 0;

  // destroy all component subscriptions to the store
  commentsStore.destroy();
  // restore original state
  commentsStore.setState(originalState);
};

// reset database and store in between tests
export const resetCommentsDatabaseAndStore = async () => {
  await localForageLru.createInstance({ name: "bitsocialReactHooks-comments" }).clear();
  await resetCommentsStore();
};

export default commentsStore;
