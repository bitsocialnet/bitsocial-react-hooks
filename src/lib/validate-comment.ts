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
    // The rule pkc-js applies to page comments: names win over keys, which can rotate.
    const belongsToCommunity = community.name
      ? !communityName || areEquivalentCommunityAddresses(communityName, community.name)
      : !communityPublicKey || !community.publicKey || communityPublicKey === community.publicKey;
    if (!belongsToCommunity) {
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
