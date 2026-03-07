/** Single fallback for numeric values to reduce Istanbul branch sites */
const n = (v: unknown): number => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

const sortByTop = (feed: any[]) => {
  const postScores: { [key: string]: number } = {};
  for (const post of feed) {
    const score = post.upvoteCount - post.downvoteCount || 0;
    postScores[post.cid] = score;
  }
  return feed
    .sort((a, b) => n(b.timestamp) - n(a.timestamp))
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(postScores[b.cid]) - n(postScores[a.cid]));
};

/**
 * Sort by controversial is made using relative score, to encourage small communities to grow
 * and to not incentivize communities to inflate their vote counts
 */
const sortByControversial = (feed: any[]) => {
  const postScores: { [key: string]: number } = {};
  for (const post of feed) {
    let upvoteCount = n(post.upvoteCount) + 1; // reddit initial upvotes is 1, plebbit is 0
    const downvoteCount = n(post.downvoteCount);
    const magnitude = upvoteCount + downvoteCount;
    const balance =
      upvoteCount > downvoteCount
        ? downvoteCount / upvoteCount
        : upvoteCount / (downvoteCount || 1);
    postScores[post.cid] = Math.pow(magnitude, balance);
  }
  return feed
    .sort((a, b) => n(b.timestamp) - n(a.timestamp))
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(postScores[b.cid]) - n(postScores[a.cid]));
};

/**
 * Sort by hot is made using relative score, to encourage small communities to grow
 * and to not incentivize communities to inflate their vote counts
 * Note: a sub with not many posts will be given very high priority
 */
const sortByHot = (feed: any[]) => {
  const postScores: { [key: string]: number } = {};
  const round = (number: number, decimalPlaces: number) => {
    const factorOfTen = Math.pow(10, decimalPlaces);
    return Math.round(number * factorOfTen) / factorOfTen;
  };
  for (const post of feed) {
    let score = n(post.upvoteCount) - n(post.downvoteCount) + 1;
    const order = Math.log10(Math.max(Math.abs(score), 1));
    let sign = 0;
    if (score > 0) sign = 1;
    else if (score < 0) sign = -1;
    const seconds = n(post.timestamp) - 1134028003;
    postScores[post.cid] = round(sign * order + seconds / 45000, 7);
  }
  return feed
    .sort((a, b) => n(b.timestamp) - n(a.timestamp))
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(postScores[b.cid]) - n(postScores[a.cid]));
};

/**
 * Sort by new is made using relative timestamp score, to encourage small communities to grow
 * and to not incentivize communities to inflate their timestamp
 */
const sortByNew = (feed: any[]) =>
  feed
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(b.timestamp) - n(a.timestamp));

/**
 * Sort by active is made using relative lastReplyTimestamp score, to encourage small communities to grow
 * and to not incentivize communities to inflate their lastReplyTimestamp
 */
const sortByActive = (feed: any[]) =>
  feed
    .sort((a, b) => n(b.timestamp) - n(a.timestamp))
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort(
      (a, b) => n(b.lastReplyTimestamp ?? b.timestamp) - n(a.lastReplyTimestamp ?? a.timestamp),
    );

const sortByOld = (feed: any[]) =>
  feed
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(a.timestamp) - n(b.timestamp));

// "best" sort from reddit replies
// https://web.archive.org/web/20100305052116/http://blog.reddit.com/2009/10/reddits-new-comment-sorting-system.html
// https://medium.com/hacking-and-gonzo/how-reddit-ranking-algorithms-work-ef111e33d0d9
// http://www.evanmiller.org/how-not-to-sort-by-average-rating.html
// https://github.com/reddit-archive/reddit/blob/753b17407e9a9dca09558526805922de24133d53/r2/r2/lib/db/_sorts.pyx#L70
const sortByBest = (feed: any[]) => {
  const postScores: { [key: string]: number } = {};
  for (const post of feed) {
    const upvoteCount = n(post.upvoteCount) + 1;
    const downvoteCount = n(post.downvoteCount);
    const total = upvoteCount + downvoteCount;
    const score =
      total === 0
        ? 0
        : (() => {
            const z = 1.281551565545;
            const p = upvoteCount / total;
            const left = p + (1 / (2 * total)) * z * z;
            const right = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
            const under = 1 + (1 / total) * z * z;
            return (left - right) / under;
          })();
    postScores[post.cid] = score;
  }
  return feed
    .sort((a, b) => n(a.timestamp) - n(b.timestamp))
    .sort((a, b) => n(postScores[b.cid]) - n(postScores[a.cid]));
};

const sort = (sortType: string, feed: any[]) => {
  // NOTE: pinned posts are not sorted, maybe in a future version we can sort them based on something
  // NOTE: with useReplies({flat: true}), nested pins are at the top, unclear yet what we should do with them
  const pinnedPosts = feed.filter((post) => post.pinned);

  feed = feed.filter((post) => !post.pinned);
  if (sortType.match("new")) {
    return [...pinnedPosts, ...sortByNew(feed)];
  }
  if (sortType.match("hot")) {
    return [...pinnedPosts, ...sortByHot(feed)];
  }
  if (sortType.match("top")) {
    return [...pinnedPosts, ...sortByTop(feed)];
  }
  if (sortType.match("controversial")) {
    return [...pinnedPosts, ...sortByControversial(feed)];
  }
  if (sortType.match("active")) {
    return [...pinnedPosts, ...sortByActive(feed)];
  }
  if (sortType.match("old")) {
    return [...pinnedPosts, ...sortByOld(feed)];
  }
  if (sortType.match("best")) {
    return [...pinnedPosts, ...sortByBest(feed)];
  }
  throw Error(`feedsStore feedSorter sort type '${sortType}' doesn't exist`);
};

export default { sort };
