import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import useRepliesStore, {
  defaultRepliesPerPage as repliesPerPage,
  feedOptionsToFeedName,
  getRepliesFirstPageSkipValidation,
} from "./replies-store";
import { RepliesPage } from "../../types";
import repliesCommentsStore from "./replies-comments-store";
import repliesPagesStore from "../replies-pages";
import EventEmitter from "events";
import accountsStore from "../accounts";
import { setPlebbitJs } from "../..";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";

const getPageCommentCount = 100;

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
    const page: RepliesPage = {
      nextCid: cid + " - next page cid",
      comments: this.getPageMockComments(cid),
    };
    return page;
  }

  async validatePage(page: any) {}

  getPageMockComments(pageCid: string) {
    let index = 0;
    const comments: any[] = [];
    while (index++ < getPageCommentCount) {
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

class MockComment extends EventEmitter {
  cid: string;
  replies: MockPages;
  postCid: string;
  communityAddress: string;
  constructor({ cid }: any) {
    super();
    this.cid = cid;
    this.postCid = "post cid";
    this.communityAddress = `${cid} community address`;
    this.replies = new MockPages({ communityAddress: this.communityAddress });
  }
  async update() {}
}

const mockAccount: any = {
  id: "mock account id",
  plebbit: {
    createCommunity: async ({ address }: any) => new MockCommunity({ address }),
    createComment: async ({ cid }: any) => new MockComment({ cid }),
    getCommunity: async (options: { address: string }) =>
      new MockCommunity({ address: options?.address }),
    communities: [],
    async validateComment(comment: any) {},
  },
  blockedAddresses: {},
  blockedCids: {},
};

describe("replies store", () => {
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
    rendered = renderHook<any, any>(() => useRepliesStore());
    waitFor = testUtils.createWaitFor(rendered);
  });

  test("initial store", async () => {
    expect(rendered.result.current.feedsOptions).toEqual({});
    expect(rendered.result.current.bufferedFeeds).toEqual({});
    expect(rendered.result.current.bufferedFeedsReplyCounts).toEqual({});
    expect(rendered.result.current.loadedFeeds).toEqual({});
    expect(rendered.result.current.updatedFeeds).toEqual({});
    expect(typeof rendered.result.current.addFeedsToStore).toBe("function");
    expect(typeof rendered.result.current.addFeedToStoreOrUpdateComment).toBe("function");
    expect(typeof rendered.result.current.incrementFeedPageNumber).toBe("function");
    expect(typeof rendered.result.current.updateFeeds).toBe("function");
  });

  test("add feed, increment page", async () => {
    const commentCid = "comment cid 1";
    const sortType = "new";
    const feedOptions = { sortType, commentCid, accountId: mockAccount.id };
    const feedName = feedOptionsToFeedName(feedOptions);
    const comment = new MockComment({ cid: commentCid });

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, feedOptions);
    });

    // wait for feed to be added
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
    expect(rendered.result.current.feedsOptions[feedName].sortType).toBe(sortType);
    expect(rendered.result.current.feedsOptions[feedName].commentCid).toEqual(commentCid);
    expect(rendered.result.current.feedsOptions[feedName].accountId).toEqual(mockAccount.id);

    // wait for feed to load
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    // comment was added to comments store
    expect(repliesCommentsStore.getState().comments[commentCid]).not.toBe(undefined);

    // feeds become defined
    expect(rendered.result.current.bufferedFeeds[feedName]).not.toBe(undefined);
    expect(rendered.result.current.loadedFeeds[feedName]).not.toBe(undefined);
    expect(rendered.result.current.updatedFeeds[feedName]?.length).toBe(
      rendered.result.current.loadedFeeds[feedName].length,
    );
    expect(rendered.result.current.bufferedFeedsReplyCounts[feedName]).not.toBe(undefined);
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // replies pages fetch 1 page
    expect(Object.keys(repliesPagesStore.getState().repliesPages).length).toBe(1);
    // buffered feed has 1 page
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(
      getPageCommentCount - repliesPerPage,
    );
    expect(rendered.result.current.bufferedFeedsReplyCounts[feedName]).toBe(
      getPageCommentCount - repliesPerPage,
    );
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // loaded feed has 1 page
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(repliesPerPage);
    expect(rendered.result.current.updatedFeeds[feedName].length).toBe(
      rendered.result.current.loadedFeeds[feedName].length,
    );

    // increment page
    act(() => {
      rendered.result.current.incrementFeedPageNumber(feedName);
    });

    // wait for new page
    await waitFor(() => rendered.result.current.loadedFeeds[feedName].length >= repliesPerPage * 2);
    // page was incremented
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(2);
    // feed options are unchanged
    expect(rendered.result.current.feedsOptions[feedName].sortType).toBe(sortType);
    expect(rendered.result.current.feedsOptions[feedName].commentCid).toEqual(commentCid);
    // loaded feed has correct post counts
    expect(rendered.result.current.loadedFeeds[feedName].length).toBe(repliesPerPage * 2);
    expect(rendered.result.current.updatedFeeds[feedName].length).toBe(
      rendered.result.current.loadedFeeds[feedName].length,
    );
    // buffered feed has 1 page less
    const bufferedFeedRepliesCount = getPageCommentCount - repliesPerPage * 2;
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(bufferedFeedRepliesCount);
    expect(rendered.result.current.bufferedFeedsReplyCounts[feedName]).toBe(
      bufferedFeedRepliesCount,
    );
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // bufferedFeedsReplyCounts now too low (50), wait for buffered feeds to fetch next page
    await waitFor(
      () => rendered.result.current.bufferedFeeds[feedName].length > bufferedFeedRepliesCount,
    );
    expect(rendered.result.current.bufferedFeeds[feedName].length).toBe(
      bufferedFeedRepliesCount + getPageCommentCount,
    );
    expect(rendered.result.current.bufferedFeedsReplyCounts[feedName]).toBe(
      bufferedFeedRepliesCount + getPageCommentCount,
    );
    expect(rendered.result.current.feedsHaveMore[feedName]).toBe(true);

    // save replies pages count to make sure they don't change
    const repliesPagesCount = Object.keys(repliesPagesStore.getState().repliesPages).length;
  });

  test("addFeedsToStore returns early when feedOptionsArray is empty", () => {
    const result = rendered.result.current.addFeedsToStore([]);
    expect(result).toBeUndefined();
  });

  test("addFeedsToStore deletes newFeedsOptions when feed already exists", async () => {
    const commentCid = "existing-feed-cid";
    const feedOptions = {
      sortType: "new",
      commentCid,
      accountId: mockAccount.id,
    };
    const feedName = feedOptionsToFeedName(feedOptions);
    const comment = new MockComment({ cid: commentCid });

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, feedOptions);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, feedOptions);
    });
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
  });

  test("addFeedsToStore setState deletes newFeedsOptions when feed already in store", async () => {
    const commentCid = "race-feed-cid";
    const feedOptions = {
      sortType: "new",
      commentCid,
      accountId: mockAccount.id,
    };
    const feedName = feedOptionsToFeedName(feedOptions);
    const comment = new MockComment({ cid: commentCid });

    act(() => {
      rendered.result.current.addFeedsToStore([feedOptions]);
      rendered.result.current.addFeedsToStore([feedOptions]);
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
  });

  test("addFeedToStoreOrUpdateComment with flat does not add nested feeds", async () => {
    const commentCid = "flat-feed-unique-cid";
    const nestedCid = "nested-reply-flat-cid";
    const comment = new MockComment({ cid: commentCid });
    (comment as any).replies = {
      pages: {
        new: {
          comments: [{ cid: nestedCid, replies: { pages: {} }, depth: 1 }],
        },
      },
    };

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, {
        sortType: "new",
        commentCid,
        accountId: mockAccount.id,
        flat: true,
      });
    });
    const feedName = feedOptionsToFeedName({
      sortType: "new",
      commentCid,
      accountId: mockAccount.id,
    });
    await waitFor(() => rendered.result.current.feedsOptions[feedName]);

    const feedsForComment = Object.keys(rendered.result.current.feedsOptions).filter((fn) =>
      fn.includes(commentCid),
    );
    expect(feedsForComment).toHaveLength(1);
    expect(feedsForComment[0]).toContain(commentCid);
  });

  test("resetFeed resets page to 1 and clears loaded/updated", async () => {
    const commentCid = "reset-feed-cid";
    const feedOptions = { sortType: "new", commentCid, accountId: mockAccount.id };
    const feedName = feedOptionsToFeedName(feedOptions);
    const comment = new MockComment({ cid: commentCid });

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, feedOptions);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    act(() => rendered.result.current.incrementFeedPageNumber(feedName));
    await waitFor(() => rendered.result.current.feedsOptions[feedName].pageNumber === 2);

    act(() => rendered.result.current.resetFeed(feedName));
    expect(rendered.result.current.feedsOptions[feedName].pageNumber).toBe(1);
    expect(rendered.result.current.loadedFeeds[feedName]).toEqual([]);
    expect(rendered.result.current.updatedFeeds[feedName]).toEqual([]);
  });

  test("getRepliesFirstPageSkipValidation returns first page without validation", () => {
    const subAddr = "skip-validation-sub";
    const commentCid = "skip-validation-cid";
    const comment = {
      cid: commentCid,
      communityAddress: subAddr,
      replies: {
        pages: {
          new: {
            comments: [
              { cid: "r1", communityAddress: subAddr, timestamp: 1 },
              { cid: "r2", communityAddress: subAddr, timestamp: 2 },
            ],
            nextCid: "next-page-cid",
          },
        },
      },
    };
    const result = getRepliesFirstPageSkipValidation(comment as any, {
      accountId: mockAccount.id,
      commentCid,
      sortType: "new",
      repliesPerPage: 1,
    });
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0].cid).toBe("r2");
    expect(result.hasMore).toBe(true);
  });

  test("addNextRepliesPageToStore catch when addNextRepliesPageToStore rejects", async () => {
    const commentCid = "addNext-reject-cid";
    const feedOptions = { sortType: "new", commentCid, accountId: mockAccount.id };
    const feedName = feedOptionsToFeedName(feedOptions);
    const comment = new MockComment({ cid: commentCid });

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, feedOptions);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);

    const addNextOrig = repliesPagesStore.getState().addNextRepliesPageToStore;
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      repliesPagesStore.setState((s: any) => ({
        ...s,
        addNextRepliesPageToStore: () => Promise.reject(new Error("addNext failed")),
      }));

      act(() => rendered.result.current.incrementFeedPageNumber(feedName));
      await waitFor(() => rendered.result.current.bufferedFeedsReplyCounts[feedName] <= 50);

      await new Promise((r) => setTimeout(r, 300));
      expect(logSpy).toHaveBeenCalled();
    } finally {
      repliesPagesStore.setState((s: any) => ({ ...s, addNextRepliesPageToStore: addNextOrig }));
      logSpy.mockRestore();
    }
  });

  test("updateFeedsAgain when updateFeeds called twice quickly", async () => {
    const commentCid = "double-update-cid";
    const feedOptions = { sortType: "new", commentCid, accountId: mockAccount.id };
    const feedName = feedOptionsToFeedName(feedOptions);
    const comment = new MockComment({ cid: commentCid });

    act(() => {
      rendered.result.current.addFeedToStoreOrUpdateComment(comment, feedOptions);
    });
    await waitFor(() => rendered.result.current.loadedFeeds[feedName]?.length > 0);
    const initialFeed = rendered.result.current.loadedFeeds[feedName];
    expect(initialFeed.length).toBeGreaterThan(0);

    act(() => {
      rendered.result.current.updateFeeds();
      rendered.result.current.updateFeeds();
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(rendered.result.current.loadedFeeds[feedName]).toHaveLength(initialFeed.length);
    expect(rendered.result.current.loadedFeeds[feedName].map((reply: any) => reply.cid)).toEqual(
      initialFeed.map((reply: any) => reply.cid),
    );
  });
});
