import {
  getFilteredSortedFeeds,
  getLoadedFeeds,
  addAccountsComments,
  getBufferedFeedsWithoutLoadedFeeds,
  getUpdatedFeeds,
  getFeedsCommunitiesFirstPageCids,
  getFeedsCommunities,
  getAccountsBlockedAddresses,
  accountsBlockedAddressesChanged,
  accountsBlockedCidsChanged,
  feedsHaveChangedBlockedAddresses,
  feedsHaveChangedBlockedCids,
  getAccountsBlockedCids,
  getFeedsHaveMore,
} from "./utils";
import accountsStore from "../accounts";

const mockAccountId = "mock-account-id";

const makeMockAccounts = (overrides: any = {}) => ({
  [mockAccountId]: {
    id: mockAccountId,
    plebbit: {},
    blockedAddresses: {},
    blockedCids: {},
    ...overrides,
  },
});

describe("feeds utils", () => {
  let accountsGetState: typeof accountsStore.getState;

  beforeAll(() => {
    accountsGetState = accountsStore.getState;
  });

  afterAll(() => {
    // @ts-ignore
    accountsStore.getState = accountsGetState;
  });

  describe("getFilteredSortedFeeds preloaded-page branches", () => {
    beforeEach(() => {
      // @ts-ignore
      accountsStore.getState = () => ({
        accounts: makeMockAccounts(),
      });
    });

    test("uses preloaded posts when community.posts.pages[sortType].comments exists", () => {
      const feedName = "feed1";
      const preloadedComment = {
        cid: "preloaded-cid",
        communityAddress: "sub1",
        timestamp: 100,
      };
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: { new: { comments: [preloadedComment] } },
          },
        },
      };
      const feedsOptions = {
        [feedName]: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds[feedName]).toContainEqual(expect.objectContaining({ cid: "preloaded-cid" }));
    });

    test("returns undefined preloaded when pageCids present (hasPageCids), uses communitiesPages", () => {
      const pageCid = "page-cid-1";
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pageCids: { new: pageCid },
            pages: { new: { comments: [{ cid: "c1", communityAddress: "sub1" }] } },
          },
        },
      };
      const communitiesPages = {
        [pageCid]: {
          comments: [{ cid: "c1", communityAddress: "sub1", timestamp: 1 }],
          nextCid: undefined,
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        communities,
        communitiesPages,
        makeMockAccounts(),
      );
      expect(feeds.feed1).toBeDefined();
      expect(feeds.feed1).toContainEqual(
        expect.objectContaining({ cid: "c1", communityAddress: "sub1" }),
      );
    });

    test("skips cache-expired community when navigator.onLine", () => {
      const origOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          fetchedAt: 0,
          posts: {
            pages: { new: { comments: [{ cid: "c1", communityAddress: "sub1", timestamp: 1 }] } },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1).toEqual([]);
      if (origOnLine) Object.defineProperty(navigator, "onLine", origOnLine);
    });

    test("skips community that has not loaded yet", () => {
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1", "sub2"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: { new: { comments: [{ cid: "c1", communityAddress: "sub1", timestamp: 1 }] } },
          },
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1).toContainEqual(
        expect.objectContaining({ cid: "c1", communityAddress: "sub1" }),
      );
    });

    test("breaks communityPages loop when post has wrong communityAddress", () => {
      const pageCid = "page-cid-break";
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pageCids: { new: pageCid },
            pages: {},
          },
        },
      };
      const communitiesPages = {
        [pageCid]: {
          comments: [
            { cid: "c1", communityAddress: "sub1", timestamp: 1 },
            { cid: "c2", communityAddress: "wrong-sub", timestamp: 2 },
          ],
          nextCid: undefined,
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        communities,
        communitiesPages,
        makeMockAccounts(),
      );
      expect(feeds.feed1).toHaveLength(1);
      expect(feeds.feed1[0].cid).toBe("c1");
    });

    test("breaks preloaded loop when post has wrong communityAddress", () => {
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [
                  { cid: "c1", communityAddress: "sub1", timestamp: 1 },
                  { cid: "c2", communityAddress: "other-sub", timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1).toHaveLength(1);
      expect(feeds.feed1[0].cid).toBe("c1");
    });

    test("modQueue excludes page comments that no longer have pendingApproval", () => {
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          modQueue: {
            pageCids: { pendingApproval: "mod-queue-page-cid" },
            pages: {},
          },
        },
      };
      const communitiesPages = {
        [`${mockAccountId}:mod-queue-page-cid`]: {
          comments: [
            {
              cid: "public-cid",
              communityAddress: "sub1",
              timestamp: 1,
            },
            {
              cid: "pending-cid",
              communityAddress: "sub1",
              timestamp: 2,
              pendingApproval: true,
            },
          ],
          nextCid: undefined,
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
          modQueue: ["pendingApproval"],
        },
      };

      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        communities,
        communitiesPages,
        makeMockAccounts(),
      );

      expect(feeds.feed1.map((post: any) => post.cid)).toEqual(["pending-cid"]);
    });

    test("keeps posts when requested communityAddress is a .bso alias of the post .eth address", () => {
      const communities = {
        "music-posting.bso": {
          address: "music-posting.bso",
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [
                  { cid: "c1", communityAddress: "music-posting.eth", timestamp: 1 },
                  { cid: "c2", communityAddress: "music-posting.eth", timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["music-posting.bso"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1.map((post: any) => post.cid)).toEqual(["c2", "c1"]);
    });

    test("skips post when community address is blocked", () => {
      const blockedSubAddr = "blocked-sub-addr";
      const communities = {
        [blockedSubAddr]: {
          address: blockedSubAddr,
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [
                  { cid: "c1", communityAddress: blockedSubAddr, timestamp: 1 },
                  { cid: "c2", communityAddress: blockedSubAddr, timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: [blockedSubAddr],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const accounts = makeMockAccounts({
        blockedAddresses: { [blockedSubAddr]: true },
      });
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, accounts);
      expect(feeds.feed1).toHaveLength(0);
    });

    test("skips post when author address is blocked", () => {
      const blockedAuthorAddr = "blocked-author-addr";
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [
                  {
                    cid: "c1",
                    communityAddress: "sub1",
                    timestamp: 1,
                    author: { address: blockedAuthorAddr },
                  },
                  { cid: "c2", communityAddress: "sub1", timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const accounts = makeMockAccounts({
        blockedAddresses: { [blockedAuthorAddr]: true },
      });
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, accounts);
      expect(feeds.feed1.map((p: any) => p.cid)).not.toContain("c1");
      expect(feeds.feed1.map((p: any) => p.cid)).toContain("c2");
    });

    test("filter function excludes posts when filter returns false", () => {
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [
                  { cid: "c1", communityAddress: "sub1", timestamp: 1 },
                  { cid: "c2", communityAddress: "sub1", timestamp: 2 },
                ],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
          filter: { filter: (p: any) => p.cid !== "c2", key: "exclude-c2" },
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1).toHaveLength(1);
      expect(feeds.feed1[0].cid).toBe("c1");
    });

    test("skips pinned post when feed has multiple communities", () => {
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [
                  { cid: "c1", communityAddress: "sub1", timestamp: 1, pinned: true },
                  { cid: "c2", communityAddress: "sub1", timestamp: 2 },
                ],
              },
            },
          },
        },
        sub2: {
          address: "sub2",
          updatedAt: 1,
          posts: {
            pages: {
              new: {
                comments: [{ cid: "c3", communityAddress: "sub2", timestamp: 3 }],
              },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1", "sub2"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1.map((p: any) => p.cid)).not.toContain("c1");
      expect(feeds.feed1.map((p: any) => p.cid)).toContain("c2");
      expect(feeds.feed1.map((p: any) => p.cid)).toContain("c3");
    });

    test("getPreloadedPosts returns undefined when hasPageCids but no preloaded for sortType", () => {
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pageCids: { new: "page-cid-1" },
            pages: {},
          },
        },
      };
      const communitiesPages = {
        "page-cid-1": {
          comments: [{ cid: "c1", communityAddress: "sub1", timestamp: 1 }],
          nextCid: undefined,
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(
        feedsOptions,
        communities,
        communitiesPages,
        makeMockAccounts(),
      );
      expect(feeds.feed1).toContainEqual(
        expect.objectContaining({ cid: "c1", communityAddress: "sub1" }),
      );
    });

    test("getPreloadedPosts returns undefined when pages exist but pages[0].comments is empty", () => {
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: {
              otherSort: { comments: [], nextCid: undefined },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1).toEqual([]);
    });

    test("fallback to any page when no pageCids, no nextCids, single preloaded page", () => {
      const feedComment = {
        cid: "fallback-cid",
        communityAddress: "sub1",
        timestamp: 1,
      };
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          posts: {
            pages: {
              otherSort: { comments: [feedComment], nextCid: undefined },
            },
          },
        },
      };
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const feeds = getFilteredSortedFeeds(feedsOptions, communities, {}, makeMockAccounts());
      expect(feeds.feed1).toContainEqual(expect.objectContaining({ cid: "fallback-cid" }));
    });
  });

  describe("addAccountsComments replacement branches", () => {
    beforeEach(() => {
      // @ts-ignore
      accountsStore.getState = () => ({
        accountsComments: {
          [mockAccountId]: [],
        },
        accounts: makeMockAccounts(),
      });
    });

    test("skips account post when cid already in loaded feed", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          communityAddresses: ["sub1"],
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const existingPost = {
        cid: "already-cid",
        index: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [existingPost] },
        accounts: makeMockAccounts(),
      });
      const loadedFeeds = { [feedName]: [existingPost] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(false);
      expect(loadedFeeds[feedName]).toHaveLength(1);
    });

    test("cid/index drift: replaces loaded post when cid matches but index changed", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          communityAddresses: ["sub1"],
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const loadedPostWithOldIndex = {
        cid: "same-cid",
        index: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      const freshAccountPost = {
        cid: "same-cid",
        index: 2,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      // @ts-ignore
      accountsStore.getState = () => ({
        accountsComments: {
          [mockAccountId]: [freshAccountPost],
        },
        accounts: makeMockAccounts(),
      });
      const loadedFeeds = {
        [feedName]: [loadedPostWithOldIndex],
      };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0]).toEqual(freshAccountPost);
    });

    test("append: true pushes account post to end of feed", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          communityAddresses: ["sub1"],
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: true },
        },
      };
      const existingPost = {
        cid: "existing-cid",
        index: undefined,
        communityAddress: "sub1",
        timestamp: recentTs - 1000,
      };
      const accountPost = {
        cid: "append-cid",
        index: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      (accountsStore as any).getState = () => ({
        accountsComments: { [mockAccountId]: [accountPost] },
        accounts: makeMockAccounts(),
      });
      const loadedFeeds = { [feedName]: [existingPost] };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName]).toHaveLength(2);
      expect(loadedFeeds[feedName][1].cid).toBe("append-cid");
    });

    test("pending->cid: replace index entry with cid when account post gets cid", () => {
      const feedName = "feed1";
      const recentTs = Math.floor(Date.now() / 1000) - 100;
      const feedsOptions = {
        [feedName]: {
          communityAddresses: ["sub1"],
          accountId: mockAccountId,
          accountComments: { newerThan: 3600, append: false },
        },
      };
      const pendingPost = {
        index: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      const accountPostWithCid = {
        cid: "new-cid",
        index: 1,
        communityAddress: "sub1",
        timestamp: recentTs,
      };
      // @ts-ignore
      accountsStore.getState = () => ({
        accountsComments: {
          [mockAccountId]: [accountPostWithCid],
        },
        accounts: makeMockAccounts(),
      });
      const loadedFeeds = {
        [feedName]: [pendingPost],
      };
      const changed = addAccountsComments(feedsOptions, loadedFeeds);
      expect(changed).toBe(true);
      expect(loadedFeeds[feedName][0]).toEqual(accountPostWithCid);
    });
  });

  describe("blocked addresses/cids no-change false branches", () => {
    test("feedsHaveChangedBlockedAddresses returns true when changed address is in feed communities", () => {
      const feedsOptions = { feeds1: { communityAddresses: ["blocked-x"] } };
      const bufferedFeeds = { feeds1: [] };
      const blockedAddresses = ["blocked-x"];
      const previousBlockedAddresses: string[] = [];
      const result = feedsHaveChangedBlockedAddresses(
        feedsOptions,
        bufferedFeeds,
        blockedAddresses,
        previousBlockedAddresses,
      );
      expect(result).toBe(true);
    });

    test("feedsHaveChangedBlockedAddresses returns false when changed blocked not in feeds", () => {
      const feedsOptions = { feeds1: { communityAddresses: ["sub-a"] } };
      const bufferedFeeds = {
        feeds1: [{ cid: "c1", communityAddress: "sub-a", author: { address: "addr-a" } }],
      };
      const blockedAddresses = ["blocked-x"];
      const previousBlockedAddresses: string[] = [];
      const result = feedsHaveChangedBlockedAddresses(
        feedsOptions,
        bufferedFeeds,
        blockedAddresses,
        previousBlockedAddresses,
      );
      expect(result).toBe(false);
    });

    test("feedsHaveChangedBlockedCids returns false when changed blocked cids not in feeds", () => {
      const feedsOptions = { feeds1: { communityAddresses: ["sub-a"] } };
      const bufferedFeeds = {
        feeds1: [{ cid: "c1", communityAddress: "sub-a" }],
      };
      const blockedCids = ["blocked-cid-x"];
      const previousBlockedCids: string[] = [];
      const result = feedsHaveChangedBlockedCids(
        feedsOptions,
        bufferedFeeds,
        blockedCids,
        previousBlockedCids,
      );
      expect(result).toBe(false);
    });

    test("feedsHaveChangedBlockedCids returns true when cid in feed is blocked", () => {
      const feedsOptions = { feeds1: { communityAddresses: ["sub-a"] } };
      const bufferedFeeds = {
        feeds1: [{ cid: "blocked-cid-x", communityAddress: "sub-a" }],
      };
      const blockedCids = ["blocked-cid-x"];
      const previousBlockedCids: string[] = [];
      const result = feedsHaveChangedBlockedCids(
        feedsOptions,
        bufferedFeeds,
        blockedCids,
        previousBlockedCids,
      );
      expect(result).toBe(true);
    });
  });

  describe("getLoadedFeeds", () => {
    beforeEach(() => {
      // @ts-ignore
      accountsStore.getState = () => ({
        accountsComments: { [mockAccountId]: [] },
        accounts: makeMockAccounts(),
      });
    });

    test("returns loadedFeeds when no missing posts and no account comments change", async () => {
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
          pageNumber: 1,
          postsPerPage: 10,
        },
      };
      const loadedFeeds = {
        feed1: [{ cid: "c1", communityAddress: "sub1", timestamp: 100, index: 1 }],
      };
      const filteredSortedFeeds = {
        feed1: [{ cid: "c1", communityAddress: "sub1", timestamp: 100, index: 1 }],
      };
      const bufferedFeeds = { feed1: [] };
      const accounts = makeMockAccounts();
      const result = await getLoadedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        loadedFeeds,
        bufferedFeeds,
        accounts,
      );
      expect(result).toBe(loadedFeeds);
    });

    test("adds missing posts from buffered feed", async () => {
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
          pageNumber: 2,
          postsPerPage: 5,
        },
      };
      const loadedFeeds = { feed1: [] };
      const bufferedPosts = [
        { cid: "c1", communityAddress: "sub1", timestamp: 1 },
        { cid: "c2", communityAddress: "sub1", timestamp: 2 },
        { cid: "c3", communityAddress: "sub1", timestamp: 3 },
        { cid: "c4", communityAddress: "sub1", timestamp: 4 },
        { cid: "c5", communityAddress: "sub1", timestamp: 5 },
      ];
      const filteredSortedFeeds = { feed1: bufferedPosts };
      const bufferedFeeds = { feed1: bufferedPosts };
      const accounts = makeMockAccounts();
      const result = await getLoadedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        loadedFeeds,
        bufferedFeeds,
        accounts,
      );
      expect(result.feed1.length).toBeGreaterThanOrEqual(5);
    });

    test("modQueue prunes removed posts and refreshes remaining loaded entries", async () => {
      const feedName = "feed1";
      const feedsOptions = {
        [feedName]: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
          pageNumber: 2,
          postsPerPage: 1,
          modQueue: ["pendingApproval"],
        },
      };
      const loadedFeeds = {
        [feedName]: [
          {
            cid: "keep-cid",
            communityAddress: "sub1",
            timestamp: 1,
            updatedAt: 1,
            pendingApproval: true,
          },
          {
            cid: "remove-cid",
            communityAddress: "sub1",
            timestamp: 2,
            updatedAt: 2,
            pendingApproval: true,
          },
        ],
      };
      const filteredSortedFeeds = {
        [feedName]: [
          {
            cid: "keep-cid",
            communityAddress: "sub1",
            timestamp: 1,
            updatedAt: 10,
            pendingApproval: true,
          },
          {
            cid: "new-cid",
            communityAddress: "sub1",
            timestamp: 3,
            updatedAt: 3,
            pendingApproval: true,
          },
        ],
      };
      const bufferedFeeds = {
        [feedName]: [filteredSortedFeeds[feedName][1]],
      };
      const accounts = makeMockAccounts();

      const result = await getLoadedFeeds(
        feedsOptions,
        filteredSortedFeeds,
        loadedFeeds,
        bufferedFeeds,
        accounts,
      );

      expect(result[feedName].map((post: any) => post.cid)).toEqual(["keep-cid", "new-cid"]);
      expect(result[feedName][0].updatedAt).toBe(10);
    });
  });

  describe("getUpdatedFeeds", () => {
    test("updates feed when post has newer updatedAt and is valid", async () => {
      const feedName = "feed1";
      const feedsOptions = {
        [feedName]: { accountId: mockAccountId },
      };
      const plebbit = {
        validateComment: () => Promise.resolve(true),
      };
      const accounts = makeMockAccounts({ plebbit });
      const loadedFeed = [{ cid: "r1", communityAddress: "sub1", timestamp: 100, updatedAt: 100 }];
      const loadedFeeds = { [feedName]: loadedFeed };
      const updatedFeeds = {
        [feedName]: [loadedFeed[0]],
      };
      const newerPost = {
        cid: "r1",
        communityAddress: "sub1",
        timestamp: 100,
        updatedAt: 200,
      };
      const filteredSortedFeeds = { [feedName]: [newerPost] };
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

  describe("getFeedsHaveMore", () => {
    test("continues when community address is blocked", () => {
      const feedsOptions = {
        feed1: {
          communityAddresses: ["blocked-sub", "sub2"],
          sortType: "new",
          accountId: mockAccountId,
        },
      };
      const communities = {
        "blocked-sub": { address: "blocked-sub", updatedAt: 1, posts: {} },
        sub2: {
          address: "sub2",
          updatedAt: 1,
          posts: { pageCids: { new: "pc1" }, pages: {} },
        },
      };
      const communitiesPages = {
        pc1: { comments: [], nextCid: undefined },
      };
      const accounts = makeMockAccounts({
        blockedAddresses: { "blocked-sub": true },
      });
      const result = getFeedsHaveMore(feedsOptions, {}, communities, communitiesPages, accounts);
      expect(result.feed1).toBeDefined();
    });

    test("uses modQueue when modQueue option present", () => {
      const feedsOptions = {
        feed1: {
          communityAddresses: ["sub1"],
          sortType: "new",
          accountId: mockAccountId,
          modQueue: ["approved"],
        },
      };
      const communities = {
        sub1: {
          address: "sub1",
          updatedAt: 1,
          modQueue: { pageCids: { approved: "mq1" }, pages: {} },
        },
      };
      const communitiesPages = {
        [`${mockAccountId}:mq1`]: { comments: [], nextCid: undefined },
      };
      const result = getFeedsHaveMore(
        feedsOptions,
        {},
        communities,
        communitiesPages,
        makeMockAccounts(),
      );
      expect(result.feed1).toBe(false);
    });
  });

  describe("getFeedsCommunitiesFirstPageCids", () => {
    test("includes pageCids from posts and modQueue", () => {
      const feedsOptions = { f1: { communityAddresses: ["s1"] } };
      const communities = new Map([
        [
          "s1",
          {
            address: "s1",
            posts: {
              pageCids: { new: "page-cid-1" },
              pages: { new: { nextCid: "next-cid-1" } },
            },
            modQueue: { pageCids: { approved: "mod-cid-1" } },
          },
        ],
      ]);
      const cids = getFeedsCommunitiesFirstPageCids(communities);
      expect(cids).toContain("page-cid-1");
      expect(cids).toContain("next-cid-1");
      expect(cids).toContain("mod-cid-1");
    });
  });

  describe("getAccountsBlockedAddresses and accountsBlockedAddressesChanged", () => {
    test("getAccountsBlockedAddresses returns sorted blocked addresses", () => {
      const accounts = {
        a1: { blockedAddresses: { x: true, y: true } },
        a2: { blockedAddresses: { z: true } },
      };
      const result = getAccountsBlockedAddresses(accounts as any);
      expect(result).toEqual(["x", "y", "z"]);
    });

    test("accountsBlockedAddressesChanged returns true when same index has different ref", () => {
      const prev = [{ addr: true }];
      const curr = [{ addr: true }];
      expect(accountsBlockedAddressesChanged(prev, curr)).toBe(true);
    });

    test("accountsBlockedAddressesChanged returns false when same refs", () => {
      const arr = [{ a: true }];
      expect(accountsBlockedAddressesChanged(arr, arr)).toBe(false);
    });
  });

  describe("getAccountsBlockedCids and accountsBlockedCidsChanged", () => {
    test("getAccountsBlockedCids returns sorted blocked cids", () => {
      const accounts = {
        a1: { blockedCids: { c1: true, c2: true } },
        a2: { blockedCids: { c3: true } },
      };
      const result = getAccountsBlockedCids(accounts as any);
      expect(result).toEqual(["c1", "c2", "c3"]);
    });

    test("accountsBlockedCidsChanged returns true when same index has different ref", () => {
      const prev = [{ cid: true }];
      const curr = [{ cid: true }];
      expect(accountsBlockedCidsChanged(prev, curr)).toBe(true);
    });

    test("accountsBlockedCidsChanged returns false when same refs", () => {
      const arr = [{ c: true }];
      expect(accountsBlockedCidsChanged(arr, arr)).toBe(false);
    });
  });

  describe("feedsHaveChangedBlockedAddresses author address", () => {
    test("returns true when post author address is in changed blocked", () => {
      const feedsOptions = { f1: { communityAddresses: ["sub-a"] } };
      const bufferedFeeds = {
        f1: [{ cid: "c1", communityAddress: "sub-a", author: { address: "blocked-author" } }],
      };
      const result = feedsHaveChangedBlockedAddresses(
        feedsOptions,
        bufferedFeeds,
        ["blocked-author"],
        [],
      );
      expect(result).toBe(true);
    });
  });

  describe("getBufferedFeedsWithoutLoadedFeeds", () => {
    test("returns same buffered when no change and same length", () => {
      const buffered = { f1: [{ cid: "c1" }] };
      const loaded = { f1: [{ cid: "c2" }] };
      const result = getBufferedFeedsWithoutLoadedFeeds(buffered, loaded);
      expect(result.f1).toBe(buffered.f1);
    });

    test("returns new array when cid or updatedAt changes", () => {
      const buffered = {
        f1: [
          { cid: "c1", updatedAt: 1 },
          { cid: "c2", updatedAt: 2 },
        ],
      };
      const loaded = { f1: [{ cid: "c1" }] };
      const result = getBufferedFeedsWithoutLoadedFeeds(buffered, loaded);
      expect(result.f1).not.toBe(buffered.f1);
      expect(result.f1).toHaveLength(1);
      expect(result.f1[0].cid).toBe("c2");
    });
  });
});
