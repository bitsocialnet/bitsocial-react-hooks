// Simulated versions of the hooks the playground examples use. They follow the real option and
// result shapes (see src/types.ts in the library) but read from sample data and never connect.
import { useState } from "react";

type CommunityIdentifier = { name?: string; publicKey?: string };
type Author = { address: string; shortAddress: string; displayName: string };
type Comment = {
  cid: string;
  parentCid?: string;
  postCid: string;
  depth: number;
  title?: string;
  content: string;
  timestamp: number;
  author: Author;
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  communityAddress: string;
};

const minute = 60;
const now = Math.floor(Date.now() / 1000);
const author = (name: string): Author => ({
  address: `${name}.bso`,
  shortAddress: `${name}.bso`,
  displayName: name[0].toUpperCase() + name.slice(1),
});
const succeeded = { state: "succeeded", error: undefined, errors: [] as Error[] };

const postData: [string, string, string, number, number][] = [
  ["What would you build if the network was already there?", "A small question for anyone with a big idea.", "mira", 42, 95],
  ["A little forum for the things you love.", "I made a space for people who still make things by hand.", "alex", 28, 30],
  ["Your interface. Your algorithms. Your rules.", "Experimenting with a calmer kind of social app.", "jo", 17, 12],
  ["Show your first feed component", "Mine is twelve lines and already loads real communities.", "sam", 23, 240],
  ["Sorting by new feels different on a p2p network", "Posts arrive as peers publish them. Worth designing for.", "rin", 9, 6],
  ["A reading club where members own the community", "No platform to move away from when it changes.", "lee", 31, 600],
  ["How do you handle challenges in your UI?", "Looking for patterns that keep publishing friendly.", "kai", 12, 48],
  ["Weekend project: a feed for local music", "Small, slow, and exactly what my city needed.", "ana", 19, 1400],
];
const posts: Comment[] = postData.map(([title, content, name, upvoteCount, minutesAgo], index) => ({
  cid: `QmSamplePost${index + 1}`,
  postCid: `QmSamplePost${index + 1}`,
  depth: 0,
  title,
  content,
  timestamp: now - minutesAgo * minute,
  author: author(name),
  upvoteCount,
  downvoteCount: index % 3,
  replyCount: 0,
  communityAddress: "builders.bso",
}));

const reply = (cid: string, parentCid: string, depth: number, name: string, content: string, upvoteCount: number, minutesAgo: number): Comment => ({
  cid,
  parentCid,
  postCid: posts[0].cid,
  depth,
  content,
  timestamp: now - minutesAgo * minute,
  author: author(name),
  upvoteCount,
  downvoteCount: 0,
  replyCount: 0,
  communityAddress: "builders.bso",
});
const replies: Comment[] = [
  reply("QmSampleReply1", posts[0].cid, 1, "mira", "A reading club where we actually own the community.", 14, 80),
  reply("QmSampleReply2", posts[0].cid, 1, "alex", "A feed that lets me pick my own algorithm.", 9, 60),
  reply("QmSampleReply3", "QmSampleReply1", 2, "jo", "I'd use that. Let's build it.", 6, 40),
  reply("QmSampleReply4", posts[0].cid, 1, "sam", "A tiny forum for my local music scene.", 4, 20),
];
for (const comment of [...posts, ...replies]) {
  comment.replyCount = replies.filter(({ parentCid }) => parentCid === comment.cid).length;
}

const score = (comment: Comment) => comment.upvoteCount - comment.downvoteCount;
const hot = (comment: Comment) => score(comment) / Math.pow((now - comment.timestamp) / 3600 + 2, 1.5);
const sorters: Record<string, (a: Comment, b: Comment) => number> = {
  hot: (a, b) => hot(b) - hot(a),
  best: (a, b) => score(b) - score(a),
  top: (a, b) => score(b) - score(a),
  new: (a, b) => b.timestamp - a.timestamp,
  newFlat: (a, b) => b.timestamp - a.timestamp,
  old: (a, b) => a.timestamp - b.timestamp,
  oldFlat: (a, b) => a.timestamp - b.timestamp,
};
// Like the real hooks, an omitted or unknown custom sort keeps the community's page order.
function sortComments(comments: Comment[], sortType?: string) {
  const sorter = sortType?.startsWith("top") ? sorters.top : sortType ? sorters[sortType] : undefined;
  return sorter ? [...comments].sort(sorter) : comments;
}

// Pagination resets whenever the options change, as it does for a new feed.
function usePages(key: string) {
  const [pages, setPages] = useState({ key, count: 1 });
  const count = pages.key === key ? pages.count : 1;
  return {
    count,
    loadMore: async () => setPages({ key, count: count + 1 }),
    reset: async () => setPages({ key, count: 1 }),
  };
}

function communityAddress(community?: CommunityIdentifier) {
  return community?.name || community?.publicKey;
}

export function useFeed(options: { communities?: CommunityIdentifier[]; sortType?: string; postsPerPage?: number } = {}) {
  const { communities = [], sortType, postsPerPage = 25 } = options;
  const address = communityAddress(communities[0]);
  const { count, loadMore, reset } = usePages(JSON.stringify([communities, sortType, postsPerPage]));
  const sorted = address ? sortComments(posts, sortType).map((post) => ({ ...post, communityAddress: address })) : [];
  const feed = sorted.slice(0, count * postsPerPage);
  return {
    ...succeeded,
    feed,
    bufferedFeed: sorted.slice(feed.length),
    updatedFeed: feed,
    hasMore: feed.length < sorted.length,
    loadMore,
    reset,
    expandTimeWindow: async () => {},
    communityKeysWithNewerPosts: [] as string[],
  };
}

export function useCommunity(options: { community?: CommunityIdentifier } = {}) {
  const address = communityAddress(options.community);
  if (!address) return { ...succeeded, state: "initializing" };
  return {
    ...succeeded,
    address,
    name: options.community?.name,
    title: "The builders’ corner",
    description: "A place for things worth making. Share your work, ask questions, and build the next corner of the social web.",
    createdAt: now - 90 * 24 * 3600,
    updatedAt: now - 5 * minute,
    syncState: "succeeded",
    hasCachedData: true,
    lastFetchAttemptAt: now,
    lastSuccessfulFetchAt: now,
  };
}

export function useComment(options: { commentCid?: string } = {}) {
  const comment = [...posts, ...replies].find(({ cid }) => cid === options.commentCid);
  const refresh = async () => {};
  if (!comment) return { ...succeeded, cid: options.commentCid, state: options.commentCid ? "fetching-ipfs" : "initializing", refresh };
  return { ...succeeded, ...comment, refresh };
}

export function useReplies(options: { comment?: { cid?: string }; sortType?: string; repliesPerPage?: number; flat?: boolean } = {}) {
  const { comment, sortType = "best", repliesPerPage = 25, flat = false } = options;
  const { count, loadMore, reset } = usePages(JSON.stringify([comment?.cid, sortType, repliesPerPage, flat]));
  const descendants = (cid?: string): Comment[] =>
    replies.filter(({ parentCid }) => parentCid === cid).flatMap((child) => (flat ? [child, ...descendants(child.cid)] : [child]));
  const sorted = comment?.cid ? sortComments(descendants(comment.cid), sortType) : [];
  const page = sorted.slice(0, count * repliesPerPage);
  return {
    ...succeeded,
    replies: page,
    bufferedReplies: sorted.slice(page.length),
    updatedReplies: page,
    hasMore: page.length < sorted.length,
    loadMore,
    reset,
  };
}
