import { act, waitFor as tlWaitFor } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import useSubplebbitsPagesStore, {
  resetSubplebbitsPagesDatabaseAndStore,
  resetSubplebbitsPagesStore,
  getSubplebbitFirstPageCid,
  getCommentFreshness,
  log,
} from "./subplebbits-pages-store";
import { SubplebbitPage } from "../../types";
import subplebbitsStore from "../subplebbits";
import accountsStore from "../accounts";
import localForageLru from "../../lib/localforage-lru";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MockPages {
  subplebbitAddress: string;
  pageCids: { [pageCid: string]: string };
  pages: { [sortType: string]: SubplebbitPage };
  constructor({ subplebbitAddress }: any) {
    this.subplebbitAddress = subplebbitAddress;
    this.pageCids = {
      new: `${subplebbitAddress} new page cid`,
    };
    const hotPageCid = `${subplebbitAddress} hot page cid`;
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
    const page: SubplebbitPage = {
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
        subplebbitAddress: this.subplebbitAddress,
        updatedAt: index,
      });
    }
    return comments;
  }
}

class MockSubplebbit {
  address: string;
  posts: MockPages;
  constructor({ address }: any) {
    this.address = address;
    this.posts = new MockPages({ subplebbitAddress: address });
  }
  removeAllListeners() {}
}

const mockAccount: any = {
  id: "mock account id",
  plebbit: {
    createSubplebbit: async ({ address }: any) => new MockSubplebbit({ address }),
  },
};

describe("subplebbits pages store", () => {
  beforeAll(() => {
    testUtils.silenceReactWarnings();
  });
  afterAll(async () => {
    testUtils.restoreAll();
  });

  let rendered: any, waitFor: any;
  beforeEach(async () => {
    rendered = renderHook<any, any>(() => useSubplebbitsPagesStore());
    waitFor = testUtils.createWaitFor(rendered);
  });

  afterEach(async () => {
    await resetSubplebbitsPagesDatabaseAndStore();
  });

  test("addNextSubplebbitPageToStore returns early when no subplebbitFirstPageCid", async () => {
    const subplebbitWithoutPosts = {
      address: "no-posts-address",
      posts: {},
    };
    const sortType = "new";

    await rendered.result.current.addNextSubplebbitPageToStore(
      subplebbitWithoutPosts,
      sortType,
      mockAccount,
    );

    expect(Object.keys(rendered.result.current.subplebbitsPages).length).toBe(0);
  });

  test("addSubplebbitPageCommentsToStore returns early when no new comments", () => {
    const subplebbitWithExistingComments = {
      address: "existing-comments-addr",
      posts: {
        pages: {
          hot: {
            comments: [
              {
                cid: "existing-hot-cid",
                timestamp: 100,
                updatedAt: 100,
                subplebbitAddress: "existing-comments-addr",
              },
            ],
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addSubplebbitPageCommentsToStore(subplebbitWithExistingComments);
    });
    expect(rendered.result.current.comments["existing-hot-cid"]).toBeDefined();

    act(() => {
      rendered.result.current.addSubplebbitPageCommentsToStore(subplebbitWithExistingComments);
    });
    expect(rendered.result.current.comments["existing-hot-cid"]).toBeDefined();
  });

  test("addSubplebbitPageCommentsToStore returns early when no subplebbit.posts.pages", () => {
    const subplebbitWithoutPages = {
      address: "no-pages",
      posts: {},
    };

    act(() => {
      rendered.result.current.addSubplebbitPageCommentsToStore(subplebbitWithoutPages);
    });

    expect(Object.keys(rendered.result.current.comments).length).toBe(0);
  });

  test("initial store", async () => {
    expect(rendered.result.current.subplebbitsPages).toEqual({});
    expect(typeof rendered.result.current.addNextSubplebbitPageToStore).toBe("function");
  });

  test("resetSubplebbitsPagesDatabaseAndStore clears database and store", async () => {
    act(() => {
      rendered.result.current.addSubplebbitPageCommentsToStore({
        address: "db-reset-addr",
        posts: {
          pages: {
            hot: {
              comments: [{ cid: "db-c1", timestamp: 1, subplebbitAddress: "s1" }],
            },
          },
        },
      });
    });
    await waitFor(() => rendered.result.current.comments["db-c1"]);
    await resetSubplebbitsPagesDatabaseAndStore();
    const state = useSubplebbitsPagesStore.getState();
    expect(state.comments["db-c1"]).toBeUndefined();
    expect(state.subplebbitsPages).toEqual({});
  });

  test("resetSubplebbitsPagesStore after addNextSubplebbitPageToStore clears listeners and state", async () => {
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "reset-listener-sub",
    });
    const sortType = "new";
    const firstPageCid = mockSubplebbit.posts.pageCids[sortType];

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });
    await waitFor(
      () => rendered.result.current.subplebbitsPages[firstPageCid]?.comments?.length === 100,
    );

    await resetSubplebbitsPagesStore();
    const state = useSubplebbitsPagesStore.getState();
    expect(state.subplebbitsPages).toEqual({});
    expect(state.comments).toEqual({});
  });

  test("resetSubplebbitsPagesStore clears store state", async () => {
    act(() => {
      rendered.result.current.addSubplebbitPageCommentsToStore({
        address: "tmp",
        posts: {
          pages: {
            hot: {
              comments: [{ cid: "c1", timestamp: 1, subplebbitAddress: "s1" }],
            },
          },
        },
      });
    });
    expect(rendered.result.current.comments["c1"]).toBeDefined();
    await resetSubplebbitsPagesStore();
    const state = useSubplebbitsPagesStore.getState();
    expect(state.comments["c1"]).toBeUndefined();
    expect(state.subplebbitsPages).toEqual({});
  });

  test("getCommentFreshness returns 0 when comment undefined (branch 26)", () => {
    expect(getCommentFreshness(undefined)).toBe(0);
  });

  test("getSubplebbitFirstPageCid throws when sortType empty", () => {
    expect(() =>
      getSubplebbitFirstPageCid({ address: "addr", posts: {} } as any, "", "posts"),
    ).toThrow();
  });

  test("getSubplebbitFirstPageCid throws when sortType undefined (branch 313)", () => {
    expect(() =>
      getSubplebbitFirstPageCid({ address: "addr", posts: {} } as any, undefined as any, "posts"),
    ).toThrow("sortType");
  });

  test("getSubplebbitFirstPageCid returns nextCid when pages preloaded", () => {
    const subplebbit = {
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
    expect(getSubplebbitFirstPageCid(subplebbit as any, "hot", "posts")).toBe("first-page-cid");
  });

  test("getSubplebbitFirstPageCid returns pageCids when no preloaded pages", () => {
    const subplebbit = {
      address: "addr",
      posts: {
        pageCids: { hot: "page-cid-from-pageCids" },
      },
    };
    expect(getSubplebbitFirstPageCid(subplebbit as any, "hot", "posts")).toBe(
      "page-cid-from-pageCids",
    );
  });

  test("fetchPage returns cached page when in database", async () => {
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 1",
    });
    const sortType = "new";
    const firstPageCid = mockSubplebbit.posts.pageCids[sortType];
    const cachedPage = {
      nextCid: firstPageCid + " - next",
      comments: [{ cid: "cached-1", subplebbitAddress: "subplebbit address 1" }],
    };
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-subplebbitsPages" });
    await db.setItem(firstPageCid, cachedPage);

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[firstPageCid]?.nextCid ===
        firstPageCid + " - next",
    );
    expect(rendered.result.current.subplebbitsPages[firstPageCid].comments).toHaveLength(1);
  });

  test("fetchPage onError logs when getPage rejects", async () => {
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 1",
    });
    const sortType = "new";
    const firstPageCid = mockSubplebbit.posts.pageCids[sortType];
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
          await rendered.result.current.addNextSubplebbitPageToStore(
            mockSubplebbit,
            sortType,
            mockAccount,
          );
        } catch {
          // expected
        }
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed subplebbit.posts.getPage"),
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

    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 1",
    });
    const sortType = "new";
    const logSpy = vi.spyOn(log, "error").mockImplementation(() => {});

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    await waitFor(() => Object.keys(rendered.result.current.subplebbitsPages).length > 0);
    await new Promise((r) => setTimeout(r, 100));

    expect(logSpy).toHaveBeenCalledWith(
      "subplebbitsPagesStore.addNextSubplebbitPageToStore addCidToAccountComment error",
      expect.objectContaining({ comment: expect.anything(), error: expect.any(Error) }),
    );

    logSpy.mockRestore();
    (accountsStore as any).getState = accountsGetState;
  });

  test("onSubplebbitPostsClientsStateChange returns empty object when subplebbit missing", async () => {
    let capturedCb: ((...args: any[]) => void) | null = null;
    const utilsMod = await import("../../lib/utils");
    const origPageClients = utilsMod.default.pageClientsOnStateChange;
    utilsMod.default.pageClientsOnStateChange = (_clients: any, cb: any) => {
      capturedCb = cb;
    };

    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "client-state-sub-addr",
    });
    const sortType = "new";

    await act(async () => {
      await rendered.result.current.addNextSubplebbitPageToStore(
        mockSubplebbit,
        sortType,
        mockAccount,
      );
    });

    await waitFor(() => Object.keys(rendered.result.current.subplebbitsPages).length > 0);
    expect(capturedCb).toBeTruthy();

    subplebbitsStore.setState({ subplebbits: {} });
    capturedCb!("state", "type", "sort", "url");
    expect(subplebbitsStore.getState().subplebbits).toEqual({});

    utilsMod.default.pageClientsOnStateChange = origPageClients;
  });

  test("add next pages from subplebbit.posts.pageCids", async () => {
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 1",
    });
    // in the mock, sortType 'new' is only on subplebbit.pageCids
    const sortType = "new";
    const subplebbitAddress1FirstPageCid = mockSubplebbit.posts.pageCids[sortType];

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    // wait for first page to be defined
    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].nextCid ===
        subplebbitAddress1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].nextCid).toBe(
      subplebbitAddress1FirstPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].comments.length,
    ).toBe(100);

    // comments are individually stored in comments store
    const firstCommentCid =
      rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].comments[0].cid;
    expect(rendered.result.current.comments[firstCommentCid].cid).toBe(firstCommentCid);
    expect(Object.keys(rendered.result.current.comments).length).toBe(100);

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    // wait for second page to be defined
    const subplebbitAddress1SecondPageCid = `${subplebbitAddress1FirstPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[subplebbitAddress1SecondPageCid].nextCid ===
        subplebbitAddress1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.subplebbitsPages[subplebbitAddress1SecondPageCid].nextCid).toBe(
      subplebbitAddress1SecondPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.subplebbitsPages[subplebbitAddress1SecondPageCid].comments.length,
    ).toBe(100);

    // no more pages
    const getPage = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => ({ comments: [], nextCid: undefined });

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    // wait for third page to be defined
    const subplebbitAddress1ThirdPageCid = `${subplebbitAddress1SecondPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[subplebbitAddress1ThirdPageCid].nextCid ===
        undefined,
    );
    expect(rendered.result.current.subplebbitsPages[subplebbitAddress1ThirdPageCid].nextCid).toBe(
      undefined,
    );
    expect(
      rendered.result.current.subplebbitsPages[subplebbitAddress1ThirdPageCid].comments.length,
    ).toBe(0);

    // adding a next page when no more pages does nothing
    const previousSubplebbitPagesFetchedCount = Object.keys(
      rendered.result.current.subplebbitsPages,
    ).length;
    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(rendered.result.current.subplebbitsPages).length >
            previousSubplebbitPagesFetchedCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(rendered.result.current.subplebbitsPages).length).toBe(
      previousSubplebbitPagesFetchedCount,
    );

    // restore mock
    MockPages.prototype.getPage = getPage;
  });

  test("add next pages from subplebbit.posts.pages", async () => {
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 1",
    });
    // in the mock, sortType 'hot' is only on subplebbit.pages
    const sortType = "hot";
    const subplebbitAddress1FirstPageCid = mockSubplebbit.posts.pages[sortType].nextCid;

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    // wait for first page to be defined
    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].nextCid ===
        subplebbitAddress1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].nextCid).toBe(
      subplebbitAddress1FirstPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.subplebbitsPages[subplebbitAddress1FirstPageCid].comments.length,
    ).toBe(100);

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    // wait for second page to be defined
    const subplebbitAddress1SecondPageCid = `${subplebbitAddress1FirstPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[subplebbitAddress1SecondPageCid].nextCid ===
        subplebbitAddress1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.subplebbitsPages[subplebbitAddress1SecondPageCid].nextCid).toBe(
      subplebbitAddress1SecondPageCid + " - next page cid",
    );
    expect(
      rendered.result.current.subplebbitsPages[subplebbitAddress1SecondPageCid].comments.length,
    ).toBe(100);

    // no more pages
    const getPage = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => ({ comments: [], nextCid: undefined });

    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });

    // wait for third page to be defined
    const subplebbitAddress1ThirdPageCid = `${subplebbitAddress1SecondPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.subplebbitsPages[subplebbitAddress1ThirdPageCid].nextCid ===
        undefined,
    );
    expect(rendered.result.current.subplebbitsPages[subplebbitAddress1ThirdPageCid].nextCid).toBe(
      undefined,
    );
    expect(
      rendered.result.current.subplebbitsPages[subplebbitAddress1ThirdPageCid].comments.length,
    ).toBe(0);

    // adding a next page when no more pages does nothing
    const previousSubplebbitPagesFetchedCount = Object.keys(
      rendered.result.current.subplebbitsPages,
    ).length;
    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(rendered.result.current.subplebbitsPages).length >
            previousSubplebbitPagesFetchedCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(rendered.result.current.subplebbitsPages).length).toBe(
      previousSubplebbitPagesFetchedCount,
    );

    // restore mock
    MockPages.prototype.getPage = getPage;
  });

  test("page comments without updatedAt are still indexed on first insert", async () => {
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 1",
    });
    const sortType = "new";
    const firstPageCid = mockSubplebbit.posts.pageCids[sortType];
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
            subplebbitAddress: "subplebbit address 1",
            // no updatedAt - should still be indexed via max(updatedAt??0, timestamp, 0)
          },
        ],
      };
    };
    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
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
    const mockSubplebbit = await mockAccount.plebbit.createSubplebbit({
      address: "subplebbit address 2",
    });
    const sortType = "new";
    const firstPageCid = mockSubplebbit.posts.pageCids[sortType];
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
              subplebbitAddress: "subplebbit address 2",
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
              subplebbitAddress: "subplebbit address 2",
            },
          ],
        };
      }
      return { nextCid: undefined, comments: [] };
    };
    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });
    await waitFor(() => {
      expect(rendered.result.current.comments[sharedCommentCid]).toBeDefined();
    });
    expect(rendered.result.current.comments[sharedCommentCid].updatedAt).toBe(100);
    act(() => {
      rendered.result.current.addNextSubplebbitPageToStore(mockSubplebbit, sortType, mockAccount);
    });
    await waitFor(() => {
      expect(rendered.result.current.subplebbitsPages[secondPageCid]).toBeDefined();
    });
    expect(rendered.result.current.comments[sharedCommentCid].updatedAt).toBe(100);
    MockPages.prototype.getPage = getPageOriginal;
  });
});
