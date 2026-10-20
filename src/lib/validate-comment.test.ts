// @vitest-environment node
// jsdom's TextEncoder returns a Uint8Array from another realm, which the IPFS hashing library rejects.
import { vi } from "vitest";
import { calculateCommentCid, validateCommentWithPkc } from "./validate-comment";
import fixture from "../../test/fixtures/validate-comment/page-comments.json";

// pkc-js is aliased to an empty module in unit tests, so pkc.validateComment (author and
// commentUpdate signatures) is mocked to pass; these tests cover the checks this module adds.
const createPkc = () => ({ validateComment: vi.fn(async (_comment: any, _options: any) => {}) });
const clone = (value: any) => JSON.parse(JSON.stringify(value));
const [commentA, commentB] = fixture.comments;
const community = {
  address: fixture.communityPublicKey,
  publicKey: fixture.communityPublicKey,
  signature: { publicKey: fixture.communitySignerPublicKey },
};

describe("validateCommentWithPkc", () => {
  test("real page comments hash to their cid", async () => {
    for (const comment of [...fixture.comments, fixture.legacyComment]) {
      expect(await calculateCommentCid(comment.raw.comment)).toBe(comment.cid);
    }
  });

  test("valid comment passes", async () => {
    const pkc = createPkc();
    expect(await validateCommentWithPkc(clone(commentA), {}, pkc)).toEqual({ valid: true });
    expect(await validateCommentWithPkc(clone(commentA), { community }, pkc)).toEqual({
      valid: true,
    });
  });

  test("passes pkc.validateComment fields derived from the hashed record, not the wrapper", async () => {
    const pkc = createPkc();
    const comment = {
      ...clone(commentA),
      postCid: "wrapper post cid",
      communityPublicKey: "wrapper community",
    };
    expect(await validateCommentWithPkc(comment, { validateReplies: false }, pkc)).toEqual({
      valid: true,
    });
    expect(pkc.validateComment).toHaveBeenCalledTimes(1);
    const [validatedComment, options] = pkc.validateComment.mock.calls[0];
    expect(validatedComment).toEqual({
      cid: commentA.cid,
      postCid: commentA.cid, // a post's postCid is its own cid
      communityPublicKey: fixture.communityPublicKey,
      communityName: undefined,
      raw: commentA.raw,
    });
    expect(options).toEqual({ validateReplies: false });
  });

  test("validateReplies defaults to true", async () => {
    const pkc = createPkc();
    await validateCommentWithPkc(clone(commentA), undefined, pkc);
    expect(pkc.validateComment.mock.calls[0][1]).toEqual({ validateReplies: true });
  });

  test("legacy subplebbitAddress record passes with its community key", async () => {
    const pkc = createPkc();
    expect(await validateCommentWithPkc(clone(fixture.legacyComment), {}, pkc)).toEqual({
      valid: true,
    });
    expect(pkc.validateComment.mock.calls[0][0].communityPublicKey).toBe(
      fixture.communityPublicKey,
    );
  });

  test("signed comment under another comment's cid and commentUpdate fails", async () => {
    const pkc = createPkc();
    const mislinked = {
      cid: commentB.cid,
      raw: {
        comment: clone(commentA.raw.comment),
        commentUpdate: clone(commentB.raw.commentUpdate),
      },
    };
    const result = await validateCommentWithPkc(mislinked, { community }, pkc);
    expect(result.valid).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringContaining(commentB.cid) });
    expect(pkc.validateComment).not.toHaveBeenCalled();
  });

  test("tampered comment fields fail", async () => {
    const pkc = createPkc();
    // content is signed by the author, thumbnailUrl and depth are added unsigned by the community
    const tamperedFields = [
      { content: "tampered content" },
      { thumbnailUrl: "https://example.com/tampered.png" },
      { depth: 1 },
    ];
    for (const tamperedField of tamperedFields) {
      const tampered = clone(commentA);
      Object.assign(tampered.raw.comment, tamperedField);
      expect((await validateCommentWithPkc(tampered, {}, pkc)).valid).toBe(false);
    }
    expect(pkc.validateComment).not.toHaveBeenCalled();
  });

  test("invalid signatures reported by pkc.validateComment fail", async () => {
    const pkc = createPkc();
    pkc.validateComment.mockRejectedValueOnce(Error("invalid signature"));
    expect(await validateCommentWithPkc(clone(commentA), {}, pkc)).toEqual({
      valid: false,
      reason: "invalid signature",
    });
  });

  test("commentUpdate signed by another key fails", async () => {
    const pkc = createPkc();
    const otherSigned = clone(commentA);
    otherSigned.raw.commentUpdate.signature.publicKey = commentA.raw.comment.signature.publicKey;
    expect((await validateCommentWithPkc(otherSigned, {}, pkc)).valid).toBe(false);
    expect((await validateCommentWithPkc(otherSigned, { community }, pkc)).valid).toBe(false);
  });

  test("options.community decides the signer when the community key changed", async () => {
    const pkc = createPkc();
    const rotatedCommunity = {
      ...community,
      signature: { publicKey: commentA.raw.comment.signature.publicKey },
    };
    const rotatedSigned = clone(commentA);
    rotatedSigned.raw.commentUpdate.signature.publicKey = rotatedCommunity.signature.publicKey;
    expect(
      await validateCommentWithPkc(rotatedSigned, { community: rotatedCommunity }, pkc),
    ).toEqual({ valid: true });
    expect(
      (await validateCommentWithPkc(clone(commentA), { community: rotatedCommunity }, pkc)).valid,
    ).toBe(false);
  });

  test("comment from another community than options.community fails", async () => {
    const pkc = createPkc();
    expect(
      (
        await validateCommentWithPkc(
          clone(commentA),
          { community: { ...community, publicKey: "12D3KooWOtherCommunity" } },
          pkc,
        )
      ).valid,
    ).toBe(false);
    expect(
      (
        await validateCommentWithPkc(
          clone(commentA),
          { community: { ...community, signature: undefined } },
          pkc,
        )
      ).valid,
    ).toBe(false);
  });

  test("malformed comments fail", async () => {
    const pkc = createPkc();
    for (const malformed of [
      undefined,
      {},
      { cid: commentA.cid },
      { cid: commentA.cid, raw: { comment: commentA.raw.comment } },
      { cid: commentA.cid, raw: { commentUpdate: commentA.raw.commentUpdate } },
      { raw: commentA.raw },
    ]) {
      expect((await validateCommentWithPkc(malformed as any, {}, pkc)).valid).toBe(false);
    }
    expect(pkc.validateComment).not.toHaveBeenCalled();
  });
});
