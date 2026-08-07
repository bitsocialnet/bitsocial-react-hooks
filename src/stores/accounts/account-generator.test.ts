import accountGenerator, {
  DEFAULT_ETH_RPC_URL,
  DEFAULT_ETH_RPC_URLS,
  DEFAULT_HTTP_ROUTER_URLS,
  getDefaultChainProviders,
  getDefaultPkcOptions,
} from "./account-generator";
import { setPkcJs, restorePkcJs } from "../../lib/pkc-js";
import PkcJsMock from "../../lib/pkc-js/pkc-js-mock";
import accountsDatabase from "./accounts-database";

describe("account-generator", () => {
  beforeAll(() => setPkcJs(PkcJsMock));
  afterAll(() => restorePkcJs());

  describe("getDefaultPkcOptions", () => {
    test("returns web defaults when window.defaultPkcOptions is absent", () => {
      const orig = (global as any).window?.defaultPkcOptions;
      delete (global as any).window?.defaultPkcOptions;
      try {
        const opts = getDefaultPkcOptions();
        const chainProviders = getDefaultChainProviders();
        expect(opts.libp2pJsClientsOptions).toEqual([{ key: "libp2pjs" }]);
        expect(opts.ipfsGatewayUrls).toBeUndefined();
        expect(opts.kuboRpcClientsOptions).toBeUndefined();
        expect(opts.pubsubKuboRpcClientsOptions).toBeUndefined();
        expect(opts.chainProviders).toBeUndefined();
        expect(chainProviders).toBeDefined();
        expect(chainProviders.eth).toBeDefined();
        expect(chainProviders.matic).toBeDefined();
        expect(opts.httpRoutersOptions).toEqual(DEFAULT_HTTP_ROUTER_URLS);
        expect(DEFAULT_HTTP_ROUTER_URLS).toEqual([
          "https://peers.pleb.bot",
          "https://routing.lol",
          "https://peers.forumindex.com",
          "https://peers.plebpubsub.xyz",
          "https://routerofbitsocial.xyz",
          "https://bsotracker.online",
        ]);
        expect(opts.resolveAuthorAddresses).toBe(false);
        expect(opts.validatePages).toBe(false);
      } finally {
        if (orig !== undefined) (global as any).window.defaultPkcOptions = orig;
      }
    });

    test("uses window.defaultPkcOptions when present", () => {
      const custom = {
        ipfsGatewayUrls: ["https://custom.ipfs.io"],
        chainProviders: { eth: { urls: ["custom"], chainId: 1 } },
      };
      (global as any).window = (global as any).window || {};
      (global as any).window.defaultPkcOptions = custom;
      try {
        const opts = getDefaultPkcOptions();
        const chainProviders = getDefaultChainProviders();
        expect(opts.ipfsGatewayUrls).toEqual(["https://custom.ipfs.io"]);
        expect(opts.chainProviders).toBeUndefined();
        expect(chainProviders.eth.urls).toEqual(["custom"]);
      } finally {
        delete (global as any).window.defaultPkcOptions;
      }
    });

    test("injects missing chain providers from defaults", () => {
      const custom = {
        ipfsGatewayUrls: ["https://custom.ipfs.io"],
        chainProviders: { eth: { urls: ["custom"], chainId: 1 } },
      };
      (global as any).window = (global as any).window || {};
      (global as any).window.defaultPkcOptions = custom;
      try {
        const chainProviders = getDefaultChainProviders();
        expect(chainProviders.matic).toBeDefined();
      } finally {
        delete (global as any).window.defaultPkcOptions;
      }
    });

    test("preserves libp2pJsClientsOptions from window defaults", () => {
      const libp2pOpts = { some: "non-json" };
      const custom = {
        ipfsGatewayUrls: ["https://custom.ipfs.io"],
        libp2pJsClientsOptions: libp2pOpts,
      };
      (global as any).window = (global as any).window || {};
      (global as any).window.defaultPkcOptions = custom;
      try {
        const opts = getDefaultPkcOptions();
        expect(opts.libp2pJsClientsOptions).toBe(libp2pOpts);
      } finally {
        delete (global as any).window.defaultPkcOptions;
      }
    });
  });

  describe("generateDefaultAccount", () => {
    beforeEach(async () => {
      await accountsDatabase.accountsMetadataDatabase.clear();
      await accountsDatabase.accountsDatabase.clear();
    });

    test("creates account with pkc, signer, author, and only an eth wallet", async () => {
      const account = await accountGenerator.generateDefaultAccount();
      expect(account.id).toBeDefined();
      expect(account.name).toBe("Account 1");
      expect(account.author.address).toBeDefined();
      expect(account.author.wallets?.sol).toBeUndefined();
      expect(account.signer).toBeDefined();
      expect(account.pkc).toBeDefined();
      expect(account.pkcOptions).toBeDefined();
      expect(account.chainProviders?.eth).toBeDefined();
      expect(account.pkcOptions.chainProviders).toBeUndefined();
      expect(account.pkc.nameResolvers.map((resolver: any) => resolver.key)).toEqual([
        "eth-ethereum-rpc.publicnode.com",
        "eth-eth.drpc.org",
        "eth-ethereum.publicnode.com",
        "eth-rpc.mevblocker.io",
        "eth-1rpc.io",
        "eth-eth-pokt.nodies.app",
      ]);
      expect(account.chainProviders?.eth?.urls).toEqual([...DEFAULT_ETH_RPC_URLS, "ethers.js"]);
      expect(account.chainProviders?.eth?.urls[0]).toBe(DEFAULT_ETH_RPC_URL);
      expect(account.version).toBe(accountsDatabase.accountVersion);
    });

    test("registers error handler on pkc instance", async () => {
      let errorHandler: ((err: any) => void) | null = null;
      const OrigPkc = PkcJsMock;
      const WrapperPkc = async (opts: any) => {
        const p = await OrigPkc(opts);
        const origOn = p.on.bind(p);
        p.on = (event: string, fn: any) => {
          if (event === "error") errorHandler = fn;
          return origOn(event, fn);
        };
        return p;
      };
      setPkcJs(WrapperPkc);
      try {
        const account = await accountGenerator.generateDefaultAccount();
        expect(errorHandler).toBeDefined();
        expect(typeof errorHandler).toBe("function");
        account.pkc.emit("error", new Error("test error"));
      } finally {
        setPkcJs(PkcJsMock);
      }
    });

    test("increments account name when multiple exist", async () => {
      const acc1 = await accountGenerator.generateDefaultAccount();
      await accountsDatabase.addAccount(acc1);
      const acc2 = await accountGenerator.generateDefaultAccount();
      expect(acc2.name).toBe("Account 2");
    });
  });
});
