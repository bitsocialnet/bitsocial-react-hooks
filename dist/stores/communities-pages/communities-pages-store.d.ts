import Logger from "@pkcprotocol/pkc-logger";
export declare const log: Logger;
import { Community, CommunityPage, CommunitiesPages, Comment, Comments } from "../../types.js";
/** Freshness for comparison: max(updatedAt, timestamp, 0). Used to decide add vs replace per CID. Exported for coverage. */
export declare const getCommentFreshness: (comment: Comment | undefined) => number;
type CommunitiesPagesState = {
    communitiesPages: CommunitiesPages;
    comments: Comments;
    addNextCommunityPageToStore: Function;
    invalidateCommunityPages: Function;
    addCommunityPageCommentsToStore: Function;
};
declare const communitiesPagesStore: import("zustand").UseBoundStore<import("zustand").StoreApi<CommunitiesPagesState>>;
/**
 * Util function to get all pages in the store for a
 * specific community+sortType using `CommunityPage.nextCid`
 */
export declare const getCommunityPages: (community: Community, sortType: string | undefined, communitiesPages: CommunitiesPages, pageType: string, accountId?: string) => CommunityPage[];
export declare const getCommunityFirstPageCid: (community: Community, sortType: string | undefined, pageType?: string) => any;
export declare const resetCommunitiesPagesStore: () => Promise<void>;
export declare const resetCommunitiesPagesDatabaseAndStore: () => Promise<void>;
export default communitiesPagesStore;
//# sourceMappingURL=communities-pages-store.d.ts.map