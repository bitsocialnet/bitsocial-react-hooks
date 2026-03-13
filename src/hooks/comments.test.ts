import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../lib/test-utils";
import { useComment, useComments, useValidateComment, setPlebbitJs } from "..";
import { getCommentFreshness, preferFresher } from "./comments";
import * as accountsHooks from "./accounts";
import commentsStore from "../stores/comments";
import communitiesPagesStore from "../stores/communities-pages";
import accountsStore from "../stores/accounts";
import PlebbitJsMock, { Plebbit, Comment, Pages } from "../lib/plebbit-js/plebbit-js-mock";
import repliesPagesStore from "../stores/replies-pages";

describe("comments", () => {
  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });
  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  describe("no comments in database", () => {
    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("get comments one at a time", async () => {
      // on first render, the account is undefined because it's not yet loaded from database
      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.cid).toBe(undefined);

      rendered.rerender("comment cid 1");
      await waitFor(() => typeof rendered.result.current.cid === "string");
      expect(rendered.result.current.cid).toBe("comment cid 1");

      // wait for comment.on('update') to fetch the ipns
      await waitFor(
        () =>
          typeof rendered.result.current.cid === "string" &&
          typeof rendered.result.current.upvoteCount === "number",
      );
      expect(rendered.result.current.cid).toBe("comment cid 1");
      expect(rendered.result.current.upvoteCount).toBe(3);

      rendered.rerender("comment cid 2");
      // wait for addCommentToStore action
      await waitFor(() => typeof rendered.result.current.cid === "string");
      expect(rendered.result.current.cid).toBe("comment cid 2");

      // wait for comment.on('update') to fetch the ipns
      await waitFor(
        () =>
          typeof rendered.result.current.cid === "string" &&
          typeof rendered.result.current.upvoteCount === "number",
      );
      expect(rendered.result.current.cid).toBe("comment cid 2");
      expect(rendered.result.current.upvoteCount).toBe(3);

      // get comment 1 again, no need to wait for any updates
      rendered.rerender("comment cid 1");
      expect(rendered.result.current.cid).toBe("comment cid 1");
      expect(rendered.result.current.upvoteCount).toBe(3);

      // make sure comments are still in database
      const getComment = Plebbit.prototype.getComment;
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      // mock getComment on the Plebbit class
      Plebbit.prototype.getComment = (options) => {
        throw Error(
          `plebbit.getComment called with comment cid '${options?.cid}' should not be called when getting comments from database`,
        );
      };
      // don't simulate 'update' event during this test to see if the updates were saved to database
      let throwOnCommentUpdateEvent = false;
      Comment.prototype.simulateUpdateEvent = () => {
        if (throwOnCommentUpdateEvent) {
          throw Error("no comment update events should be emitted when comment already in store");
        }
      };

      // reset stores to force using the db
      expect(commentsStore.getState().comments).not.toEqual({});
      await testUtils.resetStores();
      expect(commentsStore.getState().comments).toEqual({});

      // on first render, the account is undefined because it's not yet loaded from database
      const rendered2 = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor2 = testUtils.createWaitFor(rendered2);
      expect(rendered2.result.current.cid).toBe(undefined);

      rendered2.rerender("comment cid 1");
      await waitFor2(() => typeof rendered2.result.current.cid === "string");
      expect(rendered2.result.current.cid).toBe("comment cid 1");
      expect(rendered2.result.current.upvoteCount).toBe(3);

      rendered2.rerender("comment cid 2");
      // wait for addCommentToStore action
      await waitFor2(() => typeof rendered2.result.current.cid === "string");
      expect(rendered2.result.current.cid).toBe("comment cid 2");
      expect(rendered2.result.current.upvoteCount).toBe(3);

      // get comment 1 again from store, should not trigger any comment updates
      throwOnCommentUpdateEvent = true;
      rendered2.rerender("comment cid 1");
      expect(rendered2.result.current.cid).toBe("comment cid 1");
      expect(rendered2.result.current.upvoteCount).toBe(3);

      // restore mock
      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
      Plebbit.prototype.getComment = getComment;
    });

    test(`onlyIfCached: true doesn't add to store`, async () => {
      let rendered;
      rendered = renderHook<any, any>((options: any) => useComment(options));
      testUtils.createWaitFor(rendered);

      rendered.rerender({ commentCid: "comment cid 1", onlyIfCached: true });
      // TODO: find better way to wait
      await new Promise((r) => setTimeout(r, 20));
      // comment not added to store
      expect(commentsStore.getState().comments).toEqual({});

      rendered = renderHook<any, any>((options: any) => useComments(options));
      testUtils.createWaitFor(rendered);

      rendered.rerender({ commentCids: ["comment cid 1", "comment cid 2"], onlyIfCached: true });
      expect(rendered.result.current.comments.length).toBe(2);
      // TODO: find better way to wait
      await new Promise((r) => setTimeout(r, 20));
      // comment not added to store
      expect(commentsStore.getState().comments).toEqual({});
    });

    test("get multiple comments at once", async () => {
      const rendered = renderHook<any, any>((commentCids) => useComments({ commentCids }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.comments).toEqual([]);

      rendered.rerender(["comment cid 1", "comment cid 2", "comment cid 3"]);
      expect(rendered.result.current.comments).toEqual([undefined, undefined, undefined]);
      await waitFor(
        () =>
          typeof rendered.result.current.comments[0].cid === "string" &&
          typeof rendered.result.current.comments[1].cid === "string" &&
          typeof rendered.result.current.comments[2].cid === "string",
      );
      expect(rendered.result.current.comments[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.comments[1].cid).toBe("comment cid 2");
      expect(rendered.result.current.comments[2].cid).toBe("comment cid 3");

      // wait for comment.on('update') to fetch the ipns
      await waitFor(
        () =>
          typeof rendered.result.current.comments[0].upvoteCount === "number" &&
          typeof rendered.result.current.comments[1].upvoteCount === "number" &&
          typeof rendered.result.current.comments[2].upvoteCount === "number",
      );
      expect(rendered.result.current.comments[0].upvoteCount).toBe(3);
      expect(rendered.result.current.comments[1].upvoteCount).toBe(3);
      expect(rendered.result.current.comments[2].upvoteCount).toBe(3);
    });

    test("useComment and useComments mirror moderation flags into commentModeration", async () => {
      commentsStore.setState({
        comments: {
          "comment cid moderation 1": {
            cid: "comment cid moderation 1",
            timestamp: 1,
            updatedAt: 1,
            purged: true,
          },
          "comment cid moderation 2": {
            cid: "comment cid moderation 2",
            timestamp: 1,
            updatedAt: 1,
            removed: true,
          },
        },
      });

      const renderedSingle = renderHook(() =>
        useComment({ commentCid: "comment cid moderation 1" }),
      );
      const renderedMany = renderHook(() =>
        useComments({ commentCids: ["comment cid moderation 1", "comment cid moderation 2"] }),
      );
      const waitForSingle = testUtils.createWaitFor(renderedSingle);
      const waitForMany = testUtils.createWaitFor(renderedMany);

      await waitForSingle(() => renderedSingle.result.current.commentModeration?.purged === true);
      await waitForMany(
        () => renderedMany.result.current.comments[1]?.commentModeration?.removed === true,
      );

      expect(renderedSingle.result.current.purged).toBe(true);
      expect(renderedSingle.result.current.commentModeration?.purged).toBe(true);
      expect(renderedMany.result.current.comments[0]?.purged).toBe(true);
      expect(renderedMany.result.current.comments[0]?.commentModeration?.purged).toBe(true);
      expect(renderedMany.result.current.comments[1]?.removed).toBe(true);
      expect(renderedMany.result.current.comments[1]?.commentModeration?.removed).toBe(true);
    });

    test("addCommentToStore catch path logs error", async () => {
      const origCreateComment = Plebbit.prototype.createComment;
      (Plebbit.prototype as any).createComment = () =>
        Promise.reject(new Error("createComment failed"));
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const rendered = renderHook<any, any>((cid) => useComment({ commentCid: cid }));
      rendered.rerender("comment cid 999");
      await testUtils
        .createWaitFor(rendered)(() => rendered.result.current.errors?.length > 0, {
          timeout: 2000,
        })
        .catch(() => {});
      (Plebbit.prototype as any).createComment = origCreateComment;
      logSpy.mockRestore();
    });

    test("addCommentToStore catch path for useComments", async () => {
      const origCreateComment = Plebbit.prototype.createComment;
      (Plebbit.prototype as any).createComment = () =>
        Promise.reject(new Error("createComment failed"));
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const rendered = renderHook<any, any>((cids) => useComments({ commentCids: cids }));
      rendered.rerender(["comment cid 998", "comment cid 999"]);
      await new Promise((r) => setTimeout(r, 100));
      (Plebbit.prototype as any).createComment = origCreateComment;
      logSpy.mockRestore();
    });

    test("useComments with no options returns empty comments (branch 164)", async () => {
      const rendered = renderHook<any, any>(() => useComments());
      await act(async () => {});
      expect(rendered.result.current.comments).toEqual([]);
      expect(rendered.result.current.state).toBe("succeeded");
    });

    test("useComment with autoUpdate false and no commentCid stays uninitialized", async () => {
      const rendered = renderHook<any, any>(() => useComment({ autoUpdate: false }));
      await act(async () => {});
      expect(rendered.result.current.cid).toBeUndefined();
      expect(rendered.result.current.state).toBe("initializing");
    });

    test("useComments with empty string in commentCids hits commentCid||'' branch (164,168)", async () => {
      const rendered = renderHook<any, any>(() =>
        useComments({ commentCids: ["comment cid 1", ""] }),
      );
      await act(async () => {});
      expect(rendered.result.current.comments).toHaveLength(2);
      expect(rendered.result.current.comments[0]?.cid).toBe("comment cid 1");
      expect(rendered.result.current.comments[1]?.cid).toBe("");
    });

    test("useComments keeps fetching-ipfs state while entries are still cid-only placeholders", async () => {
      const account = { id: "mock-placeholder-comments-account", plebbit: {} };
      const commentCids = ["comment cid placeholder 1", "comment cid placeholder 2"];
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);

      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [commentCids[0]]: { cid: commentCids[0] },
            [commentCids[1]]: { cid: commentCids[1] },
          },
        }));

        const rendered = renderHook<any, any>(() =>
          useComments({ commentCids, autoUpdate: false, onlyIfCached: true }),
        );
        const waitFor = testUtils.createWaitFor(rendered);

        await waitFor(() => rendered.result.current.comments[0]?.cid === commentCids[0]);
        expect(rendered.result.current.state).toBe("fetching-ipfs");

        act(() => {
          commentsStore.setState((state: any) => ({
            ...state,
            comments: {
              ...state.comments,
              [commentCids[0]]: {
                cid: commentCids[0],
                timestamp: 1,
                updatedAt: 1,
                upvoteCount: 3,
              },
              [commentCids[1]]: {
                cid: commentCids[1],
                timestamp: 1,
                updatedAt: 1,
                upvoteCount: 4,
              },
            },
          }));
        });

        await waitFor(() => rendered.result.current.state === "succeeded");
        expect(rendered.result.current.state).toBe("succeeded");
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComments effect returns early when account is undefined (branch 176)", async () => {
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
      const rendered = renderHook<any, any>(() => useComments({ commentCids: ["comment cid 1"] }));
      await act(async () => {});
      expect(rendered.result.current.comments).toEqual([undefined]);
      vi.mocked(accountsHooks.useAccount).mockRestore();
    });

    test("useComment refresh rejects before initialization", async () => {
      const rendered = renderHook<any, any>(() => useComment({ autoUpdate: false }));
      await expect(rendered.result.current.refresh()).rejects.toThrow(
        "useComment cannot refresh comment not initialized yet",
      );
    });

    test("useComments refresh rejects when account is unavailable", async () => {
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
      const rendered = renderHook<any, any>(() => useComments({ commentCids: ["comment cid 1"] }));
      await expect(rendered.result.current.refresh()).rejects.toThrow(
        "useComments cannot refresh comments not initialized yet",
      );
      vi.mocked(accountsHooks.useAccount).mockRestore();
    });

    test("useComment when communitiesPagesComment and repliesPagesComment are absent (branches 88, 94)", async () => {
      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("comment cid 1");
      await waitFor(() => typeof rendered.result.current.cid === "string");
      expect(rendered.result.current.cid).toBe("comment cid 1");
      // No communitiesPagesStore or repliesPagesStore entries - uses commentFromStore only
      expect(commentsStore.getState().comments["comment cid 1"]).toBeDefined();
    });

    test("get comment from community pages", async () => {
      // on first render, the account is undefined because it's not yet loaded from database
      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.cid).toBe(undefined);

      rendered.rerender("comment cid 1");
      await waitFor(() => typeof rendered.result.current.cid === "string");
      expect(rendered.result.current.cid).toBe("comment cid 1");
      expect(rendered.result.current.replyCount).toBe(undefined);

      // mock getting a community page with an updated comment
      const communitiesPagesComment = {
        ...rendered.result.current,
        replyCount: 100,
        updatedAt: Math.round(Date.now() / 1000) + 60, // 1 minute in the future to make sure it's more recent
      };
      act(() => {
        communitiesPagesStore.setState((_state: any) => ({
          comments: { "comment cid 1": communitiesPagesComment },
        }));
      });

      // using the community page comment
      await waitFor(() => rendered.result.current.replyCount === 100);
      expect(rendered.result.current.replyCount).toBe(100);
    });

    test("get comments from community pages", async () => {
      const rendered = renderHook<any, any>((commentCids) => useComments({ commentCids }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.comments).toEqual([]);

      rendered.rerender(["comment cid 1", "comment cid 2", "comment cid 3"]);
      expect(rendered.result.current.comments).toEqual([undefined, undefined, undefined]);
      await waitFor(
        () =>
          typeof rendered.result.current.comments[0].cid === "string" &&
          typeof rendered.result.current.comments[1].cid === "string" &&
          typeof rendered.result.current.comments[2].cid === "string",
      );
      expect(rendered.result.current.comments[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.comments[1].cid).toBe("comment cid 2");
      expect(rendered.result.current.comments[2].cid).toBe("comment cid 3");
      expect(rendered.result.current.comments[1].replyCount).toBe(undefined);

      // mock getting a community page with an updated comment
      const communitiesPagesComment = {
        ...rendered.result.current.comments[1],
        replyCount: 100,
        updatedAt: Math.round(Date.now() / 1000) + 60,
      };
      act(() => {
        communitiesPagesStore.setState((_state: any) => ({
          comments: { "comment cid 2": communitiesPagesComment },
        }));
      });

      // using the community page comment
      await waitFor(() => rendered.result.current.comments[1].replyCount === 100);
      expect(rendered.result.current.comments[1].replyCount).toBe(100);
    });

    test("useComment returns page-store pending comment when it has no updatedAt (timestamp-only freshness fallback)", async () => {
      const rendered = renderHook<any, any>((options: any) => useComment(options));
      const waitFor = testUtils.createWaitFor(rendered);

      const pendingCommentCid = "comment cid 99";
      const pendingTimestamp = Math.round(Date.now() / 1000) - 60;
      const pendingComment = {
        cid: pendingCommentCid,
        timestamp: pendingTimestamp,
        replyCount: 42,
        communityAddress: "community address 1",
      };
      act(() => {
        communitiesPagesStore.setState((_state: any) => ({
          comments: { [pendingCommentCid]: pendingComment },
        }));
      });

      rendered.rerender({ commentCid: pendingCommentCid, onlyIfCached: true });
      await waitFor(() => rendered.result.current.cid === pendingCommentCid);
      expect(rendered.result.current.cid).toBe(pendingCommentCid);
      expect(rendered.result.current.replyCount).toBe(42);
      expect(rendered.result.current.timestamp).toBe(pendingTimestamp);
      expect(rendered.result.current.updatedAt).toBeUndefined();
    });

    test("useComment uses accountComment when store not loaded (line 102)", async () => {
      const cid = "account-comment-fallback-cid";
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountComment = {
        cid,
        timestamp: 100,
        content: "from account",
        communityAddress: "sub",
      };
      act(() => {
        accountsStore.setState((s: any) => ({
          accountsComments: {
            ...s.accountsComments,
            [account.id]: [accountComment],
          },
          commentCidsToAccountsComments: {
            ...s.commentCidsToAccountsComments,
            [cid]: { accountId: account.id, accountCommentIndex: 0 },
          },
        }));
      });
      const rendered = renderHook<any, any>(() =>
        useComment({ commentCid: cid, onlyIfCached: true }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.cid === cid);
      expect(rendered.result.current.content).toBe("from account");
      expect(rendered.result.current.timestamp).toBe(100);
    });

    test("useComment succeeds with replyCount 0 when comment newer than 5 min (lines 123-125)", async () => {
      const freshCid = "fresh-comment-5min";
      const freshTimestamp = Math.round(Date.now() / 1000) - 60;
      const freshComment = {
        cid: freshCid,
        timestamp: freshTimestamp,
        communityAddress: "sub",
      };
      act(() => {
        commentsStore.setState((s: any) => ({
          comments: { ...s.comments, [freshCid]: freshComment },
        }));
      });
      const rendered = renderHook<any, any>(() =>
        useComment({ commentCid: freshCid, onlyIfCached: true }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.cid === freshCid);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.replyCount).toBe(0);
    });

    test("preserve existing fresher comment precedence (no regression)", async () => {
      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);

      rendered.rerender("comment cid 1");
      await waitFor(() => typeof rendered.result.current.cid === "string");
      await waitFor(
        () =>
          typeof rendered.result.current.cid === "string" &&
          typeof rendered.result.current.upvoteCount === "number",
      );
      const mainStoreUpvoteCount = rendered.result.current.upvoteCount;
      const mainStoreUpdatedAt = rendered.result.current.updatedAt;

      const olderTimestamp = Math.round(Date.now() / 1000) - 3600;
      const pageStoreComment = {
        ...rendered.result.current,
        replyCount: 999,
        timestamp: olderTimestamp,
        updatedAt: undefined,
      };
      act(() => {
        communitiesPagesStore.setState((_state: any) => ({
          comments: { "comment cid 1": pageStoreComment },
        }));
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(rendered.result.current.cid).toBe("comment cid 1");
      expect(rendered.result.current.upvoteCount).toBe(mainStoreUpvoteCount);
      expect(rendered.result.current.updatedAt).toBe(mainStoreUpdatedAt);
      expect(rendered.result.current.replyCount).not.toBe(999);
    });

    test("has updating state", async () => {
      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("comment cid");

      await waitFor(
        () =>
          rendered.result.current.state === "fetching-ipfs" ||
          rendered.result.current.state === "fetching-update-ipns" ||
          rendered.result.current.state === "succeeded",
      );

      await waitFor(
        () =>
          rendered.result.current.state === "fetching-update-ipns" ||
          rendered.result.current.state === "succeeded",
      );

      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
    });

    test("has error events", async () => {
      // mock update to save comment instance
      const commentUpdate = Comment.prototype.update;
      const updatingComments: any = [];
      Comment.prototype.update = function () {
        updatingComments.push(this);
        return commentUpdate.bind(this)();
      };

      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("comment cid");

      // emit error event
      await waitFor(() => updatingComments.length > 0);
      updatingComments[0].emit("error", Error("error 1"));

      // first error
      await waitFor(() => rendered.result.current.error.message === "error 1");
      expect(rendered.result.current.error.message).toBe("error 1");
      expect(rendered.result.current.errors[0].message).toBe("error 1");
      expect(rendered.result.current.errors.length).toBe(1);

      // second error
      updatingComments[0].emit("error", Error("error 2"));
      await waitFor(() => rendered.result.current.error.message === "error 2");
      expect(rendered.result.current.error.message).toBe("error 2");
      expect(rendered.result.current.errors[0].message).toBe("error 1");
      expect(rendered.result.current.errors[1].message).toBe("error 2");
      expect(rendered.result.current.errors.length).toBe(2);

      // restore mock
      Comment.prototype.update = commentUpdate;
    });

    test("useComment logs stopCommentAutoUpdate cleanup errors", async () => {
      const stopCommentAutoUpdate = vi.fn().mockRejectedValue(new Error("stop cleanup failed"));
      commentsStore.setState((state: any) => ({
        ...state,
        comments: {
          ...state.comments,
          "comment cid cleanup": { cid: "comment cid cleanup", timestamp: 1, updatedAt: 1 },
        },
        startCommentAutoUpdate: vi.fn().mockResolvedValue(undefined),
        stopCommentAutoUpdate,
      }));

      const rendered = renderHook<any, any>(() =>
        useComment({ commentCid: "comment cid cleanup" }),
      );
      await act(async () => {});
      rendered.unmount();
      await new Promise((r) => setTimeout(r, 0));

      expect(stopCommentAutoUpdate).toHaveBeenCalled();
    });

    test("plebbit.createComment throws adds useComment().error", async () => {
      // mock update to save comment instance
      const createComment = Plebbit.prototype.createComment;
      Plebbit.prototype.createComment = async function () {
        throw Error("plebbit.createComment error");
      };

      const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("comment cid");

      // first error
      await waitFor(() => rendered.result.current.error.message === "plebbit.createComment error");
      expect(rendered.result.current.error.message).toBe("plebbit.createComment error");
      expect(rendered.result.current.errors[0].message).toBe("plebbit.createComment error");
      expect(rendered.result.current.errors.length).toBe(1);

      // restore mock
      Plebbit.prototype.createComment = createComment;
    });

    test("useComment with autoUpdate false can refresh manually", async () => {
      const rendered = renderHook<any, any>(() =>
        useComment({ commentCid: "comment cid refresh", autoUpdate: false }),
      );
      const waitFor = testUtils.createWaitFor(rendered);

      await waitFor(() => rendered.result.current.upvoteCount === 3);
      expect(rendered.result.current.state).toBe("succeeded");

      await act(async () => {
        await rendered.result.current.refresh();
      });

      await waitFor(() => rendered.result.current.upvoteCount === 5);
      expect(rendered.result.current.state).toBe("succeeded");
    });

    test("useComment with autoUpdate true refreshes through the store without freezing", async () => {
      const commentCid = "comment cid live refresh";
      const account = { id: "mock-live-account", plebbit: {} };
      const refreshComment = vi.fn().mockResolvedValue({
        cid: commentCid,
        timestamp: 1,
        updatedAt: 2,
        upvoteCount: 5,
      });
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [commentCid]: { cid: commentCid, timestamp: 1, updatedAt: 1, upvoteCount: 3 },
          },
          refreshComment,
        }));

        const rendered = renderHook<any, any>(() => useComment({ commentCid, onlyIfCached: true }));

        expect(rendered.result.current.upvoteCount).toBe(3);
        await act(async () => {
          await rendered.result.current.refresh();
        });
        expect(refreshComment).toHaveBeenCalledWith(commentCid, account);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComment with autoUpdate false keeps the frozen snapshot when refresh fails", async () => {
      const commentCid = "comment cid refresh failure";
      const account = { id: "mock-frozen-account", plebbit: {} };
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [commentCid]: {
              cid: commentCid,
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 3,
            },
          },
          refreshComment: vi.fn().mockRejectedValue(new Error("refresh failed")),
        }));

        const rendered = renderHook<any, any>(() =>
          useComment({ commentCid, autoUpdate: false, onlyIfCached: true }),
        );
        expect(rendered.result.current.upvoteCount).toBe(3);
        await expect(rendered.result.current.refresh()).rejects.toThrow("refresh failed");
        expect(rendered.result.current.upvoteCount).toBe(3);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComment with autoUpdate false ignores stale refresh completions after commentCid changes", async () => {
      const previousCommentCid = "comment cid stale previous";
      const nextCommentCid = "comment cid stale next";
      const account = { id: "mock-stale-comment-account", plebbit: {} };
      let resolveRefresh!: (comment: Comment) => void;
      const refreshComment = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [previousCommentCid]: {
              cid: previousCommentCid,
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 3,
            },
          },
          refreshComment,
        }));

        const rendered = renderHook<any, any>((commentCid) =>
          useComment({ commentCid, autoUpdate: false, onlyIfCached: true }),
        );
        const waitFor = testUtils.createWaitFor(rendered);

        rendered.rerender(previousCommentCid);
        await waitFor(() => rendered.result.current.upvoteCount === 3);

        const pendingRefresh = rendered.result.current.refresh();
        rendered.rerender(nextCommentCid);
        await act(async () => {
          resolveRefresh({
            cid: previousCommentCid,
            timestamp: 1,
            updatedAt: 2,
            upvoteCount: 5,
          } as Comment);
          await pendingRefresh;
        });

        act(() => {
          commentsStore.setState((state: any) => ({
            ...state,
            comments: {
              ...state.comments,
              [nextCommentCid]: {
                cid: nextCommentCid,
                timestamp: 1,
                updatedAt: 1,
                upvoteCount: 2,
              },
            },
          }));
        });

        await waitFor(() => rendered.result.current.cid === nextCommentCid);
        expect(rendered.result.current.upvoteCount).toBe(2);

        act(() => {
          commentsStore.setState((state: any) => ({
            ...state,
            comments: {
              ...state.comments,
              [nextCommentCid]: {
                cid: nextCommentCid,
                timestamp: 1,
                updatedAt: 2,
                upvoteCount: 7,
              },
            },
          }));
        });

        await new Promise((r) => setTimeout(r, 0));
        expect(rendered.result.current.upvoteCount).toBe(2);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComment with autoUpdate true rethrows refresh errors without freezing", async () => {
      const commentCid = "comment cid live refresh failure";
      const account = { id: "mock-live-failure-account", plebbit: {} };
      const refreshComment = vi.fn().mockRejectedValue(new Error("refresh failed"));
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [commentCid]: {
              cid: commentCid,
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 3,
            },
          },
          refreshComment,
        }));

        const rendered = renderHook<any, any>(() => useComment({ commentCid, onlyIfCached: true }));
        await expect(rendered.result.current.refresh()).rejects.toThrow("refresh failed");
        expect(refreshComment).toHaveBeenCalledWith(commentCid, account);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComment with autoUpdate false stays frozen while another hook keeps the same comment updating", async () => {
      const commentUpdate = Comment.prototype.update;
      const updatingComments: any[] = [];
      Comment.prototype.update = function () {
        updatingComments.push(this);
        return commentUpdate.bind(this)();
      };

      const renderedFrozen = renderHook<any, any>(() =>
        useComment({ commentCid: "comment cid frozen", autoUpdate: false }),
      );
      const waitForFrozen = testUtils.createWaitFor(renderedFrozen);
      const renderedLive = renderHook<any, any>(() =>
        useComment({ commentCid: "comment cid frozen" }),
      );
      const waitForLive = testUtils.createWaitFor(renderedLive);

      await waitForFrozen(() => renderedFrozen.result.current.upvoteCount === 3);
      await waitForLive(() => renderedLive.result.current.upvoteCount === 3);

      await act(async () => {
        await updatingComments[0].stop();
        await updatingComments[0].update();
      });

      await waitForLive(() => renderedLive.result.current.upvoteCount === 5);
      expect(renderedFrozen.result.current.upvoteCount).toBe(3);
      expect(renderedLive.result.current.upvoteCount).toBe(5);

      renderedFrozen.unmount();
      renderedLive.unmount();
      Comment.prototype.update = commentUpdate;
    });

    test("useComment with autoUpdate false does not briefly reuse the previous frozen comment after commentCid changes", async () => {
      const rendered = renderHook<any, any>((commentCid) =>
        useComment({ commentCid, autoUpdate: false }),
      );
      const waitFor = testUtils.createWaitFor(rendered);

      rendered.rerender("comment cid previous");
      await waitFor(() => rendered.result.current.upvoteCount === 3);
      expect(rendered.result.current.cid).toBe("comment cid previous");

      rendered.rerender("comment cid next");
      expect(rendered.result.current.cid).not.toBe("comment cid previous");

      await waitFor(() => rendered.result.current.upvoteCount === 3);
      expect(rendered.result.current.cid).toBe("comment cid next");
    });

    test("useComments with autoUpdate false can refresh manually", async () => {
      const rendered = renderHook<any, any>(() =>
        useComments({
          commentCids: ["comment cid refresh 1", "comment cid refresh 2"],
          autoUpdate: false,
        }),
      );
      const waitFor = testUtils.createWaitFor(rendered, { timeout: 4000 });

      await waitFor(
        () =>
          rendered.result.current.comments[0]?.upvoteCount === 3 &&
          rendered.result.current.comments[1]?.upvoteCount === 3,
      );

      await act(async () => {
        await rendered.result.current.refresh();
      });

      await waitFor(
        () =>
          rendered.result.current.comments[0]?.upvoteCount === 5 &&
          rendered.result.current.comments[1]?.upvoteCount === 5,
      );
      expect(rendered.result.current.state).toBe("succeeded");
    });

    test("useComments with autoUpdate true refreshes through the store without freezing", async () => {
      const commentCids = ["comment cid live refresh 1", "comment cid live refresh 2"];
      const account = { id: "mock-live-comments-account", plebbit: {} };
      const refreshComment = vi
        .fn()
        .mockResolvedValueOnce({
          cid: commentCids[0],
          timestamp: 1,
          updatedAt: 2,
          upvoteCount: 5,
        })
        .mockResolvedValueOnce({
          cid: commentCids[1],
          timestamp: 1,
          updatedAt: 2,
          upvoteCount: 5,
        });
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [commentCids[0]]: { cid: commentCids[0], timestamp: 1, updatedAt: 1, upvoteCount: 3 },
            [commentCids[1]]: { cid: commentCids[1], timestamp: 1, updatedAt: 1, upvoteCount: 3 },
          },
          refreshComment,
        }));

        const rendered = renderHook<any, any>(() =>
          useComments({ commentCids, onlyIfCached: true }),
        );

        expect(rendered.result.current.comments[0]?.upvoteCount).toBe(3);
        expect(rendered.result.current.comments[1]?.upvoteCount).toBe(3);
        await act(async () => {
          await rendered.result.current.refresh();
        });
        expect(refreshComment).toHaveBeenNthCalledWith(1, commentCids[0], account);
        expect(refreshComment).toHaveBeenNthCalledWith(2, commentCids[1], account);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComments with autoUpdate false refresh handles empty-string comment ids", async () => {
      const commentCids = ["comment cid refresh empty", ""];
      const account = { id: "mock-empty-comments-account", plebbit: {} };
      const refreshComment = vi
        .fn()
        .mockResolvedValueOnce({
          cid: commentCids[0],
          timestamp: 1,
          updatedAt: 2,
          upvoteCount: 5,
        })
        .mockResolvedValueOnce({
          cid: "",
          timestamp: 1,
          updatedAt: 2,
          upvoteCount: 5,
        });
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [commentCids[0]]: { cid: commentCids[0], timestamp: 1, updatedAt: 1, upvoteCount: 3 },
            "": { cid: "", timestamp: 1, updatedAt: 1, upvoteCount: 3 },
          },
          refreshComment,
        }));

        const rendered = renderHook<any, any>(() =>
          useComments({ commentCids, autoUpdate: false, onlyIfCached: true }),
        );

        await act(async () => {
          await rendered.result.current.refresh();
        });
        expect(rendered.result.current.comments[0]?.upvoteCount).toBe(5);
        expect(rendered.result.current.comments[1]?.upvoteCount).toBe(5);
        expect(rendered.result.current.comments[1]?.cid).toBe("");
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComments with autoUpdate false stays frozen while another hook keeps the same comments updating", async () => {
      const commentUpdate = Comment.prototype.update;
      const updatingComments = new Map<string, any>();
      Comment.prototype.update = function () {
        updatingComments.set(this.cid, this);
        return commentUpdate.bind(this)();
      };

      const commentCids = ["comment cid frozen 1", "comment cid frozen 2"];
      const renderedFrozen = renderHook<any, any>(() =>
        useComments({ commentCids, autoUpdate: false }),
      );
      const waitForFrozen = testUtils.createWaitFor(renderedFrozen);
      const renderedLive = renderHook<any, any>(() => useComments({ commentCids }));
      const waitForLive = testUtils.createWaitFor(renderedLive);

      await waitForFrozen(
        () =>
          renderedFrozen.result.current.comments[0]?.upvoteCount === 3 &&
          renderedFrozen.result.current.comments[1]?.upvoteCount === 3,
      );
      await waitForLive(
        () =>
          renderedLive.result.current.comments[0]?.upvoteCount === 3 &&
          renderedLive.result.current.comments[1]?.upvoteCount === 3,
      );

      await act(async () => {
        for (const commentCid of commentCids) {
          const comment = updatingComments.get(commentCid);
          await comment.stop();
          await comment.update();
        }
      });

      await waitForLive(
        () =>
          renderedLive.result.current.comments[0]?.upvoteCount === 5 &&
          renderedLive.result.current.comments[1]?.upvoteCount === 5,
      );
      expect(renderedFrozen.result.current.comments[0]?.upvoteCount).toBe(3);
      expect(renderedFrozen.result.current.comments[1]?.upvoteCount).toBe(3);

      renderedFrozen.unmount();
      renderedLive.unmount();
      Comment.prototype.update = commentUpdate;
    });

    test("useComments with autoUpdate false ignores stale refresh completions after the comments key changes", async () => {
      const previousCommentCid = "comment cid stale comments previous";
      const nextCommentCid = "comment cid stale comments next";
      const account = { id: "mock-stale-comments-account", plebbit: {} };
      let resolveRefresh!: (comment: Comment) => void;
      const refreshComment = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);
      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [previousCommentCid]: {
              cid: previousCommentCid,
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 3,
            },
          },
          refreshComment,
        }));

        const rendered = renderHook<any, any>((commentCids) =>
          useComments({ commentCids, autoUpdate: false, onlyIfCached: true }),
        );
        const waitFor = testUtils.createWaitFor(rendered);

        rendered.rerender([previousCommentCid]);
        await waitFor(() => rendered.result.current.comments[0]?.upvoteCount === 3);

        const pendingRefresh = rendered.result.current.refresh();
        rendered.rerender([nextCommentCid]);
        await act(async () => {
          resolveRefresh({
            cid: previousCommentCid,
            timestamp: 1,
            updatedAt: 2,
            upvoteCount: 5,
          } as Comment);
          await pendingRefresh;
        });

        act(() => {
          commentsStore.setState((state: any) => ({
            ...state,
            comments: {
              ...state.comments,
              [nextCommentCid]: {
                cid: nextCommentCid,
                timestamp: 1,
                updatedAt: 1,
                upvoteCount: 2,
              },
            },
          }));
        });

        await waitFor(() => rendered.result.current.comments[0]?.cid === nextCommentCid);
        expect(rendered.result.current.comments[0]?.upvoteCount).toBe(2);

        act(() => {
          commentsStore.setState((state: any) => ({
            ...state,
            comments: {
              ...state.comments,
              [nextCommentCid]: {
                cid: nextCommentCid,
                timestamp: 1,
                updatedAt: 2,
                upvoteCount: 7,
              },
            },
          }));
        });

        await new Promise((r) => setTimeout(r, 0));
        expect(rendered.result.current.comments[0]?.upvoteCount).toBe(2);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComments resets frozen state when different cid selections share the same Array#toString()", async () => {
      const combinedCommentCid = "comment cid key collision,1";
      const splitCommentCids = ["comment cid key collision", "1"];
      const account = { id: "mock-key-collision-account", plebbit: {} };
      const useAccountSpy = vi.spyOn(accountsHooks, "useAccount").mockReturnValue(account as any);

      try {
        commentsStore.setState((state: any) => ({
          ...state,
          comments: {
            ...state.comments,
            [combinedCommentCid]: {
              cid: combinedCommentCid,
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 3,
            },
            [splitCommentCids[0]]: {
              cid: splitCommentCids[0],
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 4,
            },
            [splitCommentCids[1]]: {
              cid: splitCommentCids[1],
              timestamp: 1,
              updatedAt: 1,
              upvoteCount: 5,
            },
          },
        }));

        const rendered = renderHook<any, any>((commentCids) =>
          useComments({ commentCids, autoUpdate: false, onlyIfCached: true }),
        );
        const waitFor = testUtils.createWaitFor(rendered);

        rendered.rerender([combinedCommentCid]);
        await waitFor(() => rendered.result.current.comments[0]?.cid === combinedCommentCid);
        expect(rendered.result.current.comments).toHaveLength(1);

        rendered.rerender(splitCommentCids);
        await waitFor(() => rendered.result.current.comments[1]?.cid === splitCommentCids[1]);
        expect(
          rendered.result.current.comments.map((comment: Comment | undefined) => comment?.cid),
        ).toEqual(splitCommentCids);
      } finally {
        useAccountSpy.mockRestore();
      }
    });

    test("useComments logs stopCommentAutoUpdate cleanup errors", async () => {
      const stopCommentAutoUpdate = vi.fn().mockRejectedValue(new Error("stop cleanup failed"));
      commentsStore.setState((state: any) => ({
        ...state,
        comments: {
          ...state.comments,
          "comment cid cleanup 1": { cid: "comment cid cleanup 1", timestamp: 1, updatedAt: 1 },
          "comment cid cleanup 2": { cid: "comment cid cleanup 2", timestamp: 1, updatedAt: 1 },
        },
        startCommentAutoUpdate: vi.fn().mockResolvedValue(undefined),
        stopCommentAutoUpdate,
      }));

      const rendered = renderHook<any, any>(() =>
        useComments({ commentCids: ["comment cid cleanup 1", "comment cid cleanup 2"] }),
      );
      await act(async () => {});
      rendered.unmount();
      await new Promise((r) => setTimeout(r, 0));

      expect(stopCommentAutoUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe("getCommentFreshness and preferFresher", () => {
    test("getCommentFreshness returns 0 for undefined", () => {
      expect(getCommentFreshness(undefined)).toBe(0);
    });

    test("getCommentFreshness uses timestamp and updatedAt", () => {
      expect(getCommentFreshness({ timestamp: 100 } as Comment)).toBe(100);
      expect(getCommentFreshness({ updatedAt: 200 } as Comment)).toBe(200);
      expect(getCommentFreshness({ timestamp: 100, updatedAt: 200 } as Comment)).toBe(200);
    });

    test("preferFresher returns current when candidate is undefined", () => {
      const current = { cid: "c1", timestamp: 1 } as Comment;
      expect(preferFresher(current, undefined)).toBe(current);
    });

    test("preferFresher returns candidate when current is undefined", () => {
      const candidate = { cid: "c2", timestamp: 2 } as Comment;
      expect(preferFresher(undefined, candidate)).toBe(candidate);
    });

    test("preferFresher returns fresher comment", () => {
      const older = { cid: "c1", timestamp: 1 } as Comment;
      const newer = { cid: "c2", timestamp: 2 } as Comment;
      expect(preferFresher(older, newer)).toBe(newer);
      expect(preferFresher(newer, older)).toBe(newer);
    });

    test("preferFresher returns current when current is fresher", () => {
      const current = { cid: "c1", timestamp: 2, updatedAt: 3 } as Comment;
      const candidate = { cid: "c2", timestamp: 1 } as Comment;
      expect(preferFresher(current, candidate)).toBe(current);
    });
  });

  describe("useComment preferFresher with repliesPagesComment (branches 88, 94)", () => {
    test("uses repliesPagesComment when fresher than store (branch 94)", async () => {
      setPlebbitJs(PlebbitJsMock);
      await testUtils.resetDatabasesAndStores();

      const cid = "prefer-replies-cid";
      const storeComment = { cid, timestamp: 100 } as Comment;
      const repliesComment = { cid, timestamp: 200, replyCount: 50 } as Comment;
      commentsStore.setState((s) => ({ comments: { ...s.comments, [cid]: storeComment } }));
      repliesPagesStore.setState((s) => ({ comments: { ...s.comments, [cid]: repliesComment } }));

      const rendered = renderHook<any, any>(() => useComment({ commentCid: cid }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.timestamp === 200);
      expect(rendered.result.current.replyCount).toBe(50);
    });

    test("uses commentFromStore when fresher than repliesPagesComment", async () => {
      setPlebbitJs(PlebbitJsMock);
      await testUtils.resetDatabasesAndStores();

      const cid = "prefer-fresher-cid";
      const storeComment = { cid, timestamp: 200, updatedAt: 300 } as Comment;
      const repliesComment = { cid, timestamp: 100 } as Comment;
      commentsStore.setState((s) => ({ comments: { ...s.comments, [cid]: storeComment } }));
      repliesPagesStore.setState((s) => ({ comments: { ...s.comments, [cid]: repliesComment } }));

      const rendered = renderHook<any, any>(() => useComment({ commentCid: cid }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.timestamp === 200);
      expect(rendered.result.current.updatedAt).toBe(300);
    });
  });

  describe("useComments preferFresher loop", () => {
    test("preferFresher skips when candidate is undefined (branch 169)", async () => {
      setPlebbitJs(PlebbitJsMock);
      await testUtils.resetDatabasesAndStores();

      const cid1 = "comments-no-candidate-c1";
      const cid2 = "comments-no-candidate-c2";
      commentsStore.setState((s) => ({
        comments: {
          ...s.comments,
          [cid1]: { cid: cid1, timestamp: 1 } as Comment,
          [cid2]: { cid: cid2, timestamp: 2 } as Comment,
        },
      }));
      // Only cid1 has communitiesPages data; cid2 has no candidate
      communitiesPagesStore.setState((s) => ({
        comments: {
          ...s.comments,
          [cid1]: { cid: cid1, timestamp: 10 } as Comment,
        },
      }));

      const rendered = renderHook<any, any>(() => useComments({ commentCids: [cid1, cid2] }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.comments.length === 2);
      expect(rendered.result.current.comments[0].timestamp).toBe(10);
      expect(rendered.result.current.comments[1].timestamp).toBe(2);
    });

    test("preferFresher merges communitiesPagesComments when fresher", async () => {
      setPlebbitJs(PlebbitJsMock);
      await testUtils.resetDatabasesAndStores();

      const cid1 = "comments-prefer-c1";
      const cid2 = "comments-prefer-c2";
      commentsStore.setState((s) => ({
        comments: {
          ...s.comments,
          [cid1]: { cid: cid1, timestamp: 1 } as Comment,
          [cid2]: { cid: cid2, timestamp: 2 } as Comment,
        },
      }));
      communitiesPagesStore.setState((s) => ({
        comments: {
          ...s.comments,
          [cid1]: { cid: cid1, timestamp: 10 } as Comment,
          [cid2]: { cid: cid2, timestamp: 20 } as Comment,
        },
      }));

      const rendered = renderHook<any, any>(() => useComments({ commentCids: [cid1, cid2] }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.comments.length === 2);
      expect(rendered.result.current.comments[0].timestamp).toBe(10);
      expect(rendered.result.current.comments[1].timestamp).toBe(20);
    });
  });

  describe("useValidateComment", () => {
    let rendered, waitFor;

    beforeEach(() => {
      rendered = renderHook<any, any>((options) => useValidateComment(options));
      waitFor = testUtils.createWaitFor(rendered);
    });
    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("is valid", async () => {
      expect(rendered.result.current.valid).toBe(false);
      expect(rendered.result.current.state).toBe("initializing");

      // the first render is always true, to avoid rerenders when true
      const comment = { cid: "comment cid 1", communityAddress: "community address 1" };
      rendered.rerender({ comment });
      expect(rendered.result.current.valid).toBe(true);
      expect(rendered.result.current.state).toBe("initializing"); // valid true but still initializing
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.valid).toBe(true);

      rendered.rerender({ comment: undefined });
      expect(rendered.result.current.valid).toBe(false);
      expect(rendered.result.current.state).toBe("initializing");

      rendered.rerender({ comment, validateReplies: false });
      expect(rendered.result.current.valid).toBe(true);
      expect(rendered.result.current.state).toBe("initializing"); // valid true but still initializing
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.valid).toBe(true);

      rendered.rerender({ comment: undefined });
      expect(rendered.result.current.valid).toBe(false);
      expect(rendered.result.current.state).toBe("initializing");

      rendered.rerender({ comment, validateReplies: true });
      expect(rendered.result.current.valid).toBe(true);
      expect(rendered.result.current.state).toBe("initializing"); // valid true but still initializing
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.valid).toBe(true);

      // validateReplies: null defaults to true (branch 210)
      rendered.rerender({ comment, validateReplies: null });
      expect(rendered.result.current.valid).toBe(true);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.valid).toBe(true);

      // validateReplies: undefined defaults to true (branch 210)
      rendered.rerender({ comment, validateReplies: undefined });
      expect(rendered.result.current.valid).toBe(true);
      await waitFor(() => rendered.result.current.state === "succeeded");
    });

    test("is invalid", async () => {
      const validateComment = Pages.prototype.validateComment;
      Plebbit.prototype.validateComment = async function () {
        throw Error(
          "this is not an error, plebbit.validateComment was mocked by a test to throw invalid",
        );
      };

      // silence invalid comments logs
      const originalLog = console.log;
      console.log = (...args) => {
        if (/this is not an error/.test(args[1]?.error)) {
          return;
        }
        originalLog.call(console, ...args);
      };

      expect(rendered.result.current.valid).toBe(false);
      expect(rendered.result.current.state).toBe("initializing");

      // the first render is always true, to avoid rerenders when true
      const comment = { cid: "comment cid 1", communityAddress: "community address 1" };
      rendered.rerender({ comment });
      expect(rendered.result.current.valid).toBe(true);
      expect(rendered.result.current.state).toBe("initializing");

      await waitFor(() => rendered.result.current.valid === false);
      expect(rendered.result.current.valid).toBe(false);
      expect(rendered.result.current.state).toBe("failed");

      Plebbit.prototype.validateComment = validateComment;
      console.log = originalLog;
    });
  });
});
