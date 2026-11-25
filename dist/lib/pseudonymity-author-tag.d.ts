import type { Comment } from "../types.js";
type Signer = {
    privateKey?: string;
    publicKey?: string;
};
/** K for an author private key (32-byte ed25519 seed) and a community signing public key. */
export declare const derivePseudonymityAuthorTagKey: (authorPrivateKey: Uint8Array, communityPublicKey: Uint8Array) => Uint8Array;
/** The tag a community publishes for `cid` under K: 16 bytes, unpadded standard base64. */
export declare const getPseudonymityAuthorTag: (key: Uint8Array, cid: string) => string;
/**
 * Whether the community that aliased `comment` tagged it as published by `signer`. Reads the tag
 * and the community key from the same signed `raw.commentUpdate`, which must be the update of this
 * comment's cid.
 */
export declare const isPseudonymityAuthorTagOfSigner: (comment: Comment | undefined, signer: Signer | undefined) => boolean;
/**
 * Whether `signer` published `comment` as far as its key can tell: the comment is signed by the
 * signer, or, on a pseudonymous board where the community re-signed it with an alias, the
 * community tagged it as the signer's. Neither signature is verified here, so the comment must come
 * from pkc-js, which verifies both, or have passed validateComment.
 */
export declare const isCommentBySigner: (comment: Comment | undefined, signer: Signer | undefined) => boolean;
export {};
//# sourceMappingURL=pseudonymity-author-tag.d.ts.map