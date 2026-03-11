import {
  areEquivalentCommunityAddresses,
  getCanonicalCommunityAddress,
  getEquivalentCommunityAddressGroupKey,
  normalizeEthAliasDomain,
  pickPreferredEquivalentCommunityAddress,
} from "./community-address";

describe("community-address", () => {
  test("treats .eth and .bso aliases as equivalent", () => {
    expect(areEquivalentCommunityAddresses("music-posting.eth", "music-posting.bso")).toBe(true);
    expect(areEquivalentCommunityAddresses("music-posting.bso", "music-posting.eth")).toBe(true);
  });

  test("matches aliases case-insensitively", () => {
    expect(areEquivalentCommunityAddresses("Music-Posting.ETH", "music-posting.bso")).toBe(true);
  });

  test("does not treat different names as equivalent", () => {
    expect(areEquivalentCommunityAddresses("music-posting.eth", "other-posting.bso")).toBe(false);
  });

  test("normalizes .bso aliases to .eth", () => {
    expect(normalizeEthAliasDomain("music-posting.bso")).toBe("music-posting.eth");
    expect(normalizeEthAliasDomain("Music-Posting.BSO")).toBe("Music-Posting.eth");
    expect(normalizeEthAliasDomain("music-posting.eth")).toBe("music-posting.eth");
  });

  test("canonicalizes .eth aliases to .bso for public keys", () => {
    expect(getCanonicalCommunityAddress("music-posting.eth")).toBe("music-posting.bso");
    expect(getCanonicalCommunityAddress("music-posting.bso")).toBe("music-posting.bso");
  });

  test("uses the same group key for equivalent aliases", () => {
    expect(getEquivalentCommunityAddressGroupKey("music-posting.eth")).toBe("music-posting.bso");
    expect(getEquivalentCommunityAddressGroupKey("music-posting.bso")).toBe("music-posting.bso");
  });

  test("prefers the .bso variant when equivalent aliases are present", () => {
    expect(
      pickPreferredEquivalentCommunityAddress(["music-posting.eth", "music-posting.bso"]),
    ).toBe("music-posting.bso");
  });
});
