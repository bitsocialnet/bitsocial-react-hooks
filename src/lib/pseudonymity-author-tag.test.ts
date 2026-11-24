import { ed25519 } from "@noble/curves/ed25519.js";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import {
  derivePseudonymityAuthorTagKey,
  getPseudonymityAuthorTag,
  isCommentBySigner,
  isPseudonymityAuthorTagOfSigner,
} from "./pseudonymity-author-tag";

// test vectors from pkc-js docs/protocol/pseudonymity-author-tag.md
const communityPrivateKey = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const communityPublicKey = "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ";
const authorPrivateKey = "ZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoM";
const authorPublicKey = "C7w0aldmfDgBIL2cf9flHSxf3+o3zS9b9AWyxr9vLXg";
const cid = "QmYHzA8euDgUpNy3fh7JRwpPwt6jCgF35YTutYkyGGyr8f";
const expectedKey = "FcBB8h9Hi7TfAVVr/sxB0euHUQFTT5LcrrsO8MUYo/c";
const expectedTag = "nBUe3DGZKQ8fBcP6YGnpRQ";

const toBytes = (key: string) => uint8ArrayFromString(key, "base64");

const aliasedComment = (overrides: any = {}) => ({
  cid,
  signature: { publicKey: "alias public key" },
  raw: {
    commentUpdate: {
      cid,
      pseudonymityAuthorTag: expectedTag,
      signature: { publicKey: communityPublicKey },
      ...overrides,
    },
  },
});

describe("pseudonymity author tag", () => {
  test("matches the pkc-js test vectors from either side of the exchange", () => {
    const authorSideKey = derivePseudonymityAuthorTagKey(
      toBytes(authorPrivateKey),
      toBytes(communityPublicKey),
    );
    const communitySideKey = derivePseudonymityAuthorTagKey(
      toBytes(communityPrivateKey),
      toBytes(authorPublicKey),
    );
    expect(uint8ArrayToString(authorSideKey, "base64")).toBe(expectedKey);
    expect(uint8ArrayToString(communitySideKey, "base64")).toBe(expectedKey);
    expect(getPseudonymityAuthorTag(authorSideKey, cid)).toBe(expectedTag);
  });

  test("recognizes the author's aliased comment from the signed comment update", () => {
    expect(
      isPseudonymityAuthorTagOfSigner(aliasedComment(), { privateKey: authorPrivateKey }),
    ).toBe(true);
    // a second signer object for the same key, as on another device, derives the same tag
    expect(isCommentBySigner(aliasedComment(), { privateKey: authorPrivateKey })).toBe(true);
  });

  test("rejects other authors, other cids and malformed input", () => {
    const otherAuthor = { privateKey: communityPrivateKey };
    const author = { privateKey: authorPrivateKey };
    expect(isPseudonymityAuthorTagOfSigner(aliasedComment(), otherAuthor)).toBe(false);
    expect(
      isPseudonymityAuthorTagOfSigner(
        aliasedComment({ cid: "QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx" }),
        author,
      ),
    ).toBe(false);
    expect(
      isPseudonymityAuthorTagOfSigner(aliasedComment({ pseudonymityAuthorTag: "short" }), author),
    ).toBe(false);
    expect(
      isPseudonymityAuthorTagOfSigner(aliasedComment({ pseudonymityAuthorTag: undefined }), author),
    ).toBe(false);
    expect(
      isPseudonymityAuthorTagOfSigner(
        aliasedComment({ signature: { publicKey: "not a key" } }),
        author,
      ),
    ).toBe(false);
    // small-order community key: the exchange is rejected instead of yielding a predictable K
    expect(
      isPseudonymityAuthorTagOfSigner(
        aliasedComment({
          signature: { publicKey: uint8ArrayToString(new Uint8Array(32), "base64") },
        }),
        author,
      ),
    ).toBe(false);
    expect(isPseudonymityAuthorTagOfSigner(aliasedComment(), { privateKey: "private key" })).toBe(
      false,
    );
    expect(isPseudonymityAuthorTagOfSigner({ cid }, author)).toBe(false);
    // the tag of another comment's update doesn't make this comment the author's
    expect(isPseudonymityAuthorTagOfSigner({ ...aliasedComment(), cid: "other cid" }, author)).toBe(
      false,
    );
    expect(isPseudonymityAuthorTagOfSigner(aliasedComment(), undefined)).toBe(false);
  });

  test("recognizes comments signed by the signer, with or without a stored public key", () => {
    const signedComment = { cid, signature: { publicKey: authorPublicKey } };
    expect(isCommentBySigner(signedComment, { privateKey: authorPrivateKey })).toBe(true);
    expect(
      isCommentBySigner(signedComment, {
        privateKey: authorPrivateKey,
        publicKey: uint8ArrayToString(ed25519.getPublicKey(toBytes(authorPrivateKey)), "base64"),
      }),
    ).toBe(true);
    expect(isCommentBySigner(signedComment, { privateKey: communityPrivateKey })).toBe(false);
    expect(isCommentBySigner(undefined, { privateKey: authorPrivateKey })).toBe(false);
  });
});
