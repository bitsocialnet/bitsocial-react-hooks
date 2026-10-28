import Logger from "@pkcprotocol/pkc-logger";
export declare const log: Logger;
import { Comments } from "../../types.js";
export declare const listeners: any;
export type CommentsState = {
    comments: Comments;
    errors: {
        [commentCid: string]: Error[];
    };
    openingUpdatesPending: {
        [commentCid: string]: true;
    };
    addCommentToStore: Function;
    startCommentAutoUpdate: Function;
    stopCommentAutoUpdate: Function;
    refreshComment: Function;
};
declare const commentsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<CommentsState>>;
export declare const resetCommentsStore: () => Promise<void>;
export declare const resetCommentsDatabaseAndStore: () => Promise<void>;
export default commentsStore;
//# sourceMappingURL=comments-store.d.ts.map