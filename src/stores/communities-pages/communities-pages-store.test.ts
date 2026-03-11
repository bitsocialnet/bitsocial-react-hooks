import { act, waitFor as tlWaitFor } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import useCommunitiesPagesStore, {
  resetCommunitiesPagesDatabaseAndStore,
  resetCommunitiesPagesStore,
  getCommunityFirstPageCid,
  getCommentFreshness,
  log,
} from "./communities-pages-store";
import { CommunityPage } from "../../types";
import communitiesStore from "../communities";
import accountsStore from "../accounts";
import localForageLru from "../../lib/localforage-lru";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MockPages {
  communityAddress: string;
  pageCids: { [pageCid: string]: string };
  pages: { [sortType: string]: CommunityPage };
  constructor({ communityAddress }: any) {
    this.communityAddress = communityAddress;
    this.pageCids = {
      new: `${communityAddress} new page cid`,
    };
    const hotPageCid = `${communityAddress} hot page cid`;
    this.pages = {
      hot: {
        nextCid: hotPageCid + " - next page cid",
        comments: this.getPageMockComments(hotPageCid),
      },
    };
  }

  async getPage(options: { cid: string }) {
    const cid = options?.cid;
    await sleep(200);
    const page: CommunityPage = {
      nextCid: cid + " - next page cid",
      comments: this.getPageMockComments(cid),
    };
    return page;
  }

  getPageMockComments(pageCid: string) {
    const commentCount = 100;
    let index = 0;
    const comments: any[] = [];
    while (index++ < commentCount) {
      comments.push({
        timestamp: index,
        cid: pageCid + " comment cid " + index,
        communityAddress: this.communityAddress,
        updatedAt: index,
      });
    }
    return comments;
  }
}

class MockCommunity {
  address: string;
  posts: MockPages;
  constructor({ address }: any) {
    this.address = address;
    this.posts = new MockPages({ communityAddress: address });
  }
  removeAllListeners() {}
}

const mockAccount: any = {
  id: "mock account id",
  plebbit: {
    createCommunity: async ({ address }: any) => new MockCommunity({ address }),
  },
};

describe("communities pages store", () => {
  beforeAll(() => {
    testUtils.silenceReactWarnings();
  });
  afterAll(async () => {
    testUtils.restoreAll();
  });

  let rendered: any, waitFor: any;
  beforeEach(async () => {
    rendered = renderHook<any, any>(() => useCommunitiesPagesStore());
    waitFor = testUtils.createWaitFor(rendered);
  });

  afterEach(async () => {
    await resetCommunitiesPagesDatabaseAndStore();
  });

  test("addNextCommunityPageToStore returns early when no communityFirstPageCid", async () => {
    const communityWithoutPosts = {
      address: "no-posts-address",
      posts: {},
    };
    const sortType = "new";

    await rendered.result.current.addNextCommunityPageToStore(
      communityWithoutPosts,
      sortType,
      mockAccount,
    );

    expect(Object.keys(rendered.result.current.communitiesPages).length).toBe(0);
  });

  test("addCommunityPageCommentsToStore returns early when no new comments", () => {
    const communityWithExistingComments = {
      address: "existing-comments-addr",
      posts: {
        pages: {
          hot: {
            comments: [
              {
                cid: "existing-hot-cid",
                timestamp: 100,
                updatedAt: 100,
                communityAddress: "existing-comments-addr",
              },
            ],
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addCommunityPageCommentsToStore(communityWithExistingComments);
    });
    expect(rendered.result.current.comments["existing-hot-cid"]).toBeDefined();

    act(() => {
      rendered.result.current.addCommunityPageCommentsToStore(communityWithExistingComments);
    });
    expect(rendered.result.current.comments["existing-hot-cid"]).toBeDefined();
  });

  test("addCommunityPageCommentsToStore returns early when no community.posts.pages", () => {
    const communityWithoutPages = {
      address: "no-pages",
      posts: {},
    };

    act(() => {
      rendered.result.current.addCommunityPageCommentsToStore(communityWithoutPages);
    });

    expect(Object.keys(rendered.result.current.comments).length).toBe(0);
  });

  test("initial store", async () => {
    expect(rendered.result.current.communitiesPages).toEqual({});
    expect(typeof rendered.result.current.addNextCommunityPageToStore).toBe("function");
    expect(typeof rendered.result.current.invalidateCommunityPages).toBe("function");
  });

  test("invalidateCommunityPages returns early when no communityFirstPageCid", async () => {
    const communityWithoutPosts = {
      address: "no-pages-address",
      posts: {},
    };

    await act(async () => {
      await rendered.result.current.invalidateCommunityPages(communityWithoutPosts, "new");
    });

    expect(rendered.result.current.communitiesPages).toEqual({});
  });

  test("resetCommunitiesPagesDatabaseAndStore clears database and store", async () => {
    act(() => {
      rendered.result.current.addCommunityPageCommentsToStore({
        address: "db-reset-addr",
        posts: {
          pages: {
            hot: {
              comments: [{ cid: "db-c1", timestamp: 1, communityAddress: "s1" }],
            },
          },
        },
      });
    });
    await waitFor(() => rendered.result.current.comments["db-c1"]);
    await resetCommunitiesPagesDatabaseAndStore();
    const state = useCommunitiesPagesStore.getState();
    expect(state.comments["db-c1"]).toBeUndefined();
    expect(state.communitiesPages).toEqual({});
  });

  test("resetCommunitiesPagesStore after addNextCommunityPageToStore clears listeners and state", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "reset-listener-sub",
    });
    const sortType = "new";
    const firstPageCid = mockCommunity.posts.pageCids[sortType];

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });
    await waitFor(
      () => rendered.result.current.communitiesPages[firstPageCid]?.comments?.length === 100,
    );

    await resetCommunitiesPagesStore();
    const state = useCommunitiesPagesStore.getState();
    expect(state.communitiesPages).toEqual({});
    expect(state.comments).toEqual({});
  });

  test("resetCommunitiesPagesStore clears store state", async () => {
    act(() => {
      rendered.result.current.addCommunityPageCommentsToStore({
        address: "tmp",
        posts: {
          pages: {
            hot: {
              comments: [{ cid: "c1", timestamp: 1, communityAddress: "s1" }],
            },
          },
        },
      });
    });
    expect(rendered.result.current.comments["c1"]).toBeDefined();
    await resetCommunitiesPagesStore();
    const state = useCommunitiesPagesStore.getState();
    expect(state.comments["c1"]).toBeUndefined();
    expect(state.communitiesPages).toEqual({});
  });

  test("addNextCommunityPageToStore scopes cached page clients per account", async () => {
    const createCommunityA = vi.fn(async ({ address }: any) => new MockCommunity({ address }));
    const createCommunityB = vi.fn(async ({ address }: any) => new MockCommunity({ address }));
    const accountA = { id: "account-a", plebbit: { createCommunity: createCommunityA } };
    const accountB = { id: "account-b", plebbit: { createCommunity: createCommunityB } };
    const community = new MockCommunity({ address: "shared-community-address" });
    const sortType = "new";
    const firstPageCid = community.posts.pageCids[sortType];
    const secondPageCid = `${firstPageCid} - next page cid`;

    await rendered.result.current.addNextCommunityPageToStore(community, sortType, accountA);
    await waitFor(() => rendered.result.current.communitiesPages[firstPageCid]);

    await rendered.result.current.addNextCommunityPageToStore(community, sortType, accountB);
    await waitFor(() => rendered.result.current.communitiesPages[secondPageCid]);

    expect(createCommunityA).toHaveBeenCalledTimes(1);
    expect(createCommunityB).toHaveBeenCalledTimes(1);
  });

  test("addNextCommunityPageToStore scopes modQueue pages per account and skips global comment caching", async () => {
    const sharedPageCid = "shared pendingApproval page cid";
    const makeModQueueCommunity = (accountId: string) => ({
      address: "shared-community-address",
      modQueue: {
        pageCids: { pendingApproval: sharedPageCid },
        clients: {},
        getPage: vi.fn(async ({ cid }: any) => ({
          nextCid: undefined,
          comments: [
            {
              cid: `${accountId}-${cid}-comment`,
              communityAddress: "shared-community-address",
              pendingApproval: true,
              timestamp: 1,
              updatedAt: 1,
            },
          ],
        })),
      },
      removeAllListeners() {},
    });
    const createCommunityA = vi.fn(async () => makeModQueueCommunity("account-a"));
    const createCommunityB = vi.fn(async () => makeModQueueCommunity("account-b"));
    const accountA = { id: "account-a", plebbit: { createCommunity: createCommunityA } };
    const accountB = { id: "account-b", plebbit: { createCommunity: createCommunityB } };
    const community = {
      address: "shared-community-address",
      modQueue: {
        pageCids: { pendingApproval: sharedPageCid },
      },
    };

    await rendered.result.current.addNextCommunityPageToStore(
      community as any,
      "new",
      accountA as any,
      ["pendingApproval"],
    );
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[`account-a:${sharedPageCid}`]?.comments?.length,
    );

    await rendered.result.current.addNextCommunityPageToStore(
      community as any,
      "new",
      accountB as any,
      ["pendingApproval"],
    );
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[`account-b:${sharedPageCid}`]?.comments?.length,
    );

    expect(rendered.result.current.communitiesPages[sharedPageCid]).toBeUndefined();
    expect(rendered.result.current.comments).toEqual({});
    expect(createCommunityA).toHaveBeenCalledTimes(1);
    expect(createCommunityB).toHaveBeenCalledTimes(1);
  });

  test("invalidateCommunityPages clears stored page chains for posts", async () => {
    const firstPageCid = "invalidate-posts-page-1";
    const secondPageCid = "invalidate-posts-page-2";
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-communitiesPages" });

    await db.setItem(firstPageCid, {
      nextCid: secondPageCid,
      comments: [{ cid: `${firstPageCid}-comment`, communityAddress: "invalidate-posts" }],
    });
    await db.setItem(secondPageCid, {
      comments: [{ cid: `${secondPageCid}-comment`, communityAddress: "invalidate-posts" }],
    });
    useCommunitiesPagesStore.setState({
      communitiesPages: {
        [firstPageCid]: {
          nextCid: secondPageCid,
          comments: [{ cid: `${firstPageCid}-comment`, communityAddress: "invalidate-posts" }],
        },
        [secondPageCid]: {
          comments: [{ cid: `${secondPageCid}-comment`, communityAddress: "invalidate-posts" }],
        },
      },
    });

    await rendered.result.current.invalidateCommunityPages(
      {
        address: "invalidate-posts",
        posts: { pageCids: { new: firstPageCid } },
      },
      "new",
    );

    expect(useCommunitiesPagesStore.getState().communitiesPages[firstPageCid]).toBeUndefined();
    expect(useCommunitiesPagesStore.getState().communitiesPages[secondPageCid]).toBeUndefined();
    expect(await db.getItem(firstPageCid)).toBeUndefined();
    expect(await db.getItem(secondPageCid)).toBeUndefined();
  });

  test("invalidateCommunityPages returns early when no first page cid", async () => {
    useCommunitiesPagesStore.setState({
      communitiesPages: {
        existing: {
          comments: [{ cid: "existing-comment", communityAddress: "existing-sub" }],
        },
      },
    });

    await rendered.result.current.invalidateCommunityPages(
      {
        address: "no-pages",
        posts: {},
      },
      "new",
    );

    expect(useCommunitiesPagesStore.getState().communitiesPages.existing).toBeDefined();
  });

  test("getCommentFreshness returns 0 when comment undefined (branch 26)", () => {
    expect(getCommentFreshness(undefined)).toBe(0);
  });

  test("getCommunityFirstPageCid throws when sortType empty", () => {
    expect(() =>
      getCommunityFirstPageCid({ address: "addr", posts: {} } as any, "", "posts"),
    ).toThrow();
  });

  test("getCommunityFirstPageCid throws when sortType undefined (branch 313)", () => {
    expect(() =>
      getCommunityFirstPageCid({ address: "addr", posts: {} } as any, undefined as any, "posts"),
    ).toThrow("sortType");
  });

  test("getCommunityFirstPageCid returns nextCid when pages preloaded", () => {
    const community = {
      address: "addr",
      posts: {
        pages: {
          hot: {
            nextCid: "first-page-cid",
            comments: [{ cid: "c1" }],
          },
        },
      },
    };
    expect(getCommunityFirstPageCid(community as any, "hot", "posts")).toBe("first-page-cid");
  });

  test("getCommunityFirstPageCid returns pageCids when no preloaded pages", () => {
    const community = {
      address: "addr",
      posts: {
        pageCids: { hot: "page-cid-from-pageCids" },
      },
    };
    expect(getCommunityFirstPageCid(community as any, "hot", "posts")).toBe(
      "page-cid-from-pageCids",
    );
  });

  test("getCommunityFirstPageCid defaults pageType to posts", () => {
    const community = {
      address: "addr",
      posts: {
        pageCids: { hot: "default-posts-page-cid" },
      },
    };
    expect(getCommunityFirstPageCid(community as any, "hot")).toBe("default-posts-page-cid");
  });

  test("fetchPage returns cached page when in database", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 1",
    });
    const sortType = "new";
    const firstPageCid = mockCommunity.posts.pageCids[sortType];
    const cachedPage = {
      nextCid: firstPageCid + " - next",
      comments: [{ cid: "cached-1", communityAddress: "community address 1" }],
    };
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-communitiesPages" });
    await db.setItem(firstPageCid, cachedPage);

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    await waitFor(
      () =>
        rendered.result.current.communitiesPages[firstPageCid]?.nextCid ===
        firstPageCid + " - next",
    );
    expect(rendered.result.current.communitiesPages[firstPageCid].comments).toHaveLength(1);
  });

  test("invalidateCommunityPages removes loaded page chain from store and database", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "invalidate-pages-community",
    });
    const sortType = "new";
    const firstPageCid = mockCommunity.posts.pageCids[sortType];
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-communitiesPages" });

    await act(async () => {
      await rendered.result.current.addNextCommunityPageToStore(
        mockCommunity,
        sortType,
        mockAccount,
      );
    });
    await waitFor(() => rendered.result.current.communitiesPages[firstPageCid]?.nextCid);

    const secondPageCid = rendered.result.current.communitiesPages[firstPageCid].nextCid;
    await act(async () => {
      await rendered.result.current.addNextCommunityPageToStore(
        mockCommunity,
        sortType,
        mockAccount,
      );
    });
    await waitFor(() => rendered.result.current.communitiesPages[secondPageCid]?.comments?.length);

    expect(await db.getItem(firstPageCid)).toBeDefined();
    expect(await db.getItem(secondPageCid)).toBeDefined();

    await act(async () => {
      await rendered.result.current.invalidateCommunityPages(mockCommunity, sortType);
    });

    expect(useCommunitiesPagesStore.getState().communitiesPages[firstPageCid]).toBeUndefined();
    expect(useCommunitiesPagesStore.getState().communitiesPages[secondPageCid]).toBeUndefined();
    expect(await db.getItem(firstPageCid)).toBeUndefined();
    expect(await db.getItem(secondPageCid)).toBeUndefined();
  });

  test("fetchPage onError logs when getPage rejects", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 1",
    });
    const sortType = "new";
    const firstPageCid = mockCommunity.posts.pageCids[sortType];
    const getPageOrig = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async () => {
      throw new Error("getPage failed");
    };

    const utils = await import("../../lib/utils");
    const retryOrig = utils.default.retryInfinity;
    (utils.default as any).retryInfinity = async (fn: () => Promise<any>, opts?: any) => {
      try {
        return await fn();
      } catch (e) {
        opts?.onError?.(e);
        throw e;
      }
    };

    const logSpy = vi.spyOn(log, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        try {
          await rendered.result.current.addNextCommunityPageToStore(
            mockCommunity,
            sortType,
            mockAccount,
          );
        } catch {
          // expected
        }
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed community.posts.getPage"),
        expect.any(Error),
      );
    } finally {
      logSpy.mockRestore();
      (utils.default as any).retryInfinity = retryOrig;
      MockPages.prototype.getPage = getPageOrig;
    }
  });

  test("addCidToAccountComment error is logged when it rejects", async () => {
    const addCidSpy = vi.fn().mockRejectedValue(new Error("addCid failed"));
    const accountsGetState = accountsStore.getState;
    (accountsStore as any).getState = () => ({
      ...accountsGetState(),
      accountsActionsInternal: { addCidToAccountComment: addCidSpy },
    });

    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 1",
    });
    const sortType = "new";
    const logSpy = vi.spyOn(log, "error").mockImplementation(() => {});

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    await waitFor(() => Object.keys(rendered.result.current.communitiesPages).length > 0);
    await new Promise((r) => setTimeout(r, 100));

    expect(logSpy).toHaveBeenCalledWith(
      "communitiesPagesStore.addNextCommunityPageToStore addCidToAccountComment error",
      expect.objectContaining({ comment: expect.anything(), error: expect.any(Error) }),
    );

    logSpy.mockRestore();
    (accountsStore as any).getState = accountsGetState;
  });

  test("onCommunityPostsClientsStateChange returns empty object when community missing", async () => {
    let capturedCb: ((...args: any[]) => void) | null = null;
    const utilsMod = await import("../../lib/utils");
    const origPageClients = utilsMod.default.pageClientsOnStateChange;
    utilsMod.default.pageClientsOnStateChange = (_clients: any, cb: any) => {
      capturedCb = cb;
    };

    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "client-state-sub-addr",
    });
    const sortType = "new";

    await act(async () => {
      await rendered.result.current.addNextCommunityPageToStore(
        mockCommunity,
        sortType,
        mockAccount,
      );
    });

    await waitFor(() => Object.keys(rendered.result.current.communitiesPages).length > 0);
    expect(capturedCb).toBeTruthy();

    communitiesStore.setState({ communities: {} });
    capturedCb!("state", "type", "sort", "url");
    expect(communitiesStore.getState().communities).toEqual({});

    utilsMod.default.pageClientsOnStateChange = origPageClients;
  });

  test("onCommunityPostsClientsStateChange updates client state when community exists", async () => {
    let capturedCb: ((...args: any[]) => void) | null = null;
    const utilsMod = await import("../../lib/utils");
    const origPageClients = utilsMod.default.pageClientsOnStateChange;
    utilsMod.default.pageClientsOnStateChange = (_clients: any, cb: any) => {
      capturedCb = cb;
    };

    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "client-state-live-sub-addr",
    });
    communitiesStore.setState({
      communities: {
        [mockCommunity.address]: {
          address: mockCommunity.address,
          posts: { clients: {} },
        },
      },
    });

    await act(async () => {
      await rendered.result.current.addNextCommunityPageToStore(mockCommunity, "new", mockAccount);
    });

    expect(capturedCb).toBeTruthy();
    capturedCb!("fetching", "ipfs", "new", "http://client.example");
    expect(
      communitiesStore.getState().communities[mockCommunity.address].posts.clients.ipfs.new[
        "http://client.example"
      ],
    ).toEqual({
      state: "fetching",
    });

    utilsMod.default.pageClientsOnStateChange = origPageClients;
  });

  test("add next pages from community.posts.pageCids", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 1",
    });
    // in the mock, sortType 'new' is only on community.pageCids
    const sortType = "new";
    const communityAddress1FirstPageCid = mockCommunity.posts.pageCids[sortType];

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    // wait for first page to be defined
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[communityAddress1FirstPageCid].nextCid ===
        communityAddress1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.communitiesPages[communityAddress1FirstPageCid].nextCid).toBe(
      communityAddress1FirstPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.communitiesPages[communityAddress1FirstPageCid].comments.length,
    ).toBe(100);

    // comments are individually stored in comments store
    const firstCommentCid =
      rendered.result.current.communitiesPages[communityAddress1FirstPageCid].comments[0].cid;
    expect(rendered.result.current.comments[firstCommentCid].cid).toBe(firstCommentCid);
    expect(Object.keys(rendered.result.current.comments).length).toBe(100);

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    // wait for second page to be defined
    const communityAddress1SecondPageCid = `${communityAddress1FirstPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[communityAddress1SecondPageCid].nextCid ===
        communityAddress1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.communitiesPages[communityAddress1SecondPageCid].nextCid).toBe(
      communityAddress1SecondPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.communitiesPages[communityAddress1SecondPageCid].comments.length,
    ).toBe(100);

    // no more pages
    const getPage = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => ({ comments: [], nextCid: undefined });

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    // wait for third page to be defined
    const communityAddress1ThirdPageCid = `${communityAddress1SecondPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[communityAddress1ThirdPageCid].nextCid ===
        undefined,
    );
    expect(rendered.result.current.communitiesPages[communityAddress1ThirdPageCid].nextCid).toBe(
      undefined,
    );
    expect(
      rendered.result.current.communitiesPages[communityAddress1ThirdPageCid].comments.length,
    ).toBe(0);

    // adding a next page when no more pages does nothing
    const previousCommunityPagesFetchedCount = Object.keys(
      rendered.result.current.communitiesPages,
    ).length;
    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(rendered.result.current.communitiesPages).length >
            previousCommunityPagesFetchedCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(rendered.result.current.communitiesPages).length).toBe(
      previousCommunityPagesFetchedCount,
    );

    // restore mock
    MockPages.prototype.getPage = getPage;
  });

  test("add next pages from community.posts.pages", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 1",
    });
    // in the mock, sortType 'hot' is only on community.pages
    const sortType = "hot";
    const communityAddress1FirstPageCid = mockCommunity.posts.pages[sortType].nextCid;

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    // wait for first page to be defined
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[communityAddress1FirstPageCid].nextCid ===
        communityAddress1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.communitiesPages[communityAddress1FirstPageCid].nextCid).toBe(
      communityAddress1FirstPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.communitiesPages[communityAddress1FirstPageCid].comments.length,
    ).toBe(100);

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    // wait for second page to be defined
    const communityAddress1SecondPageCid = `${communityAddress1FirstPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[communityAddress1SecondPageCid].nextCid ===
        communityAddress1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.communitiesPages[communityAddress1SecondPageCid].nextCid).toBe(
      communityAddress1SecondPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.communitiesPages[communityAddress1SecondPageCid].comments.length,
    ).toBe(100);

    // no more pages
    const getPage = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => ({ comments: [], nextCid: undefined });

    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });

    // wait for third page to be defined
    const communityAddress1ThirdPageCid = `${communityAddress1SecondPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.communitiesPages[communityAddress1ThirdPageCid].nextCid ===
        undefined,
    );
    expect(rendered.result.current.communitiesPages[communityAddress1ThirdPageCid].nextCid).toBe(
      undefined,
    );
    expect(
      rendered.result.current.communitiesPages[communityAddress1ThirdPageCid].comments.length,
    ).toBe(0);

    // adding a next page when no more pages does nothing
    const previousCommunityPagesFetchedCount = Object.keys(
      rendered.result.current.communitiesPages,
    ).length;
    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(rendered.result.current.communitiesPages).length >
            previousCommunityPagesFetchedCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(rendered.result.current.communitiesPages).length).toBe(
      previousCommunityPagesFetchedCount,
    );

    // restore mock
    MockPages.prototype.getPage = getPage;
  });

  test("page comments without updatedAt are still indexed on first insert", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 1",
    });
    const sortType = "new";
    const firstPageCid = mockCommunity.posts.pageCids[sortType];
    const commentCid = firstPageCid + " comment-no-updated-at";
    const getPageOriginal = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => {
      const cid = options?.cid;
      await sleep(200);
      return {
        nextCid: cid + " - next page cid",
        comments: [
          {
            cid: commentCid,
            timestamp: 100,
            communityAddress: "community address 1",
            // no updatedAt - should still be indexed via max(updatedAt??0, timestamp, 0)
          },
        ],
      };
    };
    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });
    await waitFor(() => {
      expect(rendered.result.current.comments[commentCid]).toBeDefined();
    });
    expect(rendered.result.current.comments[commentCid].cid).toBe(commentCid);
    expect(rendered.result.current.comments[commentCid].timestamp).toBe(100);
    expect(rendered.result.current.comments[commentCid].updatedAt).toBeUndefined();
    MockPages.prototype.getPage = getPageOriginal;
  });

  test("existing fresher indexed comment is not overwritten by older/empty-freshness page data", async () => {
    const mockCommunity = await mockAccount.plebbit.createCommunity({
      address: "community address 2",
    });
    const sortType = "new";
    const firstPageCid = mockCommunity.posts.pageCids[sortType];
    const secondPageCid = firstPageCid + " - next page cid";
    const sharedCommentCid = "shared-comment-fresher-wins";
    const getPageOriginal = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => {
      const cid = options?.cid;
      await sleep(200);
      if (cid === firstPageCid) {
        return {
          nextCid: secondPageCid,
          comments: [
            {
              cid: sharedCommentCid,
              timestamp: 50,
              updatedAt: 100,
              communityAddress: "community address 2",
            },
          ],
        };
      }
      if (cid === secondPageCid) {
        return {
          nextCid: secondPageCid + " - next page cid",
          comments: [
            {
              cid: sharedCommentCid,
              timestamp: 50,
              updatedAt: 10,
              communityAddress: "community address 2",
            },
          ],
        };
      }
      return { nextCid: undefined, comments: [] };
    };
    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });
    await waitFor(() => {
      expect(rendered.result.current.comments[sharedCommentCid]).toBeDefined();
    });
    expect(rendered.result.current.comments[sharedCommentCid].updatedAt).toBe(100);
    act(() => {
      rendered.result.current.addNextCommunityPageToStore(mockCommunity, sortType, mockAccount);
    });
    await waitFor(() => {
      expect(rendered.result.current.communitiesPages[secondPageCid]).toBeDefined();
    });
    expect(rendered.result.current.comments[sharedCommentCid].updatedAt).toBe(100);
    MockPages.prototype.getPage = getPageOriginal;
  });
});
