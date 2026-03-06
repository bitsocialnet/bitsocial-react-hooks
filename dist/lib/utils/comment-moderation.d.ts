import { Comment } from "../../types";
export declare function addCommentModeration(comment: Comment | undefined): Comment | undefined;
export declare function addCommentModerationToComments<T extends Comment | undefined>(comments: T[] | undefined): T[];
