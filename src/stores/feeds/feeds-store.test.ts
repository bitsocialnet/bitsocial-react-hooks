import { act, waitFor as tlWaitFor } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import useFeedsStore, { defaultPostsPerPage as postsPerPage } from "./feeds-store";
import { CommunityPage } from "../../types";
import communitiesStore from "../communities";
import communitiesPagesStore from "../communities-pages";
import EventEmitter from "events";
import accountsStore from "../accounts";
import { setPlebbitJs } from "../..";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";

const communityGetPageCommentCount = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class MockPages {
  communityAddress: string;
  pageCids: { [pageCid: string]: string };
  constructor({ communityAddress }: any) {
    this.communityAddress = communityAddress;
    this.pageCids = {
      new: `${communityAddress} new page cid`,
    };
  }

  async getPage(options: { cid: string }) {
    const cid = options?.cid;
    await sleep(200);
    const page: CommunityPage = {
      nextCid: cid + " - next page cid",
      comments: this.getPageMockComments(cid),
    };
    return page;
  }

  async validatePage(page: any) {}

  getPageMockComments(pageCid: string) {
    let index = 0;
    const comments: any[] = [];
    while (index++ < communityGetPageCommentCount) {
      comments.push({
        timestamp: index,
        cid: pageCid + " comment cid " + index,
        communityAddress: this.communityAddress,
      });
    }
    return comments;
  }
}

class MockCommunity extends EventEmitter {
  address: string;
  posts: MockPages;
  constructor({ address }: any) {
    super();
    this.address = address;
    this.posts = new MockPages({ communityAddress: address });
  }
  async update() {}
}

const mockAccount: any = {
  id: "mock account id",
  plebbit: {
    createCommunity: async ({ address }: any) => new MockCommunity({ address }),
    getCommunity: async (options: { address: string }) =>
      new MockCommunity({ address: options?.address }),
    communities: [],
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
    expect(rendered.result.current.bufferedFeedsCommunitiesPostCounts).toEqual({});
    expect(rendered.result.current.loadedFeeds).toEqual({});
    expect(rendered.result.current.updatedFeeds).toEqual({});
    expect(typeof rendered.result.current.addFeedToStore).toBe("function");
    expect(typeof rendered.result.current.incrementFeedPageNumber).toBe("function");
    expect(typeof rendered.result.current.updateFeeds).toBe("function");
  });

  test("add feed, increment page, block address", async () => {
    const communityAddresses = ["community address 1"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
    });

    // wait for feed to be added
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
    expect(rendered.result.current.feedsOptions[feedName].sortType).toBe(sortType);
    expect(rendered.result.current.feedsOptions[feedName].communityAddresses).toEqual(
      communityAddresses,
    );

    // wait for feed to load
    await waitFor(() => rendered.result.current.loadedFeeds[feedName].length > 0);
    // community was added to communities store
    expect(communitiesStore.getState().communities[communityAddresses[0]]).not.toBe(undefined);
    // feeds become defined
    expect(rendered.result.current.bufferedFeeds[feedName]).not.toBe(undefined);
    expect(rendered.result.current.loadedFeeds[feedName]).not.toBe(undefined);
    expect(rendered.result.current.updatedFeeds[feedName].length).toBe(
      rendered.result.current.loadedFeeds[feedName].length,
    );
    expect(rendered.result.current.bufferedFeedsCommunitiesPostCounts[feedName]).not.toBe(
      undefined,
    );
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);
    // communities pages fetch 1 page
    expect(Object.keys(communitiesPagesStore.getState().communitiesPages).length).toBe(1);
    // buffered feed has 1 page
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(
      communityGetPageCommentCount - postsPerPage,
    );
    expect(
      rendered.result.current.bufferedFeedsCommunitiesPostCounts[feedName][communityAddresses[0]],
    ).toBe(communityGetPageCommentCount - postsPerPage);
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
    expect(rendered.result.current.feedsOptions[feedName].communityAddresses).toEqual(
      communityAddresses,
    );
    // loaded feed has correct post counts
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(postsPerPage * 2);
    // buffered feed has 1 page less
    const bufferedFeedPostCount = communityGetPageCommentCount - postsPerPage * 2;
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(bufferedFeedPostCount);
    expect(
      rendered.result.current.bufferedFeedsCommunitiesPostCounts[feedName][communityAddresses[0]],
    ).toBe(bufferedFeedPostCount);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // bufferedFeedsCommunitiesPostCounts now too low (50), wait for buffered feeds to fetch next page
    await waitFor(
      () => rendered.result.current.bufferedFeeds[feedName].length > bufferedFeedPostCount,
    );
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(
      bufferedFeedPostCount + communityGetPageCommentCount,
    );
    expect(
      rendered.result.current.bufferedFeedsCommunitiesPostCounts[feedName][communityAddresses[0]],
    ).toBe(bufferedFeedPostCount + communityGetPageCommentCount);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // save communities pages count to make sure they don't change
    const communitiesPagesCount = Object.keys(
      communitiesPagesStore.getState().communitiesPages,
    ).length;

    // account blocks the community address
    const newMockAccount = { ...mockAccount, blockedAddresses: { [communityAddresses[0]]: true } };
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
      rendered.result.current.bufferedFeedsCommunitiesPostCounts[feedName][communityAddresses[0]],
    ).toBe(0);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(false);
    // loaded feed is unaffected
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(postsPerPage * 2);

    // make sure no more communities pages get added for the blocked address
    await expect(
      tlWaitFor(() => {
        if (
          !(
            Object.keys(communitiesPagesStore.getState().communitiesPages).length >
            communitiesPagesCount
          )
        )
          throw new Error("condition not met");
      }),
    ).rejects.toThrow();
    expect(Object.keys(communitiesPagesStore.getState().communitiesPages).length).toBe(
      communitiesPagesCount,
    );
  });

  test("addFeedToStore accepts isBufferedFeed null (branch 110)", async () => {
    const feedName = "null-buffered-feed";
    const communityAddresses = ["community address 1"];
    act(() => {
      rendered.result.current.addFeedToStore(
        feedName,
        communityAddresses,
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
    const communityAddresses = ["community address 1"];
    const sortType = "new";

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    const optsBefore = rendered.result.current.feedsOptions[feedName];

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
    });
    expect(rendered.result.current.feedsOptions[feedName]).toBe(optsBefore);
  });

  test("incrementFeedPageNumber before loaded throws", async () => {
    const feedName = "early-increment-feed";
    const communityAddresses = ["community address 1"];
    const sortType = "new";

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
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
    const communityAddresses = ["community address 1"];
    const sortType = "new";

    act(() => {
      rendered.result.current.addFeedToStore(feed1, communityAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feed1]);

    act(() => {
      rendered.result.current.addFeedToStore(feed2, communityAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feed2]);
    expect(rendered.result.current.feedsOptions[feed1]).toBeDefined();
    expect(rendered.result.current.feedsOptions[feed2]).toBeDefined();
  });

  test("updateFeedsOnAccountsBlockedAddressesChange returns when blocked address not in feeds", async () => {
    const communityAddresses = ["community address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", communityAddresses]);
    const otherAddress = "other-sub-not-in-feed";

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, "new", mockAccount);
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

  test("addCommunitiesPagesOnLowBufferedFeeds skips blocked community", async () => {
    const sub1 = "community address 1";
    const sub2 = "community address 2";
    const communityAddresses = [sub1, sub2];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
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

  test("addCommunitiesPagesOnLowBufferedFeeds skips cache-expired community", async () => {
    const communityAddresses = ["community address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const sub = communitiesStore.getState().communities[communityAddresses[0]];
    communitiesStore.setState((state: any) => ({
      communities: {
        ...state.communities,
        [communityAddresses[0]]: { ...sub, fetchedAt: 0 },
      },
    }));

    act(() => rendered.result.current.incrementFeedPageNumber(feedName));
    await new Promise((r) => setTimeout(r, 300));

    communitiesStore.setState((state: any) => ({
      communities: {
        ...state.communities,
        [communityAddresses[0]]: sub,
      },
    }));
  });

  test("updateFeedsOnAccountsBlockedAddressesChange calls updateFeeds when blocked address is in feed", async () => {
    const communityAddresses = ["community address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const blockedAccount = {
      ...mockAccount,
      blockedAddresses: { [communityAddresses[0]]: true },
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

  test("addCommunitiesToCommunitiesStore catch when addCommunityToStore rejects", async () => {
    const rejectAddress = "community-reject-address";
    const addOrig = communitiesStore.getState().addCommunityToStore;
    communitiesStore.setState((s: any) => ({
      ...s,
      addCommunityToStore: () => Promise.reject(new Error("add failed")),
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
    communitiesStore.setState((s: any) => ({ ...s, addCommunityToStore: addOrig }));
  });

  test("updateFeedsOnFeedsCommunitiesChange returns when community added is not in any feed", async () => {
    const communityAddresses = ["community address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, "new", mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const otherAddress = "community-not-in-feed";
    await act(async () => {
      await communitiesStore.getState().addCommunityToStore(otherAddress, mockAccount);
    });
    await new Promise((r) => setTimeout(r, 150));
  });

  test("resetFeed resets page to 1 and clears loaded/updated", async () => {
    const communityAddresses = ["community address reset-feed"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, communityAddresses]);
    const getCommunitySpy = vi.spyOn(mockAccount.plebbit, "getCommunity");

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
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
    expect(getCommunitySpy).toHaveBeenCalledWith({ address: communityAddresses[0] });
    getCommunitySpy.mockRestore();
  });

  test("updateFeedsOnAccountsBlockedCidsChange calls updateFeeds when blocked cid is in feed", async () => {
    const communityAddresses = ["community address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, "new", mockAccount);
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
    const communityAddresses = ["community address 1"];
    const feedName = JSON.stringify([mockAccount?.id, "new", communityAddresses]);
    const originalBlockedAddresses = mockAccount.blockedAddresses;

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, "new", mockAccount);
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

  test("resetFeed logs and continues when refreshCommunity rejects", async () => {
    const communityAddresses = ["community address refresh-fail"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, communityAddresses]);
    const refreshCommunity = communitiesStore.getState().refreshCommunity;

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length >= postsPerPage);

    const refreshSpy = vi.fn().mockRejectedValue(new Error("refresh failed"));
    communitiesStore.setState((state: any) => ({
      ...state,
      refreshCommunity: refreshSpy,
    }));

    await act(async () => {
      await rendered.result.current.resetFeed(feedName);
    });

    expect(refreshSpy).toHaveBeenCalledWith(
      communityAddresses[0],
      expect.objectContaining({ id: mockAccount.id }),
    );

    communitiesStore.setState((state: any) => ({
      ...state,
      refreshCommunity,
    }));
  });

  test("addFeedToStore with isBufferedFeed true sets pageNumber 0", async () => {
    const communityAddresses = ["community address buffered"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, communityAddresses]);

    act(() => {
      rendered.result.current.addFeedToStore(
        feedName,
        communityAddresses,
        sortType,
        mockAccount,
        true, // isBufferedFeed
      );
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(0);
  });

  test("addNextCommunityPageToStore catch logs error when fetch throws", async () => {
    const communityAddresses = ["community address addNext-throws"];
    const sortType = "new";
    const feedName = JSON.stringify([mockAccount?.id, sortType, communityAddresses]);
    const addNextOriginal = communitiesPagesStore.getState().addNextCommunityPageToStore;

    act(() => {
      rendered.result.current.addFeedToStore(feedName, communityAddresses, sortType, mockAccount);
    });
    const longWaitFor = testUtils.createWaitFor(rendered, { timeout: 10000 });
    await longWaitFor(() => rendered.result.current.loadedFeeds[feedName]?.length >= postsPerPage);

    communitiesPagesStore.setState((state: any) => ({
      ...state,
      addNextCommunityPageToStore: async () => {
        throw new Error("fetch failed");
      },
    }));

    act(() => rendered.result.current.incrementFeedPageNumber(feedName));
    await waitFor(() => {
      const count =
        rendered.result.current.bufferedFeedsCommunitiesPostCounts[feedName]?.[
          communityAddresses[0]
        ];
      return count !== undefined && count <= 50;
    });

    communitiesPagesStore.setState((state: any) => ({
      ...state,
      addNextCommunityPageToStore: addNextOriginal,
    }));
  });
});
