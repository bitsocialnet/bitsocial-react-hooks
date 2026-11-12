// Standard pkc-js sorts (pkc-js src/pages/util.ts) whose scoring the feed sorter reproduces. pkc-js
// only publishes pageCids once a preloaded page overflows, so a record whose comments all fit in
// its preloaded pages can serve any of these by re-sorting such a page client-side.
const CLIENT_SORTABLE_POST_SORT_TYPES = [
    "hot",
    "new",
    "active",
    "topHour",
    "topDay",
    "topWeek",
    "topMonth",
    "topYear",
    "topAll",
];
const CLIENT_SORTABLE_REPLY_SORT_TYPES = ["best", "new", "old", "newFlat", "oldFlat"];
// pkc-js only publishes flat sorts for a post's replies (REPLY_REPLIES_SORT_TYPES has none), so a
// nested reply must not advertise them while its replies still fit in the preloaded page
const getClientSortableReplySortTypes = (comment) => {
    const isPost = (comment === null || comment === void 0 ? void 0 : comment.depth) !== undefined ? comment.depth === 0 : !(comment === null || comment === void 0 ? void 0 : comment.parentCid);
    return isPost
        ? CLIENT_SORTABLE_REPLY_SORT_TYPES
        : CLIENT_SORTABLE_REPLY_SORT_TYPES.filter((sortType) => !isFlatSortType(sortType));
};
// pkc-js TIMEFRAMES_TO_SECONDS, applied client-side when a timeframe sort is computed from a
// preloaded page instead of a page the community windowed itself
const SORT_TIMEFRAMES_SECONDS = {
    Hour: 3600,
    Day: 86400,
    Week: 604800,
    Month: 2629746,
    Year: 31557600,
};
export const isFlatSortType = (sortType) => Boolean(sortType === null || sortType === void 0 ? void 0 : sortType.endsWith("Flat"));
export const getSortTimeframeSeconds = (sortType) => {
    var _a;
    const timeframe = (_a = sortType === null || sortType === void 0 ? void 0 : sortType.match(/^(?:top|controversial)(Hour|Day|Week|Month|Year)$/)) === null || _a === void 0 ? void 0 : _a[1];
    return timeframe ? SORT_TIMEFRAMES_SECONDS[timeframe] : undefined;
};
const getPublishedPageSortTypes = (record) => {
    const sortTypes = new Set();
    for (const sortType of Object.keys((record === null || record === void 0 ? void 0 : record.pages) || {})) {
        if (sortType)
            sortTypes.add(sortType);
    }
    for (const sortType of Object.keys((record === null || record === void 0 ? void 0 : record.pageCids) || {})) {
        if (sortType)
            sortTypes.add(sortType);
    }
    return [...sortTypes];
};
// preloaded pages holding the record's complete comment set: no page continues with a nextCid and
// no pageCids are published (pkc-js publishes pageCids for every sort once the preloaded page overflows)
const getCompletePreloadedPageSortTypes = (record) => {
    if (Object.keys((record === null || record === void 0 ? void 0 : record.pageCids) || {}).length > 0) {
        return [];
    }
    const pages = (record === null || record === void 0 ? void 0 : record.pages) || {};
    const sortTypes = Object.keys(pages).filter((sortType) => { var _a; return Array.isArray((_a = pages[sortType]) === null || _a === void 0 ? void 0 : _a.comments); });
    if (!sortTypes.length ||
        sortTypes.some((sortType) => { var _a; return (_a = pages[sortType]) === null || _a === void 0 ? void 0 : _a.nextCid; })) {
        return [];
    }
    // a page windowed by a timeframe sort only holds that window, never the complete set
    return sortTypes.filter((sortType) => !getSortTimeframeSeconds(sortType));
};
// a flat sort flattens the whole reply tree, so every nested reply chain must be complete too
const hasCompleteReplyTree = (page) => ((page === null || page === void 0 ? void 0 : page.comments) || []).every((comment) => {
    var _a;
    const completeSortTypes = getCompletePreloadedPageSortTypes(comment === null || comment === void 0 ? void 0 : comment.replies);
    if (!completeSortTypes.length) {
        // no preloaded replies is only complete when the comment reports none, and a continued or
        // paged chain is never complete
        return !((comment === null || comment === void 0 ? void 0 : comment.replyCount) > 0) && !Object.keys(((_a = comment === null || comment === void 0 ? void 0 : comment.replies) === null || _a === void 0 ? void 0 : _a.pages) || {}).length;
    }
    const hierarchicalSortType = completeSortTypes.find((sortType) => !isFlatSortType(sortType));
    return hierarchicalSortType === undefined
        ? true
        : hasCompleteReplyTree(comment.replies.pages[hierarchicalSortType]);
});
// a flat page cannot rebuild the reply tree, so it only serves flat sorts; a hierarchical page
// serves flat sorts only when its nested reply chains are complete
const getClientSortableSortTypes = (record, clientSortableSortTypes) => {
    var _a;
    const completeSortTypes = getCompletePreloadedPageSortTypes(record);
    if (!completeSortTypes.length) {
        return [];
    }
    const hierarchicalSortType = completeSortTypes.find((sortType) => !isFlatSortType(sortType));
    if (hierarchicalSortType === undefined) {
        return clientSortableSortTypes.filter(isFlatSortType);
    }
    const canFlatten = completeSortTypes.some(isFlatSortType) ||
        hasCompleteReplyTree((_a = record === null || record === void 0 ? void 0 : record.pages) === null || _a === void 0 ? void 0 : _a[hierarchicalSortType]);
    return canFlatten
        ? clientSortableSortTypes
        : clientSortableSortTypes.filter((sortType) => !isFlatSortType(sortType));
};
const getAvailablePageSortTypes = (record, clientSortableSortTypes) => {
    const sortTypes = getPublishedPageSortTypes(record);
    for (const sortType of getClientSortableSortTypes(record, clientSortableSortTypes)) {
        if (!sortTypes.includes(sortType))
            sortTypes.push(sortType);
    }
    return sortTypes;
};
// the sorts whose first page the record embeds, in the record's key order. pkc-js publishes records
// with sorted keys, so that order is not guaranteed to be the one the community configured and the
// first sort is not necessarily its preference. A community may preload several sorts, or none: a
// record with empty `pages` has no preloaded sort, even when it publishes `pageCids`.
const getPreloadedPageSortTypes = (record) => Object.keys((record === null || record === void 0 ? void 0 : record.pages) || {}).filter(Boolean);
// whether the record publishes any comment: a page cid, or a preloaded page that holds comments or
// continues. A record with no comments can still carry empty preloaded pages (`comments: []`).
const hasPublishedComments = (record) => Object.keys((record === null || record === void 0 ? void 0 : record.pageCids) || {}).length > 0 ||
    Object.values((record === null || record === void 0 ? void 0 : record.pages) || {}).some((page) => {
        const { comments, nextCid } = page || {};
        return Boolean(nextCid) || (Array.isArray(comments) && comments.length > 0);
    });
// a requested sort the record does not serve, as opposed to a record that has not loaded or has no
// comments at all, where there is nothing a different sort would show
const isPageSortTypeUnavailable = (record, requestedSortType, clientSortableSortTypes) => requestedSortType !== undefined &&
    hasPublishedComments(record) &&
    !getAvailablePageSortTypes(record, clientSortableSortTypes).includes(requestedSortType);
const resolvePageSortType = (record, requestedSortType, clientSortableSortTypes) => {
    var _a;
    if (requestedSortType !== undefined) {
        return getAvailablePageSortTypes(record, clientSortableSortTypes).includes(requestedSortType)
            ? requestedSortType
            : undefined;
    }
    // no sort requested: use the first preloaded sort in the record's key order. A record that preloads
    // nothing still has to load something, so it falls back to the first sort it publishes page cids for.
    return (_a = getPreloadedPageSortTypes(record)[0]) !== null && _a !== void 0 ? _a : getPublishedPageSortTypes(record)[0];
};
// the page that serves a resolved sort: its published page, or the complete preloaded page the
// client re-sorts (a flat sort prefers a complete flat page, else flattens a hierarchical one)
const getPageSortTypeToRead = (record, sortType) => {
    var _a;
    if (sortType === undefined) {
        return undefined;
    }
    if (getPublishedPageSortTypes(record).includes(sortType)) {
        return sortType;
    }
    const completeSortTypes = getCompletePreloadedPageSortTypes(record);
    const hierarchicalSortType = completeSortTypes.find((preloadedSortType) => !isFlatSortType(preloadedSortType));
    if (isFlatSortType(sortType)) {
        return (_a = completeSortTypes.find(isFlatSortType)) !== null && _a !== void 0 ? _a : hierarchicalSortType;
    }
    return hierarchicalSortType;
};
export const getAvailablePostSortTypes = (community) => getAvailablePageSortTypes(community === null || community === void 0 ? void 0 : community.posts, CLIENT_SORTABLE_POST_SORT_TYPES);
export const getAvailableReplySortTypes = (comment) => getAvailablePageSortTypes(comment === null || comment === void 0 ? void 0 : comment.replies, getClientSortableReplySortTypes(comment));
export const getPreloadedPostSortTypes = (community) => getPreloadedPageSortTypes(community === null || community === void 0 ? void 0 : community.posts);
export const getPreloadedReplySortTypes = (comment) => getPreloadedPageSortTypes(comment === null || comment === void 0 ? void 0 : comment.replies);
// the first preloaded sort in the record's key order, undefined when the record preloads none
export const getPreloadedPostSortType = (community) => getPreloadedPostSortTypes(community)[0];
export const getPreloadedReplySortType = (comment) => getPreloadedReplySortTypes(comment)[0];
export const isPostSortTypeUnavailable = (community, requestedSortType) => isPageSortTypeUnavailable(community === null || community === void 0 ? void 0 : community.posts, requestedSortType, CLIENT_SORTABLE_POST_SORT_TYPES);
export const isReplySortTypeUnavailable = (comment, requestedSortType) => isPageSortTypeUnavailable(comment === null || comment === void 0 ? void 0 : comment.replies, requestedSortType, getClientSortableReplySortTypes(comment));
export const resolvePostSortType = (community, requestedSortType) => resolvePageSortType(community === null || community === void 0 ? void 0 : community.posts, requestedSortType, CLIENT_SORTABLE_POST_SORT_TYPES);
export const resolveReplySortType = (comment, requestedSortType) => resolvePageSortType(comment === null || comment === void 0 ? void 0 : comment.replies, requestedSortType, getClientSortableReplySortTypes(comment));
// the options pkc-js applies to every sort; any other published option belongs to the sort file itself
const RESERVED_PAGE_SORT_OPTIONS = new Set([
    "maxAge",
    "pinnedFirst",
    "excludeRemovedComments",
    "excludeDeletedComments",
    "excludeCommentPendingApproval",
    "excludeCommentWithApprovedFalse",
    "excludeCommentsWithDifferentCommunityAddress",
]);
// a community configured with `settings.pages` publishes `community.pageSorts`, naming the file behind
// each key; a package or path file published under a built-in key (e.g. a keyword no-bump `active`)
// orders its pages by a score the client sorters do not reproduce. A node may also register such a
// file under the built-in name itself, which its own options (e.g. `noBumpKeywords`) still reveal.
// Unconfigured communities publish no `pageSorts`, so their keys are the built-ins.
export const isBuiltInPostSortType = (community, sortType) => {
    var _a, _b;
    const publishedPageSort = sortType ? (_b = (_a = community === null || community === void 0 ? void 0 : community.pageSorts) === null || _a === void 0 ? void 0 : _a.posts) === null || _b === void 0 ? void 0 : _b[sortType] : undefined;
    return (!publishedPageSort ||
        (publishedPageSort.name === sortType &&
            Object.keys(publishedPageSort.publicOptions || {}).every((option) => RESERVED_PAGE_SORT_OPTIONS.has(option))));
};
// the `community.posts` page sort that serves a request, e.g. the preloaded `hot` page when a
// single-page community serves `active` client-side; undefined when the sort cannot be served
export const getPostPageSortType = (community, requestedSortType) => getPageSortTypeToRead(community === null || community === void 0 ? void 0 : community.posts, resolvePostSortType(community, requestedSortType));
export const getReplyPageSortType = (comment, requestedSortType) => getPageSortTypeToRead(comment === null || comment === void 0 ? void 0 : comment.replies, resolveReplySortType(comment, requestedSortType));
// whether a sort puts pinned comments first. A community configured with `settings.pages` publishes
// every sort's reserved options in `community.pageSorts`, so `pinnedFirst: "false"` (pinned comments
// ranked and filtered like any other) is readable from the record; pkc-js defaults it to "true", which
// is also what an unconfigured community, publishing no `pageSorts`, has always done. A sort the
// client computes from another sort's complete page follows that page's placement when the community
// published nothing about the requested sort.
const isPinnedFirstPageSortType = (community, scope, sortType, pageSortType) => {
    var _a, _b, _c;
    const publishedPageSorts = (_a = community === null || community === void 0 ? void 0 : community.pageSorts) === null || _a === void 0 ? void 0 : _a[scope];
    const publishedPageSort = (_b = (sortType !== undefined ? publishedPageSorts === null || publishedPageSorts === void 0 ? void 0 : publishedPageSorts[sortType] : undefined)) !== null && _b !== void 0 ? _b : (pageSortType !== undefined ? publishedPageSorts === null || publishedPageSorts === void 0 ? void 0 : publishedPageSorts[pageSortType] : undefined);
    const pinnedFirst = (_c = publishedPageSort === null || publishedPageSort === void 0 ? void 0 : publishedPageSort.publicOptions) === null || _c === void 0 ? void 0 : _c.pinnedFirst;
    return !(typeof pinnedFirst === "string" && pinnedFirst.trim().toLowerCase() === "false");
};
export const isPinnedFirstPostSortType = (community, sortType) => isPinnedFirstPageSortType(community, "posts", sortType, getPostPageSortType(community, sortType));
export const isPinnedFirstReplySortType = (community, comment, sortType) => isPinnedFirstPageSortType(community, "replies", sortType, getReplyPageSortType(comment, sortType));
//# sourceMappingURL=page-sorts.js.map