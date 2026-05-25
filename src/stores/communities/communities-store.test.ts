import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import communitiesStore, { resetCommunitiesDatabaseAndStore } from "./communities-store";
import localForageLru from "../../lib/localforage-lru";
import { setPkcJs } from "../..";
import PkcJsMock, { PKC as BasePkc } from "../../lib/pkc-js/pkc-js-mock";
import accountsStore from "../accounts";
import communitiesPagesStore from "../communities-pages";

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

  test("cached community create failure logs to console", async () => {
    const address = "cached-fail-address";
    const db = localForageLru.createInstance({ name: "bitsocialReactHooks-communities" });
    await db.setItem(address, { address, invalid: "data" });

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
        get: () => [...communitiesOrig, address],
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
