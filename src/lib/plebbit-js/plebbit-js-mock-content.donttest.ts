// this file is not part of the tests
// only use it to log the content mock and see if the outputs make sense
// use `jest --testRegex plebbit-js-mock-content.donttest.ts` to run

const timeout = 4000;

// process.env.REACT_APP_PLEBBIT_REACT_HOOKS_NO_CACHE = '1'
// process.env.REACT_APP_PLEBBIT_REACT_HOOKS_MOCK_CONTENT_DOUBLE_MEDIA = '1'
process.env.REACT_APP_PLEBBIT_REACT_HOOKS_MOCK_CONTENT = "1";
process.env.REACT_APP_PLEBBIT_REACT_HOOKS_MOCK_CONTENT_LOADING_TIME = "100";

import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useComment,
  useCommunity,
  useFeed,
  useAccountCommunities,
  useAccount,
  useReplies,
  setPlebbitJs,
} from "../../index";
import * as accountsActions from "../../stores/accounts/accounts-actions";
import PlebbitJsMockContent, { getImageUrl, SeedIncrementer } from "./plebbit-js-mock-content";

describe.skip("PlebbitJsMockContent", () => {
  test.skip(
    "SeedIncrementer",
    async () => {
      while (true) {
        const seed = Number(String(Math.random()).replace("0.", "").substring(0, 8));
        const seedIncrementer = SeedIncrementer(seed);
        let count = 11;
        while (count--) {
          seedIncrementer.increment();
        }
        const incremented = seedIncrementer.increment();
        console.log(seed, incremented, incremented % 12);
      }
    },
    { timeout },
  );

  test(
    "comment updates",
    async () => {
      const plebbit = await PlebbitJsMockContent();
      let count = 10;
      const cid = "UYdJj598pR4VKi3yoKP4oR4UQAyyQBQWfCtL6fLegCFP8";
      const comment: any = await plebbit.createComment({ cid });
      comment.update();
      await new Promise((r) =>
        comment.on("update", () => {
          console.log(comment.replies?.pages?.topAll?.comments);
          if (!count--) {
            comment.removeAllListeners();
            r(undefined);
          }
        }),
      );
    },
    { timeout },
  );

  test.skip(
    "new page",
    async () => {
      const plebbit = await PlebbitJsMockContent();
      const address = "news.eth";
      const community: any = await plebbit.createCommunity({ address });
      console.log(community);
      community.update().catch(console.error);
      await new Promise((r) =>
        community.on("update", async () => {
          console.log(community);
          console.log(community.posts.pages);
          // community.removeAllListeners()
          try {
            // const page = await community.posts.getPage({cid: community.posts.pageCids.new})
            // console.log(page)
            // const comment = page.comments[0]
            // console.log({comment})
            // const comment2 = await plebbit.getComment({cid: comment.cid})
            // console.log({comment2})
          } catch (e) {
            console.log(e);
          }
          // r(undefined)
        }),
      );
    },
    { timeout },
  );

  test.skip(
    "comment edit updates",
    async () => {
      const plebbit = await PlebbitJsMockContent();
      let count = 10;
      const cid = "UYdJj598pR4VKi3yoKP4oR4UQAyyQBQWfCtL6fLegCFP7";
      const comment: any = await plebbit.createComment({ cid });
      comment.update();
      await new Promise((r) =>
        comment.on("update", () => {
          console.log(comment);
          if (!count--) {
            comment.removeAllListeners();
            r(undefined);
          }
        }),
      );
    },
    { timeout },
  );

  test.skip(
    "create comment",
    async () => {
      const plebbit = await PlebbitJsMockContent();
      let count = 100;
      let linkCount = 0;
      while (count--) {
        const cid = "QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa" + count;
        // console.log(cid)
        const random = (
          Math.random().toString() +
          Math.random().toString() +
          Math.random().toString()
        ).replace(/0\./g, "");
        const comment: any = await plebbit.createComment({ cid: random });
        comment.update();
        await new Promise((r) =>
          comment.on("update", () => {
            if (comment.updatedAt) {
              if (comment.link) linkCount++;
              // console.log(comment.link)
              comment.removeAllListeners();
              r(undefined);
            }
          }),
        );
        // if (count === 92)
        //   break
      }
      console.log({ linkCount });
    },
    { timeout },
  );

  test.skip(
    "create comment with replies",
    async () => {
      const plebbit = await PlebbitJsMockContent();
      const cid = "QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa65";
      const comment: any = await plebbit.createComment({ cid });
      comment.update();
      await new Promise((r) =>
        comment.on("update", () => {
          if (comment.updatedAt) {
            console.log(comment.replies.pages.topAll.comments);
            comment.removeAllListeners();
            r(undefined);
          }
        }),
      );
    },
    { timeout },
  );
});

describe("mock content", () => {
  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMockContent);
    await testUtils.resetDatabasesAndStores();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });

  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  test("use comments", async () => {
    const rendered = renderHook<any, any>((commentCid) => useComment({ commentCid }));
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa0");
    await waitFor(() => rendered.result.current.state === "fetching-ipfs");
    expect(rendered.result.current.state).toBe("fetching-ipfs");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.timestamp).toBe("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).toBe("number");
    expect(rendered.result.current.state).toBe("succeeded");

    rendered.rerender(null);
    await waitFor(() => rendered.result.current.timestamp === undefined);
    expect(rendered.result.current.timestamp).toBe(undefined);
    await waitFor(() => rendered.result.current.upvoteCount === undefined);
    expect(rendered.result.current.upvoteCount).toBe(undefined);

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa1");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    expect(typeof rendered.result.current.timestamp).toBe("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).toBe("number");

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa2");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    expect(typeof rendered.result.current.timestamp).toBe("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).toBe("number");

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa3");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    expect(typeof rendered.result.current.timestamp).toBe("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).toBe("number");

    // test getting from db
    await testUtils.resetStores();
    const rendered2 = renderHook<any, any>((commentCid) => useComment({ commentCid }));
    const waitFor2 = testUtils.createWaitFor(rendered2, { timeout });

    rendered2.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa3");
    await waitFor2(() => typeof rendered2.result.current.timestamp === "number");
    expect(typeof rendered2.result.current.timestamp).toBe("number");
    await waitFor2(() => typeof rendered2.result.current.upvoteCount === "number");
    console.log(rendered2.result.current);
    expect(typeof rendered2.result.current.upvoteCount).toBe("number");
  });

  test("use communities", async () => {
    const rendered = renderHook<any, any>((communityAddress) => useCommunity({ communityAddress }));
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    rendered.rerender("anything2.eth");
    await waitFor(() => rendered.result.current.state === "fetching-ipns");
    expect(rendered.result.current.state).toBe("fetching-ipns");
    await waitFor(() => typeof rendered.result.current.updatedAt === "number");
    // console.log(rendered.result.current?.posts?.pages?.hot?.comments)
    console.log(rendered.result.current);
    expect(rendered.result.current.address).toBe("anything2.eth");
    expect(typeof rendered.result.current.updatedAt).toBe("number");
    expect(typeof rendered.result.current.posts?.pages?.hot?.comments?.[0]?.cid).toBe("string");
    expect(typeof rendered.result.current.posts?.pageCids?.new).toBe("string");
    expect(rendered.result.current.state).toBe("succeeded");

    // rendered.rerender(null)
    // await waitFor(() => rendered.result.current.updatedAt === undefined)
    // expect(rendered.result.current.updatedAt).toBe(undefined)

    // rendered.rerender('jokes2.eth')
    // await waitFor(() => typeof rendered.result.current.updatedAt === 'number')
    // // console.log(rendered.result.current?.posts?.pages?.hot?.comments)
    // console.log(rendered.result.current)
    // expect(rendered.result.current.address).toBe('jokes2.eth')
    // expect(typeof rendered.result.current.updatedAt).toBe('number')
    // expect(typeof rendered.result.current.posts?.pages?.hot?.comments?.[0]?.cid).toBe('string')
    // expect(typeof rendered.result.current.posts?.pageCids?.new).toBe('string')

    // rendered.rerender('12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z')
    // await waitFor(() => typeof rendered.result.current.updatedAt === 'number')
    // // console.log(rendered.result.current?.posts?.pages?.hot?.comments)
    // console.log(rendered.result.current)
    // expect(rendered.result.current.address).toBe('12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z')
    // expect(typeof rendered.result.current.updatedAt).toBe('number')
    // expect(typeof rendered.result.current.posts?.pages?.hot?.comments?.[0]?.cid).toBe('string')
    // expect(typeof rendered.result.current.posts?.pageCids?.new).toBe('string')

    // test getting from db
    await testUtils.resetStores();
    const rendered2 = renderHook<any, any>((communityAddress) =>
      useCommunity({ communityAddress }),
    );

    rendered2.rerender("anything2.eth");
    await waitFor(() => typeof rendered2.result.current.updatedAt === "number");
    console.log(rendered2.result.current);
    expect(rendered2.result.current.address).toBe("anything2.eth");
    expect(typeof rendered2.result.current.updatedAt).toBe("number");
    expect(typeof rendered2.result.current.posts?.pages?.hot?.comments?.[0]?.cid).toBe("string");
    expect(typeof rendered2.result.current.posts?.pageCids?.new).toBe("string");
  });

  test("use feed new", async () => {
    const rendered = renderHook<any, any>((communityAddresses) =>
      useFeed({ communityAddresses, sortType: "new" }),
    );
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    const scrollOnePage = async () => {
      const nextFeedLength = (rendered.result.current.feed?.length || 0) + 25;
      act(() => {
        rendered.result.current.loadMore();
      });
      try {
        await waitFor(() => rendered.result.current.feed?.length >= nextFeedLength);
      } catch (e) {
        console.error("scrollOnePage failed:", e);
      }
    };

    rendered.rerender(["jokes.eth", "news.eth"]);
    await waitFor(() => rendered.result.current.feed?.length > 0);
    expect(rendered.result.current.feed?.length).toBeGreaterThan(0);
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    console.log(rendered.result.current);
    expect(rendered.result.current.feed?.length).toBeGreaterThan(100);
  });

  test("use feed hot", async () => {
    const rendered = renderHook<any, any>((communityAddresses) => useFeed({ communityAddresses }));
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    const scrollOnePage = async () => {
      const nextFeedLength = (rendered.result.current.feed?.length || 0) + 25;
      act(() => {
        rendered.result.current.loadMore();
      });
      try {
        await waitFor(() => rendered.result.current.feed?.length >= nextFeedLength);
      } catch (e) {
        console.error("scrollOnePage failed:", e);
      }
    };

    rendered.rerender(["jokes.eth", "news.eth"]);
    await waitFor(() => rendered.result.current.feed?.length > 0);
    expect(rendered.result.current.feed?.length).toBeGreaterThan(0);
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    console.log(rendered.result.current);
    expect(rendered.result.current.feed?.length).toBeGreaterThan(100);
  });

  test("publish", async () => {
    const rendered = renderHook<any, any>(() => useAccount());
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    await waitFor(() => typeof rendered.result.current.plebbit?.createComment === "function");
    expect(typeof rendered.result.current.plebbit?.createComment).toBe("function");

    console.log("publishing comment");
    let onChallengeVerificationCalled = false;
    const onChallenge = (challenge: any, comment: any) => {
      console.log("challenge", challenge);
      comment.publishChallengeAnswers(["some answer..."]);
    };
    const onChallengeVerification = (...args: any) => {
      console.log("challengeverification", args);
      onChallengeVerificationCalled = true;
    };
    await accountsActions.publishComment({
      communityAddress: "news.eth",
      content: "content",
      title: "title",
      onChallenge,
      onChallengeVerification,
    });

    await waitFor(() => onChallengeVerificationCalled === true);
    expect(onChallengeVerificationCalled).toBe(true);

    console.log("publishing vote");
    onChallengeVerificationCalled = false;
    await accountsActions.publishVote({
      communityAddress: "news.eth",
      vote: 1,
      commentCid: "some cid...",
      onChallenge,
      onChallengeVerification,
    });

    await waitFor(() => onChallengeVerificationCalled === true);
    expect(onChallengeVerificationCalled).toBe(true);
  });

  test("use account communities", async () => {
    const rendered = renderHook<any, any>(() => {
      const account = useAccount();
      const { createCommunity } = accountsActions;
      const accountCommunities = useAccountCommunities();
      return { createCommunity, accountCommunities, account };
    });
    const waitFor = testUtils.createWaitFor(rendered, { timeout });
    await waitFor(
      () => typeof rendered.result.current.account?.plebbit?.createCommunity === "function",
    );
    expect(typeof rendered.result.current.account?.plebbit?.createCommunity).toBe("function");

    console.log("creating community");
    const community = await rendered.result.current.createCommunity({
      title: "title",
      description: "description",
    });
    console.log({ community });
    expect(community.title).toBe("title");

    // wait for account communities
    await waitFor(
      () =>
        JSON.stringify(rendered.result.current?.accountCommunities?.accountCommunities) !== "{}",
    );
    expect(
      JSON.stringify(rendered.result.current?.accountCommunities?.accountCommunities),
    ).not.toBe("{}");
    console.log(rendered.result.current?.accountCommunities);

    // NOTE: this test won't change accountCommunities state, need to use publishCommunityEdit for that
    console.log("editing community");
    await community.edit({
      address: "name.eth",
    });
    console.log({ community });
    expect(community.address).toBe("name.eth");
  });

  test("use comment replies", async () => {
    const rendered = renderHook<any, any>((commentCid) => useReplies({ commentCid }));
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    const scrollOnePage = async () => {
      const nextFeedLength = (rendered.result.current.replies?.length || 0) + 25;
      act(() => {
        rendered.result.current.loadMore();
      });
      try {
        await waitFor(() => rendered.result.current.replies?.length >= nextFeedLength);
      } catch (e) {
        console.error("scrollOnePage failed:", e);
      }
    };

    rendered.rerender("Qm2xWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa3");
    await waitFor(() => rendered.result.current.replies?.length > 0);
    expect(rendered.result.current.replies?.length).toBeGreaterThan(0);
    await waitFor(() => rendered.result.current.replies?.length === 25);
    expect(rendered.result.current.replies?.length).toBe(25);
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    await scrollOnePage();
    expect(rendered.result.current.replies?.length).toBeGreaterThan(100);
  });
});
