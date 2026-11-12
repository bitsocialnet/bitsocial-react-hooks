import { Comment, Community } from "../types";

type PagesRecord = {
  pages?: Record<string, unknown>;
  pageCids?: Record<string, unknown>;
};

type PreloadedPage = { comments?: unknown; nextCid?: string } | undefined;

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
const getClientSortableReplySortTypes = (comment?: Comment): string[] => {
  const isPost = comment?.depth !== undefined ? comment.depth === 0 : !comment?.parentCid;
  return isPost
    ? CLIENT_SORTABLE_REPLY_SORT_TYPES
    : CLIENT_SORTABLE_REPLY_SORT_TYPES.filter((sortType) => !isFlatSortType(sortType));
};

// pkc-js TIMEFRAMES_TO_SECONDS, applied client-side when a timeframe sort is computed from a
// preloaded page instead of a page the community windowed itself
const SORT_TIMEFRAMES_SECONDS: Record<string, number> = {
  Hour: 3600,
  Day: 86400,
  Week: 604800,
  Month: 2629746,
  Year: 31557600,
};

export const isFlatSortType = (sortType?: string): boolean => Boolean(sortType?.endsWith("Flat"));

export const getSortTimeframeSeconds = (sortType?: string): number | undefined => {
  const timeframe = sortType?.match(/^(?:top|controversial)(Hour|Day|Week|Month|Year)$/)?.[1];
  return timeframe ? SORT_TIMEFRAMES_SECONDS[timeframe] : undefined;
};

const getPublishedPageSortTypes = (record?: PagesRecord): string[] => {
  const sortTypes = new Set<string>();
  for (const sortType of Object.keys(record?.pages || {})) {
    if (sortType) sortTypes.add(sortType);
  }
  for (const sortType of Object.keys(record?.pageCids || {})) {
    if (sortType) sortTypes.add(sortType);
  }
  return [...sortTypes];
};

// preloaded pages holding the record's complete comment set: no page continues with a nextCid and
// no pageCids are published (pkc-js publishes pageCids for every sort once the preloaded page overflows)
const getCompletePreloadedPageSortTypes = (record?: PagesRecord): string[] => {
  if (Object.keys(record?.pageCids || {}).length > 0) {
    return [];
  }
  const pages = record?.pages || {};
  const sortTypes = Object.keys(pages).filter((sortType) =>
    Array.isArray((pages[sortType] as PreloadedPage)?.comments),
  );
  if (
    !sortTypes.length ||
    sortTypes.some((sortType) => (pages[sortType] as PreloadedPage)?.nextCid)
  ) {
    return [];
  }
  // a page windowed by a timeframe sort only holds that window, never the complete set
  return sortTypes.filter((sortType) => !getSortTimeframeSeconds(sortType));
};

// a flat sort flattens the whole reply tree, so every nested reply chain must be complete too
const hasCompleteReplyTree = (page: PreloadedPage): boolean =>
  ((page?.comments as Comment[] | undefined) || []).every((comment) => {
    const completeSortTypes = getCompletePreloadedPageSortTypes(comment?.replies);
    if (!completeSortTypes.length) {
      // no preloaded replies is only complete when the comment reports none, and a continued or
      // paged chain is never complete
      return !(comment?.replyCount > 0) && !Object.keys(comment?.replies?.pages || {}).length;
    }
    const hierarchicalSortType = completeSortTypes.find((sortType) => !isFlatSortType(sortType));
    return hierarchicalSortType === undefined
      ? true
      : hasCompleteReplyTree(comment.replies.pages[hierarchicalSortType]);
  });

// a flat page cannot rebuild the reply tree, so it only serves flat sorts; a hierarchical page
// serves flat sorts only when its nested reply chains are complete
const getClientSortableSortTypes = (
  record: PagesRecord | undefined,
  clientSortableSortTypes: string[],
): string[] => {
  const completeSortTypes = getCompletePreloadedPageSortTypes(record);
  if (!completeSortTypes.length) {
    return [];
  }
  const hierarchicalSortType = completeSortTypes.find((sortType) => !isFlatSortType(sortType));
  if (hierarchicalSortType === undefined) {
    return clientSortableSortTypes.filter(isFlatSortType);
  }
  const canFlatten =
    completeSortTypes.some(isFlatSortType) ||
    hasCompleteReplyTree(record?.pages?.[hierarchicalSortType] as PreloadedPage);
  return canFlatten
    ? clientSortableSortTypes
    : clientSortableSortTypes.filter((sortType) => !isFlatSortType(sortType));
};

const getAvailablePageSortTypes = (
  record: PagesRecord | undefined,
  clientSortableSortTypes: string[],
): string[] => {
  const sortTypes = getPublishedPageSortTypes(record);
  for (const sortType of getClientSortableSortTypes(record, clientSortableSortTypes)) {
    if (!sortTypes.includes(sortType)) sortTypes.push(sortType);
  }
  return sortTypes;
};

// the sorts whose first page the record embeds, in the order the community configured them, so the
// first one is the community's default sort. A community may preload several sorts, or none: a
// record with empty `pages` has no preloaded sort, even when it publishes `pageCids`.
const getPreloadedPageSortTypes = (record?: PagesRecord): string[] =>
  Object.keys(record?.pages || {}).filter(Boolean);

// a requested sort the record does not serve, as opposed to a record that has not loaded or has no
// comments at all, which publishes no sort to compare the request with
const isPageSortTypeUnavailable = (
  record: PagesRecord | undefined,
  requestedSortType: string | undefined,
  clientSortableSortTypes: string[],
): boolean =>
  requestedSortType !== undefined &&
  getPublishedPageSortTypes(record).length > 0 &&
  !getAvailablePageSortTypes(record, clientSortableSortTypes).includes(requestedSortType);

const resolvePageSortType = (
  record: PagesRecord | undefined,
  requestedSortType: string | undefined,
  clientSortableSortTypes: string[],
): string | undefined => {
  if (requestedSortType !== undefined) {
    return getAvailablePageSortTypes(record, clientSortableSortTypes).includes(requestedSortType)
      ? requestedSortType
      : undefined;
  }
  // no sort requested: the community's default is its first preloaded sort. A record that preloads
  // nothing still has to load something, so it falls back to the first sort it publishes page cids for.
  return getPreloadedPageSortTypes(record)[0] ?? getPublishedPageSortTypes(record)[0];
};

// the page that serves a resolved sort: its published page, or the complete preloaded page the
// client re-sorts (a flat sort prefers a complete flat page, else flattens a hierarchical one)
const getPageSortTypeToRead = (
  record: PagesRecord | undefined,
  sortType: string | undefined,
): string | undefined => {
  if (sortType === undefined) {
    return undefined;
  }
  if (getPublishedPageSortTypes(record).includes(sortType)) {
    return sortType;
  }
  const completeSortTypes = getCompletePreloadedPageSortTypes(record);
  const hierarchicalSortType = completeSortTypes.find(
    (preloadedSortType) => !isFlatSortType(preloadedSortType),
  );
  if (isFlatSortType(sortType)) {
    return completeSortTypes.find(isFlatSortType) ?? hierarchicalSortType;
  }
  return hierarchicalSortType;
};

export const getAvailablePostSortTypes = (community?: Community): string[] =>
  getAvailablePageSortTypes(community?.posts, CLIENT_SORTABLE_POST_SORT_TYPES);

export const getAvailableReplySortTypes = (comment?: Comment): string[] =>
  getAvailablePageSortTypes(comment?.replies, getClientSortableReplySortTypes(comment));

export const getPreloadedPostSortTypes = (community?: Community): string[] =>
  getPreloadedPageSortTypes(community?.posts);

export const getPreloadedReplySortTypes = (comment?: Comment): string[] =>
  getPreloadedPageSortTypes(comment?.replies);

// the community's default sort: its first preloaded sort, undefined when it preloads none
export const getPreloadedPostSortType = (community?: Community): string | undefined =>
  getPreloadedPostSortTypes(community)[0];

export const getPreloadedReplySortType = (comment?: Comment): string | undefined =>
  getPreloadedReplySortTypes(comment)[0];

export const isPostSortTypeUnavailable = (
  community: Community | undefined,
  requestedSortType?: string,
): boolean =>
  isPageSortTypeUnavailable(community?.posts, requestedSortType, CLIENT_SORTABLE_POST_SORT_TYPES);

export const isReplySortTypeUnavailable = (
  comment: Comment | undefined,
  requestedSortType?: string,
): boolean =>
  isPageSortTypeUnavailable(
    comment?.replies,
    requestedSortType,
    getClientSortableReplySortTypes(comment),
  );

export const resolvePostSortType = (
  community: Community | undefined,
  requestedSortType?: string,
): string | undefined =>
  resolvePageSortType(community?.posts, requestedSortType, CLIENT_SORTABLE_POST_SORT_TYPES);

export const resolveReplySortType = (
  comment: Comment | undefined,
  requestedSortType?: string,
): string | undefined =>
  resolvePageSortType(
    comment?.replies,
    requestedSortType,
    getClientSortableReplySortTypes(comment),
  );

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
export const isBuiltInPostSortType = (
  community: Community | undefined,
  sortType: string | undefined,
): boolean => {
  const publishedPageSort = sortType ? community?.pageSorts?.posts?.[sortType] : undefined;
  return (
    !publishedPageSort ||
    (publishedPageSort.name === sortType &&
      Object.keys(publishedPageSort.publicOptions || {}).every((option) =>
        RESERVED_PAGE_SORT_OPTIONS.has(option),
      ))
  );
};

// the `community.posts` page sort that serves a request, e.g. the preloaded `hot` page when a
// single-page community serves `active` client-side; undefined when the sort cannot be served
export const getPostPageSortType = (
  community: Community | undefined,
  requestedSortType?: string,
): string | undefined =>
  getPageSortTypeToRead(community?.posts, resolvePostSortType(community, requestedSortType));

export const getReplyPageSortType = (
  comment: Comment | undefined,
  requestedSortType?: string,
): string | undefined =>
  getPageSortTypeToRead(comment?.replies, resolveReplySortType(comment, requestedSortType));

// whether a sort puts pinned comments first. A community configured with `settings.pages` publishes
// every sort's reserved options in `community.pageSorts`, so `pinnedFirst: "false"` (pinned comments
// ranked and filtered like any other) is readable from the record; pkc-js defaults it to "true", which
// is also what an unconfigured community, publishing no `pageSorts`, has always done. A sort the
// client computes from another sort's complete page follows that page's placement when the community
// published nothing about the requested sort.
const isPinnedFirstPageSortType = (
  community: Community | undefined,
  scope: "posts" | "replies",
  sortType: string | undefined,
  pageSortType: string | undefined,
): boolean => {
  const publishedPageSorts = community?.pageSorts?.[scope];
  const publishedPageSort =
    (sortType !== undefined ? publishedPageSorts?.[sortType] : undefined) ??
    (pageSortType !== undefined ? publishedPageSorts?.[pageSortType] : undefined);
  const pinnedFirst = publishedPageSort?.publicOptions?.pinnedFirst;
  return !(typeof pinnedFirst === "string" && pinnedFirst.trim().toLowerCase() === "false");
};

export const isPinnedFirstPostSortType = (
  community: Community | undefined,
  sortType?: string,
): boolean =>
  isPinnedFirstPageSortType(community, "posts", sortType, getPostPageSortType(community, sortType));

export const isPinnedFirstReplySortType = (
  community: Community | undefined,
  comment: Comment | undefined,
  sortType?: string,
): boolean =>
  isPinnedFirstPageSortType(
    community,
    "replies",
    sortType,
    getReplyPageSortType(comment, sortType),
  );
