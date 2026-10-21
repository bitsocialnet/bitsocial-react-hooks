import type { Comment, ValidateCommentOptions, ValidateCommentResult } from "../types.js";
/** The CIDv0 of a CommentIpfs record, hashed the way pkc-js hashes page comments. */
export declare const calculateCommentCid: (commentIpfs: Record<string, any>) => Promise<string>;
/** A pkc instance without network clients, created on first use for the current setPkcJs implementation. */
export declare const getOfflinePkc: () => Promise<any>;
/**
 * Validate a comment received from an untrusted source, such as `{ cid, raw: { comment,
 * commentUpdate } }`, the shape of a preloaded page comment. pkc.validateComment checks the
 * signatures but trusts comment.cid, and only checks the commentUpdate signer when this pkc
 * instance is updating the community, so both are checked here as well.
 */
export declare const validateCommentWithPkc: (comment: Comment, { validateReplies, community }: Omit<ValidateCommentOptions, "accountName"> | undefined, pkc: any) => Promise<ValidateCommentResult>;
//# sourceMappingURL=validate-comment.d.ts.map