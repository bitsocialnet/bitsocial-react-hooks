import { act } from "@testing-library/react";
import { vi } from "vitest";
import testUtils, { renderHook } from "../../lib/test-utils";
import * as accountsActions from "./accounts-actions";
import * as accountsActionsInternal from "./accounts-actions-internal";
import accountsStore from "./accounts-store";
import PlebbitJsMock, {
  Plebbit as BasePlebbit,
  Comment as BaseComment,
} from "../../lib/plebbit-js/plebbit-js-mock";
import { setPlebbitJs } from "../../lib/plebbit-js";

// Custom Plebbit that returns publications emitting challengeSuccess: false on first attempt
function createRetryPlebbitMock() {
  const baseInstance = new BasePlebbit();
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

  class RetryPlebbit extends BasePlebbit {
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

  const createRetryPlebbit: any = async (...args: any) => new RetryPlebbit(...args);
  createRetryPlebbit.getShortAddress = PlebbitJsMock.getShortAddress;
  createRetryPlebbit.getShortCid = PlebbitJsMock.getShortCid;
  return createRetryPlebbit;
}

describe("accounts-actions", () => {
  beforeAll(async () => {
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();
    testUtils.silenceReactWarnings();
  });

  afterAll(() => {
    testUtils.restoreAll();
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

      await act(async () => {
        await accountsActions.publishVote(opts, "VoteAccount");
      });

      const { accountsVotes } = accountsStore.getState();
      const voteAccountId = accountsStore.getState().accountNamesToAccountIds["VoteAccount"];
      expect(accountsVotes[voteAccountId]?.["comment cid"]).toBeDefined();
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

    test("setAccount with author.address change updates only the eth wallet when using plebbit signer", async () => {
      await act(async () => {
        await accountsActions.createAccount();
      });

      const account = Object.values(accountsStore.getState().accounts)[0];
      const ethAddr = account.author.wallets?.eth?.address;
      if (!ethAddr) {
        return;
      }

      const chainMod = await import("../../lib/chain");
      vi.spyOn(chainMod, "getEthWalletFromPlebbitPrivateKey").mockResolvedValue({
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
      vi.spyOn(chainMod, "getEthWalletFromPlebbitPrivateKey").mockResolvedValue({
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
      setPlebbitJs(createRetryPlebbitMock());
      await testUtils.resetDatabasesAndStores();
    });

    afterEach(() => {
      setPlebbitJs(PlebbitJsMock);
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
      // no throw = success
    });
  });

  describe("abandoned publish-session branches", () => {
    beforeEach(async () => {
      await testUtils.resetDatabasesAndStores();
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

    test("subscribe already subscribed throws", async () => {
      await act(async () => {
        await accountsActions.subscribe("sub1.eth");
      });
      await expect(accountsActions.subscribe("sub1.eth")).rejects.toThrow("already subscribed");
    });

    test("unsubscribe already unsubscribed throws", async () => {
      await expect(accountsActions.unsubscribe("never-subscribed.eth")).rejects.toThrow(
        "already unsubscribed",
      );
    });

    test("abandonAndStopPublishSession when comment has no stop: skips stop (branch 58)", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreateComment = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
        const c = await origCreateComment(opts);
        delete (c as any).stop;
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
      const origCreateComment = account.plebbit.createComment.bind(account.plebbit);
      let stopThrew = false;
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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

      await new Promise((r) => setTimeout(r, 50));
      expect(rendered.result.current.comments?.length).toBe(0);
    });

    test("publishComment error handler no-op when accountComment not in state yet", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      let commentRef: any;
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      let commentRef: any;
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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

    test("publishComment with clients.ipfsGateways triggers non-chainTicker callback", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const EventEmitter = (await import("events")).default;
      const ipfsClient = new EventEmitter();
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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
      const commentWithClients = comments.find((c: any) => c.clients?.ipfsGateways);
      expect(commentWithClients).toBeDefined();
    });

    test("publishComment publish throws: onError called", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.plebbit.createComment.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createComment").mockImplementation(async (opts: any) => {
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
      const origCreate = account.plebbit.createCommentEdit.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createCommentEdit").mockImplementation(async (opts: any) => {
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
      const origCreate = account.plebbit.createCommentModeration.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createCommentModeration").mockImplementation(async (opts: any) => {
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
    });

    test("publishCommunityEdit publish throws: onError called", async () => {
      const account = Object.values(accountsStore.getState().accounts)[0];
      const origCreate = account.plebbit.createCommunityEdit.bind(account.plebbit);
      vi.spyOn(account.plebbit, "createCommunityEdit").mockImplementation(async (opts: any) => {
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
    });
  });
});
