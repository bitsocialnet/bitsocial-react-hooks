/** Single fallback for numeric values to reduce Istanbul branch sites */
const n = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);
const sortByTop = (feed) => {
    const postScores = {};
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
const sortByControversial = (feed) => {
    const postScores = {};
    for (const post of feed) {
        let upvoteCount = n(post.upvoteCount) + 1; // reddit initial upvotes is 1, pkc is 0
        const downvoteCount = n(post.downvoteCount);
        const magnitude = upvoteCount + downvoteCount;
        const balance = upvoteCount > downvoteCount
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
const sortByHot = (feed) => {
    const postScores = {};
    const round = (number, decimalPlaces) => {
        const factorOfTen = Math.pow(10, decimalPlaces);
        return Math.round(number * factorOfTen) / factorOfTen;
    };
    for (const post of feed) {
        let score = n(post.upvoteCount) - n(post.downvoteCount) + 1;
        const order = Math.log10(Math.max(Math.abs(score), 1));
        let sign = 0;
        if (score > 0)
            sign = 1;
        else if (score < 0)
            sign = -1;
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
const sortByNew = (feed) => feed
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(b.timestamp) - n(a.timestamp));
/**
 * Sort by active is made using relative lastReplyTimestamp score, to encourage small communities to grow
 * and to not incentivize communities to inflate their lastReplyTimestamp
 */
const sortByActive = (feed) => feed
    .sort((a, b) => n(b.timestamp) - n(a.timestamp))
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => { var _a, _b; return n((_a = b.lastReplyTimestamp) !== null && _a !== void 0 ? _a : b.timestamp) - n((_b = a.lastReplyTimestamp) !== null && _b !== void 0 ? _b : a.timestamp); });
const sortByOld = (feed) => feed
    .sort((a, b) => n(b.upvoteCount) - n(a.upvoteCount))
    .sort((a, b) => n(a.timestamp) - n(b.timestamp));
// "best" sort from reddit replies
// https://web.archive.org/web/20100305052116/http://blog.reddit.com/2009/10/reddits-new-comment-sorting-system.html
// https://medium.com/hacking-and-gonzo/how-reddit-ranking-algorithms-work-ef111e33d0d9
// http://www.evanmiller.org/how-not-to-sort-by-average-rating.html
// https://github.com/reddit-archive/reddit/blob/753b17407e9a9dca09558526805922de24133d53/r2/r2/lib/db/_sorts.pyx#L70
const sortByBest = (feed) => {
    const postScores = {};
    for (const post of feed) {
        const upvoteCount = n(post.upvoteCount) + 1;
        const downvoteCount = n(post.downvoteCount);
        const total = upvoteCount + downvoteCount;
        const score = total === 0
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
const sorters = {
    new: sortByNew,
    newFlat: sortByNew,
    hot: sortByHot,
    top: sortByTop,
    topHour: sortByTop,
    topDay: sortByTop,
    topWeek: sortByTop,
    topMonth: sortByTop,
    topYear: sortByTop,
    topAll: sortByTop,
    controversial: sortByControversial,
    controversialHour: sortByControversial,
    controversialDay: sortByControversial,
    controversialWeek: sortByControversial,
    controversialMonth: sortByControversial,
    controversialYear: sortByControversial,
    controversialAll: sortByControversial,
    active: sortByActive,
    old: sortByOld,
    oldFlat: sortByOld,
    best: sortByBest,
};
const sort = (sortType, feed) => {
    const sorter = sortType && sorters[sortType];
    if (!sorter) {
        return feed;
    }
    // NOTE: pinned posts are not sorted, maybe in a future version we can sort them based on something
    // NOTE: with useReplies({flat: true}), nested pins are at the top, unclear yet what we should do with them
    const pinnedPosts = feed.filter((post) => post.pinned);
    feed = feed.filter((post) => !post.pinned);
    return [...pinnedPosts, ...sorter(feed)];
};
export default { sort };
//# sourceMappingURL=feed-sorter.js.map