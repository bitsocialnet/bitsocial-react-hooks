// Standard pkc-js sorts (pkc-js src/pages/util.ts) whose scoring the feed sorter reproduces. pkc-js
// preloads a single sort and only publishes pageCids once that page overflows, so a record whose
// comments all fit in the preloaded page can serve any of these by re-sorting that page client-side.
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
const getPreloadedPageSortType = (record) => {
    const preloadedSortType = Object.keys((record === null || record === void 0 ? void 0 : record.pages) || {}).find(Boolean);
    return preloadedSortType || getPublishedPageSortTypes(record)[0];
};
const resolvePageSortType = (record, requestedSortType, clientSortableSortTypes) => {
    if (requestedSortType !== undefined) {
        return getAvailablePageSortTypes(record, clientSortableSortTypes).includes(requestedSortType)
            ? requestedSortType
            : undefined;
    }
    return getPreloadedPageSortType(record);
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
export const getPreloadedPostSortType = (community) => getPreloadedPageSortType(community === null || community === void 0 ? void 0 : community.posts);
export const getPreloadedReplySortType = (comment) => getPreloadedPageSortType(comment === null || comment === void 0 ? void 0 : comment.replies);
export const resolvePostSortType = (community, requestedSortType) => resolvePageSortType(community === null || community === void 0 ? void 0 : community.posts, requestedSortType, CLIENT_SORTABLE_POST_SORT_TYPES);
export const resolveReplySortType = (comment, requestedSortType) => resolvePageSortType(comment === null || comment === void 0 ? void 0 : comment.replies, requestedSortType, getClientSortableReplySortTypes(comment));
// the `community.posts` page sort that serves a request, e.g. the preloaded `hot` page when a
// single-page community serves `active` client-side; undefined when the sort cannot be served
export const getPostPageSortType = (community, requestedSortType) => getPageSortTypeToRead(community === null || community === void 0 ? void 0 : community.posts, resolvePostSortType(community, requestedSortType));
export const getReplyPageSortType = (comment, requestedSortType) => getPageSortTypeToRead(comment === null || comment === void 0 ? void 0 : comment.replies, resolveReplySortType(comment, requestedSortType));
//# sourceMappingURL=page-sorts.js.map