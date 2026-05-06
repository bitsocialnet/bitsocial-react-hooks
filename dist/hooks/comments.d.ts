import { Comment, UseCommentsOptions, UseCommentsResult, UseCommentOptions, UseCommentResult, UseValidateCommentOptions, UseValidateCommentResult } from "../types.js";
export declare function getCommentFreshness(comment: Comment | undefined): number;
export declare function preferFresher(current: Comment | undefined, candidate: Comment | undefined): Comment | undefined;
/**
 * @param commentCid - The IPFS CID of the comment to get
 * @param community - The community identifier, e.g. {name: 'memes.eth', publicKey: '12D3KooW...'}.
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export declare function useComment(options?: UseCommentOptions): UseCommentResult;
/**
 * @param commentCids - The IPFS CIDs of the comments to get
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export declare function useComments(options?: UseCommentsOptions): UseCommentsResult;
export declare function useValidateComment(options?: UseValidateCommentOptions): UseValidateCommentResult;
//# sourceMappingURL=comments.d.ts.map