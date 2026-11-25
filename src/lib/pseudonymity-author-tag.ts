import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import QuickLRU from "quick-lru";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import type { Comment } from "../types";

// Own-post recognition on pseudonymous boards, as specified in pkc-js
// docs/protocol/pseudonymity-author-tag.md. A community that aliases a comment publishes
// commentUpdate.pseudonymityAuthorTag = base64(HMAC-SHA256(K, cid)[0..16]), where K comes from an
// X25519 exchange between the author's key and the key that signed the CommentUpdate. Any device
// holding the account key derives the same K, so it recognizes posts published from other devices.
// The label carries the derivation version; a new derivation ships under a new label.
const TAG_INFO = new TextEncoder().encode("pkc-pseudonymity-author-tag-v1");
const TAG_REGEX = /^[A-Za-z0-9+/]{22}$/;
const textEncoder = new TextEncoder();

type Signer = { privateKey?: string; publicKey?: string };

const decodeKey = (key: unknown): Uint8Array | undefined => {
  if (typeof key !== "string") {
    return;
  }
  try {
    const bytes = uint8ArrayFromString(key.replace(/=+$/, ""), "base64");
    return bytes.length === 32 ? bytes : undefined;
  } catch {
    return;
  }
};

/** K for an author private key (32-byte ed25519 seed) and a community signing public key. */
export const derivePseudonymityAuthorTagKey = (
  authorPrivateKey: Uint8Array,
  communityPublicKey: Uint8Array,
): Uint8Array => {
  const sharedSecret = x25519.getSharedSecret(
    ed25519.utils.toMontgomerySecret(authorPrivateKey),
    ed25519.utils.toMontgomery(communityPublicKey),
  );
  return hkdf(sha256, sharedSecret, new Uint8Array(0), TAG_INFO, 32);
};

/** The tag a community publishes for `cid` under K: 16 bytes, unpadded standard base64. */
export const getPseudonymityAuthorTag = (key: Uint8Array, cid: string): string =>
  uint8ArrayToString(hmac(sha256, key, textEncoder.encode(cid)).slice(0, 16), "base64");

// K costs one X25519 exchange per account and community, so cache it per signer object (the
// private key never becomes a cache key) and per community key; checking a comment is then one
// HMAC. An undefined entry records a key pair that cannot derive, e.g. a malformed or small-order
// community key, which noble rejects.
const tagKeysBySigner = new WeakMap<Signer, QuickLRU<string, Uint8Array | undefined>>();

const getTagKey = (signer: Signer, communityPublicKey: string) => {
  let tagKeys = tagKeysBySigner.get(signer);
  if (!tagKeys) {
    tagKeys = new QuickLRU({ maxSize: 1000 });
    tagKeysBySigner.set(signer, tagKeys);
  }
  if (tagKeys.has(communityPublicKey)) {
    return tagKeys.get(communityPublicKey);
  }
  let tagKey: Uint8Array | undefined;
  const authorPrivateKeyBytes = decodeKey(signer.privateKey);
  const communityPublicKeyBytes = decodeKey(communityPublicKey);
  if (authorPrivateKeyBytes && communityPublicKeyBytes) {
    try {
      tagKey = derivePseudonymityAuthorTagKey(authorPrivateKeyBytes, communityPublicKeyBytes);
    } catch {
      tagKey = undefined;
    }
  }
  tagKeys.set(communityPublicKey, tagKey);
  return tagKey;
};

/**
 * Whether the community that aliased `comment` tagged it as published by `signer`. Reads the tag
 * and the community key from the same signed `raw.commentUpdate`, which must be the update of this
 * comment's cid.
 */
export const isPseudonymityAuthorTagOfSigner = (
  comment: Comment | undefined,
  signer: Signer | undefined,
): boolean => {
  const commentUpdate = comment?.raw?.commentUpdate;
  const tag = commentUpdate?.pseudonymityAuthorTag;
  const communityPublicKey = commentUpdate?.signature?.publicKey;
  const cid = commentUpdate?.cid;
  if (
    !signer ||
    cid !== comment?.cid ||
    typeof tag !== "string" ||
    !TAG_REGEX.test(tag) ||
    typeof communityPublicKey !== "string" ||
    typeof cid !== "string"
  ) {
    return false;
  }
  const tagKey = getTagKey(signer, communityPublicKey);
  return Boolean(tagKey) && getPseudonymityAuthorTag(tagKey!, cid) === tag;
};

// accounts imported from older backups can lack signer.publicKey, so derive it from the seed
const signerPublicKeys = new WeakMap<Signer, string | undefined>();

const getSignerPublicKey = (signer: Signer) => {
  if (typeof signer.publicKey === "string") {
    return signer.publicKey;
  }
  if (signerPublicKeys.has(signer)) {
    return signerPublicKeys.get(signer);
  }
  const privateKeyBytes = decodeKey(signer.privateKey);
  const publicKey = privateKeyBytes
    ? uint8ArrayToString(ed25519.getPublicKey(privateKeyBytes), "base64")
    : undefined;
  signerPublicKeys.set(signer, publicKey);
  return publicKey;
};

/**
 * Whether `signer` published `comment` as far as its key can tell: the comment is signed by the
 * signer, or, on a pseudonymous board where the community re-signed it with an alias, the
 * community tagged it as the signer's. Neither signature is verified here, so the comment must come
 * from pkc-js, which verifies both, or have passed validateComment.
 */
export const isCommentBySigner = (
  comment: Comment | undefined,
  signer: Signer | undefined,
): boolean => {
  if (!comment || !signer) {
    return false;
  }
  const signaturePublicKey = comment.signature?.publicKey;
  if (typeof signaturePublicKey === "string" && signaturePublicKey === getSignerPublicKey(signer)) {
    return true;
  }
  return isPseudonymityAuthorTagOfSigner(comment, signer);
};
