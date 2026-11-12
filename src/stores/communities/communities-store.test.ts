import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import communitiesStore, {
  COMMUNITY_UPDATE_INTERVAL_MS,
  COMMUNITY_UPDATE_STOP_GRACE_MS,
  resetCommunitiesDatabaseAndStore,
} from "./communities-store";
import localForageLru from "../../lib/localforage-lru";
import { setPkcJs } from "../..";
import PkcJsMock, { PKC as BasePkc } from "../../lib/pkc-js/pkc-js-mock";
import accountsStore from "../accounts";
import communitiesPagesStore from "../communities-pages";
import utils from "../../lib/utils";

let mockAccount: any;

describe("communities store", () => {
  beforeAll(async () => {
    setPkcJs(PkcJsMock);
    testUtils.silenceReactWarnings();
    const pkc = await PkcJsMock();
    mockAccount = { id: "mock-account-id", pkc };
  });
  afterAll(() => {
    testUtils.restoreAll();
  });

  afterEach(async () => {
    await resetCommunitiesDatabaseAndStore();
  });

  test("initial store", () => {
    const { result } = renderHook(() => communitiesStore.getState());
    expect(result.current.communities).toEqual({});
    expect(result.current.errors).toEqual({});
    expect(result.current.syncStatuses).toEqual({});
    expect(typeof result.current.addCommunityToStore).toBe("function");
  });

  test("addCommunityToStore adds community from pkc", async () => {
    const address = "community address 1";

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    expect(communitiesStore.getState().communities[address]).toBeDefined();
    expect(communitiesStore.getState().communities[address].address).toBe(address);
  });

  test("addCommunityToStore keys community refs by publicKey", async () => {
    const communityRef = { name: "community-name.eth", publicKey: "community-public-key" };
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockImplementation(createOrig.bind(mockAccount.pkc));

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(communityRef, mockAccount);
      });

      expect(mockAccount.pkc.createCommunity).toHaveBeenCalledWith(communityRef);
      expect(communitiesStore.getState().communities[communityRef.publicKey]).toBeDefined();
      expect(communitiesStore.getState().communities[communityRef.publicKey]?.address).toBe(
        communityRef.name,
      );
      expect(communitiesStore.getState().communities[communityRef.publicKey]?.publicKey).toBe(
        communityRef.publicKey,
      );
    } finally {
      mockAccount.pkc.createCommunity = createOrig;
    }
  });

  test("addCommunityToStore does not retry publicKey lookups as legacy addresses", async () => {
    const communityRef = { name: "reject-name.eth", publicKey: "reject-public-key" };
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockRejectedValue(new Error("create failed"));

    try {
      await act(async () => {
        try {
          await communitiesStore.getState().addCommunityToStore(communityRef, mockAccount);
        } catch (error) {
          expect((error as Error).message).toBe("create failed");
        }
      });

      expect(mockAccount.pkc.createCommunity).toHaveBeenCalledTimes(1);
      expect(mockAccount.pkc.createCommunity).toHaveBeenCalledWith(communityRef);
      expect(mockAccount.pkc.createCommunity).not.toHaveBeenCalledWith({
        address: communityRef.publicKey,
      });
      expect(communitiesStore.getState().communities[communityRef.publicKey]).toBeUndefined();
      expect(communitiesStore.getState().errors[communityRef.publicKey]?.[0].message).toBe(
        "create failed",
      );
    } finally {
      mockAccount.pkc.createCommunity = createOrig;
    }
  });

  test("addCommunityToStore fails when structured lookup returns no address", async () => {
    const communityRef = { name: "missing-address.eth", publicKey: "missing-address-public-key" };
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue({});

    try {
      await expect(
        communitiesStore.getState().addCommunityToStore(communityRef, mockAccount),
      ).rejects.toThrow("failed getting community 'missing-address-public-key'");

      expect(communitiesStore.getState().communities[communityRef.publicKey]).toBeUndefined();
      expect(communitiesStore.getState().errors[communityRef.publicKey]?.[0].message).toBe(
        "communitiesStore.addCommunityToStore failed getting community 'missing-address-public-key'",
      );
    } finally {
      mockAccount.pkc.createCommunity = createOrig;
    }
  });

  test("refreshCommunity uses structured community lookups and stores by publicKey", async () => {
    const communityRef = { name: "refresh-name.eth", publicKey: "refresh-public-key" };
    const getOrig = mockAccount.pkc.getCommunity;
    mockAccount.pkc.getCommunity = vi.fn().mockImplementation(getOrig.bind(mockAccount.pkc));

    try {
      await act(async () => {
        await communitiesStore.getState().refreshCommunity(communityRef, mockAccount);
      });

      expect(mockAccount.pkc.getCommunity).toHaveBeenCalledWith(communityRef);
      expect(communitiesStore.getState().communities[communityRef.publicKey]).toBeDefined();
      expect(communitiesStore.getState().communities[communityRef.publicKey]?.fetchedAt).toEqual(
        expect.any(Number),
      );
    } finally {
      mockAccount.pkc.getCommunity = getOrig;
    }
  });

  test("refreshCommunity refreshes string addresses", async () => {
    const address = "refresh-string-address";
    const getOrig = mockAccount.pkc.getCommunity;
    mockAccount.pkc.getCommunity = vi.fn().mockImplementation(getOrig.bind(mockAccount.pkc));

    try {
      await act(async () => {
        await communitiesStore.getState().refreshCommunity(address, mockAccount);
      });

      expect(mockAccount.pkc.getCommunity).toHaveBeenCalledWith({ address });
      expect(communitiesStore.getState().communities[address]).toBeDefined();
      expect(communitiesStore.getState().communities[address]?.fetchedAt).toEqual(
        expect.any(Number),
      );
    } finally {
      mockAccount.pkc.getCommunity = getOrig;
    }
  });

  test("addCommunityToStore ignores placeholder cache entries for name lookups", async () => {
    const name = "blog.bitsocial.bso";
    const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
    await db.setItem(name, { address: name, fetchedAt: 1781773422 });

    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockImplementation(createOrig.bind(mockAccount.pkc));

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore({ name }, mockAccount);
      });

      expect(mockAccount.pkc.createCommunity).toHaveBeenCalledWith({ name });
      expect(mockAccount.pkc.createCommunity).not.toHaveBeenCalledWith({ address: name });
    } finally {
      mockAccount.pkc.createCommunity = createOrig;
    }
  });

  test("addCommunityToStore uses name-keyed cache entries with community metadata", async () => {
    const name = "cached-title.bso";
    const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
    await db.setItem(name, { address: name, fetchedAt: 1781773422, title: "Cached title" });

    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockImplementation(createOrig.bind(mockAccount.pkc));

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore({ name }, mockAccount);
      });

      expect(mockAccount.pkc.createCommunity).toHaveBeenCalledWith({
        address: name,
        title: "Cached title",
      });
      expect(communitiesStore.getState().communities[name]?.title).toBe("Cached title");
    } finally {
      mockAccount.pkc.createCommunity = createOrig;
    }
  });

  describe("cached communities", () => {
    const address = "cached-community-address";
    const cachedFetchedAt = 1781773422;
    const cachedCommunity = {
      address,
      title: "Cached title",
      updatedAt: 1781773000,
      signature: { signature: "cached record signature" },
      fetchedAt: cachedFetchedAt,
    };
    const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
    let createdCommunities: any[];
    let createCommunityOriginal: any;
    let accountsGetState: any;
    let addRoleSpy: any;

    beforeEach(async () => {
      await db.setItem(address, cachedCommunity);
      createdCommunities = [];
      createCommunityOriginal = mockAccount.pkc.createCommunity;
      // only emit events manually, like pkc-js would after community.update()
      mockAccount.pkc.createCommunity = vi.fn(async (options: any) => {
        const community = await createCommunityOriginal.call(mockAccount.pkc, options);
        vi.spyOn(community, "update").mockResolvedValue(undefined);
        createdCommunities.push(community);
        return community;
      });
      addRoleSpy = vi.fn().mockResolvedValue(undefined);
      accountsGetState = accountsStore.getState;
      (accountsStore as any).getState = () => ({
        ...accountsGetState(),
        accountsActionsInternal: { addCommunityRoleToAccountsCommunities: addRoleSpy },
      });
    });
    afterEach(() => {
      mockAccount.pkc.createCommunity = createCommunityOriginal;
      (accountsStore as any).getState = accountsGetState;
      vi.restoreAllMocks();
    });

    test("are added to the store without rewriting their cache entry", async () => {
      const setItemSpy = vi.spyOn(db, "setItem");

      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      expect(mockAccount.pkc.createCommunity).toHaveBeenCalledWith(
        expect.objectContaining({ address, title: "Cached title" }),
      );
      expect(communitiesStore.getState().communities[address]).toEqual(
        expect.objectContaining({ title: "Cached title", fetchedAt: cachedFetchedAt }),
      );
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    test("replayed cached record only refreshes fetchedAt, fetched records are cached", async () => {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });
      const community = createdCommunities[0];
      const setItemSpy = vi.spyOn(db, "setItem");
      const cloneSpy = vi.spyOn(utils, "clone");
      const storeListener = vi.fn();
      const unsubscribe = communitiesStore.subscribe(storeListener);

      try {
        // pkc-js re-emits the record the community was created with when update() starts
        act(() => {
          community.emit("update", community);
        });

        expect(storeListener).toHaveBeenCalledTimes(1);
        expect(communitiesStore.getState().communities[address].title).toBe("Cached title");
        expect(communitiesStore.getState().communities[address].fetchedAt).toBeGreaterThan(
          cachedFetchedAt,
        );
        expect(addRoleSpy).toHaveBeenCalledWith(
          expect.objectContaining({ address, title: "Cached title" }),
        );
        expect(addRoleSpy.mock.calls[0][0]).not.toBe(community);
        expect(cloneSpy).not.toHaveBeenCalled();
        expect(setItemSpy).not.toHaveBeenCalled();

        // a newly fetched record is still cloned, cached and stored
        community.title = "Fetched title";
        community.updatedAt = cachedCommunity.updatedAt + 1;
        community.signature = { signature: "fetched record signature" };
        await act(async () => {
          community.emit("update", community);
          await new Promise((resolve) => setTimeout(resolve, 10));
        });

        expect(setItemSpy).toHaveBeenCalledWith(
          address,
          expect.objectContaining({ title: "Fetched title", fetchedAt: expect.any(Number) }),
        );
        expect(communitiesStore.getState().communities[address].title).toBe("Fetched title");
      } finally {
        unsubscribe();
      }
    });

    test("updatingstatechange updates sync status and updatingState in one store change", async () => {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });
      const storeListener = vi.fn();
      const unsubscribe = communitiesStore.subscribe(storeListener);

      try {
        act(() => {
          createdCommunities[0].emit("updatingstatechange", "fetching-ipns");
        });

        expect(storeListener).toHaveBeenCalledTimes(1);
        expect(communitiesStore.getState().syncStatuses[address]?.syncState).toBe("loading");
        expect(communitiesStore.getState().communities[address].updatingState).toBe(
          "fetching-ipns",
        );
      } finally {
        unsubscribe();
      }
    });
  });

  test("cached community create failure logs to console", async () => {
    const address = "cached-fail-address";
    const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
    await db.setItem(address, { address, invalid: "data", updatedAt: 1781773422 });

    const createCommunityOriginal = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockRejectedValue(new Error("create failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      try {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      } catch {
        // expected to throw
      }
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "failed pkc.createCommunity(cachedCommunity)",
      expect.objectContaining({
        cachedCommunity: expect.any(Object),
        error: expect.any(Error),
      }),
    );
    consoleSpy.mockRestore();
    mockAccount.pkc.createCommunity = createCommunityOriginal;
  });

  test("missing-community state guard returns empty object in client updater", async () => {
    const address = "client-update-address";
    let storedCb: ((...args: any[]) => void) | null = null;

    const utils = await import("../../lib/utils");
    const origClientsOnStateChange = utils.default.clientsOnStateChange;
    (utils.default as any).clientsOnStateChange = (_clients: any, cb: any) => {
      storedCb = () => cb("state", "type", "url");
    };

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    expect(storedCb).toBeTruthy();
    communitiesStore.setState({ communities: {} });

    storedCb!();

    expect(communitiesStore.getState().communities).toEqual({});

    (utils.default as any).clientsOnStateChange = origClientsOnStateChange;
  });

  test("community.update catch logs when update rejects", async () => {
    const address = "update-reject-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi
      .spyOn(community, "update")
      .mockRejectedValueOnce(new Error("update failed"));

    const createCommunityOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    await new Promise((r) => setTimeout(r, 100));

    mockAccount.pkc.createCommunity = createCommunityOrig;
    updateSpy.mockRestore();
  });

  test("a subscribed community refreshes its updates every 15 minutes", async () => {
    vi.useFakeTimers();
    const address = "periodic-update-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);

    const createCommunityOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    try {
      await act(async () => {
        await communitiesStore
          .getState()
          .startCommunityAutoUpdate(address, "subscriber", mockAccount);
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMUNITY_UPDATE_INTERVAL_MS);
      });
      expect(updateSpy).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMUNITY_UPDATE_INTERVAL_MS);
      });
      expect(updateSpy).toHaveBeenCalledTimes(3);
    } finally {
      mockAccount.pkc.createCommunity = createCommunityOrig;
      updateSpy.mockRestore();
      await resetCommunitiesDatabaseAndStore();
      vi.useRealTimers();
    }
  });

  describe("update loop lifecycle", () => {
    const address = "lifecycle-community-address";
    let community: any;
    let updateSpy: any;
    let stopSpy: any;
    let createCommunityOrig: any;

    beforeEach(async () => {
      vi.useFakeTimers();
      const pkc = await PkcJsMock();
      community = await pkc.createCommunity({ address });
      // only emit events manually, like pkc-js would after community.update()
      updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);
      stopSpy = vi.spyOn(community, "stop").mockResolvedValue(undefined);
      createCommunityOrig = mockAccount.pkc.createCommunity;
      mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);
    });
    afterEach(async () => {
      mockAccount.pkc.createCommunity = createCommunityOrig;
      await resetCommunitiesDatabaseAndStore();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    const start = (subscriberId: string) =>
      act(async () => {
        await communitiesStore
          .getState()
          .startCommunityAutoUpdate(address, subscriberId, mockAccount);
      });
    const stop = (subscriberId: string) =>
      act(async () => {
        await communitiesStore.getState().stopCommunityAutoUpdate(address, subscriberId);
      });
    const emitFetchedRecord = (updatedAt: number, signature: string) =>
      act(async () => {
        community.updatedAt = updatedAt;
        community.signature = { signature };
        community.emit("update", community);
        community.emit("updatingstatechange", "succeeded");
        await vi.advanceTimersByTimeAsync(0);
      });

    test("a community nothing subscribes to stops after the grace period once its first fetch ends", async () => {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // the first fetch is still pending, a store-level caller still waits for the record
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      expect(stopSpy).not.toHaveBeenCalled();

      await emitFetchedRecord(100, "first record");
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(communitiesStore.getState().communities[address].updatedAt).toBe(100);

      // the 15 minute refresh does not restart a stopped community
      await advance(COMMUNITY_UPDATE_INTERVAL_MS);
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    test("a failed first fetch also ends the wait before stopping", async () => {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      expect(stopSpy).not.toHaveBeenCalled();

      act(() => {
        community.emit("updatingstatechange", "waiting-retry");
      });
      await advance(0);
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    test("stops a grace period after the last subscriber leaves", async () => {
      await start("subscriber 1");
      await start("subscriber 2");
      expect(updateSpy).toHaveBeenCalledTimes(1);
      await emitFetchedRecord(100, "first record");

      await stop("subscriber 1");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS * 2);
      expect(stopSpy).not.toHaveBeenCalled();

      await stop("subscriber 2");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS - 1000);
      expect(stopSpy).not.toHaveBeenCalled();
      // a subscriber returning within the grace period keeps the loop running
      await start("subscriber 1");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS * 2);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledTimes(1);

      await stop("subscriber 1");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      expect(stopSpy).toHaveBeenCalledTimes(1);
      await advance(COMMUNITY_UPDATE_INTERVAL_MS);
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    test("restarts a stopped community without marking its replayed record as fetched", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await start("subscriber");
      await emitFetchedRecord(100, "first record");
      const firstFetchedAt = communitiesStore.getState().communities[address].fetchedAt;
      expect(typeof firstFetchedAt).toBe("number");

      // pkc-js stopping on its own while the loop runs is not a stop the next subscriber undoes
      act(() => {
        community.emit("updatingstatechange", "stopped");
      });
      expect(communitiesStore.getState().syncStatuses[address].stoppedUntilUsed).toBeUndefined();

      await stop("subscriber");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      expect(stopSpy).toHaveBeenCalledTimes(1);
      act(() => {
        community.emit("updatingstatechange", "stopped");
      });
      expect(communitiesStore.getState().syncStatuses[address]).toEqual(
        expect.objectContaining({ syncState: "stopped", stoppedUntilUsed: true }),
      );

      vi.setSystemTime(new Date("2026-01-01T03:00:00Z"));
      await start("subscriber");
      expect(updateSpy).toHaveBeenCalledTimes(2);
      act(() => {
        community.emit("updatingstatechange", "fetching-ipns");
      });
      expect(communitiesStore.getState().syncStatuses[address].stoppedUntilUsed).toBeUndefined();

      // pkc-js re-emits the record the stopped instance still holds when update() starts
      const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
      const setItemSpy = vi.spyOn(db, "setItem");
      const storedCommunity = communitiesStore.getState().communities[address];
      act(() => {
        community.emit("update", community);
      });
      await advance(0);
      expect(communitiesStore.getState().communities[address]).toBe(storedCommunity);
      expect(setItemSpy).not.toHaveBeenCalled();

      // the record fetched after the restart is stored as fetched
      await emitFetchedRecord(200, "second record");
      expect(communitiesStore.getState().communities[address].updatedAt).toBe(200);
      expect(communitiesStore.getState().communities[address].fetchedAt).toBeGreaterThan(
        firstFetchedAt,
      );

      // the restarted loop refreshes every 15 minutes again
      await advance(COMMUNITY_UPDATE_INTERVAL_MS);
      expect(updateSpy).toHaveBeenCalledTimes(3);
    });

    test("a restart waits for a stop in progress", async () => {
      let resolveStop: () => void = () => {};
      stopSpy.mockImplementation(() => new Promise<void>((resolve) => (resolveStop = resolve)));
      await start("subscriber");
      await emitFetchedRecord(100, "first record");
      await stop("subscriber");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      expect(stopSpy).toHaveBeenCalledTimes(1);

      const restarted = communitiesStore
        .getState()
        .startCommunityAutoUpdate(address, "subscriber", mockAccount);
      await advance(0);
      // update() would be a no-op while the stop is still running
      expect(updateSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveStop();
        await restarted;
      });
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    test("a restart that joins an already updating shared instance takes its state", async () => {
      await start("subscriber");
      await emitFetchedRecord(100, "first record");
      await stop("subscriber");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      act(() => {
        community.emit("updatingstatechange", "stopped");
      });

      // another consumer kept the shared pkc-js instance updating, so update() emits no state
      updateSpy.mockImplementation(async () => {
        community.updatingState = "succeeded";
      });
      await start("subscriber");
      expect(communitiesStore.getState().syncStatuses[address]).toEqual(
        expect.objectContaining({ syncState: "succeeded" }),
      );
      expect(communitiesStore.getState().syncStatuses[address].stoppedUntilUsed).toBeUndefined();
      expect(communitiesStore.getState().communities[address].updatingState).toBe("succeeded");
    });

    test("a first load that joins an already updating shared instance takes its state", async () => {
      // another consumer, e.g. a comment's update loop, keeps the shared pkc-js instance updating,
      // so update() emits no state change until that loop's next fetch
      updateSpy.mockImplementation(async () => {
        community.updatingState = "succeeded";
      });
      await start("subscriber");
      await advance(0);

      expect(communitiesStore.getState().syncStatuses[address]).toEqual(
        expect.objectContaining({
          syncState: "succeeded",
          lastSuccessfulFetchAt: expect.any(Number),
        }),
      );
      expect(communitiesStore.getState().communities[address].updatingState).toBe("succeeded");
    });

    test("a second load of the same community by another account does not start a second loop", async () => {
      const pkc = await PkcJsMock();
      const otherCommunity = await pkc.createCommunity({ address });
      const otherUpdateSpy = vi.spyOn(otherCommunity, "update").mockResolvedValue(undefined);
      const otherAccount = {
        id: "other-account-id",
        pkc: { ...mockAccount.pkc, createCommunity: vi.fn().mockResolvedValue(otherCommunity) },
      };
      Object.setPrototypeOf(otherAccount.pkc, Object.getPrototypeOf(mockAccount.pkc));

      await act(async () => {
        await Promise.all([
          communitiesStore.getState().addCommunityToStore(address, mockAccount),
          communitiesStore.getState().addCommunityToStore(address, otherAccount),
        ]);
      });
      expect(updateSpy.mock.calls.length + otherUpdateSpy.mock.calls.length).toBe(1);

      // the community nothing subscribes to stops once, with no loop left behind
      await emitFetchedRecord(100, "first record");
      act(() => {
        otherCommunity.emit("updatingstatechange", "succeeded");
      });
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS + COMMUNITY_UPDATE_INTERVAL_MS);
      expect(updateSpy.mock.calls.length + otherUpdateSpy.mock.calls.length).toBe(1);
    });

    test("a fetched record is stored before pkc-js reports the fetch succeeded", async () => {
      await start("subscriber");
      await emitFetchedRecord(100, "old record");
      const syncStatesWithOldRecord: string[] = [];
      const unsubscribe = communitiesStore.subscribe((state: any) => {
        if (state.communities[address]?.updatedAt === 100) {
          syncStatesWithOldRecord.push(state.syncStatuses[address]?.syncState);
        }
      });
      try {
        act(() => {
          community.emit("updatingstatechange", "fetching-ipns");
          // pkc-js emits the record, then the succeeded state, synchronously
          community.updatedAt = 200;
          community.signature = { signature: "new record" };
          community.emit("update", community);
          community.emit("updatingstatechange", "succeeded");
        });
        await advance(0);
        expect(syncStatesWithOldRecord).not.toContain("succeeded");
        expect(communitiesStore.getState().communities[address].updatedAt).toBe(200);
      } finally {
        unsubscribe();
      }
    });

    test("an unknown subscriber leaving does not schedule a stop", async () => {
      await start("subscriber");
      await emitFetchedRecord(100, "first record");
      await stop("unknown subscriber");
      await advance(COMMUNITY_UPDATE_STOP_GRACE_MS);
      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  test("deleteCommunity stops update polling and listeners for deleted communities", async () => {
    vi.useFakeTimers();
    const address = "deleted-periodic-address";
    const pkc = await PkcJsMock();
    const liveCommunity = await pkc.createCommunity({ address });
    const deleteCommunity = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(liveCommunity, "update").mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(deleteCommunity, "delete").mockResolvedValue(undefined);

    const createCommunityOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi
      .fn()
      .mockResolvedValueOnce(liveCommunity)
      .mockResolvedValueOnce(deleteCommunity);

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        await communitiesStore.getState().deleteCommunity(address, mockAccount);
      });

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(communitiesStore.getState().communities[address]).toBeUndefined();

      liveCommunity.emit("update", liveCommunity);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMUNITY_UPDATE_INTERVAL_MS);
      });

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(communitiesStore.getState().communities[address]).toBeUndefined();
      const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
      expect(await db.getItem(address)).toBeUndefined();
    } finally {
      mockAccount.pkc.createCommunity = createCommunityOrig;
      updateSpy.mockRestore();
      deleteSpy.mockRestore();
      await resetCommunitiesDatabaseAndStore();
      vi.useRealTimers();
    }
  });

  test("an update still being saved when its community is deleted does not add the community's roles to accounts", async () => {
    const address = "deleted-while-saving-address";
    const pkc = await PkcJsMock();
    const liveCommunity = await pkc.createCommunity({ address });
    const deleteCommunity = await pkc.createCommunity({ address });
    vi.spyOn(liveCommunity, "update").mockResolvedValue(undefined);
    vi.spyOn(deleteCommunity, "delete").mockResolvedValue(undefined);
    const createCommunityOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi
      .fn()
      .mockResolvedValueOnce(liveCommunity)
      .mockResolvedValueOnce(deleteCommunity);
    const { accountsActionsInternal } = accountsStore.getState();
    const addRolesSpy = vi
      .spyOn(accountsActionsInternal, "addCommunityRoleToAccountsCommunities")
      .mockResolvedValue(undefined);
    const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
    const setItem = db.setItem;
    let finishSavingUpdate: Function = () => {};

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });
      addRolesSpy.mockClear();

      // the update handler stays in its database write while the community is deleted
      const setItemSpy = vi.spyOn(db, "setItem").mockImplementationOnce(async (...args: any[]) => {
        await new Promise<void>((resolve) => (finishSavingUpdate = resolve));
        return setItem(...args);
      });
      liveCommunity.emit("update", Object.assign(liveCommunity, { updatedAt: 1, title: "new" }));
      await vi.waitFor(() => expect(setItemSpy).toHaveBeenCalled());
      await act(async () => {
        await communitiesStore.getState().deleteCommunity(address, mockAccount);
      });
      expect(communitiesStore.getState().communities[address]).toBeUndefined();

      await act(async () => {
        finishSavingUpdate();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(addRolesSpy).not.toHaveBeenCalled();
      expect(communitiesStore.getState().communities[address]).toBeUndefined();
      expect(await db.getItem(address)).toBeUndefined();
    } finally {
      finishSavingUpdate();
      mockAccount.pkc.createCommunity = createCommunityOrig;
      vi.restoreAllMocks();
    }
  });

  test("addCommunityToStore sets errors and throws when createCommunity rejects", async () => {
    const address = "create-reject-address";
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockRejectedValue(new Error("create failed"));

    await act(async () => {
      try {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      } catch (e) {
        expect((e as Error).message).toBe("create failed");
      }
    });

    expect(communitiesStore.getState().errors[address]).toHaveLength(1);
    expect(communitiesStore.getState().errors[address][0].message).toBe("create failed");
    expect(communitiesStore.getState().syncStatuses[address]?.syncState).toBe("failed");
    mockAccount.pkc.createCommunity = createOrig;
  });

  test("addCommunityToStore retries after owner-path failures clear the pending flag", async () => {
    const address = "owner-retry-address";
    const createOrig = mockAccount.pkc.createCommunity;
    const communitiesOrig = mockAccount.pkc.communities;
    const ownCommunitiesDescriptor = Object.getOwnPropertyDescriptor(
      mockAccount.pkc,
      "communities",
    );
    const resolvedCommunity = await createOrig.call(mockAccount.pkc, { address });
    try {
      mockAccount.pkc.createCommunity = vi
        .fn()
        .mockRejectedValueOnce(new Error("owner create failed"))
        .mockRejectedValueOnce(new Error("fetch create failed"))
        .mockResolvedValueOnce(resolvedCommunity);
      Object.defineProperty(mockAccount.pkc, "communities", {
        configurable: true,
        get: () => [...communitiesOrig, { publicKey: address, address, started: false }],
      });

      await expect(
        communitiesStore.getState().addCommunityToStore(address, mockAccount),
      ).rejects.toThrow("fetch create failed");
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);

      expect(communitiesStore.getState().communities[address]).toBeDefined();
    } finally {
      mockAccount.pkc.createCommunity = createOrig;
      if (ownCommunitiesDescriptor) {
        Object.defineProperty(mockAccount.pkc, "communities", ownCommunitiesDescriptor);
      } else {
        delete (mockAccount.pkc as any).communities;
      }
    }
  });

  test("addCommunityToStore throws generic Error when community is undefined without thrown error", async () => {
    const address = "resolve-undefined-address";
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      try {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      } catch (e) {
        expect((e as Error).message).toContain("failed getting community");
      }
    });

    mockAccount.pkc.createCommunity = createOrig;
  });

  test("community update event calls addCommunityRoleToAccountsCommunities and addCommunityPageCommentsToStore", async () => {
    const address = "update-event-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const addRoleSpy = vi.fn().mockResolvedValue(undefined);
    const addCommentsSpy = vi.fn();
    const accountsGetState = accountsStore.getState;
    (accountsStore as any).getState = () => ({
      ...accountsGetState(),
      accountsActionsInternal: { addCommunityRoleToAccountsCommunities: addRoleSpy },
    });
    const pagesGetState = communitiesPagesStore.getState;
    (communitiesPagesStore as any).getState = () => ({
      ...pagesGetState(),
      addCommunityPageCommentsToStore: addCommentsSpy,
    });

    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    community.emit("update", community);
    await new Promise((r) => setTimeout(r, 50));

    expect(addRoleSpy).toHaveBeenCalledWith(expect.objectContaining({ address }));
    expect(addCommentsSpy).toHaveBeenCalledWith(expect.objectContaining({ address }));

    (accountsStore as any).getState = accountsGetState;
    (communitiesPagesStore as any).getState = pagesGetState;
    mockAccount.pkc.createCommunity = createOrig;
  });

  test("community error event waits before reaching store errors", async () => {
    const address = "delayed-error-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      vi.useFakeTimers();
      const error = new Error("fetch failed");
      act(() => {
        community.emit("error", error);
      });

      expect(communitiesStore.getState().errors[address]).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(communitiesStore.getState().errors[address]).toBeUndefined();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(communitiesStore.getState().errors[address]).toEqual([error]);
    } finally {
      vi.useRealTimers();
      mockAccount.pkc.createCommunity = createOrig;
      updateSpy.mockRestore();
    }
  });

  test("community retriable error event stays out of store errors", async () => {
    const address = "retriable-error-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      vi.useFakeTimers();
      const error = Object.assign(new Error("transient fetch failed"), {
        details: { retriableError: true },
      });
      act(() => {
        community.emit("error", error);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(communitiesStore.getState().errors[address]).toBeUndefined();
      // kept on the sync status instead, so a community that never loads can say why
      expect(communitiesStore.getState().syncStatuses[address]?.lastRetriableError).toBe(error);

      act(() => {
        community.emit("update", community);
      });
      expect(communitiesStore.getState().syncStatuses[address]?.lastRetriableError).toBeUndefined();

      act(() => {
        community.emit("error", error);
      });
      expect(communitiesStore.getState().syncStatuses[address]?.lastRetriableError).toBe(error);
      act(() => {
        community.emit("updatingstatechange", "succeeded");
      });
      expect(communitiesStore.getState().syncStatuses[address]).toEqual(
        expect.not.objectContaining({ lastRetriableError: expect.anything() }),
      );
      expect(communitiesStore.getState().syncStatuses[address]?.syncState).toBe("succeeded");
    } finally {
      vi.useRealTimers();
      mockAccount.pkc.createCommunity = createOrig;
      updateSpy.mockRestore();
    }
  });

  test("community non-retriable error event still reaches store errors", async () => {
    const address = "non-retriable-error-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      vi.useFakeTimers();
      const error = Object.assign(new Error("final fetch failed"), {
        details: { retriableError: false },
      });
      const laterError = Object.assign(new Error("later final fetch failed"), {
        details: { retriableError: false },
      });
      act(() => {
        community.emit("error", error);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(communitiesStore.getState().errors[address]).toBeUndefined();

      act(() => {
        community.emit("error", laterError);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(communitiesStore.getState().errors[address]).toEqual([error]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(communitiesStore.getState().errors[address]).toEqual([error, laterError]);
    } finally {
      vi.useRealTimers();
      mockAccount.pkc.createCommunity = createOrig;
      updateSpy.mockRestore();
    }
  });

  test("community update event discards earlier pending and stored errors", async () => {
    const address = "stale-error-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      vi.useFakeTimers();
      const pendingError = new Error("pending fetch failed");
      act(() => {
        community.emit("error", pendingError);
        community.emit("update", community);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(communitiesStore.getState().errors[address]).toBeUndefined();

      const storedError = new Error("stored fetch failed");
      act(() => {
        community.emit("error", storedError);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(communitiesStore.getState().errors[address]).toEqual([storedError]);

      act(() => {
        community.emit("update", community);
      });
      expect(communitiesStore.getState().errors[address]).toBeUndefined();
    } finally {
      vi.useRealTimers();
      mockAccount.pkc.createCommunity = createOrig;
      updateSpy.mockRestore();
    }
  });

  test("community error timeout is ignored when pending entry was already cleared", async () => {
    const address = "cleared-pending-error-address";
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address });
    const updateSpy = vi.spyOn(community, "update").mockResolvedValue(undefined);
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);
    let clearTimeoutSpy: { mockRestore: () => void } | undefined;

    try {
      await act(async () => {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      });

      vi.useFakeTimers();
      clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
      const pendingError = new Error("cleared pending fetch failed");
      act(() => {
        community.emit("error", pendingError);
        community.emit("update", community);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(communitiesStore.getState().errors[address]).toBeUndefined();
    } finally {
      clearTimeoutSpy?.mockRestore();
      vi.useRealTimers();
      mockAccount.pkc.createCommunity = createOrig;
      updateSpy.mockRestore();
    }
  });

  test("createCommunity with no signer asserts address must be undefined", async () => {
    const pkc = await PkcJsMock();
    const community = await pkc.createCommunity({ address: "new-sub-address" });
    const createOrig = mockAccount.pkc.createCommunity;
    mockAccount.pkc.createCommunity = vi.fn().mockResolvedValue(community);

    await act(async () => {
      await communitiesStore.getState().createCommunity({}, mockAccount);
    });

    expect(mockAccount.pkc.createCommunity).toHaveBeenCalledWith({});
    mockAccount.pkc.createCommunity = createOrig;
  });

  test("createCommunity with signer can create a specific address", async () => {
    const address = "signed-community-address";

    await act(async () => {
      await communitiesStore
        .getState()
        .createCommunity({ address, signer: { address: "signer-address" } }, mockAccount);
    });

    expect(communitiesStore.getState().communities[address]).toBeDefined();
  });

  test("createCommunity with address but no signer throws (branch 251)", async () => {
    await expect(
      communitiesStore.getState().createCommunity({ address: "addr-no-signer" }, mockAccount),
    ).rejects.toThrow("createCommunityOptions.address 'addr-no-signer' must be undefined");
  });

  test("createCommunity accounts can create, edit, and delete communities", async () => {
    const account = { id: "create-edit-delete-account-id", pkc: new BasePkc() };
    let community: any;

    await act(async () => {
      community = await communitiesStore
        .getState()
        .createCommunity({ title: "created title" }, account);
    });

    expect(community.address).toBeDefined();
    expect(communitiesStore.getState().communities[community.address]?.title).toBe("created title");
    communitiesStore.setState((state) => ({
      errors: { ...state.errors, [community.address]: [new Error("stale error")] },
    }));

    await act(async () => {
      await communitiesStore
        .getState()
        .editCommunity(community.address, { title: "edited title" }, account);
    });

    expect(communitiesStore.getState().communities[community.address]?.title).toBe("edited title");

    await act(async () => {
      await communitiesStore.getState().deleteCommunity(community.address, account);
    });

    expect(communitiesStore.getState().communities[community.address]).toBeUndefined();
    expect(communitiesStore.getState().errors[community.address]).toBeUndefined();
    expect(communitiesStore.getState().syncStatuses[community.address]).toBeUndefined();
  });

  test("clientsOnStateChange with chainTicker branch", async () => {
    const address = "chain-ticker-address";
    let storedCb: ((...args: any[]) => void) | null = null;

    const utils = await import("../../lib/utils");
    const origClientsOnStateChange = utils.default.clientsOnStateChange;
    (utils.default as any).clientsOnStateChange = (_clients: any, cb: any) => {
      storedCb = () => cb("state", "type", "url", "ETH");
    };

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    expect(storedCb).toBeTruthy();
    communitiesStore.setState((state: any) => ({
      communities: {
        ...state.communities,
        [address]: {
          ...state.communities[address],
          clients: { type: {} },
        },
      },
    }));
    storedCb!();
    expect(communitiesStore.getState().communities[address]?.clients?.type?.ETH).toBeDefined();

    (utils.default as any).clientsOnStateChange = origClientsOnStateChange;
  });

  test("clientsOnStateChange without chainTicker updates the client state", async () => {
    const address = "client-state-address";
    let storedCb: ((...args: any[]) => void) | null = null;

    const utils = await import("../../lib/utils");
    const origClientsOnStateChange = utils.default.clientsOnStateChange;
    (utils.default as any).clientsOnStateChange = (_clients: any, cb: any) => {
      storedCb = () => cb("fetching-ipns", "type", "url");
    };

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    communitiesStore.setState((state: any) => ({
      communities: {
        ...state.communities,
        [address]: {
          ...state.communities[address],
          clients: { type: {} },
        },
      },
    }));
    storedCb!();
    expect(communitiesStore.getState().communities[address]?.clients?.type?.url).toEqual({
      state: "fetching-ipns",
    });

    (utils.default as any).clientsOnStateChange = origClientsOnStateChange;
  });

  test("clientsOnStateChange returns {} when community missing and chainTicker provided", async () => {
    const address = "chain-missing-address";
    let storedCb: ((...args: any[]) => void) | null = null;

    const utils = await import("../../lib/utils");
    const origClientsOnStateChange = utils.default.clientsOnStateChange;
    (utils.default as any).clientsOnStateChange = (_clients: any, cb: any) => {
      storedCb = () => cb("state", "type", "url", "ETH");
    };

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });
    expect(storedCb).toBeTruthy();
    communitiesStore.setState({ communities: {} });
    storedCb!();
    expect(communitiesStore.getState().communities).toEqual({});

    (utils.default as any).clientsOnStateChange = origClientsOnStateChange;
  });
});
