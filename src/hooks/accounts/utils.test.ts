import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useCalculatedNotifications,
  useCalculatedAccountsNotifications,
  useAccountWithCalculatedProperties,
  useAccountsWithCalculatedProperties,
} from "./utils";
import { setPlebbitJs } from "../..";
import PlebbitJsMock from "../../lib/plebbit-js/plebbit-js-mock";

describe("accounts utils", () => {
  beforeAll(async () => {
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();
  });

  describe("useCalculatedNotifications", () => {
    test("returns empty when account undefined", () => {
      const { result } = renderHook(() => useCalculatedNotifications(undefined, { id1: {} }));
      expect(result.current).toEqual([]);
    });

    test("returns empty when accountCommentsReplies undefined", () => {
      const { result } = renderHook(() =>
        useCalculatedNotifications({ id: "id1" } as any, undefined),
      );
      expect(result.current).toEqual([]);
    });

    test("filters by blockedAddresses and blockedCids", () => {
      const account = {
        id: "id1",
        blockedAddresses: { "blocked.eth": true },
        blockedCids: { "blocked-cid": true },
      } as any;
      const accountCommentsReplies = {
        reply1: {
          cid: "reply1",
          subplebbitAddress: "blocked.eth",
          parentCid: "p1",
          postCid: "post1",
          timestamp: 1,
        },
        reply2: {
          cid: "blocked-cid",
          subplebbitAddress: "ok.eth",
          parentCid: "p2",
          postCid: "post2",
          timestamp: 2,
        },
        reply3: {
          cid: "reply3",
          subplebbitAddress: "ok.eth",
          parentCid: "blocked-cid",
          postCid: "post3",
          timestamp: 3,
        },
        reply4: {
          cid: "reply4",
          subplebbitAddress: "ok.eth",
          parentCid: "p4",
          postCid: "blocked-cid",
          timestamp: 4,
        },
        reply5: {
          cid: "reply5",
          subplebbitAddress: "ok.eth",
          parentCid: "p5",
          postCid: "post5",
          author: { address: "blocked.eth" },
          timestamp: 5,
        },
        reply6: {
          cid: "reply6",
          subplebbitAddress: "ok.eth",
          parentCid: "p6",
          postCid: "post6",
          timestamp: 6,
        },
      } as any;
      const { result } = renderHook(() =>
        useCalculatedNotifications(account, accountCommentsReplies),
      );
      expect(result.current.length).toBe(1);
      expect(result.current[0].cid).toBe("reply6");
    });
  });

  describe("useCalculatedAccountsNotifications", () => {
    test("returns empty when accountsCommentsReplies undefined", () => {
      const { result } = renderHook(() =>
        useCalculatedAccountsNotifications({ id1: {} } as any, undefined),
      );
      expect(result.current).toEqual({});
    });

    test("returns notifications per account when accounts and accountsCommentsReplies provided", () => {
      const accounts = {
        id1: { id: "id1", blockedAddresses: {}, blockedCids: {} },
      } as any;
      const accountsCommentsReplies = {
        id1: {
          reply1: {
            cid: "reply1",
            subplebbitAddress: "s1",
            parentCid: "p1",
            postCid: "post1",
            timestamp: 1,
          },
        },
      } as any;
      const { result } = renderHook(() =>
        useCalculatedAccountsNotifications(accounts, accountsCommentsReplies),
      );
      expect(Object.keys(result.current)).toContain("id1");
      expect(result.current.id1.length).toBe(1);
    });
  });

  describe("useAccountWithCalculatedProperties", () => {
    test("returns undefined when account undefined", () => {
      const { result } = renderHook(() => useAccountWithCalculatedProperties(undefined, [], {}));
      expect(result.current).toBeUndefined();
    });

    test("adds shortAddress when account has author.address", async () => {
      const account = {
        id: "id1",
        author: { address: "0x1234567890abcdef1234567890abcdef12345678" },
      } as any;
      const { result } = renderHook(() => useAccountWithCalculatedProperties(account, [], {}));
      await new Promise((r) => setTimeout(r, 150));
      expect(result.current?.author?.shortAddress).toBeDefined();
    });

    test("returns account without shortAddress when author.address missing", () => {
      const account = { id: "id1", author: { address: undefined } } as any;
      const { result } = renderHook(() => useAccountWithCalculatedProperties(account, [], {}));
      expect(result.current?.id).toBe("id1");
      expect(result.current?.author?.shortAddress).toBeUndefined();
    });
  });

  describe("useAccountsWithCalculatedProperties", () => {
    test("returns undefined when accounts undefined", () => {
      const { result } = renderHook(() => useAccountsWithCalculatedProperties(undefined, {}, {}));
      expect(result.current).toBeUndefined();
    });

    test("returns accounts when accountsComments undefined", () => {
      const accounts = {
        id1: {
          id: "id1",
          name: "Account 1",
          author: { address: "0x1234567890abcdef1234567890abcdef12345678" },
        },
      } as any;
      const { result } = renderHook(() =>
        useAccountsWithCalculatedProperties(accounts, undefined, {}),
      );
      expect(result.current).toBeDefined();
      expect(result.current?.id1?.name).toBe("Account 1");
    });

    test("adds shortAddress when account has author and shortAddresses populated", async () => {
      const accounts = {
        id1: {
          id: "id1",
          name: "Account 1",
          author: { address: "0x1234567890abcdef1234567890abcdef12345678" },
        },
      } as any;
      const accountsComments = { id1: [] };
      const accountsCommentsReplies = { id1: {} };
      const { result } = renderHook(() =>
        useAccountsWithCalculatedProperties(accounts, accountsComments, accountsCommentsReplies),
      );
      await new Promise((r) => setTimeout(r, 200));
      expect(result.current?.id1?.author?.shortAddress).toBeDefined();
    });

    test("preserves existing shortAddress when no new shortAddress is available", () => {
      const accounts = {
        id1: {
          id: "id1",
          name: "Account 1",
          author: { shortAddress: "existing-short" },
        },
      } as any;
      const accountsComments = { id1: [] };
      const accountsCommentsReplies = { id1: {} };
      const { result } = renderHook(() =>
        useAccountsWithCalculatedProperties(accounts, accountsComments, accountsCommentsReplies),
      );
      expect(result.current?.id1?.author?.shortAddress).toBe("existing-short");
    });

    test("skips shortAddress when account has no author", () => {
      const accounts = {
        id1: { id: "id1", name: "Account 1", author: undefined },
      } as any;
      const accountsComments = { id1: [] };
      const accountsCommentsReplies = {};
      const { result } = renderHook(() =>
        useAccountsWithCalculatedProperties(accounts, accountsComments, accountsCommentsReplies),
      );
      expect(result.current?.id1?.id).toBe("id1");
      expect(result.current?.id1?.author).toBeUndefined();
    });

    test("getAccountCalculatedProperties with undefined notifications uses empty array", () => {
      const accounts = { id1: { id: "id1", author: { address: "0x123" } } } as any;
      const accountsComments = { id1: [] };
      const accountsCommentsReplies = {};
      const { result } = renderHook(() =>
        useAccountsWithCalculatedProperties(accounts, accountsComments, accountsCommentsReplies),
      );
      expect(result.current?.id1?.unreadNotificationCount).toBe(0);
    });
  });
});
