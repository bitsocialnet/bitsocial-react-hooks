import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useSubscribe,
  usePublishComment,
  usePublishCommentEdit,
  usePublishCommentModeration,
  usePublishCommunityEdit,
  usePublishVote,
  useBlock,
  useSaveComment,
  useAccount,
  useCreateCommunity,
  useExportCommunity,
  setPkcJs,
  useAccountVote,
  useAccountComments,
  exportAccount,
} from "../..";
import {
  handlePublishErrorWhenAbandoned,
  handlePublishVoteError,
  withGuardActive,
} from "./actions";
import PkcJsMock, {
  PKC,
  Comment,
  CommentEdit,
  CommentModeration,
  CommunityEdit,
  Vote,
  Community,
  Pages,
  resetPkcJsMock,
  debugPkcJsMock,
} from "../../lib/pkc-js/pkc-js-mock";
import useAccountsStore from "../../stores/accounts";
import accountsDatabase from "../../stores/accounts/accounts-database";

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
    // set pkc-js mock and reset dbs
    setPkcJs(PkcJsMock);
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

    test(`subscribe and unsubscribe to community`, async () => {
      const communityAddress = "tosubscribeto.eth";
      const communityAddress2 = "tosubscribeto2.eth";

      expect(rendered.result.current[0].state).toBe("initializing");
      expect(rendered.result.current[0].subscribed).toBe(undefined);
      expect(typeof rendered.result.current[0].subscribe).toBe("function");
      expect(typeof rendered.result.current[0].unsubscribe).toBe("function");

      // get the default value
      rendered.rerender([{ communityAddress }]);
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
      rendered.rerender([{ communityAddress }, { communityAddress: communityAddress2 }]);
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
        useSubscribe({ communityAddress: communityAddress2 }),
      );
      const waitFor2 = testUtils.createWaitFor(rendered2);
      await waitFor2(() => rendered2.result.current.state === "ready");
      expect(rendered2.result.current.state).toBe("ready");
      expect(rendered2.result.current.subscribed).toBe(true);
    });

    test("useSubscribe onError callback when subscribe fails", async () => {
      const onError = vi.fn();
      rendered.rerender([{ communityAddress: "tosubscribeto.eth", onError }]);
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
      rendered.rerender([{ communityAddress: "tosubscribeto.eth", onError }]);
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

    test(`block and unblock two addresses (community addresses)`, async () => {
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

  describe("useSaveComment", () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options = {}) => useSaveComment(options));
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("saves, unsaves, orders, exports, and persists comments", async () => {
      expect(rendered.result.current.state).toBe("initializing");
      expect(rendered.result.current.saved).toBe(undefined);

      rendered.rerender({ commentCid: "comment-1" });
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.saved).toBe(false);

      await act(async () => {
        await rendered.result.current.saveComment();
      });
      await waitFor(() => rendered.result.current.saved === true);

      rendered.rerender({ commentCid: "comment-2" });
      await act(async () => {
        await rendered.result.current.saveComment();
      });
      await waitFor(() => rendered.result.current.saved === true);

      const exported = JSON.parse(await exportAccount());
      expect(exported.account.savedComments).toEqual(["comment-2", "comment-1"]);

      await act(async () => {
        await rendered.result.current.unsaveComment();
      });
      await waitFor(() => rendered.result.current.saved === false);

      await testUtils.resetStores();
      const persisted = renderHook(() => useSaveComment({ commentCid: "comment-1" }));
      const waitForPersisted = testUtils.createWaitFor(persisted);
      await waitForPersisted(() => persisted.result.current.state === "ready");
      expect(persisted.result.current.saved).toBe(true);
    });

    test("reports duplicate save and unsave errors", async () => {
      const onError = vi.fn();
      rendered.rerender({ commentCid: "comment-1", onError });
      await waitFor(() => rendered.result.current.state === "ready");

      await act(async () => {
        await rendered.result.current.saveComment();
        await rendered.result.current.saveComment();
      });
      expect(rendered.result.current.errors).toHaveLength(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      await act(async () => {
        await rendered.result.current.unsaveComment();
        await rendered.result.current.unsaveComment();
      });
      expect(rendered.result.current.errors).toHaveLength(2);
      expect(onError).toHaveBeenCalledTimes(2);
    });

    test("reports persistence errors without changing saved state", async () => {
      const onError = vi.fn();
      const persistenceError = new Error("failed to persist saved comments");
      rendered.rerender({ commentCid: "comment-1", onError });
      await waitFor(() => rendered.result.current.state === "ready");

      const addAccountSpy = vi
        .spyOn(accountsDatabase, "addAccount")
        .mockRejectedValueOnce(persistenceError);
      await act(async () => {
        await rendered.result.current.saveComment();
      });

      expect(rendered.result.current.saved).toBe(false);
      expect(rendered.result.current.error).toBe(persistenceError);
      expect(onError).toHaveBeenCalledWith(persistenceError);
      addAccountSpy.mockRestore();
    });

    test("serializes concurrent saves for the same account", async () => {
      rendered.rerender({ commentCid: "comment-1" });
      await waitFor(() => rendered.result.current.state === "ready");

      const originalAddAccount = accountsDatabase.addAccount.bind(accountsDatabase);
      let releaseFirstSave: () => void = () => {};
      const firstSavePending = new Promise<void>((resolve) => {
        releaseFirstSave = resolve;
      });
      const addAccountSpy = vi
        .spyOn(accountsDatabase, "addAccount")
        .mockImplementationOnce(async (account) => {
          await firstSavePending;
          return originalAddAccount(account);
        });
      const accountsActions = useAccountsStore.getState().accountsActions;

      const firstSave = accountsActions.saveComment("comment-1");
      await vi.waitFor(() => expect(addAccountSpy).toHaveBeenCalledTimes(1));
      const secondSave = accountsActions.saveComment("comment-2");
      expect(addAccountSpy).toHaveBeenCalledTimes(1);

      releaseFirstSave();
      await Promise.all([firstSave, secondSave]);

      const exported = JSON.parse(await exportAccount());
      expect(exported.account.savedComments).toEqual(["comment-2", "comment-1"]);
      addAccountSpy.mockRestore();
    });

    test("saves and unsaves a named non-active account", async () => {
      rendered.rerender({ commentCid: "active-comment" });
      await waitFor(() => rendered.result.current.state === "ready");
      const accountsActions = useAccountsStore.getState().accountsActions;
      const activeAccountId = useAccountsStore.getState().activeAccountId;

      await accountsActions.createAccount("Saved Account");
      expect(useAccountsStore.getState().activeAccountId).toBe(activeAccountId);

      await accountsActions.saveComment("named-comment", "Saved Account");
      const namedSaved = JSON.parse(await accountsActions.exportAccount("Saved Account"));
      const activeSaved = JSON.parse(await accountsActions.exportAccount());
      expect(namedSaved.account.savedComments).toEqual(["named-comment"]);
      expect(activeSaved.account.savedComments).toEqual([]);

      await accountsActions.unsaveComment("named-comment", "Saved Account");
      const namedUnsaved = JSON.parse(await accountsActions.exportAccount("Saved Account"));
      expect(namedUnsaved.account.savedComments).toEqual([]);
    });
  });

  describe("useCreateCommunity", () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((useCreateCommunityOptions = []) => {
        const result1 = useCreateCommunity(useCreateCommunityOptions[0]);
        const result2 = useCreateCommunity(useCreateCommunityOptions[1]);
        return [result1, result2];
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`can create community`, async () => {
      expect(rendered.result.current[0].state).toBe("initializing");
      expect(rendered.result.current[0].createdCommunity).toBe(undefined);
      expect(typeof rendered.result.current[0].createCommunity).toBe("function");

      const options1 = {
        title: "title",
      };

      // add options
      rendered.rerender([options1]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].createdCommunity).toBe(undefined);

      // create community
      await act(async () => {
        await rendered.result.current[0].createCommunity();
      });
      await waitFor(() => rendered.result.current[0].createdCommunity);
      expect(rendered.result.current[0].state).toBe("succeeded");
      expect(rendered.result.current[0].createdCommunity?.title).toBe(options1.title);

      // useCreateCommunity 2 with same option not created
      rendered.rerender([options1, options1]);
      await waitFor(() => rendered.result.current[1].state === "ready");
      expect(rendered.result.current[1].state).toBe("ready");
      expect(rendered.result.current[1].createdCommunity).toBe(undefined);
    });

    test(`can error`, async () => {
      // mock the comment publish to error out
      const createCommunity = PKC.prototype.createCommunity;
      PKC.prototype.createCommunity = async () => {
        throw Error("create community error");
      };

      const options1 = {
        title: "title",
      };

      // add options
      rendered.rerender([options1]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].createdCommunity).toBe(undefined);

      // create community
      await act(async () => {
        await rendered.result.current[0].createCommunity();
      });
      // wait for error
      await waitFor(() => rendered.result.current[0].error);
      expect(rendered.result.current[0].error.message).toBe("create community error");
      expect(rendered.result.current[0].createdCommunity).toBe(undefined);
      expect(rendered.result.current[0].state).toBe("failed");
      expect(rendered.result.current[0].errors.length).toBe(1);

      // restore mock
      PKC.prototype.createCommunity = createCommunity;
    });

    test("useCreateCommunity onError callback when create fails", async () => {
      const createCommunity = PKC.prototype.createCommunity;
      PKC.prototype.createCommunity = async () => {
        throw Error("create community error");
      };

      const onError = vi.fn();
      rendered.rerender([{ title: "title", onError }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].createCommunity();
      });
      await waitFor(() => rendered.result.current[0].error);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      PKC.prototype.createCommunity = createCommunity;
    });
  });

  describe("useExportCommunity", () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options = []) => {
        const result1 = useExportCommunity(options[0]);
        const result2 = useExportCommunity(options[1]);
        return [result1, result2];
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("can export one community", async () => {
      const communityAddress = "export-one.eth";
      expect(rendered.result.current[0].communityExports).toEqual([]);
      expect(typeof rendered.result.current[0].exportCommunity).toBe("function");

      rendered.rerender([{ communityAddress }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].exportCommunity();
      });

      await waitFor(() => rendered.result.current[0].state === "succeeded");
      expect(rendered.result.current[0].communityExports).toEqual([
        {
          communityAddress,
          exportId: `${communityAddress} export 1`,
        },
      ]);
      expect(rendered.result.current[0].error).toBe(undefined);
    });

    test("is initializing while the account is unavailable", () => {
      const activeAccountId = useAccountsStore.getState().activeAccountId;
      useAccountsStore.setState({ activeAccountId: undefined });

      try {
        const initializing = renderHook(() =>
          useExportCommunity({ communityAddress: "initializing-export.eth" }),
        );
        expect(initializing.result.current.state).toBe("initializing");
      } finally {
        useAccountsStore.setState({ activeAccountId });
      }
    });

    test("returns initializing and hides stale exports when the account becomes unavailable", async () => {
      rendered.rerender([{ communityAddress: "logout-export.eth" }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].exportCommunity();
      });
      await waitFor(() => rendered.result.current[0].state === "succeeded");

      const activeAccountId = useAccountsStore.getState().activeAccountId;
      try {
        await act(async () => {
          useAccountsStore.setState({ activeAccountId: undefined });
        });

        expect(rendered.result.current[0].state).toBe("initializing");
        expect(rendered.result.current[0].communityExports).toEqual([]);
      } finally {
        useAccountsStore.setState({ activeAccountId });
      }
    });

    test("returns ready and hides stale exports when export targets change", async () => {
      rendered.rerender([{ communityAddress: "old-export-target.eth" }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].exportCommunity();
      });
      await waitFor(() => rendered.result.current[0].state === "succeeded");

      rendered.rerender([{ communityAddress: "new-export-target.eth" }]);

      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].communityExports).toEqual([]);

      rendered.rerender([{ communityAddress: "old-export-target.eth" }]);

      expect(rendered.result.current[0].state).toBe("ready");
      expect(rendered.result.current[0].communityExports).toEqual([]);
    });

    test("can export multiple communities", async () => {
      const communityAddresses = ["export-many-1.eth", "export-many-2.eth"];
      rendered.rerender([{ communityAddresses }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].exportCommunity();
      });

      await waitFor(() => rendered.result.current[0].state === "succeeded");
      expect(rendered.result.current[0].communityExports).toEqual([
        {
          communityAddress: communityAddresses[0],
          exportId: `${communityAddresses[0]} export 1`,
        },
        {
          communityAddress: communityAddresses[1],
          exportId: `${communityAddresses[1]} export 1`,
        },
      ]);
    });

    test("exports listed account communities when no address is provided", async () => {
      await act(async () => {
        await useAccountsStore.getState().accountsActions.createCommunity({ title: "Export all" });
      });

      rendered.rerender([undefined]);
      await waitFor(() => rendered.result.current[0].state === "ready");
      await act(async () => {
        await rendered.result.current[0].exportCommunity();
      });

      await waitFor(() => rendered.result.current[0].state === "succeeded");
      expect(rendered.result.current[0].communityExports).toEqual([
        {
          communityAddress: "list community address 1",
          exportId: "list community address 1 export 1",
        },
        {
          communityAddress: "list community address 2",
          exportId: "list community address 2 export 1",
        },
        {
          communityAddress: "created community address",
          exportId: "created community address export 1",
        },
      ]);
    });

    test("useExportCommunity onError callback when export fails", async () => {
      const original = useAccountsStore.getState().accountsActions.exportCommunity;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          exportCommunity: async () => {
            throw Error("store exportCommunity error");
          },
        },
      }));

      const onError = vi.fn();
      rendered.rerender([{ communityAddress: "export-error.eth", onError }]);
      await waitFor(() => rendered.result.current[0].state === "ready");

      await act(async () => {
        await rendered.result.current[0].exportCommunity();
      });

      expect(rendered.result.current[0].state).toBe("failed");
      expect(rendered.result.current[0].errors.length).toBe(1);
      expect(rendered.result.current[0].error.message).toBe("store exportCommunity error");
      expect(onError).toHaveBeenCalledWith(expect.any(Error));

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          exportCommunity: original,
        },
      }));
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
        communityAddress: "12D3KooW... acions.test",
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
      const onPendingComment = vi.fn();
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommentOptions = {
        communityAddress: "12D3KooW... acions.test",
        parentCid: "Qm... acions.test",
        content: "some content acions.test",
        onPendingComment,
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
      expect(onPendingComment).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          content: "some content acions.test",
          communityAddress: "12D3KooW... acions.test",
        }),
      );
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
        communityAddress: "12D3KooW... acions.test",
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

    test("onPendingComment does not run after abandoning the active publish", async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      const originalDeleteComment = useAccountsStore.getState().accountsActions.deleteComment;
      let forwardedOptions: any;
      let resolvePublish!: (value: { index: number }) => void;
      const pendingPublish = new Promise<{ index: number }>((resolve) => {
        resolvePublish = resolve;
      });
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          deleteComment: async () => {},
          publishComment: (options: any) => {
            forwardedOptions = options;
            return pendingPublish;
          },
        },
      }));
      const onPendingComment = vi.fn();

      try {
        rendered.rerender({
          communityAddress: "12D3KooW... actions.test abandon pending callback",
          content: "abandon pending callback",
          onPendingComment,
        });
        await waitFor(() => rendered.result.current.state === "ready");
        let publishPromise!: Promise<void>;
        act(() => {
          publishPromise = rendered.result.current.publishComment();
        });
        await waitFor(() => forwardedOptions);

        let abandonPromise!: Promise<void>;
        act(() => {
          abandonPromise = rendered.result.current.abandonPublish();
        });
        forwardedOptions.onPendingComment(0, { content: "too late" });
        expect(onPendingComment).not.toHaveBeenCalled();
        forwardedOptions._onPendingCommentIndex(0, { content: "too late" });
        await abandonPromise;

        resolvePublish({ index: 0 });
        await act(async () => {
          await publishPromise;
        });
      } finally {
        useAccountsStore.setState((state: any) => ({
          ...state,
          accountsActions: {
            ...state.accountsActions,
            publishComment: originalPublishComment,
            deleteComment: originalDeleteComment,
          },
        }));
      }
    });

    test("abandon from onPendingComment removes the comment after persistence starts", async () => {
      let abandonPromise: Promise<void> | undefined;
      const onPendingComment = vi.fn(() => {
        abandonPromise = rendered.result.current.abandonPublish();
      });

      rendered.rerender({
        communityAddress: "12D3KooW... actions.test abandon from pending callback",
        content: "abandon from pending callback",
        onPendingComment,
      });
      await waitFor(() => rendered.result.current.state === "ready");

      let publishPromise!: Promise<void>;
      act(() => {
        publishPromise = rendered.result.current.publishComment();
      });
      await waitFor(() => onPendingComment.mock.calls.length === 1);
      await act(async () => {
        await abandonPromise;
        await publishPromise;
      });

      await waitFor(() => rendered.result.current.state === "ready");
      await waitFor(() => {
        const { accountsComments, activeAccountId } = useAccountsStore.getState();
        return activeAccountId && accountsComments[activeAccountId]?.length === 0;
      });
      expect(rendered.result.current.index).toBeUndefined();
    });

    test("abandon from onPendingComment resolves after deferred deletion", async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      const originalDeleteComment = useAccountsStore.getState().accountsActions.deleteComment;
      let forwardedOptions: any;
      let resolvePublish!: (value: { index: number }) => void;
      let releaseDelete!: () => void;
      const pendingPublish = new Promise<{ index: number }>((resolve) => {
        resolvePublish = resolve;
      });
      const deleteBlocked = new Promise<void>((resolve) => {
        releaseDelete = resolve;
      });
      const deleteComment = vi.fn(async () => {
        await deleteBlocked;
      });
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          deleteComment,
          publishComment: (publishOptions: any) => {
            forwardedOptions = publishOptions;
            publishOptions.onPendingComment(1, { content: "pending deletion" });
            return pendingPublish;
          },
        },
      }));
      let abandonPromise: Promise<void> | undefined;

      try {
        rendered.rerender({
          communityAddress: "12D3KooW... actions.test deferred abandon",
          content: "pending deletion",
          onPendingComment: () => {
            abandonPromise = rendered.result.current.abandonPublish();
          },
        });
        await waitFor(() => rendered.result.current.state === "ready");
        let publishPromise!: Promise<void>;
        act(() => {
          publishPromise = rendered.result.current.publishComment();
        });
        await waitFor(() => abandonPromise !== undefined && forwardedOptions);

        let abandonSettled = false;
        void abandonPromise?.then(() => {
          abandonSettled = true;
        });
        forwardedOptions._onPendingCommentIndex(1, { content: "pending deletion" });
        await Promise.resolve();
        expect(deleteComment).toHaveBeenCalledWith(1, undefined);
        expect(abandonSettled).toBe(false);

        releaseDelete();
        await abandonPromise;
        expect(abandonSettled).toBe(true);
        resolvePublish({ index: 1 });
        await publishPromise;
      } finally {
        useAccountsStore.setState((state: any) => ({
          ...state,
          accountsActions: {
            ...state.accountsActions,
            publishComment: originalPublishComment,
            deleteComment: originalDeleteComment,
          },
        }));
      }
    });

    test("abandon from a second publish does not delete the previous comment", async () => {
      rendered.rerender({
        communityAddress: "12D3KooW... actions.test sequential pending callbacks",
        content: "first sequential comment",
        onChallenge: (_challenge: any, comment: any) => comment.publishChallengeAnswers(),
      });
      await waitFor(() => rendered.result.current.state === "ready");
      await act(async () => {
        await rendered.result.current.publishComment();
      });
      await waitFor(() => rendered.result.current.state === "succeeded");
      await waitFor(() => {
        const { accountsComments, activeAccountId } = useAccountsStore.getState();
        return activeAccountId && accountsComments[activeAccountId]?.length === 1;
      });

      let abandonPromise: Promise<void> | undefined;
      rendered.rerender({
        communityAddress: "12D3KooW... actions.test sequential pending callbacks",
        content: "second sequential comment",
        onPendingComment: () => {
          abandonPromise = rendered.result.current.abandonPublish();
        },
      });
      let publishPromise!: Promise<void>;
      act(() => {
        publishPromise = rendered.result.current.publishComment();
      });
      await waitFor(() => abandonPromise !== undefined);
      await act(async () => {
        await abandonPromise;
        await publishPromise;
      });

      const { accountsComments, activeAccountId } = useAccountsStore.getState();
      expect(activeAccountId && accountsComments[activeAccountId]).toEqual([
        expect.objectContaining({ content: "first sequential comment" }),
      ]);
    });

    test("publish callbacks continue after the hook unmounts", async () => {
      const originalPublishComment = useAccountsStore.getState().accountsActions.publishComment;
      const originalDeleteComment = useAccountsStore.getState().accountsActions.deleteComment;
      let forwardedOptions: any;
      let resolvePublish!: (value: { index: number }) => void;
      const pendingPublish = new Promise<{ index: number }>((resolve) => {
        resolvePublish = resolve;
      });
      const deleteComment = vi.fn(async () => {});
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          deleteComment,
          publishComment: (options: any) => {
            forwardedOptions = options;
            return pendingPublish;
          },
        },
      }));
      const onPendingComment = vi.fn();
      let abandonPromise: Promise<void> | undefined;
      let abandonPublish: (() => Promise<void>) | undefined;
      const onChallenge = vi.fn(() => {
        abandonPromise = abandonPublish?.();
      });

      try {
        rendered.rerender({
          communityAddress: "12D3KooW... actions.test unmount pending callback",
          content: "unmount pending callback",
          onPendingComment,
          onChallenge,
        });
        await waitFor(() => rendered.result.current.state === "ready");
        let publishPromise!: Promise<void>;
        act(() => {
          publishPromise = rendered.result.current.publishComment();
        });
        await waitFor(() => forwardedOptions);
        abandonPublish = rendered.result.current.abandonPublish;

        rendered.unmount();
        forwardedOptions.onPendingComment(0, { content: "too late" });
        forwardedOptions._onPendingCommentIndex(0, { content: "too late" });
        forwardedOptions.onChallenge({ type: "CHALLENGE" }, { content: "too late" });
        expect(onPendingComment).toHaveBeenCalledWith(0, { content: "too late" });
        expect(onChallenge).toHaveBeenCalledWith({ type: "CHALLENGE" }, { content: "too late" });
        await abandonPromise;
        expect(deleteComment).toHaveBeenCalledWith(0, undefined);

        resolvePublish({ index: 0 });
        await publishPromise;
      } finally {
        useAccountsStore.setState((state: any) => ({
          ...state,
          accountsActions: {
            ...state.accountsActions,
            publishComment: originalPublishComment,
            deleteComment: originalDeleteComment,
          },
        }));
      }
    });

    test(`abandon during waiting-challenge-answers removes pending local comment and returns hook state to ready`, async () => {
      const publishCommentOptions = {
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... actions.test early abandon",
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
        communityAddress: "12D3KooW... actions.test",
        parentCid: "Qm... actions.test",
        content: "abandon before reject test",
      };
      rendered.rerender(publishCommentOptions);

      await waitFor(() => rendered.result.current.state === "ready");
      let publishPromise!: Promise<void>;
      act(() => {
        publishPromise = rendered.result.current.publishComment();
      });
      let abandonPromise!: Promise<void>;
      act(() => {
        abandonPromise = rendered.result.current.abandonPublish();
      });
      rejectPublish(new Error("publish failed"));
      await Promise.all([publishPromise, abandonPromise]);
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
        communityAddress: "12D3KooW... actions.test",
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
      await expect(rendered.result.current.abandonPublish()).resolves.toBeUndefined();

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
        communityAddress: "12D3KooW... actions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
      await waitFor(() => rendered.result.current.errors.length === 1);
      expect(rendered.result.current.errors.length).toBe(1);
      expect(rendered.result.current.error.message).toBe("emit error");
      expect(rendered.result.current.errors[0].message).toBe("emit error");

      // check callbacks
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe("emit error");

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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
  describe("usePublishCommunityEdit", { retry: 3 }, () => {
    let rendered: any, waitFor: Function;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options) => {
        const result = usePublishCommunityEdit(options);
        return result;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test(`can publish community edit`, async () => {
      const onChallenge = vi.fn();
      const onChallengeVerification = vi.fn();
      const publishCommunityEditOptions = {
        communityAddress: "12D3KooW... acions.test",
        title: "new title",
        onChallenge,
        onChallengeVerification,
      };
      rendered.rerender(publishCommunityEditOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");

      // publish
      await act(async () => {
        await rendered.result.current.publishCommunityEdit();
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
      // mock the community edit publish to error out
      const communityEditPublish = CommunityEdit.prototype.publish;
      CommunityEdit.prototype.publish = async function () {
        this.emit("error", Error("emit error"));
        throw Error("publish error");
      };

      const onError = vi.fn();
      const publishCommunityEditOptions = {
        communityAddress: "12D3KooW... acions.test",
        title: "new title",
        onError,
      };
      rendered.rerender(publishCommunityEditOptions);

      // wait for ready
      await waitFor(() => rendered.result.current.state === "ready");
      expect(rendered.result.current.state).toBe("ready");
      expect(rendered.result.current.error).toBe(undefined);

      // publish
      await act(async () => {
        await rendered.result.current.publishCommunityEdit();
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
      CommunityEdit.prototype.publish = communityEditPublish;
    });

    test("usePublishCommunityEdit hook catch and onError when store throws", async () => {
      const original = useAccountsStore.getState().accountsActions.publishCommunityEdit;
      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishCommunityEdit: async () => {
            throw Error("store publishCommunityEdit error");
          },
        },
      }));

      const onError = vi.fn();
      rendered.rerender({
        communityAddress: "12D3KooW... acions.test",
        title: "new title",
        onError,
      });
      await waitFor(() => rendered.result.current.state === "ready");

      await act(async () => {
        await rendered.result.current.publishCommunityEdit();
      });

      expect(rendered.result.current.errors.length).toBe(1);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledTimes(1);

      useAccountsStore.setState((state: any) => ({
        ...state,
        accountsActions: {
          ...state.accountsActions,
          publishCommunityEdit: original,
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

    test(`abandonPublish reverts the account vote and clears the challenge`, async () => {
      const publishVoteOptions = {
        communityAddress: "12D3KooW... acions.test",
        commentCid: "Qm... abandon.test",
        vote: 1,
        // never answer the challenge so the vote stays abandonable
        onChallenge: vi.fn(),
        onChallengeVerification: vi.fn(),
      };
      rendered.rerender(publishVoteOptions);
      await waitFor(() => rendered.result.current.state === "ready");

      await act(async () => {
        await rendered.result.current.publishVote();
      });
      await waitFor(() => rendered.result.current.challenge !== undefined);
      expect(rendered.result.current.accountVote.vote).toBe(1);

      await act(async () => {
        await rendered.result.current.abandonPublish();
      });

      await waitFor(() => rendered.result.current.accountVote.vote === 0);
      expect(rendered.result.current.accountVote.vote).toBe(0);
      expect(rendered.result.current.challenge).toBe(undefined);
      expect(publishVoteOptions.onChallengeVerification).not.toHaveBeenCalled();
    });

    test(`abandonPublish without a commentCid does not throw`, async () => {
      rendered.rerender({ communityAddress: "12D3KooW... acions.test", vote: 1 });
      await waitFor(() => rendered.result.current.state === "ready");
      await expect(rendered.result.current.abandonPublish()).resolves.toBeUndefined();
    });

    test(`publishChallengeAnswers throws when challenge not yet received`, async () => {
      const publishVoteOptions = {
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
          communityAddress: "12D3KooW... acions.test",
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
        communityAddress: "12D3KooW... acions.test",
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
