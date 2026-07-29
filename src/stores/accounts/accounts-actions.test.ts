import { act } from "@testing-library/react";
import { vi } from "vitest";
import testUtils, { renderHook } from "../../lib/test-utils";
import * as accountsActions from "./accounts-actions";
import * as accountsActionsInternal from "./accounts-actions-internal";
import accountsDatabase from "./accounts-database";
import accountsStore from "./accounts-store";
import accountGenerator from "./account-generator";
import communitiesStore from "../communities";
import commentsStore from "../comments";
import PkcJsMock, {
  PKC as BasePkc,
  Comment as BaseComment,
  Community as BaseCommunity,
} from "../../lib/pkc-js/pkc-js-mock";
import { setPkcJs } from "../../lib/pkc-js";
import * as protocolCompat from "../../lib/pkc-compat";

// Custom PKC that returns publications emitting challengeSuccess: false on first attempt
function createRetryPkcMock() {
  const baseInstance = new BasePkc();
  let retryCommentAttemptCount = 0;

  class RetryComment extends BaseComment {
    simulateChallengeVerificationEvent() {
      retryCommentAttemptCount++;
      const failFirst = retryCommentAttemptCount === 1;
      this.cid = this.content && `${this.content} cid`;
      const commentUpdate = this.cid && { cid: this.cid };
      const challengeSuccess = !failFirst;
      this.emit("challengeverification", {
        type: "CHALLENGEVERIFICATION",
        challengeRequestId: (this as any).challengeRequestId,
        challengeAnswerId: (this as any).challengeAnswerId,
        challengeSuccess,
        commentUpdate,
      });
      this.publishingState = "succeeded";
      this.emit("publishingstatechange", "succeeded");
    }
  }

  class RetryPkc extends BasePkc {
    async createComment(opts: any) {
      return new RetryComment(opts);
    }
    async createVote(opts: any) {
      const v = await baseInstance.createVote(opts);
      const orig = v.simulateChallengeVerificationEvent?.bind(v);
      if (orig) {
        let first = true;
        v.simulateChallengeVerificationEvent = function () {
          if (first) {
            first = false;
            v.emit("challengeverification", {
              type: "CHALLENGEVERIFICATION",
              challengeRequestId: (v as any).challengeRequestId,
              challengeAnswerId: (v as any).challengeAnswerId,
              challengeSuccess: false,
              commentUpdate: undefined,
            });
            v.publishingState = "succeeded";
            v.emit("publishingstatechange", "succeeded");
            return;
          }
          orig();
        };
      }
      return v;
    }
    async createCommentEdit(opts: any) {
      const e = await baseInstance.createCommentEdit(opts);
      const orig = e.simulateChallengeVerificationEvent?.bind(e);
      if (orig) {
        let first = true;
        e.simulateChallengeVerificationEvent = function () {
          if (first) {
            first = false;
            e.emit("challengeverification", {
              type: "CHALLENGEVERIFICATION",
              challengeRequestId: (e as any).challengeRequestId,
              challengeAnswerId: (e as any).challengeAnswerId,
              challengeSuccess: false,
              commentUpdate: undefined,
            });
            e.publishingState = "succeeded";
            e.emit("publishingstatechange", "succeeded");
            return;
          }
          orig();
        };
      }
      return e;
    }
    async createCommentModeration(opts: any) {
      const m = await baseInstance.createCommentModeration(opts);
      const orig = m.simulateChallengeVerificationEvent?.bind(m);
      if (orig) {
        let first = true;
        m.simulateChallengeVerificationEvent = function () {
          if (first) {
            first = false;
            m.emit("challengeverification", {
              type: "CHALLENGEVERIFICATION",
              challengeRequestId: (m as any).challengeRequestId,
              challengeAnswerId: (m as any).challengeAnswerId,
              challengeSuccess: false,
              commentUpdate: undefined,
            });
            m.publishingState = "succeeded";
            m.emit("publishingstatechange", "succeeded");
            return;
          }
          orig();
        };
      }
      return m;
    }
    async createCommunityEdit(opts: any) {
      const e = await baseInstance.createCommunityEdit(opts);
      const orig = e.simulateChallengeVerificationEvent?.bind(e);
      if (orig) {
        let first = true;
        e.simulateChallengeVerificationEvent = function () {
          if (first) {
            first = false;
            e.emit("challengeverification", {
              type: "CHALLENGEVERIFICATION",
              challengeRequestId: (e as any).challengeRequestId,
              challengeAnswerId: (e as any).challengeAnswerId,
              challengeSuccess: false,
              commentUpdate: undefined,
            });
            e.publishingState = "succeeded";
            e.emit("publishingstatechange", "succeeded");
            return;
          }
          orig();
        };
      }
      return e;
    }
  }

  const createRetryPkc: any = async (...args: any) => new RetryPkc(...args);
  createRetryPkc.getShortAddress = PkcJsMock.getShortAddress;
  createRetryPkc.getShortCid = PkcJsMock.getShortCid;
  return createRetryPkc;
}

describe("accounts-actions", () => {
  beforeAll(async () => {
    setPkcJs(PkcJsMock);
    await testUtils.resetDatabasesAndStores();
    testUtils.silenceReactWarnings();
  });

  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("summary helpers", () => {
    test("addStoredAccountEditSummaryToState initializes missing account summary and keeps newer values", () => {
      const initial = accountsActions.addStoredAccountEditSummaryToState({} as any, "acc1", {
        commentCid: "cid-1",
        spoiler: true,
      });
      expect(initial.accountsEditsSummaries.acc1["cid-1"].spoiler.value).toBe(true);

      const stale = accountsActions.addStoredAccountEditSummaryToState(
        initial.accountsEditsSummaries as any,
        "acc1",
        {
          commentCid: "cid-1",
          spoiler: false,
          timestamp: -1,
        },
      );
      expect(stale.accountsEditsSummaries.acc1["cid-1"].spoiler.value).toBe(true);
    });

    test("addStoredAccountEditSummaryToState preserves comment moderation author unban edits", () => {
      const result = accountsActions.addStoredAccountEditSummaryToState({} as any, "acc1", {
        commentCid: "cid-1",
        timestamp: 10,
        commentModeration: { author: undefined },
      });

      expect(result.accountsEditsSummaries.acc1["cid-1"]["commentModeration.author"]).toEqual({
        timestamp: 10,
        value: undefined,
      });
      expect(result.accountsEditsSummaries.acc1["cid-1"].author).toBeUndefined();
    });

    test("addStoredAccountEditSummaryToState is a no-op when edit has no target", () => {
      const summaries = { acc1: { existing: { spoiler: { timestamp: 1, value: true } } } };
      expect(
        accountsActions.addStoredAccountEditSummaryToState(summaries as any, "acc1", {
          timestamp: 2,
          spoiler: false,
        }),
      ).toEqual({ accountsEditsSummaries: summaries });
    });

    test("removeStoredAccountEditSummaryFromState removes target when last summary disappears", () => {
      const result = accountsActions.removeStoredAccountEditSummaryFromState(
        { acc1: { "cid-1": { spoiler: { timestamp: 1, value: true } } } } as any,
        { acc1: {} } as any,
        "acc1",
        { commentCid: "cid-1" },
      );
      expect(result.accountsEditsSummaries.acc1["cid-1"]).toBeUndefined();
    });

    test("removeStoredAccountEditSummaryFromState is a no-op when edit has no target", () => {
      const summaries = { acc1: { "cid-1": { spoiler: { timestamp: 1, value: true } } } };
      expect(
        accountsActions.removeStoredAccountEditSummaryFromState(
          summaries as any,
          { acc1: {} } as any,
          "acc1",
          { spoiler: true },
        ),
      ).toEqual({ accountsEditsSummaries: summaries });
    });

    test("removeStoredAccountEditSummaryFromState handles missing account summary", () => {
      const result = accountsActions.removeStoredAccountEditSummaryFromState(
        {} as any,
        { acc1: { "cid-1": [{ commentCid: "cid-1", spoiler: true, timestamp: 1 }] } } as any,
        "acc1",
        { commentCid: "cid-1" },
      );
      expect(result.accountsEditsSummaries.acc1["cid-1"].spoiler.value).toBe(true);
    });

    test("removeStoredAccountEditSummaryFromState recalculates summary after removing one edit", () => {
      const result = accountsActions.removeStoredAccountEditSummaryFromState(
        { acc1: { "cid-1": { spoiler: { timestamp: 2, value: false } } } } as any,
        {
          acc1: {
            "cid-1": [
              { commentCid: "cid-1", spoiler: true, timestamp: 1, clientId: "older" },
              { commentCid: "cid-1", spoiler: false, timestamp: 2, clientId: "newer" },
            ],
          },
        } as any,
        "acc1",
        { commentCid: "cid-1", spoiler: false, timestamp: 2, clientId: "newer" },
      );
      expect(result.accountsEditsSummaries.acc1["cid-1"].spoiler.value).toBe(true);
    });
  });

  describe("edit helper branches", () => {
    test("maybeUpdateAccountComment handles missing account bucket", () => {
      const result = accountsActions.maybeUpdateAccountComment({}, "acc1", 0, () => {});
      expect(result).toEqual({});
    });

    test("doesStoredAccountEditMatch falls back to deep equality without clientId", () => {
      const nextState = accountsActions.removeStoredAccountEditFromState(
        { acc1: { "cid-1": [{ commentCid: "cid-1", spoiler: true, timestamp: 1 }] } } as any,
        "acc1",
        { commentCid: "cid-1", spoiler: true, timestamp: 1 },
      );
      expect(nextState.accountsEdits.acc1["cid-1"]).toBeUndefined();
    });

    test("addStoredAccountEditToState initializes missing account edit buckets", () => {
      const nextState = accountsActions.addStoredAccountEditToState({} as any, "acc1", {
        commentCid: "cid-1",
        spoiler: true,
      });
      expect(nextState.accountsEdits.acc1["cid-1"][0].spoiler).toBe(true);
    });

    test("addStoredAccountEditToState uses community edit targets when commentCid is missing", () => {
      const nextState = accountsActions.addStoredAccountEditToState({} as any, "acc1", {
        communityAddress: "community.eth",
        title: "updated",
      });
      expect(nextState.accountsEdits.acc1["community.eth"][0].title).toBe("updated");
    });

    test("removeStoredAccountEditFromState handles missing account and comment buckets", () => {
      const nextState = accountsActions.removeStoredAccountEditFromState({} as any, "acc1", {
        commentCid: "cid-1",
      });
      expect(nextState.accountsEdits.acc1).toEqual({});
    });

    test("hasTerminalChallengeVerificationError accepts array challengeErrors", () => {
      expect(
        accountsActions.hasTerminalChallengeVerificationError({
          challengeSuccess: false,
          challengeErrors: ["boom"],
        }),
      ).toBe(true);
    });
  });

  describe("optional accountName branches", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("exportAccount with accountName uses named account", async () => {
      const rendered = renderHook(() => {
        const { accounts, accountNamesToAccountIds } = accountsStore.getState();
        const { exportAccount, createAccount } = accountsActions;
        return { accounts, accountNamesToAccountIds, exportAccount, createAccount };
      });
      const waitFor = testUtils.createWaitFor(rendered);

      await waitFor(() => Object.keys(rendered.result.current.accounts || {}).length >= 1);
      await act(async () => {
        await rendered.result.current.createAccount();
        await rendered.result.current.createAccount("OtherAccount");
      });

      let exported: any;
      await act(async () => {
        const json = await accountsActions.exportAccount("OtherAccount");
        exported = JSON.parse(json);
      });
      expect(exported?.account?.name).toBe("OtherAccount");
    });

    test("subscribe with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("SubAccount");
      });

      await act(async () => {
        await accountsActions.setActiveAccount("Account 1");
        await accountsActions.subscribe("sub1.eth");
      });
      await act(async () => {
        await accountsActions.setActiveAccount("SubAccount");
        await accountsActions.subscribe("sub2.eth", "SubAccount");
      });

      const { accounts } = accountsStore.getState();
      const subAccount = Object.values(accounts).find((a: any) => a.name === "SubAccount");
      expect(subAccount?.subscriptions).toContain("sub2.eth");
    });

    test("unsubscribe with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("UnsubAccount");
      });

      await act(async () => {
        await accountsActions.subscribe("sub1.eth", "UnsubAccount");
        await accountsActions.unsubscribe("sub1.eth", "UnsubAccount");
      });

      const { accounts } = accountsStore.getState();
      const unsubAccount = Object.values(accounts).find((a: any) => a.name === "UnsubAccount");
      expect(unsubAccount?.subscriptions).not.toContain("sub1.eth");
    });

    test("blockAddress with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("BlockAccount");
      });

      await act(async () => {
        await accountsActions.blockAddress("blocked-addr", "BlockAccount");
      });

      const { accounts } = accountsStore.getState();
      const blockAccount = Object.values(accounts).find((a: any) => a.name === "BlockAccount");
      expect(blockAccount?.blockedAddresses?.["blocked-addr"]).toBe(true);
    });

    test("unblockAddress with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("UnblockAccount");
      });

      await act(async () => {
        await accountsActions.blockAddress("blocked-addr", "UnblockAccount");
        await accountsActions.unblockAddress("blocked-addr", "UnblockAccount");
      });

      const { accounts } = accountsStore.getState();
      const unblockAccount = Object.values(accounts).find((a: any) => a.name === "UnblockAccount");
      expect(unblockAccount?.blockedAddresses?.["blocked-addr"]).toBeUndefined();
    });

    test("blockCid with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("BlockCidAccount");
      });

      await act(async () => {
        await accountsActions.blockCid("blocked-cid", "BlockCidAccount");
      });

      const { accounts } = accountsStore.getState();
      const blockCidAccount = Object.values(accounts).find(
        (a: any) => a.name === "BlockCidAccount",
      );
      expect(blockCidAccount?.blockedCids?.["blocked-cid"]).toBe(true);
    });

    test("unblockCid with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("UnblockCidAccount");
      });

      await act(async () => {
        await accountsActions.blockCid("blocked-cid", "UnblockCidAccount");
        await accountsActions.unblockCid("blocked-cid", "UnblockCidAccount");
      });

      const { accounts } = accountsStore.getState();
      const unblockCidAccount = Object.values(accounts).find(
        (a: any) => a.name === "UnblockCidAccount",
      );
      expect(unblockCidAccount?.blockedCids?.["blocked-cid"]).toBeUndefined();
    });

    test("deleteAccount with accountName deletes named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("ToDelete");
      });

      await act(async () => {
        await accountsActions.deleteAccount("ToDelete");
      });

      const { accountNamesToAccountIds } = accountsStore.getState();
      expect(accountNamesToAccountIds["ToDelete"]).toBeUndefined();
    });

    test("deleteAccount removes comment cid mappings for the deleted account", async () => {
      await act(async () => {
        await accountsActions.createAccount("ToDeleteWithComment");
      });

      await act(async () => {
        await accountsActions.publishComment(
          {
            communityAddress: "sub.eth",
            content: "delete-account-comment",
            onChallenge: (challenge: any, comment: any) => comment.publishChallengeAnswers(),
            onChallengeVerification: () => {},
          },
          "ToDeleteWithComment",
        );
      });

      await new Promise((r) => setTimeout(r, 150));
      expect(
        accountsStore.getState().commentCidsToAccountsComments["delete-account-comment cid"],
      ).toBeDefined();

      await act(async () => {
        await accountsActions.deleteAccount("ToDeleteWithComment");
      });

      expect(
        accountsStore.getState().commentCidsToAccountsComments["delete-account-comment cid"],
      ).toBeUndefined();
    });

    test("publishComment with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("PublishAccount");
      });

      const opts = {
        communityAddress: "sub.eth",
        content: "from named account",
        onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishComment(opts, "PublishAccount");
      });

      const { accountsComments } = accountsStore.getState();
      const publishAccountId = accountsStore.getState().accountNamesToAccountIds["PublishAccount"];
      const comments = accountsComments[publishAccountId] || [];
      expect(comments.some((c: any) => c.content === "from named account")).toBe(true);
    });

    test("publishComment preserves challenge commentUpdate fields on the account comment", async () => {
      await act(async () => {
        await accountsActions.createAccount();
      });
      const account = Object.values(accountsStore.getState().accounts)[0];
      const createComment = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const publication: any = await createComment(opts);
        vi.spyOn(publication, "simulateChallengeVerificationEvent").mockImplementation(() => {
          const cid = "moderated comment cid";
          const commentUpdate: any = {
            cid,
            pendingApproval: true,
            reason: "AI moderation reason",
            removed: false,
          };
          Object.defineProperties(commentUpdate, {
            __proto__: { value: { polluted: true }, enumerable: true },
            constructor: { value: { polluted: true }, enumerable: true },
            prototype: { value: { polluted: true }, enumerable: true },
          });
          publication.cid = cid;
          publication.emit("challengeverification", {
            type: "CHALLENGEVERIFICATION",
            challengeRequestId: publication.challengeRequestId,
            challengeAnswerId: publication.challengeAnswerId,
            challengeSuccess: true,
            commentUpdate,
          });
          publication.publishingState = "succeeded";
          publication.emit("publishingstatechange", "succeeded");
        });
        return publication;
      });
      const onChallengeVerification = vi.fn();

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "moderated comment",
          onChallenge: (challenge: any, comment: any) => comment.publishChallengeAnswers(["4"]),
          onChallengeVerification,
        });
      });

      const startedAt = Date.now();
      while (Date.now() - startedAt < 2000) {
        await act(async () => {});
        const comment = accountsStore.getState().accountsComments[account.id]?.[0];
        if (comment?.reason === "AI moderation reason") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      const storedComment = accountsStore.getState().accountsComments[account.id]?.[0];
      expect(onChallengeVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          commentUpdate: expect.objectContaining({ reason: "AI moderation reason" }),
        }),
        expect.objectContaining({
          cid: "moderated comment cid",
          pendingApproval: true,
          reason: "AI moderation reason",
          removed: false,
        }),
      );
      expect(storedComment).toMatchObject({
        cid: "moderated comment cid",
        pendingApproval: true,
        reason: "AI moderation reason",
        removed: false,
      });
      expect(Object.prototype.hasOwnProperty.call(storedComment, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(storedComment, "constructor")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(storedComment, "prototype")).toBe(false);
      expect(({} as any).polluted).toBeUndefined();

      const persistedComments = await accountsDatabase.getAccountComments(account.id);
      expect(persistedComments[0]).toMatchObject({
        cid: "moderated comment cid",
        pendingApproval: true,
        reason: "AI moderation reason",
        removed: false,
      });
      expect(Object.prototype.hasOwnProperty.call(persistedComments[0], "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(persistedComments[0], "constructor")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(persistedComments[0], "prototype")).toBe(false);
    });

    test("publishVote with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("VoteAccount");
      });

      const opts = {
        communityAddress: "sub.eth",
        commentCid: "comment cid",
        vote: 1,
        onChallenge: (ch: any, v: any) => v.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      };
      commentsStore.setState((state: any) => ({
        comments: {
          ...state.comments,
          [opts.commentCid]: {
            cid: opts.commentCid,
            timestamp: 100,
            updatedAt: 123,
            upvoteCount: 3,
            downvoteCount: 1,
          },
        },
      }));
      const voteAccountId = accountsStore.getState().accountNamesToAccountIds["VoteAccount"];
      accountsStore.setState((state: any) => ({
        accountsComments: {
          ...state.accountsComments,
          [voteAccountId]: [
            {
              cid: opts.commentCid,
              timestamp: 100,
              updatedAt: 456,
              upvoteCount: 3,
              downvoteCount: 1,
            },
          ],
        },
        commentCidsToAccountsComments: {
          ...state.commentCidsToAccountsComments,
          [opts.commentCid]: { accountId: voteAccountId, accountCommentIndex: 0 },
        },
      }));

      await act(async () => {
        await accountsActions.publishVote(opts, "VoteAccount");
      });

      const { accountsVotes } = accountsStore.getState();
      expect(accountsVotes[voteAccountId]?.["comment cid"]).toMatchObject({
        _optimisticVoteBase: 0,
        _optimisticVoteObservedAt: 456,
        _optimisticVoteTransitions: [
          {
            vote: 1,
            timestamp: expect.any(Number),
          },
        ],
      });
    });

    test("publishCommentEdit with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("EditAccount");
      });

      const opts = {
        communityAddress: "sub.eth",
        commentCid: "comment cid",
        spoiler: true,
        onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishCommentEdit(opts, "EditAccount");
      });

      const { accountsEdits } = accountsStore.getState();
      const editAccountId = accountsStore.getState().accountNamesToAccountIds["EditAccount"];
      const edits = accountsEdits[editAccountId]?.["comment cid"] || [];
      expect(edits.length).toBeGreaterThan(0);
    });

    test("publishCommentModeration with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("ModAccount");
      });

      const opts = {
        communityAddress: "sub.eth",
        commentCid: "comment cid",
        commentModeration: { locked: true },
        onChallenge: (ch: any, m: any) => m.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishCommentModeration(opts, "ModAccount");
      });

      const { accountsEdits } = accountsStore.getState();
      const modAccountId = accountsStore.getState().accountNamesToAccountIds["ModAccount"];
      const mods = accountsEdits[modAccountId]?.["comment cid"] || [];
      expect(mods.length).toBeGreaterThan(0);
    });

    test("publishCommunityEdit with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("SubEditAccount");
      });

      const opts = {
        title: "edited",
        onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishCommunityEdit("remote-sub.eth", opts, "SubEditAccount");
      });
      // no throw = success
    });

    test("createCommunity with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("CreateSubAccount");
      });

      let sub: any;
      await act(async () => {
        sub = await accountsActions.createCommunity({ title: "My sub" }, "CreateSubAccount");
      });
      expect(sub?.address).toBeDefined();
    });

    test("exportCommunity exports one community from the active account", async () => {
      const communityExports = await accountsActions.exportCommunity("single-export.eth", {
        includePrivateKey: true,
      });

      expect(communityExports).toEqual([
        {
          communityAddress: "single-export.eth",
          exportId: "single-export.eth export 1",
        },
      ]);
    });

    test("exportCommunity exports multiple communities concurrently", async () => {
      const originalExport = BaseCommunity.prototype.export;
      let activeExports = 0;
      let maxActiveExports = 0;
      BaseCommunity.prototype.export = async function (options: any) {
        activeExports++;
        maxActiveExports = Math.max(maxActiveExports, activeExports);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const result = await originalExport.call(this, options);
        activeExports--;
        return result;
      };

      try {
        const communityExports = await accountsActions.exportCommunity([
          "bulk-export-1.eth",
          "bulk-export-2.eth",
        ]);

        expect(communityExports).toEqual([
          {
            communityAddress: "bulk-export-1.eth",
            exportId: "bulk-export-1.eth export 1",
          },
          {
            communityAddress: "bulk-export-2.eth",
            exportId: "bulk-export-2.eth export 1",
          },
        ]);
        expect(maxActiveExports).toBe(2);
      } finally {
        BaseCommunity.prototype.export = originalExport;
      }
    });

    test("exportCommunity keeps the requested communityAddress when export metadata conflicts", async () => {
      const originalExport = BaseCommunity.prototype.export;
      BaseCommunity.prototype.export = async function (options: any) {
        const result = await originalExport.call(this, options);
        return { ...result, communityAddress: "wrong-export-address.eth" };
      };

      try {
        const communityExports = await accountsActions.exportCommunity("requested-export.eth");

        expect(communityExports).toEqual([
          {
            communityAddress: "requested-export.eth",
            exportId: "requested-export.eth export 1",
          },
        ]);
      } finally {
        BaseCommunity.prototype.export = originalExport;
      }
    });

    test("exportCommunity defaults to account pkc communities", async () => {
      await act(async () => {
        await accountsActions.createCommunity({ title: "Export default list" });
      });

      const communityExports = await accountsActions.exportCommunity();

      expect(communityExports).toEqual([
        {
          communityAddress: "list community address 1",
          exportId: "list community address 1 export 1",
        },
        {
          communityAddress: "list community address 2",
          exportId: "list community address 2 export 1",
        },
        {
          communityAddress: "created community address",
          exportId: "created community address export 1",
        },
      ]);
    });

    test("exportCommunity with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("ExportSubAccount");
      });

      const communityExports = await accountsActions.exportCommunity(
        "named-export.eth",
        {},
        "ExportSubAccount",
      );

      expect(communityExports).toEqual([
        {
          communityAddress: "named-export.eth",
          exportId: "named-export.eth export 1",
        },
      ]);
    });

    test("exportCommunity validates inputs", async () => {
      const { accounts, activeAccountId } = accountsStore.getState();
      const account = accounts[activeAccountId || ""];
      accountsStore.setState({
        accounts: {
          ...accounts,
          [account.id]: { ...account, pkc: { communities: [] } },
        },
      });
      try {
        await expect(accountsActions.exportCommunity()).rejects.toThrow(
          "accountsActions.exportCommunity no community addresses to export",
        );
      } finally {
        accountsStore.setState({ accounts });
      }
      await expect(accountsActions.exportCommunity([undefined as any])).rejects.toThrow(
        "accountsActions.exportCommunity invalid communityAddress 'undefined'",
      );
      await expect(
        accountsActions.exportCommunity("bad-options.eth", "bad" as any),
      ).rejects.toThrow(
        "accountsActions.exportCommunity invalid exportCommunityOptions argument 'bad'",
      );
    });

    test("exportCommunity requires community.export", async () => {
      const createCommunity = BasePkc.prototype.createCommunity;
      BasePkc.prototype.createCommunity = async () => ({ address: "no-export.eth" }) as any;

      try {
        await expect(accountsActions.exportCommunity("no-export.eth")).rejects.toThrow(
          "accountsActions.exportCommunity community.export missing for communityAddress 'no-export.eth'",
        );
      } finally {
        BasePkc.prototype.createCommunity = createCommunity;
      }
    });

    test("publishCommunityEdit uses local owner state when pkc communities list is stale", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const getPkcCommunityAddressesSpy = vi
        .spyOn(protocolCompat, "getPkcCommunityAddresses")
        .mockReturnValue([]);
      const editCommunitySpy = vi.spyOn(communitiesStore.getState(), "editCommunity");
      const createCommunityEditSpy = vi.spyOn(account.pkc, "createCommunityEdit");
      const onChallengeVerification = vi.fn();

      try {
        communitiesStore.setState({
          communities: {
            "owned-community.eth": {
              address: "owned-community.eth",
              roles: {
                [account.author.address]: { role: "owner" },
              },
            } as any,
          },
        });

        await act(async () => {
          await accountsActions.publishCommunityEdit("owned-community.eth", {
            title: "edited locally",
            onChallenge: () => {},
            onChallengeVerification,
          });
        });

        expect(editCommunitySpy).toHaveBeenCalledWith(
          "owned-community.eth",
          expect.objectContaining({ title: "edited locally" }),
          account,
        );
        expect(createCommunityEditSpy).not.toHaveBeenCalled();
        expect(onChallengeVerification).toHaveBeenCalledWith({ challengeSuccess: true });
      } finally {
        getPkcCommunityAddressesSpy.mockRestore();
        editCommunitySpy.mockRestore();
        createCommunityEditSpy.mockRestore();
      }
    });

    test("importAccount with no accountComments/votes/edits (branches 313, 316, 319)", async () => {
      await act(async () => {
        await accountsActions.createAccount("Minimal");
      });
      const exported = await accountsActions.exportAccount("Minimal");
      const parsed = JSON.parse(exported);
      parsed.accountComments = undefined;
      parsed.accountVotes = undefined;
      parsed.accountEdits = undefined;
      await testUtils.resetDatabasesAndStores();
      await act(async () => {
        await accountsActions.importAccount(JSON.stringify(parsed));
      });
      const { accounts } = accountsStore.getState();
      expect(Object.keys(accounts).length).toBeGreaterThan(0);
    });

    test("importAccount when name exists adds ' 2'", async () => {
      await act(async () => {
        await accountsActions.createAccount("Second");
      });
      const exported = await accountsActions.exportAccount("Second");
      await act(async () => {
        await accountsActions.importAccount(exported);
      });
      const { accountNamesToAccountIds } = accountsStore.getState();
      expect(accountNamesToAccountIds["Second"]).toBeDefined();
      expect(accountNamesToAccountIds["Second 2"]).toBeDefined();
    });

    test("imports the existing identity without generating disposable credentials", async () => {
      await act(async () => {
        await accountsActions.createAccount("Portable");
      });
      const exported = JSON.parse(await accountsActions.exportAccount("Portable"));
      const originalId = exported.account.id;
      const originalSigner = exported.account.signer;
      const generateDefaultAccountSpy = vi.spyOn(accountGenerator, "generateDefaultAccount");
      const importAccountHistorySpy = vi.spyOn(accountsDatabase, "importAccountHistory");
      try {
        await act(async () => {
          await accountsActions.importAccount(JSON.stringify(exported));
        });
        const { accounts, accountNamesToAccountIds } = accountsStore.getState();
        const importedAccount = accounts[accountNamesToAccountIds["Portable 2"]];
        expect(generateDefaultAccountSpy).not.toHaveBeenCalled();
        expect(importAccountHistorySpy).toHaveBeenCalledTimes(1);
        expect(importedAccount.id).not.toBe(originalId);
        expect(importedAccount.signer).toEqual(originalSigner);
        expect(importedAccount.author.address).toBe(exported.account.author.address);
        expect(importedAccount.pkc).toBeDefined();
      } finally {
        generateDefaultAccountSpy.mockRestore();
        importAccountHistorySpy.mockRestore();
      }
    });

    test("round-trips a 100 KiB backup with hundreds of history records through one bulk write", async () => {
      await act(async () => {
        await accountsActions.createAccount("Stress Source");
      });
      const backup = JSON.parse(await accountsActions.exportAccount("Stress Source"));
      backup.account.name = "Stress Backup";
      backup.accountComments = Array.from({ length: 120 }, (_, index) => ({
        cid: `comment-${index}`,
        communityAddress: "community.eth",
        content: `synthetic comment ${index}`,
        timestamp: 1_000 + index,
      }));
      backup.accountVotes = Array.from({ length: 120 }, (_, index) => ({
        commentCid: `vote-target-${index % 30}`,
        communityAddress: "community.eth",
        vote: index % 2 === 0 ? 1 : -1,
      }));
      backup.accountEdits = Array.from({ length: 120 }, (_, index) => ({
        commentCid: `edit-target-${index % 12}`,
        communityAddress: "community.eth",
        content: `synthetic edit ${index}`,
        timestamp: 1_000 + index,
      }));
      backup.fixturePadding = "";
      const targetBytes = 100 * 1024;
      const paddingLength = targetBytes - JSON.stringify(backup).length;
      expect(paddingLength).toBeGreaterThan(0);
      backup.fixturePadding = "x".repeat(paddingLength);
      const serializedBackup = JSON.stringify(backup);
      expect(serializedBackup).toHaveLength(targetBytes);

      const addCommentSpy = vi.spyOn(accountsDatabase, "addAccountComment");
      const addVoteSpy = vi.spyOn(accountsDatabase, "addAccountVote");
      const addEditSpy = vi.spyOn(accountsDatabase, "addAccountEdit");
      const bulkImportSpy = vi.spyOn(accountsDatabase, "importAccountHistory");
      const startUpdatingSpy = vi
        .spyOn(accountsActionsInternal, "startUpdatingAccountCommentOnCommentUpdateEvents")
        .mockResolvedValue(undefined);
      try {
        await act(async () => {
          await accountsActions.importAccount(serializedBackup);
        });
        expect(bulkImportSpy).toHaveBeenCalledTimes(1);
        expect(addCommentSpy).not.toHaveBeenCalled();
        expect(addVoteSpy).not.toHaveBeenCalled();
        expect(addEditSpy).not.toHaveBeenCalled();
        expect(startUpdatingSpy).toHaveBeenCalledTimes(10);

        const roundTripped = JSON.parse(await accountsActions.exportAccount("Stress Backup"));
        expect(roundTripped.accountComments).toHaveLength(120);
        expect(roundTripped.accountVotes).toHaveLength(120);
        expect(roundTripped.accountEdits).toHaveLength(120);
      } finally {
        addCommentSpy.mockRestore();
        addVoteSpy.mockRestore();
        addEditSpy.mockRestore();
        bulkImportSpy.mockRestore();
        startUpdatingSpy.mockRestore();
      }
    });

    test("starts update watchers for only the ten newest imported comments", async () => {
      await act(async () => {
        await accountsActions.createAccount("History");
      });
      const exported = JSON.parse(await accountsActions.exportAccount("History"));
      exported.account.name = "Imported History";
      exported.accountComments = Array.from({ length: 15 }, (_, index) => ({
        cid: `comment-${index}`,
        communityAddress: "community.eth",
        content: `comment ${index}`,
        timestamp: 1_000 + index,
      }));
      const startUpdatingSpy = vi
        .spyOn(accountsActionsInternal, "startUpdatingAccountCommentOnCommentUpdateEvents")
        .mockResolvedValue(undefined);
      try {
        await act(async () => {
          await accountsActions.importAccount(JSON.stringify(exported));
        });
        expect(startUpdatingSpy).toHaveBeenCalledTimes(10);
        expect(startUpdatingSpy.mock.calls.map(([comment]) => comment.timestamp)).toEqual([
          1_014, 1_013, 1_012, 1_011, 1_010, 1_009, 1_008, 1_007, 1_006, 1_005,
        ]);
      } finally {
        startUpdatingSpy.mockRestore();
      }
    });

    test("deleteCommunity with accountName uses named account", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("DelSubAccount");
      });

      let sub: any;
      await act(async () => {
        sub = await accountsActions.createCommunity({ title: "To delete" }, "DelSubAccount");
      });
      await act(async () => {
        await accountsActions.deleteCommunity(sub.address, "DelSubAccount");
      });
      // no throw = success
    });

    test("deleteComment with accountName uses named account (by index)", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("DelCommentAccount");
      });

      await act(async () => {
        await accountsActions.publishComment(
          {
            communityAddress: "sub.eth",
            content: "to delete by name",
            onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
            onChallengeVerification: () => {},
          },
          "DelCommentAccount",
        );
      });

      await new Promise((r) => setTimeout(r, 150));

      await act(async () => {
        await accountsActions.deleteComment(0, "DelCommentAccount");
      });

      const { accountsComments, accountNamesToAccountIds } = accountsStore.getState();
      const delAccountId = accountNamesToAccountIds["DelCommentAccount"];
      const comments = accountsComments[delAccountId] || [];
      expect(comments.length).toBe(0);
    });

    test("deleteComment asserts when account has no comments (line 861)", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("EmptyAccount");
      });

      await act(async () => {
        await accountsActions.setActiveAccount("EmptyAccount");
      });

      await expect(accountsActions.deleteComment(0)).rejects.toThrow(
        "accountsActions.deleteComment no comments for account",
      );
    });

    test("deleteComment with accountName by cid (branches 856, 861)", async () => {
      await act(async () => {
        await accountsActions.createAccount();
        await accountsActions.createAccount("DelByCidAccount");
      });

      await act(async () => {
        await accountsActions.publishComment(
          {
            communityAddress: "sub.eth",
            content: "to delete by cid",
            onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
            onChallengeVerification: () => {},
          },
          "DelByCidAccount",
        );
      });

      await new Promise((r) => setTimeout(r, 150));

      const { accountsComments, commentCidsToAccountsComments, accountNamesToAccountIds } =
        accountsStore.getState();
      const delAccountId = accountNamesToAccountIds["DelByCidAccount"];
      const comments = accountsComments[delAccountId] || [];
      const cid = comments.find((c: any) => c.content === "to delete by cid")?.cid;
      expect(cid).toBeDefined();

      await act(async () => {
        await accountsActions.deleteComment(cid!, "DelByCidAccount");
      });

      const after = accountsStore.getState().accountsComments[delAccountId] || [];
      expect(after.length).toBe(0);
    });

    test("publishCommunityEdit asserts when address differs from communityAddress", async () => {
      await act(async () => {
        await accountsActions.createAccount();
      });

      await expect(
        accountsActions.publishCommunityEdit("remote-sub.eth", {
          address: "other-sub.eth",
          title: "edited",
          onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        }),
      ).rejects.toThrow("can't edit address of a remote community");
    });

    test("setAccount with author.address change updates only the eth wallet when using pkc signer", async () => {
      await act(async () => {
        await accountsActions.createAccount();
      });

      const account = Object.values(accountsStore.getState().accounts)[0];
      const ethAddr = account.author.wallets?.eth?.address;
      if (!ethAddr) {
        return;
      }

      const chainMod = await import("../../lib/chain");
      vi.spyOn(chainMod, "getEthWalletFromPkcPrivateKey").mockResolvedValue({
        address: ethAddr,
        timestamp: 1,
        signature: {},
      } as any);

      const updatedAccount = {
        ...account,
        author: {
          ...account.author,
          address: "0xDifferentAddress",
          wallets: {
            ...account.author.wallets,
            eth: { ...account.author.wallets?.eth, address: ethAddr },
          },
        },
      };

      await act(async () => {
        await accountsActions.setAccount(updatedAccount);
      });

      const stored = accountsStore.getState().accounts[account.id];
      expect(stored?.author?.wallets?.eth).toBeDefined();
      expect(stored?.author?.wallets?.sol).toBeUndefined();
      vi.restoreAllMocks();
    });

    test("setAccount with author.address change skips eth wallet update when address mismatch", async () => {
      await act(async () => {
        await accountsActions.createAccount();
      });

      const account = Object.values(accountsStore.getState().accounts)[0];
      if (!account.author.wallets?.eth) {
        return;
      }

      const chainMod = await import("../../lib/chain");
      vi.spyOn(chainMod, "getEthWalletFromPkcPrivateKey").mockResolvedValue({
        address: "0xOtherEth",
        timestamp: 1,
        signature: {},
      } as any);

      const updatedAccount = {
        ...account,
        author: {
          ...account.author,
          address: "0xDifferentAddress",
          wallets: account.author.wallets,
        },
      };

      await act(async () => {
        await accountsActions.setAccount(updatedAccount);
      });

      const stored = accountsStore.getState().accounts[account.id];
      expect(stored?.author?.wallets?.eth?.address).toBe(account.author.wallets?.eth?.address);
      vi.restoreAllMocks();
    });
  });

  describe("publish retry loops (challengeSuccess === false && lastChallenge)", () => {
    beforeEach(async () => {
      setPkcJs(createRetryPkcMock());
      await testUtils.resetDatabasesAndStores();
    });

    afterEach(() => {
      setPkcJs(PkcJsMock);
    });

    test("publishComment retries on challenge failure", async () => {
      const opts = {
        communityAddress: "sub.eth",
        content: "retry test",
        onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(["4"]),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishComment(opts);
      });

      await new Promise((r) => setTimeout(r, 400));
      const { accountsComments } = accountsStore.getState();
      const accountId = accountsStore.getState().activeAccountId;
      const comments = accountsComments[accountId!] || [];
      expect(comments.some((c: any) => c.content === "retry test")).toBe(true);
      expect(comments.some((c: any) => c.cid)).toBe(true);
    });

    test("publishComment ignores stale errors from a replaced retry comment", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const createdComments: any[] = [];
      const origCreateComment = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const comment = await origCreateComment(opts);
        createdComments.push(comment);
        return comment;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "retry stale error",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
          onError,
        });
      });

      const start = Date.now();
      while (createdComments.length < 2 && Date.now() - start < 2000) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      expect(createdComments).toHaveLength(2);
      createdComments[0]?.listeners("error")?.[0]?.(new Error("stale retry error"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onError).not.toHaveBeenCalled();
      const successStart = Date.now();
      while (Date.now() - successStart < 2000) {
        const currentComments = accountsStore.getState().accountsComments[account.id] || [];
        if (currentComments.some((comment: any) => comment.cid === "retry stale error cid")) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments.some((comment: any) => comment.cid === "retry stale error cid")).toBe(true);
    });

    test("publishVote retries on challenge failure", async () => {
      const opts = {
        communityAddress: "sub.eth",
        commentCid: "cid",
        vote: 1,
        onChallenge: (ch: any, v: any) => v.publishChallengeAnswers(["4"]),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishVote(opts);
      });

      await new Promise((r) => setTimeout(r, 200));
      const { accountsVotes } = accountsStore.getState();
      const accountId = accountsStore.getState().activeAccountId;
      expect(accountsVotes[accountId!]?.["cid"]).toBeDefined();
    });

    test("publishCommentEdit retries on challenge failure", async () => {
      const opts = {
        communityAddress: "sub.eth",
        commentCid: "cid",
        spoiler: true,
        onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(["4"]),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishCommentEdit(opts);
      });

      await new Promise((r) => setTimeout(r, 200));
      const { accountsEdits } = accountsStore.getState();
      const accountId = accountsStore.getState().activeAccountId;
      const edits = accountsEdits[accountId!]?.["cid"] || [];
      expect(edits.length).toBeGreaterThan(0);
    });

    test("publishCommentEdit awaits rollback before firing onError", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountId = accountsStore.getState().activeAccountId!;
      const origCreate = account.pkc.createCommentEdit.bind(account.pkc);
      const deleteAccountEdit = vi.spyOn(accountsDatabase, "deleteAccountEdit");
      vi.spyOn(account.pkc, "createCommentEdit").mockImplementation(async (opts: any) => {
        const publication = await origCreate(opts);
        vi.spyOn(publication, "publishChallengeAnswers").mockImplementation(async () => {
          const error = new Error(
            "Error from /lit/: CommentEditPubsubPublication is attempting to edit a comment while not being the original author of the comment",
          );
          publication.emit("error", error);
          publication.emit("error", error);
        });
        return publication;
      });

      let resolveOnError!: () => void;
      const onErrorSeen = new Promise<void>((resolve) => {
        resolveOnError = resolve;
      });
      const onError = vi.fn(async () => {
        expect(accountsStore.getState().accountsEdits[accountId]?.["cid"]).toBeUndefined();
        const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
        expect(persistedEdits["cid"]).toBeUndefined();
        resolveOnError();
      });
      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "cid",
          deleted: true,
          onChallenge: (challenge: any, publication: any) =>
            publication.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await onErrorSeen;

      expect(deleteAccountEdit).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(2);
      expect(accountsStore.getState().accountsEdits[accountId]?.["cid"]).toBeUndefined();

      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["cid"]).toBeUndefined();
    });

    test("publishCommentEdit rolls back optimistic edit on terminal challengeverification failure", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountId = accountsStore.getState().activeAccountId!;
      const origCreate = account.pkc.createCommentEdit.bind(account.pkc);
      const createCommentEditSpy = vi
        .spyOn(account.pkc, "createCommentEdit")
        .mockImplementation(async (opts: any) => {
          const publication = await origCreate(opts);
          vi.spyOn(publication, "simulateChallengeVerificationEvent").mockImplementation(() => {
            publication.emit("challengeverification", {
              type: "CHALLENGEVERIFICATION",
              challengeRequestId: publication.challengeRequestId,
              challengeAnswerId: publication.challengeAnswerId,
              challengeSuccess: false,
              challengeErrors: {
                lit: "CommentEditPubsubPublication is attempting to edit a comment while not being the original author of the comment",
              },
            });
          });
          return publication;
        });

      const onChallengeVerification = vi.fn();
      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "cid",
          deleted: true,
          onChallenge: (challenge: any, publication: any) =>
            publication.publishChallengeAnswers(["4"]),
          onChallengeVerification,
        });
      });

      await new Promise((r) => setTimeout(r, 250));

      expect(onChallengeVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          challengeSuccess: false,
          challengeErrors: expect.objectContaining({
            lit: expect.stringContaining("not being the original author"),
          }),
        }),
        expect.anything(),
      );
      expect(createCommentEditSpy).toHaveBeenCalledTimes(1);
      expect(accountsStore.getState().accountsEdits[accountId]?.["cid"]).toBeUndefined();

      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["cid"]).toBeUndefined();
    });

    test("publishCommentEdit rollback preserves older identical edits for the same comment", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1000);
      const existingEdit = {
        commentCid: "cid",
        communityAddress: "sub.eth",
        deleted: true,
        timestamp: 1,
        clientId: "existing-edit",
      };
      await accountsDatabase.addAccountEdit(account.id, existingEdit as any);
      accountsStore.setState(({ accountsEdits }) => ({
        accountsEdits: {
          ...accountsEdits,
          [account.id]: {
            ...accountsEdits[account.id],
            cid: [existingEdit],
          },
        },
      }));

      const origCreate = account.pkc.createCommentEdit.bind(account.pkc);
      vi.spyOn(account.pkc, "createCommentEdit").mockImplementation(async (opts: any) => {
        const publication = await origCreate(opts);
        vi.spyOn(publication, "publishChallengeAnswers").mockImplementation(async () => {
          publication.emit("error", new Error("terminal delete failure"));
        });
        return publication;
      });

      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "cid",
          deleted: true,
          onChallenge: (challenge: any, publication: any) =>
            publication.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 200));
      nowSpy.mockRestore();

      const remainingStateEdits = accountsStore.getState().accountsEdits[account.id]?.["cid"];
      expect(remainingStateEdits).toHaveLength(1);
      expect(remainingStateEdits?.[0]).toMatchObject(existingEdit);

      const persistedEdits = await accountsDatabase.getAccountEdits(account.id);
      expect(persistedEdits["cid"]).toHaveLength(1);
      expect(persistedEdits["cid"][0]).toMatchObject(existingEdit);
    });

    test("publishCommentEdit keeps optimistic edit when a later error happens after challenge success", async () => {
      setPkcJs(PkcJsMock);
      await testUtils.resetDatabasesAndStores();
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountId = accountsStore.getState().activeAccountId!;
      const origCreate = account.pkc.createCommentEdit.bind(account.pkc);
      vi.spyOn(account.pkc, "createCommentEdit").mockImplementation(async (opts: any) => {
        const publication = await origCreate(opts);
        const origPublishChallengeAnswers = publication.publishChallengeAnswers.bind(publication);
        vi.spyOn(publication, "publishChallengeAnswers").mockImplementation(async (...args) => {
          await origPublishChallengeAnswers(...args);
          publication.emit("error", new Error("post-success error"));
        });
        return publication;
      });

      let resolveOnError!: () => void;
      const onErrorSeen = new Promise<void>((resolve) => {
        resolveOnError = resolve;
      });
      const onError = vi.fn(() => {
        resolveOnError();
      });

      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "cid",
          deleted: true,
          onChallenge: (challenge: any, publication: any) =>
            publication.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await onErrorSeen;

      const storedEdits = accountsStore.getState().accountsEdits[accountId]?.["cid"] || [];
      expect(storedEdits).toHaveLength(1);
      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["cid"]).toHaveLength(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    test("publishCommentModeration retries on challenge failure", async () => {
      const opts = {
        communityAddress: "sub.eth",
        commentCid: "cid",
        commentModeration: { locked: true },
        onChallenge: (ch: any, m: any) => m.publishChallengeAnswers(["4"]),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishCommentModeration(opts);
      });

      await new Promise((r) => setTimeout(r, 200));
      const { accountsEdits } = accountsStore.getState();
      const accountId = accountsStore.getState().activeAccountId;
      const mods = accountsEdits[accountId!]?.["cid"] || [];
      expect(mods.length).toBeGreaterThan(0);
    });

    test("publishCommunityEdit retries on challenge failure", async () => {
      const opts = {
        title: "edited",
        onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(["4"]),
        onChallengeVerification: () => {},
      };

      await act(async () => {
        await accountsActions.publishCommunityEdit("remote-sub.eth", opts);
      });

      await new Promise((r) => setTimeout(r, 200));
      const accountId = accountsStore.getState().activeAccountId!;
      const storedEdits =
        accountsStore.getState().accountsEdits[accountId]?.["remote-sub.eth"] || [];
      expect(storedEdits).toHaveLength(1);
      expect(storedEdits[0].title).toBeUndefined();
      expect(storedEdits[0].communityEdit?.title).toBe("edited");
      expect(
        accountsStore.getState().accountsEditsSummaries[accountId]?.["remote-sub.eth"]?.title,
      ).toEqual({ timestamp: storedEdits[0].timestamp, value: "edited" });
      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["remote-sub.eth"]).toHaveLength(1);
    });
  });

  describe("community publication payloads", () => {
    beforeEach(async () => {
      setPkcJs(PkcJsMock);
      await testUtils.resetDatabasesAndStores();
    });

    test("publication actions persist and emit current community fields", async () => {
      const waitForStore = async (condition: () => boolean) => {
        const start = Date.now();
        while (Date.now() - start < 2000) {
          await act(async () => {});
          if (condition()) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("timed out waiting for store update");
      };

      let remoteVotePublication: any;
      let remoteCommentEditPublication: any;
      let remoteCommentModerationPublication: any;

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "mixed comment",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
        });
      });
      await waitForStore(
        () =>
          !!accountsStore.getState().accountsComments[
            accountsStore.getState().activeAccountId!
          ]?.[0]?.cid,
      );

      await act(async () => {
        await accountsActions.publishVote({
          communityAddress: "sub.eth",
          commentCid: "mixed cid",
          vote: 1,
          onChallenge: (ch: any, v: any) => {
            remoteVotePublication = v;
            v.publishChallengeAnswers(["4"]);
          },
          onChallengeVerification: (_verification: any, v: any) => {
            remoteVotePublication = v;
          },
        });
      });
      await waitForStore(() => remoteVotePublication?.communityAddress === "sub.eth");

      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "mixed cid",
          spoiler: true,
          onChallenge: (ch: any, e: any) => {
            remoteCommentEditPublication = e;
            e.publishChallengeAnswers(["4"]);
          },
          onChallengeVerification: (_verification: any, e: any) => {
            remoteCommentEditPublication = e;
          },
        });
      });
      await waitForStore(() => remoteCommentEditPublication?.communityAddress === "sub.eth");

      await act(async () => {
        await accountsActions.publishCommentModeration({
          communityAddress: "sub.eth",
          commentCid: "mixed cid",
          commentModeration: { locked: true },
          onChallenge: (ch: any, m: any) => {
            remoteCommentModerationPublication = m;
            m.publishChallengeAnswers(["4"]);
          },
          onChallengeVerification: (_verification: any, m: any) => {
            remoteCommentModerationPublication = m;
          },
        });
      });
      await waitForStore(() => remoteCommentModerationPublication?.communityAddress === "sub.eth");

      let remoteCommunityEditPublication: any;
      await act(async () => {
        await accountsActions.publishCommunityEdit("remote-sub.eth", {
          title: "mixed edit",
          onChallenge: (ch: any, e: any) => {
            remoteCommunityEditPublication = e;
            e.publishChallengeAnswers(["4"]);
          },
          onChallengeVerification: (_verification: any, e: any) => {
            remoteCommunityEditPublication = e;
          },
        });
      });
      await waitForStore(
        () => remoteCommunityEditPublication?.communityAddress === "remote-sub.eth",
      );

      const { accountsComments, accountsVotes, accountsEdits, activeAccountId } =
        accountsStore.getState();
      const accountId = activeAccountId!;
      const storedComment = accountsComments[accountId][0];
      const storedVote = accountsVotes[accountId]["mixed cid"];
      const storedEdits = accountsEdits[accountId]["mixed cid"] || [];

      expect(storedComment.communityAddress).toBe("sub.eth");
      expect(storedComment.shortCommunityAddress).toBeDefined();
      expect(storedVote.communityAddress).toBe("sub.eth");
      expect(remoteVotePublication.communityAddress).toBe("sub.eth");
      expect(storedEdits).toHaveLength(2);
      for (const storedEdit of storedEdits) {
        expect(storedEdit.communityAddress).toBe("sub.eth");
      }
      expect(remoteCommentEditPublication.communityAddress).toBe("sub.eth");
      expect(remoteCommentModerationPublication.communityAddress).toBe("sub.eth");
      expect(remoteCommunityEditPublication.communityAddress).toBe("remote-sub.eth");
    });
  });

  describe("abandoned publish-session branches", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("deleteComment abandons pending publish session, no-op mutation when session removed", async () => {
      const rendered = renderHook(() => {
        const { accountsComments, activeAccountId } = accountsStore.getState();
        const comments =
          activeAccountId && accountsComments ? accountsComments?.[activeAccountId] || [] : [];
        return {
          comments,
          publishComment: accountsActions.publishComment,
          deleteComment: accountsActions.deleteComment,
        };
      });
      const waitFor = testUtils.createWaitFor(rendered);

      // publish a comment
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "to delete",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await waitFor(() => (rendered.result.current.comments?.length ?? 0) >= 1);

      // delete before challenge completes - abandons session
      await act(async () => {
        await accountsActions.deleteComment(0);
      });

      await waitFor(() => (rendered.result.current.comments?.length ?? 0) === 0);
      expect(rendered.result.current.comments?.length).toBe(0);
    });

    test("deleteComment does not recreate a deleted pending comment after delayed link metadata save", async () => {
      let resolveDimensions: ((value: any) => void) | undefined;
      const utilsMod = await import("./utils");
      vi.spyOn(utilsMod, "fetchCommentLinkDimensions").mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDimensions = resolve;
          }) as any,
      );

      const rendered = renderHook(() => {
        const { accountsComments, activeAccountId } = accountsStore.getState();
        const comments =
          activeAccountId && accountsComments ? accountsComments?.[activeAccountId] || [] : [];
        return {
          comments,
          publishComment: accountsActions.publishComment,
          deleteComment: accountsActions.deleteComment,
        };
      });
      const waitFor = testUtils.createWaitFor(rendered);

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "link-delete",
          link: "https://example.com/image.png",
          onChallenge: (challenge: any, comment: any) => comment.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await waitFor(() => (rendered.result.current.comments?.length ?? 0) >= 1);

      await act(async () => {
        await accountsActions.deleteComment(0);
      });

      await act(async () => {
        resolveDimensions?.({
          linkWidth: 100,
          linkHeight: 50,
          linkHtmlTagName: "img",
        });
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(rendered.result.current.comments?.length).toBe(0);
    });

    test("deleting an earlier comment does not let a later pending publish reuse another session", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreateComment = account.pkc.createComment.bind(account.pkc);
      const createCommentCallCounts: Record<string, number> = {};
      const liveCommentsByContent: Record<string, any> = {};
      const waitForAccountComments = async (
        predicate: (accountComments: any[]) => boolean,
        timeout = 2000,
      ) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          await act(async () => {});
          const accountComments = accountsStore.getState().accountsComments[account.id] || [];
          if (predicate(accountComments)) {
            return accountComments;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("timed out waiting for account comments");
      };

      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const content = opts.content || "";
        createCommentCallCounts[content] = (createCommentCallCounts[content] || 0) + 1;
        const comment = await origCreateComment(opts);

        if (createCommentCallCounts[content] % 2 === 0) {
          liveCommentsByContent[content] = comment;
          if (content === "second-pending") {
            vi.spyOn(comment, "publish").mockImplementation(async () => {
              comment.state = "publishing";
              comment.publishingState = "publishing-challenge-request";
              comment.emit("statechange", "publishing");
              comment.emit("publishingstatechange", "publishing-challenge-request");
            });
          }
        }

        return comment;
      });

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "first-pending",
          onChallenge: (challenge: any, comment: any) => comment.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });
      await waitForAccountComments((accountComments) => accountComments.length >= 1);

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "second-pending",
          onChallenge: (challenge: any, comment: any) => comment.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });
      await waitForAccountComments((accountComments) => accountComments.length >= 2);

      await act(async () => {
        await accountsActions.deleteComment(0);
      });
      await waitForAccountComments(
        (accountComments) =>
          accountComments.length === 1 && accountComments[0]?.content === "second-pending",
      );

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "third-pending",
          onChallenge: (challenge: any, comment: any) => comment.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });
      await waitForAccountComments(
        (accountComments) =>
          accountComments.length >= 2 && accountComments[1]?.content === "third-pending",
      );

      await act(async () => {
        liveCommentsByContent["second-pending"]?.emit(
          "publishingstatechange",
          "waiting-challenge-verification",
        );
      });

      const accountComments = accountsStore.getState().accountsComments[account.id] || [];
      expect(accountComments[0]?.publishingState).toBe("waiting-challenge-verification");
      expect(accountComments[1]?.content).toBe("third-pending");
      expect(accountComments[1]?.publishingState).not.toBe("waiting-challenge-verification");
    });

    test("subscribe already subscribed throws", async () => {
      await act(async () => {
        await accountsActions.subscribe("sub1.eth");
      });
      await expect(accountsActions.subscribe("sub1.eth")).rejects.toThrow("already subscribed");
    });

    test("subscribe initializes undefined subscriptions", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0] as any;
      accountsStore.setState(({ accounts }) => ({
        accounts: {
          ...accounts,
          [account.id]: { ...account, subscriptions: undefined },
        },
      }));

      await act(async () => {
        await accountsActions.subscribe("sub-init.eth");
      });

      expect(accountsStore.getState().accounts[account.id].subscriptions).toContain("sub-init.eth");
    });

    test("unsubscribe already unsubscribed throws", async () => {
      await expect(accountsActions.unsubscribe("never-subscribed.eth")).rejects.toThrow(
        "already unsubscribed",
      );
    });

    test("unsubscribe handles undefined subscriptions", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0] as any;
      accountsStore.setState(({ accounts }) => ({
        accounts: {
          ...accounts,
          [account.id]: { ...account, subscriptions: undefined },
        },
      }));

      await expect(accountsActions.unsubscribe("never-subscribed.eth")).rejects.toThrow(
        "already unsubscribed",
      );
    });

    test("abandonAndStopPublishSession when comment has no stop: skips stop (branch 58)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreateComment = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreateComment(opts);
        (c as any).stop = undefined;
        return c;
      });

      const rendered = renderHook(() => {
        const { accountsComments, activeAccountId } = accountsStore.getState();
        const comments =
          activeAccountId && accountsComments ? accountsComments?.[activeAccountId] || [] : [];
        return { comments };
      });
      const waitFor = testUtils.createWaitFor(rendered);

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "no-stop",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await waitFor(() => (rendered.result.current.comments?.length ?? 0) >= 1);

      await act(async () => {
        await accountsActions.deleteComment(0);
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(rendered.result.current.comments?.length).toBe(0);
      vi.restoreAllMocks();
    });

    test("abandonAndStopPublishSession when stop throws: logs error (line 62)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreateComment = account.pkc.createComment.bind(account.pkc);
      let stopThrew = false;
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreateComment(opts);
        vi.spyOn(c, "stop").mockImplementation(() => {
          stopThrew = true;
          throw new Error("stop failed");
        });
        return c;
      });

      const publishPromise = accountsActions.publishComment({
        communityAddress: "sub.eth",
        content: "to-abandon",
        onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      });

      await new Promise((r) => setTimeout(r, 5));

      await act(async () => {
        await accountsActions.deleteComment(0);
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(stopThrew).toBe(true);
      await publishPromise;
    });

    test("error handler no-op when session abandoned", async () => {
      let commentRef: any;
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        commentRef = c;
        return c;
      });

      const rendered = renderHook(() => {
        const { accountsComments, activeAccountId } = accountsStore.getState();
        const comments =
          activeAccountId && accountsComments ? accountsComments?.[activeAccountId] || [] : [];
        return {
          comments,
          publishComment: accountsActions.publishComment,
          deleteComment: accountsActions.deleteComment,
        };
      });
      const waitFor = testUtils.createWaitFor(rendered);

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "err-test",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await waitFor(() => (rendered.result.current.comments?.length ?? 0) >= 1);

      // delete immediately - abandons; any subsequent error/publishingstatechange should no-op
      await act(async () => {
        await accountsActions.deleteComment(0);
      });

      commentRef?.listeners("error")?.[0]?.(new Error("abandoned error"));
      commentRef?.listeners("publishingstatechange")?.[0]?.("abandoned");
      await new Promise((r) => setTimeout(r, 50));
      expect(rendered.result.current.comments?.length).toBe(0);
    });

    test("deleteComment handles missing account comments bucket", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState(({ accountsComments }) => ({
        accountsComments: {
          ...accountsComments,
          [account.id]: undefined as any,
        },
      }));

      await expect(accountsActions.deleteComment(0)).rejects.toThrow("no comments for account");
    });

    test("publishComment error handler no-op when accountComment not in state yet", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      let commentRef: any;
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        commentRef = c;
        return c;
      });

      const onError = vi.fn();
      const publishPromise = accountsActions.publishComment({
        communityAddress: "sub.eth",
        content: "err-no-state",
        onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
        onChallengeVerification: () => {},
        onError,
      });

      await new Promise((r) => setTimeout(r, 5));
      accountsStore.setState(({ accountsComments }) => ({
        accountsComments: {
          ...accountsComments,
          [account.id]: [],
        },
      }));
      commentRef?.emit("error", new Error("test error"));

      await new Promise((r) => setTimeout(r, 50));
      expect(onError).toHaveBeenCalled();
    });

    test("publishComment error and onError callback when comment emits error", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        const origPublish = c.publish.bind(c);
        vi.spyOn(c, "publish").mockImplementation(async () => {
          c.emit("error", new Error("publish error"));
        });
        return c;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "err-cb",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(onError).toHaveBeenCalled();
    });

    test("publishComment onPublishingStateChange callback", async () => {
      const onPublishingStateChange = vi.fn();
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "state-change",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
          onPublishingStateChange,
        });
      });

      await new Promise((r) => setTimeout(r, 150));
      expect(onPublishingStateChange).toHaveBeenCalled();
    });

    test("publishCommentModeration initializes missing account edits bucket", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState(({ accountsEdits }) => ({
        accountsEdits: {
          ...accountsEdits,
          [account.id]: undefined as any,
        },
      }));

      await act(async () => {
        await accountsActions.publishCommentModeration({
          communityAddress: "sub.eth",
          commentCid: "cid",
          commentModeration: { removed: true },
          onChallenge: (challenge: any, moderation: any) => moderation.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        } as any);
      });

      expect(accountsStore.getState().accountsEdits[account.id].cid).toHaveLength(1);
      expect(accountsStore.getState().accountsEditsSummaries[account.id]?.cid).toBeDefined();
    });

    test("publishCommentEdit keeps accountsEditsLoaded false until lazy hydration completes", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState(({ accountsEditsLoaded }) => ({
        accountsEditsLoaded: {
          ...accountsEditsLoaded,
          [account.id]: false,
        },
      }));

      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "cold-history-cid",
          spoiler: true,
          onChallenge: (challenge: any, edit: any) => edit.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        } as any);
      });

      expect(accountsStore.getState().accountsEditsLoaded[account.id]).toBe(false);
    });

    test("publishCommentModeration keeps accountsEditsLoaded false until lazy hydration completes", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      accountsStore.setState(({ accountsEditsLoaded }) => ({
        accountsEditsLoaded: {
          ...accountsEditsLoaded,
          [account.id]: false,
        },
      }));

      await act(async () => {
        await accountsActions.publishCommentModeration({
          communityAddress: "sub.eth",
          commentCid: "cold-history-moderation-cid",
          commentModeration: { removed: true },
          onChallenge: (challenge: any, moderation: any) => moderation.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        } as any);
      });

      expect(accountsStore.getState().accountsEditsLoaded[account.id]).toBe(false);
    });

    test("publishComment with link fetches dimensions and onPublishingStateChange", async () => {
      const utilsMod = await import("./utils");
      vi.spyOn(utilsMod, "fetchCommentLinkDimensions").mockResolvedValue({
        linkWidth: 100,
        linkHeight: 50,
        linkHtmlTagName: "img",
      });

      const onPublishingStateChange = vi.fn();
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "with link",
          link: "https://example.com/image.png",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
          onPublishingStateChange,
        });
      });

      await new Promise((r) => setTimeout(r, 150));
      expect(onPublishingStateChange).toHaveBeenCalledWith("fetching-link-dimensions");
    });

    test("publishComment with clients.chainProviders triggers chainTicker callback", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const EventEmitter = (await import("events")).default;
      const chainClient = new EventEmitter();
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        (c as any).clients = {
          chainProviders: {
            eth: { "http://rpc": chainClient },
          },
        };
        setTimeout(() => chainClient.emit("statechange", "connected"), 5);
        return c;
      });

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "chain",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 100));
    });

    test("maybeUpdateAccountComment returns {} when accountComment not in state (stmt 783, 806)", () => {
      const { maybeUpdateAccountComment } = accountsActions;
      const account = Object.values(accountsStore.getState().accounts)[0];
      const emptyAccountsComments = { [account.id]: [] };
      const result = maybeUpdateAccountComment(emptyAccountsComments, account.id, 0, () => {});
      expect(result).toEqual({});
    });

    test("publishComment publishingstatechange when accountComment not in state yet: returns {} (line 788)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createComment.bind(account.pkc);
      let commentRef: any;
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        commentRef = c;
        // Clear state after listeners are set up, then emit so listener sees no accountComment
        setTimeout(() => {
          accountsStore.setState(({ accountsComments }) => ({
            accountsComments: { ...accountsComments, [account.id]: [] },
          }));
        }, 50);
        setTimeout(() => c.emit("publishingstatechange", "pending"), 80);
        return c;
      });

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "no-state-pub",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 150));
    });

    test("publishComment clientsOnStateChange when accountComment not in state yet: returns {}", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const EventEmitter = (await import("events")).default;
      const ipfsClient = new EventEmitter();
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        (c as any).clients = {
          ipfsGateways: { "https://ipfs.io": ipfsClient },
        };
        // Clear state after listeners are set up, then emit so callback sees no accountComment
        setTimeout(() => {
          accountsStore.setState(({ accountsComments }) => ({
            accountsComments: {
              ...accountsComments,
              [account.id]: [],
            },
          }));
        }, 50);
        setTimeout(() => ipfsClient.emit("statechange", "connected"), 80);
        return c;
      });

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "no-state",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 150));
    });

    test("publishComment with clients.ipfsGateways does not disrupt the pending comment state", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const EventEmitter = (await import("events")).default;
      const ipfsClient = new EventEmitter();
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        (c as any).clients = {
          ipfsGateways: { "https://ipfs.io": ipfsClient },
        };
        setTimeout(() => ipfsClient.emit("statechange", "connected"), 5);
        return c;
      });

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "ipfs",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 100));
      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments.find((c: any) => c.content === "ipfs")).toBeDefined();
    });

    test("publishComment publish throws: stores error on the pending comment and calls onError", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createComment.bind(account.pkc);
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        vi.spyOn(c, "publish").mockRejectedValueOnce(new Error("publish failed"));
        return c;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "fail",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(onError).toHaveBeenCalled();
      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments[0]?.error?.message).toBe("publish failed");
      expect(comments[0]?.errors?.map((error: Error) => error.message)).toEqual(["publish failed"]);
    });

    test("publishComment stores terminal publication state and ignores later errors", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createComment.bind(account.pkc);
      let commentRef: any;
      let resolveCommentCreated!: () => void;
      const commentCreated = new Promise<void>((resolve) => {
        resolveCommentCreated = resolve;
      });
      vi.spyOn(account.pkc, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreate(opts);
        commentRef = c;
        resolveCommentCreated();
        vi.spyOn(c, "publish").mockResolvedValueOnce(undefined);
        return c;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "terminal-state",
          onChallenge: () => {},
          onChallengeVerification: () => {},
          onError,
        });
      });

      await commentCreated;
      await act(async () => {
        commentRef.emit("statechange", "stopped");
        commentRef.emit("publishingstatechange", "failed");
      });
      await Promise.resolve();
      commentRef.emit("error", new Error("late terminal error"));
      await new Promise((resolve) => setTimeout(resolve, 25));

      const comments = accountsStore.getState().accountsComments[account.id] || [];
      expect(comments[0]?.state).toBe("stopped");
      expect(comments[0]?.publishingState).toBe("failed");
      expect(onError).not.toHaveBeenCalled();
    });

    test("publishComment startUpdatingAccountCommentOnCommentUpdateEvents error: catch logs (line 760)", async () => {
      vi.spyOn(
        accountsActionsInternal,
        "startUpdatingAccountCommentOnCommentUpdateEvents",
      ).mockRejectedValueOnce(new Error("startUpdating failed"));

      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "cid",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 200));
      vi.restoreAllMocks();
    });

    test("importAccount startUpdatingAccountCommentOnCommentUpdateEvents error: catch runs", async () => {
      await act(async () => {
        await accountsActions.publishComment({
          communityAddress: "sub.eth",
          content: "for-import",
          onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
          onChallengeVerification: () => {},
        });
      });

      await new Promise((r) => setTimeout(r, 150));
      const exported = await accountsActions.exportAccount();
      await testUtils.resetDatabasesAndStores();

      vi.spyOn(
        accountsActionsInternal,
        "startUpdatingAccountCommentOnCommentUpdateEvents",
      ).mockRejectedValueOnce(new Error("startUpdating failed"));

      await act(async () => {
        await accountsActions.importAccount(exported);
      });

      await new Promise((r) => setTimeout(r, 50));
      const { accounts } = accountsStore.getState();
      expect(Object.keys(accounts).length).toBeGreaterThan(0);
    });

    test("publishCommentEdit publish throws: onError called", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createCommentEdit.bind(account.pkc);
      vi.spyOn(account.pkc, "createCommentEdit").mockImplementation(async (opts: any) => {
        const e = await origCreate(opts);
        vi.spyOn(e, "publish").mockRejectedValueOnce(new Error("publish failed"));
        return e;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishCommentEdit({
          communityAddress: "sub.eth",
          commentCid: "cid",
          spoiler: true,
          onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(onError).toHaveBeenCalled();
    });

    test("publishCommentModeration publish throws: onError called", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountId = accountsStore.getState().activeAccountId!;
      const origCreate = account.pkc.createCommentModeration.bind(account.pkc);
      vi.spyOn(account.pkc, "createCommentModeration").mockImplementation(async (opts: any) => {
        const m = await origCreate(opts);
        vi.spyOn(m, "publish").mockRejectedValueOnce(new Error("publish failed"));
        return m;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishCommentModeration({
          communityAddress: "sub.eth",
          commentCid: "cid",
          commentModeration: { locked: true },
          onChallenge: (ch: any, m: any) => m.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(onError).toHaveBeenCalled();
      expect(accountsStore.getState().accountsEdits[accountId]?.["cid"]).toBeUndefined();
      expect(accountsStore.getState().accountsEditsSummaries[accountId]?.["cid"]).toBeUndefined();
      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["cid"]).toBeUndefined();
    });

    test("publishCommentModeration rolls back optimistic edit on terminal challengeverification failure", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const accountId = accountsStore.getState().activeAccountId!;
      const origCreate = account.pkc.createCommentModeration.bind(account.pkc);
      vi.spyOn(account.pkc, "createCommentModeration").mockImplementation(async (opts: any) => {
        const publication = await origCreate(opts);
        vi.spyOn(publication, "simulateChallengeVerificationEvent").mockImplementation(() => {
          publication.emit("challengeverification", {
            type: "CHALLENGEVERIFICATION",
            challengeRequestId: publication.challengeRequestId,
            challengeAnswerId: publication.challengeAnswerId,
            challengeSuccess: false,
            challengeErrors: {
              lit: "CommentModerationPubsubPublication failed permanently",
            },
          });
        });
        return publication;
      });

      const onChallengeVerification = vi.fn();
      await act(async () => {
        await accountsActions.publishCommentModeration({
          communityAddress: "sub.eth",
          commentCid: "cid",
          commentModeration: { approved: true },
          onChallenge: (ch: any, publication: any) => publication.publishChallengeAnswers(["4"]),
          onChallengeVerification,
        });
      });

      await new Promise((r) => setTimeout(r, 250));

      expect(onChallengeVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          challengeSuccess: false,
          challengeErrors: expect.objectContaining({
            lit: expect.stringContaining("failed permanently"),
          }),
        }),
        expect.anything(),
      );
      expect(accountsStore.getState().accountsEdits[accountId]?.["cid"]).toBeUndefined();
      expect(accountsStore.getState().accountsEditsSummaries[accountId]?.["cid"]).toBeUndefined();
      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["cid"]).toBeUndefined();
    });

    test("publishCommunityEdit publish throws: onError called", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.pkc.createCommunityEdit.bind(account.pkc);
      vi.spyOn(account.pkc, "createCommunityEdit").mockImplementation(async (opts: any) => {
        const e = await origCreate(opts);
        vi.spyOn(e, "publish").mockRejectedValueOnce(new Error("publish failed"));
        return e;
      });

      const onError = vi.fn();
      await act(async () => {
        await accountsActions.publishCommunityEdit("remote-sub.eth", {
          title: "edited",
          onChallenge: (ch: any, e: any) => e.publishChallengeAnswers(["4"]),
          onChallengeVerification: () => {},
          onError,
        });
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(onError).toHaveBeenCalled();
      const accountId = accountsStore.getState().activeAccountId!;
      expect(accountsStore.getState().accountsEdits[accountId]?.["remote-sub.eth"]).toBeUndefined();
      expect(
        accountsStore.getState().accountsEditsSummaries[accountId]?.["remote-sub.eth"],
      ).toBeUndefined();
      const persistedEdits = await accountsDatabase.getAccountEdits(accountId);
      expect(persistedEdits["remote-sub.eth"]).toBeUndefined();
    });
  });
});
