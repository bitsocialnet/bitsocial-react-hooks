import Logger from "@pkcprotocol/pkc-logger";
export declare const log: Logger;
import { RepliesPages, Comment, Comments } from "../../types.js";
type RepliesPagesState = {
    repliesPages: RepliesPages;
    comments: Comments;
    addNextRepliesPageToStore: Function;
    addRepliesPageCommentsToStore: Function;
};
declare const repliesPagesStore: import("zustand").UseBoundStore<import("zustand").StoreApi<RepliesPagesState>>;
/**
 * Util function to get all pages in the store for a
 * specific comment+sortType using `RepliesPage.nextCid`
 */
export declare const getRepliesPages: (comment: Comment, sortType: string | undefined, repliesPages: RepliesPages) => import("../../types.js").CommunityPage[];
export declare const getRepliesFirstPageCid: (comment: Comment, sortType?: string) => any;
export declare const resetRepliesPagesStore: () => Promise<void>;
export declare const resetRepliesPagesDatabaseAndStore: () => Promise<void>;
export default repliesPagesStore;
//# sourceMappingURL=replies-pages-store.d.ts.map