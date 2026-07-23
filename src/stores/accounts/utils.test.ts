import utils from "./utils";
import { COMMENT_MODERATION_AUTHOR_SUMMARY_KEY } from "./utils";
import { Role } from "../../types";
import commentsStore from "../comments";
import repliesPagesStore from "../replies-pages";
import communitiesPagesStore from "../communities-pages";
import repliesCommentsStore from "../replies/replies-comments-store";
import PkcJsModule, { setPkcJs, restorePkcJs } from "../../lib/pkc-js";
import PkcJsMock from "../../lib/pkc-js/pkc-js-mock";

describe("accountsStore utils", () => {
  const author = { address: "author address" };
  const adminRole: Role = { role: "admin" };
  const moderatorRole: Role = { role: "moderator" };

  describe("getAccountCommunities", () => {
    test("empty", async () => {
      const account = { author };
      const communities = {};
      const accountCommunities = utils.getAccountCommunities(account, communities);
      expect(accountCommunities).toEqual({});
    });

    test("previous account communities, no new account communities", async () => {
      const previousAccountCommunities = {
        communityAddress1: {
          role: adminRole,
        },
      };
      const account = { author, communities: previousAccountCommunities };
      const communities = {};
      const accountCommunities = utils.getAccountCommunities(account, communities);
      expect(accountCommunities).toEqual(previousAccountCommunities);
    });

    test("community with roles for other addresses skips author (branch 22)", async () => {
      const account = { author };
      const communities = {
        communityAddress1: {
          roles: {
            "other-address": moderatorRole,
          },
        },
        communityAddress2: {
          roles: {},
        },
      };
      const accountCommunities = utils.getAccountCommunities(account, communities);
      expect(accountCommunities).toEqual({});
    });

    test("no previous account communities, new account communities", async () => {
      const account = { author };
      const communities = {
        communityAddress1: {
          roles: {
            [author.address]: moderatorRole,
          },
        },
        communityAddress2: {
          roles: {
            [author.address]: adminRole,
          },
        },
      };
      const accountCommunities = utils.getAccountCommunities(account, communities);
      const expectedAccountCommunities = {
        communityAddress1: {
          role: moderatorRole,
        },
        communityAddress2: {
          role: adminRole,
        },
      };
      expect(accountCommunities).toEqual(expectedAccountCommunities);
    });

    test("previous account communities, new account communities", async () => {
      const previousAccountCommunities = {
        communityAddress1: {
          role: adminRole,
        },
      };
      const account = { author, communities: previousAccountCommunities };
      const communities = {
        communityAddress2: {
          roles: {
            [author.address]: adminRole,
          },
        },
      };
      const accountCommunities = utils.getAccountCommunities(account, communities);
      const expectedAccountCommunities = {
        communityAddress1: {
          role: adminRole,
        },
        communityAddress2: {
          role: adminRole,
        },
      };
      expect(accountCommunities).toEqual(expectedAccountCommunities);
    });

    test("previous account communities, new account community overwrites previous", async () => {
      const previousAccountCommunities = {
        communityAddress1: {
          role: adminRole,
        },
      };
      const account = { author, communities: previousAccountCommunities };
      const communities = {
        communityAddress1: {
          roles: {
            [author.address]: moderatorRole,
          },
        },
        communityAddress2: {
          roles: {
            [author.address]: adminRole,
          },
        },
      };
      const accountCommunities = utils.getAccountCommunities(account, communities);
      const expectedAccountCommunities = {
        communityAddress1: {
          role: moderatorRole,
        },
        communityAddress2: {
          role: adminRole,
        },
      };
      expect(accountCommunities).toEqual(expectedAccountCommunities);
    });
  });

  describe("getCommentCidsToAccountsComments", () => {
    test("builds map from cids to accountId and accountCommentIndex", () => {
      const accountsComments = {
        acc1: [
          { cid: "cid1", index: 0 },
          { cid: "cid2", index: 1 },
        ],
        acc2: [{ cid: "cid3", index: 0 }],
      };
      const result = utils.getCommentCidsToAccountsComments(accountsComments);
      expect(result).toEqual({
        cid1: { accountId: "acc1", accountCommentIndex: 0 },
        cid2: { accountId: "acc1", accountCommentIndex: 1 },
        cid3: { accountId: "acc2", accountCommentIndex: 0 },
      });
    });
    test("skips account comments without cid", () => {
      const accountsComments = {
        acc1: [
          { cid: null, index: 0 },
          { cid: "cid1", index: 1 },
        ],
      };
      const result = utils.getCommentCidsToAccountsComments(accountsComments);
      expect(result).toEqual({ cid1: { accountId: "acc1", accountCommentIndex: 1 } });
    });
  });

  describe("sanitizeStoredAccountComment", () => {
    test("sanitizeAccountCommentForState keeps live clients while dropping pages and raw", () => {
      const sanitized = utils.sanitizeAccountCommentForState({
        raw: { comment: { content: "raw-content" } },
        clients: { ipfsGateways: { best: { state: "fetching" } } },
        replies: {
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          pages: { best: { comments: [{ cid: "reply-1" }] } },
          pageCids: { best: "page-1" },
        },
      } as any);

      expect(sanitized.raw).toBeUndefined();
      expect(sanitized.clients).toEqual({ ipfsGateways: { best: { state: "fetching" } } });
      expect(sanitized.replies.pages).toBeUndefined();
      expect(sanitized.replies.clients).toEqual({
        ipfsGateways: { best: { state: "stopped" } },
      });
      expect(sanitized.replies.pageCids).toEqual({ best: "page-1" });
    });

    test("returns undefined for function values nested in arrays", () => {
      const sanitized = utils.sanitizeStoredAccountComment({
        flair: [() => "skip", "keep"],
      } as any);
      expect(sanitized.flair).toEqual(["keep"]);
    });

    test("removes runtime-only fields while keeping core render fields", () => {
      const sanitized = utils.sanitizeStoredAccountComment({
        signer: { privateKey: "secret" },
        onChallenge: () => {},
        clients: { ipfsGateways: { someGateway: { state: "stopped" } } },
        raw: { comment: { content: "raw-content" } },
        replies: {
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          pages: { best: { comments: [{ cid: "reply-1" }] } },
          pageCids: { best: "page-1" },
        },
      } as any);
      expect(sanitized.signer).toBeUndefined();
      expect(sanitized.onChallenge).toBeUndefined();
      expect(sanitized.clients).toBeUndefined();
      expect(sanitized.raw).toBeUndefined();
      expect(sanitized.replies.pages).toBeUndefined();
      expect(sanitized.replies.clients).toBeUndefined();
      expect(sanitized.replies.pageCids).toEqual({ best: "page-1" });
    });

    test("removes replies object entirely when pages was the only nested payload", () => {
      const sanitized = utils.sanitizeStoredAccountComment({
        replies: { pages: { best: { comments: [] } } },
      } as any);
      expect(sanitized.replies).toBeUndefined();
    });

    test("drops original snapshots for unedited comments", () => {
      const sanitized = utils.sanitizeStoredAccountComment({
        content: "current content",
        original: {
          content: "original content",
          signature: { signature: "sig" },
        },
      } as any);
      expect(sanitized.original).toBeUndefined();
    });

    test("keeps a compact original snapshot for edited comments", () => {
      const sanitized = utils.sanitizeStoredAccountComment({
        edit: true,
        content: "edited content",
        original: {
          content: "original content",
          title: "original title",
          author: {
            address: "author-address",
            wallets: {
              eth: {
                address: "0xabc",
              },
            },
          },
          signature: { signature: "sig" },
          raw: { comment: { content: "raw-content" } },
          clients: { ipfsGateways: { best: { state: "stopped" } } },
          replies: {
            pages: {
              best: {
                comments: [{ cid: "reply-1" }],
              },
            },
            pageCids: { best: "page-1" },
          },
        },
      } as any);

      expect(sanitized.original).toEqual({
        content: "original content",
        title: "original title",
        author: {
          address: "author-address",
        },
      });
    });
  });

  describe("comment indexes and edit summaries", () => {
    test("getAccountCommentsIndex handles undefined input", () => {
      expect(utils.getAccountCommentsIndex(undefined as any)).toEqual({
        byCommunityAddress: {},
        byParentCid: {},
      });
    });

    test("getAccountCommentsIndex skips comments without communityAddress or parentCid", () => {
      const index = utils.getAccountCommentsIndex([
        { index: 0, cid: "cid-1" },
        { index: 1, cid: "cid-2", communityAddress: "sub.eth" },
        { index: 2, cid: "cid-3", parentCid: "parent-cid" },
      ] as any);
      expect(index.byCommunityAddress).toEqual({ "sub.eth": [1] });
      expect(index.byParentCid).toEqual({ "parent-cid": [2] });
    });

    test("getAccountCommentsIndex appends repeated community and parent indexes", () => {
      const index = utils.getAccountCommentsIndex([
        { index: 0, communityAddress: "sub.eth", parentCid: "parent-cid" },
        { index: 1, communityAddress: "sub.eth", parentCid: "parent-cid" },
      ] as any);
      expect(index.byCommunityAddress["sub.eth"]).toEqual([0, 1]);
      expect(index.byParentCid["parent-cid"]).toEqual([0, 1]);
    });

    test("getAccountsCommentsIndexes builds indexes per account", () => {
      const indexes = utils.getAccountsCommentsIndexes({
        acc1: [{ index: 0, communityAddress: "sub.eth" }],
        acc2: [{ index: 1, parentCid: "parent-cid" }],
      } as any);
      expect(indexes.acc1.byCommunityAddress["sub.eth"]).toEqual([0]);
      expect(indexes.acc2.byParentCid["parent-cid"]).toEqual([1]);
    });

    test("getAccountEditPropertySummary merges nested edits and ignores stale or non-edit fields", () => {
      const summary = utils.getAccountEditPropertySummary([
        {
          commentCid: "cid-1",
          timestamp: 10,
          spoiler: false,
          author: { address: "addr" },
        },
        {
          commentCid: "cid-1",
          timestamp: 20,
          commentModeration: { removed: true },
        },
        {
          commentCid: "cid-1",
          timestamp: 15,
          spoiler: true,
        },
        {
          commentCid: "cid-1",
          timestamp: 12,
          spoiler: false,
        },
        {
          communityAddress: "sub.eth",
          timestamp: 25,
          communityEdit: { title: "edited title" },
        },
      ] as any);
      expect(summary.spoiler).toEqual({ timestamp: 15, value: true });
      expect(summary.removed).toEqual({ timestamp: 20, value: true });
      expect(summary.title).toEqual({ timestamp: 25, value: "edited title" });
      expect((summary as any).author).toBeUndefined();
    });

    test("getAccountEditPropertySummary preserves comment moderation author ban edits", () => {
      const summary = utils.getAccountEditPropertySummary([
        {
          commentCid: "cid-1",
          timestamp: 10,
          commentModeration: { author: { banExpiresAt: 20 } },
        },
        {
          commentCid: "cid-1",
          timestamp: 15,
          commentModeration: { author: undefined },
        },
      ] as any);

      expect(summary[COMMENT_MODERATION_AUTHOR_SUMMARY_KEY]).toEqual({
        timestamp: 15,
        value: undefined,
      });
      expect((summary as any).author).toBeUndefined();
    });

    test("getAccountEditPropertySummary handles undefined input", () => {
      expect(utils.getAccountEditPropertySummary(undefined as any)).toEqual({});
    });

    test("getAccountsEditsSummary handles empty targets", () => {
      expect(utils.getAccountsEditsSummary({} as any)).toEqual({});
    });

    test("getAccountsEditsSummary handles undefined input", () => {
      expect(utils.getAccountsEditsSummary(undefined as any)).toEqual({});
    });
  });

  describe("promiseAny", () => {
    test("rejects when given empty array", async () => {
      await expect(utils.promiseAny([])).rejects.toThrow("all promises rejected");
    });
  });

  describe("fetchCommentLinkDimensions", () => {
    test("returns empty for empty link", async () => {
      expect(await utils.fetchCommentLinkDimensions("")).toEqual({});
      expect(await utils.fetchCommentLinkDimensions(null as any)).toEqual({});
    });

    test("returns empty for non-https protocol", async () => {
      const result = await utils.fetchCommentLinkDimensions("http://example.com/image.png");
      expect(result).toEqual({});
    });

    test("returns image dimensions on image success", async () => {
      const OriginalImage = global.Image;
      (global as any).Image = class MockImage {
        width = 100;
        height = 80;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
        constructor() {
          setTimeout(() => this.onload?.(), 0);
        }
      };
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/img.png");
        expect(result).toEqual({ linkWidth: 100, linkHeight: 80, linkHtmlTagName: "img" });
      } finally {
        (global as any).Image = OriginalImage;
      }
    });

    test("returns video dimensions on video success", async () => {
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => {
        const el = createElement(tag);
        if (tag === "video") {
          Object.defineProperty(el, "videoWidth", { value: 640 });
          Object.defineProperty(el, "videoHeight", { value: 360 });
          Object.defineProperty(el, "muted", { writable: true, value: true });
          Object.defineProperty(el, "loop", { writable: true, value: false });
          (el as any).pause = () => {};
          setTimeout(() => el.dispatchEvent(new Event("loadeddata")), 0);
        }
        return el;
      }) as any;
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/vid.mp4");
        expect(result).toEqual({ linkWidth: 640, linkHeight: 360, linkHtmlTagName: "video" });
      } finally {
        document.createElement = createElement;
      }
    });

    test("returns audio tag name on audio success", async () => {
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => {
        const el = createElement(tag);
        if (tag === "audio") {
          (el as any).pause = () => {};
          setTimeout(() => el.dispatchEvent(new Event("loadeddata")), 0);
        }
        return el;
      }) as any;
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/audio.mp3");
        expect(result).toEqual({ linkHtmlTagName: "audio" });
      } finally {
        document.createElement = createElement;
      }
    });

    test("rejects zero-dimension video and falls through to audio", async () => {
      const OriginalImage = global.Image;
      (global as any).Image = class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
        constructor() {
          setTimeout(() => this.onerror?.(), 0);
        }
      };
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => {
        const el = createElement(tag);
        if (tag === "video") {
          Object.defineProperty(el, "videoWidth", { value: 0 });
          Object.defineProperty(el, "videoHeight", { value: 0 });
          (el as any).pause = () => {};
          setTimeout(() => el.dispatchEvent(new Event("loadeddata")), 0);
        }
        if (tag === "audio") {
          (el as any).pause = () => {};
          setTimeout(() => el.dispatchEvent(new Event("loadeddata")), 0);
        }
        return el;
      }) as any;
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/zero-vid.mp4");
        expect(result).toEqual({ linkHtmlTagName: "audio" });
      } finally {
        (global as any).Image = OriginalImage;
        document.createElement = createElement;
      }
    });

    test("rejects zero-dimension image and falls through to video or audio", async () => {
      const OriginalImage = global.Image;
      (global as any).Image = class MockImage {
        width = 0;
        height = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
        constructor() {
          setTimeout(() => this.onload?.(), 0);
        }
      };
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => {
        const el = createElement(tag);
        if (tag === "audio") {
          (el as any).pause = () => {};
          setTimeout(() => el.dispatchEvent(new Event("loadeddata")), 0);
        }
        return el;
      }) as any;
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/zero.png");
        expect(result).toEqual({ linkHtmlTagName: "audio" });
      } finally {
        (global as any).Image = OriginalImage;
        document.createElement = createElement;
      }
    });

    test("handles transport errors and returns empty when all fail", async () => {
      const OriginalImage = global.Image;
      (global as any).Image = class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
        constructor() {
          setTimeout(() => this.onerror?.(), 0);
        }
      };
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => {
        const el = createElement(tag);
        if (tag === "video" || tag === "audio") {
          setTimeout(() => el.dispatchEvent(new Event("error")), 0);
        }
        return el;
      }) as any;
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/fail.png");
        expect(result).toEqual({});
      } finally {
        (global as any).Image = OriginalImage;
        document.createElement = createElement;
      }
    });

    test("PromiseAny all-rejected returns empty", async () => {
      const OriginalImage = global.Image;
      (global as any).Image = class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
        constructor() {
          setTimeout(() => this.onerror?.(), 0);
        }
      };
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => {
        const el = createElement(tag);
        if (tag === "video" || tag === "audio") {
          setTimeout(() => el.dispatchEvent(new Event("error")), 0);
        }
        return el;
      }) as any;
      try {
        const result = await utils.fetchCommentLinkDimensions("https://example.com/all-fail.png");
        expect(result).toEqual({});
      } finally {
        (global as any).Image = OriginalImage;
        document.createElement = createElement;
      }
    });

    test("timeout branches when image/video/audio never load", async () => {
      vi.useFakeTimers();
      const OriginalImage = global.Image;
      (global as any).Image = class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = "";
      };
      const createElement = document.createElement.bind(document);
      document.createElement = ((tag: string) => createElement(tag)) as any;
      try {
        const p = utils.fetchCommentLinkDimensions("https://example.com/slow.png");
        await vi.runAllTimersAsync();
        const result = await p;
        expect(result).toEqual({});
      } finally {
        vi.useRealTimers();
        (global as any).Image = OriginalImage;
        document.createElement = createElement;
      }
    }, 10000);
  });

  describe("getInitAccountCommentsToUpdate", () => {
    test("sorts newest-first and caps at 10", () => {
      const accountsComments = {
        acc1: [
          { cid: "c1", timestamp: 100, index: 0 },
          { cid: "c2", timestamp: 300, index: 1 },
          { cid: "c3", timestamp: 200, index: 2 },
        ],
        acc2: [
          { cid: "c4", timestamp: 400, index: 0 },
          { cid: "c5", timestamp: 50, index: 1 },
        ],
      };
      const result = utils.getInitAccountCommentsToUpdate(accountsComments);
      expect(result.map((r) => r.accountComment.timestamp)).toEqual([400, 300, 200, 100, 50]);
      expect(result.length).toBe(5);
    });
    test("caps at 10 when more than 10 comments", () => {
      const comments = Array.from({ length: 15 }, (_, i) => ({
        cid: `c${i}`,
        timestamp: 1000 - i,
        index: i,
      }));
      const accountsComments = { acc1: comments };
      const result = utils.getInitAccountCommentsToUpdate(accountsComments);
      expect(result.length).toBe(10);
      expect(result[0].accountComment.timestamp).toBe(1000);
      expect(result[9].accountComment.timestamp).toBe(991);
    });
  });

  describe("getAccountCommentDepth", () => {
    test("returns 0 when no parentCid", () => {
      expect(utils.getAccountCommentDepth({ parentCid: undefined } as any)).toBe(0);
      expect(utils.getAccountCommentDepth({} as any)).toBe(0);
    });
    test("returns parent depth + 1 when parent in commentsStore", () => {
      commentsStore.setState((s: any) => ({
        comments: { ...s.comments, parentCid1: { cid: "parentCid1", depth: 2 } },
      }));
      try {
        expect(utils.getAccountCommentDepth({ parentCid: "parentCid1" } as any)).toBe(3);
      } finally {
        commentsStore.setState((s: any) => {
          const { parentCid1, ...rest } = s.comments;
          return { comments: rest };
        });
      }
    });
    test("returns parent depth + 1 when parent in repliesPagesStore", () => {
      repliesPagesStore.setState((s: any) => ({
        comments: { ...s.comments, parentCid2: { cid: "parentCid2", depth: 1 } },
      }));
      try {
        expect(utils.getAccountCommentDepth({ parentCid: "parentCid2" } as any)).toBe(2);
      } finally {
        repliesPagesStore.setState((s: any) => {
          const { parentCid2, ...rest } = s.comments;
          return { comments: rest };
        });
      }
    });
    test("returns parent depth + 1 when parent in communitiesPagesStore", () => {
      communitiesPagesStore.setState((s: any) => ({
        comments: { ...s.comments, parentCid3: { cid: "parentCid3", depth: 0 } },
      }));
      try {
        expect(utils.getAccountCommentDepth({ parentCid: "parentCid3" } as any)).toBe(1);
      } finally {
        communitiesPagesStore.setState((s: any) => {
          const { parentCid3, ...rest } = s.comments;
          return { comments: rest };
        });
      }
    });
    test("returns undefined when parent not found (missing-parent fallback)", () => {
      commentsStore.setState((s: any) => ({ comments: s.comments }));
      repliesPagesStore.setState((s: any) => ({ comments: s.comments }));
      communitiesPagesStore.setState((s: any) => ({ comments: s.comments }));
      const result = utils.getAccountCommentDepth({ parentCid: "nonexistent" } as any);
      expect(result).toBeUndefined();
    });
  });

  describe("getFreshestLoadedComment", () => {
    test("returns the freshest matching comment across comment page stores", () => {
      const commentCid = "freshest-loaded-comment";
      const previousComments = commentsStore.getState().comments;
      const previousRepliesPagesComments = repliesPagesStore.getState().comments;
      const previousCommunitiesPagesComments = communitiesPagesStore.getState().comments;
      const previousRepliesComments = repliesCommentsStore.getState().comments;
      commentsStore.setState({
        comments: { ...previousComments, [commentCid]: { cid: commentCid, updatedAt: 1 } },
      });
      repliesPagesStore.setState({
        comments: {
          ...previousRepliesPagesComments,
          [commentCid]: { cid: commentCid, updatedAt: 3 },
        },
      });
      communitiesPagesStore.setState({
        comments: {
          ...previousCommunitiesPagesComments,
          [commentCid]: { cid: commentCid, updatedAt: 2 },
        },
      });
      repliesCommentsStore.setState({
        comments: {
          ...previousRepliesComments,
          [commentCid]: { cid: commentCid, updatedAt: 4 },
        },
      });

      try {
        expect(utils.getFreshestLoadedComment(commentCid)?.updatedAt).toBe(4);
        expect(
          utils.getFreshestLoadedComment(commentCid, { cid: commentCid, updatedAt: 5 } as any)
            ?.updatedAt,
        ).toBe(5);
        expect(utils.getFreshestLoadedComment("missing-comment")).toBeUndefined();
      } finally {
        commentsStore.setState({ comments: previousComments });
        repliesPagesStore.setState({ comments: previousRepliesPagesComments });
        communitiesPagesStore.setState({ comments: previousCommunitiesPagesComments });
        repliesCommentsStore.setState({ comments: previousRepliesComments });
      }
    });
  });

  describe("addShortAddressesToAccountComment", () => {
    beforeAll(() => setPkcJs(PkcJsMock));
    afterAll(() => restorePkcJs());

    test("adds shortCommunityAddress and author.shortAddress on success", () => {
      const comment = {
        communityAddress: "eip155:0x1234567890abcdef",
        author: { address: "eip155:0xfedcba0987654321" },
      };
      const result = utils.addShortAddressesToAccountComment(comment as any);
      expect(result.shortCommunityAddress).toBeDefined();
      expect(result.author.shortAddress).toBeDefined();
      expect(result).not.toBe(comment);
    });
    test("safe-failure when getShortAddress throws", () => {
      const orig = PkcJsModule.PKC.getShortAddress;
      PkcJsModule.PKC.getShortAddress = () => {
        throw new Error("mock throw");
      };
      try {
        const comment = {
          communityAddress: "eip155:0x1234567890abcdef",
          author: { address: "eip155:0xfedcba0987654321" },
        };
        const result = utils.addShortAddressesToAccountComment(comment as any);
        expect(result).toBeDefined();
        expect(result.communityAddress).toBe("eip155:0x1234567890abcdef");
        expect(result.shortCommunityAddress).toBeUndefined();
      } finally {
        PkcJsModule.PKC.getShortAddress = orig;
      }
    });
  });
});
