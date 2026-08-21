import {
  getFilteredSortedFeeds,
  getLoadedFeeds,
  addAccountsComments,
  getBufferedFeedsWithoutLoadedFeeds,
  getFeedsCommentsFirstPageCids,
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toBeDefined();
    });

    test("ignores replies page entries without comments", () => {
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
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
        { "page-cid-1": { nextCid: undefined } },
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toEqual([]);
    });

    test("ignores empty fallback preloaded pages", () => {
      const comments = {
        comment1: {
          cid: "comment1",
          communityAddress: "sub1",
          depth: 1,
          updatedAt: 1,
          replies: {
            pages: { best: { comments: [] } },
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toEqual([]);
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
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
        [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} },
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1.map((reply: any) => reply.cid)).toEqual(["r2", "r1"]);
    });

    test("does not substitute a single preloaded page for a missing requested sort", () => {
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
        { [mockAccountId]: { pkc: {}, blockedAddresses: {}, blockedCids: {} } },
      );
      expect(feeds.feed1).toEqual([]);
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
        accounts: { [mockAccountId]: { pkc: {} } },
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
        accounts: { [mockAccountId]: { pkc: {} } },
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
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [existingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toHaveLength(2);
      expect(loadedFeeds[feedName][1].cid).toBe("append-cid");
    });

    test("keeps published account replies after the canonical feed is exhausted", () => {
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
      const accountReply = {
        cid: "published-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds, { [feedName]: false });
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("keeps a just-published account reply while the canonical feed is older than the reply", () => {
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
      const accountReply = {
        cid: "newly-published-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(
        feedsOptions,
        loadedFeeds,
        { [feedName]: false },
        { [feedName]: recentTs - 1 },
      );
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("does not append explicitly purged account replies after the canonical feed refreshes after the reply", () => {
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
      const accountReply = {
        cid: "purged-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        purged: true,
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(
        feedsOptions,
        loadedFeeds,
        { [feedName]: false },
        { [feedName]: recentTs + 1 },
      );
      expect(changed).toBe(false);
      expect(loadedFeeds[feedName]).toEqual([]);
    });

    test("does not append account replies without timestamps after the canonical feed is exhausted", () => {
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
      const accountReply = {
        cid: "timestampless-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(
        feedsOptions,
        loadedFeeds,
        { [feedName]: false },
        { [feedName]: recentTs },
      );
      expect(changed).toBe(false);
      expect(loadedFeeds[feedName]).toEqual([]);
    });

    test("keeps stopped cid account replies while canonical pages are still propagating", () => {
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
      const accountReply = {
        cid: "published-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        pendingApproval: false,
        timestamp: recentTs,
        publishingState: "stopped",
        state: "updating",
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(
        feedsOptions,
        loadedFeeds,
        { [feedName]: false },
        { [feedName]: recentTs + 1 },
      );
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("keeps actively publishing cid replies visible after the canonical feed is exhausted", () => {
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
      const accountReply = {
        cid: "publishing-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
        publishingState: "publishing-challenge-request",
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds, { [feedName]: false });
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("keeps pending account replies visible after the canonical feed is exhausted", () => {
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
      const accountReply = {
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds, { [feedName]: false });
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("initializes missing loaded feed when adding a local pending reply", () => {
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
      const accountReply = {
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = {};
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("prunes previously appended purged account replies after the canonical feed is exhausted", () => {
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
      const accountReply = {
        cid: "purged-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        purged: true,
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [accountReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds, { [feedName]: false });
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([]);
    });

    test("keeps previously appended purged account replies until the canonical feed refreshes after the reply", () => {
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
      const accountReply = {
        cid: "newly-published-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        purged: true,
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [accountReply] };
      const changed = addAccountsComments(
        feedsOptions,
        loadedFeeds,
        { [feedName]: false },
        { [feedName]: recentTs - 1 },
      );
      expect(changed).toBe(false);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
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
        accounts: { [mockAccountId]: { pkc: {} } },
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
        accounts: { [mockAccountId]: { pkc: {} } },
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
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [pendingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0]).toEqual(accountReplyWithCid);
    });

    test("pending->cid: treats account reply index 0 as a valid loaded key", () => {
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
      const pendingReply = {
        index: 0,
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      const accountReplyWithCid = {
        cid: "new-cid",
        index: 0,
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReplyWithCid] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [pendingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([accountReplyWithCid]);
    });

    test("pending without cid: does not duplicate account reply by timestamp when index is missing", () => {
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
      const accountReply = {
        parentCid: "c1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [accountReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(false);
      expect(loadedFeeds[feedName]).toEqual([accountReply]);
    });

    test("drops local pending approval reply once the approved network reply is loaded", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const author = { address: "0xauthor" };
      const feedsOptions = {
        [feedName]: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: true },
        },
      };
      const approvedReply = {
        author,
        cid: "approved-cid",
        content: "same body",
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      const pendingReply = {
        author,
        cid: "pending-cid",
        content: "same body",
        index: 0,
        parentCid: "c1",
        pendingApproval: true,
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [pendingReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [approvedReply, pendingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([approvedReply]);
    });

    test("matches pending approval replies when timestamp is missing", () => {
      const feedName = "feed1";
      const author = { address: "0xauthor" };
      const feedsOptions = {
        [feedName]: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          accountComments: { newerThan: Infinity, append: true },
        },
      };
      const approvedReply = {
        author,
        cid: "approved-cid",
        content: "same body",
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
      };
      const pendingReply = {
        author,
        cid: "pending-cid",
        content: "same body",
        index: 0,
        parentCid: "c1",
        pendingApproval: true,
        postCid: "p1",
        communityAddress: "sub1",
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [pendingReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const loadedFeeds = { [feedName]: [approvedReply, pendingReply] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toEqual([approvedReply]);
    });
  });

  describe("getSortTypeFromComment", () => {
    test("returns undefined before the comment is loaded", () => {
      expect(getSortTypeFromComment(null as any, { sortType: "new" })).toBeUndefined();
    });

    test("returns the requested sort only when it is published", () => {
      const comment = {
        replies: { pages: { custom: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "custom" })).toBe("custom");
    });

    test("does not substitute a similar or flat sort name", () => {
      const comment = {
        replies: {
          pages: { topAll: { comments: [] }, newFlat: { comments: [] } },
          pageCids: {},
        },
      };
      expect(getSortTypeFromComment(comment as any, { sortType: "best" })).toBeUndefined();
      expect(
        getSortTypeFromComment(comment as any, { sortType: "new", flat: true }),
      ).toBeUndefined();
    });

    test("defaults to the preloaded sort when none is requested", () => {
      const comment = {
        replies: { pages: { chronological: { comments: [] } }, pageCids: {} },
      };
      expect(getSortTypeFromComment(comment as any, {})).toBe("chronological");
    });
  });

  describe("getLoadedFeeds", () => {
    beforeEach(() => {
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [] },
        accounts: { [mockAccountId]: { pkc: {} } },
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
      const accounts = { [mockAccountId]: { pkc: {} } };
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
      const accounts = { [mockAccountId]: { pkc: {} } };
      const result = await getLoadedFeeds(feedsOptions, loadedFeeds, bufferedFeeds, accounts);
      expect(result.feed1.length).toBeGreaterThanOrEqual(3);
    });

    test("continues scanning buffered replies after an invalid candidate is removed", async () => {
      const feedsOptions = {
        feed1: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          pageNumber: 1,
          repliesPerPage: 1,
          streamPage: true,
        },
      };
      const loadedFeeds = { feed1: [] };
      const bufferedFeeds = {
        feed1: [
          { cid: "invalid-reply", communityAddress: "invalid-buffered-sub", timestamp: 1 },
          { cid: "valid-reply", communityAddress: "valid-buffered-sub", timestamp: 2 },
        ],
      };
      const accounts = {
        [mockAccountId]: {
          pkc: {
            validateComment: (comment: any) =>
              comment.cid === "invalid-reply"
                ? Promise.reject(new Error("invalid"))
                : Promise.resolve(true),
          },
        },
      };
      const result = await getLoadedFeeds(feedsOptions, loadedFeeds, bufferedFeeds, accounts);
      expect(result.feed1).toEqual([bufferedFeeds.feed1[1]]);
    });

    test("uses an empty buffered feed when none is stored for the feed name", async () => {
      const feedsOptions = {
        feed1: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          pageNumber: 1,
          repliesPerPage: 1,
          streamPage: true,
        },
      };
      const loadedFeeds = { feed1: [] };
      const accounts = { [mockAccountId]: { pkc: {} } };
      const result = await getLoadedFeeds(feedsOptions, loadedFeeds, {}, accounts);
      expect(result).toBe(loadedFeeds);
    });

    test("keeps account replies through getLoadedFeeds while the canonical feed is older than the reply", async () => {
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const accountReply = {
        cid: "newly-published-cid",
        index: 1,
        parentCid: "c1",
        postCid: "p1",
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountReply] },
        accounts: { [mockAccountId]: { pkc: {} } },
      });
      const feedsOptions = {
        feed1: {
          commentCid: "c1",
          postCid: "p1",
          accountId: mockAccountId,
          pageNumber: 1,
          repliesPerPage: 1,
          streamPage: true,
          accountComments: { newerThan: 3600, append: true },
        },
      };
      const loadedFeeds = { feed1: [] };
      const accounts = { [mockAccountId]: { pkc: {} } };
      const result = await getLoadedFeeds(feedsOptions, loadedFeeds, {}, accounts, {
        feedsHaveMore: { feed1: false },
        feedsUpdatedAts: { feed1: recentTs - 1 },
      });
      expect(result.feed1).toEqual([accountReply]);
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

  describe("getFeedsCommentsFirstPageCids", () => {
    test("ignores empty page cids", () => {
      const feedsComments = new Map([
        [
          "c1",
          {
            cid: "c1",
            replies: {
              pages: { best: { nextCid: "next-cid" } },
              pageCids: { best: "", new: "first-page-cid" },
            },
          },
        ],
      ]);
      expect(getFeedsCommentsFirstPageCids(feedsComments as any)).toEqual([
        "first-page-cid",
        "next-cid",
      ]);
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
      const accounts = { [mockAccountId]: { pkc: {} } };

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
      const accounts = { [mockAccountId]: { pkc: {} } };

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
      const accounts = { [mockAccountId]: { pkc: {} } };

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
      const pkc = { validateComment: () => Promise.resolve(true) };
      const accounts = { [mockAccountId]: { pkc } };
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

    test("handles a filtered feed with no loaded or updated feed", async () => {
      const feedName = "filtered-only";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const result = await getUpdatedFeeds(
        feedsOptions,
        { [feedName]: [{ timestamp: 100 }] },
        {},
        {},
        { [mockAccountId]: { pkc: {} } },
      );
      expect(result[feedName]).toEqual([]);
    });

    test("handles a loaded feed with no filtered feed", async () => {
      const feedName = "loaded-only";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const loadedReply = {
        communityAddress: "sub1",
        timestamp: 100,
      };
      const result = await getUpdatedFeeds(
        feedsOptions,
        {},
        {},
        { [feedName]: [loadedReply] },
        { [mockAccountId]: { pkc: {} } },
      );
      expect(result[feedName]).toEqual([loadedReply]);
    });

    test("returns existing updated feeds when all feed inputs are missing", async () => {
      const result = await getUpdatedFeeds(
        {},
        undefined as any,
        undefined as any,
        undefined as any,
        {},
      );
      expect(result).toEqual({});
    });

    test("keeps loaded reply when newer filtered candidate is invalid", async () => {
      const feedName = "feed1";
      const feedsOptions = {
        [feedName]: { commentCid: "c1", accountId: mockAccountId },
      };
      const loadedReply = {
        cid: "r1",
        communityAddress: "invalid-candidate-sub",
        timestamp: 100,
        updatedAt: 100,
      };
      const newerCandidate = {
        ...loadedReply,
        updatedAt: 200,
      };
      const pkc = { validateComment: () => Promise.reject(new Error("invalid")) };
      const accounts = { [mockAccountId]: { pkc } };
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
      expect(result[feedName][0].updatedAt).toBe(100);
    });
  });
});
