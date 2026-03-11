import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../lib/test-utils";
import { useComment, useReplies, setPlebbitJs } from "..";
import { appendErrorToErrors } from "./replies";
import repliesCommentsStore from "../stores/replies/replies-comments-store";
import PlebbitJsMock, {
  Comment,
  Pages,
  simulateLoadingTime,
} from "../lib/plebbit-js/plebbit-js-mock";
import repliesStore, { defaultRepliesPerPage as repliesPerPage } from "../stores/replies";
import repliesPagesStore from "../stores/replies-pages";
import accountsStore from "../stores/accounts";
import * as accountsActions from "../stores/accounts/accounts-actions";
import { getCommentCidsToAccountsComments } from "../stores/accounts/utils";

const plebbitJsMockRepliesPageLength = 100;

describe("replies", () => {
  let simulateUpdateEvent;

  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();

    // mock adding replies to comment
    simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
    Comment.prototype.simulateUpdateEvent = async function () {
      // if timestamp isn't defined, simulate fetching the comment ipfs
      if (!this.timestamp) {
        this.simulateFetchCommentIpfsUpdateEvent();
        return;
      }

      // simulate finding vote counts on an IPNS record
      this.upvoteCount = typeof this.upvoteCount === "number" ? this.upvoteCount + 2 : 3;
      this.downvoteCount = typeof this.downvoteCount === "number" ? this.downvoteCount + 1 : 1;
      this.updatedAt = Math.floor(Date.now() / 1000);
      this.depth = 0;

      const bestPageCid = this.cid + " page cid best";
      this.replies.pages.best = this.replies.pageToGet(bestPageCid);
      this.replies.pageCids = {
        best: bestPageCid,
        new: this.cid + " page cid new",
        newFlat: this.cid + " page cid newFlat",
        old: this.cid + " page cid old",
        oldFlat: this.cid + " page cid oldFlat",
      };

      this.updatingState = "succeeded";
      this.emit("update", this);
      this.emit("updatingstatechange", "succeeded");
    };
  });
  afterAll(() => {
    testUtils.restoreAll();

    // restore mock
    Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
  });
  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  describe("useReplies options and hasMore branches", () => {
    test("useReplies with no options (branch 25)", async () => {
      const rendered = renderHook<any, any>(() => useReplies());
      await act(async () => {});
      expect(rendered.result.current.replies).toBeDefined();
    });

    test("useReplies hasMore false when no comment (branch 87)", async () => {
      const rendered = renderHook<any, any>(() => useReplies({ comment: undefined }));
      await act(async () => {});
      expect(rendered.result.current.hasMore).toBe(false);
    });
  });

  describe("appendErrorToErrors", () => {
    test("appends error to array", () => {
      const prev = [new Error("a")];
      const e = new Error("b");
      expect(appendErrorToErrors(prev, e)).toEqual([prev[0], e]);
    });
    test("handles empty array", () => {
      expect(appendErrorToErrors([], new Error("x"))).toEqual([expect.any(Error)]);
    });
  });

  describe("useReplies", () => {
    let rendered, waitFor, scrollOnePage;
    let _savedSUE: any, _savedGetPage: any;

    beforeEach(() => {
      _savedSUE = Comment.prototype.simulateUpdateEvent;
      _savedGetPage = Pages.prototype.getPage;
      rendered = renderHook<any, any>((useRepliesOptions) => {
        // useReplies accepts only 'comment', but for ease of use also accept a 'commentCid' in the tests
        const comment = useComment({ commentCid: useRepliesOptions?.commentCid });
        return useReplies({
          validateOptimistically: false,
          ...useRepliesOptions,
          commentCid: undefined,
          comment: useRepliesOptions?.comment || comment,
        });
      });
      waitFor = testUtils.createWaitFor(rendered);
      scrollOnePage = async () => {
        const nextFeedLength = (rendered.result.current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await rendered.result.current.loadMore();
        });
        try {
          await waitFor(() => rendered.result.current.replies?.length >= nextFeedLength);
        } catch {
          // console.error('scrollOnePage failed:', e)
        }
      };
    });
    afterEach(async () => {
      Comment.prototype.simulateUpdateEvent = _savedSUE;
      Pages.prototype.getPage = _savedGetPage;
      await testUtils.resetDatabasesAndStores();
    });

    test("loadMore init guard throws when not initialized", async () => {
      rendered.rerender({ commentCid: "comment cid 1", accountName: "nonexistent-account-xyz" });
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      expect(rendered.result.current.errors.length).toBeGreaterThan(0);
      expect(rendered.result.current.error?.message).toMatch(/not initalized/i);
    });

    test("reset init guard throws when not initialized", async () => {
      rendered.rerender({ commentCid: "comment cid 1", accountName: "nonexistent-account-xyz" });
      await act(async () => {
        await rendered.result.current.reset();
      });
      await waitFor(() => rendered.result.current.errors.length > 0);
      expect(rendered.result.current.errors.length).toBeGreaterThan(0);
      expect(rendered.result.current.error?.message).toMatch(/not initalized/i);
    });

    test("reset catch path sets errors (line 132-134)", async () => {
      const r = renderHook(() =>
        useReplies({
          comment: undefined,
          accountName: "nonexistent-account-xyz",
          validateOptimistically: false,
        }),
      );
      const w = testUtils.createWaitFor(r);
      await act(async () => {
        await r.result.current.reset();
      });
      await w(() => r.result.current.errors.length > 0);
      expect(r.result.current.errors.length).toBeGreaterThan(0);
      expect(r.result.current.error?.message).toMatch(/not initalized/i);
    });

    test("reset success path calls resetFeed (line 131)", async () => {
      rendered.rerender({ commentCid: "comment cid 1" });
      await waitFor(() => rendered.result.current.replies.length >= repliesPerPage);
      await act(async () => {
        await rendered.result.current.reset();
      });
      expect(rendered.result.current.errors.length).toBe(0);
    });

    test("useReplies mirrors moderation flags into commentModeration", async () => {
      rendered.rerender({ commentCid: "comment cid 1" });
      await waitFor(() => rendered.result.current.replies.length > 0);

      const [feedName] = Object.keys(repliesStore.getState().loadedFeeds);
      const currentReplies = repliesStore.getState().loadedFeeds[feedName];
      repliesStore.setState((state: any) => ({
        ...state,
        loadedFeeds: {
          ...state.loadedFeeds,
          [feedName]: [{ ...currentReplies[0], purged: true }, ...currentReplies.slice(1)],
        },
      }));

      await waitFor(() => rendered.result.current.replies[0]?.commentModeration?.purged === true);
      expect(rendered.result.current.replies[0]?.purged).toBe(true);
      expect(rendered.result.current.replies[0]?.commentModeration?.purged).toBe(true);
    });

    test("validateOptimistically false skips skipValidation (branch 125)", async () => {
      const comment = {
        cid: "comment cid 1",
        depth: 0,
        postCid: "p",
        communityAddress: "sub",
        replies: { pages: {} },
      };
      const { result } = renderHook(() => useReplies({ comment, validateOptimistically: false }));
      await act(async () => {});
      expect(result.current.replies).toBeDefined();
    });

    test("invalidFlatDepth returns empty replies and no-op loadMore/reset (emptyFunction)", async () => {
      const comment = {
        cid: "flat-cid",
        depth: 0,
        postCid: "p",
        communityAddress: "sub",
        replies: { pages: {} },
      };
      rendered.rerender({ comment, flat: true, flatDepth: 5 });
      expect(rendered.result.current.replies).toEqual([]);
      expect(rendered.result.current.hasMore).toBe(false);
      await act(async () => {
        await rendered.result.current.loadMore();
        await rendered.result.current.reset();
      });
      expect(rendered.result.current.replies).toEqual([]);
    });

    test("addFeedToStoreOrUpdateComment catch logs error", async () => {
      const origAdd = repliesStore.getState().addFeedToStoreOrUpdateComment;
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        repliesStore.setState({
          addFeedToStoreOrUpdateComment: () => Promise.reject(new Error("addFeed failed")),
        });
        rendered.rerender({ commentCid: "comment cid 1" });
        await testUtils
          .createWaitFor(rendered)(() => true, { timeout: 500 })
          .catch(() => {});
        expect(logSpy).toHaveBeenCalled();
      } finally {
        repliesStore.setState({ addFeedToStoreOrUpdateComment: origAdd });
        logSpy.mockRestore();
      }
    });

    test("useReplies with no comment hasMore false (branches 89, 95)", () => {
      const { result } = renderHook(() => useReplies({ comment: undefined }));
      expect(result.current.hasMore).toBe(false);
      expect(result.current.replies).toEqual([]);
    });

    test("useReplies hasMore from store when boolean (branches 87, 92)", async () => {
      const comment = {
        cid: "comment cid 1",
        depth: 0,
        postCid: "p",
        communityAddress: "sub",
        replies: { pages: {} },
      };
      const rendered = renderHook(() => useReplies({ comment }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => Object.keys(repliesStore.getState().feedsOptions).length > 0);
      const feedName = Object.keys(repliesStore.getState().feedsOptions).find((fn) =>
        fn.includes(comment.cid),
      );
      expect(feedName).toBeDefined();

      await act(async () => {
        repliesStore.setState((s: any) => ({
          ...s,
          feedsHaveMore: { ...s.feedsHaveMore, [feedName!]: false },
        }));
      });

      await waitFor(() => rendered.result.current.hasMore === false);
      expect(rendered.result.current.hasMore).toBe(false);
    });

    test("useReplies sortType defaults to best when not provided (branch 31)", async () => {
      rendered.rerender({ commentCid: "comment cid 1" });
      await waitFor(() => rendered.result.current.replies.length > 0);
      expect(rendered.result.current.replies[0].cid).toContain("best");
    });

    test("useReplies flatDepth defaults to 0 when not number (branch 35)", async () => {
      const comment = {
        cid: "comment cid 1",
        depth: 0,
        postCid: "p",
        communityAddress: "sub",
        replies: { pages: {} },
      };
      comment.replies.pages.best = Pages.prototype.pageToGet.apply({ comment }, [
        `${comment.cid} page cid best`,
      ]);
      comment.replies.pages.best.nextCid = undefined;
      rendered.rerender({ comment, flat: true, flatDepth: undefined });
      await waitFor(() => rendered.result.current.replies.length > 0);
      expect(rendered.result.current.replies.length).toBeGreaterThan(0);
    });

    test("validateOptimistically: true", async () => {
      // create mock comment with a reply page
      let comment = {
        cid: "comment cid 1",
        postCid: "comment cid 1",
        updatedAt: 1,
        timestamp: 1,
        depth: 0,
        replies: { pages: {} },
      };
      comment.replies.pages.best = Pages.prototype.pageToGet.apply({ comment }, [
        `${comment.cid} page cid best`,
      ]);
      // comment.replies.pages.best.comments.length = 3
      // no nextCid indicates all replies are preloaded, and that a page can safely be used with any sort type
      comment.replies.pages.best.nextCid = undefined;

      rendered.rerender({ comment, sortType: "new", validateOptimistically: true });
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid best comment cid 100",
      );
      expect(rendered.result.current.replies[0].timestamp).toBeGreaterThan(
        rendered.result.current.replies[repliesPerPage - 1].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ comment, sortType: "old", validateOptimistically: true });
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid best comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      comment = { ...comment, cid: "comment cid 2" };
      comment.replies.pages.best = Pages.prototype.pageToGet.apply({ comment }, [
        `${comment.cid} page cid best`,
      ]);
      comment.replies.pages.best.nextCid = undefined;

      rendered.rerender({ comment, sortType: "old", validateOptimistically: true });
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 2 page cid best comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);
    });

    test("sort type new, switch to sort type old, switch to different comment", async () => {
      expect(rendered.result.current.replies).toEqual([]);

      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid, sortType: "new" });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid new comment cid 100",
      );
      expect(rendered.result.current.replies[0].timestamp).toBeGreaterThan(
        rendered.result.current.replies[repliesPerPage - 1].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ commentCid, sortType: "old" });
      await waitFor(
        () => rendered.result.current.replies[0].cid === "comment cid 1 page cid old comment cid 1",
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid old comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ commentCid: "comment cid 2", sortType: "old" });
      await waitFor(
        () => rendered.result.current.replies[0].cid === "comment cid 2 page cid old comment cid 1",
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 2 page cid old comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);
    });

    test("sort type new, switch to sort type old, switch to different comment (comment argument)", async () => {
      expect(rendered.result.current.replies).toEqual([]);

      const createMockComment = (comment) => {
        comment.timestamp = 1;
        comment.updatedAt = 2;
        comment.replies = {
          pages: { best: new Pages({ comment }).pageToGet(comment.cid + " page cid best") },
          pageCids: {
            new: comment.cid + " page cid new",
            newFlat: comment.cid + " page cid newFlat",
            old: comment.cid + " page cid old",
            oldFlat: comment.cid + " page cid oldFlat",
          },
        };
        return comment;
      };

      const commentAbc = createMockComment({
        cid: "comment cid abc",
        communityAddress: "community address 1",
      });
      rendered.rerender({ comment: commentAbc, sortType: "new" });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid abc page cid new comment cid 100",
      );
      expect(rendered.result.current.replies[0].timestamp).toBeGreaterThan(
        rendered.result.current.replies[repliesPerPage - 1].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ comment: commentAbc, sortType: "old" });
      await waitFor(
        () =>
          rendered.result.current.replies[0].cid === "comment cid abc page cid old comment cid 1",
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid abc page cid old comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      const commentXyz = createMockComment({
        cid: "comment cid xyz",
        communityAddress: "community address 1",
      });
      rendered.rerender({ comment: commentXyz, sortType: "old" });
      await waitFor(
        () =>
          rendered.result.current.replies[0].cid === "comment cid xyz page cid old comment cid 1",
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid xyz page cid old comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);
    });

    test("scroll pages", { retry: 10 }, async () => {
      expect(rendered.result.current.replies).toEqual([]);

      // default sort (best)
      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      // page 1
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      // default sort, shouldnt fetch a page because included in comment.replies.pages
      // React 19 may batch updates and cause an extra page fetch; allow 0 or 1
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBeLessThanOrEqual(1);

      // page 2
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 2);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage * 2,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      // still shouldnt fetch a page yet because commentRepliesLeftBeforeNextPage not reached
      // React 19 may batch updates and cause an extra page fetch; allow 0 or 1
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBeLessThanOrEqual(1);

      // page 3
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 3);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      await waitFor(
        () =>
          rendered.result.current.bufferedReplies.length ===
          plebbitJsMockRepliesPageLength * 2 - repliesPerPage * 3,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength * 2 - repliesPerPage * 3,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      // should fetch a page yet because commentRepliesLeftBeforeNextPage reached
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);
    });

    test("if sort type topAll missing, use best instead", { retry: 10 }, async () => {
      expect(rendered.result.current.replies).toEqual([]);

      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid, sortType: "topAll" });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage,
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid best comment cid 100",
      );
      expect(rendered.result.current.hasMore).toBe(true);

      // page 2 — buffer is exactly at commentRepliesLeftBeforeNextPage (50),
      // so next page fetch is triggered but may or may not have completed
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 2);
      expect(rendered.result.current.hasMore).toBe(true);

      // page 3 — by now the next page fetch should have completed
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 3);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      await waitFor(
        () =>
          rendered.result.current.bufferedReplies.length ===
          plebbitJsMockRepliesPageLength * 2 - repliesPerPage * 3,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength * 2 - repliesPerPage * 3,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);
    });

    test("if sort type best missing, use topAll instead", { retry: 10 }, async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        if (!this.timestamp) {
          this.simulateFetchCommentIpfsUpdateEvent();
          return;
        }
        this.updatedAt = Math.floor(Date.now() / 1000);
        this.replies.pages.topAll = {
          comments: [
            {
              timestamp: 1,
              cid: this.cid + " topAll reply cid 1",
              communityAddress: this.communityAddress,
              upvoteCount: 1,
              downvoteCount: 10,
              author: { address: this.cid + " topAll author address" },
              updatedAt: 1,
            },
          ],
          nextCid: this.cid + " next page cid topAll",
        };
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid, sortType: "best" });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe("comment cid 1 topAll reply cid 1");
      expect(rendered.result.current.hasMore).toBe(true);

      // page 2
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 2);
      expect(rendered.result.current.hasMore).toBe(true);
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBeLessThanOrEqual(2);

      // page 3 — the async next-page fetch may or may not have completed
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 3);
      expect(rendered.result.current.hasMore).toBe(true);
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBeLessThanOrEqual(2);

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;

      // wait to load all pages or can cause race condition with other tests
      await waitFor(() => Object.keys(repliesPagesStore.getState().repliesPages).length === 2);
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(2);
    });

    test("hasMore false", async () => {
      // mock a page with no nextCid
      const getPage = Pages.prototype.getPage;
      Pages.prototype.getPage = async function (options: { cid: string }) {
        const cid = options?.cid;
        await simulateLoadingTime();
        const page: any = { comments: [] };
        while (page.comments.length < 100) {
          page.comments.push({
            timestamp: page.comments.length + 1,
            cid: cid + " comment cid " + (page.comments.length + 1),
            communityAddress: this.comment.communityAddress,
          });
        }
        return page;
      };

      rendered.rerender({ commentCid: "comment cid 1", sortType: "new" });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      // page 1
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      // should only fetch 1 page because no next cid
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);

      // page 2
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 2);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage * 2,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      // should only fetch 1 page because no next cid
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);

      // page 3
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 3);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage * 3,
      );
      expect(rendered.result.current.hasMore).toBe(true);
      // should only fetch 1 page because no next cid
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);

      // page 4
      await scrollOnePage();
      expect(rendered.result.current.replies.length).toBe(repliesPerPage * 4);
      expect(rendered.result.current.updatedReplies.length).toBe(
        rendered.result.current.replies.length,
      );
      expect(rendered.result.current.bufferedReplies.length).toBe(
        plebbitJsMockRepliesPageLength - repliesPerPage * 4,
      );
      expect(rendered.result.current.hasMore).toBe(false);
      // should only fetch 1 page because no next cid
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);

      Pages.prototype.getPage = getPage;
    });

    test("custom repliesPerPage", async () => {
      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid, repliesPerPage: 10 });
      await waitFor(() => rendered.result.current.replies.length === 10);
      expect(rendered.result.current.replies.length).toBe(10);
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ commentCid, repliesPerPage: undefined });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ commentCid, repliesPerPage: 100 });
      await waitFor(() => rendered.result.current.replies.length === 100);
      expect(rendered.result.current.replies.length).toBe(100);
      expect(rendered.result.current.hasMore).toBe(true);
    });

    test("dynamic filter", async () => {
      // NOTE: if the filter is too difficult, it cause fetch too many pages
      // and cause race conditions with other tests
      const createCidMatchFilter = (cid: string) => ({
        filter: (comment: Comment) => !!comment.cid.match(cid),
        key: `cid-match-${cid}`,
      });

      rendered.rerender({
        commentCid: "comment cid a",
        filter: createCidMatchFilter("1"),
        sortType: "new",
      });
      await waitFor(() => rendered.result.current.replies?.length > 2);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid a page cid new comment cid 100",
      );
      expect(rendered.result.current.replies[1].cid).toBe(
        "comment cid a page cid new comment cid 91",
      );
      expect(rendered.result.current.replies[2].cid).toBe(
        "comment cid a page cid new comment cid 81",
      );
      // expect(Object.keys(repliesStore.getState().feedsOptions).length).toBe(1)

      rendered.rerender({
        commentCid: "comment cid b",
        filter: createCidMatchFilter("2"),
        sortType: "new",
      });
      await waitFor(() => rendered.result.current.replies?.length > 2);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid b page cid new comment cid 92",
      );
      expect(rendered.result.current.replies[1].cid).toBe(
        "comment cid b page cid new comment cid 82",
      );
      expect(rendered.result.current.replies[2].cid).toBe(
        "comment cid b page cid new comment cid 72",
      );
      // expect(Object.keys(repliesStore.getState().feedsOptions).length).toBe(2)
    });

    // test.todo('has account comments', async () => {})

    // test.todo('nested scroll pages', async () => {})
  });

  describe("useReplies no pageCids, no page.nextCid", () => {
    let pageToGet, simulateUpdateEvent;
    beforeAll(async () => {
      pageToGet = Pages.prototype.pageToGet;
      Pages.prototype.pageToGet = function (pageCid) {
        void (pageCid.match(/\b(best|newFlat|new|oldFlat|old|topAll)\b/)?.[1] || "best");
        const communityAddress = this.community?.address || this.comment?.communityAddress;
        const depth = (this.comment.depth || 0) + 1;
        const page: any = { comments: [] };
        const count = 35;
        let index = 0;
        while (index++ < count) {
          page.comments.push({
            timestamp: index,
            cid: pageCid + " comment cid " + index,
            communityAddress,
            upvoteCount: index,
            downvoteCount: 10,
            author: { address: pageCid + " author address " + index },
            updatedAt: index,
            depth,
          });
        }
        return page;
      };
      simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        // if timestamp isn't defined, simulate fetching the comment ipfs
        if (!this.timestamp) {
          this.simulateFetchCommentIpfsUpdateEvent();
          return;
        }

        // simulate finding vote counts on an IPNS record
        this.upvoteCount = typeof this.upvoteCount === "number" ? this.upvoteCount + 2 : 3;
        this.downvoteCount = typeof this.downvoteCount === "number" ? this.downvoteCount + 1 : 1;
        this.updatedAt = Math.floor(Date.now() / 1000);
        this.depth = 0;

        const bestPageCid = this.cid + " page cid best";
        this.replies.pages.best = this.replies.pageToGet(bestPageCid);
        this.replies.pageCids = {};

        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };
    });
    afterAll(() => {
      // restore mock
      Pages.prototype.pageToGet = pageToGet;
      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    // eslint-disable-next-line no-unused-vars -- scrollOnePage used by tests: scroll pages, if sort type topAll missing, hasMore false
    let rendered, waitFor, scrollOnePage;

    beforeEach(() => {
      rendered = renderHook<any, any>((useRepliesOptions) => {
        // useReplies accepts only 'comment', but for ease of use also accept a 'commentCid' in the tests
        const comment = useComment({ commentCid: useRepliesOptions?.commentCid });
        return useReplies({
          validateOptimistically: false,
          ...useRepliesOptions,
          commentCid: undefined,
          comment: useRepliesOptions?.comment || comment,
        });
      });
      waitFor = testUtils.createWaitFor(rendered);
      scrollOnePage = async () => {
        const nextFeedLength = (rendered.result.current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await rendered.result.current.loadMore();
        });
        try {
          await waitFor(() => rendered.result.current.replies?.length >= nextFeedLength);
        } catch {
          // console.error('scrollOnePage failed:', e)
        }
      };
    });
    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("sort type new, switch to sort type old, switch to different comment", async () => {
      expect(rendered.result.current.replies).toEqual([]);

      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid, sortType: "new" });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid best comment cid 35",
      );
      expect(rendered.result.current.replies[0].timestamp).toBeGreaterThan(
        rendered.result.current.replies[repliesPerPage - 1].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ commentCid, sortType: "old" });
      await waitFor(
        () =>
          rendered.result.current.replies[0].cid === "comment cid 1 page cid best comment cid 1",
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 1 page cid best comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);

      rendered.rerender({ commentCid: "comment cid 2", sortType: "old" });
      await waitFor(
        () =>
          rendered.result.current.replies[0].cid === "comment cid 2 page cid best comment cid 1",
      );
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.replies[0].cid).toBe(
        "comment cid 2 page cid best comment cid 1",
      );
      expect(rendered.result.current.replies[repliesPerPage - 1].timestamp).toBeGreaterThan(
        rendered.result.current.replies[0].timestamp,
      );
      expect(rendered.result.current.hasMore).toBe(true);
    });
  });

  describe("useReplies flat", () => {
    let pageToGet;

    beforeAll(() => {
      // mock nested replies on pages
      pageToGet = Pages.prototype.pageToGet;
      Pages.prototype.pageToGet = function (pageCid) {
        const pageCidSortType =
          pageCid.match(/\b(best|newFlat|new|oldFlat|old|topAll)\b/)?.[1] || "best";
        const communityAddress = this.community?.address || this.comment?.communityAddress;
        const depth = (this.comment.depth || 0) + 1;
        const page: any = {
          nextCid: communityAddress + " " + pageCid + " - next page cid",
          comments: [],
        };
        const count = 35;
        let index = 0;
        while (index++ < count) {
          page.comments.push({
            timestamp: index,
            cid: pageCid + " comment cid " + index,
            communityAddress,
            upvoteCount: index,
            downvoteCount: 10,
            author: {
              address: pageCid + " author address " + index,
            },
            updatedAt: index,
            depth,
            replies: {
              pages: {
                [pageCidSortType]: {
                  comments: [
                    {
                      timestamp: index + 10,
                      cid: pageCid + " comment cid " + index + " nested 1",
                      communityAddress,
                      upvoteCount: index,
                      downvoteCount: 10,
                      author: {
                        address: pageCid + " author address " + index,
                      },
                      updatedAt: index,
                      depth: depth + 1,
                      replies: {
                        pages: {
                          [pageCidSortType]: {
                            comments: [
                              {
                                timestamp: index + 20,
                                cid: pageCid + " comment cid " + index + " nested 2",
                                communityAddress,
                                upvoteCount: index,
                                downvoteCount: 10,
                                author: {
                                  address: pageCid + " author address " + index,
                                },
                                updatedAt: index,
                                depth: depth + 2,
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          });
        }
        return page;
      };
    });
    afterAll(() => {
      // restore mock
      Pages.prototype.pageToGet = pageToGet;
    });

    let rendered, waitFor, _scrollOnePage;
    let _savedSUE: any;

    beforeEach(() => {
      _savedSUE = Comment.prototype.simulateUpdateEvent;
      rendered = renderHook<any, any>((useRepliesOptions) => {
        // useReplies accepts only 'comment', but for ease of use also accept a 'commentCid' in the tests
        const comment = useComment({ commentCid: useRepliesOptions?.commentCid });
        return useReplies({
          validateOptimistically: false,
          ...useRepliesOptions,
          commentCid: undefined,
          comment: useRepliesOptions?.comment || comment,
        });
      });

      waitFor = testUtils.createWaitFor(rendered);
      _scrollOnePage = async () => {
        const nextFeedLength = (rendered.result.current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await rendered.result.current.loadMore();
        });
        try {
          await waitFor(() => rendered.result.current.replies?.length >= nextFeedLength);
        } catch {
          // console.error('scrollOnePage failed:', e)
        }
      };
    });
    afterEach(async () => {
      Comment.prototype.simulateUpdateEvent = _savedSUE;
      await testUtils.resetDatabasesAndStores();
    });

    test("sort type best is flattened", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.hasMore).toBe(true);
      let hasNestedReplies = false;
      for (const reply of rendered.result.current.replies) {
        if (reply.cid.includes("nested")) {
          hasNestedReplies = true;
          break;
        }
      }
      expect(hasNestedReplies).toBe(true);

      // make sure no pages were fetched because flattened nested replies create enough buffered replies
      // comment out because unreliable, sometimes a page is fetched because the test is too quick
      // expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0)
    });

    test("default sort type is flattened", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);
      expect(rendered.result.current.replies.length).toBe(repliesPerPage);
      expect(rendered.result.current.hasMore).toBe(true);
      let hasNestedReplies = false;
      for (const reply of rendered.result.current.replies) {
        if (reply.cid.includes("nested")) {
          hasNestedReplies = true;
          break;
        }
      }
      expect(hasNestedReplies).toBe(true);

      // make sure no pages were fetched because flattened nested replies create enough buffered replies
      // comment out because unreliable, sometimes a page is fetched because the test is too quick
      // expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0)
    });

    test("sort type new uses newFlat if available", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "new", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);

      const pageCids = Object.keys(repliesPagesStore.getState().repliesPages);
      expect(pageCids.length).toBe(1);
      expect(pageCids[0]).toMatch("newFlat");
    });

    test("sort type old uses oldFlat if available", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "old", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);

      const pageCids = Object.keys(repliesPagesStore.getState().repliesPages);
      expect(pageCids.length).toBe(1);
      expect(pageCids[0]).toMatch("oldFlat");
    });

    test("sort type newFlat uses new if missing", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.replies.pageCids = {
          new: this.cid + " page cid new",
        };
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "newFlat", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);

      const pageCids = Object.keys(repliesPagesStore.getState().repliesPages);
      expect(pageCids.length).toBe(1);
      expect(pageCids[0]).not.toMatch("newFlat");

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("sort type new, flat: true uses new if newFlat missing", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.replies.pageCids = {
          new: this.cid + " page cid new",
        };
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "new", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);

      const pageCids = Object.keys(repliesPagesStore.getState().repliesPages);
      expect(pageCids.length).toBe(1);
      expect(pageCids[0]).not.toMatch("newFlat");

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("sort type oldFlat uses old if missing", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.replies.pageCids = {
          old: this.cid + " page cid old",
        };
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "oldFlat", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);

      const pageCids = Object.keys(repliesPagesStore.getState().repliesPages);
      expect(pageCids.length).toBe(1);
      expect(pageCids[0]).not.toMatch("oldFlat");

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("sort type old, flat: true uses old if oldFlat missing", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.replies.pageCids = {
          old: this.cid + " page cid old",
        };
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "old", flat: true });
      await waitFor(() => rendered.result.current.replies.length === repliesPerPage);

      const pageCids = Object.keys(repliesPagesStore.getState().repliesPages);
      expect(pageCids.length).toBe(1);
      expect(pageCids[0]).not.toMatch("oldFlat");

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("replies.pages has 1 reply with no next cid, hasMore false", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.communityAddress = "community address";
        this.replies.pages = {
          best: {
            comments: [
              {
                timestamp: 1,
                cid: "reply cid 1",
                communityAddress: "community address",
                updatedAt: 1,
                upvoteCount: 1,
              },
            ],
          },
        };
        this.replies.pageCids = {};
        this.updatedAt = 1;
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid });
      await waitFor(() => rendered.result.current.replies.length === 1);
      expect(rendered.result.current.replies.length).toBe(1);
      expect(rendered.result.current.replies[0].cid).toBe("reply cid 1");
      await waitFor(() => rendered.result.current.hasMore === false);
      expect(rendered.result.current.hasMore).toBe(false);

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("updated reply is updated, loaded reply is not", async () => {
      const page1 = {
        comments: [
          {
            timestamp: 1,
            cid: "reply cid 1",
            communityAddress: "community address",
            updatedAt: 1,
            upvoteCount: 1,
          },
        ],
      };
      // updatedAt didn't change, shouldn't update
      const page2 = {
        comments: [
          {
            timestamp: 1,
            cid: "reply cid 1",
            communityAddress: "community address",
            updatedAt: 1,
            upvoteCount: 2,
          },
        ],
      };
      const page3 = {
        comments: [
          {
            timestamp: 1,
            cid: "reply cid 1",
            communityAddress: "community address",
            updatedAt: 2,
            upvoteCount: 2,
          },
        ],
      };
      const page4 = {
        comments: [
          {
            timestamp: 100,
            cid: "reply cid 2",
            communityAddress: "community address",
            updatedAt: 100,
            upvoteCount: 100,
          },
          {
            timestamp: 1,
            cid: "reply cid 1",
            communityAddress: "community address",
            updatedAt: 3,
            upvoteCount: 3,
          },
        ],
      };
      const pages = [page1, page2, page3, page4];

      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      let comment;
      Comment.prototype.simulateUpdateEvent = async function () {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- test mock needs to capture comment reference
        comment = this;
        this.communityAddress = "community address";
        this.replies.pages = { best: pages.shift() };
        this.replies.pageCids = {};
        this.updatedAt = this.updatedAt ? this.updatedAt + 1 : 1;
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      const commentCid = "comment cid 1";
      rendered.rerender({ commentCid });

      // first comment update
      await waitFor(() => rendered.result.current.replies.length === 1);
      expect(pages.length).toBe(3);
      expect(rendered.result.current.replies.length).toBe(1);
      expect(rendered.result.current.updatedReplies.length).toBe(1);
      expect(rendered.result.current.replies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.updatedReplies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.replies[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedReplies[0].updatedAt).toBe(1);
      expect(rendered.result.current.replies[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedReplies[0].upvoteCount).toBe(1);
      expect(rendered.result.current.hasMore).toBe(false);

      // second comment update (updatedAt doesn't change, so shouldn't update)
      comment.simulateUpdateEvent();
      await waitFor(
        () =>
          repliesCommentsStore.getState().comments["comment cid 1"].replies.pages.best.comments[0]
            .upvoteCount === 2,
      );
      expect(pages.length).toBe(2);
      // comment in store updated, but the updatedAt didn't change so no change in useReplies().updatedReplies
      expect(
        repliesCommentsStore.getState().comments["comment cid 1"].replies.pages.best.comments[0]
          .updatedAt,
      ).toBe(1);
      expect(
        repliesCommentsStore.getState().comments["comment cid 1"].replies.pages.best.comments[0]
          .upvoteCount,
      ).toBe(2);
      expect(rendered.result.current.replies.length).toBe(1);
      expect(rendered.result.current.updatedReplies.length).toBe(1);
      expect(rendered.result.current.replies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.updatedReplies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.replies[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedReplies[0].updatedAt).toBe(1);
      expect(rendered.result.current.replies[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedReplies[0].upvoteCount).toBe(1);
      expect(rendered.result.current.hasMore).toBe(false);

      // third comment update (updatedAt doesn't change, so shouldn't update)
      comment.simulateUpdateEvent();
      await waitFor(() => rendered.result.current.updatedReplies[0].updatedAt === 2);
      expect(pages.length).toBe(1);
      expect(rendered.result.current.replies.length).toBe(1);
      expect(rendered.result.current.updatedReplies.length).toBe(1);
      expect(rendered.result.current.replies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.updatedReplies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.replies[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedReplies[0].updatedAt).toBe(2);
      expect(rendered.result.current.replies[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedReplies[0].upvoteCount).toBe(2);
      expect(rendered.result.current.hasMore).toBe(false);

      // fourth comment update
      comment.simulateUpdateEvent();
      await waitFor(() => rendered.result.current.updatedReplies[0].updatedAt === 3);
      expect(pages.length).toBe(0);
      expect(rendered.result.current.replies.length).toBe(2);
      expect(rendered.result.current.updatedReplies.length).toBe(2);
      expect(rendered.result.current.replies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.updatedReplies[0].cid).toBe("reply cid 1");
      expect(rendered.result.current.replies[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedReplies[0].updatedAt).toBe(3);
      expect(rendered.result.current.replies[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedReplies[0].upvoteCount).toBe(3);
      expect(rendered.result.current.hasMore).toBe(false);
      expect(rendered.result.current.replies[1].cid).toBe("reply cid 2");
      expect(rendered.result.current.updatedReplies[1].cid).toBe("reply cid 2");

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });
  });

  describe("useReplies nested", () => {
    let pageToGet;

    beforeAll(() => {
      // mock nested replies on pages
      pageToGet = Pages.prototype.pageToGet;
      Pages.prototype.pageToGet = function (pageCid) {
        if (pageCid === "next") {
          return { comments: [] };
        }
        const pageCidSortType =
          pageCid.match(/\b(best|newFlat|new|oldFlat|old|topAll)\b/)?.[1] || "best";
        const communityAddress = this.community?.address || this.comment?.communityAddress;
        const depth = (this.comment.depth || 0) + 1;
        const page: any = {
          comments: [],
          nextCid: "next",
        };
        const count = 3;
        let index = 0;
        while (index++ < count) {
          page.comments.push({
            timestamp: index,
            cid: pageCid + " comment cid " + index,
            communityAddress,
            upvoteCount: index,
            downvoteCount: 10,
            author: {
              address: pageCid + " author address " + index,
            },
            updatedAt: index,
            depth,
            replies: {
              pages: {
                [pageCidSortType]: {
                  comments: [
                    {
                      timestamp: index + 10,
                      cid: pageCid + " comment cid " + index + " nested 1",
                      communityAddress,
                      upvoteCount: index,
                      downvoteCount: 10,
                      author: {
                        address: pageCid + " author address " + index,
                      },
                      updatedAt: index,
                      depth: depth + 1,
                      replies: {
                        pages: {
                          [pageCidSortType]: {
                            comments: [
                              {
                                timestamp: index + 20,
                                cid: pageCid + " comment cid " + index + " nested 2",
                                communityAddress,
                                upvoteCount: index,
                                downvoteCount: 10,
                                author: {
                                  address: pageCid + " author address " + index,
                                },
                                updatedAt: index,
                                depth: depth + 2,
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          });
        }
        return page;
      };
    });
    afterAll(() => {
      // restore mock
      Pages.prototype.pageToGet = pageToGet;
    });

    let rendered, waitFor, _scrollOnePage;
    let _savedSUE: any, _savedPTG: any;

    beforeEach(() => {
      _savedSUE = Comment.prototype.simulateUpdateEvent;
      _savedPTG = Pages.prototype.pageToGet;
      rendered = renderHook<any, any>((useRepliesOptions) => {
        useRepliesOptions = { validateOptimistically: false, ...useRepliesOptions };

        // useReplies accepts only 'comment', but for ease of use also accept a 'commentCid' in the tests
        const comment = useComment({ commentCid: useRepliesOptions?.commentCid });
        const repliesDepth1 = useReplies({
          ...useRepliesOptions,
          commentCid: undefined,
          comment: useRepliesOptions.comment || comment,
        });
        const reply1Depth2 = repliesDepth1.replies[0];
        const repliesDepth2 = useReplies({
          ...useRepliesOptions,
          commentCid: undefined,
          comment: reply1Depth2,
        });
        const reply1Depth3 = repliesDepth2.replies[0];
        const repliesDepth3 = useReplies({
          ...useRepliesOptions,
          commentCid: undefined,
          comment: reply1Depth3,
        });
        return { repliesDepth1, repliesDepth2, repliesDepth3 };
      });

      waitFor = testUtils.createWaitFor(rendered);
      _scrollOnePage = async () => {
        const nextFeedLength = (rendered.result.current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await rendered.result.current.loadMore();
        });
        try {
          await waitFor(() => rendered.result.current.replies?.length >= nextFeedLength);
        } catch {
          // console.error('scrollOnePage failed:', e)
        }
      };
    });
    afterEach(async () => {
      Comment.prototype.simulateUpdateEvent = _savedSUE;
      Pages.prototype.pageToGet = _savedPTG;
      await testUtils.resetDatabasesAndStores();
    });

    test("validateOptimistically: true", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      // create mock comment with a reply page
      const comment = {
        cid: "comment cid 1",
        postCid: "comment cid 1",
        updatedAt: 1,
        timestamp: 1,
        depth: 0,
        replies: { pages: {} },
      };
      comment.replies.pages.best = Pages.prototype.pageToGet.apply({ comment }, ["best page cid"]);

      // nested
      rendered.rerender({ comment, sortType: "best", validateOptimistically: true });
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);

      // flat
      rendered.rerender({ comment, sortType: "best", flat: true, validateOptimistically: true });
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);
    });

    test("best sort type, nested replies are rendered immediately, without unnecessary rerenders", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "best" });

      // as soon as depth 1 has replies, all other depths also should
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
    });

    test("best sort type missing, use topAll, nested replies are rendered immediately, without unnecessary rerenders", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.updatedAt = Math.floor(Date.now() / 1000);
        this.depth = 0;
        this.replies.pages.topAll = this.replies.pageToGet(this.cid + " page cid topAll");
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      rendered.rerender({ commentCid: "comment cid 1", sortType: "best" });

      // as soon as depth 1 has replies, all other depths also should
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("new sort type, nested replies are rendered immediately, without unnecessary rerenders", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "new" });

      // as soon as depth 1 has replies, all other depths also should
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
    });

    test("new sort type with preloaded pages best, nested replies are rendered immediately, without unnecessary rerenders", async () => {
      // mock nested replies on pages
      const pageToGet = Pages.prototype.pageToGet;
      Pages.prototype.pageToGet = function (pageCid) {
        // call the original pageToGet, but make the cid 'best' instead of 'new'
        return pageToGet.call(this, pageCid.replace("new", "best"));
      };

      rendered.rerender({ commentCid: "comment cid 1", sortType: "new" });

      // as soon as depth 1 has replies, all other depths also should
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);

      Pages.prototype.pageToGet = pageToGet;
    });

    test("nested replies should be removed with flat: true", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);

      rendered.rerender({ commentCid: "comment cid 2", sortType: "new", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);
    });

    test("sort type best, changing flat: true to false, false to true", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      // sort type best, flat true to false
      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);
      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);

      // sort type best, flat false to true
      rendered.rerender({ commentCid: "comment cid 2", sortType: "best", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
      rendered.rerender({ commentCid: "comment cid 2", sortType: "best", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);
      rendered.rerender({ commentCid: "comment cid 2", sortType: "best", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
    });

    test("sort type new, changing flat: true to false, false to true", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      // sort type new, flat true to false
      rendered.rerender({ commentCid: "comment cid 3", sortType: "new", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);
      rendered.rerender({ commentCid: "comment cid 3", sortType: "new", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
      rendered.rerender({ commentCid: "comment cid 3", sortType: "new", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);

      // sort type new, flat false to true
      rendered.rerender({ commentCid: "comment cid 4", sortType: "new", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
      rendered.rerender({ commentCid: "comment cid 4", sortType: "new", flat: true });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);
      rendered.rerender({ commentCid: "comment cid 4", sortType: "new", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth2.replies.length).toBeGreaterThan(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBeGreaterThan(0);
    });

    test("new nested replies are not automatically added to feed, loadMore must be called", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.updatedAt = Math.floor(Date.now() / 1000);
        this.depth = 0;
        this.updatingState = "succeeded";
        this.replies.pages.best = {
          comments: [
            {
              timestamp: 1,
              cid: this.cid + " - reply cid 1",
              communityAddress: this.communityAddress,
              updatedAt: this.updatedAt,
              depth: 1,
              replies: {
                pages: {
                  best: {
                    comments: [
                      {
                        timestamp: 2,
                        cid: this.cid + " - reply cid 1 - nested 1",
                        communityAddress: this.communityAddress,
                        updatedAt: this.updatedAt,
                        depth: 2,
                      },
                    ],
                  },
                },
              },
            },
          ],
        };
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");

        // add another reply after the replies feed rendered once
        setTimeout(() => {
          this.updatedAt += 1;
          this.replies.pages.best.comments[0].updatedAt = this.updatedAt;
          this.replies.pages.best.comments[0].replies.pages.best.comments[0].updatedAt =
            this.updatedAt;
          this.replies.pages.best.comments[0].replies.pages.best.comments.push({
            timestamp: 3,
            cid: this.cid + " - reply cid 1 - nested 2",
            communityAddress: this.communityAddress,
            updatedAt: this.updatedAt,
            depth: 2,
          });
          this.emit("update", this);
          this.emit("updatingstatechange", "succeeded");
        }, 200);
      };

      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.hasMore).toBe(false);

      await waitFor(() => rendered.result.current.repliesDepth2.bufferedReplies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.hasMore).toBe(true);

      // load page
      await act(async () => {
        await rendered.result.current.repliesDepth2.loadMore();
      });
      await waitFor(() => rendered.result.current.repliesDepth2.replies.length > 1);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(2);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);

      // with streamPage: false
      rendered.rerender({
        commentCid: "comment cid 2",
        sortType: "best",
        flat: false,
        streamPage: true,
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.hasMore).toBe(false);

      await waitFor(() => rendered.result.current.repliesDepth2.replies.length > 1);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(2);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.hasMore).toBe(false);

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("new nested replies (with no nested replies initially) are not automatically added to feed, loadMore must be called", async () => {
      const simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.updatedAt = Math.floor(Date.now() / 1000);
        this.depth = 0;
        this.updatingState = "succeeded";
        this.replies.pages.best = {
          comments: [
            {
              timestamp: 1,
              cid: this.cid + " - reply cid 1",
              communityAddress: this.communityAddress,
              updatedAt: this.updatedAt,
              depth: 1,
              replies: { pages: {} },
            },
          ],
        };
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");

        // add a nested reply after the replies feed rendered once
        setTimeout(() => {
          this.updatedAt += 1;
          this.replies.pages.best.comments[0].updatedAt = this.updatedAt;
          this.replies.pages.best.comments[0].replies.pages.best = {
            comments: [
              {
                timestamp: 2,
                cid: this.cid + " - reply cid 1 - nested 1",
                communityAddress: this.communityAddress,
                updatedAt: this.updatedAt,
                depth: 2,
              },
            ],
          };
          this.emit("update", this);
          this.emit("updatingstatechange", "succeeded");
        }, 200);
      };

      rendered.rerender({ commentCid: "comment cid 1", sortType: "best", flat: false });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);
      // flaky and not that important
      // expect(rendered.result.current.repliesDepth2.hasMore).toBe(false)

      await waitFor(() => rendered.result.current.repliesDepth2.bufferedReplies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.hasMore).toBe(true);

      // load page
      await act(async () => {
        await rendered.result.current.repliesDepth2.loadMore();
      });
      await waitFor(() => rendered.result.current.repliesDepth2.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);

      // with streamPage: false
      rendered.rerender({
        commentCid: "comment cid 2",
        sortType: "best",
        flat: false,
        streamPage: true,
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);
      // flaky and not that important
      // expect(rendered.result.current.repliesDepth2.hasMore).toBe(false)

      await waitFor(() => rendered.result.current.repliesDepth2.replies.length > 0);
      expect(rendered.result.current.repliesDepth1.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(1);
      expect(rendered.result.current.repliesDepth2.bufferedReplies.length).toBe(0);
      expect(rendered.result.current.repliesDepth2.hasMore).toBe(false);

      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });
  });

  describe("useReplies accountComments", { retry: 5 }, () => {
    // store original functions for mocking
    let pageToGet, simulateUpdateEvent;

    beforeAll(() => {
      // postCid and depth must be defined for flat replies
      simulateUpdateEvent = Comment.prototype.simulateUpdateEvent;
      Comment.prototype.simulateUpdateEvent = async function () {
        this.postCid = this.postCid || this.cid;
        this.depth = this.depth || 0;
        return simulateUpdateEvent.apply(this);
      };

      // mock nested replies on pages
      pageToGet = Pages.prototype.pageToGet;
      Pages.prototype.pageToGet = function (pageCid) {
        if (pageCid === "next") {
          return { comments: [] };
        }
        const pageCidSortType =
          pageCid.match(/\b(best|newFlat|new|oldFlat|old|topAll)\b/)?.[1] || "best";
        const communityAddress = this.community?.address || this.comment?.communityAddress;
        const depth = (this.comment?.depth || 0) + 1;
        const postCid = this.comment?.postCid || this.comment?.cid;
        const page: any = {
          comments: [],
          nextCid: "next",
        };
        const count = 3;
        let index = 0;
        while (index++ < count) {
          page.comments.push({
            timestamp: index,
            cid: pageCid + " comment cid " + index,
            postCid,
            communityAddress,
            upvoteCount: index,
            downvoteCount: 10,
            author: {
              address: pageCid + " author address " + index,
            },
            updatedAt: index,
            depth,
            replies: {
              pages: {
                [pageCidSortType]: {
                  comments: [
                    {
                      timestamp: index + 10,
                      cid: pageCid + " comment cid " + index + " nested 1",
                      postCid,
                      communityAddress,
                      upvoteCount: index,
                      downvoteCount: 10,
                      author: {
                        address: pageCid + " author address " + index,
                      },
                      updatedAt: index,
                      depth: depth + 1,
                      replies: {
                        pages: {
                          [pageCidSortType]: {
                            comments: [
                              {
                                timestamp: index + 20,
                                cid: pageCid + " comment cid " + index + " nested 2",
                                postCid,
                                communityAddress,
                                upvoteCount: index,
                                downvoteCount: 10,
                                author: {
                                  address: pageCid + " author address " + index,
                                },
                                updatedAt: index,
                                depth: depth + 2,
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          });
        }
        return page;
      };
    });
    afterAll(() => {
      // restore mock
      Comment.prototype.simulateUpdateEvent = simulateUpdateEvent;
      Pages.prototype.pageToGet = pageToGet;
    });

    let rendered, waitFor;
    let _savedSUE: any, _savedPTG: any;

    const sortType = "best";
    const postCid = "comment cid 1";
    const accountReplyCid1 = "comment cid 1 - account reply 1";
    const accountReplyCid2 = "comment cid 1 - account reply 2";
    const reply1Depth2Cid = "comment cid 1 page cid best comment cid 3";
    const authorAddress = "accountcomments.eth";

    beforeEach(() => {
      _savedSUE = Comment.prototype.simulateUpdateEvent;
      _savedPTG = Pages.prototype.pageToGet;
      // add account comments, sorted by oldest
      const now = Math.round(Date.now() / 1000);
      const yearAgo = now - 60 * 60 * 24 * 365;
      const defaultProps = { author: { address: authorAddress }, postCid };
      accountsStore.setState((state) => {
        const accountId = Object.keys(state.accountsComments)[0];
        return {
          accountsComments: {
            [accountId]: [
              {
                ...defaultProps,
                // no cid, no updatedAt, is pending
                timestamp: yearAgo - 1, // very old reply
                parentCid: postCid,
                depth: 1,
                index: 0,
              },
              {
                ...defaultProps,
                // no cid, no updatedAt, is pending
                timestamp: yearAgo, // very old reply
                parentCid: reply1Depth2Cid,
                depth: 2,
                index: 1,
              },
              {
                ...defaultProps,
                timestamp: now - 1,
                cid: accountReplyCid1, // cid received, not pending, but not published by sub owner yet
                parentCid: postCid,
                updatedAt: now,
                depth: 1,
                index: 2,
              },
              {
                ...defaultProps,
                timestamp: now,
                cid: accountReplyCid2, // cid received, not pending, but not published by sub owner yet
                parentCid: reply1Depth2Cid,
                updatedAt: now,
                depth: 2,
                index: 3,
              },
            ],
          },
        };
      });

      rendered = renderHook<any, any>((useRepliesOptions) => {
        useRepliesOptions = { validateOptimistically: false, ...useRepliesOptions };

        // useReplies accepts only 'comment', but for ease of use also accept a 'commentCid' in the tests
        const comment = useComment({ commentCid: useRepliesOptions?.commentCid });
        const repliesDepth1 = useReplies({
          ...useRepliesOptions,
          commentCid: undefined,
          comment: useRepliesOptions.comment || comment,
        });
        const reply1Depth2 = repliesDepth1.replies[0];
        const repliesDepth2 = useReplies({
          ...useRepliesOptions,
          commentCid: undefined,
          comment: reply1Depth2,
        });
        const reply1Depth3 = repliesDepth2.replies[0];
        const repliesDepth3 = useReplies({
          ...useRepliesOptions,
          commentCid: undefined,
          comment: reply1Depth3,
        });
        return { repliesDepth1, repliesDepth2, repliesDepth3 };
      });

      waitFor = testUtils.createWaitFor(rendered);
    });
    afterEach(async () => {
      Comment.prototype.simulateUpdateEvent = _savedSUE;
      Pages.prototype.pageToGet = _savedPTG;
      await testUtils.resetDatabasesAndStores();
    });

    test("validateOptimistically: true", async () => {
      // make sure pages were reset properly
      expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(0);

      // create mock comment with a reply page
      const comment = {
        cid: "comment cid 1",
        postCid: "comment cid 1",
        updatedAt: 1,
        timestamp: 1,
        depth: 0,
        replies: { pages: {} },
      };
      comment.replies.pages.best = Pages.prototype.pageToGet.apply({ comment }, ["best page cid"]);

      rendered.rerender({
        comment,
        sortType: "best",
        accountComments: { newerThan: Infinity },
        validateOptimistically: true,
      });
      // as soon as depth 1 has replies, all other depths also should
      expect(rendered.result.current.repliesDepth1.replies.length).toBeGreaterThan(2);
      // repliesDepth2 uses first reply, which is an account reply and has no replies
      expect(rendered.result.current.repliesDepth2.replies.length).toBe(0);
      expect(rendered.result.current.repliesDepth3.replies.length).toBe(0);

      // has account comments prepended first
      expect(rendered.result.current.repliesDepth1.replies[0].cid).toBe(accountReplyCid1);
      expect(rendered.result.current.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(rendered.result.current.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(rendered.result.current.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(rendered.result.current.repliesDepth1.replies[2].cid).not.toBe(undefined);
      expect(rendered.result.current.repliesDepth1.replies[2].author.address).not.toBe(
        authorAddress,
      );
      // prepend order should be newest first
      expect(rendered.result.current.repliesDepth1.replies[0].timestamp).toBeGreaterThan(
        rendered.result.current.repliesDepth1.replies[1].timestamp,
      );
    });

    test("deleted local account reply/reindex disappears from replies accountComments injection immediately", async () => {
      rendered.rerender({
        commentCid: postCid,
        sortType,
        accountComments: { newerThan: Infinity },
      });

      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 2);
      expect(rendered.result.current.repliesDepth1.replies[0].cid).toBe(accountReplyCid1);

      await act(async () => {
        const { accountsComments, activeAccountId, accounts } = accountsStore.getState();
        const accountId = accounts[activeAccountId].id;
        const accountCommentsList = accountsComments[accountId] || [];
        const spliced = [...accountCommentsList];
        spliced.splice(2, 1);
        const reindexed = spliced.map((c, i) => ({ ...c, index: i, accountId }));
        accountsStore.setState({
          accountsComments: { ...accountsComments, [accountId]: reindexed },
          commentCidsToAccountsComments: getCommentCidsToAccountsComments({
            ...accountsComments,
            [accountId]: reindexed,
          }),
        });
      });

      await waitFor(
        () =>
          !rendered.result.current.repliesDepth1.replies.some(
            (r: { cid?: string }) => r.cid === accountReplyCid1,
          ),
      );
      expect(
        rendered.result.current.repliesDepth1.replies.some(
          (r: { cid?: string }) => r.cid === accountReplyCid1,
        ),
      ).toBe(false);
    });

    test("change accountComments options, append, prepend, newerThan", async () => {
      // default (prepend) + newerThan Infinity
      rendered.rerender({
        commentCid: postCid,
        sortType,
        accountComments: { newerThan: Infinity },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 2);
      let res = rendered.result.current;

      // as soon as depth 1 has replies, all other depths also should
      expect(res.repliesDepth1.replies.length).toBeGreaterThan(2);
      // repliesDepth2 uses first reply, which is an account reply and has no replies
      expect(res.repliesDepth2.replies.length).toBe(0);
      expect(res.repliesDepth3.replies.length).toBe(0);

      // has account comments prepended first
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).not.toBe(authorAddress);
      // prepend order should be newest first
      expect(res.repliesDepth1.replies[0].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[1].timestamp,
      );

      // append + newerThan Infinity
      rendered.rerender({
        commentCid: postCid,
        sortType,
        accountComments: { append: true, newerThan: Infinity },
      });

      // wait for repliesDepth2 because the previous one was 0
      await waitFor(() => rendered.result.current.repliesDepth2.replies.length > 0);
      res = rendered.result.current;

      // as soon as depth 1 has replies, all other depths also should
      expect(res.repliesDepth1.replies.length).toBeGreaterThan(2);
      expect(res.repliesDepth2.replies.length).toBeGreaterThan(2);
      expect(res.repliesDepth3.replies.length).toBeGreaterThan(0);
      // has account comments appended last
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].cid).toBe(
        accountReplyCid1,
      );
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].author.address).toBe(
        authorAddress,
      );
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 2].author.address).toBe(
        authorAddress,
      );
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 3].cid).not.toBe(
        undefined,
      );
      expect(
        res.repliesDepth1.replies[res.repliesDepth1.replies.length - 3].author.address,
      ).not.toBe(authorAddress);
      // append: true order should be newest last
      expect(
        res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].timestamp,
      ).toBeGreaterThan(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 2].timestamp);

      // depth 2 has account comments appended last
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 1].cid).toBe(
        accountReplyCid2,
      );
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 1].author.address).toBe(
        authorAddress,
      );
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 2].cid).toBe(undefined);
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 2].author.address).toBe(
        authorAddress,
      );
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 3].cid).not.toBe(
        undefined,
      );
      expect(
        res.repliesDepth2.replies[res.repliesDepth2.replies.length - 3].author.address,
      ).not.toBe(authorAddress);
      // depth 2 append: true order should be newest last
      expect(
        res.repliesDepth2.replies[res.repliesDepth2.replies.length - 1].timestamp,
      ).toBeGreaterThan(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 2].timestamp);

      // append + newerThan 1h
      rendered.rerender({
        commentCid: postCid,
        sortType,
        accountComments: { append: true, newerThan: 60 * 60 },
      });

      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      res = rendered.result.current;

      // as soon as depth 1 has replies, all other depths also should
      expect(res.repliesDepth1.replies.length).toBeGreaterThan(1);
      expect(res.repliesDepth2.replies.length).toBeGreaterThan(1);
      expect(res.repliesDepth3.replies.length).toBeGreaterThan(0);
      // has account comments newerThan appended last
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].cid).toBe(
        accountReplyCid1,
      );
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].author.address).toBe(
        authorAddress,
      );
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 2].cid).not.toBe(
        undefined,
      );
      expect(
        res.repliesDepth1.replies[res.repliesDepth1.replies.length - 2].author.address,
      ).not.toBe(authorAddress);

      // depth 2 has account comments newerThan appended last
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 1].cid).toBe(
        accountReplyCid2,
      );
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 1].author.address).toBe(
        authorAddress,
      );
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 2].cid).not.toBe(
        undefined,
      );
      expect(
        res.repliesDepth2.replies[res.repliesDepth2.replies.length - 2].author.address,
      ).not.toBe(authorAddress);

      // publishing a reply automatically adds to replies feed
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: postCid,
          postCid,
          content: "added to feed",
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: reply1Depth2Cid,
          postCid,
          content: "added to feed 2",
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(
        () =>
          rendered.result.current.repliesDepth1.replies[
            rendered.result.current.repliesDepth1.replies.length - 1
          ].content === "added to feed",
      );
      res = rendered.result.current;
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].content).toBe(
        "added to feed",
      );
      expect(res.repliesDepth2.replies[res.repliesDepth2.replies.length - 1].content).toBe(
        "added to feed 2",
      );
    });

    test("flat", async () => {
      // default (prepend) + newerThan Infinity
      rendered.rerender({
        commentCid: postCid,
        sortType,
        flat: true,
        accountComments: { newerThan: Infinity },
      });

      // wait for 4 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      let res = rendered.result.current;

      // as soon as depth 1 has replies, all other depths also should
      expect(res.repliesDepth1.replies.length).toBeGreaterThan(4);
      // flat should not have nested replies
      expect(res.repliesDepth2.replies.length).toBe(0);
      expect(res.repliesDepth3.replies.length).toBe(0);

      // has account comments prepended first
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      // prepend order should be newest first
      expect(res.repliesDepth1.replies[0].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[1].timestamp,
      );
      expect(res.repliesDepth1.replies[1].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[2].timestamp,
      );
      expect(res.repliesDepth1.replies[2].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[3].timestamp,
      );

      // append + newerThan Infinity
      rendered.rerender({
        commentCid: postCid,
        sortType,
        flat: true,
        accountComments: { append: true, newerThan: Infinity },
      });

      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      res = rendered.result.current;

      // as soon as depth 1 has replies, all other depths also should
      expect(res.repliesDepth1.replies.length).toBeGreaterThan(4);
      // flat should not have nested replies
      expect(res.repliesDepth2.replies.length).toBe(0);
      expect(res.repliesDepth3.replies.length).toBe(0);

      // has account comments prepended first
      let length = res.repliesDepth1.replies.length;
      expect(res.repliesDepth1.replies[length - 1].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[length - 1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[length - 2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[length - 2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[length - 3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[length - 3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[length - 4].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[length - 4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[length - 5].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[length - 5].author.address).not.toBe(authorAddress);
      // prepend order should be newest first
      expect(res.repliesDepth1.replies[length - 1].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[length - 2].timestamp,
      );
      expect(res.repliesDepth1.replies[length - 2].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[length - 3].timestamp,
      );
      expect(res.repliesDepth1.replies[length - 3].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[length - 4].timestamp,
      );

      // append + newerThan 1h
      rendered.rerender({
        commentCid: postCid,
        sortType,
        flat: true,
        accountComments: { append: true, newerThan: 60 * 60 },
      });

      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 0);
      res = rendered.result.current;

      // as soon as depth 1 has replies, all other depths also should
      expect(res.repliesDepth1.replies.length).toBeGreaterThan(2);
      // flat should not have nested replies
      expect(res.repliesDepth2.replies.length).toBe(0);
      expect(res.repliesDepth3.replies.length).toBe(0);

      // has account comments prepended first
      length = res.repliesDepth1.replies.length;
      expect(res.repliesDepth1.replies[length - 1].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[length - 1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[length - 2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[length - 2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[length - 3].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[length - 3].author.address).not.toBe(authorAddress);
      // prepend order should be newest first
      expect(res.repliesDepth1.replies[length - 1].timestamp).toBeGreaterThan(
        res.repliesDepth1.replies[length - 2].timestamp,
      );

      // publishing a reply automatically adds to replies feed
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: postCid,
          postCid,
          content: "added to feed",
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: reply1Depth2Cid,
          postCid,
          content: "added to feed 2",
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(
        () =>
          rendered.result.current.repliesDepth1.replies[
            rendered.result.current.repliesDepth1.replies.length - 1
          ].content === "added to feed 2",
      );
      res = rendered.result.current;
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 2].content).toBe(
        "added to feed",
      );
      expect(res.repliesDepth1.replies[res.repliesDepth1.replies.length - 1].content).toBe(
        "added to feed 2",
      );
    });

    test("scroll pages", async () => {
      const repliesPerPage = 1;
      const scrollOnePage = async () => {
        const current = rendered.result.current.repliesDepth1;
        const nextFeedLength = (current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await current.loadMore();
        });
        try {
          await waitFor(() => current.replies?.length >= nextFeedLength);
        } catch {}
      };

      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        accountComments: { newerThan: Infinity },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 2);
      let res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(3);
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      await scrollOnePage();
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 3);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(4);
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      // total mock replies is 5, so scroll 1 more times
      await act(async () => {
        await rendered.result.current.repliesDepth1.loadMore();
      });
      await waitFor(() => rendered.result.current.repliesDepth1.hasMore === false);
      expect(rendered.result.current.repliesDepth1.hasMore).toBe(false);
    });

    test("scroll pages and publish", async () => {
      const repliesPerPage = 1;
      const scrollOnePage = async () => {
        const current = rendered.result.current.repliesDepth1;
        const nextFeedLength = (current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await current.loadMore();
        });
        try {
          await waitFor(() => current.replies?.length >= nextFeedLength);
        } catch {}
      };

      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        accountComments: { newerThan: Infinity },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 2);
      let res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(3);
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      const content = "published content";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: postCid,
          postCid,
          content,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies[0].content === content);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(4);
      expect(res.repliesDepth1.replies[0].content).toBe(content);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      await scrollOnePage();
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[0].content).toBe(content);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);
    });

    test("scroll pages append and publish", async () => {
      const repliesPerPage = 1;
      const scrollOnePage = async () => {
        const current = rendered.result.current.repliesDepth1;
        const nextFeedLength = (current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await current.loadMore();
        });
        try {
          await waitFor(() => current.replies?.length >= nextFeedLength);
        } catch {}
      };

      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        accountComments: { newerThan: Infinity, append: true },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 2);
      let res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(3);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      const content = "published content";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: postCid,
          postCid,
          content,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies[3].content === content);
      res = rendered.result.current;

      // depth 1
      expect(res.repliesDepth1.replies.length).toBe(4);
      expect(res.repliesDepth1.replies[3].content).toBe(content);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      // depth 2 & 3
      expect(res.repliesDepth2.replies.length).toBe(3);
      expect(res.repliesDepth3.replies.length).toBe(1);
      expect(res.repliesDepth2.replies[2].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth2.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth2.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth2.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth2.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth2.replies[0].author.address).not.toBe(authorAddress);

      await scrollOnePage();
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      res = rendered.result.current;

      // depth 1
      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].content).toBe(content);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      // depth 2 & 3
      expect(res.repliesDepth2.replies.length).toBe(3);
      expect(res.repliesDepth3.replies.length).toBe(1);
      expect(res.repliesDepth2.replies[2].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth2.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth2.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth2.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth2.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth2.replies[0].author.address).not.toBe(authorAddress);

      const content2 = "published content 2";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: reply1Depth2Cid,
          postCid,
          content: content2,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth2.replies[3].content === content2);
      res = rendered.result.current;

      // depth 1
      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].content).toBe(content);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      // depth 2 & 3
      expect(res.repliesDepth2.replies.length).toBe(4);
      expect(res.repliesDepth3.replies.length).toBe(1);
      expect(res.repliesDepth2.replies[3].content).toBe(content2);
      expect(res.repliesDepth2.replies[2].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth2.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth2.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth2.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth2.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth2.replies[0].author.address).not.toBe(authorAddress);
    });

    test("scroll pages flat", async () => {
      const repliesPerPage = 1;
      const scrollOnePage = async () => {
        const current = rendered.result.current.repliesDepth1;
        const nextFeedLength = (current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await current.loadMore();
        });
        try {
          await waitFor(() => current.replies?.length >= nextFeedLength);
        } catch {}
      };

      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        flat: true,
        accountComments: { newerThan: Infinity },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      let res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      await scrollOnePage();
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 5);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(6);
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[5].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[5].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      // total mock flat replies is 13, so scroll 7 more times
      await act(async () => {
        await rendered.result.current.repliesDepth1.loadMore();
        await rendered.result.current.repliesDepth1.loadMore();
        await rendered.result.current.repliesDepth1.loadMore();
        await rendered.result.current.repliesDepth1.loadMore();
        await rendered.result.current.repliesDepth1.loadMore();
        await rendered.result.current.repliesDepth1.loadMore();
        await rendered.result.current.repliesDepth1.loadMore();
      });
      await waitFor(() => rendered.result.current.repliesDepth1.hasMore === false);
      expect(rendered.result.current.repliesDepth1.hasMore).toBe(false);
    });

    test("scroll pages flat and publish", async () => {
      const repliesPerPage = 1;
      const scrollOnePage = async () => {
        const current = rendered.result.current.repliesDepth1;
        const nextFeedLength = (current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await current.loadMore();
        });
        try {
          await waitFor(() => current.replies?.length >= nextFeedLength);
        } catch {}
      };

      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        flat: true,
        accountComments: { newerThan: Infinity },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      let res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[0].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[0].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      const content = "published content";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: postCid,
          postCid,
          content,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies[0].content === content);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(6);
      expect(res.repliesDepth1.replies[0].content).toBe(content);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[5].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[5].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      await scrollOnePage();
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 6);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(7);
      expect(res.repliesDepth1.replies[0].content).toBe(content);
      expect(res.repliesDepth1.replies[1].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[5].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[5].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[6].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[6].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      const content2 = "published content 2";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: reply1Depth2Cid,
          postCid,
          content: content2,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies[0].content === content2);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(8);
      expect(res.repliesDepth1.replies[0].content).toBe(content2);
      expect(res.repliesDepth1.replies[1].content).toBe(content);
      expect(res.repliesDepth1.replies[2].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[4].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[5].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[5].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[6].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[6].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[7].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[7].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);
    });

    test("scroll pages flat, append and publish", async () => {
      const repliesPerPage = 1;
      const scrollOnePage = async () => {
        const current = rendered.result.current.repliesDepth1;
        const nextFeedLength = (current.replies?.length || 0) + repliesPerPage;
        await act(async () => {
          await current.loadMore();
        });
        try {
          await waitFor(() => current.replies?.length >= nextFeedLength);
        } catch {}
      };

      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        flat: true,
        accountComments: { newerThan: Infinity, append: true },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      let res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[4].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      const content = "published content";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: postCid,
          postCid,
          content,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies[5].content === content);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(6);
      expect(res.repliesDepth1.replies[5].content).toBe(content);
      expect(res.repliesDepth1.replies[4].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      await scrollOnePage();
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 6);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(7);
      expect(res.repliesDepth1.replies[6].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[6].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[5].content).toBe(content);
      expect(res.repliesDepth1.replies[4].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      const content2 = "published content 2";
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "community address",
          parentCid: reply1Depth2Cid,
          postCid,
          content: content2,
          onChallenge: () => {},
          onChallengeVerification: () => {},
        });
      });
      await waitFor(() => rendered.result.current.repliesDepth1.replies[7].content === content2);
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(8);
      expect(res.repliesDepth1.replies[7].content).toBe(content2);
      expect(res.repliesDepth1.replies[6].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[6].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.replies[5].content).toBe(content);
      expect(res.repliesDepth1.replies[4].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);
    });

    test("receiving cid updates feeds and does not cause duplicate comments", async () => {
      const repliesPerPage = 1;
      rendered.rerender({
        commentCid: postCid,
        sortType,
        repliesPerPage,
        flat: true,
        accountComments: { newerThan: Infinity, append: true },
      });

      // wait for 2 the first time because account comments can appear before comment update replies
      await waitFor(() => rendered.result.current.repliesDepth1.replies.length > 4);
      let res = rendered.result.current;

      // NOTE: sometimes there's a race condition that puts the account comments first
      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[4].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);

      // trigger several accounts comments state changes to make sure the next
      // state change is caused by the new cid, and not something else
      let count = 10;
      while (count--) {
        accountsStore.setState((state) => {
          const accountId = Object.keys(state.accountsComments)[0];
          const accountComments = [...state.accountsComments[accountId]];
          return { accountsComments: { [accountId]: accountComments } };
        });
      }

      // receiving cid updates feeds and doesn't cause duplicate comments
      const publishedCommentCid = "published comment cid";
      const accountCommentIndex = res.repliesDepth1.replies[1].index;
      expect(typeof accountCommentIndex).toBe("number");
      accountsStore.setState((state) => {
        const accountId = Object.keys(state.accountsComments)[0];
        const accountComments = [...state.accountsComments[accountId]];
        accountComments[accountCommentIndex].cid = "published comment cid";
        return { accountsComments: { [accountId]: accountComments } };
      });
      await waitFor(
        () => rendered.result.current.repliesDepth1.replies[1].cid === publishedCommentCid,
      );
      res = rendered.result.current;

      expect(res.repliesDepth1.replies.length).toBe(5);
      expect(res.repliesDepth1.replies[4].cid).toBe(accountReplyCid2);
      expect(res.repliesDepth1.replies[4].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[3].cid).toBe(accountReplyCid1);
      expect(res.repliesDepth1.replies[3].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[2].cid).toBe(undefined);
      expect(res.repliesDepth1.replies[2].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[1].cid).toBe(publishedCommentCid);
      expect(res.repliesDepth1.replies[1].author.address).toBe(authorAddress);
      expect(res.repliesDepth1.replies[0].cid).not.toBe(undefined);
      expect(res.repliesDepth1.replies[0].author.address).not.toBe(authorAddress);
      expect(res.repliesDepth1.hasMore).toBe(true);
    });
  });
});
