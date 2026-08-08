import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../lib/test-utils";
import { usePkcRpcSettings, setPkcJs } from "..";
import PkcJsMock from "../lib/pkc-js/pkc-js-mock";
import accountsStore from "../stores/accounts";
import * as accountsHooks from "./accounts";

vi.mock("./accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof accountsHooks>();
  return { ...actual };
});

describe("pkc-rpc", () => {
  beforeAll(async () => {
    // set pkc-js mock and reset dbs
    setPkcJs(PkcJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });
  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  test("usePkcRpcSettings with no options (branch 31)", async () => {
    const rendered = renderHook<any, any>(() => usePkcRpcSettings(undefined));
    await act(async () => {});
    expect(rendered.result.current.state).toBeDefined();
  });

  test("usePkcRpcSettings setPkcRpcSettings with account.pkc undefined asserts (branch 66)", async () => {
    const accountNoPkc = { id: "test-id", pkc: undefined };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(accountNoPkc as any);
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    await act(async () => {});
    await expect(rendered.result.current.setPkcRpcSettings({ challenges: {} })).rejects.toThrow(
      /no account.pkc.clients.pkcRpcClients/,
    );
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePkcRpcSettings with explicit options (branch 31)", async () => {
    const rendered = renderHook<any, any>(() =>
      usePkcRpcSettings({ accountName: "Account dress" }),
    );
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    expect(rendered.result.current.pkcRpcSettings).toBeDefined();
  });

  test("usePkcRpcSettings", async () => {
    // on first render, the account is undefined because it's not yet loaded from database
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    expect(rendered.result.current.pkcRpcSettings).toBe(undefined);

    await waitFor(() => rendered.result.current.state !== "initializing");
    expect(["connecting", "connected"]).toContain(rendered.result.current.state);

    await waitFor(() => !!rendered.result.current.pkcRpcSettings);
    expect(rendered.result.current.pkcRpcSettings.challenges).not.toBe(undefined);
    expect(rendered.result.current.state).toBe("connected");

    await act(async () => {
      await rendered.result.current.setPkcRpcSettings({
        challenges: {
          "some-challenge": {},
        },
      });
    });

    await waitFor(() => !!rendered.result.current.pkcRpcSettings.challenges["some-challenge"]);
    expect(rendered.result.current.pkcRpcSettings.challenges["some-challenge"]).not.toBe(undefined);
    expect(rendered.result.current.state).toBe("succeeded");
  });

  test("usePkcRpcSettings setPkcRpcSettings before init asserts", async () => {
    const rendered = renderHook<any, any>(() =>
      usePkcRpcSettings({ accountName: "nonexistent-account-xyz" }),
    );
    await new Promise((r) => setTimeout(r, 50));
    await expect(rendered.result.current.setPkcRpcSettings({ challenges: {} })).rejects.toThrow(
      /before initialized/,
    );
  });

  test("usePkcRpcSettings no rpcClient returns early (lines 33-35)", async () => {
    const accountWithNoRpc = {
      id: "test-id",
      pkc: { clients: { pkcRpcClients: {} } },
    };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(accountWithNoRpc as any);
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.pkcRpcSettings).toBe(undefined);
    expect(rendered.result.current.state).toBe("initializing");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePkcRpcSettings rpcClient with state null skips setState (branch 36)", async () => {
    const rpcClient = {
      settings: { challenges: {} },
      state: null,
      on: () => {},
      removeListener: () => {},
    };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue({
      id: "test-id",
      pkc: { clients: { pkcRpcClients: { "http://x": rpcClient } } },
    } as any);
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.state).toBe("initializing");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePkcRpcSettings rpcClient.settings and rpcClient.state hydration (lines 38-43)", async () => {
    const rpcClient = {
      settings: { challenges: { "pre-hydrated": {} } },
      state: "connected",
      on: () => {},
      removeListener: () => {},
    };
    const accountWithRpc = {
      id: "test-id",
      pkc: { clients: { pkcRpcClients: { "http://x": rpcClient } } },
    };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(accountWithRpc as any);
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.pkcRpcSettings?.challenges?.["pre-hydrated"]).toBeDefined();
    expect(rendered.result.current.state).toBe("connected");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePkcRpcSettings no account returns early", async () => {
    const rendered = renderHook<any, any>(() =>
      usePkcRpcSettings({ accountName: "nonexistent-account-xyz" }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(rendered.result.current.pkcRpcSettings).toBe(undefined);
    expect(rendered.result.current.state).toBe("initializing");
  });

  test("usePkcRpcSettings effect returns early when account is undefined (branch 33)", async () => {
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.pkcRpcSettings).toBe(undefined);
    expect(rendered.result.current.state).toBe("initializing");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePkcRpcSettings initial rpcClient.state hydration (stmt 40)", async () => {
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    expect(rendered.result.current.state).toBe("connected");
    expect(rendered.result.current.pkcRpcSettings).toBeDefined();
  });

  test("usePkcRpcSettings setSettings error path", async () => {
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    const { accounts, activeAccountId } = accountsStore.getState();
    const account = accounts[activeAccountId || ""];
    const rpc = Object.values(account?.pkc?.clients?.pkcRpcClients || {})[0] as any;
    expect(rpc).toBeDefined();
    const origSet = rpc.setSettings;
    try {
      rpc.setSettings = () => Promise.reject(new Error("setSettings failed"));
      await act(async () => {
        await rendered.result.current.setPkcRpcSettings({ challenges: {} });
      });
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.error?.message).toBe("setSettings failed");
    } finally {
      rpc.setSettings = origSet;
    }
  });

  test("usePkcRpcSettings rpcClient error event triggers onRpcError", async () => {
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    const { accounts, activeAccountId } = accountsStore.getState();
    const account = accounts[activeAccountId || ""];
    const rpc = Object.values(account?.pkc?.clients?.pkcRpcClients || {})[0] as any;
    expect(rpc).toBeDefined();
    rpc.emit("error", new Error("rpc error event"));
    await waitFor(() => rendered.result.current.error?.message === "rpc error event");
    expect(rendered.result.current.errors.length).toBeGreaterThan(0);
  });

  test("usePkcRpcSettings setPkcRpcSettings no rpcClient asserts (branch 74)", async () => {
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    const { accounts, activeAccountId } = accountsStore.getState();
    const account = accounts[activeAccountId || ""];
    const origClients = account?.pkc?.clients;
    expect(account?.pkc).toBeDefined();
    try {
      (account.pkc as any).clients = { pkcRpcClients: {} };
      await expect(rendered.result.current.setPkcRpcSettings({ challenges: {} })).rejects.toThrow(
        /no account.pkc.clients.pkcRpcClients/,
      );
    } finally {
      if (origClients && account?.pkc) {
        (account.pkc as any).clients = origClients;
      }
    }
  });

  test("usePkcRpcSettings setPkcRpcSettings invalid arg asserts", async () => {
    const rendered = renderHook<any, any>(() => usePkcRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    await expect(rendered.result.current.setPkcRpcSettings(null as any)).rejects.toThrow(
      /pkcRpcSettings argument/,
    );
    await expect(rendered.result.current.setPkcRpcSettings("string" as any)).rejects.toThrow(
      /pkcRpcSettings argument/,
    );
  });

  test("usePkcRpcSettings timeout state-restore branch (branch 94)", async () => {
    vi.useFakeTimers();
    try {
      const rendered = renderHook<any, any>(() => usePkcRpcSettings());
      vi.advanceTimersByTime(100);
      await act(async () => {});
      const { accounts, activeAccountId } = accountsStore.getState();
      const account = accounts[activeAccountId || ""];
      const rpc = Object.values(account?.pkc?.clients?.pkcRpcClients || {})[0] as any;
      expect(rpc).toBeDefined();
      await act(async () => {
        rpc.state = "connected";
        rpc.emit("statechange", "connected");
        vi.advanceTimersByTime(50);
      });
      await act(async () => {
        await rendered.result.current.setPkcRpcSettings({ challenges: {} });
      });
      expect(rendered.result.current.state).toBe("succeeded");
      rpc.state = "connected";
      vi.advanceTimersByTime(10010);
      await act(async () => {});
      expect(rendered.result.current.state).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });
});
