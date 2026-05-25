import { vi } from "vitest";
import testUtils from "../../lib/test-utils";
import accountsStore, { resetAccountsStore, resetAccountsDatabaseAndStore } from "./accounts-store";
import accountsDatabase from "./accounts-database";
import { setPkcJs } from "../../lib/pkc-js";
import PkcJsMock from "../../lib/pkc-js/pkc-js-mock";

describe("accounts-store", () => {
  beforeAll(async () => {
    setPkcJs(PkcJsMock);
    await testUtils.resetDatabasesAndStores();
    testUtils.silenceReactWarnings();
  });

  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("init and reset", () => {
    test("resetAccountsStore waits for init when BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING is set", async () => {
      // @ts-ignore
      window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING = true;

      const resetPromise = resetAccountsStore();

      await new Promise((r) => setTimeout(r, 50));
      // @ts-ignore
      expect(window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING).toBe(true);

      // @ts-ignore
      delete window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;

      await resetPromise;
      expect(
        accountsStore.getState().accounts && Object.keys(accountsStore.getState().accounts).length,
      ).toBeGreaterThan(0);
    });

    test("resetAccountsDatabaseAndStore waits for init when initializing", async () => {
      // @ts-ignore
      window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING = true;

      const resetPromise = resetAccountsDatabaseAndStore();

      await new Promise((r) => setTimeout(r, 50));
      // @ts-ignore
      delete window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;

      await resetPromise;
      expect(accountsStore.getState().accountIds?.length).toBeGreaterThan(0);
    });

    test("resetAccountsStore completes when not initializing", async () => {
      await resetAccountsStore();
      const state = accountsStore.getState();
      expect(state.accounts).toBeDefined();
      expect(state.accountIds).toBeDefined();
      expect(state.activeAccountId).toBeDefined();
    });
  });

  describe("store state", () => {
    test("accountsActions and accountsActionsInternal are attached", () => {
      const state = accountsStore.getState();
      expect(typeof state.accountsActions?.createAccount).toBe("function");
      expect(typeof state.accountsActions?.exportAccount).toBe("function");
      expect(
        typeof state.accountsActionsInternal?.startUpdatingAccountCommentOnCommentUpdateEvents,
      ).toBe("function");
      expect(typeof state.accountsActionsInternal?.addCidToAccountComment).toBe("function");
      expect(typeof state.accountsActionsInternal?.markNotificationsAsRead).toBe("function");
      expect(typeof state.accountsActionsInternal?.addCommunityRoleToAccountsCommunities).toBe(
        "function",
      );
    });

    test("init keeps cold edit history out of hot state but loads summaries", async () => {
      await testUtils.resetDatabasesAndStores();
      const accountId = accountsStore.getState().activeAccountId!;
      await accountsDatabase.addAccountEdit(accountId, {
        commentCid: "cold-edit-cid",
        spoiler: true,
        timestamp: 1,
      } as any);

      await resetAccountsStore();
      const state = accountsStore.getState();

      expect(state.accountsEdits[accountId]).toEqual({});
      expect(state.accountsEditsLoaded[accountId]).toBe(false);
      expect(state.accountsEditsSummaries[accountId]["cold-edit-cid"].spoiler.value).toBe(true);
    });
  });

  describe("init error handling", () => {
    test("initializeAccountsStore catch when startUpdatingAccountCommentOnCommentUpdateEvents rejects", async () => {
      await testUtils.resetDatabasesAndStores();
      await accountsStore.getState().accountsActions.publishComment({
        communityAddress: "sub.eth",
        content: "for-init-err",
        onChallenge: (ch: any, c: any) => c.publishChallengeAnswers(),
        onChallengeVerification: () => {},
      });
      await new Promise((r) => setTimeout(r, 150));
      const exported = await accountsStore.getState().accountsActions.exportAccount();
      await testUtils.resetDatabasesAndStores();

      await accountsStore.getState().accountsActions.importAccount(exported);
      await new Promise((r) => setTimeout(r, 50));

      const internalMod = await import("./accounts-actions-internal");
      vi.spyOn(
        internalMod,
        "startUpdatingAccountCommentOnCommentUpdateEvents",
      ).mockRejectedValueOnce(new Error("init update error"));

      await resetAccountsStore();
      await new Promise((r) => setTimeout(r, 100));
    });
  });

  describe("init edge cases", () => {
    test("IIFE returns early when BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE is set", async () => {
      // Flag is set from first init; import a query-qualified store module to exercise early-return branch
      // without resetting the localforage test driver installed by Vitest setup.
      // @ts-ignore
      expect(window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE).toBe(true);

      const mod = await import("./accounts-store?init-skip");
      const freshStore = mod.default;
      // New module instance; init was skipped so store has default empty state
      const state = freshStore.getState();
      expect(state.accounts).toEqual({});
      expect(state.accountIds).toEqual([]);
    });
  });
});
