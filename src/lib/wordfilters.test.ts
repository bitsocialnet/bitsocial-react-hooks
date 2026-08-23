import { applyCommunityWordfilters } from "./wordfilters";

const challenge = (rules: unknown, fieldNames?: unknown) => ({
  publicOptions: {
    "wordfilter/v1/rules": JSON.stringify(rules),
    ...(fieldNames === undefined
      ? undefined
      : { "wordfilter/v1/fieldNames": JSON.stringify(fieldNames) }),
  },
});

describe("applyCommunityWordfilters", () => {
  test("replaces literal text case-insensitively in the default comment fields", () => {
    const publication = {
      content: "PLEBBIT and plebbit",
      title: "Plebbit post",
      author: { displayName: "plebbit user", address: "author" },
    };
    expect(
      applyCommunityWordfilters("comment", publication, [
        challenge([{ src: "plebbit", dst: "bitcoin" }]),
      ]),
    ).toEqual({
      content: "bitcoin and bitcoin",
      title: "bitcoin post",
      author: { displayName: "bitcoin user", address: "author" },
    });
    expect(publication.content).toBe("PLEBBIT and plebbit");
  });

  test("default fields cover a comment edit's content, reason, and displayName", () => {
    expect(
      applyCommunityWordfilters(
        "commentEdit",
        {
          content: "plebbit content",
          reason: "plebbit reason",
          author: { displayName: "plebbit" },
        },
        [challenge([{ src: "plebbit", dst: "bitcoin" }])],
      ),
    ).toEqual({
      content: "bitcoin content",
      reason: "bitcoin reason",
      author: { displayName: "bitcoin" },
    });
  });

  test("default fields cover a vote's displayName and nothing else", () => {
    expect(
      applyCommunityWordfilters(
        "vote",
        { vote: 1, content: "plebbit", author: { displayName: "plebbit" } },
        [challenge([{ src: "plebbit", dst: "bitcoin" }])],
      ),
    ).toEqual({ vote: 1, content: "plebbit", author: { displayName: "bitcoin" } });
  });

  test("a path for another publication type is simply absent and skipped", () => {
    const publication = { content: "plebbit" };
    expect(
      applyCommunityWordfilters("vote", publication, [
        challenge([{ src: "plebbit", dst: "bitcoin" }], ["comment.content"]),
      ]),
    ).toBe(publication);
  });

  test("configured moderation and community edit paths filter the nested wire fields", () => {
    expect(
      applyCommunityWordfilters(
        "commentModeration",
        { commentCid: "cid", commentModeration: { removed: true, reason: "plebbit spam" } },
        [
          challenge(
            [{ src: "plebbit", dst: "bitcoin" }],
            ["commentModeration.commentModeration.reason"],
          ),
        ],
      ),
    ).toEqual({ commentCid: "cid", commentModeration: { removed: true, reason: "bitcoin spam" } });

    expect(
      applyCommunityWordfilters(
        "communityEdit",
        { communityEdit: { title: "plebbit board", description: "all about plebbit" } },
        [
          challenge(
            [{ src: "plebbit", dst: "bitcoin" }],
            ["communityEdit.communityEdit.title", "communityEdit.communityEdit.description"],
          ),
        ],
      ),
    ).toEqual({ communityEdit: { title: "bitcoin board", description: "all about bitcoin" } });
  });

  test("moderator text is opt-in: defaults leave a moderation reason alone", () => {
    const publication = { commentModeration: { reason: "plebbit" } };
    expect(
      applyCommunityWordfilters("commentModeration", publication, [
        challenge([{ src: "plebbit", dst: "bitcoin" }]),
      ]),
    ).toBe(publication);
  });

  test("merges challenge rules in order and applies them until stable", () => {
    expect(
      applyCommunityWordfilters("comment", { content: "a" }, [
        challenge([{ src: "a", dst: "b" }]),
        challenge([{ src: "b", dst: "c" }]),
      ]).content,
    ).toBe("c");
  });

  test("uses configured supported fields and treats replacement dollar syntax literally", () => {
    expect(
      applyCommunityWordfilters("comment", { content: "plebbit", title: "plebbit" }, [
        challenge([{ src: "plebbit", dst: "$&coin" }], ["comment.content"]),
      ]),
    ).toEqual({ content: "$&coin", title: "plebbit" });
  });

  test("ignores malformed options, non-string fields, and structural paths", () => {
    const publication = {
      content: 1,
      title: "unchanged",
      communityAddress: "plebbit.eth",
      signer: { privateKey: "plebbit-private-key" },
    };
    expect(
      applyCommunityWordfilters("comment", publication, [
        { publicOptions: { "wordfilter/v1/rules": "{" } },
        challenge(
          [{ src: "plebbit", dst: "bitcoin" }],
          [
            "comment.communityAddress",
            "comment.signer.privateKey",
            "comment.__proto__.title",
            "communityAddress",
          ],
        ),
      ]),
    ).toBe(publication);
  });

  test("throws when merged rules do not stabilize within the pass cap", () => {
    expect(() =>
      applyCommunityWordfilters("comment", { content: "foo" }, [
        challenge([{ src: "foo", dst: "bar" }]),
        challenge([{ src: "bar", dst: "foofoo" }]),
      ]),
    ).toThrow("wordfilter rules did not stabilise");
  });
});
