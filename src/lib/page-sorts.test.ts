import {
  getAvailablePostSortTypes,
  getAvailableReplySortTypes,
  getPreloadedPostSortType,
  getPreloadedReplySortType,
  resolvePostSortType,
  resolveReplySortType,
} from "./page-sorts";

describe("page sort helpers", () => {
  const community = {
    posts: {
      pages: { sage: { comments: [] } },
      pageCids: { sage: "sage-cid", newest: "newest-cid" },
    },
  };
  const comment = {
    replies: {
      pages: { chronological: { comments: [] } },
      pageCids: { chronological: "old-cid", nestedNewest: "new-cid" },
    },
  };

  test("discovers arbitrary post and reply sort types from pages and pageCids", () => {
    expect(getAvailablePostSortTypes(community as any)).toEqual(["sage", "newest"]);
    expect(getAvailableReplySortTypes(comment as any)).toEqual(["chronological", "nestedNewest"]);
  });

  test("uses the preloaded sort when no sort type is requested", () => {
    expect(getPreloadedPostSortType(community as any)).toBe("sage");
    expect(getPreloadedReplySortType(comment as any)).toBe("chronological");
    expect(resolvePostSortType(community as any)).toBe("sage");
    expect(resolveReplySortType(comment as any)).toBe("chronological");
  });

  test("returns undefined instead of substituting a missing requested sort", () => {
    expect(resolvePostSortType(community as any, "missing")).toBeUndefined();
    expect(resolveReplySortType(comment as any, "missing")).toBeUndefined();
  });

  test("falls back to the first pageCid only when no preloaded page exists", () => {
    expect(getPreloadedPostSortType({ posts: { pageCids: { custom: "custom-cid" } } } as any)).toBe(
      "custom",
    );
    expect(getAvailablePostSortTypes()).toEqual([]);
    expect(getAvailableReplySortTypes()).toEqual([]);
  });
});
