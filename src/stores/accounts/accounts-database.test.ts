import accountsDatabase, { replaceDatabaseArraysWithRollback } from "./accounts-database";
import { setPkcJs, restorePkcJs } from "../../lib/pkc-js";
import PkcJsMock from "../../lib/pkc-js/pkc-js-mock";
import localForage from "localforage";
import { getDefaultChainProviders, getDefaultPkcOptions } from "./account-generator";

const createPerAccountDatabase = (databaseName: string, accountId: string) =>
  localForage.createInstance({
    name: accountsDatabase.getPerAccountDatabaseName(databaseName, accountId),
  });

describe("accounts-database", () => {
  beforeAll(() => setPkcJs(PkcJsMock));
  afterAll(() => restorePkcJs());

  beforeEach(async () => {
    await accountsDatabase.accountsMetadataDatabase.clear();
    await accountsDatabase.accountsDatabase.clear();
  });

  const makeAccount = (overrides: any = {}) => ({
    id: "acc-1",
    name: "Test Account",
    version: 6,
    author: {
      address: "address",
      wallets: { eth: undefined },
    },
    signer: { privateKey: "private key", address: "address" },
    chainProviders: getDefaultChainProviders(),
    pkcOptions: getDefaultPkcOptions(),
    subscriptions: [],
    blockedAddresses: {},
    blockedCids: {},
    savedComments: [],
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
      const newDb = createPerAccountDatabase("accountComments", "legacy-mig");
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
        pkcOptions: {
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
      expect(accounts["v1-acc"].pkcOptions.kuboRpcClientsOptions).toEqual(["http://old:5001"]);
      expect(accounts["v1-acc"].pkcOptions.pubsubKuboRpcClientsOptions).toEqual([
        "http://pubsub:5001",
      ]);
      expect(accounts["v1-acc"].pkcOptions.ipfsHttpClientsOptions).toBeUndefined();
      expect(accounts["v1-acc"].version).toBe(6);
    });

    test("v1 migration when pkcOptions absent (branch 111)", async () => {
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
      expect(accounts["v1-no-opts"].version).toBe(6);
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
      expect(accounts["no-ver-acc"].version).toBe(6);
    });

    test("v1 migration skips when ipfsHttpClientsOptions absent", async () => {
      const v1Account = {
        id: "v1-no-ipfs",
        name: "V1NoIpfs",
        version: 1,
        author: { address: "address" },
        signer: { privateKey: "private key", address: "address" },
        pkcOptions: { pubsubHttpClientsOptions: ["http://pubsub:5001"] },
      };
      await accountsDatabase.accountsDatabase.setItem("v1-no-ipfs", v1Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v1-no-ipfs"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v1-no-ipfs");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V1NoIpfs: "v1-no-ipfs",
      });
      const accounts = await accountsDatabase.getAccounts(["v1-no-ipfs"]);
      expect(accounts["v1-no-ipfs"].pkcOptions.kuboRpcClientsOptions).toBeUndefined();
      expect(accounts["v1-no-ipfs"].pkcOptions.pubsubKuboRpcClientsOptions).toEqual([
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
        pkcOptions: { ipfsHttpClientsOptions: ["http://ipfs:5001"] },
      };
      await accountsDatabase.accountsDatabase.setItem("v1-no-pubsub", v1Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v1-no-pubsub"]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", "v1-no-pubsub");
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V1NoPubsub: "v1-no-pubsub",
      });
      const accounts = await accountsDatabase.getAccounts(["v1-no-pubsub"]);
      expect(accounts["v1-no-pubsub"].pkcOptions.kuboRpcClientsOptions).toEqual([
        "http://ipfs:5001",
      ]);
      expect(accounts["v1-no-pubsub"].pkcOptions.pubsubKuboRpcClientsOptions).toBeUndefined();
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
        pkcOptions: {},
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
        pkcOptions: {},
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
      expect(accounts["v2-acc"].version).toBe(6);
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
        pkcOptions: {},
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
      expect(accounts["v3-acc"].version).toBe(6);
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
        pkcOptions: {},
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

    test("moves chain providers config out of pkcOptions during migration", async () => {
      const v4Account = {
        id: "v4-chain-providers",
        name: "V4ChainProviders",
        version: 4,
        author: { address: "address", wallets: {} },
        signer: { privateKey: "private key", address: "address" },
        pkcOptions: {
          ...getDefaultPkcOptions(),
          chainProviders: {
            eth: { urls: ["https://custom.eth"], chainId: 1 },
          },
          nameResolversChainProviders: {
            eth: { urls: ["https://resolver.eth"], chainId: 1 },
          },
        },
      };
      await accountsDatabase.accountsDatabase.setItem("v4-chain-providers", v4Account);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", ["v4-chain-providers"]);
      await accountsDatabase.accountsMetadataDatabase.setItem(
        "activeAccountId",
        "v4-chain-providers",
      );
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        V4ChainProviders: "v4-chain-providers",
      });
      const accounts = await accountsDatabase.getAccounts(["v4-chain-providers"]);
      expect(accounts["v4-chain-providers"].version).toBe(6);
      expect(accounts["v4-chain-providers"].chainProviders).toEqual({
        eth: { urls: ["https://custom.eth"], chainId: 1 },
      });
      expect(accounts["v4-chain-providers"].nameResolversChainProviders).toEqual({
        eth: { urls: ["https://resolver.eth"], chainId: 1 },
      });
      expect(accounts["v4-chain-providers"].pkcOptions.chainProviders).toBeUndefined();
      expect(accounts["v4-chain-providers"].pkcOptions.nameResolversChainProviders).toBeUndefined();
    });

    test("v5 adds the saved comments list and preserves an existing list", async () => {
      const missingSavedComments = makeAccount({ id: "v5-missing", version: 5 });
      delete missingSavedComments.savedComments;
      const existingSavedComments = makeAccount({
        id: "v5-existing",
        name: "Existing",
        version: 5,
        savedComments: ["comment-1"],
      });
      await accountsDatabase.accountsDatabase.setItem("v5-missing", missingSavedComments);
      await accountsDatabase.accountsDatabase.setItem("v5-existing", existingSavedComments);

      const accounts = await accountsDatabase.getAccounts(["v5-missing", "v5-existing"]);

      expect(accounts["v5-missing"].savedComments).toEqual([]);
      expect(accounts["v5-existing"].savedComments).toEqual(["comment-1"]);
      expect(accounts["v5-missing"].version).toBe(6);
      expect(accounts["v5-existing"].version).toBe(6);
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
      const accountNamesToAccountIds = await accountsDatabase.accountsMetadataDatabase.getItem(
        "accountNamesToAccountIds",
      );
      expect(accountNamesToAccountIds).toEqual({ Updated: "update-acc" });
    });

    test("ignores stale name mappings when a vacated name is reused", async () => {
      const existing = makeAccount({ id: "existing", name: "Current" });
      await accountsDatabase.addAccount(existing);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        Current: "existing",
        Vacated: "existing",
      });

      await accountsDatabase.addAccount(makeAccount({ id: "replacement", name: "Vacated" }));

      const accountNamesToAccountIds = await accountsDatabase.accountsMetadataDatabase.getItem(
        "accountNamesToAccountIds",
      );
      expect(accountNamesToAccountIds).toEqual({
        Current: "existing",
        Vacated: "replacement",
      });
    });

    test("rejects duplicate name", async () => {
      const acc1 = makeAccount({ id: "a1", name: "SameName" });
      const acc2 = makeAccount({ id: "a2", name: "SameName" });
      await accountsDatabase.addAccount(acc1);
      await expect(accountsDatabase.addAccount(acc2)).rejects.toThrow(
        "account name 'SameName' already exists in database",
      );
    });

    test("rejects duplicate name when its metadata mapping is missing", async () => {
      const existing = makeAccount({ id: "missing-map-existing", name: "MissingMap" });
      await accountsDatabase.addAccount(existing);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {});

      await expect(
        accountsDatabase.addAccount(
          makeAccount({ id: "missing-map-replacement", name: "MissingMap" }),
        ),
      ).rejects.toThrow("account name 'MissingMap' already exists in database");
      expect(await accountsDatabase.accountsDatabase.getItem("missing-map-replacement")).toBeNull();
    });

    test("strips default pkc options from stored account", async () => {
      const acc = makeAccount({ pkcOptions: getDefaultPkcOptions() });
      await accountsDatabase.addAccount(acc);
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored.pkcOptions).toBeUndefined();
    });

    test("strips default chain providers from stored account", async () => {
      const acc = makeAccount({ chainProviders: getDefaultChainProviders() });
      await accountsDatabase.addAccount(acc);
      const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
      expect(stored.chainProviders).toBeUndefined();
    });

    test("pkc error handler is invoked when pkc emits error (func coverage)", async () => {
      const customOpts = {
        ...getDefaultPkcOptions(),
        ipfsGatewayUrls: ["https://custom.ipfs"],
      };
      const acc = makeAccount({ pkcOptions: customOpts });
      const OrigPkc = (await import("../../lib/pkc-js")).default.PKC;
      const WrapperPkc = async (opts: any) => {
        const p = await OrigPkc(opts);
        p.destroy = () => {
          p.emit("error", new Error("test error"));
          return Promise.resolve();
        };
        return p;
      };
      setPkcJs(WrapperPkc);
      try {
        await accountsDatabase.addAccount(acc);
        await new Promise((r) => setTimeout(r, 20));
        const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
        expect(stored).toBeDefined();
      } finally {
        setPkcJs(PkcJsMock);
      }
    });

    test("validates custom pkc options and destroys pkc instance", async () => {
      const customOpts = {
        ...getDefaultPkcOptions(),
        ipfsGatewayUrls: ["https://custom.ipfs"],
      };
      const acc = makeAccount({ pkcOptions: customOpts });
      const destroySpy = vi.fn().mockResolvedValue(undefined);
      const OrigPkc = (await import("../../lib/pkc-js")).default.PKC;
      const WrapperPkc = async (opts: any) => {
        const p = await OrigPkc(opts);
        p.destroy = destroySpy;
        return p;
      };
      setPkcJs(WrapperPkc);
      try {
        await accountsDatabase.addAccount(acc);
        expect(destroySpy).toHaveBeenCalled();
      } finally {
        setPkcJs(PkcJsMock);
      }
    });

    test("addAccount completes when pkc.destroy rejects (no catch, gc only)", async () => {
      const customOpts = {
        ...getDefaultPkcOptions(),
        ipfsGatewayUrls: ["https://custom.ipfs"],
      };
      const acc = makeAccount({ pkcOptions: customOpts });
      const OrigPkc = (await import("../../lib/pkc-js")).default.PKC;
      const WrapperPkc = async (opts: any) => {
        const p = await OrigPkc(opts);
        p.destroy = () => Promise.reject(new Error("destroy failed"));
        return p;
      };
      setPkcJs(WrapperPkc);
      const handler = () => {}; // swallow unhandled rejection from destroy
      process.on("unhandledRejection", handler);
      try {
        await accountsDatabase.addAccount(acc);
        await new Promise((r) => setTimeout(r, 20));
        const stored = await accountsDatabase.accountsDatabase.getItem(acc.id);
        expect(stored).toBeDefined();
      } finally {
        process.off("unhandledRejection", handler);
        setPkcJs(PkcJsMock);
      }
    });

    test("returns one hydrated account client for import without destroying it", async () => {
      const acc = makeAccount({ id: "hydrated-import", name: "HydratedImport" });
      const destroySpy = vi.fn().mockResolvedValue(undefined);
      const OrigPkc = (await import("../../lib/pkc-js")).default.PKC;
      const WrapperPkc = async (opts: any) => {
        const pkc = await OrigPkc(opts);
        pkc.destroy = destroySpy;
        return pkc;
      };
      setPkcJs(WrapperPkc);
      try {
        const hydratedAccount = await accountsDatabase.addAccount(acc, {
          returnHydratedAccount: true,
        });
        expect(hydratedAccount).toMatchObject({
          id: acc.id,
          name: acc.name,
          author: acc.author,
          signer: acc.signer,
        });
        expect(hydratedAccount?.pkc).toBeDefined();
        expect(hydratedAccount?.pkcOptions).toEqual(getDefaultPkcOptions());
        expect(destroySpy).not.toHaveBeenCalled();
      } finally {
        setPkcJs(PkcJsMock);
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

    test("getAccountVotes tolerates missing latest-index metadata after a partial write", async () => {
      const acc = makeAccount({ id: "gv-missing-index", name: "GVMissingIndex" });
      await accountsDatabase.addAccount(acc);
      const votesDb = createPerAccountDatabase("accountVotes", acc.id);
      await votesDb.setItem("__storageVersion", 1);

      const votes = await accountsDatabase.getAccountVotes(acc.id);

      expect(votes).toEqual({});
    });

    test("getAccountEdits returns empty when no edits (branch 570)", async () => {
      const acc = makeAccount({ id: "ge-empty", name: "GEEmpty" });
      await accountsDatabase.addAccount(acc);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits).toEqual({});
    });

    test("getAccountEdits tolerates missing target-index metadata after a partial write", async () => {
      const acc = makeAccount({ id: "ge-missing-index", name: "GEMissingIndex" });
      await accountsDatabase.addAccount(acc);
      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      await editsDb.setItem("__storageVersion", 1);

      const edits = await accountsDatabase.getAccountEdits(acc.id);
      const summary = await accountsDatabase.getAccountEditsSummary(acc.id);

      expect(edits).toEqual({});
      expect(summary).toEqual({});
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

    test("migrates legacy duplicate vote and edit keys into compact indexes", async () => {
      const acc = makeAccount({ id: "legacy-history", name: "LegacyHistory" });
      await accountsDatabase.addAccount(acc);

      const votesDb = createPerAccountDatabase("accountVotes", acc.id);
      await votesDb.setItem("0", { commentCid: "vote-cid", vote: 1, timestamp: 1 });
      await votesDb.setItem("length", 1);
      await votesDb.setItem("vote-cid", { commentCid: "vote-cid", vote: 1, timestamp: 1 });

      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      await editsDb.setItem("0", { commentCid: "edit-cid", spoiler: true, timestamp: 10 });
      await editsDb.setItem("length", 1);
      await editsDb.setItem("edit-cid", [{ commentCid: "edit-cid", spoiler: true, timestamp: 10 }]);

      const votes = await accountsDatabase.getAccountVotes(acc.id);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      const editSummary = await accountsDatabase.getAccountEditsSummary(acc.id);

      expect(votes["vote-cid"].vote).toBe(1);
      expect(edits["edit-cid"]).toHaveLength(1);
      expect(editSummary["edit-cid"].spoiler.value).toBe(true);
      expect(await votesDb.getItem("vote-cid")).toBeNull();
      expect(await editsDb.getItem("edit-cid")).toBeNull();
    });

    test("ignores malformed legacy votes without commentCid when rebuilding compact indexes", async () => {
      const acc = makeAccount({ id: "legacy-vote-no-cid", name: "LegacyVoteNoCid" });
      await accountsDatabase.addAccount(acc);
      const votesDb = createPerAccountDatabase("accountVotes", acc.id);
      await votesDb.setItem("0", { vote: 1, timestamp: 1 });
      await votesDb.setItem("length", 1);

      const votes = await accountsDatabase.getAccountVotes(acc.id);

      expect(votes).toEqual({});
    });

    test("legacy edit entries without a target are ignored when rebuilding indexes", async () => {
      const acc = makeAccount({ id: "legacy-edit-no-target", name: "LegacyEditNoTarget" });
      await accountsDatabase.addAccount(acc);
      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      await editsDb.setItem("0", { spoiler: true, timestamp: 10 });
      await editsDb.setItem("length", 1);

      const edits = await accountsDatabase.getAccountEdits(acc.id);
      const summary = await accountsDatabase.getAccountEditsSummary(acc.id);

      expect(edits).toEqual({});
      expect(summary).toEqual({});
    });

    test("preserves sparse legacy edit indices when rebuilding compact indexes", async () => {
      const acc = makeAccount({ id: "legacy-edit-sparse", name: "LegacyEditSparse" });
      await accountsDatabase.addAccount(acc);
      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      await editsDb.setItem("0", { commentCid: "cid-a", spoiler: true, timestamp: 10 });
      await editsDb.setItem("2", { commentCid: "cid-b", nsfw: true, timestamp: 20 });
      await editsDb.setItem("length", 3);

      const edits = await accountsDatabase.getAccountEdits(acc.id);
      const summary = await accountsDatabase.getAccountEditsSummary(acc.id);

      expect(edits["cid-a"]).toEqual([{ commentCid: "cid-a", spoiler: true, timestamp: 10 }]);
      expect(edits["cid-b"]).toEqual([{ commentCid: "cid-b", nsfw: true, timestamp: 20 }]);
      expect(summary["cid-a"].spoiler.value).toBe(true);
      expect(summary["cid-b"].nsfw.value).toBe(true);
      expect(await editsDb.getItem("__targetToIndices")).toEqual({
        "cid-a": [0],
        "cid-b": [2],
      });
    });

    test("addAccountEdit keeps sparse legacy edit indices aligned when appending new edits", async () => {
      const acc = makeAccount({ id: "legacy-edit-sparse-append", name: "LegacyEditSparseAppend" });
      await accountsDatabase.addAccount(acc);
      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      await editsDb.setItem("0", { commentCid: "cid-a", spoiler: true, timestamp: 10 });
      await editsDb.setItem("2", { commentCid: "cid-b", nsfw: true, timestamp: 20 });
      await editsDb.setItem("length", 3);

      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "cid-c",
        content: "new",
        timestamp: 30,
      } as any);

      const edits = await accountsDatabase.getAccountEdits(acc.id);

      expect(edits["cid-a"]).toEqual([{ commentCid: "cid-a", spoiler: true, timestamp: 10 }]);
      expect(edits["cid-b"]).toEqual([{ commentCid: "cid-b", nsfw: true, timestamp: 20 }]);
      expect(edits["cid-c"]).toEqual([{ commentCid: "cid-c", content: "new", timestamp: 30 }]);
      expect(await editsDb.getItem("__targetToIndices")).toEqual({
        "cid-a": [0],
        "cid-b": [2],
        "cid-c": [3],
      });
    });

    test("builds compact edit indexes for community and community targets", async () => {
      const acc = makeAccount({ id: "legacy-edit-targets", name: "LegacyEditTargets" });
      await accountsDatabase.addAccount(acc);
      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      await editsDb.setItem("0", {
        communityAddress: "community.eth",
        title: "community",
        timestamp: 10,
      });
      await editsDb.setItem("1", {
        communityAddress: "legacy-community.eth",
        description: "legacy",
        timestamp: 20,
      });
      await editsDb.setItem("length", 2);

      const edits = await accountsDatabase.getAccountEdits(acc.id);
      const summary = await accountsDatabase.getAccountEditsSummary(acc.id);

      expect(edits["community.eth"][0].title).toBe("community");
      expect(edits["legacy-community.eth"][0].description).toBe("legacy");
      expect(summary["community.eth"].title.value).toBe("community");
      expect(summary["legacy-community.eth"].description.value).toBe("legacy");
    });
  });

  describe("importAccountHistory", () => {
    test("reports both replacement and rollback failures", async () => {
      const values = new Map<string, any>([
        ["0", { phase: "old" }],
        ["length", 1],
      ]);
      const database = {
        clear: vi.fn(async () => values.clear()),
        keys: vi.fn(async () => [...values.keys()]),
        getItem: vi.fn(async (key: string) => values.get(key)),
        setItem: vi.fn(async (key: string, value: any) => {
          if (value?.phase === "new") {
            throw new Error("simulated replacement failure");
          }
          if (value?.phase === "old") {
            throw new Error("simulated rollback failure");
          }
          values.set(key, value);
        }),
      };

      const error = await replaceDatabaseArraysWithRollback([
        { database, items: [{ phase: "new" }], metadata: {} },
      ]).catch((caughtError) => caughtError);

      expect(error.message).toBe(
        "importAccountHistory failed and could not restore previous history",
      );
      expect(error.cause.message).toBe("simulated replacement failure");
      expect(error.rollbackError.message).toBe("simulated rollback failure");
    });

    test("persists and returns compact comments plus indexed vote and edit state in bulk", async () => {
      const acc = makeAccount({ id: "bulk-history", name: "BulkHistory" });
      await accountsDatabase.addAccount(acc);
      const accountComments = [
        {
          cid: "comment-1",
          content: "first",
          communityAddress: "community.eth",
          timestamp: 1,
          signer: { privateKey: "secret" },
          raw: { oversized: true },
          replies: {
            pages: { best: { comments: [{ cid: "cached-reply" }] } },
            pageCids: { best: "page-1" },
          },
        },
        {
          cid: "comment-2",
          content: "second",
          communityAddress: "community.eth",
          timestamp: 2,
        },
      ] as any;
      const accountVotes = [
        {
          commentCid: "vote-target",
          communityAddress: "community.eth",
          vote: 1,
          signer: { privateKey: "secret" },
        },
        {
          commentCid: "vote-target",
          communityAddress: "community.eth",
          vote: -1,
        },
      ] as any;
      const accountEdits = [
        {
          commentCid: "edit-target",
          communityAddress: "community.eth",
          content: "first edit",
          timestamp: 1,
        },
        {
          commentCid: "edit-target",
          communityAddress: "community.eth",
          content: "second edit",
          timestamp: 2,
        },
      ] as any;

      const imported = await accountsDatabase.importAccountHistory(acc.id, {
        accountComments,
        accountVotes,
        accountEdits,
      });

      expect(imported.accountComments).toEqual([
        expect.objectContaining({ cid: "comment-1", index: 0, accountId: acc.id }),
        expect.objectContaining({ cid: "comment-2", index: 1, accountId: acc.id }),
      ]);
      expect(imported.accountComments[0].signer).toBeUndefined();
      expect(imported.accountComments[0].raw).toBeUndefined();
      expect(imported.accountComments[0].replies?.pages).toBeUndefined();
      expect(imported.accountComments[0].replies?.pageCids).toEqual({ best: "page-1" });
      expect(imported.accountVotes["vote-target"].vote).toBe(-1);
      expect(imported.accountVotes["vote-target"].signer).toBeUndefined();
      expect(imported.accountEditsSummary["edit-target"].content).toEqual({
        timestamp: 2,
        value: "second edit",
      });

      const exported = JSON.parse(await accountsDatabase.getExportedAccountJson(acc.id));
      expect(exported.accountComments).toHaveLength(2);
      expect(exported.accountVotes).toHaveLength(2);
      expect(exported.accountEdits).toHaveLength(2);
      expect(await accountsDatabase.getAccountVotes(acc.id)).toEqual(imported.accountVotes);
      expect(await accountsDatabase.getAccountEditsSummary(acc.id)).toEqual(
        imported.accountEditsSummary,
      );
    });

    test("supports empty history", async () => {
      const acc = makeAccount({ id: "bulk-empty", name: "BulkEmpty" });
      await accountsDatabase.addAccount(acc);
      await expect(accountsDatabase.importAccountHistory(acc.id, {})).resolves.toEqual({
        accountComments: [],
        accountVotes: {},
        accountEditsSummary: {},
      });
    });

    test("rejects invalid vote and edit targets before writing history", async () => {
      const acc = makeAccount({ id: "bulk-invalid", name: "BulkInvalid" });
      await accountsDatabase.addAccount(acc);
      await expect(
        accountsDatabase.importAccountHistory(acc.id, {
          accountVotes: [{} as any],
        }),
      ).rejects.toThrow("addAccountVote createVoteOptions.commentCid 'undefined' not a string");
      await expect(
        accountsDatabase.importAccountHistory(acc.id, {
          accountEdits: [{} as any],
        }),
      ).rejects.toThrow("addAccountEdit target 'undefined' not a string");
    });

    test("restores every history store if one bulk replacement fails", async () => {
      const acc = makeAccount({ id: "bulk-rollback", name: "BulkRollback" });
      await accountsDatabase.addAccount(acc);
      const commentsDb = createPerAccountDatabase("accountComments", acc.id);
      const votesDb = createPerAccountDatabase("accountVotes", acc.id);
      const editsDb = createPerAccountDatabase("accountEdits", acc.id);
      const oldComment = { cid: "old-comment", content: "old", timestamp: 1 };
      const oldVote = { commentCid: "old-vote", vote: 1 };
      const oldEdit = { commentCid: "old-edit", content: "old", timestamp: 1 };
      await Promise.all([
        commentsDb.setItem("0", oldComment),
        commentsDb.setItem("length", 1),
        commentsDb.setItem("__storageVersion", 2),
        votesDb.setItem("0", oldVote),
        votesDb.setItem("length", 1),
        votesDb.setItem("__commentCidToLatestIndex", { "old-vote": 0 }),
        votesDb.setItem("__storageVersion", 1),
        editsDb.setItem("0", oldEdit),
        editsDb.setItem("length", 1),
        editsDb.setItem("__targetToIndices", { "old-edit": [0] }),
        editsDb.setItem("__summary", {
          "old-edit": { content: { timestamp: 1, value: "old" } },
        }),
        editsDb.setItem("__storageVersion", 1),
      ]);

      await expect(
        accountsDatabase.importAccountHistory(acc.id, {
          accountComments: [{ cid: "new-comment", content: "new", timestamp: 2 }] as any,
          accountVotes: [
            {
              commentCid: "new-vote",
              vote: -1,
              uncloneable: { callback: () => {} },
            },
          ] as any,
          accountEdits: [{ commentCid: "new-edit", content: "new", timestamp: 2 }] as any,
        }),
      ).rejects.toBeDefined();

      const exported = JSON.parse(await accountsDatabase.getExportedAccountJson(acc.id));
      expect(exported.accountComments).toEqual([oldComment]);
      expect(exported.accountVotes).toEqual([oldVote]);
      expect(exported.accountEdits).toEqual([oldEdit]);
      expect(await votesDb.getItem("__commentCidToLatestIndex")).toEqual({ "old-vote": 0 });
      expect(await editsDb.getItem("__targetToIndices")).toEqual({ "old-edit": [0] });
      expect(await editsDb.getItem("__summary")).toEqual({
        "old-edit": { content: { timestamp: 1, value: "old" } },
      });
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

    test("compacts legacy stored accountComments before export", async () => {
      const acc = makeAccount({ id: "export-legacy-comments", name: "ExportLegacyComments" });
      await accountsDatabase.addAccount(acc);
      const commentsDb = createPerAccountDatabase("accountComments", acc.id);
      await commentsDb.setItem("0", {
        cid: "legacy-comment",
        content: "legacy",
        communityAddress: "sub",
        timestamp: 1,
        author: { address: "addr" },
        clients: {
          ipfsGateways: {
            best: {
              state: "stopped",
            },
          },
        },
        raw: {
          comment: {
            content: "legacy",
          },
        },
        original: {
          content: "legacy",
          signature: { signature: "sig" },
        },
        replies: {
          clients: {
            ipfsGateways: {
              best: {
                state: "stopped",
              },
            },
          },
          pages: {
            best: {
              comments: [{ cid: "reply-1", content: "reply" }],
            },
          },
          pageCids: { best: "page-1" },
        },
      });
      await commentsDb.setItem("length", 1);

      const exported = JSON.parse(await accountsDatabase.getExportedAccountJson(acc.id));
      const storedComment = await commentsDb.getItem<any>("0");

      expect(exported.accountComments[0].replies?.pages).toBeUndefined();
      expect(exported.accountComments[0].replies?.pageCids).toEqual({ best: "page-1" });
      expect(exported.accountComments[0].replies?.clients).toBeUndefined();
      expect(exported.accountComments[0].clients).toBeUndefined();
      expect(exported.accountComments[0].raw).toBeUndefined();
      expect(exported.accountComments[0].original).toBeUndefined();
      expect(storedComment.replies?.pages).toBeUndefined();
      expect(storedComment.replies?.pageCids).toEqual({ best: "page-1" });
      expect(storedComment.replies?.clients).toBeUndefined();
      expect(storedComment.clients).toBeUndefined();
      expect(storedComment.raw).toBeUndefined();
      expect(storedComment.original).toBeUndefined();
      expect(await commentsDb.getItem("__storageVersion")).toBe(2);
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

    test("addAccountComment strips nested runtime payloads but keeps renderable comment fields", async () => {
      const acc = makeAccount({ id: "comment-slim", name: "CommentSlim" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountComment(acc.id, {
        cid: "cid-slim",
        content: "hello",
        communityAddress: "sub",
        timestamp: 1,
        author: { address: "addr" },
        clients: { ipfsGateways: { best: { state: "stopped" } } },
        raw: { comment: { content: "hello" } },
        replies: {
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          pages: {
            best: {
              comments: [{ cid: "reply-1", content: "reply" }],
            },
          },
          pageCids: { best: "page-1" },
        },
        edit: true,
        original: {
          content: "before edit",
          title: "original title",
          author: {
            address: "addr",
            wallets: {
              eth: {
                address: "0xabc",
              },
            },
          },
          signature: {
            signature: "sig",
          },
        },
      } as any);
      const comments = await accountsDatabase.getAccountComments(acc.id);
      const exported = JSON.parse(await accountsDatabase.getExportedAccountJson(acc.id));
      expect(comments[0].replies?.pages).toBeUndefined();
      expect(comments[0].replies?.clients).toBeUndefined();
      expect(comments[0].replies?.pageCids).toEqual({ best: "page-1" });
      expect(comments[0].clients).toBeUndefined();
      expect(comments[0].raw).toBeUndefined();
      expect(comments[0].original).toEqual({
        content: "before edit",
        title: "original title",
        author: {
          address: "addr",
        },
      });
      expect(exported.accountComments[0].replies?.pages).toBeUndefined();
      expect(exported.accountComments[0].replies?.clients).toBeUndefined();
      expect(exported.accountComments[0].clients).toBeUndefined();
      expect(exported.accountComments[0].raw).toBeUndefined();
    });

    test("getAccountComments compacts legacy stored comments on read", async () => {
      const acc = makeAccount({ id: "legacy-read-comments", name: "LegacyReadComments" });
      await accountsDatabase.addAccount(acc);
      const commentsDb = createPerAccountDatabase("accountComments", acc.id);
      await commentsDb.setItem("0", {
        cid: "legacy-read-comment",
        content: "legacy",
        communityAddress: "sub",
        timestamp: 1,
        author: { address: "addr" },
        clients: { ipfsGateways: { best: { state: "stopped" } } },
        raw: { comment: { content: "legacy" } },
        replies: {
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          pages: {
            best: {
              comments: [{ cid: "reply-1", content: "reply" }],
            },
          },
          pageCids: { best: "page-1" },
        },
      });
      await commentsDb.setItem("length", 1);

      const comments = await accountsDatabase.getAccountComments(acc.id);
      const storedComment = await commentsDb.getItem<any>("0");

      expect(comments[0].replies?.pages).toBeUndefined();
      expect(comments[0].replies?.pageCids).toEqual({ best: "page-1" });
      expect(comments[0].replies?.clients).toBeUndefined();
      expect(comments[0].clients).toBeUndefined();
      expect(comments[0].raw).toBeUndefined();
      expect(storedComment.replies?.pages).toBeUndefined();
      expect(storedComment.replies?.pageCids).toEqual({ best: "page-1" });
      expect(storedComment.replies?.clients).toBeUndefined();
      expect(storedComment.clients).toBeUndefined();
      expect(storedComment.raw).toBeUndefined();
      expect(await commentsDb.getItem("__storageVersion")).toBe(2);
    });

    test("getAccountComments densifies sparse legacy comment slots during compaction", async () => {
      const acc = makeAccount({ id: "legacy-sparse-comments", name: "LegacySparseComments" });
      await accountsDatabase.addAccount(acc);
      const commentsDb = createPerAccountDatabase("accountComments", acc.id);
      await commentsDb.setItem("0", {
        cid: "legacy-sparse-comment-1",
        content: "legacy-1",
        communityAddress: "sub",
        timestamp: 1,
        author: { address: "addr" },
      });
      await commentsDb.setItem("2", {
        cid: "legacy-sparse-comment-2",
        content: "legacy-2",
        communityAddress: "sub",
        timestamp: 2,
        author: { address: "addr" },
        raw: { comment: { content: "legacy-2" } },
      });
      await commentsDb.setItem("length", 3);

      const comments = await accountsDatabase.getAccountComments(acc.id);

      expect(comments).toHaveLength(2);
      expect(comments[0].cid).toBe("legacy-sparse-comment-1");
      expect(comments[1].cid).toBe("legacy-sparse-comment-2");
      expect(await commentsDb.getItem("1")).toEqual(
        expect.objectContaining({
          cid: "legacy-sparse-comment-2",
        }),
      );
      expect(await commentsDb.getItem("2")).toBeNull();
      expect(await commentsDb.getItem("length")).toBe(2);
      expect(await commentsDb.getItem("__storageVersion")).toBe(2);
    });

    test("deleteAccountComment compacts legacy stored comments before mutating", async () => {
      const acc = makeAccount({ id: "legacy-delete-comments", name: "LegacyDeleteComments" });
      await accountsDatabase.addAccount(acc);
      const commentsDb = createPerAccountDatabase("accountComments", acc.id);
      await commentsDb.setItem("0", {
        cid: "legacy-delete-comment-1",
        content: "legacy-1",
        communityAddress: "sub",
        timestamp: 1,
        author: { address: "addr" },
        clients: { ipfsGateways: { best: { state: "stopped" } } },
        replies: {
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          pages: {
            best: {
              comments: [{ cid: "reply-1", content: "reply" }],
            },
          },
          pageCids: { best: "page-1" },
        },
      });
      await commentsDb.setItem("1", {
        cid: "legacy-delete-comment-2",
        content: "legacy-2",
        communityAddress: "sub",
        timestamp: 2,
        author: { address: "addr" },
        raw: { comment: { content: "legacy-2" } },
        replies: {
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          pages: {
            best: {
              comments: [{ cid: "reply-2", content: "reply" }],
            },
          },
          pageCids: { best: "page-2" },
        },
      });
      await commentsDb.setItem("length", 2);

      await accountsDatabase.deleteAccountComment(acc.id, 0);
      const storedComment = await commentsDb.getItem<any>("0");
      const exported = JSON.parse(await accountsDatabase.getExportedAccountJson(acc.id));

      expect(storedComment.cid).toBe("legacy-delete-comment-2");
      expect(storedComment.replies?.pages).toBeUndefined();
      expect(storedComment.replies?.pageCids).toEqual({ best: "page-2" });
      expect(storedComment.replies?.clients).toBeUndefined();
      expect(storedComment.raw).toBeUndefined();
      expect(exported.accountComments).toHaveLength(1);
      expect(exported.accountComments[0].replies?.pages).toBeUndefined();
      expect(exported.accountComments[0].replies?.pageCids).toEqual({ best: "page-2" });
      expect(exported.accountComments[0].replies?.clients).toBeUndefined();
      expect(exported.accountComments[0].raw).toBeUndefined();
      expect(await commentsDb.getItem("__storageVersion")).toBe(2);
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

    test("pkc error handler is invoked when error emitted (line 103)", async () => {
      const acc = makeAccount({ id: "err-acc", name: "ErrAcc" });
      await accountsDatabase.addAccount(acc);
      const account = await accountsDatabase.getAccount(acc.id);
      account.pkc.emit("error", new Error("test pkc error"));
    });
  });

  describe("getAccounts with no pkcOptions in stored account", () => {
    test("applies getDefaultPkcOptions when stored account has no pkcOptions", async () => {
      const acc = makeAccount({ id: "no-opts", name: "NoOpts" });
      const toStore = { ...acc, pkc: undefined };
      delete (toStore as any).pkcOptions;
      await accountsDatabase.accountsDatabase.setItem(acc.id, toStore);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", [acc.id]);
      await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", acc.id);
      await accountsDatabase.accountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        NoOpts: acc.id,
      });
      const accounts = await accountsDatabase.getAccounts([acc.id]);
      expect(accounts[acc.id].pkcOptions).toBeDefined();
      expect(accounts[acc.id].pkcOptions.libp2pJsClientsOptions).toEqual([{ key: "libp2pjs" }]);
      expect(accounts[acc.id].pkcOptions.ipfsGatewayUrls).toBeUndefined();
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

    test("addAccountEdit and deleteAccountEdit support community edit targets", async () => {
      const acc = makeAccount({ id: "ge-community-edit", name: "GECommunityEdit" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountEdit(acc.id, {
        communityAddress: "community.eth",
        title: "community edit",
        timestamp: 1,
      } as any);

      let edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["community.eth"]).toHaveLength(1);

      const deleted = await accountsDatabase.deleteAccountEdit(acc.id, {
        communityAddress: "community.eth",
        title: "community edit",
        timestamp: 1,
      } as any);

      expect(deleted).toBe(true);
      edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["community.eth"]).toBeUndefined();
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

    test("deleteAccountEdit removes only the matching edit", async () => {
      const acc = makeAccount({ id: "ge-delete", name: "GEDelete" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "edit1",
        communityAddress: "s",
        timestamp: 1,
      } as any);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "edit2",
        communityAddress: "s",
        timestamp: 2,
      } as any);

      const deleted = await accountsDatabase.deleteAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "edit1",
        communityAddress: "s",
        timestamp: 1,
      } as any);

      expect(deleted).toBe(true);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["same-cid"]).toHaveLength(1);
      expect(edits["same-cid"][0].content).toBe("edit2");
    });

    test("deleteAccountEdit matches identical optimistic edits by clientId", async () => {
      const acc = makeAccount({ id: "ge-client-id", name: "GEClientId" });
      await accountsDatabase.addAccount(acc);
      const baseEdit = {
        commentCid: "same-cid",
        communityAddress: "s",
        deleted: true,
        timestamp: 1,
      };
      await accountsDatabase.addAccountEdit(acc.id, {
        ...baseEdit,
        clientId: "existing-edit",
      } as any);
      await accountsDatabase.addAccountEdit(acc.id, {
        ...baseEdit,
        clientId: "failed-edit",
      } as any);

      const deleted = await accountsDatabase.deleteAccountEdit(acc.id, {
        ...baseEdit,
        clientId: "failed-edit",
      } as any);

      expect(deleted).toBe(true);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["same-cid"]).toHaveLength(1);
      expect(edits["same-cid"][0].clientId).toBe("existing-edit");
    });

    test("deleteAccountEdit is a no-op when the edit does not exist", async () => {
      const acc = makeAccount({ id: "ge-noop", name: "GENoop" });
      await accountsDatabase.addAccount(acc);
      await accountsDatabase.addAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "edit1",
        communityAddress: "s",
        timestamp: 1,
      } as any);

      const deleted = await accountsDatabase.deleteAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "missing",
        communityAddress: "s",
        timestamp: 2,
      } as any);

      expect(deleted).toBe(false);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits["same-cid"]).toHaveLength(1);
      expect(edits["same-cid"][0].content).toBe("edit1");
    });

    test("deleteAccountEdit returns false when the account has no edits", async () => {
      const acc = makeAccount({ id: "ge-empty", name: "GEEmpty" });
      await accountsDatabase.addAccount(acc);

      const deleted = await accountsDatabase.deleteAccountEdit(acc.id, {
        commentCid: "same-cid",
        content: "missing",
        communityAddress: "s",
        timestamp: 2,
      } as any);

      expect(deleted).toBe(false);
      const edits = await accountsDatabase.getAccountEdits(acc.id);
      expect(edits).toEqual({});
    });
  });
});
