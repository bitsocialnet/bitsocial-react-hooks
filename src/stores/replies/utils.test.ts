import {
  getFilteredSortedFeeds,
  getLoadedFeeds,
  addAccountsComments,
  getBufferedFeedsWithoutLoadedFeeds,
  getSortTypeFromComment,
  getUpdatedFeeds,
} from "./utils";
import accountsStore from "../accounts";

const mockAccountId = "mock-account";

describe("replies utils", () => {
  describe("getFilteredSortedFeeds preloaded-page branches", () => {
    const mockAccountId = "mock-account";

    test("uses preloaded replies when comment.replies.pages[sortType].comments exists", () => {
      const feedName = "feed1";
      const preloadedReply = {
        cid: "preloaded-reply-cid",
        communityAddress: "sub1",
        timestamp: 100,
      };
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          updatedAt: 1,
          replies: {
            pages: { new: { comments: [preloadedReply] } },
          },
        },
      };
      const feedsOptions = {
        [feedName]: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        comments,
        {},
        { [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds[feedName]).toContainEqual(
        expect.objectContaining({ cid: "preloaded-reply-cid" }),
      );
    });

    test("returns undefined preloaded when pageCids present and depth 0", () => {
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          depth: 0,
          updatedAt: 1,
          replies: {
            pageCids: { new: "page-cid-1" },
            pages: {},
          },
        },
      };
      const feedsOptions = {
        feed1: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        comments,
        {
          "page-cid-1": {
            comments: [{ cid: "r1", communityAddress: "sub1" }],
            nextCid: undefined,
          },
        },
        { [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toBeDefined();
    });

    test("uses fallback when depth > 0 and hasPageCids (no early return)", () => {
      const reply = {
        cid: "depth1-fallback",
        communityAddress: "sub1",
        timestamp: 1,
      };
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          depth: 1,
          updatedAt: 1,
          replies: {
            pageCids: { new: "page-cid-1" },
            pages: {
              otherSort: { comments: [reply], nextCid: undefined },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        comments,
        {},
        { [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toContainEqual(expect.objectContaining({ cid: "depth1-fallback" }));
    });

    test("breaks repliesPages loop when reply has wrong communityAddress", () => {
      const pageCid = "page-cid-break";
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          updatedAt: 1,
          replies: {
            pageCids: { new: pageCid },
            pages: {},
          },
        },
      };
      const repliesPages = {
        [pageCid]: {
          comments: [
            { cid: "r1", communityAddress: "sub1", timestamp: 1 },
            { cid: "r2", communityAddress: "wrong-sub", timestamp: 2 },
          ],
          nextCid: undefined,
        },
      };
      const feedsOptions = {
        feed1: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, comments, repliesPages, {
        [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} },
      });
      expect(feeds.feed1).toHaveLength(1);
      expect(feeds.feed1[0].cid).toBe("r1");
    });

    test("breaks preloaded loop when reply has wrong communityAddress", () => {
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          updatedAt: 1,
          replies: {
            pages: {
              new: {
                comments: [
                  { cid: "r1", communityAddress: "sub1", timestamp: 1 },
                  { cid: "r2", communityAddress: "other-sub", timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        comments,
        {},
        { [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toHaveLength(1);
      expect(feeds.feed1[0].cid).toBe("r1");
    });

    test("keeps replies when comment and reply community addresses use .eth/.bso aliases", () => {
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "music-posting.bso",
          updatedAt: 1,
          replies: {
            pages: {
              new: {
                comments: [
                  { cid: "r1", communityAddress: "music-posting.eth", timestamp: 1 },
                  { cid: "r2", communityAddress: "music-posting.eth", timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        comments,
        {},
        { [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1.map((reply: any) => reply.cid)).toEqual(["r2", "r1"]);
    });

    test("fallback to any page when no pageCids, no nextCids, single preloaded page", () => {
      const reply = {
        cid: "fallback-reply",
        communityAddress: "sub1",
        timestamp: 1,
      };
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          updatedAt: 1,
          replies: {
            pages: {
              otherSort: { comments: [reply], nextCid: undefined },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          commentCid: "comment1",
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        comments,
        {},
        { [mockAccountId]: { plebbit: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toContainEqual(expect.objectContaining({ cid: "fallback-reply" }));
    });
  });

  describe("addAccountsComments replacement branches", () => {
    let accountsGetState: typeof accountsStore.getState;

    beforeAll(() => {
      accountsGetState = accountsStore.getState;
    });
    afterAll(() => {
      (accountsStore as any).getState = accountsGetState;
    });
    beforeEach(() => {
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
    });

    test("cid/index drift: replaces loaded reply when cid matches but index changed", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const loadedReply = {
        cid: "same-cid",
        index: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      const freshAccountReply = {
        cid: "same-cid",
        index: 2,
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [freshAccountReply] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
      const loadedFeeds = { [feedName]: [loadedReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0]).toEqual(freshAccountReply);
    });

    test("append: true pushes account reply to end of feed", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: true },
        },
      };
      const existingReply = {
        cid: "existing-cid",
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs - 1000,
      };
      const accountReply = {
        cid: "append-cid",
        index: 1,
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
      const loadedFeeds = { [feedName]: [existingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toHaveLength(2);
      expect(loadedFeeds[feedName][1].cid).toBe("append-cid");
    });

    test("flat: false filters by parentCid", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          commentCid: "parent-cid",
          postCid: "p1",
          accountId: mockAccountId,
          flat: false,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const accountReply = {
        cid: "child-cid",
        index: 1,
        parentCid: "parent-cid",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0].cid).toBe("child-cid");
    });

    test("flat: filters account replies by postCid and depth > commentDepth", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          commentCid: "c1",
          postCid: "p1",
          commentDepth: 0,
          accountId: mockAccountId,
          flat: true,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const accountReply = {
        cid: "flat-reply",
        index: 1,
        postCid: "p1",
        depth: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0].cid).toBe("flat-reply");
    });

    test("pending->cid: replace index entry with cid when account reply gets cid", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const pendingReply = {
        index: 1,
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      const accountReplyWithCid = {
        cid: "new-cid",
        index: 1,
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReplyWithCid] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
      const loadedFeeds = { [feedName]: [pendingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0]).toEqual(accountReplyWithCid);
    });
  });

  describe("getSortTypeFromComment", () => {
    test("returns sortType when comment is null", () => {
      expect(getSortTypeFromComment(null as any, { sortType: "new" })).toBe("new");
    });

    test("falls back to topAll when best requested but only topAll available", () => {
      const comment = {
        replies: { pages: { topAll: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "best" })).toBe("topAll");
    });

    test("falls back to best when topAll requested but only best available", () => {
      const comment = {
        replies: { pages: { best: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "topAll" })).toBe("best");
    });

    test("uses newFlat when new and flat and newFlat available", () => {
      const comment = {
        replies: { pages: { newFlat: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "new", flat: true })).toBe(
        "newFlat",
      );
    });

    test("uses oldFlat when old and flat and oldFlat available", () => {
      const comment = {
        replies: { pages: { oldFlat: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "old", flat: true })).toBe(
        "oldFlat",
      );
    });

    test("falls back to new when newFlat requested but only new available", () => {
      const comment = {
        replies: { pages: { new: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "newFlat", flat: true })).toBe(
        "new",
      );
    });

    test("falls back to old when oldFlat requested but only old available", () => {
      const comment = {
        replies: { pages: { old: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "oldFlat", flat: true })).toBe(
        "old",
      );
    });

    test("returns sortType when no fallback applies (branch 552)", () => {
      const comment = {
        replies: { pages: { hot: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "hot" })).toBe("hot");
    });

    test("returns sortType when comment has no replies", () => {
      expect(getSortTypeFromComment({} as any, { sortType: "new" })).toBe("new");
    });

    test("falls back to topAll via pageCids when best requested", () => {
      const comment = {
        replies: { pageCids: { topAll: "page-cid" }, pages: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "best" })).toBe("topAll");
    });

    test("falls back to best via pageCids when topAll requested", () => {
      const comment = {
        replies: { pageCids: { best: "page-cid" }, pages: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "topAll" })).toBe("best");
    });
  });

  describe("getLoadedFeeds", () => {
    beforeEach(() => {
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [] },
        accounts: { [mockAccountId]: { plebbit: {} } },
      });
    });

    test("skips when !alwaysStreamPage and !pageNumberIncreased", async () => {
      const feedsOptions = {
        feed1: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          pageNumber: 1,
          repliesPerPage: 5,
          streamPage: false,
          commentDepth: 1,
          flat: false,
        },
      };
      const loadedFeeds = {
        feed1: [{ cid: "r1", communityAddress: "sub1", timestamp: 100 }],
      };
      const bufferedFeeds = { feed1: [] };
      const accounts = { [mockAccountId]: { plebbit: {} } };
      const result = await getLoadedFeeds(feedsOptions, loadedFeeds, bufferedFeeds, accounts);
      expect(result).toBe(loadedFeeds);
    });

    test("adds missing replies from buffered feed", async () => {
      const feedsOptions = {
        feed1: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          pageNumber: 2,
          repliesPerPage: 5,
          streamPage: true,
        },
      };
      const loadedFeeds = { feed1: [] };
      const bufferedReplies = [
        { cid: "r1", communityAddress: "sub1", timestamp: 1 },
        { cid: "r2", communityAddress: "sub1", timestamp: 2 },
        { cid: "r3", communityAddress: "sub1", timestamp: 3 },
      ];
      const bufferedFeeds = { feed1: bufferedReplies };
      const accounts = { [mockAccountId]: { plebbit: {} } };
      const result = await getLoadedFeeds(feedsOptions, loadedFeeds, bufferedFeeds, accounts);
      expect(result.feed1.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("getBufferedFeedsWithoutLoadedFeeds", () => {
    test("returns same buffered when no change and same length", () => {
      const buffered = { f1: [{ cid: "c1" }] };
      const loaded = { f1: [{ cid: "c2" }] };
      const result = getBufferedFeedsWithoutLoadedFeeds(buffered, loaded);
      expect(result.f1).toBe(buffered.f1);
    });
  });

  describe("getUpdatedFeeds", () => {
    test("sets newUpdatedFeeds when feed not in updatedFeeds but in loadedFeeds", async () => {
      const feedName = "new-feed";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const loadedFeed = [{ cid: "r1", communityAddress: "sub1", timestamp: 100, updatedAt: 100 }];
      const loadedFeeds = { [feedName]: loadedFeed };
      const updatedFeeds: Record<string, any> = {};
      const filteredSortedFeeds = { [feedName]: loadedFeed };
      const accounts = { [mockAccountId]: { plebbit: {} } };

      const result = await getUpdatedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        updatedFeeds,
        loadedFeeds,
        accounts,
      );
      expect(result[feedName]).toEqual(loadedFeed);
    });

    test("keeps previousUpdatedReply when it has newer updatedAt than loaded", async () => {
      const feedName = "feed1";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const loadedReply = {
        cid: "r1",
        communityAddress: "sub1",
        timestamp: 100,
        updatedAt: 100,
      };
      const previousUpdatedReply = {
        ...loadedReply,
        updatedAt: 150,
      };
      const loadedFeeds = { [feedName]: [loadedReply] };
      const updatedFeeds = { [feedName]: [previousUpdatedReply] };
      const filteredSortedFeeds = { [feedName]: [loadedReply] };
      const accounts = { [mockAccountId]: { plebbit: {} } };

      const result = await getUpdatedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        updatedFeeds,
        loadedFeeds,
        accounts,
      );
      expect(result[feedName][0].updatedAt).toBe(150);
    });

    test("sets feed when not in updatedFeeds and no changes (branch 417-418)", async () => {
      const feedName = "empty-feed";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const loadedFeeds = { [feedName]: [] };
      const updatedFeeds: Record<string, any> = {};
      const filteredSortedFeeds = { [feedName]: [] };
      const accounts = { [mockAccountId]: { plebbit: {} } };

      const result = await getUpdatedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        updatedFeeds,
        loadedFeeds,
        accounts,
      );
      expect(result[feedName]).toEqual([]);
    });

    test("updates from filteredSortedFeeds when candidate has newer updatedAt and is valid", async () => {
      const feedName = "feed1";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const loadedReply = {
        cid: "r1",
        communityAddress: "sub1",
        timestamp: 100,
        updatedAt: 100,
      };
      const newerCandidate = {
        ...loadedReply,
        updatedAt: 200,
      };
      const plebbit = { validateComment: () => Promise.resolve(true) };
      const accounts = { [mockAccountId]: { plebbit } };
      const loadedFeeds = { [feedName]: [loadedReply] };
      const updatedFeeds = { [feedName]: [loadedReply] };
      const filteredSortedFeeds = { [feedName]: [newerCandidate] };

      const result = await getUpdatedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        updatedFeeds,
        loadedFeeds,
        accounts,
      );
      expect(result[feedName][0].updatedAt).toBe(200);
    });
  });
});
