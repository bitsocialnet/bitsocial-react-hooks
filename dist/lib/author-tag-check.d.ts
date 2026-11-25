import type { Comment } from "../types.js";
type Signer = {
    privateKey?: string;
    publicKey?: string;
};
/** Whether the author tag check has loaded, so hooks recheck their comment once it has. */
export declare const useAuthorTagCheckStore: import("zustand").UseBoundStore<import("zustand").StoreApi<{
    loaded: boolean;
}>>;
/**
 * Whether `signer` published `comment`: the comment is signed by the signer, or, on a pseudonymous
 * board where the community re-signed it with an alias, the community tagged it as the signer's.
 * A signature by the signer's stored public key is recognized right away. A tag, or a signature
 * when the signer has no stored public key, needs the author tag check: until it has loaded, the
 * comment reads as not the signer's, and the first such comment starts loading it.
 *
 * Neither signature is verified here, so the comment must come from pkc-js, which verifies both,
 * or have passed validateComment.
 */
export declare const isCommentBySigner: (comment: Comment | undefined, signer: Signer | undefined) => boolean;
export {};
//# sourceMappingURL=author-tag-check.d.ts.map