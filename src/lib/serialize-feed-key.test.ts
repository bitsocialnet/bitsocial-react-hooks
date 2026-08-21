import { serializeFeedKey } from "./serialize-feed-key";

describe("serializeFeedKey", () => {
  test("distinguishes values that have the same string representation", () => {
    expect(serializeFeedKey([undefined])).not.toBe(serializeFeedKey(["undefined"]));
    expect(serializeFeedKey([1])).not.toBe(serializeFeedKey(["1"]));
  });

  test("distinguishes non-finite numbers from each other and from null", () => {
    expect(serializeFeedKey([Infinity])).not.toBe(serializeFeedKey([-Infinity]));
    expect(serializeFeedKey([Infinity])).not.toBe(serializeFeedKey([null]));
  });
});
