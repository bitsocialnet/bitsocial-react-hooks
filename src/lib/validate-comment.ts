import { stringify as deterministicStringify } from "safe-stable-stringify";
import type { Comment, ValidateCommentOptions, ValidateCommentResult } from "../types";
import { areEquivalentCommunityAddresses } from "./community-address";
import { getPkcAddressFromPublicKey } from "./pkc-address";

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const invalid = (reason: string): ValidateCommentResult => ({ valid: false, reason });

// Same wire fallbacks as pkc-js getCommunityPublicKeyFromWire/getCommunityNameFromWire: old
// records carry a single subplebbitAddress that is either a domain or a key.
const isDomain = (value: unknown): value is string =>
  typeof value === "string" && value.includes(".");
const getCommunityPublicKeyFromWire = (record: Record<string, any>): string | undefined => {
  if (typeof record.communityPublicKey === "string") return record.communityPublicKey;
  if (typeof record.subplebbitAddress === "string" && !isDomain(record.subplebbitAddress))
    return record.subplebbitAddress;
};
const getCommunityNameFromWire = (record: Record<string, any>): string | undefined => {
  if (typeof record.communityName === "string") return record.communityName;
  if (isDomain(record.subplebbitAddress)) return record.subplebbitAddress;
};

/** The CIDv0 of a CommentIpfs record, hashed the way pkc-js hashes page comments. */
export const calculateCommentCid = async (commentIpfs: Record<string, any>): Promise<string> => {
  // Imported on first use like pkc-js itself, so apps don't load this large library up front.
  const ipfsOnlyHash: any = await import("typestub-ipfs-only-hash");
  const calculateIpfsHash = ipfsOnlyHash.of ?? ipfsOnlyHash.default?.of;
  return calculateIpfsHash(deterministicStringify(commentIpfs));
};

/**
 * Validate a comment received from an untrusted source, such as `{ cid, raw: { comment,
 * commentUpdate } }`, the shape of a preloaded page comment. pkc.validateComment checks the
 * signatures but trusts comment.cid, and only checks the commentUpdate signer when this pkc
 * instance is updating the community, so both are checked here as well.
 */
export const validateCommentWithPkc = async (
  comment: Comment,
  { validateReplies = true, community }: Omit<ValidateCommentOptions, "accountName"> = {},
  pkc: any,
): Promise<ValidateCommentResult> => {
  const cid = comment?.cid;
  const commentIpfs = comment?.raw?.comment;
  const commentUpdate = comment?.raw?.commentUpdate;
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
  let calculatedCid: string;
  try {
    calculatedCid = await calculateCommentCid(commentIpfs);
  } catch (error) {
    return invalid(`failed to hash comment.raw.comment: ${getErrorMessage(error)}`);
  }
  if (calculatedCid !== cid) {
    return invalid(`comment.raw.comment hashes to '${calculatedCid}', not comment.cid '${cid}'`);
  }

  // Preloaded replies, with their own nested updates, are trusted through this update's signature,
  // whose signer is checked below, so they must be one of the fields it covers.
  const signedPropertyNames = commentUpdate.signature?.signedPropertyNames;
  if (
    commentUpdate.replies !== undefined &&
    !(Array.isArray(signedPropertyNames) && signedPropertyNames.includes("replies"))
  ) {
    return invalid("comment.raw.commentUpdate.replies is not covered by its signature");
  }

  // Derive what pkc.validateComment reads from the hash-verified record, never from the wrapper.
  const communityPublicKey = getCommunityPublicKeyFromWire(commentIpfs);
  const communityName = getCommunityNameFromWire(commentIpfs);
  const postCid = commentIpfs.depth === 0 ? cid : commentIpfs.postCid;
  try {
    await pkc.validateComment(
      {
        cid,
        postCid,
        communityPublicKey,
        communityName,
        raw: { comment: commentIpfs, commentUpdate },
      },
      { validateReplies },
    );
  } catch (error) {
    return invalid(getErrorMessage(error));
  }

  // pkc.validateComment has already verified the commentUpdate signature, this checks who signed it.
  const updateSignerPublicKey = commentUpdate.signature?.publicKey;
  if (community) {
    // A loaded community record names its current signer, which also covers communities whose
    // signing key differs from the comment's communityPublicKey (rotated or delegated keys).
    const communitySignerPublicKey = community.signature?.publicKey;
    if (typeof communitySignerPublicKey !== "string") {
      return invalid("options.community has no signature.publicKey");
    }
    if (updateSignerPublicKey !== communitySignerPublicKey) {
      return invalid("comment.raw.commentUpdate is not signed by options.community");
    }
    // As pkc-js does for page comments, names win over keys, which can rotate. Without a name on
    // both sides the keys must match, and a comment with no comparable identifier is rejected:
    // another community can share this one's signing key (delegated or reused keys).
    const namesMatch =
      communityName && community.name
        ? areEquivalentCommunityAddresses(communityName, community.name)
        : undefined;
    const keysMatch =
      communityPublicKey && community.publicKey
        ? communityPublicKey === community.publicKey
        : undefined;
    if (!(namesMatch ?? keysMatch ?? false)) {
      return invalid("comment.raw.comment belongs to a different community than options.community");
    }
  } else {
    // Offline, the only community key the record proves is the communityPublicKey its author signed.
    let updateSignerAddress: string | undefined;
    try {
      updateSignerAddress = getPkcAddressFromPublicKey(updateSignerPublicKey);
    } catch {}
    if (!communityPublicKey || updateSignerAddress !== communityPublicKey) {
      return invalid(
        "comment.raw.commentUpdate is not signed by the comment's communityPublicKey, pass options.community to check it against the loaded community",
      );
    }
  }

  return { valid: true };
};
