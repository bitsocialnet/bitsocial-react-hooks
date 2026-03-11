import accountsDatabase from "./accounts-database";
import { setPlebbitJs, restorePlebbitJs } from "../../lib/plebbit-js";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";
import localForage from "localforage";
import { getDefaultPlebbitOptions } from "./account-generator";

describe("accounts-database", () => {
  beforeAll(() => setPlebbitJs(PlebbitJsMock));
  afterAll(() => restorePlebbitJs());

  beforeEach(async () => {
    await accountsDatabase.accountsMetadataDatabase.clear();
    await accountsDatabase.accountsDatabase.clear();
  });

  const makeAccount = (overrides: any = {}) => ({
    id: "acc-1",
    name: "Test Account",
    version: 4,
    author: {
      address: "address",
      wallets: { eth: undefined },
    },
    signer: { privateKey: "private key", address: "address" },
    plebbitOptions: getDefaultPlebbitOptions(),
    subscriptions: [],
    blockedAddresses: {},
    blockedCids: {},
    communities: {},
    mediaIpfsGatewayUrl: "https://ipfs.io",
    ...overrides,
  });

  describe("migrate", () => {
    test("no-op when no previous db (no activeAccountId in legacy metadata)", async () => {
      const prevMeta = localForage.createInstance({ name: "accountsMetadata" });
      await prevMeta.clear();
      await accountsDatabase.migrate();
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBeNull();
    });

    test("no-op when already migrated (activeAccountId in new metadata)", async () => {
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "existing");
      const prevMeta = localForage.createInstance({ name: "accountsMetadata" });
      await prevMeta.setItem("activeAccountId", "legacy-active");
      await prevMeta.setItem("accountIds", ["legacy-1"]);
      await accountsDatabase.migrate();
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBe("existing");
    });

    test("full migration from legacy DB names", async () => {
      const prevAccounts = localForage.createInstance({ name: "accounts" });
      const prevMeta = localForage.createInstance({ name: "accountsMetadata" });
      await accountsDatabase.accountsMetadataDatabase.clear();
      await prevAccounts.setItem("legacy-acc-1", {
        id: "legacy-acc-1",
        name: "Legacy",
        version: 4,
      });
      await prevMeta.setItem("activeAccountId", "legacy-acc-1");
      await prevMeta.setItem("accountIds", ["legacy-acc-1"]);
      await prevMeta.setItem("accountNamesToAccountIds", { Legacy: "legacy-acc-1" });
      await accountsDatabase.migrate();
      const migrated = await accountsDatabase.accountsDatabase.getItem("legacy-acc-1");
      expect(migrated).toBeDefined();
      expect(migrated.name).toBe("Legacy");
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBe("legacy-acc-1");
    });

    test("migrate skips per-account DBs when accountIds is not array", async () => {
      const prevAccounts = localForage.createInstance({ name: "accounts" });
      const prevMeta = localForage.createInstance({ name: "accountsMetadata" });
      await accountsDatabase.accountsMetadataDatabase.clear();
      await prevAccounts.setItem("legacy-na", { id: "legacy-na", name: "LegacyNA", version: 4 });
      await prevMeta.setItem("activeAccountId", "legacy-na");
      await prevMeta.setItem("accountIds", "not-an-array");
      await accountsDatabase.migrate();
      const migrated = await accountsDatabase.accountsDatabase.getItem("legacy-na");
      expect(migrated).toBeDefined();
    });

    test("migrates legacy per-account DBs (accountComments, accountVotes, etc)", async () => {
      const prevAccounts = localForage.createInstance({ name: "accounts" });
      const prevMeta = localForage.createInstance({ name: "accountsMetadata" });
      const prevAccountComments = localForage.createInstance({
        name: "accountComments-legacy-mig",
      });
      await accountsDatabase.accountsMetadataDatabase.clear();
      await prevAccounts.setItem("legacy-mig", { id: "legacy-mig", name: "LegacyMig", version: 4 });
      await prevMeta.setItem("activeAccountId", "legacy-mig");
      await prevMeta.setItem("accountIds", ["legacy-mig"]);
      await prevMeta.setItem("accountNamesToAccountIds", { LegacyMig: "legacy-mig" });
      await prevAccountComments.setItem("0", { cid: "mig-cid", content: "migrated" });
      await prevAccountComments.setItem("length", 1);
      await accountsDatabase.migrate();
      const newDb = localForage.createInstance({
        name: "plebbitReactHooks-accountComments-legacy-mig",
      });
      const migratedComment = await newDb.getItem("0");
      expect(migratedComment).toEqual({ cid: "mig-cid", content: "migrated" });
    });
  });

  describe("migrateAccount (via getAccounts)", () => {
    test("v1 migrates ipfsHttpClientsOptions to kuboRpcClientsOptions", async () => {
      const v1Account = {
        id: "v1-acc",
        name: "V1",
        version: 1,
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: {
          ipfsHttpClientsOptions: ["http://old:5001"],
          pubsubHttpClientsOptions: ["http://pubsub:5001"],
        },
      };
      await accountsDatabase.accountsDatabase.setItem("v1-acc", v1Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v1-acc"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v1-acc");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V1: "v1-acc",
      });
      const accounts = await accountsDatabase.getAccounts(["v1-acc"]);
      expect(accounts["v1-acc"].plebbitOptions.kuboRpcClientsOptions).toEqual(["http://old:5001"]);
      expect(accounts["v1-acc"].plebbitOptions.pubsubKuboRpcClientsOptions).toEqual([
        "http://pubsub:5001",
      ]);
      expect(accounts["v1-acc"].plebbitOptions.ipfsHttpClientsOptions).toBeUndefined();
      expect(accounts["v1-acc"].version).toBe(4);
    });

    test("v1 migration when plebbitOptions absent (branch 111)", async () => {
      const v1Account = {
        id: "v1-no-opts",
        name: "V1NoOpts",
        version: 1,
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
      };
      await accountsDatabase.accountsDatabase.setItem("v1-no-opts", v1Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v1-no-opts"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v1-no-opts");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V1NoOpts: "v1-no-opts",
      });
      const accounts = await accountsDatabase.getAccounts(["v1-no-opts"]);
      expect(accounts["v1-no-opts"].version).toBe(4);
    });

    test("migrateAccount when account.version is falsy uses 1 (branch 111)", async () => {
      const noVersionAccount = {
        id: "no-ver-acc",
        name: "NoVer",
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
      };
      await accountsDatabase.accountsDatabase.setItem("no-ver-acc", noVersionAccount);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["no-ver-acc"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "no-ver-acc");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        NoVer: "no-ver-acc",
      });
      const accounts = await accountsDatabase.getAccounts(["no-ver-acc"]);
      expect(accounts["no-ver-acc"].version).toBe(4);
    });

    test("v1 migration skips when ipfsHttpClientsOptions absent", async () => {
      const v1Account = {
        id: "v1-no-ipfs",
        name: "V1NoIpfs",
        version: 1,
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: { pubsubHttpClientsOptions: ["http://pubsub:5001"] },
      };
      await accountsDatabase.accountsDatabase.setItem("v1-no-ipfs", v1Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v1-no-ipfs"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v1-no-ipfs");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V1NoIpfs: "v1-no-ipfs",
      });
      const accounts = await accountsDatabase.getAccounts(["v1-no-ipfs"]);
      expect(accounts["v1-no-ipfs"].plebbitOptions.kuboRpcClientsOptions).toBeUndefined();
      expect(accounts["v1-no-ipfs"].plebbitOptions.pubsubKuboRpcClientsOptions).toEqual([
        "http://pubsub:5001",
      ]);
    });

    test("v1 migration skips when pubsubHttpClientsOptions absent", async () => {
      const v1Account = {
        id: "v1-no-pubsub",
        name: "V1NoPubsub",
        version: 1,
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: { ipfsHttpClientsOptions: ["http://ipfs:5001"] },
      };
      await accountsDatabase.accountsDatabase.setItem("v1-no-pubsub", v1Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v1-no-pubsub"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v1-no-pubsub");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V1NoPubsub: "v1-no-pubsub",
      });
      const accounts = await accountsDatabase.getAccounts(["v1-no-pubsub"]);
      expect(accounts["v1-no-pubsub"].plebbitOptions.kuboRpcClientsOptions).toEqual([
        "http://ipfs:5001",
      ]);
      expect(accounts["v1-no-pubsub"].plebbitOptions.pubsubKuboRpcClientsOptions).toBeUndefined();
    });

    test("v2 migration skips when wallets already exist", async () => {
      const v2Account = {
        id: "v2-with-wallets",
        name: "V2Wallets",
        version: 2,
        author: {
          address: "address",
          wallets: { eth: { address: "0x" }, sol: { address: "sol" } },
        },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: {},
      };
      (v2Account as any).address = "address";
      await accountsDatabase.accountsDatabase.setItem("v2-with-wallets", v2Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v2-with-wallets"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v2-with-wallets");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V2Wallets: "v2-with-wallets",
      });
      const accounts = await accountsDatabase.getAccounts(["v2-with-wallets"]);
      expect(accounts["v2-with-wallets"].author.wallets.eth).toEqual({ address: "0x" });
      expect(accounts["v2-with-wallets"].author.wallets.sol).toEqual({ address: "sol" });
    });

    test("v2 adds wallets when missing", async () => {
      const v2Account = {
        id: "v2-acc",
        name: "V2",
        version: 2,
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: {},
      };
      (v2Account as any).address = "address";
      await accountsDatabase.accountsDatabase.setItem("v2-acc", v2Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v2-acc"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v2-acc");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V2: "v2-acc",
      });
      const accounts = await accountsDatabase.getAccounts(["v2-acc"]);
      expect(accounts["v2-acc"].author.wallets).toBeDefined();
      expect(accounts["v2-acc"].author.wallets.sol).toBeUndefined();
      expect(accounts["v2-acc"].version).toBe(4);
    });

    test("v3 regenerates only eth wallet when timestamp is in ms", async () => {
      const v3Account = {
        id: "v3-acc",
        name: "V3",
        version: 3,
        author: {
          address: "address",
          wallets: {
            eth: { address: "0x", timestamp: 1e13, signature: {} },
            sol: { address: "sol", timestamp: 1e13, signature: {} },
          },
        },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: {},
      };
      await accountsDatabase.accountsDatabase.setItem("v3-acc", v3Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v3-acc"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v3-acc");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V3: "v3-acc",
      });
      const accounts = await accountsDatabase.getAccounts(["v3-acc"]);
      expect(accounts["v3-acc"].author.wallets.eth).toBeUndefined();
      expect(accounts["v3-acc"].author.wallets.sol.timestamp).toBe(1e13);
      expect(accounts["v3-acc"].version).toBe(4);
    });

    test("v3 migration skips when wallet timestamps already in seconds", async () => {
      const v3Account = {
        id: "v3-seconds",
        name: "V3Seconds",
        version: 3,
        author: {
          address: "address",
          wallets: {
            eth: { address: "0x", timestamp: 1000, signature: {} },
            sol: { address: "sol", timestamp: 1000, signature: {} },
          },
        },
        signer: { privateKey: "private key", address: "address" },
        plebbitOptions: {},
      };
      await accountsDatabase.accountsDatabase.setItem("v3-seconds", v3Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v3-seconds"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v3-seconds");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V3Seconds: "v3-seconds",
      });
      const accounts = await accountsDatabase.getAccounts(["v3-seconds"]);
      expect(accounts["v3-seconds"].author.wallets.eth.timestamp).toBe(1000);
      expect(accounts["v3-seconds"].author.wallets.sol.timestamp).toBe(1000);
    });
  });

  describe("addAccount", () => {
    test("sets activeAccountId when adding first account", async () => {
      const acc = makeAccount({ id: "first-acc", name: "First" });
      await accountsDatabase.addAccount(acc);
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBe(acc.id);
    });

    test("addAccount when accountIds is null (first account, branch 250)", async () => {
      await accountsDatabase.accountsMetadataDatabase.removeItem("accountIds");
      const acc = makeAccount({ id: "first-ever", name: "FirstEver" });
      await accountsDatabase.addAccount(acc);
      const accountIds = await accountsDatabase.accountsMetadataDatabase.getItem("accountIds");
      expect(accountIds).toEqual([acc.id]);
    });

    test("addAccount when account already in accountIds (update, branch 336)", async () => {
      const acc = makeAccount({ id: "update-acc", name: "Update" });
      await accountsDatabase.addAccount(acc);
      const updated = makeAccount({ id: "update-acc", name: "Updated" });
      await accountsDatabase.addAccount(updated);
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored.name).toBe("Updated");
    });

    test("rejects duplicate name", async () => {
      const acc1 = makeAccount({ id: "a1", name: "SameName" });
      const acc2 = makeAccount({ id: "a2", name: "SameName" });
      await accountsDatabase.addAccount(acc1);
      await expect(accountsDatabase.addAccount(acc2)).rejects.toThrow(
        "account name 'SameName' already exists in database",
      );
    });

    test("strips default plebbit options from stored account", async () => {
      const acc = makeAccount({ plebbitOptions: getDefaultPlebbitOptions() });
      await accountsDatabase.addAccount(acc);
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored.plebbitOptions).toBeUndefined();
    });

    test("plebbit error handler is invoked when plebbit emits error (func coverage)", async () => {
      const customOpts = {
        ...getDefaultPlebbitOptions(),
        ipfsGatewayUrls: ["https://custom.ipfs"],
      };
      const acc = makeAccount({ plebbitOptions: customOpts });
      const OrigPlebbit = (await import("../../lib/plebbit-js")).default.Plebbit;
      const WrapperPlebbit = async (opts: any) => {
        const p = await OrigPlebbit(opts);
        p.destroy = () => {
          p.emit("error", new Error("test error"));
          return Promise.resolve();
        };
        return p;
      };
      setPlebbitJs(WrapperPlebbit);
      try {
        await accountsDatabase.addAccount(acc);
        await new Promise((r) => setTimeout(r, 20));
        const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
        expect(stored).toBeDefined();
      } finally {
        setPlebbitJs(PlebbitJsMock);
      }
    });

    test("validates custom plebbit options and destroys plebbit instance", async () => {
      const customOpts = {
        ...getDefaultPlebbitOptions(),
        ipfsGatewayUrls: ["https://custom.ipfs"],
      };
      const acc = makeAccount({ plebbitOptions: customOpts });
      const destroySpy = vi.fn().mockResolvedValue(undefined);
      const OrigPlebbit = (await import("../../lib/plebbit-js")).default.Plebbit;
      const WrapperPlebbit = async (opts: any) => {
        const p = await OrigPlebbit(opts);
        p.destroy = destroySpy;
        return p;
      };
      setPlebbitJs(WrapperPlebbit);
      try {
        await accountsDatabase.addAccount(acc);
        expect(destroySpy).toHaveBeenCalled();
      } finally {
        setPlebbitJs(PlebbitJsMock);
      }
    });

    test("addAccount completes when plebbit.destroy rejects (no catch, gc only)", async () => {
      const customOpts = {
        ...getDefaultPlebbitOptions(),
        ipfsGatewayUrls: ["https://custom.ipfs"],
      };
      const acc = makeAccount({ plebbitOptions: customOpts });
      const OrigPlebbit = (await import("../../lib/plebbit-js")).default.Plebbit;
      const WrapperPlebbit = async (opts: any) => {
        const p = await OrigPlebbit(opts);
        p.destroy = () => Promise.reject(new Error("destroy failed"));
        return p;
      };
      setPlebbitJs(WrapperPlebbit);
      const handler = () => {}; // swallow unhandled rejection from destroy
      process.on("unhandledRejection", handler);
      try {
        await accountsDatabase.addAccount(acc);
        await new Promise((r) => setTimeout(r, 20));
        const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
        expect(stored).toBeDefined();
      } finally {
        process.off("unhandledRejection", handler);
        setPlebbitJs(PlebbitJsMock);
      }
    });
  });

  describe("removeAccount", () => {
    test("removeAccount when not removing active (branch 289 false)", async () => {
      const acc1 = makeAccount({ id: "r1", name: "First" });
      const acc2 = makeAccount({ id: "r2", name: "Second" });
      await accountsDatabase.addAccount(acc1);
      await accountsDatabase.addAccount(acc2);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "r1");
      await accountsDatabase.removeAccount(acc2);
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBe("r1");
    });

    test("switches activeAccountId to next account when removing active", async () => {
      const acc1 = makeAccount({ id: "r1", name: "First" });
      const acc2 = makeAccount({ id: "r2", name: "Second" });
      await accountsDatabase.addAccount(acc1);
      await accountsDatabase.addAccount(acc2);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "r1");
      await accountsDatabase.removeAccount(acc1);
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBe("r2");
    });

    test("clears activeAccountId when removing last account", async () => {
      const acc = makeAccount({ id: "r-only", name: "Only" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.removeAccount(acc);
      const active = await accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId");
      expect(active).toBeNull();
    });

    test("removeAccount when accountIds is null (branch 284)", async () => {
      const acc = makeAccount({ id: "r-null-ids", name: "RNullIds" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.accountsMetadataDatabase.removeItem("accountIds");
      await accountsDatabase.removeAccount(acc);
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored).toBeNull();
    });

    test("removeAccount when accountNamesToAccountIds is null (branch 277)", async () => {
      const acc = makeAccount({ id: "r-null-names", name: "RNullNames" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.accountsMetadataDatabase.removeItem("accountNamesToAccountIds");
      await accountsDatabase.removeAccount(acc);
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored).toBeNull();
    });

    test("cleans metadata and account-specific databases", async () => {
      const acc = makeAccount({ id: "r-clean", name: "Clean" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "cc1",
        content: "c",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      await accountsDatabase.addAccountVote(acc.id, {
        commentCid: "cid1",
        vote: 1,
        communityAddress: "sub",
      } as any);
      await accountsDatabase.removeAccount(acc);
      const accountIds = await accountsDatabase.accountsMetadataDatabase.getItem("accountIds");
      expect(accountIds).toEqual([]);
      const names = await accountsDatabase.accountsMetadataDatabase.getItem(
        "accountNamesToAccountIds",
      );
      expect(names).toEqual({});
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored).toBeNull();
    });
  });

  describe("addAccountVote / addAccountEdit serialization", () => {
    test("strips function fields from vote", async () => {
      const acc = makeAccount({ id: "vote-acc", name: "VoteAcc" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountVote(acc.id, {
        commentCid: "cid1",
        vote: 1,
        communityAddress: "sub",
        onChallenge: () => {},
        onChallengeVerification: () => {},
      } as any);
      const votes = await accountsDatabase.getAccountVotes(acc.id);
      expect(votes["cid1"]).toBeDefined();
      expect(votes["cid1"].onChallenge).toBeUndefined();
      expect(votes["cid1"].onChallengeVerification).toBeUndefined();
    });

    test("getAccountVotes returns empty when no votes (branch 444)", async () => {
      const acc = makeAccount({ id: "gv-empty", name: "GVEmpty" });
      await accountsDatabase.addAccount(acc);
      const votes = await accountsDatabase.getAccountVotes(acc.id);
      expect(votes).toEqual({});
    });

    test("getAccountEdits returns empty when no edits (branch 570)", async () => {
      const acc = makeAccount({ id: "ge-empty", name: "GEEmpty" });
      await accountsDatabase.addAccount(acc);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits).toEqual({});
    });

    test("addAccountVote with multiple votes hits getAccountVotes loop", async () => {
      const acc = makeAccount({ id: "vote-multi", name: "VoteMulti" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountVote(acc.id, {
        commentCid: "v1",
        vote: 1,
        communityAddress: "s",
      } as any);
      await accountsDatabase.addAccountVote(acc.id, {
        commentCid: "v2",
        vote: -1,
        communityAddress: "s",
      } as any);
      const votes = await accountsDatabase.getAccountVotes(acc.id);
      expect(votes["v1"]).toBeDefined();
      expect(votes["v2"]).toBeDefined();
    });

    test("strips function fields from edit", async () => {
      const acc = makeAccount({ id: "edit-acc", name: "EditAcc" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "cid1",
        content: "edited",
        communityAddress: "sub",
        onChallenge: () => {},
      } as any);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["cid1"]).toBeDefined();
      expect(Array.isArray(edits["cid1"])).toBe(true);
      expect(edits["cid1"][0].onChallenge).toBeUndefined();
    });
  });

  describe("getExportedAccountJson", () => {
    test("throws on invalid accountId", async () => {
      await expect(accountsDatabase.getExportedAccountJson(null as any)).rejects.toThrow(
        "getAccountJson argument accountId",
      );
    });

    test("throws when account not in database", async () => {
      await expect(accountsDatabase.getExportedAccountJson("nonexistent-id")).rejects.toThrow(
        "getAccountJson no account in database with accountId",
      );
    });

    test("returns JSON string when account exists", async () => {
      const acc = makeAccount({ id: "export-acc", name: "Export" });
      await accountsDatabase.addAccount(acc);
      const json = await accountsDatabase.getExportedAccountJson(acc.id);
      const parsed = JSON.parse(json);
      expect(parsed.account).toBeDefined();
      expect(parsed.account.name).toBe("Export");
      expect(parsed.accountComments).toBeDefined();
      expect(parsed.accountVotes).toBeDefined();
      expect(parsed.accountEdits).toBeDefined();
    });

    test("includes accountComments when account has comments (getDatabaseAsArray path)", async () => {
      const acc = makeAccount({ id: "export-comments", name: "ExportComments" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "ec1",
        content: "hello",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      const json = await accountsDatabase.getExportedAccountJson(acc.id);
      const parsed = JSON.parse(json);
      expect(parsed.accountComments).toHaveLength(1);
      expect(parsed.accountComments[0].cid).toBe("ec1");
    });
  });

  describe("account comments", () => {
    test("addAccountComment and getAccountComments", async () => {
      const acc = makeAccount({ id: "comments-acc", name: "Comments" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "cid1",
        content: "hello",
        communityAddress: "sub",
        timestamp: 1,
        author: { address: "addr" },
      } as any);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "cid2",
        content: "world",
        communityAddress: "sub",
        timestamp: 2,
        author: { address: "addr" },
      } as any);
      const comments = await accountsDatabase.getAccountComments(acc.id);
      expect(comments).toHaveLength(2);
      expect(comments[0].cid).toBe("cid1");
      expect(comments[1].cid).toBe("cid2");
    });

    test("addAccountComment asserts accountCommentIndex < length", async () => {
      const acc = makeAccount({ id: "edit-assert", name: "EditAssert" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "c1",
        content: "a",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      await expect(
        accountsDatabase.addAccountComment(
          acc.id,
          {
            cid: "c2",
            content: "b",
            communityAddress: "s",
            timestamp: 1,
            author: { address: "a" },
          } as any,
          5,
        ),
      ).rejects.toThrow("addAccountComment cannot edit comment");
    });

    test("addAccountComment with accountCommentIndex (edit path)", async () => {
      const acc = makeAccount({ id: "edit-comment-acc", name: "EditComment" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "c1",
        content: "original",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      await accountsDatabase.addAccountComment(
        acc.id,
        {
          cid: "c1",
          content: "edited",
          communityAddress: "s",
          timestamp: 1,
          author: { address: "a" },
        } as any,
        0,
      );
      const comments = await accountsDatabase.getAccountComments(acc.id);
      expect(comments[0].content).toBe("edited");
    });

    test("getAccountsComments asserts accountIds is array", async () => {
      await expect(accountsDatabase.getAccountsComments(null as any)).rejects.toThrow(
        "getAccountsComments invalid accountIds",
      );
    });

    test("getAccountsComments returns map by accountId", async () => {
      const acc1 = makeAccount({ id: "ac1", name: "A1" });
      const acc2 = makeAccount({ id: "ac2", name: "A2" });
      await accountsDatabase.addAccount(acc1);
      await accountsDatabase.addAccount(acc2);
      await accountsDatabase.addAccountComment(acc1.id, {
        cid: "c1",
        content: "a",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      const comments = await accountsDatabase.getAccountsComments([acc1.id, acc2.id]);
      expect(comments[acc1.id]).toHaveLength(1);
      expect(comments[acc2.id]).toHaveLength(0);
    });

    test("deleteAccountComment asserts index in range", async () => {
      const acc = makeAccount({ id: "del-assert", name: "DelAssert" });
      await accountsDatabase.addAccount(acc);
      await expect(accountsDatabase.deleteAccountComment(acc.id, 5)).rejects.toThrow(
        "deleteAccountComment accountCommentIndex",
      );
    });

    test("deleteAccountComment asserts index >= 0", async () => {
      const acc = makeAccount({ id: "del-neg", name: "DelNeg" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "c1",
        content: "a",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      await expect(accountsDatabase.deleteAccountComment(acc.id, -1)).rejects.toThrow(
        "deleteAccountComment accountCommentIndex",
      );
    });

    test("deleteAccountComment", async () => {
      const acc = makeAccount({ id: "del-acc", name: "Del" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "c1",
        content: "a",
        communityAddress: "s",
        timestamp: 1,
        author: { address: "a" },
      } as any);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "c2",
        content: "b",
        communityAddress: "s",
        timestamp: 2,
        author: { address: "a" },
      } as any);
      await accountsDatabase.deleteAccountComment(acc.id, 0);
      const comments = await accountsDatabase.getAccountComments(acc.id);
      expect(comments).toHaveLength(1);
      expect(comments[0].cid).toBe("c2");
    });
  });

  describe("account comments replies", () => {
    test("addAccountCommentReply and getAccountCommentsReplies", async () => {
      const acc = makeAccount({ id: "replies-acc", name: "Replies" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountCommentReply(acc.id, {
        cid: "reply-cid",
        commentCid: "parent",
        communityAddress: "sub",
      } as any);
      const replies = await accountsDatabase.getAccountCommentsReplies(acc.id);
      expect(replies["reply-cid"]).toBeDefined();
    });

    test("getAccountsCommentsReplies returns map by accountId", async () => {
      const acc1 = makeAccount({ id: "ar1", name: "AR1" });
      const acc2 = makeAccount({ id: "ar2", name: "AR2" });
      await accountsDatabase.addAccount(acc1);
      await accountsDatabase.addAccount(acc2);
      await accountsDatabase.addAccountCommentReply(acc1.id, {
        cid: "r1",
        commentCid: "p",
        communityAddress: "s",
      } as any);
      const replies = await accountsDatabase.getAccountsCommentsReplies([acc1.id, acc2.id]);
      expect(replies[acc1.id]["r1"]).toBeDefined();
      expect(Object.keys(replies[acc2.id] || {})).toHaveLength(0);
    });
  });

  describe("getAccount", () => {
    test("returns single account by id", async () => {
      const acc = makeAccount({ id: "ga-1", name: "GA1" });
      await accountsDatabase.addAccount(acc);
      const account = await accountsDatabase.getAccount(acc.id);
      expect(account.id).toBe(acc.id);
      expect(account.name).toBe("GA1");
    });

    test("plebbit error handler is invoked when error emitted (line 103)", async () => {
      const acc = makeAccount({ id: "err-acc", name: "ErrAcc" });
      await accountsDatabase.addAccount(acc);
      const account = await accountsDatabase.getAccount(acc.id);
      account.plebbit.emit("error", new Error("test plebbit error"));
    });
  });

  describe("getAccounts with no plebbitOptions in stored account", () => {
    test("applies getDefaultPlebbitOptions when stored account has no plebbitOptions", async () => {
      const acc = makeAccount({ id: "no-opts", name: "NoOpts" });
      const toStore = { ...acc, plebbit: undefined };
      delete (toStore as any).plebbitOptions;
      await accountsDatabase.accountsDatabase.setItem(acc.id, toStore);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", [acc.id]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", acc.id);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        NoOpts: acc.id,
      });
      const accounts = await accountsDatabase.getAccounts([acc.id]);
      expect(accounts[acc.id].plebbitOptions).toBeDefined();
      expect(accounts[acc.id].plebbitOptions.ipfsGatewayUrls).toBeDefined();
    });
  });

  describe("getAccountsVotes and getAccountsEdits", () => {
    test("getAccountsVotes returns map by accountId", async () => {
      const acc = makeAccount({ id: "gv-acc", name: "GV" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountVote(acc.id, {
        commentCid: "vc1",
        vote: 1,
        communityAddress: "s",
      } as any);
      const votes = await accountsDatabase.getAccountsVotes([acc.id]);
      expect(votes[acc.id]["vc1"]).toBeDefined();
    });

    test("getAccountsEdits returns map by accountId", async () => {
      const acc = makeAccount({ id: "ge-acc", name: "GE" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "ec1",
        content: "edit",
        communityAddress: "s",
      } as any);
      const edits = await accountsDatabase.getAccountsEdits([acc.id]);
      expect(edits[acc.id]["ec1"]).toBeDefined();
      expect(edits[acc.id]["ec1"]).toHaveLength(1);
    });

    test("getAccountEdits accumulates multiple edits for same commentCid", async () => {
      const acc = makeAccount({ id: "ge-multi", name: "GEMulti" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "edit1",
        communityAddress: "s",
      } as any);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "edit2",
        communityAddress: "s",
      } as any);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["same-cid"]).toHaveLength(2);
      expect(edits["same-cid"][0].content).toBe("edit1");
      expect(edits["same-cid"][1].content).toBe("edit2");
    });
  });
});
