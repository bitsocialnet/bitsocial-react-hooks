// test plebbit-js mock content https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/mock-content.md

window.process = { env: {} };
window.process.env.REACT_APP_PLEBBIT_REACT_HOOKS_MOCK_CONTENT = "1";
window.process.env.REACT_APP_PLEBBIT_REACT_HOOKS_MOCK_CONTENT_LOADING_TIME = "1000";

import {
  useComment,
  useCommunity,
  useFeed,
  useAccountCommunities,
  useAccount,
  setPlebbitJs,
} from "../../dist";
import PlebbitJsMockContent from "../../dist/lib/plebbit-js/plebbit-js-mock-content";
// mock right after importing or sometimes fails to mock
setPlebbitJs(PlebbitJsMockContent);

import * as accountsActions from "../../dist/stores/accounts/accounts-actions";
import { act } from "@testing-library/react";
import { renderHook } from "../test-utils";
import testUtils from "../../dist/lib/test-utils";

const timeout = 180_000;

describe("mock content", () => {
  beforeAll(() => {
    testUtils.silenceReactWarnings();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });

  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  it("use comments", async () => {
    const rendered = renderHook((commentCid) => useComment({ commentCid }));
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa0");
    await waitFor(() => rendered.result.current.state === "fetching-ipfs");
    expect(rendered.result.current.state).to.equal("fetching-ipfs");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.timestamp).to.equal("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).to.equal("number");
    expect(rendered.result.current.state).to.equal("succeeded");

    rendered.rerender(null);
    await waitFor(() => rendered.result.current.timestamp === undefined);
    expect(rendered.result.current.timestamp).to.equal(undefined);
    await waitFor(() => rendered.result.current.upvoteCount === undefined);
    expect(rendered.result.current.upvoteCount).to.equal(undefined);

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa1");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    expect(typeof rendered.result.current.timestamp).to.equal("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).to.equal("number");

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa2");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    expect(typeof rendered.result.current.timestamp).to.equal("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).to.equal("number");

    rendered.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa3");
    await waitFor(() => typeof rendered.result.current.timestamp === "number");
    expect(typeof rendered.result.current.timestamp).to.equal("number");
    await waitFor(() => typeof rendered.result.current.upvoteCount === "number");
    console.log(rendered.result.current);
    expect(typeof rendered.result.current.upvoteCount).to.equal("number");

    // test getting from db
    await testUtils.resetStores();
    const rendered2 = renderHook((commentCid) => useComment({ commentCid }));

    rendered2.rerender("QmXxWyFRBUReRNzyJueFLFh84Mtj7ycbySktRQ5ffZLVa3");
    await waitFor(() => typeof rendered2.result.current.communityAddress === "string");
    console.log(rendered2.result.current);
    expect(typeof rendered2.result.current.communityAddress).to.equal("string");
    expect(typeof rendered2.result.current.timestamp).to.equal("number");
    expect(typeof rendered2.result.current.upvoteCount).to.equal("number");
  });

  it("use communities", async () => {
    const rendered = renderHook((communityAddress) => useCommunity({ communityAddress }));
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    rendered.rerender("anything2.eth");
    await waitFor(() => rendered.result.current.state === "fetching-ipns");
    expect(rendered.result.current.state).to.equal("fetching-ipns");
    await waitFor(() => typeof rendered.result.current.updatedAt === "number");
    // console.log(rendered.result.current?.posts?.pages?.hot?.comments)
    console.log(rendered.result.current);
    expect(rendered.result.current.address).to.equal("anything2.eth");
    expect(typeof rendered.result.current.updatedAt).to.equal("number");
    expect(typeof rendered.result.current.posts?.pages?.hot?.comments?.[0]?.cid).to.equal("string");
    expect(typeof rendered.result.current.posts?.pageCids?.new).to.equal("string");
    expect(rendered.result.current.state).to.equal("succeeded");

    // rendered.rerender(null)
    // await waitFor(() => rendered.result.current.updatedAt === undefined)
    // expect(rendered.result.current.updatedAt).to.equal(undefined)

    // rendered.rerender('jokes2.eth')
    // await waitFor(() => typeof rendered.result.current.updatedAt === 'number')
    // // console.log(rendered.result.current?.posts?.pages?.hot?.comments)
    // console.log(rendered.result.current)
    // expect(rendered.result.current.address).to.equal('jokes2.eth')
    // expect(typeof rendered.result.current.updatedAt).to.equal('number')
    // expect(typeof rendered.result.current.posts?.pages?.hot?.comments?.[0]?.cid).to.equal('string')
    // expect(typeof rendered.result.current.posts?.pageCids?.new).to.equal('string')

    // rendered.rerender('12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z')
    // await waitFor(() => typeof rendered.result.current.updatedAt === 'number')
    // // console.log(rendered.result.current?.posts?.pages?.hot?.comments)
    // console.log(rendered.result.current)
    // expect(rendered.result.current.address).to.equal('12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z')
    // expect(typeof rendered.result.current.updatedAt).to.equal('number')
    // expect(typeof rendered.result.current.posts?.pages?.hot?.comments?.[0]?.cid).to.equal('string')
    // expect(typeof rendered.result.current.posts?.pageCids?.new).to.equal('string')

    // test getting from db
    await testUtils.resetStores();
    const rendered2 = renderHook((communityAddress) => useCommunity({ communityAddress }));

    rendered2.rerender("anything2");
    await waitFor(() => typeof rendered2.result.current.updatedAt === "number");
    console.log(rendered2.result.current);
    expect(rendered2.result.current.address).to.equal("anything2");
    expect(typeof rendered2.result.current.updatedAt).to.equal("number");
    expect(typeof rendered2.result.current.posts?.pages?.hot?.comments?.[0]?.cid).to.equal(
      "string",
    );
    expect(typeof rendered2.result.current.posts?.pageCids?.new).to.equal("string");
  });

  it("use feed hot", async () => {
    const rendered = renderHook((communityAddresses) =>
      useFeed({ communityAddresses, sortType: "hot" }),
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
    console.log(rendered.result.current);
    expect(rendered.result.current.feed?.length).to.be.greaterThan(0);
    await scrollOnePage();
    await scrollOnePage();
    console.log(rendered.result.current);
    expect(rendered.result.current.feed?.length).to.be.greaterThan(50);
  });

  it("use feed new", async () => {
    const rendered = renderHook((communityAddresses) =>
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
    console.log(rendered.result.current);
    expect(rendered.result.current.feed?.length).to.be.greaterThan(0);
    await scrollOnePage();
    await scrollOnePage();
    console.log(rendered.result.current);
    expect(rendered.result.current.feed?.length).to.be.greaterThan(50);
  });

  it("publish", async () => {
    const rendered = renderHook(() => useAccount());
    const waitFor = testUtils.createWaitFor(rendered, { timeout });

    await waitFor(() => typeof rendered.result.current.plebbit?.createComment === "function");
    expect(typeof rendered.result.current.plebbit?.createComment).to.equal("function");

    console.log("publishing comment");
    let onChallengeVerificationCalled = false;
    const onChallenge = (challenge, comment) => {
      console.log("challenge", challenge);
      comment.publishChallengeAnswers(["some answer..."]);
    };
    const onChallengeVerification = (...args) => {
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
    expect(onChallengeVerificationCalled).to.equal(true);

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
    expect(onChallengeVerificationCalled).to.equal(true);
  });

  it("use account communities", async () => {
    const rendered = renderHook(() => {
      const account = useAccount();
      const { createCommunity } = accountsActions;
      const accountCommunities = useAccountCommunities();
      return { createCommunity, accountCommunities, account };
    });
    const waitFor = testUtils.createWaitFor(rendered, { timeout });
    await waitFor(
      () => typeof rendered.result.current.account?.plebbit?.createCommunity === "function",
    );
    expect(typeof rendered.result.current.account?.plebbit?.createCommunity).to.equal("function");

    console.log("creating community");
    const community = await rendered.result.current.createCommunity({
      title: "title",
      description: "description",
    });
    console.log({ community });
    expect(community.title).to.equal("title");

    // wait for account communities
    await waitFor(
      () =>
        JSON.stringify(rendered.result.current?.accountCommunities?.accountCommunities) !== "{}",
    );
    expect(
      JSON.stringify(rendered.result.current?.accountCommunities?.accountCommunities),
    ).not.to.equal("{}");
    console.log(rendered.result.current?.accountCommunities);

    // NOTE: this test won't change accountCommunities state, need to use publishCommunityEdit for that
    console.log("editing community");
    await community.edit({
      address: "name.eth",
    });
    console.log({ community });
    expect(community.address).to.equal("name.eth");
  });
});
