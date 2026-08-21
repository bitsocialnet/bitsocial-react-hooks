const getAvailablePageSortTypes = (record) => {
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
const getPreloadedPageSortType = (record) => {
    const preloadedSortType = Object.keys((record === null || record === void 0 ? void 0 : record.pages) || {}).find(Boolean);
    return preloadedSortType || getAvailablePageSortTypes(record)[0];
};
export const getAvailablePostSortTypes = (community) => getAvailablePageSortTypes(community === null || community === void 0 ? void 0 : community.posts);
export const getAvailableReplySortTypes = (comment) => getAvailablePageSortTypes(comment === null || comment === void 0 ? void 0 : comment.replies);
export const getPreloadedPostSortType = (community) => getPreloadedPageSortType(community === null || community === void 0 ? void 0 : community.posts);
export const getPreloadedReplySortType = (comment) => getPreloadedPageSortType(comment === null || comment === void 0 ? void 0 : comment.replies);
export const resolvePostSortType = (community, requestedSortType) => {
    if (requestedSortType !== undefined) {
        return getAvailablePostSortTypes(community).includes(requestedSortType)
            ? requestedSortType
            : undefined;
    }
    return getPreloadedPostSortType(community);
};
export const resolveReplySortType = (comment, requestedSortType) => {
    if (requestedSortType !== undefined) {
        return getAvailableReplySortTypes(comment).includes(requestedSortType)
            ? requestedSortType
            : undefined;
    }
    return getPreloadedReplySortType(comment);
};
//# sourceMappingURL=page-sorts.js.map