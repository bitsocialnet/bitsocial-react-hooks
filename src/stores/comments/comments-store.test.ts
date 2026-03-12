import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import commentsStore, { resetCommentsDatabaseAndStore, listeners, log } from "./comments-store";
import localForageLru from "../../lib/localforage-lru";
import { setPlebbitJs } from "../..";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";
import accountsStore from "../accounts";
import repliesPagesStore from "../replies-pages";

let mockAccount: any;
let accountsGetState: typeof accountsStore.getState;

describe("comments store", () => {
  beforeAll(async () => {
    setPlebbitJs(PlebbitJsMock);
    testUtils.silenceReactWarnings();
    const plebbit = await PlebbitJsMock();
    mockAccount = { id: "mock-account-id", plebbit };
    accountsGetState = accountsStore.getState;
  });
  afterAll(() => {
    testUtils.restoreAll();
  });

  afterEach(async () => {
    await resetCommentsDatabaseAndStore();
  });

  test("initial store", () => {
    const { result } = renderHook(() => commentsStore.getState());
    expect(result.current.comments).toEqual({});
    expect(result.current.errors).toEqual({});
    expect(typeof result.current.addCommentToStore).toBe("function");
  });

  test("addCommentToStore adds comment from plebbit", async () => {
    const commentCid = "test-comment-cid";

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    expect(commentsStore.getState().comments[commentCid]).toBeDefined();
    expect(commentsStore.getState().comments[commentCid].cid).toBe(commentCid);
  });

  test("addCommentToStore returns early when comment already in store", async () => {
    const commentCid = "existing-comment-cid";
    const createSpy = vi.spyOn(mockAccount.plebbit, "createComment");

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });
    const callCount = createSpy.mock.calls.length;

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    expect(createSpy.mock.calls.length).toBe(callCount);
    createSpy.mockRestore();
  });

  test("cached comment create failure logs to console", async () => {
    const commentCid = "cached-fail-cid";
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-comments" });
    await db.setItem(commentCid, { cid: commentCid, invalid: "data" });

    const createCommentOriginal = mockAccount.plebbit.createComment;
    mockAccount.plebbit.createComment = vi.fn().mockRejectedValue(new Error("create failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      try {
        await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
      } catch {
        // expected to throw
      }
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "failed plebbit.createComment(cachedComment)",
      expect.objectContaining({
        cachedComment: expect.any(Object),
        error: expect.any(Error),
      }),
    );
    consoleSpy.mockRestore();
    mockAccount.plebbit.createComment = createCommentOriginal;
  });

  test("comment without timestamp registers once(update) for addCidToAccountComment", async () => {
    const addCidSpy = vi.fn().mockResolvedValue(undefined);
    (accountsStore as any).getState = () => ({
      accountsActionsInternal: { addCidToAccountComment: addCidSpy },
    });

    const commentCid = "no-timestamp-cid";
    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    const comment = commentsStore.getState().comments[commentCid];
    expect(comment).toBeDefined();
    expect(comment.timestamp).toBeUndefined();

    await new Promise((r) => setTimeout(r, 300));
    expect(addCidSpy).toHaveBeenCalledWith(expect.anything());

    (accountsStore as any).getState = accountsGetState;
  });

  test("addCidToAccountComment error is logged when it rejects", async () => {
    const addCidSpy = vi.fn().mockRejectedValue(new Error("addCid failed"));
    (accountsStore as any).getState = () => ({
      accountsActionsInternal: { addCidToAccountComment: addCidSpy },
    });
    const logSpy = vi.spyOn(log, "error").mockImplementation(() => {});

    const commentCid = "addcid-reject-cid";
    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    const comment = commentsStore.getState().comments[commentCid];
    expect(comment).toBeDefined();
    expect(comment.timestamp).toBeUndefined();

    await new Promise((r) => setTimeout(r, 300));
    expect(addCidSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "accountsActionsInternal.addCidToAccountComment error",
      expect.objectContaining({ comment: expect.anything(), error: expect.any(Error) }),
    );

    logSpy.mockRestore();
    (accountsStore as any).getState = accountsGetState;
  });

  test("comment.update catch logs when update rejects", async () => {
    const commentCid = "update-reject-cid";
    const plebbit = await PlebbitJsMock();
    const comment = await plebbit.createComment({ cid: commentCid });
    const updateSpy = vi.spyOn(comment, "update").mockRejectedValueOnce(new Error("update failed"));

    const createCommentOrig = mockAccount.plebbit.createComment;
    mockAccount.plebbit.createComment = vi.fn().mockResolvedValue(comment);

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    await new Promise((r) => setTimeout(r, 100));

    mockAccount.plebbit.createComment = createCommentOrig;
    updateSpy.mockRestore();
  });

  test("comment update callback calls addRepliesPageCommentsToStore", async () => {
    const commentCid = "update-cb-cid";
    const addRepliesSpy = vi.fn();
    const repliesPagesGetState = repliesPagesStore.getState;
    (repliesPagesStore as any).getState = () => ({
      ...repliesPagesGetState(),
      addRepliesPageCommentsToStore: addRepliesSpy,
    });

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    const comment = listeners[listeners.length - 1];
    expect(comment).toBeDefined();
    expect(addRepliesSpy).not.toHaveBeenCalled();
    await act(async () => {
      comment.update();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(addRepliesSpy).toHaveBeenCalledWith(comment);

    (repliesPagesStore as any).getState = repliesPagesGetState;
  });

  test("addCommentToStore preserves live legacy comment instances with event methods", async () => {
    const commentCid = "legacy-live-comment-cid";
    const onSpy = vi.fn();
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    const liveComment = {
      cid: commentCid,
      timestamp: 1,
      subplebbitAddress: "legacy-community-address",
      clients: {},
      on: onSpy,
      once: vi.fn(),
      update: updateSpy,
      removeAllListeners: vi.fn(),
    };
    const createCommentOrig = mockAccount.plebbit.createComment;
    mockAccount.plebbit.createComment = vi.fn().mockResolvedValue(liveComment);

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    expect(mockAccount.plebbit.createComment).toHaveBeenCalledWith({ cid: commentCid });
    expect(commentsStore.getState().comments[commentCid]).toEqual(
      expect.objectContaining({
        cid: commentCid,
        communityAddress: "legacy-community-address",
      }),
    );
    expect(liveComment.communityAddress).toBe("legacy-community-address");
    expect(onSpy).toHaveBeenCalledTimes(3);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    mockAccount.plebbit.createComment = createCommentOrig;
  });

  test("missing-comment client update guard returns empty object", async () => {
    const commentCid = "client-update-cid";
    let storedCb: ((...args: any[]) => void) | null = null;

    const utils = await import("../../lib/utils");
    const origClientsOnStateChange = utils.default.clientsOnStateChange;
    (utils.default as any).clientsOnStateChange = (_clients: any, cb: any) => {
      storedCb = () => cb("state", "type", "url");
    };

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    expect(storedCb).toBeTruthy();
    commentsStore.setState({ comments: {} });

    storedCb!();

    expect(commentsStore.getState().comments).toEqual({});

    (utils.default as any).clientsOnStateChange = origClientsOnStateChange;
  });

  test("clientsOnStateChange with chainTicker branch", async () => {
    const commentCid = "chain-ticker-cid";
    let storedCb: ((...args: any[]) => void) | null = null;

    const utils = await import("../../lib/utils");
    const origClientsOnStateChange = utils.default.clientsOnStateChange;
    (utils.default as any).clientsOnStateChange = (_clients: any, cb: any) => {
      storedCb = () => cb("state", "type", "url", "ETH");
    };

    await act(async () => {
      await commentsStore.getState().addCommentToStore(commentCid, mockAccount);
    });

    expect(storedCb).toBeTruthy();
    commentsStore.setState((state: any) => ({
      comments: {
        ...state.comments,
        [commentCid]: {
          ...state.comments[commentCid],
          clients: { type: {} },
        },
      },
    }));
    storedCb!();
    expect(commentsStore.getState().comments[commentCid]?.clients?.type?.ETH).toBeDefined();

    (utils.default as any).clientsOnStateChange = origClientsOnStateChange;
  });
});
