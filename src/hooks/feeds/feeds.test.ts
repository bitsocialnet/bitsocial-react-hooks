import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import { Comment } from "../../types";
import { useFeed, useBufferedFeeds, useAccount, useCommunity, setPlebbitJs } from "../..";
import * as accountsActions from "../../stores/accounts/accounts-actions";
import { getCommentCidsToAccountsComments } from "../../stores/accounts/utils";
import localForageLru from "../../lib/localforage-lru";
import localForage from "localforage";
import feedsStore, { defaultPostsPerPage as postsPerPage } from "../../stores/feeds";
import communitiesStore from "../../stores/communities";
import communitiesPagesStore from "../../stores/communities-pages";
import accountsStore from "../../stores/accounts";
import PlebbitJsMock, {
  Plebbit,
  Community,
  Pages,
  simulateLoadingTime,
} from "../../lib/plebbit-js/plebbit-js-mock";

const plebbitJsMockCommunityPageLength = 100;

describe("feeds", () => {
  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("get feed", () => {
    let rendered: any, waitFor: any;

    const scrollOnePage = async () => {
      const nextFeedLength = (rendered.result.current.feed?.length || 0) + postsPerPage;
      await act(async () => {
        await rendered.result.current.loadMore();
      });

      try {
        await waitFor(() => rendered.result.current.feed?.length >= nextFeedLength);
      } catch (e) {
        // console.error('scrollOnePage failed:', e)
      }
    };

    beforeEach(async () => {
      // @ts-ignore
      rendered = renderHook<any, any>((props: any) => useFeed(props));
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("get feed with no arguments", async () => {
      expect(rendered.result.current.feed).toEqual([]);
      expect(typeof rendered.result.current.hasMore).toBe("boolean");
      expect(rendered.result.current.hasMore).toBe(false);
      expect(typeof rendered.result.current.loadMore).toBe("function");
    });

    test("useFeed addFeedToStore error is caught and logged", async () => {
      const originalAddFeedToStore = feedsStore.getState().addFeedToStore;
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        feedsStore.setState((state: any) => ({
          ...state,
          addFeedToStore: async () => {
            throw Error("addFeedToStore test error");
          },
        }));

        rendered.rerender({ communityAddresses: ["community address 1"] });
        await new Promise((r) => setTimeout(r, 150));

        expect(rendered.result.current.feed).toEqual([]);
        expect(logSpy).toHaveBeenCalled();
      } finally {
        feedsStore.setState((state: any) => ({
          ...state,
          addFeedToStore: originalAddFeedToStore,
        }));
        logSpy.mockRestore();
      }
    });

    test("useFeed hasMore false when communityAddresses empty", async () => {
      rendered.rerender({});
      expect(rendered.result.current.hasMore).toBe(false);
      rendered.rerender({ communityAddresses: [] });
      expect(rendered.result.current.hasMore).toBe(false);
    });

    test("loadMore init guard throws when not initialized", async () => {
      rendered.rerender({
        communityAddresses: ["community address 1"],
        accountName: "nonexistent-account-xyz",
      });
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      expect(rendered.result.current.errors.length).toBeGreaterThan(0);
      expect(rendered.result.current.error?.message).toMatch(/not initalized/i);
    });

    test("reset init guard throws when not initialized", async () => {
      rendered.rerender({
        communityAddresses: ["community address 1"],
        accountName: "nonexistent-account-xyz",
      });
      await act(async () => {
        await rendered.result.current.reset();
      });
      expect(rendered.result.current.errors.length).toBeGreaterThan(0);
      expect(rendered.result.current.error?.message).toMatch(/not initalized/i);
    });

    test("not yet loaded feed hasMore true", async () => {
      expect(rendered.result.current.hasMore).toBe(false);
      rendered.rerender({ communityAddresses: ["community address 1"] });
      expect(rendered.result.current.hasMore).toBe(true);
    });

    test("get feed page 1 with 1 community sorted by default (hot)", async () => {
      // get feed with 1 sub
      rendered.rerender({ communityAddresses: ["community address 1"] });
      // initial state
      expect(typeof rendered.result.current.hasMore).toBe("boolean");
      expect(typeof rendered.result.current.loadMore).toBe("function");

      // wait for feed array to render
      await waitFor(() => Array.isArray(rendered.result.current.feed));
      expect(rendered.result.current.feed).toEqual([]);

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      // NOTE: the 'hot' sort type uses timestamps and bugs out with timestamp '1-100' so this is why we get cid 1
      // with low upvote count first
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 100",
      );
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.bufferedFeed.length).toBe(
        plebbitJsMockCommunityPageLength - postsPerPage,
      );

      // reset stores to force using the db
      await testUtils.resetStores();

      // get feed again from database, only wait for 1 render because community is stored in db
      const rendered2 = renderHook<any, any>(() =>
        useFeed({ communityAddresses: ["community address 1"] }),
      );
      expect(rendered2.result.current.feed).toEqual([]);

      // only wait for 1 render because community is stored in db
      await waitFor(() => rendered2.result.current.feed[0].cid);
      expect(rendered2.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 100",
      );
      expect(rendered2.result.current.feed.length).toBe(postsPerPage);
    });

    test("useFeed mirrors moderation flags into commentModeration", async () => {
      rendered.rerender({ communityAddresses: ["community address 1"] });
      await waitFor(() => rendered.result.current.feed.length > 0);

      const [feedName] = Object.keys(feedsStore.getState().loadedFeeds);
      const currentFeed = feedsStore.getState().loadedFeeds[feedName];
      feedsStore.setState((state: any) => ({
        ...state,
        loadedFeeds: {
          ...state.loadedFeeds,
          [feedName]: [{ ...currentFeed[0], purged: true }, ...currentFeed.slice(1)],
        },
      }));

      await waitFor(() => rendered.result.current.feed[0]?.commentModeration?.purged === true);
      expect(rendered.result.current.feed[0]?.purged).toBe(true);
      expect(rendered.result.current.feed[0]?.commentModeration?.purged).toBe(true);
    });

    test("feed cache expires and hasMore is true", async () => {
      // mock Date.now for fetchedAt cache value
      const now = Date.now();
      const DateNow = Date.now;
      Date.now = () => now;

      // get feed with 1 sub
      rendered.rerender({ communityAddresses: ["community address 1"] });

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 100",
      );
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // expire cache 1h + 1min
      Date.now = () => now + 61 * 60 * 1000;

      // mock sub update to never update
      const update = Community.prototype.update;
      Community.prototype.update = async function () {};

      // reset stores to force using the db
      await testUtils.resetStores();

      // get feed again from database, only wait for 1 render because community is stored in db
      const rendered2 = renderHook<any, any>(() =>
        useFeed({ communityAddresses: ["community address 1"] }),
      );

      // no way to wait other than just time since result is that there's no result
      await new Promise((r) => setTimeout(r, 100));

      // feed cache expired
      expect(rendered2.result.current.feed.length).toBe(0);

      // hasMore is true
      expect(rendered2.result.current.hasMore).toBe(true);

      // restore mock
      Date.now = DateNow;
      Community.prototype.update = update;
    });

    test("get feed with custom posts per page", async () => {
      const customPostsPerPage = 10;
      rendered.rerender({
        communityAddresses: ["community address 1"],
        postsPerPage: customPostsPerPage,
      });

      // wait for feed array to render
      await waitFor(() => Array.isArray(rendered.result.current.feed));
      expect(rendered.result.current.feed).toEqual([]);

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(rendered.result.current.feed.length).toBe(customPostsPerPage);

      // load page 2
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(() => rendered.result.current.feed.length === customPostsPerPage * 2);
      expect(rendered.result.current.feed.length).toBe(customPostsPerPage * 2);
    });

    test("get feed with newerThan", async () => {
      const getPage = Pages.prototype.getPage;
      const now = Math.floor(Date.now() / 1000);
      Pages.prototype.getPage = async function (options: { cid: string }) {
        const cid = options?.cid;
        await simulateLoadingTime();
        const page: any = { comments: [] };
        while (page.comments.length < 100) {
          page.comments.push({
            timestamp: now - page.comments.length, // 1 post per second
            cid: cid + " comment cid " + (page.comments.length + 1),
            communityAddress: this.community.address,
          });
        }
        return page;
      };

      const newerThan = 5; // newer than x seconds
      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "new", // sort by new so the feed uses getPage
        newerThan,
      });

      // wait for feed array to render
      await waitFor(() => Array.isArray(rendered.result.current.feed));
      expect(rendered.result.current.feed).toEqual([]);

      // wait for posts to be added, should get same amount as newerThan because 1 post per second in getPage
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(
        rendered.result.current.feed.length === newerThan ||
          rendered.result.current.feed.length === newerThan - 1,
      ).toBe(true);

      Pages.prototype.getPage = getPage;
    });

    test("get feed with newerThan sortType active", async () => {
      const getPage = Pages.prototype.getPage;
      const now = Math.floor(Date.now() / 1000);
      Pages.prototype.getPage = async function (options: { cid: string }) {
        await simulateLoadingTime();
        return {
          comments: [
            // should be newer
            {
              timestamp: now,
              lastReplyTimestamp: undefined,
              cid: "newer cid 1",
              communityAddress: this.community.address,
            },
            {
              timestamp: 1,
              lastReplyTimestamp: now,
              cid: "newer cid 2",
              communityAddress: this.community.address,
            },
            // should not be newer
            {
              timestamp: 1,
              lastReplyTimestamp: undefined,
              cid: "older cid 1",
              communityAddress: this.community.address,
            },
            {
              timestamp: 1,
              lastReplyTimestamp: 1,
              cid: "older cid 2",
              communityAddress: this.community.address,
            },
          ],
        };
      };

      const newerThan = 5; // newer than x seconds
      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "active",
        newerThan,
      });

      // wait for feed array to render
      await waitFor(() => Array.isArray(rendered.result.current.feed));
      expect(rendered.result.current.feed).toEqual([]);

      // wait for posts to be added, should get same amount as newerThan because 1 post per second in getPage
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(rendered.result.current.feed.length).toBe(2);
      expect(rendered.result.current.feed[0].cid).toBe("newer cid 1");
      expect(rendered.result.current.feed[1].cid).toBe("newer cid 2");

      Pages.prototype.getPage = getPage;
    });

    test("newerThan sets correct sortType", async () => {
      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "topAll",
        newerThan: 60 * 60 * 24,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch("topDay");

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "topAll",
        newerThan: 60 * 60 * 24 * 7,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch("topWeek");

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "topAll",
        newerThan: 60 * 60 * 24 * 30,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch("topMonth");

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "topAll",
        newerThan: 60 * 60 * 24 * 365,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch("topYear");

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "controversialAll",
        newerThan: 60 * 60 * 24,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch("controversialDay");

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "controversialAll",
        newerThan: 60 * 60 * 24 * 7,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch(
        "controversialWeek",
      );

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "controversialAll",
        newerThan: 60 * 60 * 24 * 30,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch(
        "controversialMonth",
      );

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "controversialAll",
        newerThan: 60 * 60 * 24 * 365,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch(
        "controversialYear",
      );

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "topAll",
        newerThan: 60 * 60 * 24 * 400,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).join(" ")).toMatch("topAll");
    });

    test("change community addresses and sort type", async () => {
      rendered.rerender({ communityAddresses: ["community address 1"], sortType: "hot" });
      await waitFor(() => !!rendered.result.current.feed[0].cid.match(/community address 1/));
      expect(rendered.result.current.feed[0].cid).toMatch(/community address 1/);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // change community addresses
      rendered.rerender({
        communityAddresses: ["community address 2", "community address 3"],
        sortType: "hot",
      });
      await waitFor(() => !!rendered.result.current.feed[0].cid.match(/community address (2|3)/));

      expect(rendered.result.current.feed[0].cid).toMatch(/community address (2|3)/);
      // the 'hot' sort type should give timestamp 100 with the current mock
      expect(rendered.result.current.feed[0].timestamp).toBe(100);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // change sort type
      rendered.rerender({
        communityAddresses: ["community address 2", "community address 3"],
        sortType: "new",
      });
      await waitFor(() => !!rendered.result.current.feed[0].cid.match(/community address (2|3)/));

      expect(rendered.result.current.feed[0].cid).toMatch(/community address (2|3)/);
      // the 'new' sort type should give timestamp higher than 99 with the current mock
      expect(rendered.result.current.feed[0].timestamp).toBeGreaterThan(99);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // change community addresses and sort type
      rendered.rerender({
        communityAddresses: ["community address 4", "community address 5"],
        sortType: "topAll",
      });
      await waitFor(() => !!rendered.result.current.feed[0].cid.match(/community address (4|5)/));

      expect(rendered.result.current.feed[0].cid).toMatch(/community address (4|5)/);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // change sort type active
      rendered.rerender({
        communityAddresses: ["community address 2", "community address 3"],
        sortType: "active",
      });
      await waitFor(() => !!rendered.result.current.feed[0].cid.match(/community address (2|3)/));

      expect(rendered.result.current.feed[0].cid).toMatch(/community address (2|3)/);
      // the 'new' sort type should give timestamp higher than 99 with the current mock
      expect(rendered.result.current.feed[0].timestamp).toBeGreaterThan(99);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
    });

    test("get feed with 1 community and scroll to multiple pages", async () => {
      // get feed with 1 sub
      rendered.rerender({ communityAddresses: ["community address 1"] });
      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);

      let pages = 20;
      let currentPage = 1;
      while (currentPage++ < pages) {
        // load 25 more posts
        await act(async () => {
          await rendered.result.current.loadMore();
        });
        await waitFor(() => rendered.result.current.feed?.length >= postsPerPage * currentPage);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * currentPage);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );
      }
    });

    test("get feed with 1 community sorted by new and scroll to multiple pages", async () => {
      let getPageCalledTimes = 0;
      const getPage = Pages.prototype.getPage;
      Pages.prototype.getPage = async function (options: { cid: string }) {
        const cid = options?.cid;
        // without the extra simulated load time the hooks will fetch multiple pages in advance instead of just 1
        await simulateLoadingTime();
        const page: any = {
          nextCid: this.community.address + " next page cid " + (getPageCalledTimes + 1),
          comments: [],
        };
        const postCount = 100;
        let index = 0;
        let commentStartIndex = getPageCalledTimes * postCount;
        while (index++ < postCount) {
          page.comments.push({
            timestamp: commentStartIndex + index,
            cid: cid + " comment cid " + (commentStartIndex + index),
            communityAddress: this.community.address,
          });
        }
        getPageCalledTimes++;
        return page;
      };

      // get feed with 1 sub sorted by new page 1
      rendered.rerender({ communityAddresses: ["community address 1"], sortType: "new" });
      await waitFor(() => rendered.result.current.feed?.length >= postsPerPage);

      expect(rendered.result.current.feed[0].timestamp).toBe(100);
      expect(rendered.result.current.feed[1].timestamp).toBe(99);
      expect(rendered.result.current.feed[2].timestamp).toBe(98);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid new comment cid 100",
      );
      expect(rendered.result.current.feed[1].cid).toBe(
        "community address 1 page cid new comment cid 99",
      );
      expect(rendered.result.current.feed[2].cid).toBe(
        "community address 1 page cid new comment cid 98",
      );

      // at this point the buffered feed has gotten 1 community page
      expect(getPageCalledTimes).toBe(1);

      // get page 2
      await scrollOnePage();
      expect(rendered.result.current.feed[postsPerPage].timestamp).toBe(75);
      expect(rendered.result.current.feed[postsPerPage].cid).toBe(
        "community address 1 page cid new comment cid 75",
      );

      // ad this point the buffered feed is length 50, we can wait for getPage to be called again
      // refill the buffer
      await waitFor(() => getPageCalledTimes === 2);

      expect(getPageCalledTimes).toBe(2);

      // get page 3 and 4, it should show new posts from the recalculated buffer
      await scrollOnePage();
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].timestamp,
      ).toBe(200);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].cid,
      ).toBe("community address 1 next page cid 1 comment cid 200");
      await scrollOnePage();
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].timestamp,
      ).toBe(175);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].cid,
      ).toBe("community address 1 next page cid 1 comment cid 175");

      // scroll 2 more times to get to buffered feeds length 50 and trigger a new buffer refill
      await scrollOnePage();
      await scrollOnePage();

      await waitFor(() => getPageCalledTimes === 3);
      expect(getPageCalledTimes).toBe(3);

      // next pages should have recalculated buffered feed that starts at 300
      await scrollOnePage();
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].timestamp,
      ).toBe(300);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].cid,
      ).toBe("community address 1 next page cid 2 comment cid 300");
      await scrollOnePage();
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].timestamp,
      ).toBe(275);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].cid,
      ).toBe("community address 1 next page cid 2 comment cid 275");

      // restore mock
      Pages.prototype.getPage = getPage;
    });

    test("get multiple communities sorted by new and scroll to multiple pages", async () => {
      const getPageCalledTimes = {
        "community address 1": 0,
        "community address 2": 0,
        "community address 3": 0,
      };
      const getPage = Pages.prototype.getPage;
      Pages.prototype.getPage = async function (options: { cid: string }) {
        const cid = options?.cid;
        // without the extra simulated load time the hooks will fetch multiple pages in advance instead of just 1
        await simulateLoadingTime();
        await simulateLoadingTime();
        const page: any = {
          // @ts-ignore
          nextCid:
            this.community.address +
            " next page cid " +
            (getPageCalledTimes[this.community.address] + 1),
          comments: [],
        };
        const postCount = 100;
        let index = 0;
        // @ts-ignore
        let commentStartIndex = getPageCalledTimes[this.community.address] * postCount;
        while (index++ < postCount) {
          page.comments.push({
            timestamp: commentStartIndex + index,
            cid: cid + " comment cid " + (commentStartIndex + index),
            communityAddress: this.community.address,
          });
        }
        // @ts-ignore
        getPageCalledTimes[this.community.address]++;
        return page;
      };

      // get feed with 3 sub sorted by new page 1
      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        sortType: "new",
      });
      await waitFor(() => rendered.result.current.feed?.length >= postsPerPage);

      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.updatedFeed.length).toBe(rendered.result.current.feed.length);
      expect(rendered.result.current.feed[0].timestamp).toBe(100);
      expect(rendered.result.current.feed[1].timestamp).toBe(100);
      expect(rendered.result.current.feed[2].timestamp).toBe(100);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid new comment cid 100",
      );
      expect(rendered.result.current.feed[1].cid).toBe(
        "community address 2 page cid new comment cid 100",
      );
      expect(rendered.result.current.feed[2].cid).toBe(
        "community address 3 page cid new comment cid 100",
      );

      // at this point the buffered feed has gotten page 1 from all subs
      await waitFor(
        () =>
          getPageCalledTimes["community address 1"] === 1 &&
          getPageCalledTimes["community address 2"] === 1 &&
          getPageCalledTimes["community address 3"] === 1,
      );

      expect(getPageCalledTimes["community address 1"]).toBe(1);
      expect(getPageCalledTimes["community address 2"]).toBe(1);
      expect(getPageCalledTimes["community address 3"]).toBe(1);

      // get page 2, the first posts of page 2
      await scrollOnePage();
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].timestamp,
      ).toBe(92);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage + 1]
          .timestamp,
      ).toBe(92);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].cid,
      ).toBe("community address 2 page cid new comment cid 92");
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage + 1].cid,
      ).toBe("community address 3 page cid new comment cid 92");

      // scroll until the next buffered feed that needs to be refilled
      await scrollOnePage();
      await scrollOnePage();
      await scrollOnePage();
      await scrollOnePage();

      // at this point the buffered feed has gotten page 2 from all subs
      await waitFor(
        () =>
          getPageCalledTimes["community address 1"] === 2 &&
          getPageCalledTimes["community address 2"] === 2 &&
          getPageCalledTimes["community address 3"] === 2,
      );
      expect(getPageCalledTimes["community address 1"]).toBe(2);
      expect(getPageCalledTimes["community address 2"]).toBe(2);
      expect(getPageCalledTimes["community address 3"]).toBe(2);

      // get next page, the first posts should all be cids 200 from the buffered feed
      await scrollOnePage();
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].timestamp,
      ).toBe(200);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage + 1]
          .timestamp,
      ).toBe(200);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage + 2]
          .timestamp,
      ).toBe(200);
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage].cid,
      ).toBe("community address 1 next page cid 1 comment cid 200");
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage + 1].cid,
      ).toBe("community address 2 next page cid 1 comment cid 200");
      expect(
        rendered.result.current.feed[rendered.result.current.feed.length - postsPerPage + 2].cid,
      ).toBe("community address 3 next page cid 1 comment cid 200");

      // restore mock
      Pages.prototype.getPage = getPage;
    });

    test("get multiple communities with filter and scroll to multiple pages", async () => {
      // filter only comment cids that contain a '5'
      const cidMatch5 = (comment: Comment) => !!comment.cid.match("5");
      const filter = {
        filter: cidMatch5,
        key: "cid-match-5",
      };
      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        filter,
      });
      await waitFor(() => rendered.result.current.feed?.length >= postsPerPage);

      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.updatedFeed.length).toBe(rendered.result.current.feed.length);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 95",
      );
      expect(rendered.result.current.feed[1].cid).toBe(
        "community address 2 page cid hot comment cid 95",
      );
      expect(rendered.result.current.feed[2].cid).toBe(
        "community address 3 page cid hot comment cid 95",
      );

      // scroll until the next buffered feed that needs to be refilled
      await scrollOnePage();
      await scrollOnePage();
      await scrollOnePage();
      await scrollOnePage();

      expect(rendered.result.current.feed.length).toBe(postsPerPage * 5);
      for (const post of rendered.result.current.feed) {
        expect(filter.filter(post)).toBe(true);
      }

      // make sure adding a filter function with a different key creates a new feed
      expect(Object.keys(feedsStore.getState().feedsOptions).length).toBe(1);
      const filter2 = {
        filter: cidMatch5,
        key: "cid-match-5 (2)",
      };
      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        filter: filter2,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).length).toBe(2);

      // make sure adding a different filter with the same key doesnt create a new feed
      const filter3 = {
        filter: () => false,
        key: "cid-match-5",
      };
      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        filter: filter3,
      });
      expect(Object.keys(feedsStore.getState().feedsOptions).length).toBe(2);

      // still using the cached filter with key 'cid-match-5'
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 95",
      );
      expect(rendered.result.current.feed[1].cid).toBe(
        "community address 2 page cid hot comment cid 95",
      );
      expect(rendered.result.current.feed[2].cid).toBe(
        "community address 3 page cid hot comment cid 95",
      );
    });

    test("dynamic filter", async () => {
      const createCidMatchFilter = (cid: string) => ({
        filter: (comment: Comment) => !!comment?.cid?.match(cid),
        key: `cid-match-${cid}`,
      });

      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        filter: createCidMatchFilter("13"),
      });
      await waitFor(() => rendered.result.current.feed?.length > 0);
      expect(rendered.result.current.feed[0].cid).toMatch(/13$/);
      expect(rendered.result.current.feed[1].cid).toMatch(/13$/);
      expect(rendered.result.current.feed[2].cid).toMatch(/13$/);
      expect(Object.keys(feedsStore.getState().feedsOptions).length).toBe(1);

      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        filter: createCidMatchFilter("14"),
      });
      await waitFor(() => rendered.result.current.feed?.length > 0);
      expect(rendered.result.current.feed[0].cid).toMatch(/14$/);
      expect(rendered.result.current.feed[1].cid).toMatch(/14$/);
      expect(rendered.result.current.feed[2].cid).toMatch(/14$/);
      expect(Object.keys(feedsStore.getState().feedsOptions).length).toBe(2);
    });

    test("reset feed", async () => {
      rendered.rerender({ communityAddresses: ["community address 1"] });
      await waitFor(() => rendered.result.current.feed?.length === postsPerPage);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.updatedFeed.length).toBe(rendered.result.current.feed.length);
      await scrollOnePage();
      expect(rendered.result.current.feed.length).toBe(postsPerPage * 2);
      expect(rendered.result.current.updatedFeed.length).toBe(rendered.result.current.feed.length);

      await rendered.result.current.reset();
      await waitFor(() => rendered.result.current.feed?.length === postsPerPage);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.updatedFeed.length).toBe(rendered.result.current.feed.length);
    });

    test("get feed page 1 and 2 with multiple communities sorted by topAll", async () => {
      // use buffered feeds to be able to wait until the buffered feeds have updated before loading page 2
      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props);
        const { bufferedFeeds } = useBufferedFeeds({
          feedsOptions: [
            { communityAddresses: props?.communityAddresses, sortType: props?.sortType },
          ],
          accountName: props?.accountName,
        });
        return { ...feed, bufferedFeed: bufferedFeeds[0] };
      });

      // get feed with 1 sub
      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2", "community address 3"],
        sortType: "topAll",
      });
      // initial state
      expect(typeof rendered.result.current.hasMore).toBe("boolean");
      expect(typeof rendered.result.current.loadMore).toBe("function");

      // wait for feed array to render
      await waitFor(() => Array.isArray(rendered.result.current.feed));
      expect(rendered.result.current.feed).toEqual([]);

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid topAll comment cid 100",
      );
      expect(rendered.result.current.feed[1].cid).toBe(
        "community address 2 page cid topAll comment cid 100",
      );
      expect(rendered.result.current.feed[2].cid).toBe(
        "community address 3 page cid topAll comment cid 100",
      );
      expect(rendered.result.current.feed[0].upvoteCount).toBe(100);
      expect(rendered.result.current.feed[1].upvoteCount).toBe(100);
      expect(rendered.result.current.feed[2].upvoteCount).toBe(100);

      // wait until buffered feeds have sub 2 and 3 loaded
      let bufferedFeedString;
      await waitFor(() => {
        bufferedFeedString = JSON.stringify(rendered.result.current.bufferedFeed);
        return Boolean(
          bufferedFeedString.match("community address 2") &&
          bufferedFeedString.match("community address 3"),
        );
      });

      expect(bufferedFeedString).toMatch("community address 2");
      expect(bufferedFeedString).toMatch("community address 3");

      // the second page first posts should be sub 2 and 3 with the highest upvotes
      await scrollOnePage();
      expect(rendered.result.current.feed[postsPerPage].cid).toMatch(
        /community address (2|3) page cid topAll comment cid 92/,
      );
      expect(rendered.result.current.feed[postsPerPage + 1].cid).toMatch(
        /community address (2|3) page cid topAll comment cid 92/,
      );
      expect(rendered.result.current.feed[postsPerPage].upvoteCount).toBeGreaterThan(91);
      expect(rendered.result.current.feed[postsPerPage + 1].upvoteCount).toBeGreaterThan(91);
    });

    test("useBufferedFeeds with no options returns empty (branches 173, 180)", async () => {
      const rendered = renderHook<any, any>(() => useBufferedFeeds());
      await act(async () => {});
      expect(rendered.result.current.bufferedFeeds).toEqual([]);
    });

    test("useBufferedFeeds addFeedToStore error is caught", async () => {
      const originalAddFeedToStore = feedsStore.getState().addFeedToStore;
      const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        feedsStore.setState((state: any) => ({
          ...state,
          addFeedToStore: async () => {
            throw Error("useBufferedFeeds addFeedToStore test error");
          },
        }));

        const rendered = renderHook<any, any>(() =>
          useBufferedFeeds({
            feedsOptions: [{ communityAddresses: ["community address 1"], sortType: "new" }],
          }),
        );
        await new Promise((r) => setTimeout(r, 150));

        expect(rendered.result.current.bufferedFeeds).toEqual([[]]);
        expect(logSpy).toHaveBeenCalled();
      } finally {
        feedsStore.setState((state: any) => ({
          ...state,
          addFeedToStore: originalAddFeedToStore,
        }));
        logSpy.mockRestore();
      }
    });

    test(`useBufferedFeeds can fetch multiple subs in the background before delivering the first page`, async () => {
      const rendered = renderHook<any, any>(() =>
        useBufferedFeeds({
          feedsOptions: [
            {
              communityAddresses: [
                "community address 1",
                "community address 2",
                "community address 3",
              ],
              sortType: "new",
            },
            {
              communityAddresses: [
                "community address 4",
                "community address 5",
                "community address 6",
              ],
              sortType: "topAll",
            },
            {
              communityAddresses: [
                "community address 7",
                "community address 8",
                "community address 9",
              ],
            },
          ],
        }),
      );

      // should get empty arrays after first render
      expect(rendered.result.current.bufferedFeeds).toEqual([[], [], []]);

      // should eventually buffer posts for all feeds
      await waitFor(
        () =>
          rendered.result.current.bufferedFeeds[0].length > 299 &&
          rendered.result.current.bufferedFeeds[1].length > 299 &&
          rendered.result.current.bufferedFeeds[2].length > 299,
      );

      expect(rendered.result.current.bufferedFeeds[0].length).toBeGreaterThan(299);
      expect(rendered.result.current.bufferedFeeds[1].length).toBeGreaterThan(299);
      expect(rendered.result.current.bufferedFeeds[2].length).toBeGreaterThan(299);
    });

    test("get feed using a different account", async () => {
      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props);
        const { createAccount } = accountsActions;
        return { ...feed, createAccount };
      });

      // wait for createAccount to render
      await waitFor(() => typeof rendered.result.current.createAccount === "function");
      expect(typeof rendered.result.current.createAccount).toBe("function");

      // create account
      await act(async () => {
        await rendered.result.current.createAccount("custom name");
      });

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "new",
        accountName: "custom name",
      });
      expect(typeof rendered.result.current.hasMore).toBe("boolean");
      expect(typeof rendered.result.current.loadMore).toBe("function");

      // wait for feed array to render
      await waitFor(() => Array.isArray(rendered.result.current.feed));
      expect(rendered.result.current.feed).toEqual([]);

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(typeof rendered.result.current.feed[0].cid).toBe("string");
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
    });

    test("get feed and change active account", async () => {
      const newActiveAccountName = "new active account";
      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props || { communityAddresses: [] });
        const account = useAccount();
        const [bufferedFeed] = useBufferedFeeds(
          props
            ? { feedsOptions: [props], accountName: newActiveAccountName }
            : { feedsOptions: [] },
        ).bufferedFeeds;
        return { ...feed, ...accountsActions, account, bufferedFeed };
      });
      rendered.rerender({ communityAddresses: ["community address 1"], sortType: "new" });

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(typeof rendered.result.current.feed[0].cid).toBe("string");
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // create account and set active account
      await act(async () => {
        await rendered.result.current.createAccount(newActiveAccountName);
        await rendered.result.current.setActiveAccount(newActiveAccountName);
      });

      // wait for account change
      await waitFor(() => rendered.result.current.account.name === newActiveAccountName);
      expect(rendered.result.current.account.name).toBe(newActiveAccountName);

      // wait for buffered feed of new active account to have some posts
      await waitFor(() => rendered.result.current.bufferedFeed.length > 0);
      expect(typeof rendered.result.current.bufferedFeed[0].cid).toBe("string");
      expect(rendered.result.current.bufferedFeed.length).toBeGreaterThan(postsPerPage);

      // TODO: the test below deosn't work and not sure why, need to investigate,
      // it will probably cause critical UI bug when switching accounts

      // wait for posts to be added, should get full first page
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(typeof rendered.result.current.feed[0].cid).toBe("string");
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
    });

    test(`fail to get feed sorted by sort type that doesn't exist`, async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        rendered.rerender({
          communityAddresses: ["community address 1", "community address 2", "community address 3"],
          sortType: `doesnt exist`,
        });
      }).toThrow(`useFeed sortType argument 'doesnt exist' invalid`);
      consoleSpy.mockRestore();

      // one of the buffered feed has a sort type that doesn't exist
      const consoleSpy2 = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        renderHook<any, any>(() =>
          useBufferedFeeds({
            feedsOptions: [
              {
                communityAddresses: [
                  "community address 1",
                  "community address 2",
                  "community address 3",
                ],
                sortType: "new",
              },
              {
                communityAddresses: [
                  "community address 4",
                  "community address 5",
                  "community address 6",
                ],
                sortType: `doesnt exist`,
              },
              {
                communityAddresses: [
                  "community address 7",
                  "community address 8",
                  "community address 9",
                ],
              },
            ],
          }),
        );
      }).toThrow(`useBufferedFeeds feedOptions.sortType argument 'doesnt exist' invalid`);
      consoleSpy2.mockRestore();
    });

    describe("getPage only has 1 page", () => {
      const getPage = Pages.prototype.getPage;

      beforeEach(() => {
        // mock getPage to only give 1 or 2 pages
        Pages.prototype.getPage = async function (options: { cid: string }) {
          const cid = options?.cid;
          // without the extra simulated load time the hooks will fetch multiple pages in advance instead of just 1
          await simulateLoadingTime();
          await simulateLoadingTime();
          const page: any = { nextCid: undefined, comments: [] };
          const postCount = 100;
          let index = 0;
          while (index++ < postCount) {
            page.comments.push({
              timestamp: index,
              cid: cid + " comment cid " + index,
              communityAddress: this.community.address,
            });
          }
          return page;
        };
      });

      afterEach(() => {
        Pages.prototype.getPage = getPage;
      });

      test(`1 community, scroll to end of feed, hasMore becomes false`, async () => {
        rendered.rerender({ communityAddresses: ["community address 1"], sortType: "new" });
        // hasMore should be true before the feed is loaded
        expect(rendered.result.current.hasMore).toBe(true);
        expect(typeof rendered.result.current.loadMore).toBe("function");

        // wait for feed array to render
        await waitFor(() => Array.isArray(rendered.result.current.feed));
        expect(rendered.result.current.feed).toEqual([]);
        // hasMore should be true before the feed is loaded
        expect(rendered.result.current.hasMore).toBe(true);

        await waitFor(() => rendered.result.current.feed.length > 0);

        // hasMore should be true because there are still buffered feeds
        expect(rendered.result.current.hasMore).toBe(true);
        expect(rendered.result.current.feed.length).toBe(postsPerPage);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );

        await scrollOnePage();
        // hasMore should be true because there are still buffered feeds
        expect(rendered.result.current.hasMore).toBe(true);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 2);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );

        await scrollOnePage();
        // hasMore should be true because there are still buffered feeds
        expect(rendered.result.current.hasMore).toBe(true);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 3);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );

        await scrollOnePage();
        // there are no bufferedFeed and pages left so hasMore should be false
        await waitFor(() => rendered.result.current.hasMore === false);
        expect(rendered.result.current.hasMore).toBe(false);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 4);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );
      });

      test(`multiple communities, scroll to end of feed, hasMore becomes false`, async () => {
        rendered.rerender({
          communityAddresses: ["community address 1", "community address 2", "community address 3"],
          sortType: "new",
        });
        // hasMore should be true before the feed is loaded
        expect(rendered.result.current.hasMore).toBe(true);
        expect(typeof rendered.result.current.loadMore).toBe("function");

        // wait for feed array to render
        await waitFor(() => Array.isArray(rendered.result.current.feed));

        expect(rendered.result.current.feed).toEqual([]);
        // hasMore should be true before the feed is loaded
        expect(rendered.result.current.hasMore).toBe(true);

        await waitFor(() => rendered.result.current.feed.length > 0);

        // hasMore should be true because there are still buffered feeds
        expect(rendered.result.current.hasMore).toBe(true);
        expect(rendered.result.current.feed.length).toBe(postsPerPage);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );

        await scrollOnePage();
        // hasMore should be true because there are still buffered feeds
        expect(rendered.result.current.hasMore).toBe(true);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 2);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );

        // scroll to end of all pages
        await scrollOnePage();
        await scrollOnePage();
        await scrollOnePage();
        await scrollOnePage();
        await scrollOnePage();
        await scrollOnePage();
        expect(rendered.result.current.hasMore).toBe(true);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 8);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );
        await scrollOnePage();
        await scrollOnePage();
        await scrollOnePage();
        await scrollOnePage();
        // there are no bufferedFeed and pages left so hasMore should be false
        expect(rendered.result.current.hasMore).toBe(false);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 12);
        expect(rendered.result.current.updatedFeed.length).toBe(
          rendered.result.current.feed.length,
        );
      });

      test(`don't increment page number if loaded feed hasn't increased yet`, async () => {
        rendered.rerender({ communityAddresses: ["community address 1"] });
        await waitFor(() => rendered.result.current.feed.length > 0);

        // increment page manually because loadMore can't work that fast
        const { incrementFeedPageNumber, feedsOptions } = feedsStore.getState();
        const feedName = Object.keys(feedsOptions)[0];

        expect(rendered.result.current.feed.length).toBe(postsPerPage);
        expect(typeof rendered.result.current.loadMore).toBe("function");
        await act(async () => {
          // should have an error here because we load a page before the previous one finishes loading
          // use a large loop to try to catch the error because depending on timing it doesn't always trigger
          await expect(async () => {
            let attempts = 10000;
            while (attempts--) {
              await simulateLoadingTime();
              incrementFeedPageNumber(feedName);
              incrementFeedPageNumber(feedName);
              incrementFeedPageNumber(feedName);
            }
          }).rejects.toThrow(
            "feedsActions.incrementFeedPageNumber cannot increment feed page number before current page has loaded",
          );
        });
      });
    });

    describe("getPage never gets called", () => {
      const getPage = Pages.prototype.getPage;

      beforeEach(() => {
        Pages.prototype.getPage = async function (options: { cid: string }) {
          const cid = options?.cid;
          // it can get called with a next cid to fetch the second page
          if (!cid.match("next")) {
            throw Error(
              `community.getPage() was called with argument '${cid}', should not get called at all on first page of sort type 'hot'`,
            );
          }
          return { nextCid: undefined, comments: [] };
        };
      });

      afterEach(() => {
        Pages.prototype.getPage = getPage;
      });

      test(`get feed sorted by hot, don't call community.getPage() because already included in IPNS record`, async () => {
        rendered.rerender({ communityAddresses: ["community address 1"], sortType: "hot" });
        await waitFor(() => rendered.result.current.feed?.length >= postsPerPage);
        expect(rendered.result.current.feed?.length).toBe(postsPerPage);
      });
    });

    test(`community updates while we are scrolling`, async () => {
      const update = Community.prototype.update;
      // mock the update method to be able to have access to the updating community instances
      const communities: any = [];
      Community.prototype.update = function () {
        communities.push(this);
        return update.bind(this)();
      };

      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props);
        const { bufferedFeeds } = useBufferedFeeds({
          feedsOptions: [
            { communityAddresses: props?.communityAddresses, sortType: props?.sortType },
          ],
          accountName: props?.accountName,
        });
        return { ...feed, bufferedFeed: bufferedFeeds[0] };
      });
      waitFor = testUtils.createWaitFor(rendered);

      // get feed with 1 sub
      rendered.rerender({ communityAddresses: ["community address 1"], sortType: "topAll" });
      await waitFor(() => rendered.result.current.feed.length > 0);

      // the first page of loaded and buffered feeds should have laoded
      expect(rendered.result.current.feed.length).toBe(postsPerPage);
      expect(rendered.result.current.bufferedFeed.length).toBeGreaterThan(postsPerPage);
      // at this point only one community should have updated a single time
      expect(communities.length).toBe(1);
      const [community] = communities;

      act(() => {
        // update the page cids and send a community update event and wait for buffered feeds to change
        communities[0].posts.pageCids = {
          hot: "updated page cid hot",
          topAll: "updated page cid topAll",
          new: "updated page cid new",
        };
        community.emit("update", community);
      });

      // wait for the buffered feed to empty (because of the update), then to refill with updated page
      // more testing in production will have to be done to figure out if emptying the buffered feed while waiting
      // for new posts causes problems.
      await waitFor(
        () =>
          rendered.result.current.bufferedFeed[0].cid === "updated page cid topAll comment cid 100",
      );
      expect(rendered.result.current.bufferedFeed[0].cid).toBe(
        "updated page cid topAll comment cid 100",
      );

      Community.prototype.update = update;
    });

    describe("getPage only gets called once per pageCid", () => {
      const getPage = Pages.prototype.getPage;

      beforeEach(() => {
        const usedPageCids: any = {};
        Pages.prototype.getPage = async function (options: { cid: string }) {
          const cid = options?.cid;
          if (usedPageCids[cid]) {
            throw Error(`community.getPage() already called with argument '${cid}'`);
          }
          usedPageCids[cid] = true;
          return getPage.bind(this)(options);
        };
      });

      afterEach(() => {
        Pages.prototype.getPage = getPage;
      });

      test(`store page pages in database`, async () => {
        rendered.rerender({ communityAddresses: ["community address 1"], sortType: "new" });
        await waitFor(() => rendered.result.current.feed?.length >= postsPerPage);

        expect(rendered.result.current.feed?.length).toBe(postsPerPage);

        // reset stores to force using the db
        await testUtils.resetStores();

        // render with a fresh empty store to test database persistance
        const rendered2 = renderHook<any, any>(() =>
          useFeed({ communityAddresses: ["community address 1"], sortType: "new" }),
        );
        await waitFor(() => rendered2.result.current.feed?.length >= postsPerPage);
        expect(rendered2.result.current.feed?.length).toBe(postsPerPage);
      });
    });

    test(`feed doesn't contain blocked addresses`, async () => {
      const expectFeedToHaveCommunityAddresses = (feed: any[], communityAddresses: string[]) => {
        for (const communityAddress of communityAddresses) {
          // feed posts are missing a communityAddress expected in `communityAddresses` argument
          const feedCommunityAddresses = feed.map((feedPost) => feedPost.communityAddress);
          expect(feedCommunityAddresses).toContain(communityAddress);
          // feed posts contain a communityAddress not expected in `communityAddresses` argument
          for (const feedPost of feed) {
            expect(communityAddresses).toContain(feedPost.communityAddress);
          }
        }
        return true;
      };
      const expectFeedToHaveAuthorAddresses = (feed: any[], authorAddress: string) => {
        const authorAddresses = feed.map((comment) => comment?.author?.address);
        expect(authorAddresses).toContain(authorAddress);
        return true;
      };
      const expectFeedNotToHaveAuthorAddresses = (feed: any[], authorAddress: string) => {
        const authorAddresses = feed.map((comment) => comment?.author?.address);
        expect(authorAddresses).not.toContain(authorAddress);
        return true;
      };

      const rendered = renderHook<any, any>((props: any) => {
        const [bufferedFeed] = useBufferedFeeds({
          feedsOptions: [{ communityAddresses: props?.communityAddresses, sortType: "new" }],
        }).bufferedFeeds;
        const { blockAddress, unblockAddress } = accountsActions;
        const account = useAccount();
        return { bufferedFeed, blockAddress, unblockAddress, account };
      });
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => typeof rendered.result.current.blockAddress === "function");

      const blockedCommunityAddress = "blocked.eth";
      const unblockedCommunityAddress = "unblocked-address.eth";
      const blockedAuthorAddress = `${blockedCommunityAddress} page cid new author address 1`;

      // render feed before blocking
      rendered.rerender({
        communityAddresses: [unblockedCommunityAddress, blockedCommunityAddress],
      });
      // wait until feed contains both blocked and unblocked addresses
      await waitFor(() => rendered.result.current.bufferedFeed.length > 0);
      expectFeedToHaveCommunityAddresses(rendered.result.current.bufferedFeed, [
        blockedCommunityAddress,
        unblockedCommunityAddress,
      ]);

      // block community address
      await act(async () => {
        await rendered.result.current.blockAddress(blockedCommunityAddress);
      });
      await waitFor(
        () =>
          Object.keys(rendered.result.current.account.blockedAddresses).length === 1 &&
          expectFeedToHaveCommunityAddresses(rendered.result.current.bufferedFeed, [
            unblockedCommunityAddress,
          ]),
      );
      expectFeedToHaveCommunityAddresses(rendered.result.current.bufferedFeed, [
        unblockedCommunityAddress,
      ]);

      // unblock community address
      await act(async () => {
        await rendered.result.current.unblockAddress(blockedCommunityAddress);
      });
      await waitFor(
        () =>
          Object.keys(rendered.result.current.account.blockedAddresses).length === 0 &&
          expectFeedToHaveCommunityAddresses(rendered.result.current.bufferedFeed, [
            blockedCommunityAddress,
            unblockedCommunityAddress,
          ]),
      );
      expectFeedToHaveCommunityAddresses(rendered.result.current.bufferedFeed, [
        blockedCommunityAddress,
        unblockedCommunityAddress,
      ]);

      // feed has blocked author address before blocking
      expectFeedToHaveAuthorAddresses(rendered.result.current.bufferedFeed, blockedAuthorAddress);

      // block author address
      await act(async () => {
        await rendered.result.current.blockAddress(blockedAuthorAddress);
      });
      await waitFor(
        () =>
          Object.keys(rendered.result.current.account.blockedAddresses).length === 1 &&
          expectFeedNotToHaveAuthorAddresses(
            rendered.result.current.bufferedFeed,
            blockedAuthorAddress,
          ),
      );
      // feed doesnt have blocked author address
      expect(rendered.result.current.account.blockedAddresses[blockedAuthorAddress]).toBe(true);
      expectFeedNotToHaveAuthorAddresses(
        rendered.result.current.bufferedFeed,
        blockedAuthorAddress,
      );
    });

    test(`feed doesn't contain blocked cids`, async () => {
      const expectFeedToHaveCid = (feed: any[], cid: string) => {
        const cids = feed.map((comment) => comment?.cid);
        expect(cids).toContain(cid);
        return true;
      };
      const expectFeedNotToHaveCid = (feed: any[], cid: string) => {
        const cids = feed.map((comment) => comment?.cid);
        expect(cids).not.toContain(cid);
        return true;
      };

      const rendered = renderHook<any, any>((props: any) => {
        const [bufferedFeed] = useBufferedFeeds({
          feedsOptions: [{ communityAddresses: props?.communityAddresses, sortType: "new" }],
        }).bufferedFeeds;
        const { blockCid, unblockCid } = accountsActions;
        const account = useAccount();
        return { bufferedFeed, blockCid, unblockCid, account };
      });
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => typeof rendered.result.current.blockCid === "function");

      // render feed before blocking
      rendered.rerender({ communityAddresses: ["community address 1"] });
      // wait until feed contains both blocked and unblocked addresses
      await waitFor(() => rendered.result.current.bufferedFeed.length > 0);
      const blockedCid = rendered.result.current.bufferedFeed[0].cid;
      expect(typeof blockedCid).toBe("string");
      expectFeedToHaveCid(rendered.result.current.bufferedFeed, blockedCid);

      // block cid
      await act(async () => {
        await rendered.result.current.blockCid(blockedCid);
      });
      await waitFor(
        () =>
          Object.keys(rendered.result.current.account.blockedCids).length === 1 &&
          expectFeedNotToHaveCid(rendered.result.current.bufferedFeed, blockedCid),
      );
      expect(Object.keys(rendered.result.current.account.blockedCids).length).toBe(1);
      expectFeedNotToHaveCid(rendered.result.current.bufferedFeed, blockedCid);

      // unblock cid
      await act(async () => {
        await rendered.result.current.unblockCid(blockedCid);
      });

      // NOTE: feeds won't update on cid unblock events, another event must cause the feed to update
      // it seems preferable to causing unnecessary rerenders every time an unused block event occurs

      // cause another feed update to fix the edge case
      rendered.rerender({ communityAddresses: ["community address 1", "community address 2"] });

      await waitFor(
        () =>
          Object.keys(rendered.result.current.account.blockedCids).length === 0 &&
          expectFeedToHaveCid(rendered.result.current.bufferedFeed, blockedCid),
      );
      expect(Object.keys(rendered.result.current.account.blockedCids).length).toBe(0);
      expectFeedToHaveCid(rendered.result.current.bufferedFeed, blockedCid);
    });

    test(`empty community.posts hasMore is false`, async () => {
      const update = Community.prototype.update;
      const updatedAt = Math.floor(Date.now() / 1000);
      const emptyPosts: any = { pages: {}, pageCids: {} };
      Community.prototype.update = async function () {
        await simulateLoadingTime();
        this.updatedAt = updatedAt;
        this.posts = emptyPosts;
        this.emit("update", this);
      };

      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props);
        const community = useCommunity({ communityAddress: props?.communityAddresses?.[0] });
        return { feed, community };
      });
      waitFor = testUtils.createWaitFor(rendered);

      // get feed with 1 sub with no posts
      rendered.rerender({ communityAddresses: ["community address 1"] });
      expect(rendered.result.current.feed.hasMore).toBe(true);

      await waitFor(() => rendered.result.current.feed.hasMore === false);
      expect(rendered.result.current.feed.hasMore).toBe(false);
      expect(rendered.result.current.feed.feed.length).toBe(0);

      Community.prototype.update = update;
    });

    test("posts.pages has 1 post with no next cid, hasMore false", async () => {
      const update = Community.prototype.update;
      const updatedAt = Math.floor(Date.now() / 1000);
      const postsWithNoNextCid: any = {
        pages: {
          hot: {
            comments: [
              {
                timestamp: 1,
                cid: "comment cid 1",
                communityAddress: "community address 1",
                updatedAt: 1,
                upvoteCount: 1,
              },
            ],
          },
        },
        pageCids: {},
      };
      Community.prototype.update = async function () {
        await simulateLoadingTime();
        this.updatedAt = updatedAt;
        this.posts = postsWithNoNextCid;
        this.emit("update", this);
      };

      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props);
        return { feed };
      });
      waitFor = testUtils.createWaitFor(rendered);

      // get feed with 1 sub with no posts
      rendered.rerender({ communityAddresses: ["community address 1"] });
      expect(rendered.result.current.feed.hasMore).toBe(true);
      expect(rendered.result.current.feed.feed.length).toBe(0);

      await waitFor(() => rendered.result.current.feed.hasMore === false);
      expect(rendered.result.current.feed.hasMore).toBe(false);
      expect(rendered.result.current.feed.feed.length).toBe(1);

      Community.prototype.update = update;
    });

    test(`communityAddressesWithNewerPosts and reset`, async () => {
      const update = Community.prototype.update;
      // mock the update method to be able to have access to the updating community instances
      const communities: any = [];
      Community.prototype.update = function () {
        communities.push(this);
        return update.bind(this)();
      };

      rendered = renderHook<any, any>((props: any) => {
        const feed = useFeed(props);
        const { bufferedFeeds } = useBufferedFeeds({
          feedsOptions: [
            { communityAddresses: props?.communityAddresses, sortType: props?.sortType },
          ],
          accountName: props?.accountName,
        });
        return { ...feed, bufferedFeed: bufferedFeeds[0] };
      });
      waitFor = testUtils.createWaitFor(rendered);

      // get feed with 1 sub
      rendered.rerender({
        communityAddresses: ["community address 1", "community address 2"],
        sortType: "new",
      });
      await waitFor(() => rendered.result.current.feed.length > 0);
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(() => rendered.result.current.feed.length > postsPerPage);

      // the first page of loaded and buffered feeds should have laoded
      expect(rendered.result.current.feed.length).toBe(postsPerPage * 2);
      expect(rendered.result.current.bufferedFeed.length).toBeGreaterThan(postsPerPage * 2);
      expect(rendered.result.current.communityAddressesWithNewerPosts).toEqual([]);
      expect(communities.length).toBe(2);

      act(() => {
        // update the subs
        communities[0].posts.pageCids = {
          new: "updated page cid new",
        };
        communities[0].emit("update", communities[0]);
        communities[1].posts.pageCids = {
          new: "updated page cid new",
        };
        communities[1].emit("update", communities[1]);
      });

      await waitFor(() => rendered.result.current.communityAddressesWithNewerPosts.length === 2);
      expect(rendered.result.current.communityAddressesWithNewerPosts).toEqual([
        "community address 1",
        "community address 2",
      ]);

      await act(async () => {
        await rendered.result.current.reset();
      });

      await waitFor(() => rendered.result.current.communityAddressesWithNewerPosts.length === 0);
      expect(rendered.result.current.bufferedFeed.length).toBeGreaterThan(postsPerPage);
      expect(rendered.result.current.communityAddressesWithNewerPosts).toEqual([]);

      Community.prototype.update = update;
    });

    test("updated feeds is updated, loaded feeds is not", async () => {
      const page1 = {
        comments: [
          {
            timestamp: 1,
            cid: "comment cid 1",
            communityAddress: "community address 1",
            updatedAt: 1,
            upvoteCount: 1,
          },
        ],
      };
      // updatedAt didn't change, shouldn't update
      const page2 = {
        comments: [
          {
            timestamp: 1,
            cid: "comment cid 1",
            communityAddress: "community address 1",
            updatedAt: 1,
            upvoteCount: 2,
          },
        ],
      };
      const page3 = {
        comments: [
          {
            timestamp: 1,
            cid: "comment cid 1",
            communityAddress: "community address 1",
            updatedAt: 2,
            upvoteCount: 2,
          },
        ],
      };
      const page4 = {
        comments: [
          {
            timestamp: 100,
            cid: "comment cid 2",
            communityAddress: "community address 1",
            updatedAt: 100,
            upvoteCount: 100,
          },
          {
            timestamp: 1,
            cid: "comment cid 1",
            communityAddress: "community address 1",
            updatedAt: 3,
            upvoteCount: 3,
          },
        ],
      };
      const pages = [page1, page2, page3, page4];

      const simulateUpdateEvent = Community.prototype.simulateUpdateEvent;
      let community;
      Community.prototype.simulateUpdateEvent = async function () {
        community = this;
        this.posts.pages = { hot: pages.shift() };
        this.posts.pageCids = {};
        this.updatedAt = this.updatedAt ? this.updatedAt + 1 : 1;
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("updatingstatechange", "succeeded");
      };

      const communityAddresses = ["community address 1"];
      rendered.rerender({ communityAddresses });

      // first community update
      await waitFor(() => rendered.result.current.feed.length === 1);
      expect(pages.length).toBe(3);
      expect(rendered.result.current.feed.length).toBe(1);
      expect(rendered.result.current.updatedFeed.length).toBe(1);
      expect(rendered.result.current.feed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.updatedFeed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.feed[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedFeed[0].updatedAt).toBe(1);
      expect(rendered.result.current.feed[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedFeed[0].upvoteCount).toBe(1);
      expect(rendered.result.current.hasMore).toBe(false);

      // second community update (updatedAt doesn't change, so shouldn't update)
      community.simulateUpdateEvent();
      await waitFor(
        () =>
          communitiesStore.getState().communities["community address 1"].posts.pages.hot.comments[0]
            .upvoteCount === 2,
      );
      expect(pages.length).toBe(2);
      // community in store updated, but the updatedAt didn't change so no change in useFeed().updatedFeed
      expect(
        communitiesStore.getState().communities["community address 1"].posts.pages.hot.comments[0]
          .updatedAt,
      ).toBe(1);
      expect(
        communitiesStore.getState().communities["community address 1"].posts.pages.hot.comments[0]
          .upvoteCount,
      ).toBe(2);
      expect(rendered.result.current.feed.length).toBe(1);
      expect(rendered.result.current.updatedFeed.length).toBe(1);
      expect(rendered.result.current.feed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.updatedFeed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.feed[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedFeed[0].updatedAt).toBe(1);
      expect(rendered.result.current.feed[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedFeed[0].upvoteCount).toBe(1);
      expect(rendered.result.current.hasMore).toBe(false);

      // third community update (updatedAt doesn't change, so shouldn't update)
      community.simulateUpdateEvent();
      await waitFor(() => rendered.result.current.updatedFeed[0].updatedAt === 2);
      expect(pages.length).toBe(1);
      expect(rendered.result.current.feed.length).toBe(1);
      expect(rendered.result.current.updatedFeed.length).toBe(1);
      expect(rendered.result.current.feed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.updatedFeed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.feed[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedFeed[0].updatedAt).toBe(2);
      expect(rendered.result.current.feed[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedFeed[0].upvoteCount).toBe(2);
      expect(rendered.result.current.hasMore).toBe(false);

      // fourth community update
      community.simulateUpdateEvent();
      await waitFor(() => rendered.result.current.updatedFeed[0].updatedAt === 3);
      expect(pages.length).toBe(0);
      expect(rendered.result.current.feed.length).toBe(2);
      expect(rendered.result.current.updatedFeed.length).toBe(2);
      expect(rendered.result.current.feed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.updatedFeed[0].cid).toBe("comment cid 1");
      expect(rendered.result.current.feed[0].updatedAt).toBe(1);
      expect(rendered.result.current.updatedFeed[0].updatedAt).toBe(3);
      expect(rendered.result.current.feed[0].upvoteCount).toBe(1);
      expect(rendered.result.current.updatedFeed[0].upvoteCount).toBe(3);
      expect(rendered.result.current.hasMore).toBe(false);
      expect(rendered.result.current.feed[1].cid).toBe("comment cid 2");
      expect(rendered.result.current.updatedFeed[1].cid).toBe("comment cid 2");

      Community.prototype.simulateUpdateEvent = simulateUpdateEvent;
    });

    test("no pageCids, no page.nextCid, use any preloaded page sort", async () => {
      const update = Community.prototype.update;
      Community.prototype.update = async function () {
        this.updatedAt = Math.floor(Date.now() / 1000);
        const hotPageCid = this.address + " page cid hot";
        this.posts.pages.hot = this.posts.pageToGet(hotPageCid);
        delete this.posts.pages.hot.nextCid;
        this.posts.pageCids = {};
        this.state = "updating";
        this.updatingState = "succeeded";
        this.emit("update", this);
        this.emit("statechange", "updating");
        this.emit("updatingstatechange", "succeeded");
      };

      rendered.rerender({ communityAddresses: ["community address 1"], sortType: "new" });
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 100",
      );
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      rendered.rerender({
        communityAddresses: ["community address 1"],
        sortType: "controversialAll",
      });
      await waitFor(() => rendered.result.current.feed.length > 0);
      expect(rendered.result.current.feed[0].cid).toBe(
        "community address 1 page cid hot comment cid 9",
      );
      expect(rendered.result.current.feed.length).toBe(postsPerPage);

      // restore mock
      Community.prototype.update = update;
    });

    describe("accountComments", () => {
      const sortType = "hot";
      const communityAddress = "community address 1";
      const communityAddresses = [communityAddress];
      const accountPostCid1 = "account post cid 1";
      const authorAddress = "accountcomments.eth";
      const author = { address: authorAddress };

      const addMockAccountCommentsToStore = () => {
        // add account comments, sorted by oldest
        const now = Math.round(Date.now() / 1000);
        const yearAgo = now - 60 * 60 * 24 * 365;
        accountsStore.setState((state) => {
          const accountId = Object.keys(state.accountsComments)[0];
          return {
            accountsComments: {
              [accountId]: [
                {
                  // no cid, no updatedAt, is pending
                  timestamp: yearAgo - 2, // very old reply
                  communityAddress,
                  // depth: 0, test no depth
                  index: 0,
                  author,
                },
                {
                  // no cid, no updatedAt, is pending
                  timestamp: yearAgo - 1, // very old reply
                  communityAddress: "wrong community address",
                  depth: 0,
                  index: 1,
                  author,
                },
                {
                  // no cid, no updatedAt, is pending
                  timestamp: yearAgo, // very old reply
                  communityAddress,
                  // is reply, should not appear in feed
                  parentCid: accountPostCid1,
                  postCid: accountPostCid1,
                  depth: 1,
                  index: 2,
                  author,
                },
                {
                  timestamp: now - 2,
                  communityAddress,
                  cid: accountPostCid1, // cid received, not pending, but not published by sub owner yet
                  updatedAt: now,
                  depth: 0,
                  index: 3,
                  author,
                },
                {
                  timestamp: now - 1,
                  communityAddress: "wrong community address",
                  cid: "account post cid 2", // cid received, not pending, but not published by sub owner yet
                  updatedAt: now,
                  depth: 0,
                  index: 4,
                  author,
                },
                {
                  timestamp: now,
                  communityAddress,
                  cid: "account reply cid 1", // cid received, not pending, but not published by sub owner yet
                  parentCid: accountPostCid1,
                  postCid: accountPostCid1,
                  updatedAt: now,
                  depth: 1,
                  index: 5,
                  author,
                },
              ],
            },
          };
        });
      };

      afterEach(async () => {
        await testUtils.resetDatabasesAndStores();
      });

      test("prepend changes to append and publish", async () => {
        // default (prepend) + newerThan Infinity
        rendered.rerender({
          communityAddresses,
          sortType,
          accountComments: { newerThan: Infinity },
        });

        await waitFor(() => rendered.result.current.feed.length > 0);
        expect(rendered.result.current.feed.length).toBe(postsPerPage);

        addMockAccountCommentsToStore();
        await waitFor(() => rendered.result.current.feed[0].cid === accountPostCid1);

        // has account comments prepended first
        expect(rendered.result.current.feed.length).toBe(postsPerPage + 2);
        expect(rendered.result.current.feed[0].cid).toBe(accountPostCid1);
        expect(rendered.result.current.feed[0].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[0].communityAddress).toBe(communityAddress);
        expect(rendered.result.current.feed[1].cid).toBe(undefined);
        expect(rendered.result.current.feed[1].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[1].communityAddress).toBe(communityAddress);
        expect(rendered.result.current.feed[2].cid).not.toBe(undefined);
        expect(rendered.result.current.feed[2].author.address).not.toBe(authorAddress);
        expect(rendered.result.current.feed[2].communityAddress).toBe(communityAddress);
        // prepend order should be newest first
        expect(rendered.result.current.feed[0].timestamp).toBeGreaterThan(
          rendered.result.current.feed[1].timestamp,
        );

        // newerThan 1h
        rendered.rerender({
          communityAddresses,
          sortType,
          accountComments: { newerThan: 60 * 60 },
        });
        await waitFor(() => rendered.result.current.feed[1].cid);

        // has account comments prepended first
        expect(rendered.result.current.feed.length).toBe(postsPerPage + 1);
        expect(rendered.result.current.feed[0].cid).toBe(accountPostCid1);
        expect(rendered.result.current.feed[0].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[0].communityAddress).toBe(communityAddress);
        expect(rendered.result.current.feed[1].cid).not.toBe(undefined);
        expect(rendered.result.current.feed[1].author.address).not.toBe(authorAddress);
        expect(rendered.result.current.feed[1].communityAddress).toBe(communityAddress);

        // append + newerThan Infinity
        rendered.rerender({
          communityAddresses,
          sortType,
          accountComments: { append: true, newerThan: Infinity },
        });

        await waitFor(() => rendered.result.current.feed.length > 0);
        expect(rendered.result.current.feed.length).toBe(postsPerPage + 2);

        // has account comments appended last
        expect(rendered.result.current.feed[rendered.result.current.feed.length - 1].cid).toBe(
          accountPostCid1,
        );
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 1].author.address,
        ).toBe(authorAddress);
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 1].communityAddress,
        ).toBe(communityAddress);
        expect(rendered.result.current.feed[rendered.result.current.feed.length - 2].cid).toBe(
          undefined,
        );
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 2].author.address,
        ).toBe(authorAddress);
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 2].communityAddress,
        ).toBe(communityAddress);
        expect(rendered.result.current.feed[rendered.result.current.feed.length - 3].cid).not.toBe(
          undefined,
        );
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 3].author.address,
        ).not.toBe(authorAddress);
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 3].communityAddress,
        ).toBe(communityAddress);

        // append: true order should be newest last
        expect(
          rendered.result.current.feed[rendered.result.current.feed.length - 1].timestamp,
        ).toBeGreaterThan(
          rendered.result.current.feed[rendered.result.current.feed.length - 2].timestamp,
        );

        // publishing a post automatically adds to feed
        await act(async () => {
          await accountsActions.publishComment({
            communityAddress,
            content: "added to feed",
            onChallenge: () => {},
            onChallengeVerification: () => {},
          });
        });
        await waitFor(
          () =>
            rendered.result.current.feed[rendered.result.current.feed.length - 1].content ===
            "added to feed",
        );
        expect(rendered.result.current.feed[rendered.result.current.feed.length - 1].content).toBe(
          "added to feed",
        );
        expect(rendered.result.current.feed.length).toBe(postsPerPage + 3);
      });

      test("scroll pages and publish", async () => {
        const postsPerPage = 1;
        const scrollOnePage = async () => {
          const nextFeedLength = (rendered.result.current.feed?.length || 0) + postsPerPage;
          await act(async () => {
            await rendered.result.current.loadMore();
          });
          try {
            await waitFor(() => rendered.result.current.feed?.length >= nextFeedLength);
          } catch (e) {}
        };

        rendered.rerender({
          communityAddresses,
          sortType,
          postsPerPage,
          accountComments: { newerThan: Infinity },
        });
        addMockAccountCommentsToStore();
        await waitFor(() => rendered.result.current.feed.length === 3);

        expect(rendered.result.current.feed.length).toBe(3);
        expect(rendered.result.current.feed[0].cid).toBe(accountPostCid1);
        expect(rendered.result.current.feed[0].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[1].cid).toBe(undefined);
        expect(rendered.result.current.feed[1].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[2].cid).not.toBe(undefined);
        expect(rendered.result.current.feed[2].author.address).not.toBe(authorAddress);
        expect(rendered.result.current.hasMore).toBe(true);

        const content = "published content";
        await act(async () => {
          await accountsActions.publishComment({
            communityAddress,
            content,
            onChallenge: () => {},
            onChallengeVerification: () => {},
          });
        });
        await waitFor(() => rendered.result.current.feed[0].content === content);

        expect(rendered.result.current.feed.length).toBe(4);
        expect(rendered.result.current.feed[0].content).toBe(content);
        expect(rendered.result.current.feed[1].cid).toBe(accountPostCid1);
        expect(rendered.result.current.feed[1].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[2].cid).toBe(undefined);
        expect(rendered.result.current.feed[2].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[3].cid).not.toBe(undefined);
        expect(rendered.result.current.feed[3].author.address).not.toBe(authorAddress);
        expect(rendered.result.current.hasMore).toBe(true);

        await scrollOnePage();
        await waitFor(() => rendered.result.current.feed.length > 4);

        expect(rendered.result.current.feed.length).toBe(5);
        expect(rendered.result.current.feed[0].content).toBe(content);
        expect(rendered.result.current.feed[1].cid).toBe(accountPostCid1);
        expect(rendered.result.current.feed[1].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[2].cid).toBe(undefined);
        expect(rendered.result.current.feed[2].author.address).toBe(authorAddress);
        expect(rendered.result.current.feed[3].cid).not.toBe(undefined);
        expect(rendered.result.current.feed[3].author.address).not.toBe(authorAddress);
        expect(rendered.result.current.feed[4].cid).not.toBe(undefined);
        expect(rendered.result.current.feed[4].author.address).not.toBe(authorAddress);
        expect(rendered.result.current.hasMore).toBe(true);
      });

      test("deleted local account post/reindex disappears from feed accountComments injection immediately", async () => {
        rendered.rerender({
          communityAddresses,
          sortType,
          accountComments: { newerThan: Infinity },
        });

        await waitFor(() => rendered.result.current.feed.length > 0);
        expect(rendered.result.current.feed.length).toBe(postsPerPage);

        addMockAccountCommentsToStore();
        await waitFor(() => rendered.result.current.feed[0].cid === accountPostCid1);

        expect(rendered.result.current.feed.length).toBe(postsPerPage + 2);
        expect(rendered.result.current.feed[0].cid).toBe(accountPostCid1);

        await act(async () => {
          const { accountsComments, activeAccountId, accounts } = accountsStore.getState();
          const accountId = accounts[activeAccountId].id;
          const accountCommentsList = accountsComments[accountId] || [];
          const spliced = [...accountCommentsList];
          spliced.splice(3, 1);
          const reindexed = spliced.map((c, i) => ({ ...c, index: i, accountId }));
          accountsStore.setState({
            accountsComments: { ...accountsComments, [accountId]: reindexed },
            commentCidsToAccountsComments: getCommentCidsToAccountsComments({
              ...accountsComments,
              [accountId]: reindexed,
            }),
          });
        });

        await waitFor(
          () =>
            rendered.result.current.feed.length === postsPerPage + 1 &&
            rendered.result.current.feed[0].cid !== accountPostCid1,
        );
        expect(rendered.result.current.feed.some((p: Comment) => p.cid === accountPostCid1)).toBe(
          false,
        );
      });
    });

    describe("modQueue", () => {
      afterEach(async () => {
        await testUtils.resetDatabasesAndStores();
      });

      test("modQueue pendingApproval", async () => {
        const communityAddresses = [
          "community address 1",
          "community address 2",
          "community address 3",
        ];
        rendered.rerender({ communityAddresses, modQueue: ["pendingApproval"] });

        await waitFor(() => rendered.result.current.feed.length > 0);
        expect(rendered.result.current.feed.length).toBe(postsPerPage);
        expect(rendered.result.current.feed[0].cid).toMatch("pendingApproval");

        await scrollOnePage();
        await waitFor(() => rendered.result.current.feed.length == postsPerPage * 2);
        expect(rendered.result.current.feed.length).toBe(postsPerPage * 2);
      });

      test("modQueue drops approved posts after the page stops returning them", async () => {
        const communityAddresses = ["community address 1"];
        rendered.rerender({ communityAddresses, modQueue: ["pendingApproval"] });

        await waitFor(() => rendered.result.current.feed.length > 0);
        const removedCid = rendered.result.current.feed[0].cid;
        const pageCid = Object.keys(communitiesPagesStore.getState().communitiesPages).find((cid) =>
          cid.includes("pendingApproval"),
        );
        expect(pageCid).toBeDefined();

        await act(async () => {
          communitiesPagesStore.setState((state: any) => {
            const page = state.communitiesPages[pageCid as string];
            return {
              ...state,
              communitiesPages: {
                ...state.communitiesPages,
                [pageCid as string]: {
                  ...page,
                  comments: page.comments.filter((comment: Comment) => comment.cid !== removedCid),
                },
              },
            };
          });
        });

        await waitFor(
          () =>
            rendered.result.current.feed.length === postsPerPage &&
            rendered.result.current.feed.every((comment: Comment) => comment.cid !== removedCid),
        );
        expect(
          rendered.result.current.feed.some((comment: Comment) => comment.cid === removedCid),
        ).toBe(false);
      });

      test("modQueue drops posts that stay on the page but lose pendingApproval", async () => {
        const communityAddresses = ["community address 1"];
        rendered.rerender({ communityAddresses, modQueue: ["pendingApproval"] });

        await waitFor(() => rendered.result.current.feed.length > 0);
        const removedCid = rendered.result.current.feed[0].cid;
        const pageCid = Object.keys(communitiesPagesStore.getState().communitiesPages).find((cid) =>
          cid.includes("pendingApproval"),
        );
        expect(pageCid).toBeDefined();

        await act(async () => {
          communitiesPagesStore.setState((state: any) => {
            const page = state.communitiesPages[pageCid as string];
            const nextComments = page.comments.map((comment: Comment) =>
              comment.cid === removedCid ? { ...comment, pendingApproval: undefined } : comment,
            );
            return {
              ...state,
              comments: {
                ...state.comments,
                [removedCid]: {
                  ...state.comments[removedCid],
                  pendingApproval: undefined,
                },
              },
              communitiesPages: {
                ...state.communitiesPages,
                [pageCid as string]: {
                  ...page,
                  comments: nextComments,
                },
              },
            };
          });
        });

        await waitFor(
          () =>
            rendered.result.current.feed.length === postsPerPage &&
            rendered.result.current.feed.every((comment: Comment) => comment.cid !== removedCid),
        );
        expect(
          rendered.result.current.feed.some((comment: Comment) => comment.cid === removedCid),
        ).toBe(false);
      });

      test("modQueue reset refreshes the latest community snapshot before rebuilding", async () => {
        const getCommunity = Plebbit.prototype.getCommunity;
        let hidePendingApprovalPage = false;

        Plebbit.prototype.getCommunity = async function (options: { address: string }) {
          const community = await getCommunity.call(this, options);
          if (hidePendingApprovalPage) {
            community.modQueue.pageCids = {};
          }
          return community;
        };

        try {
          rendered.rerender({
            communityAddresses: ["community address 1"],
            modQueue: ["pendingApproval"],
          });

          await waitFor(() => rendered.result.current.feed.length > 0);
          await scrollOnePage();
          await waitFor(() => rendered.result.current.feed.length === postsPerPage * 2);

          hidePendingApprovalPage = true;

          await act(async () => {
            await rendered.result.current.reset();
          });

          await waitFor(
            () =>
              !communitiesStore.getState().communities["community address 1"]?.modQueue?.pageCids
                ?.pendingApproval,
          );
          await waitFor(() => rendered.result.current.feed.length === 0);
          expect(rendered.result.current.feed).toEqual([]);
        } finally {
          Plebbit.prototype.getCommunity = getCommunity;
        }
      });

      // TODO: test modQueue page state
    });

    // TODO: not implemented
    // at the moment a comment already inside a loaded feed will ignore all updates from future pages
    // test.todo(`if an updated community page gives a comment already in a loaded feed, replace it with the newest version with updated votes/replies`)

    // TODO: not implemented
    // test.todo(`don't let a malicious sub owner display older posts in top hour/day/week/month/year`)

    // already implemented but no tests for it because difficult to test
    // test.todo(`communities finish loading with 0 posts, hasMore becomes false, but only after finished loading`)
  });
});
