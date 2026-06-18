import { getCommunityLookupOptions } from "./community-ref";

describe("community refs", () => {
  test("keeps name-only community refs as names for resolver-backed lookups", () => {
    expect(getCommunityLookupOptions({ name: "blog.bitsocial.bso" })).toEqual({
      name: "blog.bitsocial.bso",
    });
  });

  test("keeps legacy address objects as address lookups", () => {
    expect(getCommunityLookupOptions({ address: "legacy-address" } as any)).toEqual({
      address: "legacy-address",
    });
  });
});
