import { act, waitFor as tlWaitFor } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import useFeedsStore, { defaultPostsPerPage as postsPerPage } from "./feeds-store";
import { SubplebbitPage } from "../../types";
import subplebbitsStore from "../subplebbits";
import subplebbitsPagesStore from "../subplebbits-pages";
import EventEmitter from "events";
import accountsStore from "../accounts";
import { setPlebbitJs } from "../..";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";

const subplebbitGetPageCommentCount = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MockPages {
  subplebbitAddress: string;
  pageCids: { [pageCid: string]: string };
  constructor({ subplebbitAddress }: any) {
    this.subplebbitAddress = subplebbitAddress;
    this.pageCids = {
      new: `${subplebbitAddress} new page cid`,
    };
  }

  async getPage(options: { cid: string }) {
    const cid = options?.cid;
    await sleep(200);
    const page: SubplebbitPage = {
      nextCid: cid + " - next page cid",
      comments: this.getPageMockComments(cid),
    };
    return page;
  }

  async validatePage(page: any) {}

  getPageMockComments(pageCid: string) {
    let index = 0;
    const comments: any[] = [];
    while (index++ < subplebbitGetPageCommentCount) {
      comments.push({
        timestamp: index,
        cid: pageCid + " comment cid " + index,
        subplebbitAddress: this.subplebbitAddress,
      });
    }
    return comments;
  }
}

class MockSubplebbit extends EventEmitter {
  address: string;
  posts: MockPages;
  constructor({ address }: any) {
    super();
    this.address = address;
    this.posts = new MockPages({ subplebbitAddress: address });
  }
  async update() {}
}

const mockAccount: any = {
  id: "mock account id",
  plebbit: {
    createSubplebbit: async ({ address }: any) => new MockSubplebbit({ address }),
    getSubplebbit: async (options: { address: string }) =>
      new MockSubplebbit({ address: options?.address }),
    subplebbits: [],
    async validateComment(comment: any) {},
  },
  blockedAddresses: {},
  blockedCids: {},
};

describe("feeds store", () => {
  let accountsStoreGetState = accountsStore.getState;
  beforeAll(() => {
    // set plebbit-js mock
    setPlebbitJs(PlebbitJsMock);

    testUtils.silenceReactWarnings();

    // mock accountsStore
    // @ts-ignore
    accountsStore.getState = () => ({
      accounts: { [mockAccount.id]: mockAccount },
      accountsActionsInternal: { addCidToAccountComment: async (comment: any) => {} },
    });
  });
  afterAll(async () => {
    // restore accountsStore
    // @ts-ignore
    accountsStore.getState = accountsStoreGetState;

    testUtils.restoreAll();

    // error when resetting accounts store, not sure why
    try {
      await testUtils.resetDatabasesAndStores();
    } catch (e) {
      // console.error(e)
    }
  });

  let rendered: any, waitFor: any;
  beforeEach(async () => {
    rendered = renderHook<any, any>(() => useFeedsStore());
    waitFor = testUtils.createWaitFor(rendered);
  });

  test("initial store", async () => {
    expect(rendered.result.current.feedsOptions).toEqual({});
    expect(rendered.result.current.bufferedFeeds).toEqual({});
    expect(rendered.result.current.bufferedFeedsSubplebbitsPostCounts).toEqual({});
    expect(rendered.result.current.loadedFeeds).toEqual({});
    expect(rendered.result.current.updatedFeeds).toEqual({});
    expect(typeof rendered.result.current.addFeedToStore).toBe("function");
    expect(typeof rendered.result.current.incrementFeedPageNumber).toBe("function");
    expect(typeof rendered.result.current.updateFeeds).toBe("function");
  });

  test("add feed, increment page, block address", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });

    // wait for feed to be added
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
    expect(rendered.result.current.feedsOptions[feedName].sortType).toBe(sortType);
    expect(rendered.result.current.feedsOptions[feedName].subplebbitAddresses).toEqual(
      subplebbitAddresses,
    );

    // wait for feed to load
    await waitFor(() => rendered.result.current.loadedFeeds[feedName].length > 0);
    // subplebbit was added to subplebbits store
    expect(subplebbitsStore.getState().subplebbits[subplebbitAddresses[0]]).not.toBe(undefined);
    // feeds become defined
    expect(rendered.result.current.bufferedFeeds[feedName]).not.toBe(undefined);
    expect(rendered.result.current.loadedFeeds[feedName]).not.toBe(undefined);
    expect(rendered.result.current.updatedFeeds[feedName].length).toBe(
      rendered.result.current.loadedFeeds[feedName].length,
    );
    expect(rendered.result.current.bufferedFeedsSubplebbitsPostCounts[feedName]).not.toBe(
      undefined,
    );
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);
    // subplebbits pages fetch 1 page
    expect(Object.keys(subplebbitsPagesStore.getState().subplebbitsPages).length).toBe(1);
    // buffered feed has 1 page
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(
      subplebbitGetPageCommentCount - postsPerPage,
    );
    expect(
      rendered.result.current.bufferedFeedsSubplebbitsPostCounts[feedName][subplebbitAddresses[0]],
    ).toBe(subplebbitGetPageCommentCount - postsPerPage);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);
    // loaded feed has 1 page
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(postsPerPage);
    expect(rendered.result.current.updatedFeeds[feedName].length).toBe(
      rendered.result.current.loadedFeeds[feedName].length,
    );

    // increment page
    act(() => {
      rendered.result.current.incrementFeedPageNumber(feedName);
    });

    // wait for new page
    await waitFor(() => rendered.result.current.loadedFeeds[feedName].length >= postsPerPage * 2);
    // page was incremented
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(2);
    // feed options are unchanged
    expect(rendered.result.current.feedsOptions[feedName].sortType).toBe(sortType);
    expect(rendered.result.current.feedsOptions[feedName].subplebbitAddresses).toEqual(
      subplebbitAddresses,
    );
    // loaded feed has correct post counts
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(postsPerPage * 2);
    // buffered feed has 1 page less
    const bufferedFeedPostCount = subplebbitGetPageCommentCount - postsPerPage * 2;
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(bufferedFeedPostCount);
    expect(
      rendered.result.current.bufferedFeedsSubplebbitsPostCounts[feedName][subplebbitAddresses[0]],
    ).toBe(bufferedFeedPostCount);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // bufferedFeedsSubplebbitsPostCounts now too low (50), wait for buffered feeds to fetch next page
    await waitFor(
      () => rendered.result.current.bufferedFeeds[feedName].length > bufferedFeedPostCount,
    );
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(
      bufferedFeedPostCount + subplebbitGetPageCommentCount,
    );
    expect(
      rendered.result.current.bufferedFeedsSubplebbitsPostCounts[feedName][subplebbitAddresses[0]],
    ).toBe(bufferedFeedPostCount + subplebbitGetPageCommentCount);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // save subplebbits pages count to make sure they don't change
    const subplebbitsPagesCount = Object.keys(
      subplebbitsPagesStore.getState().subplebbitsPages,
    ).length;

    // account blocks the subplebbit address
    const newMockAccount = { ...mockAccount, blockedAddresses: { [subplebbitAddresses[0]]: true } };
    // @ts-ignore
    accountsStore.getState = () => ({
      accounts: { [mockAccount.id]: newMockAccount },
      accountsActionsInternal: { addCidToAccountComment: async (comment: any) => {} },
    });
    accountsStore.setState(() => ({
      accounts: { [mockAccount.id]: newMockAccount },
    }));

    // wait for bufferedFeed to go to 0 because the only address is blocked
    await waitFor(() => rendered.result.current.bufferedFeeds[feedName].length === 0);
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(0);
    expect(
      rendered.result.current.bufferedFeedsSubplebbitsPostCounts[feedName][subplebbitAddresses[0]],
    ).toBe(0);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(false);
    // loaded feed is unaffected
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(postsPerPage * 2);

    // make sure no more subplebbits pages get added for the blocked address
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(subplebbitsPagesStore.getState().subplebbitsPages).length >
            subplebbitsPagesCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(subplebbitsPagesStore.getState().subplebbitsPages).length).toBe(
      subplebbitsPagesCount,
    );
  });

  test("addFeedToStore accepts isBufferedFeed null (branch 110)", async () => {
    const feedName = "null-buffered-feed";
    const subplebbitAddresses = ["subplebbit address 1"];
    act(() => {
      rendered.result.current.addFeedToStore(
        feedName,
        subplebbitAddresses,
        "new",
        mockAccount,
        null as any,
      );
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName]).toBeDefined();
  });

  test("duplicate feed add returns early without overwriting", async () => {
    const feedName = "duplicate-feed";
    const subplebbitAddresses = ["subplebbit address 1"];
    const sortType = "new";

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    const optsBefore = rendered.result.current.feedsOptions[feedName];

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    expect(rendered.result.current.feedsOptions[feedName]).toBe(optsBefore);
  });

  test("incrementFeedPageNumber before loaded throws", async () => {
    const feedName = "early-increment-feed";
    const subplebbitAddresses = ["subplebbit address 1"];
    const sortType = "new";

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);

    expect(() => {
      act(() => {
        rendered.result.current.incrementFeedPageNumber(feedName);
      });
    }).toThrow();
  });

  test("initializeFeedsStore early return on second addFeedToStore", async () => {
    const feed1 = "init-feed-1";
    const feed2 = "init-feed-2";
    const subplebbitAddresses = ["subplebbit address 1"];
    const sortType = "new";

    act(() => {
      rendered.result.current.addFeedToStore(feed1, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feed1]);

    act(() => {
      rendered.result.current.addFeedToStore(feed2, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feed2]);
    expect(rendered.result.current.feedsOptions[feed1]).toBeDefined();
    expect(rendered.result.current.feedsOptions[feed2]).toBeDefined();
  });

  test("updateFeedsOnAccountsBlockedAddressesChange returns when blocked address not in feeds", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", subplebbitAddresses]);
    const otherAddress = "other-sub-not-in-feed";

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const blockedAccount = {
      ...mockAccount,
      blockedAddresses: { [otherAddress]: true },
    };
    (accountsStore as any).getState = () => ({
      accounts: { [mockAccount.id]: blockedAccount },
      accountsActionsInternal: { addCidToAccountComment: async () => {} },
    });
    accountsStore.setState(() => ({
      accounts: { [mockAccount.id]: blockedAccount },
    }));

    await new Promise((r) => setTimeout(r, 150));
  });

  test("addSubplebbitsPagesOnLowBufferedFeeds skips blocked subplebbit", async () => {
    const sub1 = "subplebbit address 1";
    const sub2 = "subplebbit address 2";
    const subplebbitAddresses = [sub1, sub2];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const blockedAccount = {
      ...mockAccount,
      blockedAddresses: { [sub2]: true },
    };
    (accountsStore as any).getState = () => ({
      accounts: { [mockAccount.id]: blockedAccount },
      accountsActionsInternal: { addCidToAccountComment: async () => {} },
    });
    accountsStore.setState(() => ({
      accounts: { [mockAccount.id]: blockedAccount },
    }));

    await new Promise((r) => setTimeout(r, 200));
  });

  test("addSubplebbitsPagesOnLowBufferedFeeds skips cache-expired subplebbit", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const sub = subplebbitsStore.getState().subplebbits[subplebbitAddresses[0]];
    subplebbitsStore.setState((state: any) => ({
      subplebbits: {
        ...state.subplebbits,
        [subplebbitAddresses[0]]: { ...sub, fetchedAt: 0 },
      },
    }));

    act(() => rendered.result.current.incrementFeedPageNumber(feedName));
    await new Promise((r) => setTimeout(r, 300));

    subplebbitsStore.setState((state: any) => ({
      subplebbits: {
        ...state.subplebbits,
        [subplebbitAddresses[0]]: sub,
      },
    }));
  });

  test("updateFeedsOnAccountsBlockedAddressesChange calls updateFeeds when blocked address is in feed", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const blockedAccount = {
      ...mockAccount,
      blockedAddresses: { [subplebbitAddresses[0]]: true },
    };
    (accountsStore as any).getState = () => ({
      accounts: { [mockAccount.id]: blockedAccount },
      accountsActionsInternal: { addCidToAccountComment: async () => {} },
    });
    accountsStore.setState(() => ({
      accounts: { [mockAccount.id]: blockedAccount },
    }));

    await waitFor(() => rendered.result.current.bufferedFeeds[feedName]?.length === 0);
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(0);
  });

  test("addSubplebbitsToSubplebbitsStore catch when addSubplebbitToStore rejects", async () => {
    const rejectAddress = "subplebbit-reject-address";
    const addOrig = subplebbitsStore.getState().addSubplebbitToStore;
    subplebbitsStore.setState((s: any) => ({
      ...s,
      addSubplebbitToStore: () => Promise.reject(new Error("add failed")),
    }));

    act(() => {
      rendered.result.current.addFeedToStore(
        JSON.stringify([mockAccount?.id, "new", [rejectAddress]]),
        [rejectAddress],
        "new",
        mockAccount,
      );
    });
    await new Promise((r) => setTimeout(r, 250));
    expect(
      rendered.result.current.feedsOptions[
        JSON.stringify([mockAccount?.id, "new", [rejectAddress]])
      ],
    ).toBeDefined();
    subplebbitsStore.setState((s: any) => ({ ...s, addSubplebbitToStore: addOrig }));
  });

  test("updateFeedsOnFeedsSubplebbitsChange returns when subplebbit added is not in any feed", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const otherAddress = "subplebbit-not-in-feed";
    await act(async () => {
      await subplebbitsStore.getState().addSubplebbitToStore(otherAddress, mockAccount);
    });
    await new Promise((r) => setTimeout(r, 150));
  });

  test("resetFeed resets page to 1 and clears loaded/updated", async () => {
    const subplebbitAddresses = ["subplebbit address reset-feed"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, subplebbitAddresses]);
    const getSubplebbitSpy = vi.spyOn(mockAccount.plebbit, "getSubplebbit");

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length >= postsPerPage);

    act(() => rendered.result.current.incrementFeedPageNumber(feedName));
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length >= postsPerPage * 2);

    await act(async () => {
      await rendered.result.current.resetFeed(feedName);
    });
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
    expect(rendered.result.current.loadedFeeds[feedName]).toEqual([]);
    expect(rendered.result.current.updatedFeeds[feedName]).toEqual([]);
    expect(getSubplebbitSpy).toHaveBeenCalledWith({ address: subplebbitAddresses[0] });
    getSubplebbitSpy.mockRestore();
  });

  test("updateFeedsOnAccountsBlockedCidsChange calls updateFeeds when blocked cid is in feed", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const firstCid = rendered.result.current.loadedFeeds[feedName][0]?.cid;
    const blockedAccount = {
      ...mockAccount,
      blockedCids: firstCid ? { [firstCid]: true } : {},
    };
    (accountsStore as any).getState = () => ({
      accounts: { [mockAccount.id]: blockedAccount },
      accountsActionsInternal: { addCidToAccountComment: async () => {} },
    });
    accountsStore.setState(() => ({
      accounts: { [mockAccount.id]: blockedAccount },
    }));

    await waitFor(() => rendered.result.current.bufferedFeeds[feedName]?.length === 0);
  });

  test("updateFeedsOnAccountsBlockedAddressesChange returns when blocked address is not in feed", async () => {
    const subplebbitAddresses = ["subplebbit address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", subplebbitAddresses]);
    const originalBlockedAddresses = mockAccount.blockedAddresses;

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    mockAccount.blockedAddresses = { "unrelated-address": true };
    accountsStore.setState(() => ({
      accounts: { [mockAccount.id]: mockAccount },
    }));

    await new Promise((r) => setTimeout(r, 150));
    expect(rendered.result.current.loadedFeeds[feedName]?.length).toBeGreaterThan(0);

    mockAccount.blockedAddresses = originalBlockedAddresses;
  });

  test("resetFeed logs and continues when refreshSubplebbit rejects", async () => {
    const subplebbitAddresses = ["subplebbit address refresh-fail"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, subplebbitAddresses]);
    const refreshSubplebbit = subplebbitsStore.getState().refreshSubplebbit;

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length >= postsPerPage);

    const refreshSpy = vi.fn().mockRejectedValue(new Error("refresh failed"));
    subplebbitsStore.setState((state: any) => ({
      ...state,
      refreshSubplebbit: refreshSpy,
    }));

    await act(async () => {
      await rendered.result.current.resetFeed(feedName);
    });

    expect(refreshSpy).toHaveBeenCalledWith(
      subplebbitAddresses[0],
      expect.objectContaining({ id: mockAccount.id }),
    );

    subplebbitsStore.setState((state: any) => ({
      ...state,
      refreshSubplebbit,
    }));
  });

  test("addFeedToStore with isBufferedFeed true sets pageNumber 0", async () => {
    const subplebbitAddresses = ["subplebbit address buffered"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, subplebbitAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(
        feedName,
        subplebbitAddresses,
        sortType,
        mockAccount,
        true, // isBufferedFeed
      );
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(0);
  });

  test("addNextSubplebbitPageToStore catch logs error when fetch throws", async () => {
    const subplebbitAddresses = ["subplebbit address addNext-throws"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, subplebbitAddresses]);
    const addNextOriginal = subplebbitsPagesStore.getState().addNextSubplebbitPageToStore;

    act(() => {
      rendered.result.current.addFeedToStore(feedName, subplebbitAddresses, sortType, mockAccount);
    });
    const longWaitFor = testUtils.createWaitFor(rendered, { timeout: 10000 });
    await longWaitFor(() => rendered.result.current.loadedFeeds[feedName]?.length >= postsPerPage);

    subplebbitsPagesStore.setState((state: any) => ({
      ...state,
      addNextSubplebbitPageToStore: async () => {
        throw new Error("fetch failed");
      },
    }));

    act(() => rendered.result.current.incrementFeedPageNumber(feedName));
    await waitFor(() => {
      const count =
        rendered.result.current.bufferedFeedsSubplebbitsPostCounts[feedName]?.[
          subplebbitAddresses[0]
        ];
      return count !== undefined && count <= 50;
    });

    subplebbitsPagesStore.setState((state: any) => ({
      ...state,
      addNextSubplebbitPageToStore: addNextOriginal,
    }));
  });
});
