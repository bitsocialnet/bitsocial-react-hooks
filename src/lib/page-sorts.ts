import { Comment, Community } from "../types";

type PagesRecord = {
  pages?: Record<string, unknown>;
  pageCids?: Record<string, unknown>;
};

const getAvailablePageSortTypes = (record?: PagesRecord): string[] => {
  const sortTypes = new Set<string>();
  for (const sortType of Object.keys(record?.pages || {})) {
    if (sortType) sortTypes.add(sortType);
  }
  for (const sortType of Object.keys(record?.pageCids || {})) {
    if (sortType) sortTypes.add(sortType);
  }
  return [...sortTypes];
};

const getPreloadedPageSortType = (record?: PagesRecord): string | undefined => {
  const preloadedSortType = Object.keys(record?.pages || {}).find(Boolean);
  return preloadedSortType || getAvailablePageSortTypes(record)[0];
};

export const getAvailablePostSortTypes = (community?: Community): string[] =>
  getAvailablePageSortTypes(community?.posts);

export const getAvailableReplySortTypes = (comment?: Comment): string[] =>
  getAvailablePageSortTypes(comment?.replies);

export const getPreloadedPostSortType = (community?: Community): string | undefined =>
  getPreloadedPageSortType(community?.posts);

export const getPreloadedReplySortType = (comment?: Comment): string | undefined =>
  getPreloadedPageSortType(comment?.replies);

export const resolvePostSortType = (
  community: Community | undefined,
  requestedSortType?: string,
): string | undefined => {
  if (requestedSortType !== undefined) {
    return getAvailablePostSortTypes(community).includes(requestedSortType)
      ? requestedSortType
      : undefined;
  }
  return getPreloadedPostSortType(community);
};

export const resolveReplySortType = (
  comment: Comment | undefined,
  requestedSortType?: string,
): string | undefined => {
  if (requestedSortType !== undefined) {
    return getAvailableReplySortTypes(comment).includes(requestedSortType)
      ? requestedSortType
      : undefined;
  }
  return getPreloadedReplySortType(comment);
};
