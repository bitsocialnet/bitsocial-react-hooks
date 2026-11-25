import createStore from "zustand";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:author-tag-check");
// The pseudonymity author tag check needs X25519, HKDF and HMAC, about 40 KB that a static import
// would put in every app's startup bundle, so it loads the first time a comment needs it, the way
// the wallet repair loads author-wallet-proof.
let authorTagModule;
let authorTagModuleLoad;
/** Whether the author tag check has loaded, so hooks recheck their comment once it has. */
export const useAuthorTagCheckStore = createStore(() => ({ loaded: false }));
const loadAuthorTagModule = () => {
    authorTagModuleLoad || (authorTagModuleLoad = import("./pseudonymity-author-tag.js").then((module) => {
        authorTagModule = module;
        useAuthorTagCheckStore.setState({ loaded: true });
    }, (error) => {
        // the next comment that needs it retries
        authorTagModuleLoad = undefined;
        log.error("loading the author tag check failed", { error });
    }));
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
export const isCommentBySigner = (comment, signer) => {
    var _a, _b, _c;
    if (!comment || !signer) {
        return false;
    }
    if (authorTagModule) {
        return authorTagModule.isCommentBySigner(comment, signer);
    }
    if (typeof signer.publicKey === "string") {
        if (((_a = comment.signature) === null || _a === void 0 ? void 0 : _a.publicKey) === signer.publicKey) {
            return true;
        }
        if (typeof ((_c = (_b = comment.raw) === null || _b === void 0 ? void 0 : _b.commentUpdate) === null || _c === void 0 ? void 0 : _c.pseudonymityAuthorTag) !== "string") {
            return false;
        }
    }
    loadAuthorTagModule();
    return false;
};
//# sourceMappingURL=author-tag-check.js.map