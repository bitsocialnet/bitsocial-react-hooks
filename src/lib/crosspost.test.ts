import { createCrosspost } from "./crosspost";

describe("createCrosspost", () => {
  it("copies the immutable wire record without retaining a mutable reference", () => {
    const rawComment = {
      content: "original content",
      signature: { publicKey: "author-public-key" },
    };
    const crosspost = createCrosspost({
      cid: "original-cid",
      raw: { comment: rawComment },
    });

    expect(crosspost).toEqual({
      cid: "original-cid",
      comment: rawComment,
    });
    expect(crosspost.comment).not.toBe(rawComment);

    rawComment.content = "changed after creating the crosspost";
    expect(crosspost.comment.content).toBe("original content");
  });

  it("rejects a comment without a cid", () => {
    expect(() => createCrosspost({ raw: { comment: {} } })).toThrow(
      "createCrosspost comment.cid not a string",
    );
  });

  it("rejects a comment without its immutable wire record", () => {
    expect(() => createCrosspost({ cid: "original-cid" })).toThrow(
      "createCrosspost comment.raw.comment not an object",
    );
  });
});
