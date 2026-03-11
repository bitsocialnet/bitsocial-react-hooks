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
import { areEquivalentCommunityAddresses } from "../../lib/community-address";
import {
  getCommentCommunityAddress,
  normalizeCommentCommunityAddress,
} from "../../lib/plebbit-compat";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:feeds:stores");

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
  communityAddress: string,
  modQueue?: string[],
  freshestComments?: { [commentCid: string]: Comment },
) => {
  const normalizedPost = normalizeCommentCommunityAddress(post) as Comment;
  const freshestComment = post.cid
    ? normalizeCommentCommunityAddress(freshestComments?.[post.cid])
    : undefined;
  const postCommunityAddress = getCommentCommunityAddress(normalizedPost);
  if (!areEquivalentCommunityAddresses(postCommunityAddress, communityAddress)) {
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
    !areEquivalentCommunityAddresses(getCommentCommunityAddress(freshestComment), communityAddress)
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
    let { communityAddresses, sortType, accountId, filter, newerThan, modQueue } =
      feedsOptions[feedName];
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
    for (const communityAddress of communityAddresses) {
      // community hasn't loaded yet
      if (!communities[communityAddress]) {
        continue;
      }

      // if cache is expired and has internet access, don't use, wait for next community update
      if (communityPostsCacheExpired(communities[communityAddress]) && window.navigator.onLine) {
        continue;
      }

      // use community preloaded posts if any
      const preloadedPosts = getPreloadedPosts(communities[communityAddress], sortType);
      if (preloadedPosts) {
        for (const post of preloadedPosts) {
          // posts are manually validated, could have fake communityAddress
          if (
            !areEquivalentCommunityAddresses(getCommentCommunityAddress(post), communityAddress)
          ) {
            break;
          }
          const nextPost = getFeedPost(post, communityAddress, modQueue, freshestComments);
          if (nextPost) {
            bufferedFeedPosts.push(nextPost);
          }
        }
      }

      // add all posts from community pages
      const communityPages = getCommunityPages(
        communities[communityAddress],
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
              !areEquivalentCommunityAddresses(getCommentCommunityAddress(post), communityAddress)
            ) {
              break;
            }
            const nextPost = getFeedPost(post, communityAddress, modQueue, freshestComments);
            if (nextPost) {
              bufferedFeedPosts.push(nextPost);
            }
          }
        }
      }
    }

    // sort the feed before filtering to get more accurate results
    const originalSortType = feedsOptions[feedName].sortType;
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
      if (post.pinned && communityAddresses.length > 1) {
        continue;
      }

      // feedOptions filter function
      if (filter && !filter.filter(post)) {
        continue;
      }

      // filter posts older than newerThan option
      if (newerThanTimestamp) {
        if (sortType === "active") {
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

const getPreloadedPosts = (community: Community, sortType: string) => {
  let preloadedPosts = community.posts?.pages?.[sortType]?.comments;
  if (preloadedPosts) {
    return preloadedPosts;
  }
  const hasPageCids = Object.keys(community.posts?.pageCids || {}).length !== 0;
  if (hasPageCids) {
    return;
  }
  const pages: any[] = Object.values(community.posts?.pages || {});
  if (!pages.length) {
    return;
  }
  const nextCids = pages.map((page: any) => page?.nextCid).filter((nextCid) => !!nextCid);
  if (nextCids.length > 0) {
    return;
  }
  // if has a preloaded page, but no pageCids and no nextCids, it means all posts fit in a single preloaded page
  // so any sort type can be used, and later be resorted by the client
  if (pages[0]?.comments?.length) {
    return pages[0].comments;
  }
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
    const plebbit = accounts[accountId]?.plebbit;
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
        missingPosts = await removeInvalidComments(
          missingPosts,
          { validateReplies: false },
          plebbit,
        );
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

export const addAccountsComments = (feedsOptions: FeedsOptions, loadedFeeds: Feeds) => {
  let loadedFeedsChanged = false;
  const accountsComments = accountsStore.getState().accountsComments || {};
  for (const feedName in feedsOptions) {
    const {
      accountId,
      accountComments: accountCommentsOptions,
      communityAddresses,
    } = feedsOptions[feedName];
    const { newerThan, append } = accountCommentsOptions || {};
    if (!newerThan) {
      continue;
    }
    const newerThanTimestamp =
      newerThan === Infinity ? 0 : Math.floor(Date.now() / 1000) - newerThan;
    const isNewerThan = (post: Comment) => post.timestamp > newerThanTimestamp;

    const communityAddressesSet = new Set(communityAddresses);
    const accountComments = accountsComments[accountId] || [];
    const accountPosts = accountComments.filter((comment) => {
      // is a reply, not a post
      if (comment.parentCid || comment.depth > 0) {
        return false;
      }
      if (!isNewerThan(comment)) {
        return false;
      }
      return communityAddressesSet.has(getCommentCommunityAddress(comment) || "");
    });
    const validAccountIndices = new Set(accountPosts.map((p) => p.index));
    const accountCidToPost = new Map<string, Comment>();
    for (const p of accountPosts) {
      if (p.cid) accountCidToPost.set(p.cid, p);
    }

    let loadedFeed = loadedFeeds[feedName] || [];
    // prune stale local-account entries and replace when cid matches but index changed
    const prunedLoadedFeed: Comment[] = [];
    for (const post of loadedFeed) {
      if (post.index === undefined) {
        prunedLoadedFeed.push(post);
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
      if (post.index) loadedFeedMap.set(post.index, loadedFeedIndex);
      if (!post.cid) loadedFeedMap.set(post.timestamp, loadedFeedIndex);
    });
    for (const accountPost of accountPosts) {
      // account post with cid already added
      if (accountPost.cid && loadedFeedMap.has(accountPost.cid)) {
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
    const plebbit = accounts[feedsOptions[feedName]?.accountId]?.plebbit;
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
                (await commentIsValid(post, { validateReplies: false }, plebbit))
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
export const getFeedsCommunityAddressesWithNewerPosts = (
  filteredSortedFeeds: Feeds,
  loadedFeeds: Feeds,
  previousFeedsCommunityAddressesWithNewerPosts: { [feedName: string]: string[] },
) => {
  const feedsCommunityAddressesWithNewerPosts: { [feedName: string]: string[] } = {};
  for (const feedName in loadedFeeds) {
    const loadedFeed = loadedFeeds[feedName];
    const cidsInLoadedFeed = new Set();
    for (const post of loadedFeed) {
      cidsInLoadedFeed.add(post.cid);
    }
    const communityAddressesWithNewerPostsSet = new Set<string>();
    for (const [i, post] of filteredSortedFeeds[feedName].entries()) {
      if (i >= loadedFeed.length) {
        break;
      }
      // if any post in filteredSortedFeeds ranks higher than the loaded feed count, it's a newer post
      if (!cidsInLoadedFeed.has(post.cid)) {
        const postCommunityAddress = getCommentCommunityAddress(post);
        if (postCommunityAddress) {
          communityAddressesWithNewerPostsSet.add(postCommunityAddress);
        }
      }
    }
    const communityAddressesWithNewerPosts = [...communityAddressesWithNewerPostsSet];

    // don't update the array if the data is the same to avoid rerenders
    const previousCommunityAddressesWithNewerPosts =
      previousFeedsCommunityAddressesWithNewerPosts[feedName] || [];
    if (
      communityAddressesWithNewerPosts.length === previousCommunityAddressesWithNewerPosts.length &&
      communityAddressesWithNewerPosts.toString() ===
        previousCommunityAddressesWithNewerPosts.toString()
    ) {
      feedsCommunityAddressesWithNewerPosts[feedName] =
        previousFeedsCommunityAddressesWithNewerPosts[feedName];
    } else {
      feedsCommunityAddressesWithNewerPosts[feedName] = communityAddressesWithNewerPosts;
    }
  }
  return feedsCommunityAddressesWithNewerPosts;
};

// find how many posts are left in each communities in a buffereds feeds
export const getFeedsCommunitiesPostCounts = (feedsOptions: FeedsOptions, feeds: Feeds) => {
  const feedsCommunitiesPostCounts: FeedsCommunitiesPostCounts = {};
  for (const feedName in feedsOptions) {
    feedsCommunitiesPostCounts[feedName] = {};
    for (const communityAddress of feedsOptions[feedName].communityAddresses) {
      feedsCommunitiesPostCounts[feedName][communityAddress] = 0;
    }
    for (const comment of feeds[feedName] || []) {
      const commentCommunityAddress = getCommentCommunityAddress(comment);
      if (commentCommunityAddress) {
        feedsCommunitiesPostCounts[feedName][commentCommunityAddress]++;
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

    let { communityAddresses, sortType, accountId, modQueue } = feedsOptions[feedName];

    let pageType = "posts";
    if (modQueue?.[0]) {
      // TODO: allow multiple modQueue at once, fow now only use first in array
      sortType = modQueue[0];
      pageType = "modQueue";
    }

    communityAddressesLoop: for (const communityAddress of communityAddresses) {
      // don't consider the sub if the address is blocked
      if (accounts[accountId]?.blockedAddresses[communityAddress]) {
        continue communityAddressesLoop;
      }

      const community = communities[communityAddress];
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
        continue communityAddressesLoop;
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
    feedsOptions[i].communityAddresses.forEach((a) => feedsCommunityAddresses.add(a)),
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
  const feedsCommunityAddresses = new Set<string>();
  Object.keys(feedsOptions).forEach((i) =>
    feedsOptions[i].communityAddresses.forEach((a) => feedsCommunityAddresses.add(a)),
  );
  for (const address of changedBlockedAddresses) {
    // a changed address is used in the feed, update feeds
    if (feedsCommunityAddresses.has(address)) {
      return true;
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
