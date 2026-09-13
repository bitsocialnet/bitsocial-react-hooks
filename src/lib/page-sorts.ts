import { Comment, Community } from "../types";

type PagesRecord = {
  pages?: Record<string, unknown>;
  pageCids?: Record<string, unknown>;
};

type PreloadedPage = { comments?: unknown; nextCid?: string } | undefined;

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
  return sortTypes;
};

// a flat page cannot rebuild the reply tree, so it only serves flat sorts
const getClientSortableSortTypes = (
  record: PagesRecord | undefined,
  clientSortableSortTypes: string[],
): string[] => {
  const completeSortTypes = getCompletePreloadedPageSortTypes(record);
  if (!completeSortTypes.length) {
    return [];
  }
  if (completeSortTypes.some((sortType) => !isFlatSortType(sortType))) {
    return clientSortableSortTypes;
  }
  return clientSortableSortTypes.filter(isFlatSortType);
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

const getPreloadedPageSortType = (record?: PagesRecord): string | undefined => {
  const preloadedSortType = Object.keys(record?.pages || {}).find(Boolean);
  return preloadedSortType || getPublishedPageSortTypes(record)[0];
};

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
  return getPreloadedPageSortType(record);
};

// the page that serves a resolved sort: its published page, or the complete preloaded page the
// client re-sorts (a flat sort can also be flattened from a hierarchical page)
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
  return (
    completeSortTypes.find((preloadedSortType) => !isFlatSortType(preloadedSortType)) ??
    (isFlatSortType(sortType) ? completeSortTypes[0] : undefined)
  );
};

export const getAvailablePostSortTypes = (community?: Community): string[] =>
  getAvailablePageSortTypes(community?.posts, CLIENT_SORTABLE_POST_SORT_TYPES);

export const getAvailableReplySortTypes = (comment?: Comment): string[] =>
  getAvailablePageSortTypes(comment?.replies, getClientSortableReplySortTypes(comment));

export const getPreloadedPostSortType = (community?: Community): string | undefined =>
  getPreloadedPageSortType(community?.posts);

export const getPreloadedReplySortType = (comment?: Comment): string | undefined =>
  getPreloadedPageSortType(comment?.replies);

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
