import assert from "assert";
import {
  Comment,
  Feed,
  Feeds,
  FeedOptions,
  FeedsOptions,
  Community,
  Communities,
  Account,
  Accounts,
  CommunityPage,
  CommunitiesPages,
  FeedsCommunitiesPostCounts,
} from "../../types";
import { getCommunityPages, getCommunityFirstPageCid } from "../communities-pages";
import accountsStore from "../accounts";
import feedSorter from "./feed-sorter";
import { communityPostsCacheExpired, commentIsValid, removeInvalidComments } from "../../lib/utils";
import { getCommentCommunityAddress, normalizeCommentCommunityAddress } from "../../lib/pkc-compat";
import {
  CommunityLookupRef,
  doesAddressMatchCommunityRef,
  getCommunityRefKeys,
  getMatchingCommunityRefKeys,
} from "../../lib/community-ref";
import Logger from "@pkcprotocol/pkc-logger";
import { resolvePostSortType } from "../../lib/page-sorts";
const log = Logger("bitsocial-react-hooks:feeds:stores");

const getFeedCommunityRefs = (feedOptions: Partial<FeedOptions>): CommunityLookupRef[] =>
  feedOptions.communities || [];

const getFeedCommunityKeys = (feedOptions: Partial<FeedOptions>) =>
  feedOptions.communityKeys || getCommunityRefKeys(getFeedCommunityRefs(feedOptions));

const getCommentFreshness = (comment: Comment | undefined) =>
  Math.max(comment?.updatedAt ?? 0, comment?.timestamp ?? 0, 0);

const commentMatchesModQueue = (comment: Comment | undefined, modQueue?: string[]) => {
  const modQueueName = modQueue?.[0];
  if (!modQueueName) {
    return true;
  }
  if (modQueueName === "pendingApproval") {
    return comment?.pendingApproval === true;
  }
  return true;
};

const getFeedPost = (
  post: Comment,
  communityRef: CommunityLookupRef,
  community: Community,
  modQueue?: string[],
  freshestComments?: { [commentCid: string]: Comment },
) => {
  const normalizedPost = normalizeCommentCommunityAddress(post) as Comment;
  const freshestComment = post.cid
    ? normalizeCommentCommunityAddress(freshestComments?.[post.cid])
    : undefined;
  const postCommunityAddress = getCommentCommunityAddress(normalizedPost);
  if (!doesAddressMatchCommunityRef(postCommunityAddress, communityRef, community)) {
    return;
  }
  if (!commentMatchesModQueue(normalizedPost, modQueue)) {
    return;
  }
  if (
    !freshestComment ||
    getCommentFreshness(freshestComment) <= getCommentFreshness(normalizedPost)
  ) {
    return normalizedPost;
  }
  if (!commentMatchesModQueue(freshestComment, modQueue)) {
    return;
  }
  if (
    !doesAddressMatchCommunityRef(
      getCommentCommunityAddress(freshestComment),
      communityRef,
      community,
    )
  ) {
    return;
  }
  return freshestComment;
};

const reconcileLoadedModQueueFeed = (
  feedOptions: FeedOptions,
  loadedFeed: Feed,
  filteredSortedFeed: Feed,
) => {
  if (!feedOptions?.modQueue?.[0] || !loadedFeed?.length) {
    return loadedFeed;
  }

  const filteredSortedFeedByCid = new Map<string, Comment>();
  for (const post of filteredSortedFeed) {
    if (post.cid) {
      filteredSortedFeedByCid.set(post.cid, post);
    }
  }

  let changed = false;
  const nextLoadedFeed: Comment[] = [];
  for (const post of loadedFeed) {
    if (!post.cid) {
      nextLoadedFeed.push(post);
      continue;
    }

    const sourcePost = filteredSortedFeedByCid.get(post.cid);
    if (!sourcePost) {
      changed = true;
      continue;
    }

    if (getCommentFreshness(sourcePost) > getCommentFreshness(post)) {
      nextLoadedFeed.push(sourcePost);
      changed = true;
      continue;
    }

    nextLoadedFeed.push(post);
  }

  return changed ? nextLoadedFeed : loadedFeed;
};

/**
 * Calculate the feeds from all the loaded community pages, filter and sort them
 */
export const getFilteredSortedFeeds = (
  feedsOptions: FeedsOptions,
  communities: Communities,
  communitiesPages: CommunitiesPages,
  accounts: Accounts,
  freshestComments?: { [commentCid: string]: Comment },
) => {
  // calculate each feed
  let feeds: Feeds = {};
  for (const feedName in feedsOptions) {
    const communityRefs = getFeedCommunityRefs(feedsOptions[feedName]);
    const communityKeys = getFeedCommunityKeys(feedsOptions[feedName]);
    let { sortType, accountId, filter, newerThan, modQueue } = feedsOptions[feedName];
    const newerThanTimestamp = newerThan ? Math.floor(Date.now() / 1000) - newerThan : undefined;

    let pageType = "posts";
    if (modQueue?.[0]) {
      // TODO: allow multiple modQueue at once, fow now only use first in array
      sortType = modQueue[0];
      pageType = "modQueue";
    }

    // find all fetched posts
    const bufferedFeedPosts = [];

    // add each comment from each page, do not filter at this stage, filter after sorting
    for (const [communityIndex, communityKey] of communityKeys.entries()) {
      const communityRef = communityRefs[communityIndex];
      // community hasn't loaded yet
      const community = communities[communityKey];
      if (!community || !communityRef) {
        continue;
      }

      // if cache is expired and has internet access, don't use, wait for next community update
      if (communityPostsCacheExpired(community) && window.navigator.onLine) {
        continue;
      }

      // use community preloaded posts if any
      const preloadedPosts = getPreloadedPosts(community, sortType);
      if (preloadedPosts) {
        for (const post of preloadedPosts) {
          // posts are manually validated, could have fake communityAddress
          if (
            !doesAddressMatchCommunityRef(getCommentCommunityAddress(post), communityRef, community)
          ) {
            break;
          }
          const nextPost = getFeedPost(post, communityRef, community, modQueue, freshestComments);
          if (nextPost) {
            bufferedFeedPosts.push(nextPost);
          }
        }
      }

      // add all posts from community pages
      const communityPages = getCommunityPages(
        community,
        sortType,
        communitiesPages,
        pageType,
        accountId,
      );
      for (const communityPage of communityPages) {
        if (communityPage?.comments) {
          for (const post of communityPage.comments) {
            // posts are manually validated, could have fake communityAddress
            if (
              !doesAddressMatchCommunityRef(
                getCommentCommunityAddress(post),
                communityRef,
                community,
              )
            ) {
              break;
            }
            const nextPost = getFeedPost(post, communityRef, community, modQueue, freshestComments);
            if (nextPost) {
              bufferedFeedPosts.push(nextPost);
            }
          }
        }
      }
    }

    // sort the feed before filtering to get more accurate results
    const resolvedDefaultSortTypes = communityKeys.map((communityKey) =>
      resolvePostSortType(communities[communityKey], feedsOptions[feedName].sortType),
    );
    const uniqueResolvedDefaultSortTypes = new Set(resolvedDefaultSortTypes);
    const originalSortType =
      feedsOptions[feedName].sortType ||
      (uniqueResolvedDefaultSortTypes.size === 1 ? resolvedDefaultSortTypes[0] : undefined);
    const sortedBufferedFeedPosts = feedSorter.sort(originalSortType, bufferedFeedPosts);

    // filter the feed
    const filteredSortedBufferedFeedPosts = [];
    for (const post of sortedBufferedFeedPosts) {
      // address is blocked
      if (
        accounts[accountId]?.blockedAddresses[getCommentCommunityAddress(post) || ""] ||
        (post.author?.address && accounts[accountId]?.blockedAddresses[post.author.address])
      ) {
        continue;
      }

      // comment cid is blocked
      if (accounts[accountId]?.blockedCids[post.cid]) {
        continue;
      }

      // if a feed has more than 1 sub, don't include pinned posts
      // TODO: add test to check if pinned are filtered
      if (post.pinned && communityKeys.length > 1) {
        continue;
      }

      // feedOptions filter function
      if (filter && !filter.filter(post)) {
        continue;
      }

      // filter posts older than newerThan option
      if (newerThanTimestamp) {
        if (originalSortType === "active") {
          if ((post.lastReplyTimestamp || post.timestamp) <= newerThanTimestamp) {
            continue;
          }
        } else {
          if (post.timestamp <= newerThanTimestamp) {
            continue;
          }
        }
      }

      filteredSortedBufferedFeedPosts.push(post);
    }

    feeds[feedName] = filteredSortedBufferedFeedPosts;
  }
  return feeds;
};

const getPreloadedPosts = (community: Community, sortType?: string) => {
  const resolvedSortType = resolvePostSortType(community, sortType);
  if (!resolvedSortType) {
    return;
  }
  return community.posts?.pages?.[resolvedSortType]?.comments;
};

export const getLoadedFeeds = async (
  feedsOptions: FeedsOptions,
  filteredSortedFeeds: Feeds,
  loadedFeeds: Feeds,
  bufferedFeeds: Feeds,
  accounts: Accounts,
) => {
  const nextLoadedFeeds: Feeds = { ...loadedFeeds };
  let loadedFeedsChanged = false;
  for (const feedName in feedsOptions) {
    const { pageNumber, postsPerPage, accountId } = feedsOptions[feedName];
    const pkc = accounts[accountId]?.pkc;
    const loadedFeedPostCount = pageNumber * postsPerPage;
    const currentLoadedFeed = reconcileLoadedModQueueFeed(
      feedsOptions[feedName],
      loadedFeeds[feedName] || [],
      filteredSortedFeeds[feedName] || [],
    );
    if (currentLoadedFeed !== loadedFeeds[feedName]) {
      nextLoadedFeeds[feedName] = currentLoadedFeed;
      loadedFeedsChanged = true;
    }
    const missingPostsCount =
      loadedFeedPostCount - currentLoadedFeed.filter((post) => post.index === undefined).length;

    // get new posts from buffered feed
    const bufferedFeed = bufferedFeeds[feedName] || [];

    let missingPosts: any[] = [];
    for (const post of bufferedFeed) {
      if (missingPosts.length >= missingPostsCount) {
        missingPosts = await removeInvalidComments(missingPosts, { validateReplies: false }, pkc);
        // only stop if there were no invalid comments
        if (missingPosts.length >= missingPostsCount) {
          break;
        }
      }
      missingPosts.push(post);
    }

    // the current loaded feed already exist and doesn't need new posts
    if (
      missingPosts.length === 0 &&
      loadedFeeds[feedName] &&
      currentLoadedFeed === loadedFeeds[feedName]
    ) {
      continue;
    }
    nextLoadedFeeds[feedName] = [...currentLoadedFeed, ...missingPosts];
    if (missingPosts.length > 0) {
      loadedFeedsChanged = true;
    }
  }

  // add account comments
  const accountCommentsChangedFeeds = addAccountsComments(feedsOptions, nextLoadedFeeds);

  // do nothing if there are no missing posts
  if (!loadedFeedsChanged && !accountCommentsChangedFeeds) {
    return loadedFeeds;
  }
  return nextLoadedFeeds;
};

const getApprovalPublicationKey = (comment: Comment) =>
  [
    comment.timestamp ?? "",
    comment.parentCid ?? "",
    comment.postCid ?? "",
    getCommentCommunityAddress(comment) ?? "",
    comment.author?.address ?? "",
    comment.title ?? "",
    comment.content ?? "",
    comment.link ?? "",
  ].join("\0");

export const addAccountsComments = (feedsOptions: FeedsOptions, loadedFeeds: Feeds) => {
  let loadedFeedsChanged = false;
  const accountsComments = accountsStore.getState().accountsComments || {};
  for (const feedName in feedsOptions) {
    const { accountId, accountComments: accountCommentsOptions } = feedsOptions[feedName];
    const communityRefs = getFeedCommunityRefs(feedsOptions[feedName]);
    const { newerThan, append } = accountCommentsOptions || {};
    if (!newerThan) {
      continue;
    }
    const newerThanTimestamp =
      newerThan === Infinity ? 0 : Math.floor(Date.now() / 1000) - newerThan;
    const isNewerThan = (post: Comment) => post.timestamp > newerThanTimestamp;

    const accountComments = accountsComments[accountId] || [];
    const accountPosts = accountComments.filter((comment) => {
      // is a reply, not a post
      if (comment.parentCid || comment.depth > 0) {
        return false;
      }
      if (!isNewerThan(comment)) {
        return false;
      }
      return (
        getMatchingCommunityRefKeys(communityRefs, getCommentCommunityAddress(comment)).length > 0
      );
    });
    const validAccountIndices = new Set(accountPosts.map((p) => p.index));
    const accountCidToPost = new Map<string, Comment>();
    for (const p of accountPosts) {
      if (p.cid) accountCidToPost.set(p.cid, p);
    }

    let loadedFeed = loadedFeeds[feedName] || [];
    const approvedPublicationKeys = new Set(
      loadedFeed
        .filter((post) => post.pendingApproval !== true)
        .map((post) => getApprovalPublicationKey(post)),
    );
    // prune stale local-account entries and replace when cid matches but index changed
    const prunedLoadedFeed: Comment[] = [];
    for (const post of loadedFeed) {
      if (post.index === undefined) {
        prunedLoadedFeed.push(post);
        continue;
      }
      if (
        post.pendingApproval === true &&
        approvedPublicationKeys.has(getApprovalPublicationKey(post))
      ) {
        loadedFeedsChanged = true;
        continue;
      }
      if (!validAccountIndices.has(post.index)) {
        loadedFeedsChanged = true;
        continue;
      }
      if (post.cid) {
        const freshAccountPost = accountCidToPost.get(post.cid);
        if (freshAccountPost && freshAccountPost.index !== post.index) {
          prunedLoadedFeed.push(freshAccountPost);
          loadedFeedsChanged = true;
          continue;
        }
      }
      prunedLoadedFeed.push(post);
    }
    loadedFeed = loadedFeeds[feedName] = prunedLoadedFeed;

    if (!accountPosts.length) {
      continue;
    }
    // if a loaded comment doesn't have a cid, then it's pending
    // and pending account comments should always have unique timestamps
    const loadedFeedMap = new Map();
    loadedFeed.forEach((post, loadedFeedIndex) => {
      if (post.cid) loadedFeedMap.set(post.cid, loadedFeedIndex);
      if (typeof post.index === "number") loadedFeedMap.set(post.index, loadedFeedIndex);
      if (!post.cid) loadedFeedMap.set(post.timestamp, loadedFeedIndex);
      if (post.pendingApproval !== true) {
        loadedFeedMap.set(getApprovalPublicationKey(post), loadedFeedIndex);
      }
    });
    for (const accountPost of accountPosts) {
      // account post with cid already added
      if (accountPost.cid && loadedFeedMap.has(accountPost.cid)) {
        continue;
      }
      if (
        accountPost.pendingApproval === true &&
        loadedFeedMap.has(getApprovalPublicationKey(accountPost))
      ) {
        continue;
      }
      // account post without cid already added, but now we have the cid
      if (accountPost.cid && loadedFeedMap.has(accountPost.index)) {
        const loadedFeedIndex = loadedFeedMap.get(accountPost.index);
        // update the feed with the accountPost.cid now that we have it
        loadedFeed[loadedFeedIndex] = accountPost;
        loadedFeedsChanged = true;
        continue;
      }
      if (loadedFeedMap.has(accountPost.index)) {
        continue;
      }
      // pending account post without cid already added
      if (!accountPost.cid && loadedFeedMap.has(accountPost.timestamp)) {
        continue;
      }
      if (append) {
        loadedFeed.push(accountPost);
      } else {
        loadedFeed.unshift(accountPost);
      }
      loadedFeedsChanged = true;
    }
  }
  return loadedFeedsChanged;
};

export const getBufferedFeedsWithoutLoadedFeeds = (bufferedFeeds: Feeds, loadedFeeds: Feeds) => {
  // contruct a list of posts already loaded to remove them from buffered feeds
  const loadedFeedsPosts: { [key: string]: Set<string> } = {};
  for (const feedName in loadedFeeds) {
    loadedFeedsPosts[feedName] = new Set();
    for (const post of loadedFeeds[feedName]) {
      loadedFeedsPosts[feedName].add(post.cid);
    }
  }

  const newBufferedFeeds: Feeds = {};
  for (const feedName in bufferedFeeds) {
    newBufferedFeeds[feedName] = [];
    let bufferedFeedPostChanged = false;
    for (const [i, post] of bufferedFeeds[feedName].entries()) {
      if (loadedFeedsPosts[feedName]?.has(post.cid)) {
        continue;
      }
      newBufferedFeeds[feedName].push(post);
      if (
        !bufferedFeedPostChanged &&
        (newBufferedFeeds[feedName][i]?.cid !== bufferedFeeds[feedName][i]?.cid ||
          (newBufferedFeeds[feedName][i]?.updatedAt || 0) >
            (bufferedFeeds[feedName][i]?.updatedAt || 0))
      ) {
        bufferedFeedPostChanged = true;
      }
    }
    if (
      !bufferedFeedPostChanged &&
      newBufferedFeeds[feedName].length === bufferedFeeds[feedName].length
    ) {
      newBufferedFeeds[feedName] = bufferedFeeds[feedName];
    }
  }
  return newBufferedFeeds;
};

export const getUpdatedFeeds = async (
  feedsOptions: FeedsOptions,
  filteredSortedFeeds: Feeds,
  updatedFeeds: Feeds,
  loadedFeeds: Feeds,
  accounts: Accounts,
) => {
  // contruct a list of posts already loaded to remove them from buffered feeds
  const updatedFeedsPosts: { [feedName: string]: { [postCid: string]: any } } = {};
  for (const feedName in updatedFeeds) {
    updatedFeedsPosts[feedName] = {};
    for (const [index, updatedPost] of updatedFeeds[feedName].entries()) {
      updatedFeedsPosts[feedName][updatedPost.cid] = { index, updatedPost };
    }
  }

  const newUpdatedFeeds: Feeds = { ...updatedFeeds };
  for (const feedName in filteredSortedFeeds) {
    const pkc = accounts[feedsOptions[feedName]?.accountId]?.pkc;
    const updatedFeed = [...(updatedFeeds[feedName] || [])];
    const onlyHasNewPosts = updatedFeed.length === 0;
    let updatedFeedChanged = false;

    // add new posts from loadedFeed posts
    while (updatedFeed.length < loadedFeeds[feedName].length) {
      updatedFeed[updatedFeed.length] = loadedFeeds[feedName][updatedFeed.length];
      updatedFeedChanged = true;
    }

    // add updated post from filteredSortedFeed
    if (!onlyHasNewPosts) {
      const promises = [];
      for (const post of filteredSortedFeeds[feedName]) {
        if (updatedFeedsPosts[feedName]?.[post.cid]) {
          const { index, updatedPost } = updatedFeedsPosts[feedName][post.cid];
          // faster to validate comments async
          promises.push(
            (async () => {
              if (
                (post.updatedAt || 0) > (updatedPost.updatedAt || 0) &&
                (await commentIsValid(post, { validateReplies: false }, pkc))
              ) {
                updatedFeed[index] = post;
                updatedFeedChanged = true;
              }
            })(),
          );
        }
      }
      await Promise.all(promises);
    }

    if (updatedFeedChanged) {
      newUpdatedFeeds[feedName] = updatedFeed;
    }
  }
  return newUpdatedFeeds;
};

// find with communities have posts newer (or ranked higher) than the loaded feeds
// can be used to display "new posts in x, y, z subs" alert, like on twitter
export const getFeedsCommunityKeysWithNewerPosts = (
  feedsOptions: FeedsOptions,
  filteredSortedFeeds: Feeds,
  loadedFeeds: Feeds,
  previousFeedsCommunityKeysWithNewerPosts: { [feedName: string]: string[] },
) => {
  const feedsCommunityKeysWithNewerPosts: { [feedName: string]: string[] } = {};
  for (const feedName in loadedFeeds) {
    const loadedFeed = loadedFeeds[feedName];
    const cidsInLoadedFeed = new Set();
    for (const post of loadedFeed) {
      cidsInLoadedFeed.add(post.cid);
    }
    const communityKeysWithNewerPostsSet = new Set<string>();
    for (const [i, post] of filteredSortedFeeds[feedName].entries()) {
      if (i >= loadedFeed.length) {
        break;
      }
      // if any post in filteredSortedFeeds ranks higher than the loaded feed count, it's a newer post
      if (!cidsInLoadedFeed.has(post.cid)) {
        const postCommunityAddress = getCommentCommunityAddress(post);
        if (postCommunityAddress) {
          getMatchingCommunityRefKeys(
            getFeedCommunityRefs(feedsOptions[feedName] || {}),
            postCommunityAddress,
          ).forEach((communityKey) => communityKeysWithNewerPostsSet.add(communityKey));
        }
      }
    }
    const communityKeysWithNewerPosts = [...communityKeysWithNewerPostsSet];

    // don't update the array if the data is the same to avoid rerenders
    const previousCommunityKeysWithNewerPosts =
      previousFeedsCommunityKeysWithNewerPosts[feedName] || [];
    if (
      communityKeysWithNewerPosts.length === previousCommunityKeysWithNewerPosts.length &&
      communityKeysWithNewerPosts.toString() === previousCommunityKeysWithNewerPosts.toString()
    ) {
      feedsCommunityKeysWithNewerPosts[feedName] =
        previousFeedsCommunityKeysWithNewerPosts[feedName];
    } else {
      feedsCommunityKeysWithNewerPosts[feedName] = communityKeysWithNewerPosts;
    }
  }
  return feedsCommunityKeysWithNewerPosts;
};

// find how many posts are left in each communities in a buffereds feeds
export const getFeedsCommunitiesPostCounts = (feedsOptions: FeedsOptions, feeds: Feeds) => {
  const feedsCommunitiesPostCounts: FeedsCommunitiesPostCounts = {};
  for (const feedName in feedsOptions) {
    const communityKeys = getFeedCommunityKeys(feedsOptions[feedName]);
    const communityRefs = getFeedCommunityRefs(feedsOptions[feedName]);
    feedsCommunitiesPostCounts[feedName] = {};
    for (const communityKey of communityKeys) {
      feedsCommunitiesPostCounts[feedName][communityKey] = 0;
    }
    for (const comment of feeds[feedName] || []) {
      const commentCommunityAddress = getCommentCommunityAddress(comment);
      if (commentCommunityAddress) {
        getMatchingCommunityRefKeys(communityRefs, commentCommunityAddress).forEach(
          (communityKey) => {
            feedsCommunitiesPostCounts[feedName][communityKey] =
              (feedsCommunitiesPostCounts[feedName][communityKey] || 0) + 1;
          },
        );
      }
    }
  }
  return feedsCommunitiesPostCounts;
};

/**
 * Get which feeds have more posts, i.e. have not reached the final page of all subs
 */
export const getFeedsHaveMore = (
  feedsOptions: FeedsOptions,
  bufferedFeeds: Feeds,
  communities: Communities,
  communitiesPages: CommunitiesPages,
  accounts: Accounts,
) => {
  const feedsHaveMore: { [feedName: string]: boolean } = {};
  feedsLoop: for (const feedName in feedsOptions) {
    // if the feed still has buffered posts, then it still has more
    if (bufferedFeeds[feedName]?.length) {
      feedsHaveMore[feedName] = true;
      continue feedsLoop;
    }

    const communityRefs = getFeedCommunityRefs(feedsOptions[feedName]);
    const communityKeys = getFeedCommunityKeys(feedsOptions[feedName]);
    let { sortType, accountId, modQueue } = feedsOptions[feedName];

    let pageType = "posts";
    if (modQueue?.[0]) {
      // TODO: allow multiple modQueue at once, fow now only use first in array
      sortType = modQueue[0];
      pageType = "modQueue";
    }

    communityKeysLoop: for (const [communityIndex, communityKey] of communityKeys.entries()) {
      const community = communities[communityKey];
      const communityRef = communityRefs[communityIndex];
      const isBlockedCommunity = Object.keys(accounts[accountId]?.blockedAddresses || {}).some(
        (blockedAddress) =>
          communityRef && doesAddressMatchCommunityRef(blockedAddress, communityRef, community),
      );

      // don't consider the sub if the address is blocked
      if (isBlockedCommunity) {
        continue communityKeysLoop;
      }

      // if at least 1 community hasn't loaded yet, then the feed still has more
      if (!community?.updatedAt) {
        feedsHaveMore[feedName] = true;
        continue feedsLoop;
      }

      // if at least 1 community has posts cache expired, then the feed still has more
      if (communityPostsCacheExpired(community)) {
        feedsHaveMore[feedName] = true;
        continue feedsLoop;
      }

      const firstPageCid = getCommunityFirstPageCid(community, sortType, pageType);
      // TODO: if a loaded community doesn't have a first page, it's unclear what we should do
      // should we try to use another sort type by default, like 'hot', or should we just ignore it?
      // 'continue' to ignore it for now
      if (!firstPageCid) {
        continue communityKeysLoop;
      }
      const pages = getCommunityPages(community, sortType, communitiesPages, pageType, accountId);
      // if first page isn't loaded yet, then the feed still has more
      if (!pages.length) {
        feedsHaveMore[feedName] = true;
        continue feedsLoop;
      }
      const lastPage = pages[pages.length - 1];
      if (lastPage.nextCid) {
        feedsHaveMore[feedName] = true;
        continue feedsLoop;
      }
    }

    // if buffered feeds are empty and no last page of any community has a next page, then has more is false
    feedsHaveMore[feedName] = false;
  }
  return feedsHaveMore;
};

// get all communities pages cids of all feeds, use to check if a communitiesStore change should trigger updateFeeds
export const getFeedsCommunities = (feedsOptions: FeedsOptions, communities: Communities) => {
  // find all feeds communities
  const feedsCommunityAddresses = new Set<string>();
  Object.keys(feedsOptions).forEach((i) =>
    getFeedCommunityKeys(feedsOptions[i]).forEach((a) => feedsCommunityAddresses.add(a)),
  );

  // use map for performance increase when checking size
  const feedsCommunities = new Map<string, Community>();
  for (const communityAddress of feedsCommunityAddresses) {
    feedsCommunities.set(communityAddress, communities[communityAddress]);
  }
  return feedsCommunities;
};

export const feedsCommunitiesChanged = (
  previousFeedsCommunities: Map<string, Community>,
  feedsCommunities: Map<string, Community>,
) => {
  if (previousFeedsCommunities.size !== feedsCommunities.size) {
    return true;
  }
  for (let communityAddress of previousFeedsCommunities.keys()) {
    // check if the object is still the same
    if (previousFeedsCommunities.get(communityAddress) !== feedsCommunities.get(communityAddress)) {
      return true;
    }
  }
  return false;
};

// get all communities pages cids of all feeds, use to check if a communitiesStore change should trigger updateFeeds
export const getFeedsCommunitiesFirstPageCids = (
  feedsCommunities: Map<string, Community>,
): string[] => {
  // find all the feeds communities first page cids
  const feedsCommunitiesFirstPageCids = new Set<string>();
  for (const community of feedsCommunities.values()) {
    if (!community?.posts && !community?.modQueue) {
      continue;
    }

    // check pages
    if (community.posts?.pages) {
      for (const page of Object.values<CommunityPage>(community.posts.pages)) {
        if (page?.nextCid) {
          feedsCommunitiesFirstPageCids.add(page?.nextCid);
        }
      }
    }

    // check pageCids
    if (community.posts?.pageCids) {
      for (const pageCid of Object.values<string>(community.posts.pageCids)) {
        if (pageCid) {
          feedsCommunitiesFirstPageCids.add(pageCid);
        }
      }
    }

    // TODO: would be more performant to only check modQueue if there's a feedOptions with modQueue
    if (community.modQueue?.pageCids) {
      for (const pageCid of Object.values<string>(community.modQueue.pageCids)) {
        if (pageCid) {
          feedsCommunitiesFirstPageCids.add(pageCid);
        }
      }
    }
  }

  return [...feedsCommunitiesFirstPageCids].sort();
};

// get all communities posts pages first post updatedAts, use to check if a communitiesStore change should trigger updateFeeds
export const getFeedsCommunitiesPostsPagesFirstUpdatedAts = (
  feedsCommunities: Map<string, Community>,
): string => {
  let feedsCommunitiesPostsPagesFirstUpdatedAts = "";
  for (const community of feedsCommunities.values()) {
    for (const page of Object.values<CommunityPage>(community?.posts?.pages || {})) {
      if (page?.comments?.[0]?.updatedAt) {
        feedsCommunitiesPostsPagesFirstUpdatedAts +=
          page.comments[0].cid + page.comments[0].updatedAt;
      }
    }
  }
  return feedsCommunitiesPostsPagesFirstUpdatedAts;
};

// get number of feeds community that are loaded
export const getFeedsCommunitiesLoadedCount = (
  feedsCommunities: Map<string, Community>,
): number => {
  let count = 0;
  for (const community of feedsCommunities.values()) {
    if (community?.updatedAt) {
      count++;
    }
  }
  return count;
};

export const getAccountsBlockedAddresses = (accounts: Accounts) => {
  const blockedAddressesSet = new Set<string>();
  for (const { blockedAddresses } of Object.values(accounts)) {
    for (const address in blockedAddresses) {
      if (blockedAddresses[address]) {
        blockedAddressesSet.add(address);
      }
    }
  }
  return [...blockedAddressesSet].sort();
};

export const accountsBlockedAddressesChanged = (
  previousAccountsBlockedAddresses: { [address: string]: boolean }[],
  accountsBlockedAddresses: { [address: string]: boolean }[],
) => {
  if (previousAccountsBlockedAddresses.length !== accountsBlockedAddresses.length) {
    return true;
  }
  for (const i in previousAccountsBlockedAddresses) {
    // check if the object is still the same
    if (previousAccountsBlockedAddresses[i] !== accountsBlockedAddresses[i]) {
      return true;
    }
  }
  return false;
};

export const feedsHaveChangedBlockedAddresses = (
  feedsOptions: FeedsOptions,
  bufferedFeeds: Feeds,
  blockedAddresses: string[],
  previousBlockedAddresses: string[],
) => {
  // find the difference between current and previous blocked addresses
  const changedBlockedAddresses = blockedAddresses
    .filter((x) => !previousBlockedAddresses.includes(x))
    .concat(previousBlockedAddresses.filter((x) => !blockedAddresses.includes(x)));

  // if changed blocked addresses arent used in the feeds, do nothing
  for (const address of changedBlockedAddresses) {
    for (const feedName in feedsOptions) {
      const feedOptions = feedsOptions[feedName];
      if (
        getMatchingCommunityRefKeys(getFeedCommunityRefs(feedOptions), address).some(
          (communityKey) => getFeedCommunityKeys(feedOptions).includes(communityKey),
        )
      ) {
        return true;
      }
    }
  }

  // feeds posts author addresses have a changed blocked address
  // NOTE: because of this, if an author address is unblocked, feeds won't update until some other event causes a feed update
  // it seems preferable to causing unnecessary rerenders every time an unused block event occurs
  const changedBlockedAddressesSet = new Set(changedBlockedAddresses);
  for (const feedName in bufferedFeeds) {
    for (const post of bufferedFeeds[feedName] || []) {
      if (post?.author?.address && changedBlockedAddressesSet.has(post.author.address)) {
        return true;
      }
    }
  }

  return false;
};

export const getAccountsBlockedCids = (accounts: Accounts) => {
  const blockedCidsSet = new Set<string>();
  for (const { blockedCids } of Object.values(accounts)) {
    for (const address in blockedCids) {
      if (blockedCids[address]) {
        blockedCidsSet.add(address);
      }
    }
  }
  return [...blockedCidsSet].sort();
};

export const accountsBlockedCidsChanged = (
  previousAccountsBlockedCids: { [address: string]: boolean }[],
  accountsBlockedCids: { [address: string]: boolean }[],
) => {
  if (previousAccountsBlockedCids.length !== accountsBlockedCids.length) {
    return true;
  }
  for (const i in previousAccountsBlockedCids) {
    // check if the object is still the same
    if (previousAccountsBlockedCids[i] !== accountsBlockedCids[i]) {
      return true;
    }
  }
  return false;
};

export const feedsHaveChangedBlockedCids = (
  feedsOptions: FeedsOptions,
  bufferedFeeds: Feeds,
  blockedCids: string[],
  previousBlockedCids: string[],
) => {
  // find the difference between current and previous blocked addresses
  const changedBlockedCids = blockedCids
    .filter((x) => !previousBlockedCids.includes(x))
    .concat(previousBlockedCids.filter((x) => !blockedCids.includes(x)));

  // feeds posts author addresses have a changed blocked address
  // NOTE: because of this, if a cid is unblocked, feeds won't update until some other event causes a feed update
  // it seems preferable to causing unnecessary rerenders every time an unused block event occurs
  const changedBlockedCidsSet = new Set(changedBlockedCids);
  for (const feedName in bufferedFeeds) {
    for (const post of bufferedFeeds[feedName] || []) {
      if (post?.cid && changedBlockedCidsSet.has(post?.cid)) {
        return true;
      }
    }
  }

  return false;
};
