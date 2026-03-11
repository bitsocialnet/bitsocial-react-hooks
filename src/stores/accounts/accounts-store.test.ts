import { vi } from "vitest";
import testUtils from "../../lib/test-utils";
import accountsStore, { resetAccountsStore, resetAccountsDatabaseAndStore } from "./accounts-store";
import { setPlebbitJs } from "../../lib/plebbit-js";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";

describe("accounts-store", () => {
  beforeAll(async () => {
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();
    testUtils.silenceReactWarnings();
  });

  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("init and reset", () => {
    test("resetAccountsStore waits for init when PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING is set", async () => {
      // @ts-ignore
      window.PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING = true;

      const resetPromise = resetAccountsStore();

      await new Promise((r) => setTimeout(r, 50));
      // @ts-ignore
      expect(window.PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING).toBe(true);

      // @ts-ignore
      delete window.PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;

      await resetPromise;
      expect(
        accountsStore.getState().accounts && Object.keys(accountsStore.getState().accounts).length,
      ).toBeGreaterThan(0);
    });

    test("resetAccountsDatabaseAndStore waits for init when initializing", async () => {
      // @ts-ignore
      window.PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING = true;

      const resetPromise = resetAccountsDatabaseAndStore();

      await new Promise((r) => setTimeout(r, 50));
      // @ts-ignore
      delete window.PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;

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
    test("IIFE returns early when PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE is set", async () => {
      // Flag is set from first init; reset modules and re-import to exercise early-return branch
      vi.resetModules();
      // @ts-ignore
      expect(window.PLEBBIT_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE).toBe(true);

      const mod = await import("./accounts-store");
      const freshStore = mod.default;
      // New module instance; init was skipped so store has default empty state
      const state = freshStore.getState();
      expect(state.accounts).toEqual({});
      expect(state.accountIds).toEqual([]);
    });
  });
});
