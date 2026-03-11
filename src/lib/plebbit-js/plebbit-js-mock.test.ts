import PlebbitJsMock from "./plebbit-js-mock";

describe("PlebbitJsMock", () => {
  test("Comment.state and Comment.updatingState", async () => {
    const plebbit = await PlebbitJsMock();
    const comment = await plebbit.createComment({ cid: "comment cid" });

    // initial state is stopped
    expect(comment.state).toBe("stopped");
    expect(comment.updatingState).toBe("stopped");

    const onStatechange = vi.fn(() => comment.state);
    const onUpdatingstatechange = vi.fn(() => comment.updatingState);

    comment.on("statechange", onStatechange);
    comment.on("updatingstatechange", onUpdatingstatechange);

    // wait for succeeded
    const succeededPromise = new Promise((resolve) =>
      comment.on("updatingstatechange", (state: string) => {
        state === "succeeded" && resolve(state);
      }),
    );

    // start updating state
    await comment.update();
    expect(comment.state).toBe("updating");

    await succeededPromise;
    expect(onStatechange.mock.calls[0]).toEqual(["updating"]);
    expect(onStatechange.mock.results[0].value).toEqual("updating");
    expect(onStatechange.mock.calls.length).toBe(1);
    expect(onUpdatingstatechange.mock.calls[0]).toEqual(["fetching-ipfs"]);
    expect(onUpdatingstatechange.mock.calls[1]).toEqual(["fetching-update-ipns"]);
    expect(onUpdatingstatechange.mock.calls[2]).toEqual(["succeeded"]);
    expect(onUpdatingstatechange.mock.calls.length).toBe(3);
    expect(onUpdatingstatechange.mock.results[0].value).toEqual("fetching-ipfs");
    expect(onUpdatingstatechange.mock.results[1].value).toEqual("fetching-update-ipns");
    expect(onUpdatingstatechange.mock.results[2].value).toEqual("succeeded");
  });

  test("Community.state and Community.updatingState", async () => {
    const plebbit = await PlebbitJsMock();
    const community = await plebbit.createCommunity({ address: "community address" });

    // initial state is stopped
    expect(community.state).toBe("stopped");
    expect(community.updatingState).toBe("stopped");

    const onStatechange = vi.fn(() => community.state);
    const onUpdatingstatechange = vi.fn(() => community.updatingState);

    community.on("statechange", onStatechange);
    community.on("updatingstatechange", onUpdatingstatechange);

    // wait for succeeded twice (2 updates)
    let succeededCount = 0;
    const succeededPromise = new Promise((resolve) =>
      community.on("updatingstatechange", (state: string) => {
        state === "succeeded" && ++succeededCount === 2 && resolve(state);
      }),
    );

    // start updating state
    await community.update();
    expect(community.state).toBe("updating");

    await succeededPromise;
    expect(onStatechange.mock.calls[0]).toEqual(["updating"]);
    expect(onStatechange.mock.results[0].value).toEqual("updating");
    expect(onStatechange.mock.calls.length).toBe(1);
    expect(onUpdatingstatechange.mock.calls[0]).toEqual(["fetching-ipns"]);
    expect(onUpdatingstatechange.mock.calls[1]).toEqual(["succeeded"]);
    expect(onUpdatingstatechange.mock.calls[2]).toEqual(["fetching-ipns"]);
    expect(onUpdatingstatechange.mock.calls[3]).toEqual(["succeeded"]);
    expect(onUpdatingstatechange.mock.calls.length).toBe(4);
    expect(onUpdatingstatechange.mock.results[0].value).toEqual("fetching-ipns");
    expect(onUpdatingstatechange.mock.results[1].value).toEqual("succeeded");
    expect(onUpdatingstatechange.mock.results[2].value).toEqual("fetching-ipns");
    expect(onUpdatingstatechange.mock.results[3].value).toEqual("succeeded");
  });

  test("Comment.publishingState", async () => {
    const plebbit = await PlebbitJsMock();
    const comment = await plebbit.createComment({
      content: "content",
      communityAddress: "community address",
    });

    // initial state is stopped
    expect(comment.state).toBe("stopped");
    expect(comment.publishingState).toBe("stopped");

    const onStatechange = vi.fn(() => comment.state);
    const onPublishingstatechange = vi.fn(() => comment.publishingState);

    comment.on("statechange", onStatechange);
    comment.on("publishingstatechange", onPublishingstatechange);

    // wait for succeeded
    const succeededPromise = new Promise((resolve) =>
      comment.on("publishingstatechange", (state: string) => {
        state === "succeeded" && resolve(state);
      }),
    );

    // start publishing state
    comment.on("challenge", () => comment.publishChallengeAnswers(["4"]));
    await comment.publish();
    expect(comment.state).toBe("publishing");

    await succeededPromise;
    expect(onStatechange.mock.calls[0]).toEqual(["publishing"]);
    expect(onStatechange.mock.calls.length).toBe(1);
    expect(onStatechange.mock.results[0].value).toEqual("publishing");
    expect(onPublishingstatechange.mock.calls[0]).toEqual(["publishing-challenge-request"]);
    expect(onPublishingstatechange.mock.calls[1]).toEqual(["waiting-challenge-answers"]);
    expect(onPublishingstatechange.mock.calls[2]).toEqual(["publishing-challenge-answer"]);
    expect(onPublishingstatechange.mock.calls[3]).toEqual(["waiting-challenge-verification"]);
    expect(onPublishingstatechange.mock.calls[4]).toEqual(["succeeded"]);
    expect(onPublishingstatechange.mock.calls.length).toBe(5);
    expect(onPublishingstatechange.mock.results[0].value).toEqual("publishing-challenge-request");
    expect(onPublishingstatechange.mock.results[1].value).toEqual("waiting-challenge-answers");
    expect(onPublishingstatechange.mock.results[2].value).toEqual("publishing-challenge-answer");
    expect(onPublishingstatechange.mock.results[3].value).toEqual("waiting-challenge-verification");
    expect(onPublishingstatechange.mock.results[4].value).toEqual("succeeded");
  });

  test("Publication.stop() emits/sets expected stopped publishing state", async () => {
    const plebbit = await PlebbitJsMock();
    const comment = await plebbit.createComment({
      content: "content",
      communityAddress: "community address",
    });

    expect(comment.state).toBe("stopped");
    expect(comment.publishingState).toBe("stopped");

    const onStatechange = vi.fn(() => comment.state);
    const onPublishingstatechange = vi.fn(() => comment.publishingState);

    comment.on("statechange", onStatechange);
    comment.on("publishingstatechange", onPublishingstatechange);

    // start publishing (don't answer challenge)
    comment.publish();
    await new Promise((r) => setTimeout(r, 20));
    expect(comment.state).toBe("publishing");
    expect(comment.publishingState).not.toBe("stopped");

    // stop mid-publish
    comment.stop();
    expect(comment.state).toBe("stopped");
    expect(comment.publishingState).toBe("stopped");
    expect(onStatechange.mock.calls.some((c) => c[0] === "stopped")).toBe(true);
    expect(onPublishingstatechange.mock.calls.some((c) => c[0] === "stopped")).toBe(true);
  });

  test("Community create/edit preserves intentional falsy values", async () => {
    const plebbit = await PlebbitJsMock();
    const community = await plebbit.createCommunity({
      address: "community address",
      customFlag: false,
      customCount: 0,
      customLabel: "",
      suggested: true,
      title: "title",
    });

    expect((community as any).customFlag).toBe(false);
    expect((community as any).customCount).toBe(0);
    expect((community as any).customLabel).toBe("");

    await community.edit({ suggested: false, title: "" });
    expect(community.suggested).toBe(false);
    expect(community.title).toBe("");
  });
});
