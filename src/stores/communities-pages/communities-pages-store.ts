import utils from "../../lib/utils";
import Logger from "@plebbit/plebbit-logger";
// include communities pages store with feeds for debugging
export const log = Logger("bitsocial-react-hooks:feeds:stores");
import {
  Community,
  CommunityPage,
  CommunitiesPages,
  Account,
  Comment,
  Comments,
} from "../../types";
import accountsStore from "../accounts";
import communitiesStore, { CommunitiesState } from "../communities";
import localForageLru from "../../lib/localforage-lru";
import createStore from "zustand";
import assert from "assert";
import {
  createPlebbitCommunity,
  getPlebbitCreateCommunity,
  normalizeCommentCommunityAddress,
} from "../../lib/plebbit-compat";

const communitiesPagesDatabase = localForageLru.createInstance({
  name: "plebbitReactHooks-communitiesPages",
  size: 500,
});

const getCommunityPageStoreKey = (pageCid: string, pageType: string, accountId?: string) => {
  if (pageType === "modQueue") {
    assert(
      accountId && typeof accountId === "string",
      `getCommunityPageStoreKey accountId '${accountId}' invalid for modQueue`,
    );
    return `${accountId}:${pageCid}`;
  }
  return pageCid;
};

/** Freshness for comparison: max(updatedAt, timestamp, 0). Used to decide add vs replace per CID. Exported for coverage. */
export const getCommentFreshness = (comment: Comment | undefined): number =>
  Math.max(comment?.updatedAt ?? 0, comment?.timestamp ?? 0, 0);

// reset all event listeners in between tests
const listeners: any = [];

type CommunitiesPagesState = {
  communitiesPages: CommunitiesPages;
  comments: Comments;
  addNextCommunityPageToStore: Function;
  invalidateCommunityPages: Function;
  addCommunityPageCommentsToStore: Function;
};

const communitiesPagesStore = createStore<CommunitiesPagesState>(
  (setState: Function, getState: Function) => ({
    // TODO: eventually clear old pages and comments from memory
    communitiesPages: {},
    comments: {},

    addNextCommunityPageToStore: async (
      community: Community,
      sortType: string,
      account: Account,
      modQueue?: string[],
    ) => {
      assert(
        community?.address && typeof community?.address === "string",
        `communitiesPagesStore.addNextCommunityPageToStore community '${community}' invalid`,
      );
      assert(
        sortType && typeof sortType === "string",
        `communitiesPagesStore.addNextCommunityPageToStore sortType '${sortType}' invalid`,
      );
      assert(
        typeof getPlebbitCreateCommunity(account?.plebbit) === "function",
        `communitiesPagesStore.addNextCommunityPageToStore account '${account}' invalid`,
      );
      assert(
        !modQueue || Array.isArray(modQueue),
        `communitiesPagesStore.addNextCommunityPageToStore modQueue '${modQueue}' invalid`,
      );

      let pageType = "posts";
      if (modQueue?.[0]) {
        // TODO: allow multiple modQueue at once, fow now only use first in array
        // TODO: fix 'sortType' is not accurate variable name when pageType is 'modQueue'
        sortType = modQueue[0];
        pageType = "modQueue";
      }

      // check the preloaded posts on community.posts.pages first, then the community.posts.pageCids
      const communityFirstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
      if (!communityFirstPageCid) {
        log(
          `communitiesPagesStore.addNextCommunityPageToStore community '${community?.address}' sortType '${sortType}' no communityFirstPageCid`,
        );
        return;
      }

      // all communities pages in store
      const { communitiesPages } = getState();
      // only specific pages of the community+sortType
      const communityPages = getCommunityPages(
        community,
        sortType,
        communitiesPages,
        pageType,
        account.id,
      );

      // if no pages exist yet, add the first page
      let pageCidToAdd: string;
      if (!communityPages.length) {
        pageCidToAdd = communityFirstPageCid;
      } else {
        const nextCid = communityPages[communityPages.length - 1]?.nextCid;
        // if last nextCid is undefined, reached end of pages
        if (!nextCid) {
          log.trace("communitiesPagesStore.addNextCommunityPageToStore no more pages", {
            communityAddress: community.address,
            sortType,
            account,
          });
          return;
        }

        pageCidToAdd = nextCid;
      }

      // page is already added or pending
      const pageStoreKeyToAdd = getCommunityPageStoreKey(pageCidToAdd, pageType, account.id);
      if (communitiesPages[pageStoreKeyToAdd] || fetchPagePending[pageStoreKeyToAdd]) {
        return;
      }

      fetchPagePending[pageStoreKeyToAdd] = true;
      let page: CommunityPage;
      try {
        page = await fetchPage(pageCidToAdd, community.address, account, pageType);
        log.trace("communitiesPagesStore.addNextCommunityPageToStore community.posts.getPage", {
          pageCid: pageCidToAdd,
          communityAddress: community.address,
          account,
        });
      } catch (e) {
        throw e;
      } finally {
        fetchPagePending[pageStoreKeyToAdd] = false;
      }

      // find new comments in the page
      const flattenedComments = utils.flattenCommentsPages(page);
      const { comments } = getState();
      let hasNewComments = false;
      const newComments: Comments = {};
      if (pageType !== "modQueue") {
        for (const comment of flattenedComments) {
          const normalizedComment = normalizeCommentCommunityAddress(comment) as Comment;
          const existing = comments[normalizedComment.cid];
          if (
            normalizedComment.cid &&
            (!existing || getCommentFreshness(normalizedComment) > getCommentFreshness(existing))
          ) {
            // don't clone the comment to save memory, comments remain a pointer to the page object
            newComments[normalizedComment.cid] = normalizedComment;
            hasNewComments = true;
          }
        }
      }

      setState(({ communitiesPages, comments }: any) => {
        const newState: any = {
          communitiesPages: { ...communitiesPages, [pageStoreKeyToAdd]: page },
        };
        if (hasNewComments) {
          newState.comments = { ...comments, ...newComments };
        }
        return newState;
      });
      log("communitiesPagesStore.addNextCommunityPageToStore", {
        pageCid: pageCidToAdd,
        communityAddress: community.address,
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
          .accountsActionsInternal.addCidToAccountComment(
            normalizeCommentCommunityAddress(comment) as Comment,
          )
          .catch((error: unknown) =>
            log.error(
              "communitiesPagesStore.addNextCommunityPageToStore addCidToAccountComment error",
              { comment, error },
            ),
          );
      }
    },

    invalidateCommunityPages: async (
      community: Community,
      sortType: string,
      modQueue?: string[],
      accountId?: string,
    ) => {
      assert(
        community?.address && typeof community?.address === "string",
        `communitiesPagesStore.invalidateCommunityPages community '${community}' invalid`,
      );
      assert(
        sortType && typeof sortType === "string",
        `communitiesPagesStore.invalidateCommunityPages sortType '${sortType}' invalid`,
      );
      assert(
        !modQueue || Array.isArray(modQueue),
        `communitiesPagesStore.invalidateCommunityPages modQueue '${modQueue}' invalid`,
      );

      let pageType = "posts";
      if (modQueue?.[0]) {
        // TODO: allow multiple modQueue at once, for now only use first in array
        // TODO: fix 'sortType' is not accurate variable name when pageType is 'modQueue'
        sortType = modQueue[0];
        pageType = "modQueue";
      }

      const firstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
      if (!firstPageCid) {
        return;
      }

      const { communitiesPages } = getState();
      const firstPageKey = getCommunityPageStoreKey(firstPageCid, pageType, accountId);
      const pageKeysToInvalidate = new Set<string>([firstPageKey]);
      let nextPageCid = communitiesPages[firstPageKey]?.nextCid;
      while (nextPageCid) {
        const nextPageKey = getCommunityPageStoreKey(nextPageCid, pageType, accountId);
        pageKeysToInvalidate.add(nextPageKey);
        nextPageCid = communitiesPages[nextPageKey]?.nextCid;
      }

      await Promise.all(
        [...pageKeysToInvalidate].map((pageKey) => communitiesPagesDatabase.removeItem(pageKey)),
      );

      setState(({ communitiesPages }: any) => {
        const nextCommunitiesPages = { ...communitiesPages };
        for (const pageKey of pageKeysToInvalidate) {
          delete nextCommunitiesPages[pageKey];
        }
        return { communitiesPages: nextCommunitiesPages };
      });
    },

    // communities contain preloaded pages, those page comments must be added separately
    addCommunityPageCommentsToStore: (community: Community) => {
      if (!community.posts?.pages) {
        return;
      }

      // find new comments in the page
      const flattenedComments = utils.flattenCommentsPages(community.posts.pages);
      const { comments } = getState();
      let hasNewComments = false;
      const newComments: Comments = {};
      for (const comment of flattenedComments) {
        const existing = comments[comment.cid];
        if (
          comment.cid &&
          (!existing || getCommentFreshness(comment) > getCommentFreshness(existing))
        ) {
          // don't clone the comment to save memory, comments remain a pointer to the page object
          newComments[comment.cid] = comment;
          hasNewComments = true;
        }
      }

      if (!hasNewComments) {
        return;
      }

      setState(({ comments }: any) => {
        return { comments: { ...comments, ...newComments } };
      });
      log("communitiesPagesStore.addCommunityPageCommentsToStore", { community, newComments });
    },
  }),
);

// set clients states on communities store so the frontend can display it, dont persist in db because a reload cancels updating
const onCommunityPostsClientsStateChange =
  (communityAddress: string) =>
  (clientState: string, clientType: string, sortType: string, clientUrl: string) => {
    communitiesStore.setState((state: CommunitiesState) => {
      // make sure not undefined, sometimes happens in e2e tests
      if (!state.communities[communityAddress]) {
        return {};
      }
      const client = { state: clientState };
      const community = { ...state.communities[communityAddress] };
      community.posts = { ...community.posts };
      community.posts.clients = { ...community.posts.clients };
      community.posts.clients[clientType] = { ...community.posts.clients[clientType] };
      community.posts.clients[clientType][sortType] = {
        ...community.posts.clients[clientType][sortType],
      };
      community.posts.clients[clientType][sortType][clientUrl] = client;
      return { communities: { ...state.communities, [community.address]: community } };
    });
  };

const fetchPageCommunities: {
  [accountId: string]: { plebbit: any; communities: { [communityAddress: string]: any } };
} = {}; // cache created community clients per account because creating them can be slow
let fetchPagePending: { [key: string]: boolean } = {};
const fetchPage = async (
  pageCid: string,
  communityAddress: string,
  account: Account,
  pageType: string,
) => {
  // community page is cached
  const pageStoreKey = getCommunityPageStoreKey(pageCid, pageType, account.id);
  const cachedCommunityPage = await communitiesPagesDatabase.getItem(pageStoreKey);
  if (cachedCommunityPage) {
    return cachedCommunityPage;
  }
  if (
    !fetchPageCommunities[account.id] ||
    fetchPageCommunities[account.id].plebbit !== account.plebbit
  ) {
    fetchPageCommunities[account.id] = { plebbit: account.plebbit, communities: {} };
  }
  const accountCommunities = fetchPageCommunities[account.id].communities;
  if (!accountCommunities[communityAddress]) {
    accountCommunities[communityAddress] = await createPlebbitCommunity(account.plebbit, {
      address: communityAddress,
    });
    listeners.push(accountCommunities[communityAddress]);

    // set clients states on communities store so the frontend can display it
    utils.pageClientsOnStateChange(
      accountCommunities[communityAddress][pageType]?.clients,
      onCommunityPostsClientsStateChange(communityAddress),
    );
  }

  const onError = (error: any) =>
    log.error(
      `communitiesPagesStore community '${communityAddress}' failed community.posts.getPage page cid '${pageCid}':`,
      error,
    );
  const fetchedCommunityPage = await utils.retryInfinity(
    () => accountCommunities[communityAddress][pageType].getPage({ cid: pageCid }),
    { onError },
  );
  await communitiesPagesDatabase.setItem(pageStoreKey, utils.clone(fetchedCommunityPage));
  return fetchedCommunityPage;
};

/**
 * Util function to get all pages in the store for a
 * specific community+sortType using `CommunityPage.nextCid`
 */
export const getCommunityPages = (
  community: Community,
  sortType: string,
  communitiesPages: CommunitiesPages,
  pageType: string,
  accountId?: string,
) => {
  assert(
    communitiesPages && typeof communitiesPages === "object",
    `getCommunityPages communitiesPages '${communitiesPages}' invalid`,
  );
  const pages: CommunityPage[] = [];
  const firstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
  // community has no pages
  // TODO: if a loaded community doesn't have a first page, it's unclear what we should do
  // should we try to use another sort type by default, like 'hot', or should we just ignore it?
  // 'return pages' to ignore it for now
  if (!firstPageCid) {
    return pages;
  }
  const firstPage = communitiesPages[getCommunityPageStoreKey(firstPageCid, pageType, accountId)];
  if (!firstPage) {
    return pages;
  }
  pages.push(firstPage);
  while (true) {
    const nextCid = pages[pages.length - 1]?.nextCid;
    const nextPageKey = nextCid && getCommunityPageStoreKey(nextCid, pageType, accountId);
    const communityPage = nextPageKey && communitiesPages[nextPageKey];
    if (!communityPage) {
      return pages;
    }
    pages.push(communityPage);
  }
};

export const getCommunityFirstPageCid = (
  community: Community,
  sortType: string,
  pageType = "posts",
) => {
  assert(community?.address, `getCommunityFirstPageCid community '${community}' invalid`);
  assert(
    sortType && typeof sortType === "string",
    `getCommunityFirstPageCid sortType '${sortType}' invalid`,
  );
  // community has preloaded posts for sort type
  if (community[pageType]?.pages?.[sortType]?.comments) {
    return community[pageType]?.pages?.[sortType]?.nextCid;
  }
  return community[pageType]?.pageCids?.[sortType];

  // TODO: if a loaded community doesn't have a first page, it's unclear what we should do
  // should we try to use another sort type by default, like 'hot', or should we just ignore it?
};

// reset store in between tests
const originalState = communitiesPagesStore.getState();
// async function because some stores have async init
export const resetCommunitiesPagesStore = async () => {
  fetchPagePending = {};
  for (const accountId in fetchPageCommunities) {
    delete fetchPageCommunities[accountId];
  }
  // remove all event listeners
  listeners.forEach((listener: any) => listener.removeAllListeners());
  listeners.length = 0;
  // destroy all component subscriptions to the store
  communitiesPagesStore.destroy();
  // restore original state
  communitiesPagesStore.setState(originalState);
};

// reset database and store in between tests
export const resetCommunitiesPagesDatabaseAndStore = async () => {
  await localForageLru.createInstance({ name: "plebbitReactHooks-communitiesPages" }).clear();
  await resetCommunitiesPagesStore();
};

export default communitiesPagesStore;
