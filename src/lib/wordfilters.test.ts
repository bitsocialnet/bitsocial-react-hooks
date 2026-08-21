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
  test("replaces literal text case-insensitively in the default publication fields", () => {
    const publication = {
      content: "PLEBBIT and plebbit",
      title: "Plebbit post",
      author: { displayName: "plebbit user", address: "author" },
    };
    expect(
      applyCommunityWordfilters(publication, [challenge([{ src: "plebbit", dst: "bitcoin" }])]),
    ).toEqual({
      content: "bitcoin and bitcoin",
      title: "bitcoin post",
      author: { displayName: "bitcoin user", address: "author" },
    });
    expect(publication.content).toBe("PLEBBIT and plebbit");
  });

  test("merges challenge rules in order and applies them until stable", () => {
    expect(
      applyCommunityWordfilters({ content: "a" }, [
        challenge([{ src: "a", dst: "b" }]),
        challenge([{ src: "b", dst: "c" }]),
      ]).content,
    ).toBe("c");
  });

  test("uses configured fields and treats replacement dollar syntax literally", () => {
    expect(
      applyCommunityWordfilters({ content: "plebbit", extra: { text: "plebbit" } }, [
        challenge([{ src: "plebbit", dst: "$&coin" }], ["extra.text"]),
      ]),
    ).toEqual({ content: "plebbit", extra: { text: "$&coin" } });
  });

  test("ignores malformed options, non-string fields, and unsafe paths", () => {
    const publication = { content: 1, title: "unchanged" };
    expect(
      applyCommunityWordfilters(publication, [
        { publicOptions: { "wordfilter/v1/rules": "{" } },
        challenge([{ src: "unchanged", dst: "changed" }], ["__proto__.title"]),
      ]),
    ).toBe(publication);
  });

  test("throws when merged rules do not stabilize within the pass cap", () => {
    expect(() =>
      applyCommunityWordfilters({ content: "foo" }, [
        challenge([{ src: "foo", dst: "bar" }]),
        challenge([{ src: "bar", dst: "foofoo" }]),
      ]),
    ).toThrow("wordfilter rules did not stabilise");
  });
});
