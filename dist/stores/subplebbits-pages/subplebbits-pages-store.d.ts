import Logger from "@plebbit/plebbit-logger";
export declare const log: Logger;
import { Subplebbit, SubplebbitPage, SubplebbitsPages, Comment, Comments } from "../../types";
/** Freshness for comparison: max(updatedAt, timestamp, 0). Used to decide add vs replace per CID. Exported for coverage. */
export declare const getCommentFreshness: (comment: Comment | undefined) => number;
type SubplebbitsPagesState = {
    subplebbitsPages: SubplebbitsPages;
    comments: Comments;
    addNextSubplebbitPageToStore: Function;
    invalidateSubplebbitPages: Function;
    addSubplebbitPageCommentsToStore: Function;
};
declare const subplebbitsPagesStore: import("zustand").UseBoundStore<import("zustand").StoreApi<SubplebbitsPagesState>>;
/**
 * Util function to get all pages in the store for a
 * specific subplebbit+sortType using `SubplebbitPage.nextCid`
 */
export declare const getSubplebbitPages: (subplebbit: Subplebbit, sortType: string, subplebbitsPages: SubplebbitsPages, pageType: string) => SubplebbitPage[];
export declare const getSubplebbitFirstPageCid: (subplebbit: Subplebbit, sortType: string, pageType?: string) => any;
export declare const resetSubplebbitsPagesStore: () => Promise<void>;
export declare const resetSubplebbitsPagesDatabaseAndStore: () => Promise<void>;
export default subplebbitsPagesStore;
