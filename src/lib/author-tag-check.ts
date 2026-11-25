import createStore from "zustand";
import Logger from "@pkcprotocol/pkc-logger";
import type { Comment } from "../types";

const log = Logger("bitsocial-react-hooks:author-tag-check");

type Signer = { privateKey?: string; publicKey?: string };
type AuthorTagModule = typeof import("./pseudonymity-author-tag");

// The pseudonymity author tag check needs X25519, HKDF and HMAC, about 40 KB that a static import
// would put in every app's startup bundle, so it loads the first time a comment needs it, the way
// the wallet repair loads author-wallet-proof.
let authorTagModule: AuthorTagModule | undefined;
let authorTagModuleLoad: Promise<void> | undefined;

/** Whether the author tag check has loaded, so hooks recheck their comment once it has. */
export const useAuthorTagCheckStore = createStore<{ loaded: boolean }>(() => ({ loaded: false }));

const loadAuthorTagModule = () => {
  authorTagModuleLoad ||= import("./pseudonymity-author-tag").then(
    (module) => {
      authorTagModule = module;
      useAuthorTagCheckStore.setState({ loaded: true });
    },
    (error) => {
      // the next comment that needs it retries
      authorTagModuleLoad = undefined;
      log.error("loading the author tag check failed", { error });
    },
  );
};

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
export const isCommentBySigner = (
  comment: Comment | undefined,
  signer: Signer | undefined,
): boolean => {
  if (!comment || !signer) {
    return false;
  }
  if (authorTagModule) {
    return authorTagModule.isCommentBySigner(comment, signer);
  }
  if (typeof signer.publicKey === "string") {
    if (comment.signature?.publicKey === signer.publicKey) {
      return true;
    }
    if (typeof comment.raw?.commentUpdate?.pseudonymityAuthorTag !== "string") {
      return false;
    }
  }
  loadAuthorTagModule();
  return false;
};
