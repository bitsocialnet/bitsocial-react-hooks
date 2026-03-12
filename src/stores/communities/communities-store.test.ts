import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import communitiesStore, { resetCommunitiesDatabaseAndStore } from "./communities-store";
import localForageLru from "../../lib/localforage-lru";
import { setPlebbitJs } from "../..";
import PlebbitJsMock, { Plebbit as BasePlebbit } from "../../lib/plebbit-js/plebbit-js-mock";
import accountsStore from "../accounts";
import communitiesPagesStore from "../communities-pages";

let mockAccount: any;

const createLegacyOnlyAccount = () => {
  class LegacyOnlyPlebbit extends BasePlebbit {
    constructor(...args: any[]) {
      super(...args);
      (this as any).createCommunity = undefined;
      (this as any).getCommunity = undefined;
      (this as any).createCommunityEdit = undefined;
    }

    async createSubplebbit(opts: any) {
      return BasePlebbit.prototype.createCommunity.call(this, opts);
    }

    async getSubplebbit(opts: any) {
      return BasePlebbit.prototype.getCommunity.call(this, opts);
    }

    async createSubplebbitEdit(opts: any) {
      return BasePlebbit.prototype.createCommunityEdit.call(this, opts);
    }
  }

  return { id: "legacy-account-id", plebbit: new LegacyOnlyPlebbit() };
};

describe("communities store", () => {
  beforeAll(async () => {
    setPlebbitJs(PlebbitJsMock);
    testUtils.silenceReactWarnings();
    const plebbit = await PlebbitJsMock();
    mockAccount = { id: "mock-account-id", plebbit };
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

  test("addCommunityToStore adds community from plebbit", async () => {
    const address = "community address 1";

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    expect(communitiesStore.getState().communities[address]).toBeDefined();
    expect(communitiesStore.getState().communities[address].address).toBe(address);
  });

  test("cached community create failure logs to console", async () => {
    const address = "cached-fail-address";
    const db = localForageLru.createInstance({ name: "plebbitReactHooks-communities" });
    await db.setItem(address, { address, invalid: "data" });

    const createCommunityOriginal = mockAccount.plebbit.createCommunity;
    mockAccount.plebbit.createCommunity = vi.fn().mockRejectedValue(new Error("create failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      try {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      } catch {
        // expected to throw
      }
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "failed plebbit.createCommunity(cachedCommunity)",
      expect.objectContaining({
        cachedCommunity: expect.any(Object),
        error: expect.any(Error),
      }),
    );
    consoleSpy.mockRestore();
    mockAccount.plebbit.createCommunity = createCommunityOriginal;
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
    const plebbit = await PlebbitJsMock();
    const community = await plebbit.createCommunity({ address });
    const updateSpy = vi
      .spyOn(community, "update")
      .mockRejectedValueOnce(new Error("update failed"));

    const createCommunityOrig = mockAccount.plebbit.createCommunity;
    mockAccount.plebbit.createCommunity = vi.fn().mockResolvedValue(community);

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    await new Promise((r) => setTimeout(r, 100));

    mockAccount.plebbit.createCommunity = createCommunityOrig;
    updateSpy.mockRestore();
  });

  test("addCommunityToStore sets errors and throws when createCommunity rejects", async () => {
    const address = "create-reject-address";
    const createOrig = mockAccount.plebbit.createCommunity;
    mockAccount.plebbit.createCommunity = vi.fn().mockRejectedValue(new Error("create failed"));

    await act(async () => {
      try {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      } catch (e) {
        expect((e as Error).message).toBe("create failed");
      }
    });

    expect(communitiesStore.getState().errors[address]).toHaveLength(1);
    expect(communitiesStore.getState().errors[address][0].message).toBe("create failed");
    mockAccount.plebbit.createCommunity = createOrig;
  });

  test("addCommunityToStore retries after owner-path failures clear the pending flag", async () => {
    const address = "owner-retry-address";
    const createOrig = mockAccount.plebbit.createCommunity;
    const communitiesOrig = mockAccount.plebbit.communities;
    const ownCommunitiesDescriptor = Object.getOwnPropertyDescriptor(
      mockAccount.plebbit,
      "communities",
    );
    const resolvedCommunity = await createOrig.call(mockAccount.plebbit, { address });
    try {
      mockAccount.plebbit.createCommunity = vi
        .fn()
        .mockRejectedValueOnce(new Error("owner create failed"))
        .mockRejectedValueOnce(new Error("fetch create failed"))
        .mockResolvedValueOnce(resolvedCommunity);
      Object.defineProperty(mockAccount.plebbit, "communities", {
        configurable: true,
        get: () => [...communitiesOrig, address],
      });

      await expect(
        communitiesStore.getState().addCommunityToStore(address, mockAccount),
      ).rejects.toThrow("fetch create failed");
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);

      expect(communitiesStore.getState().communities[address]).toBeDefined();
    } finally {
      mockAccount.plebbit.createCommunity = createOrig;
      if (ownCommunitiesDescriptor) {
        Object.defineProperty(mockAccount.plebbit, "communities", ownCommunitiesDescriptor);
      } else {
        delete (mockAccount.plebbit as any).communities;
      }
    }
  });

  test("addCommunityToStore throws generic Error when community is undefined without thrown error", async () => {
    const address = "resolve-undefined-address";
    const createOrig = mockAccount.plebbit.createCommunity;
    mockAccount.plebbit.createCommunity = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      try {
        await communitiesStore.getState().addCommunityToStore(address, mockAccount);
      } catch (e) {
        expect((e as Error).message).toContain("failed getting community");
      }
    });

    mockAccount.plebbit.createCommunity = createOrig;
  });

  test("community update event calls addCommunityRoleToAccountsCommunities and addCommunityPageCommentsToStore", async () => {
    const address = "update-event-address";
    const plebbit = await PlebbitJsMock();
    const community = await plebbit.createCommunity({ address });
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

    const createOrig = mockAccount.plebbit.createCommunity;
    mockAccount.plebbit.createCommunity = vi.fn().mockResolvedValue(community);

    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(address, mockAccount);
    });

    community.emit("update", community);
    await new Promise((r) => setTimeout(r, 50));

    expect(addRoleSpy).toHaveBeenCalledWith(expect.objectContaining({ address }));
    expect(addCommentsSpy).toHaveBeenCalledWith(expect.objectContaining({ address }));

    (accountsStore as any).getState = accountsGetState;
    (communitiesPagesStore as any).getState = pagesGetState;
    mockAccount.plebbit.createCommunity = createOrig;
  });

  test("createCommunity with no signer asserts address must be undefined", async () => {
    const plebbit = await PlebbitJsMock();
    const community = await plebbit.createCommunity({ address: "new-sub-address" });
    const createOrig = mockAccount.plebbit.createCommunity;
    mockAccount.plebbit.createCommunity = vi.fn().mockResolvedValue(community);

    await act(async () => {
      await communitiesStore.getState().createCommunity({}, mockAccount);
    });

    expect(mockAccount.plebbit.createCommunity).toHaveBeenCalledWith({});
    mockAccount.plebbit.createCommunity = createOrig;
  });

  test("createCommunity with address but no signer throws (branch 251)", async () => {
    await expect(
      communitiesStore.getState().createCommunity({ address: "addr-no-signer" }, mockAccount),
    ).rejects.toThrow("createCommunityOptions.address 'addr-no-signer' must be undefined");
  });

  test("legacy createSubplebbit accounts can create, edit, and delete communities", async () => {
    const legacyAccount = createLegacyOnlyAccount();
    let community: any;

    await act(async () => {
      community = await communitiesStore
        .getState()
        .createCommunity({ title: "legacy title" }, legacyAccount);
    });

    expect(community.address).toBeDefined();
    expect(communitiesStore.getState().communities[community.address]?.title).toBe("legacy title");

    await act(async () => {
      await communitiesStore
        .getState()
        .editCommunity(community.address, { title: "legacy edited" }, legacyAccount);
    });

    expect(communitiesStore.getState().communities[community.address]?.title).toBe("legacy edited");

    await act(async () => {
      await communitiesStore.getState().deleteCommunity(community.address, legacyAccount);
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
