import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../lib/test-utils";
import {
  useCommunity,
  useCommunityStats,
  useCommunities,
  setPkcJs,
  useResolvedCommunityAddress,
} from "..";
import * as accountsHooks from "./accounts";
import accountsStore from "../stores/accounts";
import communityStore from "../stores/communities";
import communitiesPagesStore from "../stores/communities-pages";
import { useListCommunities, resolveCommunityAddress } from "./communities";
import PkcJsMock, { PKC, Community } from "../lib/pkc-js/pkc-js-mock";
import * as chain from "../lib/chain";

const toCommunity = (communityAddress?: string) =>
  communityAddress ? ({ address: communityAddress } as any) : undefined;

const toCommunities = (communityAddresses?: string[]) =>
  communityAddresses?.map((communityAddress) => ({ address: communityAddress }) as any);

describe("communities", () => {
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

  describe("no communities in database", () => {
    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("get communities one at a time", async () => {
      const rendered = renderHook<any, any>((communityAddress) =>
        useCommunity({ community: toCommunity(communityAddress) }),
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
        useCommunity({ community: toCommunity(communityAddress) }),
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
      rendered = renderHook<any, any>((options: any) =>
        useCommunity({
          community: options?.community,
          onlyIfCached: options?.onlyIfCached,
        }),
      );
      testUtils.createWaitFor(rendered);

      rendered.rerender({ community: { name: "community address 1" }, onlyIfCached: true });
      expect(rendered.result.current.syncState).toBe("stopped");
      expect(rendered.result.current.hasCachedData).toBe(false);
      expect(rendered.result.current.lastFetchAttemptAt).toBeUndefined();
      expect(rendered.result.current.lastSuccessfulFetchAt).toBeUndefined();
      // TODO: find better way to wait
      await new Promise((r) => setTimeout(r, 20));
      // community not added to store
      expect(communityStore.getState().communities).toEqual({});

      rendered = renderHook<any, any>((options: any) =>
        useCommunities({
          communities: options?.communities,
          onlyIfCached: options?.onlyIfCached,
        }),
      );
      testUtils.createWaitFor(rendered);

      rendered.rerender({
        communities: toCommunities(["community address 1", "community address 2"]),
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
        useCommunities({ communities: toCommunities(communityAddresses) }),
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

    test("get multiple communities with communities keyed by publicKey", async () => {
      const communities = [
        { name: "community-one.eth", publicKey: "community-public-key-1" },
        { name: "community-two.eth", publicKey: "community-public-key-2" },
      ];
      const rendered = renderHook<any, any>(() => useCommunities({ communities }));
      const waitFor = testUtils.createWaitFor(rendered);

      expect(rendered.result.current.communities).toEqual([undefined, undefined]);

      await waitFor(
        () =>
          typeof rendered.result.current.communities[0]?.address === "string" &&
          typeof rendered.result.current.communities[1]?.address === "string",
      );
      expect(rendered.result.current.communities[0].address).toBe("community-one.eth");
      expect(rendered.result.current.communities[0].publicKey).toBe("community-public-key-1");
      expect(rendered.result.current.communities[1].address).toBe("community-two.eth");
      expect(rendered.result.current.communities[1].publicKey).toBe("community-public-key-2");
      expect(communityStore.getState().communities["community-public-key-1"]?.address).toBe(
        "community-one.eth",
      );
      expect(communityStore.getState().communities["community-public-key-2"]?.address).toBe(
        "community-two.eth",
      );
    });

    test("exposes community sync lifecycle separately from cached data state", async () => {
      const communityUpdate = Community.prototype.update;
      const updatingCommunities: Community[] = [];
      let now = 1_800_000_000_000;
      const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
      Community.prototype.update = async function () {
        updatingCommunities.push(this);
      };

      try {
        const rendered = renderHook<any, any>((communityAddress) =>
          useCommunity({ community: toCommunity(communityAddress) }),
        );
        const waitFor = testUtils.createWaitFor(rendered);
        rendered.rerender("community address");

        expect(rendered.result.current.syncState).toBe("initializing");
        expect(rendered.result.current.hasCachedData).toBe(false);
        await waitFor(() => updatingCommunities.length > 0);
        expect(rendered.result.current.lastFetchAttemptAt).toBeUndefined();

        now += 1_000;
        updatingCommunities[0].emit("updatingstatechange", "fetching-ipns");
        await waitFor(() => rendered.result.current.syncState === "loading");
        expect(rendered.result.current.lastFetchAttemptAt).toBe(1_800_000_001);

        now += 1_000;
        updatingCommunities[0].emit("updatingstatechange", "fetching-ipfs");
        await act(async () => {});
        expect(rendered.result.current.syncState).toBe("loading");
        expect(rendered.result.current.lastFetchAttemptAt).toBe(1_800_000_001);

        const retriableError = Object.assign(new Error("ipns record not found"), {
          details: { retriableError: true },
        });
        updatingCommunities[0].emit("error", retriableError);
        updatingCommunities[0].emit("updatingstatechange", "waiting-retry");
        await waitFor(() => rendered.result.current.syncState === "retrying");
        expect(rendered.result.current.lastRetriableError).toBe(retriableError);
        expect(rendered.result.current.error).toBeUndefined();

        now += 1_000;
        updatingCommunities[0].emit("updatingstatechange", "fetching-ipns");
        await waitFor(() => rendered.result.current.syncState === "loading");
        expect(rendered.result.current.lastFetchAttemptAt).toBe(1_800_000_003);
        // the next attempt keeps the reason the last one failed until one succeeds
        expect(rendered.result.current.lastRetriableError).toBe(retriableError);

        updatingCommunities[0].updatedAt = 1_799_999_000;
        updatingCommunities[0].emit("update", updatingCommunities[0]);
        now += 1_000;
        updatingCommunities[0].emit("updatingstatechange", "succeeded");
        await waitFor(() => rendered.result.current.syncState === "succeeded");
        expect(rendered.result.current.state).toBe("succeeded");
        expect(rendered.result.current.hasCachedData).toBe(true);
        expect(rendered.result.current.lastSuccessfulFetchAt).toBe(1_800_000_004);
        expect(rendered.result.current.lastRetriableError).toBeUndefined();

        updatingCommunities[0].emit("updatingstatechange", "waiting-retry");
        await waitFor(() => rendered.result.current.syncState === "retrying");
        expect(rendered.result.current.state).toBe("succeeded");

        updatingCommunities[0].emit("updatingstatechange", "publishing-ipns");
        await waitFor(() => rendered.result.current.syncState === "loading");

        updatingCommunities[0].emit("updatingstatechange", "stopped");
        await waitFor(() => rendered.result.current.syncState === "stopped");

        updatingCommunities[0].emit("updatingstatechange", "failed");
        await waitFor(() => rendered.result.current.syncState === "failed");
      } finally {
        Community.prototype.update = communityUpdate;
        nowSpy.mockRestore();
      }
    });

    test("overlays local community edit summary from the active account", async () => {
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue({ id: "acc-1", pkc: {} } as any);
      try {
        communityStore.setState({
          communities: {
            "community address": {
              address: "community address",
              title: "original title",
            } as any,
          },
        });
        accountsStore.setState({
          accountsEditsSummaries: {
            "acc-1": {
              "community address": {
                title: { timestamp: 10, value: "edited title" },
              },
            },
          },
        } as any);

        const rendered = renderHook<any, any>(() =>
          useCommunity({ community: { name: "community address" }, onlyIfCached: true }),
        );

        expect(rendered.result.current.address).toBe("community address");
        expect(rendered.result.current.title).toBe("edited title");
      } finally {
        vi.mocked(accountsHooks.useAccount).mockRestore();
      }
    });

    test("ignores stale rename summaries when a different live community now exists at that key", async () => {
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue({ id: "acc-1", pkc: {} } as any);
      try {
        communityStore.setState({
          communities: {
            "community address": {
              address: "community address",
              title: "replacement title",
            } as any,
          },
        });
        accountsStore.setState({
          accountsEditsSummaries: {
            "acc-1": {
              "community address": {
                address: { timestamp: 11, value: "renamed.eth" },
                title: { timestamp: 12, value: "stale edited title" },
              },
            },
          },
        } as any);

        const rendered = renderHook<any, any>(() =>
          useCommunity({ community: { name: "community address" }, onlyIfCached: true }),
        );

        expect(rendered.result.current.address).toBe("community address");
        expect(rendered.result.current.title).toBe("replacement title");
      } finally {
        vi.mocked(accountsHooks.useAccount).mockRestore();
      }
    });

    test("has unsuperseded error events", async () => {
      // mock update to save community instance
      const communityUpdate = Community.prototype.update;
      const updatingCommunities: any = [];
      Community.prototype.update = function () {
        updatingCommunities.push(this);
        return Promise.resolve();
      };

      try {
        const rendered = renderHook<any, any>((communityAddress) =>
          useCommunity({ community: toCommunity(communityAddress) }),
        );
        const waitFor = testUtils.createWaitFor(rendered, { timeout: 3000 });
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
      } finally {
        // restore mock
        Community.prototype.update = communityUpdate;
      }
    });

    test("pkc.createCommunity throws adds useCommunity().error", async () => {
      // mock update to save community instance
      const createCommunity = PKC.prototype.createCommunity;
      PKC.prototype.createCommunity = async function () {
        throw Error("pkc.createCommunity error");
      };

      const rendered = renderHook<any, any>((communityAddress) =>
        useCommunity({ community: toCommunity(communityAddress) }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender("community address");

      // pkc.createCommunity error
      await waitFor(() => rendered.result.current.error.message === "pkc.createCommunity error");
      expect(rendered.result.current.error.message).toBe("pkc.createCommunity error");
      expect(rendered.result.current.errors[0].message).toBe("pkc.createCommunity error");
      expect(rendered.result.current.errors.length).toBe(1);
      expect(rendered.result.current.syncState).toBe("failed");

      // restore mock
      PKC.prototype.createCommunity = createCommunity;
    });
  });

  describe("auto update subscriptions", () => {
    let startSpy: any;
    let stopSpy: any;
    let addSpy: any;
    beforeEach(() => {
      startSpy = vi.fn().mockResolvedValue(undefined);
      stopSpy = vi.fn().mockResolvedValue(undefined);
      addSpy = vi.fn().mockResolvedValue(undefined);
      communityStore.setState({
        startCommunityAutoUpdate: startSpy,
        stopCommunityAutoUpdate: stopSpy,
        addCommunityToStore: addSpy,
      });
    });

    test("useCommunity keeps its community updating until it unmounts", async () => {
      const rendered = renderHook<any, any>((community) => useCommunity({ community }));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender({ address: "subscribed community" });
      await waitFor(() => startSpy.mock.calls.length === 1);
      const [community, subscriberId] = startSpy.mock.calls[0];
      expect(community).toEqual({ address: "subscribed community" });
      expect(subscriberId).toMatch(/^useCommunity-/);

      // a new object for the same community does not resubscribe
      rendered.rerender({ address: "subscribed community" });
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(stopSpy).not.toHaveBeenCalled();

      rendered.rerender({ address: "other community" });
      expect(stopSpy).toHaveBeenCalledWith({ address: "subscribed community" }, subscriberId);
      expect(startSpy).toHaveBeenCalledTimes(2);

      rendered.unmount();
      expect(stopSpy).toHaveBeenCalledWith({ address: "other community" }, subscriberId);
      expect(addSpy).not.toHaveBeenCalled();
    });

    test("useCommunity autoUpdate false and onlyIfCached don't keep it updating", async () => {
      const rendered = renderHook<any, any>((options) => useCommunity(options));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender({ community: { address: "one-shot community" }, autoUpdate: false });
      await waitFor(() => addSpy.mock.calls.length === 1);
      expect(addSpy.mock.calls[0][0]).toEqual({ address: "one-shot community" });

      rendered.rerender({ community: { address: "cached community" }, onlyIfCached: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).not.toHaveBeenCalled();
      rendered.unmount();
      expect(stopSpy).not.toHaveBeenCalled();
    });

    test("useCommunity reports a stopped community it restarts as loading", async () => {
      const address = "stopped community";
      communityStore.setState((state: any) => ({
        communities: { ...state.communities, [address]: { address, updatedAt: 100 } },
        syncStatuses: {
          ...state.syncStatuses,
          [address]: { syncState: "stopped", lastSuccessfulFetchAt: 100, stoppedUntilUsed: true },
        },
      }));
      const rendered = renderHook<any, any>((options) => useCommunity(options));
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender({ community: { address } });
      await waitFor(() => startSpy.mock.calls.length === 1);
      expect(rendered.result.current.syncState).toBe("loading");
      expect(rendered.result.current.lastSuccessfulFetchAt).toBe(100);

      rendered.rerender({ community: { address }, onlyIfCached: true });
      expect(rendered.result.current.syncState).toBe("stopped");
    });

    test("useCommunities keeps its communities updating until it unmounts", async () => {
      const rendered = renderHook<any, any>((communityAddresses) =>
        useCommunities({ communities: toCommunities(communityAddresses) }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender(["community b", "community a", "community b"]);
      await waitFor(() => startSpy.mock.calls.length === 2);
      const subscriberId = startSpy.mock.calls[0][1];
      expect(subscriberId).toMatch(/^useCommunities-/);
      expect(startSpy.mock.calls.map((call: any[]) => call[0].address).sort()).toEqual([
        "community a",
        "community b",
      ]);

      // a new array of the same communities does not resubscribe
      rendered.rerender(["community b", "community a", "community b"]);
      expect(startSpy).toHaveBeenCalledTimes(2);

      rendered.unmount();
      expect(stopSpy.mock.calls.map((call: any[]) => call[0].address).sort()).toEqual([
        "community a",
        "community b",
      ]);
      expect(stopSpy.mock.calls.every((call: any[]) => call[1] === subscriberId)).toBe(true);
    });

    test("useCommunities autoUpdate false loads its communities once", async () => {
      const rendered = renderHook<any, any>((communityAddresses) =>
        useCommunities({ communities: toCommunities(communityAddresses), autoUpdate: false }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      rendered.rerender(["community a", "community b"]);
      await waitFor(() => addSpy.mock.calls.length === 2);
      rendered.unmount();
      expect(startSpy).not.toHaveBeenCalled();
      expect(stopSpy).not.toHaveBeenCalled();
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

  test("useCommunities with communities undefined returns empty (branch 171)", async () => {
    const rendered = renderHook<any, any>(() => useCommunities({ communities: undefined }));
    await act(async () => {});
    expect(rendered.result.current.communities).toEqual([]);
  });

  test("useCommunity rejects removed communityAddress", () => {
    expect(() =>
      renderHook(() => useCommunity({ communityAddress: "community address 1" } as any)),
    ).toThrow(/communityAddress has been removed/);
  });

  test("useCommunities rejects removed communityAddresses and communityRefs", () => {
    expect(() =>
      renderHook(() => useCommunities({ communityAddresses: ["community address 1"] } as any)),
    ).toThrow(/communityAddresses has been removed/);
    expect(() =>
      renderHook(() =>
        useCommunities({
          communityRefs: [{ name: "community address 1" }],
        } as any),
      ),
    ).toThrow(/communityRefs has been removed/);
  });

  test("useCommunities effect returns early when account is undefined (branch 180)", async () => {
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
    const rendered = renderHook<any, any>(() =>
      useCommunities({ communities: toCommunities(["community address 1"]) }),
    );
    await act(async () => {});
    expect(rendered.result.current.communities).toEqual([undefined]);
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("useCommunity does not throw when account is undefined on render", () => {
    vi.spyOn(accountsHooks, "useAccount").mockReturnValue(undefined as any);
    expect(() =>
      renderHook(() => useCommunity({ community: { name: "community address 1" } })),
    ).not.toThrow();
    vi.mocked(accountsHooks.useAccount).mockRestore();
  });

  test("useListCommunities hits log and setState when arrays differ (lines 225, 228)", async () => {
    vi.useFakeTimers();
    try {
      const communities = ["addr-a", "addr-b"];
      const mockAccount = { pkc: { communities } };
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

  test("useListCommunities returns the addresses of pkc-js communities entries", async () => {
    vi.useFakeTimers();
    try {
      const communities = [
        { name: "named.bso", publicKey: "12D3KooWNamed", address: "named.bso", started: true },
        { publicKey: "12D3KooWUnnamed", address: "12D3KooWUnnamed", started: false },
      ];
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue({ pkc: { communities } } as any);
      const rendered = renderHook<any, any>(() => useListCommunities());
      await act(async () => {});
      vi.advanceTimersByTime(1100);
      await act(async () => {});
      expect(rendered.result.current).toEqual(["named.bso", "12D3KooWUnnamed"]);
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
          ? ({ pkc: { communities: ["account 2 owner community"] } } as any)
          : ({ pkc: { communities: ["active owner community"] } } as any),
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

  test("useListCommunities treats missing pkc.communities as empty", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(accountsHooks, "useAccount").mockReturnValue({ pkc: {} } as any);
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
      useCommunities({ communities: toCommunities(["new-addr-1", "new-addr-2"]) }),
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
      useCommunityStats({ community: { name: "address 1" } }),
    );
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.hourActiveUserCount);
    expect(rendered.result.current.hourActiveUserCount).toBe(1);
  });

  test("useCommunityStats unwraps fetchCid content responses", async () => {
    let fetchSpy: { mockRestore: () => void } | undefined;
    try {
      fetchSpy = vi.spyOn(PKC.prototype as any, "fetchCid").mockResolvedValue({
        content: {
          hourActiveUserCount: 3,
          weekActiveUserCount: 33,
          allPostCount: 333,
        },
      });
      const rendered = renderHook<any, any>(() =>
        useCommunityStats({ community: { name: "wrapped stats" } }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.hourActiveUserCount).toBe(3);
      expect(rendered.result.current.weekActiveUserCount).toBe(33);
      expect(rendered.result.current.allPostCount).toBe(333);
    } finally {
      fetchSpy?.mockRestore();
    }
  });

  test("useCommunityStats parses string fetchCid content responses", async () => {
    let fetchSpy: { mockRestore: () => void } | undefined;
    try {
      fetchSpy = vi.spyOn(PKC.prototype as any, "fetchCid").mockResolvedValue({
        content: JSON.stringify({
          hourActiveUserCount: 4,
          weekActiveUserCount: 44,
          allPostCount: 444,
        }),
      });
      const rendered = renderHook<any, any>(() =>
        useCommunityStats({ community: { name: "string wrapped stats" } }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.hourActiveUserCount).toBe(4);
      expect(rendered.result.current.weekActiveUserCount).toBe(44);
      expect(rendered.result.current.allPostCount).toBe(444);
    } finally {
      fetchSpy?.mockRestore();
    }
  });

  test("useCommunityStats parses string fetchCid responses", async () => {
    let fetchSpy: { mockRestore: () => void } | undefined;
    try {
      fetchSpy = vi.spyOn(PKC.prototype as any, "fetchCid").mockResolvedValue(
        JSON.stringify({
          hourActiveUserCount: 5,
          weekActiveUserCount: 55,
          allPostCount: 555,
        }),
      );
      const rendered = renderHook<any, any>(() =>
        useCommunityStats({ community: { name: "string stats" } }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.hourActiveUserCount).toBe(5);
      expect(rendered.result.current.weekActiveUserCount).toBe(55);
      expect(rendered.result.current.allPostCount).toBe(555);
    } finally {
      fetchSpy?.mockRestore();
    }
  });

  test("useCommunityStats accepts object fetchCid responses", async () => {
    let fetchSpy: { mockRestore: () => void } | undefined;
    try {
      fetchSpy = vi.spyOn(PKC.prototype as any, "fetchCid").mockResolvedValue({
        hourActiveUserCount: 6,
        weekActiveUserCount: 66,
        allPostCount: 666,
      });
      const rendered = renderHook<any, any>(() =>
        useCommunityStats({ community: { name: "object stats" } }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.hourActiveUserCount).toBe(6);
      expect(rendered.result.current.weekActiveUserCount).toBe(66);
      expect(rendered.result.current.allPostCount).toBe(666);
    } finally {
      fetchSpy?.mockRestore();
    }
  });

  test("useCommunityStats keeps direct stats responses with content fields", async () => {
    let fetchSpy: { mockRestore: () => void } | undefined;
    try {
      fetchSpy = vi.spyOn(PKC.prototype as any, "fetchCid").mockResolvedValue({
        content: "not json stats content",
        hourActiveUserCount: 5,
        weekActiveUserCount: 55,
        allPostCount: 555,
      });
      const rendered = renderHook<any, any>(() =>
        useCommunityStats({ community: { name: "stats with content" } }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.hourActiveUserCount).toBe(5);
      expect(rendered.result.current.weekActiveUserCount).toBe(55);
      expect(rendered.result.current.allPostCount).toBe(555);
      expect(rendered.result.current.content).toBe("not json stats content");
    } finally {
      fetchSpy?.mockRestore();
    }
  });

  test("useCommunityStats keeps unrecognized content responses", async () => {
    let fetchSpy: { mockRestore: () => void } | undefined;
    try {
      fetchSpy = vi.spyOn(PKC.prototype as any, "fetchCid").mockResolvedValue({
        content: "not json stats content",
      });
      const rendered = renderHook<any, any>(() =>
        useCommunityStats({ community: { name: "unknown content stats" } }),
      );
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.content).toBe("not json stats content");
    } finally {
      fetchSpy?.mockRestore();
    }
  });

  test("useCommunityStats fetchCid error logs (stmt 110)", async () => {
    const origFetch = PKC.prototype.fetchCid;
    (PKC.prototype as any).fetchCid = () => Promise.reject(new Error("fetchCid failed"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rendered = renderHook<any, any>(() =>
      useCommunityStats({ community: { name: "community address 1" } }),
    );
    const waitFor = testUtils.createWaitFor(rendered);
    await waitFor(() => rendered.result.current.state === "failed");
    expect(rendered.result.current.error?.message).toBe("fetchCid failed");
    expect(rendered.result.current.errors).toHaveLength(1);
    (PKC.prototype as any).fetchCid = origFetch;
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

      rendered.rerender("pkc.eth");
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

      rendered.rerender("pkc.com");
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

    test("useResolvedCommunityAddress only reports the result of the current address", async () => {
      const releases: { [address: string]: (resolved: string) => void } = {};
      const resolveSpy = vi
        .spyOn(chain, "resolveEnsTxtRecord")
        .mockImplementation(
          (address: string) => new Promise((resolve) => (releases[address] = resolve)),
        );
      try {
        const rendered = renderHook<any, any>((communityAddress) =>
          useResolvedCommunityAddress({ communityAddress, cache: false }),
        );
        rendered.rerender("first.eth");
        await act(async () => {});
        rendered.rerender("second.eth");
        await act(async () => {});
        expect(releases["second.eth"]).toBeDefined();

        // the first address resolves after the address changed
        await act(async () => {
          releases["first.eth"]("first-resolved");
        });
        expect(rendered.result.current.resolvedAddress).toBe(undefined);
        expect(rendered.result.current.state).toBe("resolving");

        await act(async () => {
          releases["second.eth"]("second-resolved");
        });
        expect(rendered.result.current.resolvedAddress).toBe("second-resolved");
        expect(rendered.result.current.state).toBe("succeeded");

        // a new address doesn't report the previous address's result while it resolves
        rendered.rerender("third.eth");
        await act(async () => {});
        expect(rendered.result.current.resolvedAddress).toBe(undefined);
        expect(rendered.result.current.state).toBe("resolving");
      } finally {
        resolveSpy.mockRestore();
      }
    });

    test("useResolvedCommunityAddress keeps its result while polling and clears a recovered error", async () => {
      vi.useFakeTimers();
      let resolveCalls = 0;
      const resolveSpy = vi.spyOn(chain, "resolveEnsTxtRecord").mockImplementation(() => {
        resolveCalls++;
        if (resolveCalls === 1) {
          return Promise.reject(new Error("name not registered"));
        }
        if (resolveCalls === 2) {
          return Promise.resolve("resolved");
        }
        // the next poll never finishes
        return new Promise(() => {});
      });
      try {
        const rendered = renderHook<any, any>(() =>
          useResolvedCommunityAddress({ communityAddress: "polled.eth", cache: false }),
        );
        await act(async () => {});
        expect(rendered.result.current.state).toBe("failed");
        expect(rendered.result.current.error?.message).toBe("name not registered");

        // the next poll succeeds
        await act(async () => {
          vi.advanceTimersByTime(15000);
        });
        expect(resolveCalls).toBe(2);
        expect(rendered.result.current.state).toBe("succeeded");
        expect(rendered.result.current.resolvedAddress).toBe("resolved");
        expect(rendered.result.current.error).toBe(undefined);
        expect(rendered.result.current.errors).toEqual([]);

        // a background poll doesn't go back to 'resolving'
        await act(async () => {
          vi.advanceTimersByTime(15000);
        });
        expect(resolveCalls).toBe(3);
        expect(rendered.result.current.state).toBe("succeeded");
        expect(rendered.result.current.resolvedAddress).toBe("resolved");
      } finally {
        resolveSpy.mockRestore();
        vi.useRealTimers();
      }
    });
  });

  test("resolveCommunityAddress throw for non-.eth", async () => {
    await expect(resolveCommunityAddress("pkc.com", {})).rejects.toThrow(
      "resolveCommunityAddress invalid communityAddress",
    );
  });
});
