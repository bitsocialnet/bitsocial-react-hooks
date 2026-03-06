import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../lib/test-utils";
import { usePlebbitRpcSettings, setPlebbitJs } from "..";
import PlebbitJsMock from "../lib/plebbit-js/plebbit-js-mock";
import accountsStore from "../stores/accounts";
import * as accountsHooks from "./accounts";

vi.mock("./accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof accountsHooks>();
  return { ...actual };
});

describe("plebbit-rpc", () => {
  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });
  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  test("usePlebbitRpcSettings with no options (branch 31)", async () => {
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings(undefined));
    await act(async () => {});
    expect(rendered.result.current.state).toBeDefined();
  });

  test("usePlebbitRpcSettings setPlebbitRpcSettings with account.plebbit undefined asserts (branch 66)", async () => {
    const accountNoPlebbit = { id: "test-id", plebbit: undefined };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(accountNoPlebbit as any);
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    await act(async () => {});
    await expect(rendered.result.current.setPlebbitRpcSettings({ challenges: {} })).rejects.toThrow(
      /no account.plebbit.clients.plebbitRpcClients/,
    );
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePlebbitRpcSettings with explicit options (branch 31)", async () => {
    const rendered = renderHook<any, any>(() =>
      usePlebbitRpcSettings({ accountName: "Account 1" }),
    );
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    expect(rendered.result.current.plebbitRpcSettings).toBeDefined();
  });

  test("usePlebbitRpcSettings", async () => {
    // on first render, the account is undefined because it's not yet loaded from database
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    expect(rendered.result.current.plebbitRpcSettings).toBe(undefined);

    await waitFor(() => rendered.result.current.state === "connecting");
    expect(rendered.result.current.state).toBe("connecting");

    await waitFor(() => !!rendered.result.current.plebbitRpcSettings);
    expect(rendered.result.current.plebbitRpcSettings.challenges).not.toBe(undefined);
    expect(rendered.result.current.state).toBe("connected");

    await act(async () => {
      await rendered.result.current.setPlebbitRpcSettings({
        challenges: {
          "some-challenge": {},
        },
      });
    });

    await waitFor(() => !!rendered.result.current.plebbitRpcSettings.challenges["some-challenge"]);
    expect(rendered.result.current.plebbitRpcSettings.challenges["some-challenge"]).not.toBe(
      undefined,
    );
    expect(rendered.result.current.state).toBe("succeeded");
  });

  test("usePlebbitRpcSettings setPlebbitRpcSettings before init asserts", async () => {
    const rendered = renderHook<any, any>(() =>
      usePlebbitRpcSettings({ accountName: "nonexistent-account-xyz" }),
    );
    await new Promise((r) => setTimeout(r, 50));
    await expect(rendered.result.current.setPlebbitRpcSettings({ challenges: {} })).rejects.toThrow(
      /before initialized/,
    );
  });

  test("usePlebbitRpcSettings no rpcClient returns early (lines 33-35)", async () => {
    const accountWithNoRpc = {
      id: "test-id",
      plebbit: { clients: { plebbitRpcClients: {} } },
    };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(accountWithNoRpc as any);
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.plebbitRpcSettings).toBe(undefined);
    expect(rendered.result.current.state).toBe("initializing");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePlebbitRpcSettings rpcClient with state null skips setState (branch 36)", async () => {
    const rpcClient = {
      settings: { challenges: {} },
      state: null,
      on: () => {},
      removeListener: () => {},
    };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue({
      id: "test-id",
      plebbit: { clients: { plebbitRpcClients: { "http://x": rpcClient } } },
    } as any);
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.state).toBe("initializing");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePlebbitRpcSettings rpcClient.settings and rpcClient.state hydration (lines 38-43)", async () => {
    const rpcClient = {
      settings: { challenges: { "pre-hydrated": {} } },
      state: "connected",
      on: () => {},
      removeListener: () => {},
    };
    const accountWithRpc = {
      id: "test-id",
      plebbit: { clients: { plebbitRpcClients: { "http://x": rpcClient } } },
    };
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(accountWithRpc as any);
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.plebbitRpcSettings?.challenges?.["pre-hydrated"]).toBeDefined();
    expect(rendered.result.current.state).toBe("connected");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePlebbitRpcSettings no account returns early", async () => {
    const rendered = renderHook<any, any>(() =>
      usePlebbitRpcSettings({ accountName: "nonexistent-account-xyz" }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(rendered.result.current.plebbitRpcSettings).toBe(undefined);
    expect(rendered.result.current.state).toBe("initializing");
  });

  test("usePlebbitRpcSettings effect returns early when account is undefined (branch 33)", async () => {
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    await act(async () => {});
    expect(rendered.result.current.plebbitRpcSettings).toBe(undefined);
    expect(rendered.result.current.state).toBe("initializing");
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("usePlebbitRpcSettings initial rpcClient.state hydration (stmt 40)", async () => {
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    expect(rendered.result.current.state).toBe("connected");
    expect(rendered.result.current.plebbitRpcSettings).toBeDefined();
  });

  test("usePlebbitRpcSettings setSettings error path", async () => {
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    const { accounts, activeAccountId } = accountsStore.getState();
    const account = accounts[activeAccountId || ""];
    const rpc = Object.values(account?.plebbit?.clients?.plebbitRpcClients || {})[0] as any;
    expect(rpc).toBeDefined();
    const origSet = rpc.setSettings;
    try {
      rpc.setSettings = () => Promise.reject(new Error("setSettings failed"));
      await act(async () => {
        await rendered.result.current.setPlebbitRpcSettings({ challenges: {} });
      });
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.error?.message).toBe("setSettings failed");
    } finally {
      rpc.setSettings = origSet;
    }
  });

  test("usePlebbitRpcSettings rpcClient error event triggers onRpcError", async () => {
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    const { accounts, activeAccountId } = accountsStore.getState();
    const account = accounts[activeAccountId || ""];
    const rpc = Object.values(account?.plebbit?.clients?.plebbitRpcClients || {})[0] as any;
    expect(rpc).toBeDefined();
    rpc.emit("error", new Error("rpc error event"));
    await waitFor(() => rendered.result.current.error?.message === "rpc error event");
    expect(rendered.result.current.errors.length).toBeGreaterThan(0);
  });

  test("usePlebbitRpcSettings setPlebbitRpcSettings no rpcClient asserts (branch 74)", async () => {
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    const { accounts, activeAccountId } = accountsStore.getState();
    const account = accounts[activeAccountId || ""];
    const origClients = account?.plebbit?.clients;
    expect(account?.plebbit).toBeDefined();
    try {
      (account.plebbit as any).clients = { plebbitRpcClients: {} };
      await expect(
        rendered.result.current.setPlebbitRpcSettings({ challenges: {} }),
      ).rejects.toThrow(/no account.plebbit.clients.plebbitRpcClients/);
    } finally {
      if (origClients && account?.plebbit) {
        (account.plebbit as any).clients = origClients;
      }
    }
  });

  test("usePlebbitRpcSettings setPlebbitRpcSettings invalid arg asserts", async () => {
    const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "connected");
    await expect(rendered.result.current.setPlebbitRpcSettings(null as any)).rejects.toThrow(
      /plebbitRpcSettings argument/,
    );
    await expect(rendered.result.current.setPlebbitRpcSettings("string" as any)).rejects.toThrow(
      /plebbitRpcSettings argument/,
    );
  });

  test("usePlebbitRpcSettings timeout state-restore branch (branch 94)", async () => {
    vi.useFakeTimers();
    try {
      const rendered = renderHook<any, any>(() => usePlebbitRpcSettings());
      vi.advanceTimersByTime(100);
      await act(async () => {});
      const { accounts, activeAccountId } = accountsStore.getState();
      const account = accounts[activeAccountId || ""];
      const rpc = Object.values(account?.plebbit?.clients?.plebbitRpcClients || {})[0] as any;
      expect(rpc).toBeDefined();
      rpc.state = "connected";
      rpc.emit("statechange", "connected");
      vi.advanceTimersByTime(50);
      await act(async () => {
        await rendered.result.current.setPlebbitRpcSettings({ challenges: {} });
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
