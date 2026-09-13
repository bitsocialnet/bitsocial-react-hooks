import { Comment, Community } from "../types.js";
export declare const isFlatSortType: (sortType?: string) => boolean;
export declare const getSortTimeframeSeconds: (sortType?: string) => number | undefined;
export declare const getAvailablePostSortTypes: (community?: Community) => string[];
export declare const getAvailableReplySortTypes: (comment?: Comment) => string[];
export declare const getPreloadedPostSortType: (community?: Community) => string | undefined;
export declare const getPreloadedReplySortType: (comment?: Comment) => string | undefined;
export declare const resolvePostSortType: (community: Community | undefined, requestedSortType?: string) => string | undefined;
export declare const resolveReplySortType: (comment: Comment | undefined, requestedSortType?: string) => string | undefined;
export declare const getPostPageSortType: (community: Community | undefined, requestedSortType?: string) => string | undefined;
export declare const getReplyPageSortType: (comment: Comment | undefined, requestedSortType?: string) => string | undefined;
//# sourceMappingURL=page-sorts.d.ts.map