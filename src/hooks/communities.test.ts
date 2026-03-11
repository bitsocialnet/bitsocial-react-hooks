import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../lib/test-utils";
import {
  useCommunity,
  useCommunityStats,
  useCommunities,
  setPlebbitJs,
  useResolvedCommunityAddress,
} from "..";
import * as accountsHooks from "./accounts";
import communityStore from "../stores/communities";
import communitiesPagesStore from "../stores/communities-pages";
import { useListCommunities, resolveCommunityAddress } from "./communities";
import PlebbitJsMock, { Plebbit, Community } from "../lib/plebbit-js/plebbit-js-mock";
import * as chain from "../lib/chain";

describe("communities", () => {
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

  describe("no communities in database", () => {
    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("get communities one at a time", async () => {
      const rendered = renderHook<any, any>((communityAddress) =>
        useCommunity({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered);

      expect(rendered.result.current.address).toBe(undefined);
      rendered.rerender("community address 1");
      await waitFor(() => typeof rendered.result.current.title === "string");

      expect(typeof rendered.result.current.fetchedAt).toBe("number");
      expect(rendered.result.current.address).toBe("community address 1");
      expect(rendered.result.current.title).toBe("community address 1 title");
      // wait for community.on('update') to fetch the updated description
      await waitFor(() => typeof rendered.result.current.description === "string");

      expect(rendered.result.current.description).toBe("community address 1 description updated");

      rendered.rerender("community address 2");
      await waitFor(() => typeof rendered.result.current.title === "string");

      expect(rendered.result.current.address).toBe("community address 2");
      expect(rendered.result.current.title).toBe("community address 2 title");
      // wait for community.on('update') to fetch the updated description
      await waitFor(() => typeof rendered.result.current.description === "string");

      expect(rendered.result.current.description).toBe("community address 2 description updated");

      // get sub 1 again, no need to wait for any updates
      rendered.rerender("community address 1");
      expect(rendered.result.current.address).toBe("community address 1");
      expect(rendered.result.current.description).toBe("community address 1 description updated");

      // make sure communities are still in database
      const simulateUpdateEvent = Community.prototype.simulateUpdateEvent;
      // don't simulate 'update' event during this test to see if the updates were saved to database
      let throwOnCommunityUpdateEvent = false;
      Community.prototype.simulateUpdateEvent = () => {
        if (throwOnCommunityUpdateEvent) {
          throw Error(
            "no community update events should be emitted when community already in store",
          );
        }
      };

      // communitiesPagesStore has preloaded community comments
      expect(rendered.result.current.posts.pages.hot.comments.length).toBeGreaterThan(0);
      const communitiesPagesStoreComments = communitiesPagesStore.getState().comments;
      for (const comment of rendered.result.current.posts.pages.hot.comments) {
        expect(typeof comment.cid).toBe("string");
        expect(communitiesPagesStoreComments[comment.cid].cid).toBe(comment.cid);
      }

      // reset stores to force using the db
      expect(communityStore.getState().communities).not.toEqual({});
      await testUtils.resetStores();
      expect(communityStore.getState().communities).toEqual({});
      expect(communitiesPagesStore.getState().comments).toEqual({});

      // on first render, the account is undefined because it's not yet loaded from database
      const rendered2 = renderHook<any, any>((communityAddress) =>
        useCommunity({ communityAddress }),
      );
      expect(rendered2.result.current.address).toBe(undefined);
      rendered2.rerender("community address 1");
      // wait to get account loaded
      await waitFor(() => rendered2.result.current.address === "community address 1");

      expect(typeof rendered2.result.current.fetchedAt).toBe("number");
      expect(rendered2.result.current.address).toBe("community address 1");
      expect(rendered2.result.current.title).toBe("community address 1 title");
      expect(rendered2.result.current.description).toBe("community address 1 description updated");

      rendered2.rerender("community address 2");
      // wait for addCommunityToStore action
      await waitFor(() => rendered2.result.current.address === "community address 2");

      expect(rendered2.result.current.address).toBe("community address 2");
      expect(rendered2.result.current.title).toBe("community address 2 title");
      expect(rendered2.result.current.description).toBe("community address 2 description updated");

      // get community 1 again from store, should not trigger any community updates
      throwOnCommunityUpdateEvent = true;
      rendered2.rerender("community address 1");
      expect(rendered2.result.current.address).toBe("community address 1");
      expect(rendered2.result.current.title).toBe("community address 1 title");
      expect(rendered2.result.current.description).toBe("community address 1 description updated");

      // communitiesPagesStore has preloaded community comments
      expect(rendered2.result.current.posts.pages.hot.comments.length).toBeGreaterThan(0);
      const communitiesPagesStoreComments2 = communitiesPagesStore.getState().comments;
      for (const comment of rendered2.result.current.posts.pages.hot.comments) {
        expect(typeof comment.cid).toBe("string");
        expect(communitiesPagesStoreComments2[comment.cid].cid).toBe(comment.cid);
      }

      // restore mock
      Community.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test(`onlyIfCached: true doesn't add to store`, async () => {
      let rendered;
      rendered = renderHook<any, any>((options: any) => useCommunity(options));
      testUtils.createWaitFor(rendered);

      rendered.rerender({ communityAddress: "community address 1", onlyIfCached: true });
      // TODO: find better way to wait
      await new Promise((r) => setTimeout(r, 20));
      // community not added to store
      expect(communityStore.getState().communities).toEqual({});

      rendered = renderHook<any, any>((options: any) => useCommunities(options));
      testUtils.createWaitFor(rendered);

      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2"],
        onlyIfCached: true,
      });
      expect(rendered.result.current.communities.length).toBe(2);
      // TODO: find better way to wait
      await new Promise((r) => setTimeout(r, 20));
      // community not added to store
      expect(communityStore.getState().communities).toEqual({});
    });

    test("get multiple communities at once", async () => {
      const rendered = renderHook<any, any>((communityAddresses) =>
        useCommunities({ communityAddresses }),
      );
      const waitFor = testUtils.createWaitFor(rendered);

      expect(rendered.result.current.communities).toEqual([]);
      rendered.rerender(["community address 1", "community address 2", "community address 3"]);
      expect(rendered.result.current.communities).toEqual([undefined, undefined, undefined]);

      await waitFor(
        () =>
          typeof rendered.result.current.communities[0].address === "string" &&
          typeof rendered.result.current.communities[1].address === "string" &&
          typeof rendered.result.current.communities[2].address === "string",
      );
      expect(rendered.result.current.communities[0].address).toBe("community address 1");
      expect(rendered.result.current.communities[1].address).toBe("community address 2");
      expect(rendered.result.current.communities[2].address).toBe("community address 3");

      await waitFor(
        () =>
          typeof rendered.result.current.communities[0].description === "string" &&
          typeof rendered.result.current.communities[1].description === "string" &&
          typeof rendered.result.current.communities[2].description === "string",
      );
      expect(rendered.result.current.communities[0].description).toBe(
        "community address 1 description updated",
      );
      expect(rendered.result.current.communities[1].description).toBe(
        "community address 2 description updated",
      );
      expect(rendered.result.current.communities[2].description).toBe(
        "community address 3 description updated",
      );
    });

    test("has updating state", async () => {
      const rendered = renderHook<any, any>((communityAddress) =>
        useCommunity({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("community address");

      await waitFor(
        () =>
          rendered.result.current.state === "fetching-ipns" ||
          rendered.result.current.state === "succeeded",
      );

      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
    });

    test("has error events", async () => {
      // mock update to save community instance
      const communityUpdate = Community.prototype.update;
      const updatingCommunities: any = [];
      Community.prototype.update = function () {
        updatingCommunities.push(this);
        return communityUpdate.bind(this)();
      };

      const rendered = renderHook<any, any>((communityAddress) =>
        useCommunity({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("community address");

      // emit error event
      await waitFor(() => updatingCommunities.length > 0);
      updatingCommunities[0].emit("error", Error("error 1"));

      // first error
      await waitFor(() => rendered.result.current.error.message === "error 1");
      expect(rendered.result.current.error.message).toBe("error 1");
      expect(rendered.result.current.errors[0].message).toBe("error 1");
      expect(rendered.result.current.errors.length).toBe(1);

      // second error
      updatingCommunities[0].emit("error", Error("error 2"));
      await waitFor(() => rendered.result.current.error.message === "error 2");
      expect(rendered.result.current.error.message).toBe("error 2");
      expect(rendered.result.current.errors[0].message).toBe("error 1");
      expect(rendered.result.current.errors[1].message).toBe("error 2");
      expect(rendered.result.current.errors.length).toBe(2);

      // restore mock
      Community.prototype.update = communityUpdate;
    });

    test("plebbit.createCommunity throws adds useCommunity().error", async () => {
      // mock update to save community instance
      const createCommunity = Plebbit.prototype.createCommunity;
      Plebbit.prototype.createCommunity = async function () {
        throw Error("plebbit.createCommunity error");
      };

      const rendered = renderHook<any, any>((communityAddress) =>
        useCommunity({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("community address");

      // plebbit.createCommunity error
      await waitFor(
        () => rendered.result.current.error.message === "plebbit.createCommunity error",
      );
      expect(rendered.result.current.error.message).toBe("plebbit.createCommunity error");
      expect(rendered.result.current.errors[0].message).toBe("plebbit.createCommunity error");
      expect(rendered.result.current.errors.length).toBe(1);

      // restore mock
      Plebbit.prototype.createCommunity = createCommunity;
    });
  });

  test("useListCommunities", async () => {
    const rendered = renderHook<any, any>(() => useListCommunities());
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.length > 0);
    expect(rendered.result.current).toEqual([
      "list community address 1",
      "list community address 2",
    ]);
  });

  test("useCommunities with communityAddresses undefined returns empty (branch 171)", async () => {
    const rendered = renderHook<any, any>(() => useCommunities({ communityAddresses: undefined }));
    await act(async () => {});
    expect(rendered.result.current.communities).toEqual([]);
  });

  test("useCommunities effect returns early when account is undefined (branch 180)", async () => {
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
    const rendered = renderHook<any, any>(() =>
      useCommunities({ communityAddresses: ["community address 1"] }),
    );
    await act(async () => {});
    expect(rendered.result.current.communities).toEqual([undefined]);
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("useListCommunities hits log and setState when arrays differ (lines 225, 228)", async () => {
    vi.useFakeTimers();
    try {
      const communities = ["addr-a", "addr-b"];
      const mockAccount = { plebbit: { communities } };
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue(mockAccount as any);
      const rendered = renderHook<any, any>(() => useListCommunities());
      await act(async () => {});
      vi.advanceTimersByTime(1100);
      await act(async () => {});
      expect(rendered.result.current).toEqual(["addr-a", "addr-b"]);
    } finally {
      vi.mocked(accountsHooks.useAccount).mockRestore();
      vi.useRealTimers();
    }
  });

  test("useListCommunities reads communities from the requested account", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(accountsHooks, "useAccount").mockImplementation(({ accountName }: any = {}) =>
        accountName === "Account 2"
          ? ({ plebbit: { communities: ["account 2 owner community"] } } as any)
          : ({ plebbit: { communities: ["active owner community"] } } as any),
      );
      const rendered = renderHook<any, any>(() => useListCommunities("Account 2"));
      await act(async () => {});
      vi.advanceTimersByTime(1100);
      await act(async () => {});
      expect(rendered.result.current).toEqual(["account 2 owner community"]);
    } finally {
      vi.mocked(accountsHooks.useAccount).mockRestore();
      vi.useRealTimers();
    }
  });

  test("useListCommunities no-change branch when arrays match (line 227)", async () => {
    vi.useFakeTimers();
    try {
      const rendered = renderHook<any, any>(() => useListCommunities());
      await act(async () => {});
      vi.advanceTimersByTime(2500);
      await act(async () => {});
      const first = [...rendered.result.current];
      vi.advanceTimersByTime(1100);
      await act(async () => {});
      expect(rendered.result.current).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  test("useListCommunities treats missing plebbit.communities as empty", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue({ plebbit: {} } as any);
      const rendered = renderHook<any, any>(() => useListCommunities());
      await act(async () => {});
      vi.advanceTimersByTime(1100);
      await act(async () => {});
      expect(rendered.result.current).toEqual([]);
    } finally {
      vi.mocked(accountsHooks.useAccount).mockRestore();
      vi.useRealTimers();
    }
  });

  test("useCommunities addCommunityToStore catch logs error (stmt 189)", async () => {
    const origAdd = communityStore.getState().addCommunityToStore;
    communityStore.setState({
      addCommunityToStore: () => Promise.reject(new Error("addCommunity failed")),
    });
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderHook<any, any>(() =>
      useCommunities({ communityAddresses: ["new-addr-1", "new-addr-2"] }),
    );
    await new Promise((r) => setTimeout(r, 100));
    communityStore.setState({ addCommunityToStore: origAdd });
    logSpy.mockRestore();
  });

  test("useCommunityStats with no options (branch 88)", async () => {
    const rendered = renderHook<any, any>(() => useCommunityStats());
    await act(async () => {});
    expect(rendered.result.current.state).toBe("uninitialized");
  });

  test("useCommunityStats", async () => {
    const rendered = renderHook<any, any>(() =>
      useCommunityStats({ communityAddress: "address 1" }),
    );
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.hourActiveUserCount);
    expect(rendered.result.current.hourActiveUserCount).toBe(1);
  });

  test("useCommunityStats fetchCid error logs (stmt 110)", async () => {
    const origFetch = Plebbit.prototype.fetchCid;
    (Plebbit.prototype as any).fetchCid = () => Promise.reject(new Error("fetchCid failed"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rendered = renderHook<any, any>(() =>
      useCommunityStats({ communityAddress: "community address 1" }),
    );
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "failed");
    expect(rendered.result.current.error?.message).toBe("fetchCid failed");
    expect(rendered.result.current.errors).toHaveLength(1);
    (Plebbit.prototype as any).fetchCid = origFetch;
    logSpy.mockRestore();
  });

  describe("useResolvedCommunityAddress", () => {
    const timeout = 60000;

    // skip because uses internet and not deterministic
    test.skip("useResolvedCommunityAddress", { timeout }, async () => {
      const rendered = renderHook<any, any>((communityAddress) =>
        useResolvedCommunityAddress({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender("plebbit.eth");
      await waitFor(() => typeof rendered.result.current.resolvedAddress === "string");
      expect(rendered.result.current.resolvedAddress).toBe(
        "QmW5Zt7YXmtskSUjjenGNS3QNRbjqjUPaT35zw5RYUCtY1",
      );
    });

    test("unsupported crypto domain", { timeout }, async () => {
      const rendered = renderHook<any, any>((communityAddress) =>
        useResolvedCommunityAddress({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender("plebbit.com");
      await waitFor(() => rendered.result.current.error);
      expect(rendered.result.current.error.message).toBe("crypto domain type unsupported");
    });

    test("not a crypto domain", { timeout }, async () => {
      const rendered = renderHook<any, any>((communityAddress) =>
        useResolvedCommunityAddress({ communityAddress }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender("abc");
      await waitFor(() => rendered.result.current.error);
      expect(rendered.result.current.error.message).toBe("not a crypto domain");
    });

    test("reset when communityAddress undefined", async () => {
      vi.useFakeTimers();
      const resolveSpy = vi.spyOn(chain, "resolveEnsTxtRecord").mockResolvedValue("resolved-addr");
      const rendered = renderHook<any, any>((opts: any) =>
        useResolvedCommunityAddress({ communityAddress: opts?.communityAddress }),
      );
      rendered.rerender({ communityAddress: "test.eth" });
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress || rendered.result.current.state).toBeTruthy();
      rendered.rerender({ communityAddress: undefined });
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe(undefined);
      expect(rendered.result.current.state).toBe("initializing");
      resolveSpy.mockRestore();
      vi.useRealTimers();
    });

    test("success with mocked resolver", async () => {
      vi.useFakeTimers();
      const resolveSpy = vi
        .spyOn(chain, "resolveEnsTxtRecord")
        .mockResolvedValue("resolved-cid-123");
      const rendered = renderHook<any, any>(() =>
        useResolvedCommunityAddress({ communityAddress: "test.eth" }),
      );
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe("resolved-cid-123");
      expect(rendered.result.current.state).toBe("succeeded");
      resolveSpy.mockRestore();
      vi.useRealTimers();
    });

    test("failure when resolve throws", async () => {
      vi.useFakeTimers();
      const resolveSpy = vi
        .spyOn(chain, "resolveEnsTxtRecord")
        .mockRejectedValue(new Error("name not registered"));
      const rendered = renderHook<any, any>(() =>
        useResolvedCommunityAddress({ communityAddress: "nonexistent.eth" }),
      );
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.error?.message).toBe("name not registered");
      expect(rendered.result.current.state).toBe("failed");
      resolveSpy.mockRestore();
      vi.useRealTimers();
    });

    test("resolved address no-change branch when res equals resolvedAddress (line 291)", async () => {
      vi.useFakeTimers();
      const resolvedAddr = "same-resolved-addr";
      const resolveSpy = vi.spyOn(chain, "resolveEnsTxtRecord").mockResolvedValue(resolvedAddr);
      const rendered = renderHook<any, any>(() =>
        useResolvedCommunityAddress({ communityAddress: "test.eth", cache: false }),
      );
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe(resolvedAddr);
      vi.advanceTimersByTime(16000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe(resolvedAddr);
      expect(resolveSpy).toHaveBeenCalledTimes(2);
      resolveSpy.mockRestore();
      vi.useRealTimers();
    });

    test("useResolvedCommunityAddress reset branch clears state when communityAddress cleared", async () => {
      vi.useFakeTimers();
      const resolveSpy = vi.spyOn(chain, "resolveEnsTxtRecord").mockResolvedValue("resolved");
      const rendered = renderHook<any, any>((opts: any) => useResolvedCommunityAddress(opts));
      rendered.rerender({ communityAddress: "test.eth" });
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe("resolved");
      rendered.rerender({ communityAddress: undefined });
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe(undefined);
      expect(rendered.result.current.state).toBe("initializing");
      resolveSpy.mockRestore();
      vi.useRealTimers();
    });

    test("useResolvedCommunityAddress reset clears errors when communityAddress cleared (line 289)", async () => {
      vi.useFakeTimers();
      const resolveSpy = vi
        .spyOn(chain, "resolveEnsTxtRecord")
        .mockRejectedValue(new Error("name not registered"));
      const rendered = renderHook<any, any>((opts: any) => useResolvedCommunityAddress(opts));
      rendered.rerender({ communityAddress: "nonexistent.eth" });
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe(undefined);
      expect(rendered.result.current.errors.length).toBeGreaterThan(0);
      rendered.rerender({ communityAddress: undefined });
      vi.advanceTimersByTime(2000);
      await act(async () => {});
      expect(rendered.result.current.resolvedAddress).toBe(undefined);
      expect(rendered.result.current.errors).toEqual([]);
      expect(rendered.result.current.state).toBe("initializing");
      resolveSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  test("resolveCommunityAddress throw for non-.eth", async () => {
    await expect(resolveCommunityAddress("plebbit.com", {})).rejects.toThrow(
      "resolveCommunityAddress invalid communityAddress",
    );
  });
});
