import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useSubscribe,
  usePublishComment,
  usePublishCommentEdit,
  usePublishCommentModeration,
  usePublishSubplebbitEdit,
  usePublishVote,
  useBlock,
  useAccount,
  useCreateSubplebbit,
  setPlebbitJs,
  useAccountVote,
  useAccountComments,
} from "../..";
import {
  handlePublishErrorWhenAbandoned,
  handlePublishVoteError,
  withGuardActive,
} from "./actions";
import PlebbitJsMock, {
  Plebbit,
  Comment,
  CommentEdit,
  CommentModeration,
  SubplebbitEdit,
  Vote,
  Subplebbit,
  Pages,
  resetPlebbitJsMock,
  debugPlebbitJsMock,
} from "../../lib/plebbit-js/plebbit-js-mock";
import useAccountsStore from "../../stores/accounts";

describe("actions", () => {
  describe("handlePublishErrorWhenAbandoned", () => {
    test("returns early when activeRequestIdRef.current !== requestId (abandoned)", () => {
      const ref = { current: undefined as number | undefined };
      const setErrors = vi.fn();
      const onError = vi.fn();
      handlePublishErrorWhenAbandoned(ref, 1, new Error("test"), setErrors, onError);
      expect(setErrors).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    test("handlePublishVoteError sets errors and calls onError", () => {
      const setErrors = vi.fn();
      const onError = vi.fn();
      const err = new Error("vote failed");
      handlePublishVoteError(err, setErrors, onError);
      expect(setErrors).toHaveBeenCalledWith(expect.any(Function));
      expect(onError).toHaveBeenCalledWith(err);
    });

    test("handlePublishVoteError when onError is undefined still sets errors", () => {
      const setErrors = vi.fn();
      const err = new Error("vote failed");
      handlePublishVoteError(err, setErrors);
      expect(setErrors).toHaveBeenCalledWith(expect.any(Function));
    });

    test("handlePublishErrorWhenAbandoned when onError is undefined still sets errors", () => {
      const ref = { current: 1 };
      const setErrors = vi.fn();
      const err = new Error("test");
      handlePublishErrorWhenAbandoned(ref, 1, err, setErrors);
      expect(setErrors).toHaveBeenCalledWith(expect.any(Function));
    });

    test("sets errors and calls onError when not abandoned", () => {
      const ref = { current: 1 };
      const setErrors = vi.fn();
      const onError = vi.fn();
      const err = new Error("test");
      handlePublishErrorWhenAbandoned(ref, 1, err, setErrors, onError);
      expect(setErrors).toHaveBeenCalledWith(expect.any(Function));
      expect(onError).toHaveBeenCalledWith(err);
    });
  });

  describe("withGuardActive", () => {
    test("invokes fn when guard returns true", () => {
      const fn = vi.fn();
      const wrapped = withGuardActive(() => true, fn);
      wrapped("a", 1);
      expect(fn).toHaveBeenCalledWith("a", 1);
    });

    test("no-ops when guard returns false", () => {
      const fn = vi.fn();
      const wrapped = withGuardActive(() => false, fn);
      wrapped("a", 1);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
  });
  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("useSubscribe", () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((useSubscribeOptionsArray = []) => {
        const result1 = useSubscribe(useSubscribeOptionsArray[0]);
        const result2 = useSubscribe(useSubscribeOptionsArray[1]);
        return [result1, result2];
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`subscribe and unsubscribe to subplebbit`, async () => {
      const subplebbitAddress = "tosubscribeto.eth";
      const subplebbitAddress2 = "tosubscribeto2.eth";

      expect(rendered.result.current[0].state).toBe("initializing");
      expect(rendered.result.current[0].subscribed).toBe(undefined);
      expect(typeof rendered.result.current[0].subscribe).toBe("function");
      expect(typeof rendered.result.current[0].unsubscribe).toBe("function");

      // get the default value
      rendered.rerender([{ subplebbitAddress }]);
      await waitFor(() => typeof rendered.result.current[0].subscribed === "boolean");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].subscribed).toBe(false);

      // subscribe to 1 sub
      await act(async () => {
        await rendered.result.current[0].subscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === true);
      expect(rendered.result.current[0].subscribed).toEqual(true);

      // fail subscribing twice
      expect(rendered.result.current[0].errors.length).toBe(0);
      await act(async () => {
        await rendered.result.current[0].subscribe();
      });
      expect(rendered.result.current[0].errors.length).toBe(1);

      // unsubscribe
      await act(async () => {
        await rendered.result.current[0].unsubscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === false);
      expect(rendered.result.current[0].subscribed).toEqual(false);

      // fail unsubscribing twice
      expect(rendered.result.current[0].errors.length).toBe(1);
      await act(async () => {
        await rendered.result.current[0].unsubscribe();
      });
      expect(rendered.result.current[0].errors.length).toBe(2);

      // subscribe to 2 subs
      rendered.rerender([{ subplebbitAddress }, { subplebbitAddress: subplebbitAddress2 }]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      await waitFor(() => rendered.result.current[1].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[1].state).toBe("ready");
      expect(rendered.result.current[0].subscribed).toBe(false);
      expect(rendered.result.current[1].subscribed).toBe(false);

      await act(async () => {
        await rendered.result.current[0].subscribe();
        await rendered.result.current[1].subscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === true);
      await waitFor(() => rendered.result.current[1].subscribed === true);
      expect(rendered.result.current[0].subscribed).toBe(true);
      expect(rendered.result.current[1].subscribed).toBe(true);

      // unsubscribe with 2 subs
      await act(async () => {
        await rendered.result.current[0].unsubscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === false);
      expect(rendered.result.current[0].subscribed).toBe(false);
      expect(rendered.result.current[1].subscribed).toBe(true);

      // reset stores to force using the db
      await testUtils.resetStores();

      // subscribing persists in database after store reset
      const rendered2 = renderHook<any, any>(() =>
        useSubscribe({ subplebbitAddress: subplebbitAddress2 }),
      );
      const waitFor2 = testUtils.createWaitFor(rendered2);
      await waitFor2(() => rendered2.result.current.state === "ready");
      expect(rendered2.result.current.state).toBe("ready");
      expect(rendered2.result.current.subscribed).toBe(true);
    });

    test("useSubscribe onError callback when subscribe fails", async () => {
      const onError = vi.fn();
      rendered.rerender([{ subplebbitAddress: "tosubscribeto.eth", onError }]);
      await waitFor(() => typeof rendered.result.current[0].subscribed === "boolean");

      await act(async () => {
        await rendered.result.current[0].subscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === true);

      await act(async () => {
        await rendered.result.current[0].subscribe();
      });
      expect(rendered.result.current[0].errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    test("useSubscribe onError callback when unsubscribe fails", async () => {
      const onError = vi.fn();
      rendered.rerender([{ subplebbitAddress: "tosubscribeto.eth", onError }]);
      await waitFor(() => typeof rendered.result.current[0].subscribed === "boolean");
      await act(async () => {
        await rendered.result.current[0].subscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === true);
      await act(async () => {
        await rendered.result.current[0].unsubscribe();
      });
      await waitFor(() => rendered.result.current[0].subscribed === false);
      await act(async () => {
        await rendered.result.current[0].unsubscribe();
      });
      expect(rendered.result.current[0].errors.length).toBeGreaterThanOrEqual(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("useBlock", () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((useBlockOptionsArray = []) => {
        const result1 = useBlock(useBlockOptionsArray[0]);
        const result2 = useBlock(useBlockOptionsArray[1]);
        return [result1, result2];
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`useBlock throws when both address and cid provided`, () => {
      expect(() => {
        renderHook(() => useBlock({ address: "addr.eth", cid: "QmCid" }));
      }).toThrow(/can't useBlock with both/);
    });

    test(`block and unblock two addresses (subplebbit addresses)`, async () => {
      const address = "address.eth";
      const address2 = "address2.eth";

      expect(rendered.result.current[0].state).toBe("initializing");
      expect(rendered.result.current[0].blocked).toBe(undefined);
      expect(typeof rendered.result.current[0].block).toBe("function");
      expect(typeof rendered.result.current[0].unblock).toBe("function");

      // get the default value
      rendered.rerender([{ address }]);
      await waitFor(() => typeof rendered.result.current[0].blocked === "boolean");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].blocked).toBe(false);

      // block to 1 address
      await act(async () => {
        await rendered.result.current[0].block();
      });
      await waitFor(() => rendered.result.current[0].blocked === true);
      expect(rendered.result.current[0].blocked).toEqual(true);

      // fail blocking twice
      expect(rendered.result.current[0].errors.length).toBe(0);
      await act(async () => {
        await rendered.result.current[0].block();
      });
      expect(rendered.result.current[0].errors.length).toBe(1);

      // unblock
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      await waitFor(() => rendered.result.current[0].blocked === false);
      expect(rendered.result.current[0].blocked).toEqual(false);

      // fail unblocking twice
      expect(rendered.result.current[0].errors.length).toBe(1);
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      expect(rendered.result.current[0].errors.length).toBe(2);

      // block 2 addresses
      rendered.rerender([{ address }, { address: address2 }]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      await waitFor(() => rendered.result.current[1].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[1].state).toBe("ready");
      expect(rendered.result.current[0].blocked).toBe(false);
      expect(rendered.result.current[1].blocked).toBe(false);

      await act(async () => {
        await rendered.result.current[0].block();
        await rendered.result.current[1].block();
      });
      await waitFor(() => rendered.result.current[0].blocked === true);
      await waitFor(() => rendered.result.current[1].blocked === true);
      expect(rendered.result.current[0].blocked).toBe(true);
      expect(rendered.result.current[1].blocked).toBe(true);

      // unblock with 2 addresses
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      await waitFor(() => rendered.result.current[0].blocked === false);
      expect(rendered.result.current[0].blocked).toBe(false);
      expect(rendered.result.current[1].blocked).toBe(true);

      // reset stores to force using the db
      await testUtils.resetStores();

      // blocking persists in database after store reset
      const rendered2 = renderHook<any, any>(() => useBlock({ address: address2 }));
      const waitFor2 = testUtils.createWaitFor(rendered2);
      await waitFor2(() => rendered2.result.current.state === "ready");
      expect(rendered2.result.current.state).toBe("ready");
      expect(rendered2.result.current.blocked).toBe(true);
    });

    test(`block and unblock two cids (hide comment)`, async () => {
      const cid = "comment cid 1";
      const cid2 = "comment cid 2";

      expect(rendered.result.current[0].state).toBe("initializing");
      expect(rendered.result.current[0].blocked).toBe(undefined);
      expect(typeof rendered.result.current[0].block).toBe("function");
      expect(typeof rendered.result.current[0].unblock).toBe("function");

      // get the default value
      rendered.rerender([{ cid }]);
      await waitFor(() => typeof rendered.result.current[0].blocked === "boolean");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].blocked).toBe(false);

      // block to 1 cid
      await act(async () => {
        await rendered.result.current[0].block();
      });
      await waitFor(() => rendered.result.current[0].blocked === true);
      expect(rendered.result.current[0].blocked).toEqual(true);

      // fail blocking twice
      expect(rendered.result.current[0].errors.length).toBe(0);
      await act(async () => {
        await rendered.result.current[0].block();
      });
      expect(rendered.result.current[0].errors.length).toBe(1);

      // unblock
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      await waitFor(() => rendered.result.current[0].blocked === false);
      expect(rendered.result.current[0].blocked).toEqual(false);

      // fail unblocking twice
      expect(rendered.result.current[0].errors.length).toBe(1);
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      expect(rendered.result.current[0].errors.length).toBe(2);

      // block 2 cids
      rendered.rerender([{ cid }, { cid: cid2 }]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      await waitFor(() => rendered.result.current[1].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[1].state).toBe("ready");
      expect(rendered.result.current[0].blocked).toBe(false);
      expect(rendered.result.current[1].blocked).toBe(false);

      await act(async () => {
        await rendered.result.current[0].block();
        await rendered.result.current[1].block();
      });
      await waitFor(() => rendered.result.current[0].blocked === true);
      await waitFor(() => rendered.result.current[1].blocked === true);
      expect(rendered.result.current[0].blocked).toBe(true);
      expect(rendered.result.current[1].blocked).toBe(true);

      // unblock with 2 cids
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      await waitFor(() => rendered.result.current[0].blocked === false);
      expect(rendered.result.current[0].blocked).toBe(false);
      expect(rendered.result.current[1].blocked).toBe(true);

      // reset stores to force using the db
      await testUtils.resetStores();

      // blocking persists in database after store reset
      const rendered2 = renderHook<any, any>(() => useBlock({ cid: cid2 }));
      const waitFor2 = testUtils.createWaitFor(rendered2);
      await waitFor2(() => rendered2.result.current.state === "ready");
      expect(rendered2.result.current.state).toBe("ready");
      expect(rendered2.result.current.blocked).toBe(true);
    });

    test("useBlock onError callback when block fails", async () => {
      const onError = vi.fn();
      rendered.rerender([{ address: "address.eth", onError }]);
      await waitFor(() => typeof rendered.result.current[0].blocked === "boolean");
      await act(async () => {
        await rendered.result.current[0].block();
      });
      await waitFor(() => rendered.result.current[0].blocked === true);
      await act(async () => {
        await rendered.result.current[0].block();
      });
      expect(rendered.result.current[0].errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    test("useBlock onError callback when unblock fails", async () => {
      const onError = vi.fn();
      rendered.rerender([{ address: "address.eth", onError }]);
      await waitFor(() => typeof rendered.result.current[0].blocked === "boolean");
      await act(async () => {
        await rendered.result.current[0].block();
      });
      await waitFor(() => rendered.result.current[0].blocked === true);
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      await waitFor(() => rendered.result.current[0].blocked === false);
      await act(async () => {
        await rendered.result.current[0].unblock();
      });
      expect(rendered.result.current[0].errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("useCreateSubplebbit", () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((useCreateSubplebbitOptions = []) => {
        const result1 = useCreateSubplebbit(useCreateSubplebbitOptions[0]);
        const result2 = useCreateSubplebbit(useCreateSubplebbitOptions[1]);
        return [result1, result2];
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`can create subplebbit`, async () => {
      expect(rendered.result.current[0].state).toBe("initializing");
      expect(rendered.result.current[0].createdSubplebbit).toBe(undefined);
      expect(typeof rendered.result.current[0].createSubplebbit).toBe("function");

      const options1 = {
        title: "title",
      };

      // add options
      rendered.rerender([options1]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].createdSubplebbit).toBe(undefined);

      // create subplebbit
      await act(async () => {
        await rendered.result.current[0].createSubplebbit();
      });
      await waitFor(() => rendered.result.current[0].createdSubplebbit);
      expect(rendered.result.current[0].state).toBe("succeeded");
      expect(rendered.result.current[0].createdSubplebbit?.title).toBe(options1.title);

      // useCreateSubplebbit 2 with same option not created
      rendered.rerender([options1, options1]);
      await waitFor(() => rendered.result.current[1].state === "ready");
      expect(rendered.result.current[1].state).toBe("ready");
      expect(rendered.result.current[1].createdSubplebbit).toBe(undefined);
    });

    test(`can error`, async () => {
      // mock the comment publish to error out
      const createSubplebbit = Plebbit.prototype.createSubplebbit;
      Plebbit.prototype.createSubplebbit = async () => {
        throw Error("create subplebbit error");
      };

      const options1 = {
        title: "title",
      };

      // add options
      rendered.rerender([options1]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].createdSubplebbit).toBe(undefined);

      // create subplebbit
      await act(async () => {
        await rendered.result.current[0].createSubplebbit();
      });
      // wait for error
      await waitFor(() => rendered.result.current[0].error);
      expect(rendered.result.current[0].error.message).toBe("create subplebbit error");
      expect(rendered.result.current[0].createdSubplebbit).toBe(undefined);
      expect(rendered.result.current[0].state).toBe("failed");
      expect(rendered.result.current[0].errors.length).toBe(1);

      // restore mock
      Plebbit.prototype.createSubplebbit = createSubplebbit;
    });

    test("useCreateSubplebbit onError callback when create fails", async () => {
      const createSubplebbit = Plebbit.prototype.createSubplebbit;
      Plebbit.prototype.createSubplebbit = async () => {
        throw Error("create subplebbit error");
      };

      const onError = vi.fn();
      rendered.rerender([{ title: "title", onError }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].createSubplebbit();
      });
      await waitFor(() => rendered.result.current[0].error);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      Plebbit.prototype.createSubplebbit = createSubplebbit;
    });
  });

  // retry usePublish because publishing state is flaky
  describe("usePublishComment", { retry: 3 }, () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options) => {
        const result = usePublishComment(options);
        return result;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`publishChallengeAnswers throws when challenge not yet received`, async () => {
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "content",
      };
      rendered.rerender(publishCommentOptions);
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.challenge).toBeUndefined();
      await expect(rendered.result.current.publishChallengeAnswers(["4"])).rejects.toThrow(
        /can't call publishChallengeAnswers/,
      );
    });

    test(`can publish comment`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "some content acions.test",
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishCommentOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishComment();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);
      expect(rendered.result.current.state).toBe("waiting-challenge-answers");

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(typeof rendered.result.current.index).toBe("number");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1].timestamp).toBe("number");
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1].timestamp).toBe("number");
    });

    test("publish comment without onChallengeVerification completes successfully", async () => {
      const onChallenge = vi.fn((challenge: any, comment: any) =>
        comment.publishChallengeAnswers(),
      );
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "no onChallengeVerification test",
        onChallenge,
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishComment();
      });

      await waitFor(() => rendered.result.current.challenge);
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
      expect(typeof rendered.result.current.index).toBe("number");
    });

    test(`abandon during waiting-challenge-answers removes pending local comment and returns hook state to ready`, async () => {
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "abandon test content",
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      await act(async () => {
        await rendered.result.current.publishComment();
      });

      await waitFor(() => rendered.result.current.state === "waiting-challenge-answers");
      expect(rendered.result.current.state).toBe("waiting-challenge-answers");
      expect(typeof rendered.result.current.index).toBe("number");
      expect(rendered.result.current.challenge).toBeDefined();

      const renderedWithComments = renderHook(() => useAccountComments());
      const waitForComments = testUtils.createWaitFor(renderedWithComments);
      await waitForComments(() => renderedWithComments.result.current.accountComments?.length >= 1);
      expect(renderedWithComments.result.current.accountComments.length).toBe(1);
      expect(renderedWithComments.result.current.accountComments[0].content).toBe(
        "abandon test content",
      );

      await act(async () => {
        await rendered.result.current.abandonPublish();
      });

      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.index).toBe(undefined);
      expect(rendered.result.current.challenge).toBe(undefined);
      expect(rendered.result.current.challengeVerification).toBe(undefined);

      // pending comment was removed from store
      renderedWithComments.rerender();
      await waitForComments(
        () => renderedWithComments.result.current.accountComments?.length === 0,
      );
      expect(renderedWithComments.result.current.accountComments.length).toBe(0);
    });

    test(`abandon from onChallenge removes pending local comment even if publishComment() has not resolved yet`, async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: async (...args: any[]) => {
            const pendingComment = await originalPublishComment(...args);
            // Ensure onChallenge can fire before usePublishComment receives the returned index.
            await new Promise((resolve) => setTimeout(resolve, 50));
            return pendingComment;
          },
        },
      }));

      const renderedWithComments = renderHook(() => useAccountComments());
      const waitForComments = testUtils.createWaitFor(renderedWithComments);
      let challengeCalls = 0;

      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... actions.test early abandon",
        parentCid: "Qm... actions.test early abandon",
        content: "abandon onChallenge test content",
        onChallenge: async () => {
          challengeCalls += 1;
          expect(rendered.result.current.index).toBe(undefined);
          await rendered.result.current.abandonPublish();
        },
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishComment();
      });

      await waitFor(() => challengeCalls === 1);
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.index).toBe(undefined);
      expect(rendered.result.current.challenge).toBe(undefined);
      expect(rendered.result.current.challengeVerification).toBe(undefined);

      renderedWithComments.rerender();
      await waitForComments(
        () => renderedWithComments.result.current.accountComments?.length === 0,
      );
      expect(renderedWithComments.result.current.accountComments.length).toBe(0);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: originalPublishComment,
        },
      }));
    });

    test(`abandon before publishComment rejects: catch block early-return does not set errors`, async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      let rejectPublish: (e: Error) => void = () => {};
      const rejectPromise = new Promise<never>((_, reject) => {
        rejectPublish = reject;
      });
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: () => rejectPromise,
        },
      }));

      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... actions.test",
        parentCid: "Qm... actions.test",
        content: "abandon before reject test",
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      const publishPromise = act(async () => {
        rendered.result.current.publishComment();
      });
      await act(async () => {
        await rendered.result.current.abandonPublish();
      });
      rejectPublish(new Error("publish failed"));
      await publishPromise;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(rendered.result.current.errors.length).toBe(0);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: originalPublishComment,
        },
      }));
    });

    test("usePublishComment catch when publishComment throws (not abandoned) sets errors and calls onError", async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      const onError = vi.fn();
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: () => Promise.reject(new Error("publish failed")),
        },
      }));

      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... actions.test",
        parentCid: "Qm... actions.test",
        content: "catch test",
        onError,
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishComment();
      });
      await waitFor(() => rendered.result.current.errors.length >= 1);
      expect(rendered.result.current.errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledTimes(1);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: originalPublishComment,
        },
      }));
    });

    test("usePublishComment catch when publishComment throws without onError still sets errors", async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: () => Promise.reject(new Error("publish failed")),
        },
      }));

      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... actions.test",
        parentCid: "Qm... actions.test",
        content: "catch no onError test",
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishComment();
      });
      await waitFor(() => rendered.result.current.errors.length >= 1);
      expect(rendered.result.current.errors.length).toBe(1);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishComment: originalPublishComment,
        },
      }));
    });

    test(`abandon is idempotent-safe (second call no-ops or fails predictably, does not corrupt state)`, async () => {
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "idempotent abandon test",
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishComment();
      });

      await waitFor(() => rendered.result.current.state === "waiting-challenge-answers");
      expect(rendered.result.current.state).toBe("waiting-challenge-answers");

      await act(async () => {
        await rendered.result.current.abandonPublish();
      });
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.index).toBe(undefined);

      // second abandon: no-op, state remains ready
      await act(async () => {
        await rendered.result.current.abandonPublish();
      });
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.index).toBe(undefined);
      expect(rendered.result.current.challenge).toBe(undefined);
    });

    test(`can publish post`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        title: "some title acions.test",
        link: "some link acions.test",
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishCommentOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishComment();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);
      expect(rendered.result.current.state).toBe("waiting-challenge-answers");

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(typeof rendered.result.current.index).toBe("number");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1].timestamp).toBe("number");
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1].timestamp).toBe("number");
    });

    test(`can error`, async () => {
      // mock the comment publish to error out
      const commentPublish = Comment.prototype.publish;
      Comment.prototype.publish = async function () {
        this.emit("error", Error("emit error"));
        throw Error("publish error");
      };

      const onError = vi.fn();
      const publishCommentOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "some content acions.test",
        onError,
      };
      rendered.rerender(publishCommentOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.error).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishComment();
      });

      // wait for error
      await waitFor(() => rendered.result.current.errors.length === 2);
      expect(rendered.result.current.errors.length).toBe(2);
      expect(rendered.result.current.error.message).toBe("publish error");
      expect(rendered.result.current.errors[0].message).toBe("emit error");
      expect(rendered.result.current.errors[1].message).toBe("publish error");

      // check callbacks
      expect(onError.mock.calls[0][0].message).toBe("emit error");
      expect(onError.mock.calls[1][0].message).toBe("publish error");

      // restore mock
      Comment.prototype.publish = commentPublish;
    });
  });

  // retry usePublish because publishing state is flaky
  describe("usePublishCommentEdit", { retry: 3 }, () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options) => {
        const result = usePublishCommentEdit(options);
        return result;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`can publish comment edit`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommentEditOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        spoiler: true,
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishCommentEditOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishCommentEdit();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1]).not.toBe(undefined);
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1]).not.toBe(undefined);
    });

    test(`can error`, async () => {
      // mock the comment edit publish to error out
      const commentEditPublish = CommentEdit.prototype.publish;
      CommentEdit.prototype.publish = async function () {
        this.emit("error", Error("emit error"));
        throw Error("publish error");
      };

      const onError = vi.fn();
      const publishCommentEditOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        spoiler: true,
        onError,
      };
      rendered.rerender(publishCommentEditOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.error).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishCommentEdit();
      });

      // wait for error
      await waitFor(() => rendered.result.current.errors.length === 2);
      expect(rendered.result.current.errors.length).toBe(2);
      expect(rendered.result.current.error.message).toBe("publish error");
      expect(rendered.result.current.errors[0].message).toBe("emit error");
      expect(rendered.result.current.errors[1].message).toBe("publish error");

      // check callbacks
      expect(onError.mock.calls[0][0].message).toBe("emit error");
      expect(onError.mock.calls[1][0].message).toBe("publish error");

      // restore mock
      CommentEdit.prototype.publish = commentEditPublish;
    });

    test("usePublishCommentEdit hook catch and onError when store throws", async () => {
      const originalPublishCommentEdit =
        useAccountsStore.getState().accountsActions.publishCommentEdit;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishCommentEdit: async () => {
            throw Error("store publishCommentEdit error");
          },
        },
      }));

      const onError = vi.fn();
      rendered.rerender({
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        spoiler: true,
        onError,
      });
      await waitFor(() => rendered.result.current.state === "ready");

      await act(async () => {
        await rendered.result.current.publishCommentEdit();
      });

      expect(rendered.result.current.errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledTimes(1);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishCommentEdit: originalPublishCommentEdit,
        },
      }));
    });
  });

  // retry usePublish because publishing state is flaky
  describe("usePublishCommentModeration", { retry: 3 }, () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options) => {
        const result = usePublishCommentModeration(options);
        return result;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`can publish comment moderation`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommentModerationOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        commentModeration: { locked: true },
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishCommentModerationOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishCommentModeration();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1]).not.toBe(undefined);
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1]).not.toBe(undefined);
    });

    test("can publish purge comment moderation", async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommentModerationOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        commentModeration: { purged: true },
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishCommentModerationOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishCommentModeration();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1]).not.toBe(undefined);
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1]).not.toBe(undefined);
    });

    test(`can error`, async () => {
      // mock the comment edit publish to error out
      const commentModerationPublish = CommentModeration.prototype.publish;
      CommentModeration.prototype.publish = async function () {
        this.emit("error", Error("emit error"));
        throw Error("publish error");
      };

      const onError = vi.fn();
      const publishCommentModerationOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        commentModeration: { locked: true },
        onError,
      };
      rendered.rerender(publishCommentModerationOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.error).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishCommentModeration();
      });

      // wait for error
      await waitFor(() => rendered.result.current.errors.length === 2);
      expect(rendered.result.current.errors.length).toBe(2);
      expect(rendered.result.current.error.message).toBe("publish error");
      expect(rendered.result.current.errors[0].message).toBe("emit error");
      expect(rendered.result.current.errors[1].message).toBe("publish error");

      // check callbacks
      expect(onError.mock.calls[0][0].message).toBe("emit error");
      expect(onError.mock.calls[1][0].message).toBe("publish error");

      // restore mock
      CommentModeration.prototype.publish = commentModerationPublish;
    });

    test("usePublishCommentModeration hook catch and onError when store throws", async () => {
      const original = useAccountsStore.getState().accountsActions.publishCommentModeration;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishCommentModeration: async () => {
            throw Error("store publishCommentModeration error");
          },
        },
      }));

      const onError = vi.fn();
      rendered.rerender({
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        commentModeration: { locked: true },
        onError,
      });
      await waitFor(() => rendered.result.current.state === "ready");

      await act(async () => {
        await rendered.result.current.publishCommentModeration();
      });

      expect(rendered.result.current.errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledTimes(1);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishCommentModeration: original,
        },
      }));
    });
  });

  // retry usePublish because publishing state is flaky
  describe("usePublishSubplebbitEdit", { retry: 3 }, () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options) => {
        const result = usePublishSubplebbitEdit(options);
        return result;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`can publish subplebbit edit`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishSubplebbitEditOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        title: "new title",
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishSubplebbitEditOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishSubplebbitEdit();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1]).not.toBe(undefined);
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1]).not.toBe(undefined);
    });

    test(`can error`, async () => {
      // mock the subplebbit edit publish to error out
      const subplebbitEditPublish = SubplebbitEdit.prototype.publish;
      SubplebbitEdit.prototype.publish = async function () {
        this.emit("error", Error("emit error"));
        throw Error("publish error");
      };

      const onError = vi.fn();
      const publishSubplebbitEditOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        title: "new title",
        onError,
      };
      rendered.rerender(publishSubplebbitEditOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.error).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishSubplebbitEdit();
      });

      // wait for error
      await waitFor(() => rendered.result.current.errors.length === 2);
      expect(rendered.result.current.errors.length).toBe(2);
      expect(rendered.result.current.error.message).toBe("publish error");
      expect(rendered.result.current.errors[0].message).toBe("emit error");
      expect(rendered.result.current.errors[1].message).toBe("publish error");

      // check callbacks
      expect(onError.mock.calls[0][0].message).toBe("emit error");
      expect(onError.mock.calls[1][0].message).toBe("publish error");

      // restore mock
      SubplebbitEdit.prototype.publish = subplebbitEditPublish;
    });

    test("usePublishSubplebbitEdit hook catch and onError when store throws", async () => {
      const original = useAccountsStore.getState().accountsActions.publishSubplebbitEdit;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishSubplebbitEdit: async () => {
            throw Error("store publishSubplebbitEdit error");
          },
        },
      }));

      const onError = vi.fn();
      rendered.rerender({
        subplebbitAddress: "12D3KooW... acions.test",
        title: "new title",
        onError,
      });
      await waitFor(() => rendered.result.current.state === "ready");

      await act(async () => {
        await rendered.result.current.publishSubplebbitEdit();
      });

      expect(rendered.result.current.errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledTimes(1);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishSubplebbitEdit: original,
        },
      }));
    });
  });

  // retry usePublish because publishing state is flaky
  describe("usePublishVote", { retry: 3 }, () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options) => {
        const result = usePublishVote(options);
        const accountVote = useAccountVote({ commentCid: options?.commentCid });
        return { ...result, accountVote };
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`publishChallengeAnswers throws when challenge not yet received`, async () => {
      const publishVoteOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        vote: 1,
      };
      rendered.rerender(publishVoteOptions);
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.challenge).toBeUndefined();
      await expect(rendered.result.current.publishChallengeAnswers(["4"])).rejects.toThrow(
        /can't call publishChallengeAnswers/,
      );
    });

    test(`can publish vote`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishVoteOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        vote: 1,
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishVoteOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.accountVote.vote).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishVote();
      });

      await waitFor(() => rendered.result.current.state === "publishing-challenge-request");
      expect(rendered.result.current.state).toBe("publishing-challenge-request");
      expect(rendered.result.current.accountVote.vote).toBe(1);

      // wait for challenge
      await waitFor(() => rendered.result.current.challenge);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.challenge.challenges).toEqual([
        { challenge: "2+2=?", type: "text" },
      ]);

      // publish challenge verification
      act(() => {
        rendered.result.current.publishChallengeAnswers(["4"]);
      });

      await waitFor(
        () =>
          rendered.result.current.state === "publishing-challenge-answer" ||
          rendered.result.current.state === "waiting-challenge-verification" ||
          rendered.result.current.state === "succeeded",
      );

      // wait for challenge verification
      await waitFor(() => rendered.result.current.challengeVerification);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.challengeVerification.challengeSuccess).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.accountVote.vote).toBe(1);

      // check callbacks
      expect(onChallenge.mock.calls[0][0].type).toBe("CHALLENGE");
      expect(typeof onChallenge.mock.calls[0][1]).not.toBe(undefined);
      expect(onChallengeVerification.mock.calls[0][0].type).toBe("CHALLENGEVERIFICATION");
      expect(typeof onChallengeVerification.mock.calls[0][1]).not.toBe(undefined);
    });

    test(`can error`, async () => {
      // mock the vote publish to error out
      const votePublish = Vote.prototype.publish;
      Vote.prototype.publish = async function () {
        this.emit("error", Error("emit error"));
        throw Error("publish error");
      };

      const onError = vi.fn();
      const publishVoteOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        vote: 1,
        onError,
      };
      rendered.rerender(publishVoteOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.error).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishVote();
      });

      // wait for error
      expect(rendered.result.current.errors.length).toBe(2);
      expect(rendered.result.current.error.message).toBe("publish error");
      expect(rendered.result.current.errors[0].message).toBe("emit error");
      expect(rendered.result.current.errors[1].message).toBe("publish error");

      // check callbacks
      expect(onError.mock.calls[0][0].message).toBe("emit error");
      expect(onError.mock.calls[1][0].message).toBe("publish error");

      // restore mock
      Vote.prototype.publish = votePublish;
    });

    test("usePublishVote catch when publishVote throws", async () => {
      const original = useAccountsStore.getState().accountsActions.publishVote;
      useAccountsStore.setState((s: any) => ({
        ...s,
        accountsActions: {
          ...s.accountsActions,
          publishVote: async () => {
            throw Error("publishVote threw");
          },
        },
      }));

      const testRendered = renderHook(() =>
        usePublishVote({
          subplebbitAddress: "12D3KooW... acions.test",
          commentCid: "Qm... acions.test",
          vote: 1,
        }),
      );
      const testWaitFor = testUtils.createWaitFor(testRendered);
      await testWaitFor(() => testRendered.result.current.state === "ready");
      await act(async () => {
        await testRendered.result.current.publishVote();
      });
      expect(testRendered.result.current.errors.length).toBe(1);
      expect(testRendered.result.current.error?.message).toBe("publishVote threw");

      useAccountsStore.setState((s: any) => ({
        ...s,
        accountsActions: { ...s.accountsActions, publishVote: original },
      }));
    });

    test("publishVote with no onChallenge/onChallengeVerification completes successfully", async () => {
      const publishVoteOptions = {
        subplebbitAddress: "12D3KooW... acions.test",
        commentCid: "Qm... acions.test",
        vote: 1,
      };
      rendered.rerender(publishVoteOptions);
      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishVote();
      });
      await waitFor(() => rendered.result.current.challenge);
      act(() => rendered.result.current.publishChallengeAnswers(["4"]));
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.error).toBe(undefined);
    });
  });
});
