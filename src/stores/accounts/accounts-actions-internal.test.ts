import { act } from "@testing-library/react";
import testUtils from "../../lib/test-utils";
import * as accountsActionsInternal from "./accounts-actions-internal";
import accountsStore, { listeners } from "./accounts-store";
import accountsDatabase from "./accounts-database";
import PlebbitJsMock, { Comment } from "../../lib/plebbit-js/plebbit-js-mock";
import { setPlebbitJs } from "../../lib/plebbit-js";

describe("accounts-actions-internal", () => {
  beforeAll(async () => {
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();
    testUtils.silenceReactWarnings();
  });

  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("startUpdatingAccountCommentOnCommentUpdateEvents", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("returns early when comment has no cid", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = { author: { address: "addr" }, timestamp: 1 } as any;
      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );
      expect(accountsStore.getState().accountsCommentsUpdating).toEqual({});
    });

    test("comment without .on: creates Comment via plebbit.createComment", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const plainComment = {
        cid: "plain-cid",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
        depth: 0,
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "plain-cid",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "plain-cid", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "plain-cid": { accountId: account.id, accountCommentIndex: 0 },
        },
      }));

      let createdComment: any;
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
        createdComment = await origCreate(opts);
        return createdComment;
      });

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        plainComment as any,
        account,
        0,
      );

      expect(account.plebbit.createComment).toHaveBeenCalledWith(plainComment);

      await act(async () => {
        createdComment.emit("update", { ...plainComment, cid: "plain-cid" });
      });

      await new Promise((r) => setTimeout(r, 50));
    });

    test("returns early when account comment already updating", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({ cid: "cid1", author: { address: account.author.address } });
      accountsStore.setState((s) => ({
        accountsCommentsUpdating: { ...s.accountsCommentsUpdating, cid1: true },
      }));
      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );
      expect(accountsStore.getState().accountsCommentsUpdating["cid1"]).toBe(true);
    });

    test("mapping missing or wrong accountId: cleanup removeAllListeners/stop", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-orphan",
        author: { address: account.author.address },
      });
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-orphan", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {},
      }));

      const removeAllListenersSpy = vi.spyOn(comment, "removeAllListeners");
      const stopSpy = vi.spyOn(comment as any, "stop");

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      await act(async () => {
        comment.emit("update", { ...comment, cid: "cid-orphan" });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(removeAllListenersSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
      expect(accountsStore.getState().accountsCommentsUpdating["cid-orphan"]).toBeUndefined();
    });

    test("removeAllListeners/stop throws: catch logs trace", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-throw",
        author: { address: account.author.address },
      });
      vi.spyOn(comment, "removeAllListeners").mockImplementation(() => {
        throw new Error("test throw");
      });
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-throw", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {},
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      await act(async () => {
        comment.emit("update", { ...comment, cid: "cid-throw" });
      });

      await new Promise((r) => setTimeout(r, 50));
      vi.restoreAllMocks();
    });

    test("mapping cleanup when comment lacks removeAllListeners and stop (branches 66-67)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const updateListeners: Array<(c: any) => void> = [];
      const plainComment = {
        cid: "cid-no-methods",
        on: (_: string, fn: (c: any) => void) => {
          updateListeners.push(fn);
        },
        emit: (_: string, c: any) => {
          updateListeners.forEach((fn) => fn(c));
        },
        update: () => Promise.resolve(),
      };
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-no-methods", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-no-methods": { accountId: "other-id", accountCommentIndex: 0 },
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        plainComment as any,
        account,
        0,
      );

      await act(async () => {
        (plainComment as any).emit("update", { cid: "cid-no-methods" });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(accountsStore.getState().accountsCommentsUpdating["cid-no-methods"]).toBeUndefined();
      const idx = listeners.indexOf(plainComment);
      if (idx >= 0) listeners.splice(idx, 1);
    });

    test("stop throws: catch logs trace (stop branch)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-stop-throw",
        author: { address: account.author.address },
      });
      vi.spyOn(comment as any, "stop").mockImplementation(() => {
        throw new Error("stop throw");
      });
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-stop-throw", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {},
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      await act(async () => {
        comment.emit("update", { ...comment, cid: "cid-stop-throw" });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(accountsStore.getState().accountsCommentsUpdating["cid-stop-throw"]).toBeUndefined();
      vi.restoreAllMocks();
    });

    test("update with updatedComment.cid undefined: cleanup uses empty string key", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-undefined",
        author: { address: account.author.address },
      });
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-undefined", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-undefined": { accountId: "other-id", accountCommentIndex: 0 },
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      await act(async () => {
        comment.emit("update", { ...comment, cid: undefined });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(accountsStore.getState().accountsCommentsUpdating[""]).toBeUndefined();
    });

    test("update with replyPage.comments undefined: replyPage?.comments?.length || 0 branch (110)", async () => {
      const utilsMod = await import("../../lib/utils");
      vi.spyOn(utilsMod.default as any, "repliesAreValid").mockResolvedValue(true);

      const account = Object.values(accountsStore.getState().accounts)[0];
      const validReply = {
        cid: "reply-p1",
        author: { address: "r1" },
        communityAddress: "sub.eth",
        depth: 1,
        parentCid: "cid-undefined-comments",
      };
      const comment = new Comment({
        cid: "cid-undefined-comments",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
        depth: 0,
      });
      (comment as any).replies = {
        pages: {
          page1: { comments: [validReply] },
          page2: { comments: undefined },
        },
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-undefined-comments",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [
            { cid: "cid-undefined-comments", index: 0, accountId: account.id, timestamp: 1 },
          ],
        },
        commentCidsToAccountsComments: {
          "cid-undefined-comments": { accountId: account.id, accountCommentIndex: 0 },
        },
        accountsCommentsReplies: { ...s.accountsCommentsReplies, [account.id]: {} },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      const updatedComment = {
        cid: "cid-undefined-comments",
        communityAddress: "sub.eth",
        depth: 0,
        author: { address: account.author.address },
        replies: {
          pages: {
            page1: { comments: [validReply] },
            page2: { comments: undefined },
          },
        },
      };

      await act(async () => {
        comment.emit("update", updatedComment);
      });

      await new Promise((r) => setTimeout(r, 150));
      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-p1"]).toBeDefined();
    });

    test("update with replyPage null: replyPage?.comments?.length || 0 branch", async () => {
      const utilsMod = await import("../../lib/utils");
      vi.spyOn(utilsMod.default as any, "repliesAreValid").mockResolvedValue(true);

      const account = Object.values(accountsStore.getState().accounts)[0];
      const validReply = {
        cid: "reply-p1",
        author: { address: "r1" },
        communityAddress: "sub.eth",
        depth: 1,
        parentCid: "cid-null-page",
      };
      const comment = new Comment({
        cid: "cid-null-page",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
        depth: 0,
      });
      (comment as any).replies = {
        pages: {
          page1: { comments: [validReply] },
          page2: null,
        },
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-null-page",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-null-page", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-null-page": { accountId: account.id, accountCommentIndex: 0 },
        },
        accountsCommentsReplies: { ...s.accountsCommentsReplies, [account.id]: {} },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      const updatedComment = {
        cid: "cid-null-page",
        communityAddress: "sub.eth",
        depth: 0,
        author: { address: account.author.address },
        replies: {
          pages: {
            page1: { comments: [validReply] },
            page2: null,
          },
        },
      };

      await act(async () => {
        comment.emit("update", updatedComment);
      });

      await new Promise((r) => setTimeout(r, 150));
      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-p1"]).toBeDefined();
    });

    test("mapping wrong accountId: cleanup and return", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-wrong",
        author: { address: account.author.address },
      });
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-wrong",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-wrong", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-wrong": { accountId: "other-account-id", accountCommentIndex: 0 },
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      await act(async () => {
        comment.emit("update", { ...comment, cid: "cid-wrong" });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(accountsStore.getState().accountsCommentsUpdating["cid-wrong"]).toBeUndefined();
    });

    test("update with replies.pages undefined: uses empty object (branch 110)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-no-pages",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
        depth: 0,
      });
      (comment as any).replies = {};
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-no-pages",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-no-pages", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-no-pages": { accountId: account.id, accountCommentIndex: 0 },
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      await act(async () => {
        comment.emit("update", {
          ...comment,
          cid: "cid-no-pages",
          replies: {},
        });
      });

      await new Promise((r) => setTimeout(r, 50));
    });

    test("update with hasReplies and repliesAreValid: updates accountsCommentsReplies", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-replies",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
        depth: 0,
      });
      const validReply = {
        cid: "reply-1",
        author: { address: "r1" },
        communityAddress: "sub.eth",
        depth: 1,
        parentCid: "cid-replies",
      };
      (comment as any).replies = {
        pages: {
          page1: { comments: [validReply] },
        },
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-replies",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-replies", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-replies": { accountId: account.id, accountCommentIndex: 0 },
        },
        accountsCommentsReplies: {
          ...s.accountsCommentsReplies,
          [account.id]: {},
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      const updatedComment = {
        ...comment,
        cid: "cid-replies",
        communityAddress: "sub.eth",
        depth: 0,
        replies: {
          pages: {
            page1: { comments: [validReply] },
          },
        },
      };

      await act(async () => {
        comment.emit("update", updatedComment);
      });

      await new Promise((r) => setTimeout(r, 150));
      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-1"]).toBeDefined();
    });

    test("update with hasReplies but accountsCommentsReplies[account.id] missing: logs error", async () => {
      const utilsMod = await import("../../lib/utils");
      vi.spyOn(utilsMod.default as any, "repliesAreValid").mockResolvedValue(true);

      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-replies",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
        depth: 0,
      });
      (comment as any).replies = {
        pages: {
          page1: {
            comments: [
              {
                cid: "reply-1",
                author: { address: "r1" },
                communityAddress: "sub.eth",
                depth: 1,
                parentCid: "cid-replies",
              },
            ],
          },
        },
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-replies",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-replies", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-replies": { accountId: account.id, accountCommentIndex: 0 },
        },
        accountsCommentsReplies: {},
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      const updatedComment = {
        cid: "cid-replies",
        communityAddress: "sub.eth",
        depth: 0,
        author: { address: account.author.address },
        replies: {
          pages: {
            page1: {
              comments: [
                {
                  cid: "reply-1",
                  author: { address: "r1" },
                  communityAddress: "sub.eth",
                  depth: 1,
                  parentCid: "cid-replies",
                },
              ],
            },
          },
        },
      };

      await act(async () => {
        comment.emit("update", updatedComment);
      });

      await new Promise((r) => setTimeout(r, 150));
    });

    test("update with replyPage without comments: hits replyPage?.comments||0 branch", async () => {
      const utilsMod = await import("../../lib/utils");
      vi.spyOn(utilsMod.default as any, "repliesAreValid").mockResolvedValue(true);

      const account = Object.values(accountsStore.getState().accounts)[0];
      const subAddr = "sub-mixed-pages.eth";
      const comment = new Comment({
        cid: "cid-mixed-pages",
        author: { address: account.author.address },
        communityAddress: subAddr,
        depth: 0,
      });
      const validReply = {
        cid: "reply-from-p1",
        author: { address: "r1" },
        communityAddress: subAddr,
        depth: 1,
        parentCid: "cid-mixed-pages",
      };
      (comment as any).replies = {
        pages: {
          page1: { comments: [validReply] },
          page2: {},
        },
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-mixed-pages",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-mixed-pages", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-mixed-pages": { accountId: account.id, accountCommentIndex: 0 },
        },
        accountsCommentsReplies: {
          ...s.accountsCommentsReplies,
          [account.id]: {},
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      const updatedComment = {
        cid: "cid-mixed-pages",
        communityAddress: subAddr,
        depth: 0,
        author: { address: account.author.address },
        replies: {
          pages: {
            page1: { comments: [validReply] },
            page2: {},
          },
        },
      };

      await act(async () => {
        comment.emit("update", updatedComment);
      });

      await new Promise((r) => setTimeout(r, 150));
      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-from-p1"]).toBeDefined();
    });

    test("update with reply markedAsRead: preserves markedAsRead", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({
        cid: "cid-marked",
        author: { address: account.author.address },
        communityAddress: "sub.eth",
      });
      (comment as any).replies = {
        pages: {
          page1: { comments: [{ cid: "reply-read", author: { address: "r1" } }] },
        },
      };
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-marked",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-marked", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-marked": { accountId: account.id, accountCommentIndex: 0 },
        },
        accountsCommentsReplies: {
          ...s.accountsCommentsReplies,
          [account.id]: { "reply-read": { cid: "reply-read", markedAsRead: true } },
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      const updatedComment = {
        ...comment,
        cid: "cid-marked",
        replies: {
          pages: {
            page1: { comments: [{ cid: "reply-read", author: { address: "r1" } }] },
          },
        },
      };

      await act(async () => {
        comment.emit("update", updatedComment);
      });

      await new Promise((r) => setTimeout(r, 150));
      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-read"]?.markedAsRead).toBe(true);
    });

    test("account deleted during update: logs error and returns empty", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const comment = new Comment({ cid: "cid-del", author: { address: account.author.address } });
      await accountsDatabase.addAccountComment(account.id, {
        cid: "cid-del",
        index: 0,
        accountId: account.id,
        timestamp: 1,
        author: { address: account.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "cid-del", index: 0, accountId: account.id, timestamp: 1 }],
        },
        commentCidsToAccountsComments: {
          "cid-del": { accountId: account.id, accountCommentIndex: 0 },
        },
      }));

      await accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        account,
        0,
      );

      accountsStore.setState(({ accountsComments }) => {
        const next = { ...accountsComments };
        delete next[account.id];
        return { accountsComments: next };
      });

      await act(async () => {
        comment.emit("update", { ...comment, cid: "cid-del" });
      });

      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe("addCidToAccountComment", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("no-author: returns early when no account comments without cids for author", async () => {
      const comment = { cid: "new-cid", author: { address: "unknown-addr" }, timestamp: 999 };
      await accountsActionsInternal.addCidToAccountComment(comment as any);
      const { accountsComments } = accountsStore.getState();
      const allComments = Object.values(accountsComments).flat();
      expect(allComments.some((c: any) => c.cid === "new-cid")).toBe(false);
    });

    test("no-match: timestamp mismatch", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const ts = Math.floor(Date.now() / 1000);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [
            {
              timestamp: ts,
              index: 0,
              accountId: account.id,
              author: { address: account.author.address },
            },
          ],
        },
      }));

      const comment = {
        cid: "new-cid",
        author: { address: account.author.address },
        timestamp: ts + 100,
      };
      await accountsActionsInternal.addCidToAccountComment(comment as any);

      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments[0]?.cid).toBeUndefined();
    });

    test("match: adds cid and updates mapping", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const ts = Math.floor(Date.now() / 1000);
      const pendingComment = {
        timestamp: ts,
        index: 0,
        accountId: account.id,
        author: { address: account.author.address },
      };
      await accountsDatabase.addAccountComment(account.id, pendingComment as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [pendingComment],
        },
      }));

      const comment = new Comment({
        cid: "matched-cid",
        author: { address: account.author.address },
        timestamp: ts,
      });

      await accountsActionsInternal.addCidToAccountComment(comment);

      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments[0]?.cid).toBe("matched-cid");
      expect(accountsStore.getState().commentCidsToAccountsComments["matched-cid"]).toEqual({
        accountId: account.id,
        accountCommentIndex: 0,
      });
    });

    test("addCidToAccountComment startUpdatingAccountCommentOnCommentUpdateEvents error: logs", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const ts = Math.floor(Date.now() / 1000);
      const pendingComment = {
        timestamp: ts,
        index: 0,
        accountId: account.id,
        author: { address: account.author.address },
      };
      await accountsDatabase.addAccountComment(account.id, pendingComment as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [pendingComment],
        },
      }));

      const comment = new Comment({
        cid: "err-cid",
        author: { address: account.author.address },
        timestamp: ts,
      });
      vi.spyOn(comment, "update").mockRejectedValueOnce(new Error("update failed"));

      await accountsActionsInternal.addCidToAccountComment(comment);

      await new Promise((r) => setTimeout(r, 100));
    });

    test("addCidToAccountComment startUpdatingAccountCommentOnCommentUpdateEvents rejects: catch logs error", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const ts = Math.floor(Date.now() / 1000);
      const pendingComment = {
        timestamp: ts,
        index: 0,
        accountId: account.id,
        author: { address: account.author.address },
      };
      await accountsDatabase.addAccountComment(account.id, pendingComment as any);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [pendingComment],
        },
      }));

      const plainComment = {
        cid: "plain-cid",
        author: { address: account.author.address },
        timestamp: ts,
      };
      vi.spyOn(account.plebbit, "createComment").mockRejectedValueOnce(
        new Error("createComment failed"),
      );

      await accountsActionsInternal.addCidToAccountComment(plainComment as any);

      await new Promise((r) => setTimeout(r, 100));
    });

    test("getAccountsCommentsWithoutCids: no accountsComments returns early", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState((s) => ({
        ...s,
        accountsComments: undefined as any,
      }));

      const comment = { cid: "c1", author: { address: account.author.address }, timestamp: 1 };
      await accountsActionsInternal.addCidToAccountComment(comment as any);

      accountsStore.setState((s) => ({
        ...s,
        accountsComments: { [account.id]: [] },
      }));
    });

    test("getAccountsCommentsWithoutCids: account without author skips", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountNoAuthor = { ...account, id: "no-author-id", author: {} };
      accountsStore.setState((s) => ({
        accounts: { ...s.accounts, [accountNoAuthor.id]: accountNoAuthor },
        accountsComments: {
          ...s.accountsComments,
          [accountNoAuthor.id]: [{ timestamp: 1, index: 0, accountId: accountNoAuthor.id }],
        },
      }));

      const comment = { cid: "c1", author: { address: "some-addr" }, timestamp: 1 };
      await accountsActionsInternal.addCidToAccountComment(comment as any);

      const comments = accountsStore.getState().accountsComments[accountNoAuthor.id] || [];
      expect(comments[0]?.cid).toBeUndefined();
    });

    test("getAccountsCommentsWithoutCids: accountId in accountsComments but not in accounts continues (branch 261/262)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          "orphan-account-id": [{ timestamp: 1, index: 0, accountId: "orphan-account-id" }],
        },
      }));

      const comment = { cid: "c1", author: { address: account.author.address }, timestamp: 1 };
      await accountsActionsInternal.addCidToAccountComment(comment as any);
    });

    test("getAccountsCommentsWithoutCids: accountComment with cid skips block (branch 261 false)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ cid: "has-cid", timestamp: 1, index: 0, accountId: account.id }],
        },
      }));

      const comment = { cid: "c1", author: { address: account.author.address }, timestamp: 1 };
      await accountsActionsInternal.addCidToAccountComment(comment as any);
    });

    test("getAccountsCommentsWithoutCids: multiple accountComments without cid from same author (branch 266 false)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const account2 = { ...account, id: "second-account-id" };
      await accountsDatabase.addAccountComment(account.id, {
        timestamp: 1,
        index: 0,
        accountId: account.id,
        author: { address: account.author.address },
      } as any);
      await accountsDatabase.addAccountComment(account2.id, {
        timestamp: 2,
        index: 0,
        accountId: account2.id,
        author: { address: account2.author.address },
      } as any);
      accountsStore.setState((s) => ({
        accounts: { ...s.accounts, [account2.id]: account2 },
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [{ timestamp: 1, index: 0, accountId: account.id }],
          [account2.id]: [{ timestamp: 2, index: 0, accountId: account2.id }],
        },
      }));

      const comment = { cid: "c1", author: { address: account.author.address }, timestamp: 1 };
      await accountsActionsInternal.addCidToAccountComment(comment as any);
    });

    test("cache: same accountsComments returns cached", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const ts = Math.floor(Date.now() / 1000);
      accountsStore.setState((s) => ({
        accountsComments: {
          ...s.accountsComments,
          [account.id]: [
            {
              timestamp: ts,
              index: 0,
              accountId: account.id,
              author: { address: account.author.address },
            },
          ],
        },
      }));

      const commentNoMatch = {
        cid: "c1",
        author: { address: "other-addr" },
        timestamp: ts,
      };
      await accountsActionsInternal.addCidToAccountComment(commentNoMatch as any);
      await accountsActionsInternal.addCidToAccountComment(commentNoMatch as any);

      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments[0]?.cid).toBeUndefined();
    });
  });

  describe("markNotificationsAsRead", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("unread-only: marks only unread replies as read", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState((s) => ({
        accountsCommentsReplies: {
          ...s.accountsCommentsReplies,
          [account.id]: {
            "reply-1": { cid: "reply-1", markedAsRead: false },
            "reply-2": { cid: "reply-2", markedAsRead: true },
          },
        },
      }));

      await accountsActionsInternal.markNotificationsAsRead(account);

      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-1"]?.markedAsRead).toBe(true);
      expect(replies["reply-2"]?.markedAsRead).toBe(true);
    });

    test("all already read: no-op state update still runs", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState((s) => ({
        accountsCommentsReplies: {
          ...s.accountsCommentsReplies,
          [account.id]: {
            "reply-1": { cid: "reply-1", markedAsRead: true },
          },
        },
      }));

      await accountsActionsInternal.markNotificationsAsRead(account);

      const replies = accountsStore.getState().accountsCommentsReplies[account.id] || {};
      expect(replies["reply-1"]?.markedAsRead).toBe(true);
    });
  });

  describe("addCommunityRoleToAccountsCommunities", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("no community: returns early", async () => {
      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(null as any);
      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(undefined as any);
    });

    test("community with no roles property: treats as no roles (branch 337)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const community = { address: "sub.eth" } as any;
      accountsStore.setState((s) => ({
        accounts: {
          ...s.accounts,
          [account.id]: {
            ...account,
            communities: { "sub.eth": { role: { role: "admin" } } },
          },
        },
      }));

      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(community);

      const acc = accountsStore.getState().accounts[account.id];
      expect(acc?.communities?.["sub.eth"]).toBeUndefined();
    });

    test("community with no roles, account has no community: no-op (branch 340 false)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const community = { address: "other.eth" } as any;
      accountsStore.setState((s) => ({
        accounts: {
          ...s.accounts,
          [account.id]: { ...account, communities: {} },
        },
      }));

      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(community);

      const acc = accountsStore.getState().accounts[account.id];
      expect(acc?.communities?.["other.eth"]).toBeUndefined();
    });

    test("no-change: account already has role, no add/remove", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const community = {
        address: "sub.eth",
        roles: { [account.author.address]: { role: "admin" } },
      };
      accountsStore.setState((s) => ({
        accounts: {
          ...s.accounts,
          [account.id]: {
            ...account,
            communities: { "sub.eth": { role: { role: "admin" } } },
          },
        },
      }));

      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(community as any);

      const acc = accountsStore.getState().accounts[account.id];
      expect(acc?.communities?.["sub.eth"]).toBeDefined();
    });

    test("add: adds role when community has role for account", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const community = {
        address: "new-sub.eth",
        roles: { [account.author.address]: { role: "moderator" } },
      };
      accountsStore.setState((s) => ({
        accounts: {
          ...s.accounts,
          [account.id]: { ...account, communities: {} },
        },
      }));

      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(community as any);

      const acc = accountsStore.getState().accounts[account.id];
      expect(acc?.communities?.["new-sub.eth"]).toEqual({ role: { role: "moderator" } });
    });

    test("updates stored role when the community role changes", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const community = {
        address: "updated-role.eth",
        roles: { [account.author.address]: { role: "admin" } },
      };
      accountsStore.setState((s) => ({
        accounts: {
          ...s.accounts,
          [account.id]: {
            ...account,
            communities: { "updated-role.eth": { role: { role: "moderator" } } },
          },
        },
      }));

      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(community as any);

      const acc = accountsStore.getState().accounts[account.id];
      expect(acc?.communities?.["updated-role.eth"]).toEqual({ role: { role: "admin" } });
    });

    test("remove: removes role when community no longer has role", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const community = {
        address: "old-sub.eth",
        roles: {},
      };
      accountsStore.setState((s) => ({
        accounts: {
          ...s.accounts,
          [account.id]: {
            ...account,
            communities: { "old-sub.eth": { role: { role: "admin" } } },
          },
        },
      }));

      await accountsActionsInternal.addCommunityRoleToAccountsCommunities(community as any);

      const acc = accountsStore.getState().accounts[account.id];
      expect(acc?.communities?.["old-sub.eth"]).toBeUndefined();
    });
  });
});
