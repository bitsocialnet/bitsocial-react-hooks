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

  describe("init with a listed account whose record is missing", () => {
    test("unlists the missing account instead of failing to initialize", async () => {
      await testUtils.resetDatabasesAndStores();
      const accountId = accountsStore.getState().activeAccountId!;
      const accountName = accountsStore.getState().accounts[accountId].name;
      const metadata = accountsDatabase.accountsMetadataDatabase;
      await metadata.setItem("accountIds", [accountId, "missing-account-id"]);
      await metadata.setItem("activeAccountId", "missing-account-id");
      await metadata.setItem("accountNamesToAccountIds", {
        [accountName]: accountId,
        "Missing Account": "missing-account-id",
      });

      await resetAccountsStore();

      const state = accountsStore.getState();
      expect(state.accountIds).toEqual([accountId]);
      expect(state.activeAccountId).toBe(accountId);
      expect(Object.keys(state.accounts)).toEqual([accountId]);
      expect(state.accountNamesToAccountIds).toEqual({ [accountName]: accountId });
      expect(await metadata.getItem("accountIds")).toEqual([accountId]);
      expect(await metadata.getItem("activeAccountId")).toBe(accountId);
      expect(await metadata.getItem("accountNamesToAccountIds")).toEqual({
        [accountName]: accountId,
      });
    });

    test("creates a default account when no listed account has a record", async () => {
      await testUtils.resetDatabasesAndStores();
      const metadata = accountsDatabase.accountsMetadataDatabase;
      await metadata.setItem("accountIds", ["missing-account-id"]);
      await metadata.setItem("activeAccountId", "missing-account-id");
      await metadata.setItem("accountNamesToAccountIds", {
        "Missing Account": "missing-account-id",
      });

      await resetAccountsStore();

      const state = accountsStore.getState();
      expect(state.accountIds).toHaveLength(1);
      expect(state.accountIds[0]).not.toBe("missing-account-id");
      expect(state.activeAccountId).toBe(state.accountIds[0]);
      expect(state.accounts[state.accountIds[0]]).toBeDefined();
    });

    // simulate a tab closed during removeAccount, after it unlisted the account but before it
    // dropped the account name and deleted the record
    const removeAccountUntilNameUnlisted = async (account: any) => {
      const metadata = accountsDatabase.accountsMetadataDatabase;
      const setItem = metadata.setItem.bind(metadata);
      const setItemSpy = vi
        .spyOn(metadata, "setItem")
        .mockImplementation(async (key: string, value: any) => {
          if (key === "accountNamesToAccountIds") {
            throw Error("tab closed");
          }
          return setItem(key, value);
        });
      try {
        await expect(accountsDatabase.removeAccount(account)).rejects.toThrow("tab closed");
      } finally {
        setItemSpy.mockRestore();
      }
      expect(await metadata.getItem("accountIds")).not.toContain(account.id);
      expect(await accountsDatabase.accountsDatabase.getItem(account.id)).not.toBeNull();
    };

    test("drops the name of an unlisted account so the name can be used again", async () => {
      await testUtils.resetDatabasesAndStores();
      await accountsStore.getState().accountsActions.createAccount("Doomed");
      const doomedId = accountsStore.getState().accountNamesToAccountIds.Doomed;
      await removeAccountUntilNameUnlisted(accountsStore.getState().accounts[doomedId]);

      await resetAccountsStore();

      const metadata = accountsDatabase.accountsMetadataDatabase;
      expect(accountsStore.getState().accountNamesToAccountIds.Doomed).toBeUndefined();
      expect(await metadata.getItem("accountNamesToAccountIds")).not.toHaveProperty("Doomed");
      await accountsStore.getState().accountsActions.createAccount("Doomed");
      const newDoomedId = accountsStore.getState().accountNamesToAccountIds.Doomed;
      expect(newDoomedId).toBeDefined();
      expect(newDoomedId).not.toBe(doomedId);
      expect(accountsStore.getState().accounts[newDoomedId].name).toBe("Doomed");
    });

    test("drops the name of an unlisted account when no account is listed", async () => {
      await testUtils.resetDatabasesAndStores();
      const { accounts, activeAccountId, accountsActions } = accountsStore.getState();
      await accountsActions.setAccount({ ...accounts[activeAccountId!], name: "Doomed" });
      const removedAccount = accountsStore.getState().accounts[activeAccountId!];
      await removeAccountUntilNameUnlisted(removedAccount);
      expect(await accountsDatabase.accountsMetadataDatabase.getItem("accountIds")).toEqual([]);

      await resetAccountsStore();

      const state = accountsStore.getState();
      expect(state.accountIds).toHaveLength(1);
      expect(state.accountIds[0]).not.toBe(removedAccount.id);
      expect(state.accountNamesToAccountIds.Doomed).toBeUndefined();
      await state.accountsActions.createAccount("Doomed");
      const newDoomedId = accountsStore.getState().accountNamesToAccountIds.Doomed;
      expect(newDoomedId).toBeDefined();
      expect(newDoomedId).not.toBe(removedAccount.id);
    });
  });

  describe("init edge cases", () => {
    test("IIFE returns early when BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE is set", async () => {
      // @ts-ignore
      expect(window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE).toBe(true);

      const configuredLocalforage = (await import("localforage")).default;
      vi.resetModules();
      vi.doMock("localforage", () => ({ default: configuredLocalforage }));

      try {
        const mod = await import("./accounts-store");
        const freshStore = mod.default;
        // New module instance; init was skipped so store has default empty state
        const state = freshStore.getState();
        expect(state.accounts).toEqual({});
        expect(state.accountIds).toEqual([]);
      } finally {
        vi.doUnmock("localforage");
      }
    });
  });
});
