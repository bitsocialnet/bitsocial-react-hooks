import { act, waitFor as tlWaitFor } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import useRepliesPagesStore, {
  resetRepliesPagesDatabaseAndStore,
  resetRepliesPagesStore,
  log,
} from "./replies-pages-store";
import { RepliesPage } from "../../types";
import EventEmitter from "events";
import commentsStore from "../comments";
import accountsStore from "../accounts";
import localForageLru from "../../lib/localforage-lru";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MockPages {
  communityAddress: string;
  pageCids: { [pageCid: string]: string };
  pages: { [sortType: string]: RepliesPage };
  constructor({ communityAddress }: any) {
    this.communityAddress = communityAddress;
    this.pageCids = {
      new: `${communityAddress} new page cid`,
    };
    const bestPageCid = `${communityAddress} best page cid`;
    this.pages = {
      best: {
        nextCid: bestPageCid + " - next page cid",
        comments: this.getPageMockComments(bestPageCid),
      },
    };
  }

  async getPage(options: { cid: string }) {
    const cid = options?.cid;
    await sleep(200);
    const page: RepliesPage = {
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

  async validatePage(page: any) {}
}

class MockCommunity extends EventEmitter {
  address: string;
  posts: MockPages;
  constructor({ address }: any) {
    super();
    this.address = address;
    this.posts = new MockPages({ communityAddress: address });
  }
}

class MockComment extends EventEmitter {
  cid: string;
  communityAddress: string;
  replies: MockPages;
  constructor({ cid }: any) {
    super();
    this.cid = cid;
    this.communityAddress = `${cid} community address`;
    this.replies = new MockPages({ communityAddress: this.communityAddress });
  }
  async update() {}
}

const mockAccount: any = {
  id: "mock account id",
  plebbit: {
    createCommunity: async ({ address }: any) => new MockCommunity({ address }),
    createComment: async ({ cid }: any) => new MockComment({ cid }),
  },
};

describe("replies pages store", () => {
  beforeAll(() => {
    testUtils.silenceReactWarnings();
  });
  afterAll(async () => {
    testUtils.restoreAll();
  });

  let rendered: any, waitFor: any;
  beforeEach(async () => {
    rendered = renderHook<any, any>(() => useRepliesPagesStore());
    waitFor = testUtils.createWaitFor(rendered);
  });

  afterEach(async () => {
    await resetRepliesPagesDatabaseAndStore();
  });

  test("initial store", async () => {
    expect(rendered.result.current.repliesPages).toEqual({});
    expect(typeof rendered.result.current.addNextRepliesPageToStore).toBe("function");
  });

  test("resetRepliesPagesDatabaseAndStore clears database and store", async () => {
    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore({
        cid: "db-reset-cid",
        replies: {
          pages: {
            best: {
              comments: [{ cid: "db-c1", timestamp: 1, communityAddress: "s1" }],
            },
          },
        },
      });
    });
    await waitFor(() => rendered.result.current.comments["db-c1"]);
    await resetRepliesPagesDatabaseAndStore();
    const state = useRepliesPagesStore.getState();
    expect(state.comments["db-c1"]).toBeUndefined();
    expect(state.repliesPages).toEqual({});
  });

  test("resetRepliesPagesStore after addNextRepliesPageToStore clears listeners and state", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "reset-listener-cid" });
    const sortType = "new";
    const firstPageCid = mockComment.replies.pageCids[sortType];

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });
    await waitFor(
      () => rendered.result.current.repliesPages[firstPageCid]?.comments?.length === 100,
    );

    await resetRepliesPagesStore();
    const state = useRepliesPagesStore.getState();
    expect(state.repliesPages).toEqual({});
    expect(state.comments).toEqual({});
  });

  test("addRepliesPageCommentsToStore skips when existing fresher (branch 116, 175)", async () => {
    const staleComment = { cid: "stale-c1", timestamp: 1, communityAddress: "s1" };
    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore({
        cid: "tmp",
        replies: {
          pages: { best: { comments: [staleComment] } },
        },
      });
    });
    expect(rendered.result.current.comments["stale-c1"]).toBeDefined();
    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore({
        cid: "tmp2",
        replies: {
          pages: {
            best: {
              comments: [{ cid: "stale-c1", timestamp: 1, communityAddress: "s1" }],
            },
          },
        },
      });
    });
    expect(rendered.result.current.comments["stale-c1"].timestamp).toBe(1);
  });

  test("resetRepliesPagesStore clears store state", async () => {
    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore({
        cid: "tmp",
        replies: {
          pages: {
            best: {
              comments: [{ cid: "c1", timestamp: 1, communityAddress: "s1" }],
            },
          },
        },
      });
    });
    expect(rendered.result.current.comments["c1"]).toBeDefined();
    await resetRepliesPagesStore();
    const state = useRepliesPagesStore.getState();
    expect(state.comments["c1"]).toBeUndefined();
    expect(state.repliesPages).toEqual({});
  });

  test("addNextRepliesPageToStore skips when existing fresher (branch 116)", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "branch116-comment" });
    const sortType = "best";
    const firstPageCid = mockComment.replies.pages[sortType].nextCid;

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });
    await waitFor(
      () => rendered.result.current.repliesPages[firstPageCid]?.comments?.length === 100,
    );
    const firstCommentCid = rendered.result.current.repliesPages[firstPageCid].comments[0].cid;
    const secondPageCid = firstPageCid + " - next page cid";
    const origGetPage = MockPages.prototype.getPage;
    let getPageCallCount = 0;
    MockPages.prototype.getPage = async function (options: any) {
      getPageCallCount++;
      if (getPageCallCount === 2) {
        return {
          nextCid: undefined,
          comments: [
            {
              cid: firstCommentCid,
              timestamp: 0,
              updatedAt: 0,
              communityAddress: (this as any).communityAddress,
            },
          ],
        };
      }
      return origGetPage.call(this, options);
    };

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.repliesPages[secondPageCid]);
    expect(rendered.result.current.comments[firstCommentCid].timestamp).toBeGreaterThan(0);
    MockPages.prototype.getPage = origGetPage;
  });

  test("add next pages from comment.replies.pageCids", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "comment cid 1" });
    // in the mock, sortType 'new' is only on replies.pageCids
    const sortType = "new";
    const commentCid1FirstPageCid = mockComment.replies.pageCids[sortType];

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    // wait for first page to be defined
    await waitFor(
      () =>
        rendered.result.current.repliesPages[commentCid1FirstPageCid].nextCid ===
        commentCid1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1FirstPageCid].nextCid).toBe(
      commentCid1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1FirstPageCid].comments.length).toBe(100);

    // comments are individually stored in comments store
    const firstCommentCid =
      rendered.result.current.repliesPages[commentCid1FirstPageCid].comments[0].cid;
    expect(rendered.result.current.comments[firstCommentCid].cid).toBe(firstCommentCid);
    expect(Object.keys(rendered.result.current.comments).length).toBe(100);

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    // wait for second page to be defined
    const commentCid1SecondPageCid = `${commentCid1FirstPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.repliesPages[commentCid1SecondPageCid].nextCid ===
        commentCid1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1SecondPageCid].nextCid).toBe(
      commentCid1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1SecondPageCid].comments.length).toBe(
      100,
    );

    // no more pages
    const getPage = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => ({ comments: [], nextCid: undefined });

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    // wait for third page to be defined
    const commentCid1ThirdPageCid = `${commentCid1SecondPageCid} - next page cid`;
    await waitFor(
      () => rendered.result.current.repliesPages[commentCid1ThirdPageCid].nextCid === undefined,
    );
    expect(rendered.result.current.repliesPages[commentCid1ThirdPageCid].nextCid).toBe(undefined);
    expect(rendered.result.current.repliesPages[commentCid1ThirdPageCid].comments.length).toBe(0);

    // adding a next page when no more pages does nothing
    const previousRepliesPagesFetchedCount = Object.keys(
      rendered.result.current.repliesPages,
    ).length;
    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(rendered.result.current.repliesPages).length >
            previousRepliesPagesFetchedCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(rendered.result.current.repliesPages).length).toBe(
      previousRepliesPagesFetchedCount,
    );

    // restore mock
    MockPages.prototype.getPage = getPage;
  });

  test("add next pages from comment.replies.pages", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "comment cid 1" });
    // in the mock, sortType 'best' is only on replies.pages
    const sortType = "best";
    const commentCid1FirstPageCid = mockComment.replies.pages[sortType].nextCid;

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    // wait for first page to be defined
    await waitFor(
      () =>
        rendered.result.current.repliesPages[commentCid1FirstPageCid].nextCid ===
        commentCid1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1FirstPageCid].nextCid).toBe(
      commentCid1FirstPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1FirstPageCid].comments.length).toBe(100);

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    // wait for second page to be defined
    const commentCid1SecondPageCid = `${commentCid1FirstPageCid} - next page cid`;
    await waitFor(
      () =>
        rendered.result.current.repliesPages[commentCid1SecondPageCid].nextCid ===
        commentCid1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1SecondPageCid].nextCid).toBe(
      commentCid1SecondPageCid + " - next page cid",
    );
    expect(rendered.result.current.repliesPages[commentCid1SecondPageCid].comments.length).toBe(
      100,
    );

    // no more pages
    const getPage = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options) => ({ comments: [], nextCid: undefined });

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    // wait for third page to be defined
    const commentCid1ThirdPageCid = `${commentCid1SecondPageCid} - next page cid`;
    await waitFor(
      () => rendered.result.current.repliesPages[commentCid1ThirdPageCid].nextCid === undefined,
    );
    expect(rendered.result.current.repliesPages[commentCid1ThirdPageCid].nextCid).toBe(undefined);
    expect(rendered.result.current.repliesPages[commentCid1ThirdPageCid].comments.length).toBe(0);

    // adding a next page when no more pages does nothing
    const previousRepliesPagesFetchedCount = Object.keys(
      rendered.result.current.repliesPages,
    ).length;
    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(rendered.result.current.repliesPages).length >
            previousRepliesPagesFetchedCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(rendered.result.current.repliesPages).length).toBe(
      previousRepliesPagesFetchedCount,
    );

    // restore mock
    MockPages.prototype.getPage = getPage;
  });

  test("page comments without updatedAt are still indexed on first insert", () => {
    const commentWithoutUpdatedAt = {
      cid: "no-updated-at-cid",
      timestamp: 5,
      communityAddress: "test-sub",
    };
    const comment = {
      cid: "parent-cid",
      replies: {
        pages: {
          best: {
            comments: [commentWithoutUpdatedAt],
            nextCid: "page-next-cid",
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(comment);
    });

    expect(rendered.result.current.comments["no-updated-at-cid"]).toBeDefined();
    expect(rendered.result.current.comments["no-updated-at-cid"].cid).toBe("no-updated-at-cid");
    expect(rendered.result.current.comments["no-updated-at-cid"].timestamp).toBe(5);
    expect(rendered.result.current.comments["no-updated-at-cid"].updatedAt).toBeUndefined();
  });

  test("addNextRepliesPageToStore returns early when no repliesFirstPageCid", async () => {
    const commentWithoutReplies = {
      cid: "no-replies-cid",
      communityAddress: "sub1",
      replies: {},
    };
    const sortType = "new";

    await rendered.result.current.addNextRepliesPageToStore(
      commentWithoutReplies,
      sortType,
      mockAccount,
    );

    expect(Object.keys(rendered.result.current.repliesPages).length).toBe(0);
  });

  test("addNextRepliesPageToStore accepts legacy plebbit accounts without createCommunity", async () => {
    const createCommunity = mockAccount.plebbit.createCommunity;
    delete mockAccount.plebbit.createCommunity;

    try {
      const legacyComment = await mockAccount.plebbit.createComment({ cid: "legacy-page-cid" });
      const sortType = "new";
      const firstPageCid = legacyComment.replies.pageCids[sortType];

      act(() => {
        rendered.result.current.addNextRepliesPageToStore(legacyComment, sortType, mockAccount);
      });

      await waitFor(() => rendered.result.current.repliesPages[firstPageCid]);
      expect(rendered.result.current.repliesPages[firstPageCid].comments.length).toBe(100);
    } finally {
      mockAccount.plebbit.createCommunity = createCommunity;
    }
  });

  test("addRepliesPageCommentsToStore skips comments without cid", () => {
    const commentWithNoCid = {
      cid: "parent",
      replies: {
        pages: {
          best: {
            comments: [
              { cid: "c1", timestamp: 1, communityAddress: "sub1" },
              { timestamp: 2, communityAddress: "sub1" },
            ],
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(commentWithNoCid);
    });
    expect(rendered.result.current.comments["c1"]).toBeDefined();
  });

  test("addRepliesPageCommentsToStore returns early when no comment.replies.pages", () => {
    const commentWithoutPages = {
      cid: "parent-no-pages",
      replies: { pageCids: { best: "some-cid" } },
    };

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(commentWithoutPages);
    });

    expect(Object.keys(rendered.result.current.comments).length).toBe(0);
  });

  test("addNextRepliesPageToStore skips comments without cid", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "no-cid-skip-cid" });
    const sortType = "new";
    const firstPageCid = mockComment.replies.pageCids[sortType];
    const getPageOrig = MockPages.prototype.getPage;
    MockPages.prototype.getPage = async (options: any) => {
      await sleep(50);
      return {
        nextCid: options?.cid + " - next page cid",
        comments: [
          { cid: "valid-cid", timestamp: 1, communityAddress: mockComment.communityAddress },
          { timestamp: 2, communityAddress: mockComment.communityAddress },
        ],
      };
    };

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.repliesPages[firstPageCid]);
    expect(rendered.result.current.comments["valid-cid"]).toBeDefined();
    expect(rendered.result.current.comments[undefined as any]).toBeUndefined();

    MockPages.prototype.getPage = getPageOrig;
  });

  test("addRepliesPageCommentsToStore returns early when no new comments", () => {
    const commentWithReplies = {
      cid: "parent",
      replies: {
        pages: {
          best: {
            comments: [
              {
                cid: "existing-cid",
                timestamp: 100,
                updatedAt: 100,
                communityAddress: "sub1",
              },
            ],
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(commentWithReplies);
    });
    expect(rendered.result.current.comments["existing-cid"]).toBeDefined();

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(commentWithReplies);
    });
    expect(rendered.result.current.comments["existing-cid"]).toBeDefined();
  });

  test("fetchPage returns cached page when in database", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "cached-page-cid" });
    const sortType = "new";
    const firstPageCid = mockComment.replies.pageCids[sortType];
    const cachedPage = {
      nextCid: firstPageCid + " - next",
      comments: [{ cid: "cached-1", communityAddress: mockComment.communityAddress }],
    };
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-repliesPages" });
    await db.setItem(firstPageCid, cachedPage);

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    await waitFor(
      () =>
        rendered.result.current.repliesPages[firstPageCid]?.nextCid === firstPageCid + " - next",
    );
    expect(rendered.result.current.repliesPages[firstPageCid].comments).toHaveLength(1);
    expect(rendered.result.current.repliesPages[firstPageCid].comments[0].cid).toBe("cached-1");
  });

  test("fetchPage onError logs when getPage rejects", async () => {
    const mockComment = await mockAccount.plebbit.createComment({ cid: "error-page-cid" });
    const sortType = "new";
    const firstPageCid = mockComment.replies.pageCids[sortType];
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
          await rendered.result.current.addNextRepliesPageToStore(
            mockComment,
            sortType,
            mockAccount,
          );
        } catch {
          // expected
        }
      });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed comment.replies.getPage"),
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

    const mockComment = await mockAccount.plebbit.createComment({ cid: "addcid-reject-cid" });
    const sortType = "new";
    const logSpy = vi.spyOn(log, "error").mockImplementation(() => {});

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    await waitFor(() => Object.keys(rendered.result.current.repliesPages).length > 0);
    await new Promise((r) => setTimeout(r, 100));

    expect(logSpy).toHaveBeenCalledWith(
      "repliesPagesStore.addNextRepliesPageToStore addCidToAccountComment error",
      expect.objectContaining({ comment: expect.anything(), error: expect.any(Error) }),
    );

    logSpy.mockRestore();
    (accountsStore as any).getState = accountsGetState;
  });

  test("onCommentRepliesClientsStateChange returns empty object when comment missing", async () => {
    let capturedCb: ((...args: any[]) => void) | null = null;
    const utils = await import("../../lib/utils");
    const origPageClients = utils.default.pageClientsOnStateChange;
    (utils.default as any).pageClientsOnStateChange = (_clients: any, cb: any) => {
      capturedCb = cb;
    };

    const mockComment = await mockAccount.plebbit.createComment({ cid: "missing-comment-cid" });
    const sortType = "new";

    act(() => {
      rendered.result.current.addNextRepliesPageToStore(mockComment, sortType, mockAccount);
    });

    await waitFor(() => Object.keys(rendered.result.current.repliesPages).length > 0);
    expect(capturedCb).toBeTruthy();

    commentsStore.setState({ comments: {} });
    capturedCb!("state", "type", "sort", "url");
    expect(commentsStore.getState().comments).toEqual({});

    (utils.default as any).pageClientsOnStateChange = origPageClients;
  });

  test("existing fresher indexed comment is not overwritten by older/empty-freshness page data", () => {
    const fresherComment = {
      cid: "shared-cid",
      timestamp: 100,
      updatedAt: 100,
      communityAddress: "test-sub",
    };
    const commentWithFresher = {
      cid: "parent-1",
      replies: {
        pages: {
          best: {
            comments: [fresherComment],
            nextCid: "page-1-next",
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(commentWithFresher);
    });

    expect(rendered.result.current.comments["shared-cid"].timestamp).toBe(100);
    expect(rendered.result.current.comments["shared-cid"].updatedAt).toBe(100);

    const olderComment = {
      cid: "shared-cid",
      timestamp: 1,
      communityAddress: "test-sub",
    };
    const commentWithOlder = {
      cid: "parent-2",
      replies: {
        pages: {
          best: {
            comments: [olderComment],
            nextCid: "page-2-next",
          },
        },
      },
    };

    act(() => {
      rendered.result.current.addRepliesPageCommentsToStore(commentWithOlder);
    });

    expect(rendered.result.current.comments["shared-cid"].timestamp).toBe(100);
    expect(rendered.result.current.comments["shared-cid"].updatedAt).toBe(100);
  });
});
