var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { stringify as deterministicStringify } from "safe-stable-stringify";
import { areEquivalentCommunityAddresses } from "./community-address.js";
import { getPkcAddressFromPublicKey } from "./pkc-address.js";
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const getErrorMessage = (error) => error instanceof Error ? error.message : String(error);
const invalid = (reason) => ({ valid: false, reason });
// Same wire fallbacks as pkc-js getCommunityPublicKeyFromWire/getCommunityNameFromWire: old
// records carry a single subplebbitAddress that is either a domain or a key.
const isDomain = (value) => typeof value === "string" && value.includes(".");
const getCommunityPublicKeyFromWire = (record) => {
    if (typeof record.communityPublicKey === "string")
        return record.communityPublicKey;
    if (typeof record.subplebbitAddress === "string" && !isDomain(record.subplebbitAddress))
        return record.subplebbitAddress;
};
const getCommunityNameFromWire = (record) => {
    if (typeof record.communityName === "string")
        return record.communityName;
    if (isDomain(record.subplebbitAddress))
        return record.subplebbitAddress;
};
/** The CIDv0 of a CommentIpfs record, hashed the way pkc-js hashes page comments. */
export const calculateCommentCid = (commentIpfs) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // Imported on first use like pkc-js itself, so apps don't load this large library up front.
    const ipfsOnlyHash = yield import("typestub-ipfs-only-hash");
    const calculateIpfsHash = (_a = ipfsOnlyHash.of) !== null && _a !== void 0 ? _a : (_b = ipfsOnlyHash.default) === null || _b === void 0 ? void 0 : _b.of;
    return calculateIpfsHash(deterministicStringify(commentIpfs));
});
/**
 * Validate a comment received from an untrusted source, such as `{ cid, raw: { comment,
 * commentUpdate } }`, the shape of a preloaded page comment. pkc.validateComment checks the
 * signatures but trusts comment.cid, and only checks the commentUpdate signer when this pkc
 * instance is updating the community, so both are checked here as well.
 */
export const validateCommentWithPkc = (comment_1, ...args_1) => __awaiter(void 0, [comment_1, ...args_1], void 0, function* (comment, { validateReplies = true, community } = {}, pkc) {
    var _a, _b, _c, _d, _e, _f;
    const cid = comment === null || comment === void 0 ? void 0 : comment.cid;
    const commentIpfs = (_a = comment === null || comment === void 0 ? void 0 : comment.raw) === null || _a === void 0 ? void 0 : _a.comment;
    const commentUpdate = (_b = comment === null || comment === void 0 ? void 0 : comment.raw) === null || _b === void 0 ? void 0 : _b.commentUpdate;
    if (typeof cid !== "string" || !cid) {
        return invalid("comment.cid is not a string");
    }
    if (!isObject(commentIpfs)) {
        return invalid("comment.raw.comment is not an object");
    }
    if (!isObject(commentUpdate)) {
        return invalid("comment.raw.commentUpdate is not an object");
    }
    // Without this, a signed comment could be shown under another comment's cid together with that
    // cid's genuine commentUpdate, and the fields a community adds unsigned (depth, postCid,
    // thumbnailUrl, ...) could be altered.
    let calculatedCid;
    try {
        calculatedCid = yield calculateCommentCid(commentIpfs);
    }
    catch (error) {
        return invalid(`failed to hash comment.raw.comment: ${getErrorMessage(error)}`);
    }
    if (calculatedCid !== cid) {
        return invalid(`comment.raw.comment hashes to '${calculatedCid}', not comment.cid '${cid}'`);
    }
    // Preloaded replies, with their own nested updates, are trusted through this update's signature,
    // whose signer is checked below, so they must be one of the fields it covers.
    const signedPropertyNames = (_c = commentUpdate.signature) === null || _c === void 0 ? void 0 : _c.signedPropertyNames;
    if (commentUpdate.replies !== undefined &&
        !(Array.isArray(signedPropertyNames) && signedPropertyNames.includes("replies"))) {
        return invalid("comment.raw.commentUpdate.replies is not covered by its signature");
    }
    // Derive what pkc.validateComment reads from the hash-verified record, never from the wrapper.
    const communityPublicKey = getCommunityPublicKeyFromWire(commentIpfs);
    const communityName = getCommunityNameFromWire(commentIpfs);
    const postCid = commentIpfs.depth === 0 ? cid : commentIpfs.postCid;
    try {
        yield pkc.validateComment({
            cid,
            postCid,
            communityPublicKey,
            communityName,
            raw: { comment: commentIpfs, commentUpdate },
        }, { validateReplies });
    }
    catch (error) {
        return invalid(getErrorMessage(error));
    }
    // pkc.validateComment has already verified the commentUpdate signature, this checks who signed it.
    const updateSignerPublicKey = (_d = commentUpdate.signature) === null || _d === void 0 ? void 0 : _d.publicKey;
    if (community) {
        // A loaded community record names its current signer, which also covers communities whose
        // signing key differs from the comment's communityPublicKey (rotated or delegated keys).
        const communitySignerPublicKey = (_e = community.signature) === null || _e === void 0 ? void 0 : _e.publicKey;
        if (typeof communitySignerPublicKey !== "string") {
            return invalid("options.community has no signature.publicKey");
        }
        if (updateSignerPublicKey !== communitySignerPublicKey) {
            return invalid("comment.raw.commentUpdate is not signed by options.community");
        }
        // As pkc-js does for page comments, names win over keys, which can rotate. Without a name on
        // both sides the keys must match, and a comment with no comparable identifier is rejected:
        // another community can share this one's signing key (delegated or reused keys).
        const namesMatch = communityName && community.name
            ? areEquivalentCommunityAddresses(communityName, community.name)
            : undefined;
        const keysMatch = communityPublicKey && community.publicKey
            ? communityPublicKey === community.publicKey
            : undefined;
        if (!((_f = namesMatch !== null && namesMatch !== void 0 ? namesMatch : keysMatch) !== null && _f !== void 0 ? _f : false)) {
            return invalid("comment.raw.comment belongs to a different community than options.community");
        }
    }
    else {
        // Offline, the only community key the record proves is the communityPublicKey its author signed.
        let updateSignerAddress;
        try {
            updateSignerAddress = getPkcAddressFromPublicKey(updateSignerPublicKey);
        }
        catch (_g) { }
        if (!communityPublicKey || updateSignerAddress !== communityPublicKey) {
            return invalid("comment.raw.commentUpdate is not signed by the comment's communityPublicKey, pass options.community to check it against the loaded community");
        }
    }
    return { valid: true };
});
//# sourceMappingURL=validate-comment.js.map