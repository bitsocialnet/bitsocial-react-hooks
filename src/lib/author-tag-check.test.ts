// test vectors from pkc-js docs/protocol/pseudonymity-author-tag.md
const communityPublicKey = "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ";
const authorPrivateKey = "ZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoM";
const authorPublicKey = "C7w0aldmfDgBIL2cf9flHSxf3+o3zS9b9AWyxr9vLXg";
const cid = "QmYHzA8euDgUpNy3fh7JRwpPwt6jCgF35YTutYkyGGyr8f";
const tag = "nBUe3DGZKQ8fBcP6YGnpRQ";

const author = { privateKey: authorPrivateKey, publicKey: authorPublicKey };
const signedComment = { cid: "signed cid", signature: { publicKey: authorPublicKey } };
const untaggedComment = { cid: "untagged cid", signature: { publicKey: "someone else" } };
const taggedComment = {
  cid,
  signature: { publicKey: "alias public key" },
  raw: {
    commentUpdate: {
      cid,
      pseudonymityAuthorTag: tag,
      signature: { publicKey: communityPublicKey },
    },
  },
};

// each test gets the module before it has loaded the author tag check
const importFresh = async () => {
  vi.resetModules();
  return import("./author-tag-check");
};

describe("author tag check", () => {
  test("answers signed and untagged comments without loading the tag check", async () => {
    const { isCommentBySigner, useAuthorTagCheckStore } = await importFresh();
    expect(isCommentBySigner(signedComment, author)).toBe(true);
    expect(isCommentBySigner(untaggedComment, author)).toBe(false);
    expect(isCommentBySigner(undefined, author)).toBe(false);
    expect(isCommentBySigner(taggedComment, undefined)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useAuthorTagCheckStore.getState().loaded).toBe(false);
  });

  test("loads the tag check for a tagged comment, then recognizes it", async () => {
    const { isCommentBySigner, useAuthorTagCheckStore } = await importFresh();
    expect(isCommentBySigner(taggedComment, author)).toBe(false);
    await vi.waitFor(() => expect(useAuthorTagCheckStore.getState().loaded).toBe(true));
    expect(isCommentBySigner(taggedComment, author)).toBe(true);
    expect(
      isCommentBySigner(taggedComment, { privateKey: "private key", publicKey: "other" }),
    ).toBe(false);
  });

  test("loads the tag check for a signer without a stored public key", async () => {
    const { isCommentBySigner, useAuthorTagCheckStore } = await importFresh();
    expect(isCommentBySigner(signedComment, { privateKey: authorPrivateKey })).toBe(false);
    await vi.waitFor(() => expect(useAuthorTagCheckStore.getState().loaded).toBe(true));
    expect(isCommentBySigner(signedComment, { privateKey: authorPrivateKey })).toBe(true);
  });
});
