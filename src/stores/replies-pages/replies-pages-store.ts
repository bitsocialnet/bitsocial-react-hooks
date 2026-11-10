import utils from "../../lib/utils";
import Logger from "@pkcprotocol/pkc-logger";
// include replies pages store with feeds for debugging
export const log = Logger("bitsocial-react-hooks:replies:stores");
import { RepliesPage, RepliesPages, Account, Comment, Comments } from "../../types";
import accountsStore from "../accounts";
import commentsStore, { CommentsState } from "../comments";
import { addChildrenRepliesFeedsToAddToStore } from "./utils";
import localForageLru from "../../lib/localforage-lru";
import createStore from "zustand";
import assert from "../../lib/assert";
import { getReplyPageSortType, resolveReplySortType } from "../../lib/page-sorts";

const repliesPagesDatabase = localForageLru.createInstance({
  name: "bitsocialReactHooks-repliesPages",
  size: 500,
});

// reset all event listeners in between tests
const listeners: any = [];

type RepliesPagesState = {
  repliesPages: RepliesPages;
  comments: Comments;
  addNextRepliesPageToStore: Function;
  addRepliesPageCommentsToStore: Function;
};

const repliesPagesStore = createStore<RepliesPagesState>(
  (setState: Function, getState: Function) => ({
    // TODO: eventually clear old pages and comments from memory
    repliesPages: {},
    comments: {},

    addNextRepliesPageToStore: async (
      comment: Comment,
      sortType: string | undefined,
      account: Account,
    ) => {
      assert(
        comment?.cid && typeof comment?.cid === "string",
        `repliesPagesStore.addNextRepliesPageToStore comment '${comment}' invalid`,
      );
      assert(
        sortType === undefined || (typeof sortType === "string" && sortType.length > 0),
        `repliesPagesStore.addNextRepliesPageToStore sortType '${sortType}' invalid`,
      );
      const resolvedSortType = resolveReplySortType(comment, sortType);
      if (!resolvedSortType) {
        return;
      }
      sortType = resolvedSortType;
      assert(
        typeof account?.pkc?.createComment === "function",
        `repliesPagesStore.addNextRepliesPageToStore account '${account}' invalid`,
      );

      // check the preloaded replies on comment.replies.pages first, then the comment.replies.pageCids
      const repliesFirstPageCid = getRepliesFirstPageCid(comment, sortType);
      if (!repliesFirstPageCid) {
        log(
          `repliesPagesStore.addNextRepliesPageToStore comment '${comment?.cid}' sortType '${sortType}' no repliesFirstPageCid`,
        );
        return;
      }

      // all replies pages in store
      const repliesPagesStore = getState();
      // only specific pages of the comment+sortType
      const repliesPages = getRepliesPages(comment, sortType, repliesPagesStore.repliesPages);

      // if no pages exist yet, add the first page
      let pageCidToAdd: string;
      if (!repliesPages.length) {
        pageCidToAdd = repliesFirstPageCid;
      } else {
        const nextCid = repliesPages[repliesPages.length - 1]?.nextCid;
        // if last nextCid is undefined, reached end of pages
        if (!nextCid) {
          log.trace("repliesPagesStore.addNextRepliesPageToStore no more pages", {
            commentCid: comment.cid,
            sortType,
            account,
          });
          return;
        }

        pageCidToAdd = nextCid;
      }

      // page is already added or pending
      const pendingKey = account.id + pageCidToAdd;
      if (
        repliesPagesStore.repliesPages[pageCidToAdd] ||
        pageFetchIsPending(pendingKey, account.pkc)
      ) {
        return;
      }

      const pendingFetch: PendingPageFetch = { pkc: account.pkc, failed: false };
      fetchPagePending[pendingKey] = [...(fetchPagePending[pendingKey] || []), pendingFetch];
      let page: RepliesPage;
      try {
        page = await fetchPage(pageCidToAdd, comment, account, pendingFetch);
        log.trace("repliesPagesStore.addNextRepliesPageToStore comment.replies.getPage", {
          pageCid: pageCidToAdd,
          page,
          commentCid: comment.cid,
          communityAddress: comment.communityAddress,
          account,
        });
      } catch (e) {
        throw e;
      } finally {
        fetchPagePending[pendingKey] = fetchPagePending[pendingKey]?.filter(
          (fetch) => fetch !== pendingFetch,
        );
      }

      // find new comments in the page (missing-or-fresher: insert when absent or incoming is fresher)
      const flattenedComments = utils.flattenCommentsPages(page);
      const { comments } = getState();
      let hasNewComments = false;
      const newComments: Comments = {};
      for (const comment of flattenedComments) {
        if (!comment.cid) continue;
        const existing = comments[comment.cid];
        const incomingFresh = Math.max(comment.updatedAt || 0, comment.timestamp || 0, 0);
        const existingFresh = existing
          ? Math.max(existing.updatedAt || 0, existing.timestamp || 0, 0)
          : -1;
        if (!existing || incomingFresh > existingFresh) {
          // don't clone the comment to save memory, comments remain a pointer to the page object
          newComments[comment.cid] = comment;
          hasNewComments = true;
        }
      }

      // add missing children replies feeds
      addChildrenRepliesFeedsToAddToStore(page, comment);

      setState(({ repliesPages, comments }: any) => {
        const newState: any = { repliesPages: { ...repliesPages, [pageCidToAdd]: page } };
        if (hasNewComments) {
          newState.comments = { ...comments, ...newComments };
        }
        return newState;
      });
      log("repliesPagesStore.addNextRepliesPageToStore", {
        pageCid: pageCidToAdd,
        commentCid: comment.cid,
        sortType,
        page,
        account,
      });

      // when publishing a comment, you don't yet know its CID
      // so when a new comment is fetched, check to see if it's your own
      // comment, and if yes, add the CID to your account comments database
      for (const comment of flattenedComments) {
        accountsStore
          .getState()
          .accountsActionsInternal.addCidToAccountComment(comment)
          .catch((error: unknown) =>
            log.error("repliesPagesStore.addNextRepliesPageToStore addCidToAccountComment error", {
              comment,
              error,
            }),
          );
      }
    },

    // comments contain preloaded pages, those page comments must be added separately
    addRepliesPageCommentsToStore: (comment: Comment) => {
      if (!comment.replies?.pages) {
        return;
      }

      // find new comments in the page (missing-or-fresher: insert when absent or incoming is fresher)
      const flattenedComments = utils.flattenCommentsPages(comment.replies.pages);
      const { comments } = getState();
      let hasNewComments = false;
      const newComments: Comments = {};
      for (const c of flattenedComments) {
        if (!c.cid) continue;
        const existing = comments[c.cid];
        const incomingFresh = Math.max(c.updatedAt || 0, c.timestamp || 0, 0);
        const existingFresh = existing
          ? Math.max(existing.updatedAt || 0, existing.timestamp || 0, 0)
          : -1;
        if (!existing || incomingFresh > existingFresh) {
          // don't clone the comment to save memory, comments remain a pointer to the page object
          newComments[c.cid] = c;
          hasNewComments = true;
        }
      }

      if (!hasNewComments) {
        return;
      }

      setState(({ comments }: any) => {
        return { comments: { ...comments, ...newComments } };
      });
      log("repliesPagesStore.addRepliesPageCommentsToStore", { comment, newComments });
    },
  }),
);

// set clients states on comments store so the frontend can display it, dont persist in db because a reload cancels updating
const onCommentRepliesClientsStateChange =
  (commentCid: string) =>
  (clientState: string, clientType: string, sortType: string, clientUrl: string) => {
    commentsStore.setState((state: CommentsState) => {
      // make sure not undefined, sometimes happens in e2e tests
      if (!state.comments[commentCid]) {
        return {};
      }
      const client = { state: clientState };
      const comment = { ...state.comments[commentCid] };
      comment.replies = { ...comment.replies };
      comment.replies.clients = { ...comment.replies.clients };
      comment.replies.clients[clientType] = { ...comment.replies.clients[clientType] };
      comment.replies.clients[clientType][sortType] = {
        ...comment.replies.clients[clientType][sortType],
      };
      comment.replies.clients[clientType][sortType][clientUrl] = client;
      return { comments: { ...state.comments, [commentCid]: comment } };
    });
  };

// cache pkc.createComment per account because sometimes it's slow, recreated when the account's pkc
// client changes, so page fetches don't keep using a replaced client
const fetchPageComments: {
  [accountId: string]: { pkc: any; comments: { [commentCid: string]: any } };
} = {};
// the page fetches in progress per account and page cid, with the pkc client each uses. A new fetch
// waits for one with the same client, or with another client until that one fails, so a replaced
// client doesn't wait for the old client's retries
type PendingPageFetch = { pkc: any; failed: boolean };
let fetchPagePending: { [key: string]: PendingPageFetch[] | undefined } = {};
const pageFetchIsPending = (key: string, pkc: any) =>
  Boolean(fetchPagePending[key]?.some((fetch) => fetch.pkc === pkc || !fetch.failed));
// a page fetch stops retrying once its account was deleted, or setAccount gave the account another
// pkc client, because nothing uses pages fetched with that client anymore. An account the accounts
// store didn't hold when the fetch started keeps retrying
const getShouldRetryPageFetch = (account: Account) => {
  const accountWasStored = Boolean(accountsStore.getState().accounts?.[account.id]);
  return () => {
    const storedAccount = accountsStore.getState().accounts?.[account.id];
    return storedAccount ? storedAccount.pkc === account.pkc : !accountWasStored;
  };
};
const fetchPage = async (
  pageCid: string,
  comment: Comment,
  account: Account,
  pendingFetch?: PendingPageFetch,
) => {
  const shouldRetry = getShouldRetryPageFetch(account);
  // replies page is cached
  const cachedRepliesPage = await repliesPagesDatabase.getItem(pageCid);
  if (cachedRepliesPage) {
    return cachedRepliesPage;
  }
  if (!fetchPageComments[account.id] || fetchPageComments[account.id].pkc !== account.pkc) {
    fetchPageComments[account.id] = { pkc: account.pkc, comments: {} };
  }
  const accountComments = fetchPageComments[account.id].comments;
  if (!accountComments[comment.cid]) {
    accountComments[comment.cid] = await account.pkc.createComment({
      cid: comment.cid,
      postCid: comment.postCid,
      communityAddress: comment.communityAddress,
      depth: comment.depth,
    });
    listeners.push(accountComments[comment.cid]);

    // set clients states on communities store so the frontend can display it
    utils.pageClientsOnStateChange(
      accountComments[comment.cid].replies?.clients,
      onCommentRepliesClientsStateChange(comment.cid),
    );
  }

  const onError = (error: any) => {
    if (pendingFetch) {
      pendingFetch.failed = true;
    }
    log.error(
      `repliesPagesStore comment '${comment.cid}' failed comment.replies.getPage page cid '${pageCid}':`,
      error,
    );
  };
  const fetchedRepliesPage = await utils.retryInfinity(
    () => accountComments[comment.cid].replies.getPage({ cid: pageCid }),
    { onError, shouldRetry },
  );
  await repliesPagesDatabase.setItem(pageCid, utils.clone(fetchedRepliesPage));
  return fetchedRepliesPage;
};

/**
 * Util function to get all pages in the store for a
 * specific comment+sortType using `RepliesPage.nextCid`
 */
export const getRepliesPages = (
  comment: Comment,
  sortType: string | undefined,
  repliesPages: RepliesPages,
) => {
  assert(
    repliesPages && typeof repliesPages === "object",
    `getRepliesPages repliesPages '${repliesPages}' invalid`,
  );
  const pages: RepliesPage[] = [];
  const firstPageCid = getRepliesFirstPageCid(comment, sortType);
  // comment has no pages
  // TODO: if a loaded comment doesn't have a first page, it's unclear what we should do
  // should we try to use another sort type by default, like 'best', or should we just ignore it?
  // 'return pages' to ignore it for now
  if (!firstPageCid) {
    return pages;
  }
  const firstPage = repliesPages[firstPageCid];
  if (!firstPage) {
    return pages;
  }
  pages.push(firstPage);
  while (true) {
    const nextCid = pages[pages.length - 1]?.nextCid;
    const repliesPage = nextCid && repliesPages[nextCid];
    if (!repliesPage) {
      return pages;
    }
    pages.push(repliesPage);
  }
};

export const getRepliesFirstPageCid = (comment: Comment, sortType?: string) => {
  assert(comment?.cid, `getRepliesFirstPageCid comment '${comment}' invalid`);
  assert(
    sortType === undefined || (typeof sortType === "string" && sortType.length > 0),
    `getRepliesFirstPageCid sortType '${sortType}' invalid`,
  );
  // replies served client-side from a complete preloaded page read that page instead of their own
  const pageSortType = getReplyPageSortType(comment, sortType);
  if (!pageSortType) {
    return;
  }
  // comment has preloaded replies for sort type
  if (comment.replies?.pages?.[pageSortType]?.comments) {
    return comment.replies?.pages?.[pageSortType]?.nextCid;
  }
  return comment.replies?.pageCids?.[pageSortType];

  // TODO: if a loaded comment doesn't have a first page, it's unclear what we should do
  // should we try to use another sort type by default, like 'best', or should we just ignore it?
};

// reset store in between tests
const originalState = repliesPagesStore.getState();
// async function because some stores have async init
export const resetRepliesPagesStore = async () => {
  fetchPagePending = {};
  // remove all event listeners
  listeners.forEach((listener: any) => listener.removeAllListeners());
  // destroy all component subscriptions to the store
  repliesPagesStore.destroy();
  // restore original state
  repliesPagesStore.setState(originalState);
};

// reset database and store in between tests
export const resetRepliesPagesDatabaseAndStore = async () => {
  await localForageLru.createInstance({ name: "bitsocialReactHooks-repliesPages" }).clear();
  await resetRepliesPagesStore();
};

export default repliesPagesStore;
