import feedSorter from "../stores/feeds/feed-sorter";
import {
  getAvailablePostSortTypes,
  getAvailableReplySortTypes,
  getPostPageSortType,
  getPreloadedPostSortType,
  getPreloadedPostSortTypes,
  getPreloadedReplySortType,
  getPreloadedReplySortTypes,
  getReplyPageSortType,
  getSortTimeframeSeconds,
  isBuiltInPostSortType,
  isPinnedFirstPostSortType,
  isPinnedFirstReplySortType,
  isPostSortTypeUnavailable,
  isReplySortTypeUnavailable,
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

  test("tells built-in post sorts from files published under a built-in name", () => {
    const pageSorts = {
      posts: {
        hot: { name: "hot" },
        active: {
          name: "@pkcprotocol/active-page-sort",
          publicOptions: { noBumpKeywords: "sage" },
        },
        top: {},
      },
    };
    expect(isBuiltInPostSortType(community as any, "active")).toBe(true);
    expect(isBuiltInPostSortType({ pageSorts } as any, "hot")).toBe(true);
    expect(isBuiltInPostSortType({ pageSorts } as any, "new")).toBe(true);
    expect(isBuiltInPostSortType({ pageSorts } as any, "active")).toBe(false);
    // a file loaded by path publishes no name
    expect(isBuiltInPostSortType({ pageSorts } as any, "top")).toBe(false);
  });

  test("returns every preloaded sort in the record key order", () => {
    const multiPreloadedCommunity = {
      posts: {
        pages: { active: { comments: [] }, new: { comments: [] } },
        pageCids: { hot: "hot-cid" },
      },
    };
    const multiPreloadedComment = {
      replies: { pages: { old: { comments: [] }, best: { comments: [] } } },
    };
    expect(getPreloadedPostSortTypes(multiPreloadedCommunity as any)).toEqual(["active", "new"]);
    expect(getPreloadedPostSortType(multiPreloadedCommunity as any)).toBe("active");
    expect(resolvePostSortType(multiPreloadedCommunity as any)).toBe("active");
    expect(getPreloadedReplySortTypes(multiPreloadedComment as any)).toEqual(["old", "best"]);
    expect(getPreloadedReplySortType(multiPreloadedComment as any)).toBe("old");
    expect(resolveReplySortType(multiPreloadedComment as any)).toBe("old");
    expect(getPreloadedPostSortTypes(community as any)).toEqual(["sage"]);
    expect(getPreloadedReplySortTypes(comment as any)).toEqual(["chronological"]);
  });

  test("reports no preloaded sort when pages is empty, and still resolves a loadable default", () => {
    const noPreloadCommunity = { posts: { pages: {}, pageCids: { custom: "custom-cid" } } };
    const noPreloadComment = { replies: { pageCids: { custom: "custom-cid" } } };
    expect(getPreloadedPostSortTypes(noPreloadCommunity as any)).toEqual([]);
    expect(getPreloadedPostSortType(noPreloadCommunity as any)).toBeUndefined();
    expect(getPreloadedReplySortTypes(noPreloadComment as any)).toEqual([]);
    expect(getPreloadedReplySortType(noPreloadComment as any)).toBeUndefined();
    expect(getPreloadedPostSortTypes()).toEqual([]);
    expect(getPreloadedReplySortTypes()).toEqual([]);
    // feeds and replies without a requested sort still load the first sort with a page cid
    expect(resolvePostSortType(noPreloadCommunity as any)).toBe("custom");
    expect(getPostPageSortType(noPreloadCommunity as any)).toBe("custom");
    expect(resolveReplySortType(noPreloadComment as any)).toBe("custom");
    expect(getReplyPageSortType(noPreloadComment as any)).toBe("custom");
    expect(getAvailablePostSortTypes()).toEqual([]);
    expect(getAvailableReplySortTypes()).toEqual([]);
  });

  test("tells an unavailable requested sort from a record that is loading or empty", () => {
    expect(isPostSortTypeUnavailable(community as any, "missing")).toBe(true);
    expect(isPostSortTypeUnavailable(community as any, "newest")).toBe(false);
    // nothing requested
    expect(isPostSortTypeUnavailable(community as any)).toBe(false);
    // not loaded yet, or no posts at all: no sort is published to compare with
    expect(isPostSortTypeUnavailable(undefined, "missing")).toBe(false);
    expect(isPostSortTypeUnavailable({ posts: { pages: {} } } as any, "missing")).toBe(false);
    expect(isReplySortTypeUnavailable(comment as any, "missing")).toBe(true);
    expect(isReplySortTypeUnavailable(comment as any, "nestedNewest")).toBe(false);
    expect(isReplySortTypeUnavailable({ cid: "no replies yet" } as any, "missing")).toBe(false);
    // a standard sort computed from a complete preloaded page is available
    const singlePageCommunity = { posts: { pages: { hot: { comments: [{ cid: "post" }] } } } };
    expect(isPostSortTypeUnavailable(singlePageCommunity as any, "new")).toBe(false);
    expect(isPostSortTypeUnavailable(singlePageCommunity as any, "sage")).toBe(true);
  });

  test("reads pinned placement from the published sort options", () => {
    const pageSorts = {
      posts: {
        hot: { name: "hot", publicOptions: { pinnedFirst: "false" } },
        new: { name: "new", publicOptions: { pinnedFirst: "true" } },
        active: { name: "active", publicOptions: { pinnedFirst: " FALSE " } },
        top: { name: "top" },
      },
      replies: { best: { name: "best", publicOptions: { pinnedFirst: "false" } } },
    };
    const posts = { pages: { hot: { comments: [{ cid: "post" }] } } };
    // an unconfigured community publishes no pageSorts and puts pinned posts first
    expect(isPinnedFirstPostSortType(undefined, "hot")).toBe(true);
    expect(isPinnedFirstPostSortType({ posts } as any, "hot")).toBe(true);
    expect(isPinnedFirstPostSortType({ posts, pageSorts } as any, "hot")).toBe(false);
    expect(isPinnedFirstPostSortType({ posts, pageSorts } as any, "new")).toBe(true);
    expect(isPinnedFirstPostSortType({ posts, pageSorts } as any, "active")).toBe(false);
    expect(isPinnedFirstPostSortType({ posts, pageSorts } as any, "top")).toBe(true);
    // the default sort, and a sort computed from its complete page that the community published
    // nothing about, follow that page
    expect(isPinnedFirstPostSortType({ posts, pageSorts } as any)).toBe(false);
    expect(isPinnedFirstPostSortType({ posts, pageSorts } as any, "topAll")).toBe(false);

    const comment = { replies: { pages: { best: { comments: [{ cid: "reply" }] } } } };
    expect(isPinnedFirstReplySortType({ pageSorts } as any, comment as any, "best")).toBe(false);
    expect(isPinnedFirstReplySortType({ pageSorts } as any, comment as any, "new")).toBe(false);
    expect(isPinnedFirstReplySortType(undefined, comment as any, "best")).toBe(true);
    expect(isPinnedFirstReplySortType({} as any, comment as any, "best")).toBe(true);
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

    test("does not treat a timeframe-windowed preloaded page as the complete set", () => {
      const windowedCommunity = { posts: { pages: { topDay: { comments: [{ cid: "post" }] } } } };
      expect(getAvailablePostSortTypes(windowedCommunity as any)).toEqual(["topDay"]);
      expect(resolvePostSortType(windowedCommunity as any, "active")).toBeUndefined();
      expect(getPostPageSortType(windowedCommunity as any, "topDay")).toBe("topDay");
      expect(getPostPageSortType(windowedCommunity as any, "hot")).toBeUndefined();
    });

    test("advertises flat sorts from a hierarchical page only when the nested tree is complete", () => {
      const withNestedReplies = (replies: unknown) => ({
        depth: 0,
        replies: {
          pages: { best: { comments: [{ cid: "reply", replyCount: 1, replies }] } },
        },
      });
      const completeTree = withNestedReplies({
        pages: { best: { comments: [{ cid: "nested", replyCount: 0 }] } },
      });
      expect(getAvailableReplySortTypes(completeTree as any)).toEqual([
        "best",
        "new",
        "old",
        "newFlat",
        "oldFlat",
      ]);
      expect(getReplyPageSortType(completeTree as any, "newFlat")).toBe("best");

      const continuedTree = withNestedReplies({
        pages: { best: { comments: [{ cid: "nested" }], nextCid: "nested-next" } },
      });
      const pagedTree = withNestedReplies({ pages: {}, pageCids: { new: "nested-new-cid" } });
      const missingTree = withNestedReplies(undefined);
      for (const comment of [continuedTree, pagedTree, missingTree]) {
        expect(getAvailableReplySortTypes(comment as any)).toEqual(["best", "new", "old"]);
        expect(resolveReplySortType(comment as any, "newFlat")).toBeUndefined();
        expect(resolveReplySortType(comment as any, "new")).toBe("new");
      }
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
