import feedSorter from "../stores/feeds/feed-sorter";
import {
  getAvailablePostSortTypes,
  getAvailableReplySortTypes,
  getPostPageSortType,
  getPreloadedPostSortType,
  getPreloadedReplySortType,
  getReplyPageSortType,
  getSortTimeframeSeconds,
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
    expect(getPostPageSortType(community as any, "missing")).toBeUndefined();
    expect(getReplyPageSortType(comment as any, "missing")).toBeUndefined();
  });

  test("reads the published page of a requested sort", () => {
    expect(getPostPageSortType(community as any, "newest")).toBe("newest");
    expect(getPostPageSortType(community as any)).toBe("sage");
    expect(getReplyPageSortType(comment as any, "nestedNewest")).toBe("nestedNewest");
  });

  test("falls back to the first pageCid only when no preloaded page exists", () => {
    expect(getPreloadedPostSortType({ posts: { pageCids: { custom: "custom-cid" } } } as any)).toBe(
      "custom",
    );
    expect(getAvailablePostSortTypes()).toEqual([]);
    expect(getAvailableReplySortTypes()).toEqual([]);
  });

  describe("complete preloaded pages", () => {
    const singlePageCommunity = { posts: { pages: { hot: { comments: [{ cid: "post" }] } } } };
    const singlePageComment = {
      replies: { pages: { best: { comments: [{ cid: "reply" }] } }, pageCids: {} },
    };

    test("serves every standard sort from a complete preloaded page", () => {
      expect(getAvailablePostSortTypes(singlePageCommunity as any)).toEqual([
        "hot",
        "new",
        "active",
        "topHour",
        "topDay",
        "topWeek",
        "topMonth",
        "topYear",
        "topAll",
      ]);
      expect(getAvailableReplySortTypes(singlePageComment as any)).toEqual([
        "best",
        "new",
        "old",
        "newFlat",
        "oldFlat",
      ]);
      expect(resolvePostSortType(singlePageCommunity as any, "active")).toBe("active");
      expect(getPostPageSortType(singlePageCommunity as any, "active")).toBe("hot");
      expect(getPostPageSortType(singlePageCommunity as any, "hot")).toBe("hot");
      expect(resolveReplySortType(singlePageComment as any, "old")).toBe("old");
      expect(getReplyPageSortType(singlePageComment as any, "newFlat")).toBe("best");
      expect(getPreloadedPostSortType(singlePageCommunity as any)).toBe("hot");
      expect(resolvePostSortType(singlePageCommunity as any)).toBe("hot");
    });

    test("keeps custom sorts unavailable", () => {
      expect(resolvePostSortType(singlePageCommunity as any, "sage")).toBeUndefined();
      expect(getPostPageSortType(singlePageCommunity as any, "sage")).toBeUndefined();
      expect(resolveReplySortType(singlePageComment as any, "chronological")).toBeUndefined();
    });

    test("stays strict once a page continues or pageCids are published", () => {
      const pagedCommunity = { posts: { pages: { hot: { comments: [], nextCid: "hot-next" } } } };
      const cidsCommunity = {
        posts: { pages: { hot: { comments: [] } }, pageCids: { new: "new-cid" } },
      };
      expect(getAvailablePostSortTypes(pagedCommunity as any)).toEqual(["hot"]);
      expect(resolvePostSortType(pagedCommunity as any, "active")).toBeUndefined();
      expect(getAvailablePostSortTypes(cidsCommunity as any)).toEqual(["hot", "new"]);
      expect(getPostPageSortType(cidsCommunity as any, "new")).toBe("new");
      expect(getPostPageSortType(cidsCommunity as any, "active")).toBeUndefined();
      expect(getAvailablePostSortTypes({ posts: { pages: {} } } as any)).toEqual([]);
    });

    test("does not advertise flat sorts for a nested reply", () => {
      const nestedReply = {
        depth: 1,
        parentCid: "post-cid",
        replies: { pages: { best: { comments: [{ cid: "nested" }] } } },
      };
      expect(getAvailableReplySortTypes(nestedReply as any)).toEqual(["best", "new", "old"]);
      expect(resolveReplySortType(nestedReply as any, "old")).toBe("old");
      expect(resolveReplySortType(nestedReply as any, "newFlat")).toBeUndefined();
      expect(getReplyPageSortType(nestedReply as any, "newFlat")).toBeUndefined();
    });

    test("only serves flat sorts from a flat preloaded page", () => {
      const flatComment = { replies: { pages: { newFlat: { comments: [] } } } };
      expect(getAvailableReplySortTypes(flatComment as any)).toEqual(["newFlat", "oldFlat"]);
      expect(getReplyPageSortType(flatComment as any, "oldFlat")).toBe("newFlat");
      expect(resolveReplySortType(flatComment as any, "best")).toBeUndefined();
    });

    test("every client-served sort has a client sorter", () => {
      const feed = [
        { cid: "a", timestamp: 1, upvoteCount: 0, downvoteCount: 0 },
        { cid: "b", timestamp: 2, upvoteCount: 1, downvoteCount: 0 },
      ];
      const sortTypes = [
        ...getAvailablePostSortTypes(singlePageCommunity as any),
        ...getAvailableReplySortTypes(singlePageComment as any),
      ];
      for (const sortType of sortTypes) {
        // the sorter returns the same array only for sort names it cannot compute
        expect(feedSorter.sort(sortType, feed)).not.toBe(feed);
      }
    });

    test("knows the time window of timeframe sorts", () => {
      expect(getSortTimeframeSeconds("topHour")).toBe(3600);
      expect(getSortTimeframeSeconds("topWeek")).toBe(604800);
      expect(getSortTimeframeSeconds("controversialDay")).toBe(86400);
      expect(getSortTimeframeSeconds("topAll")).toBeUndefined();
      expect(getSortTimeframeSeconds("active")).toBeUndefined();
      expect(getSortTimeframeSeconds(undefined)).toBeUndefined();
    });
  });
});
