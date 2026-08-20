import { Comment, UseCommentsOptions, UseCommentsResult, UseCommentOptions, UseCommentResult, UseCrosspostOptions, UseCrosspostResult, UseValidateCommentOptions, UseValidateCommentResult } from "../types.js";
export declare function getCommentFreshness(comment: Comment | undefined): number;
export declare function preferFresher(current: Comment | undefined, candidate: Comment | undefined): Comment | undefined;
/**
 * @param commentCid - The IPFS CID of the comment to get
 * @param community - The community identifier, e.g. {name: 'memes.eth', publicKey: '12D3KooW...'}.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useComment(options?: UseCommentOptions): UseCommentResult;
/**
 * Read a crosspost from its embedded signed record immediately, then use the normal comment store
 * to load the referenced community's current CommentUpdate when it is available.
 */
export declare function useCrosspost(options?: UseCrosspostOptions): UseCrosspostResult;
/**
 * @param commentCids - The IPFS CIDs of the comments to get
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useComments(options?: UseCommentsOptions): UseCommentsResult;
export declare function useValidateComment(options?: UseValidateCommentOptions): UseValidateCommentResult;
//# sourceMappingURL=comments.d.ts.map