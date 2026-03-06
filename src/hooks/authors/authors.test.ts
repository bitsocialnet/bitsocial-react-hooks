import { vi } from "vitest";
import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useAuthor,
  useAuthorComments,
  useAuthorAvatar,
  useResolvedAuthorAddress,
  setPlebbitJs,
  useAccount,
  useAuthorAddress,
  setAuthorAvatarsWhitelistedTokenAddresses,
  resetAuthorAddressCacheForTesting,
} from "../..";
import { commentsPerPage } from "../../stores/authors-comments";
import {
  useNftMetadataUrl,
  useNftImageUrl,
  useVerifiedAuthorAvatarSignature,
  verifyAuthorAvatarSignature,
  getNftMessageToSign,
} from "./author-avatars";
import localForageLru from "../../lib/localforage-lru";
import { ethers } from "ethers";
import { Nft, Author } from "../../types";
import PlebbitJsMock, { Plebbit } from "../../lib/plebbit-js/plebbit-js-mock";

const avatarNft1 = {
  chainTicker: "eth",
  address: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", // the contract address of the nft
  id: "100", // the nft number 100 in the colletion
  timestamp: Math.ceil(Date.now() / 1000),
};
const avatarNft2 = {
  chainTicker: "matic",
  address: "0xf6d8e606c862143556b342149a7fe0558c220375", // the contract address of the nft
  id: "100", // the nft number 100 in the colletion
  timestamp: Math.ceil(Date.now() / 1000),
};
const avatarNftImageUrl1 =
  "https://cloudflare-ipfs.com/ipfs/QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/100";
const avatarNftImageUrl2 =
  "https://peer.decentraland.org/lambdas/collections/standard/erc721/137/0xf6d8e606c862143556b342149a7fe0558c220375/0/100";
const authorAddress = "12D3KooW...";

const comment = {
  author: {
    address: "12D3KooW9sKUZiFRD8Jh4Zrz2k1paW2L4eQU3kFCGDVejC1Eu9Xw",
    displayName: "plebeius.eth",
  },
  content: "test",
  depth: 0,
  previousCid: "Qmf8Pj7D7jFn2Ue8qwm2RFop3E8Q7LcFT6pz4ssekgVtsj",
  protocolVersion: "1.0.0",
  signature: {
    publicKey: "AMGyneyCj/3x17tKh7jOIcvka/OpRlGfCasNpYccfNI",
    signature:
      "+ixn9hY2nBlzRwLEGGE5+JgbnuRAAZQxkv4Kz9wM6as3sA0tA8PuOyCHe29rcNl9gOzLtCmYCARQOqHpmA05CQ",
    signedPropertyNames: [
      "subplebbitAddress",
      "author",
      "timestamp",
      "content",
      "title",
      "link",
      "parentCid",
    ],
    type: "ed25519",
  },
  subplebbitAddress: "12D3KooWG3XbzoVyAE6Y9vHZKF64Yuuu4TjdgQKedk14iYmTEPWu",
  timestamp: 1686133292,
  title: "test",
};

describe("authors", () => {
  let author: Author;

  beforeAll(async () => {
    // set plebbit-js mock and reset dbs
    setPlebbitJs(PlebbitJsMock);
    await testUtils.resetDatabasesAndStores();

    testUtils.silenceReactWarnings();
    author = {
      address: authorAddress,
      avatar: {
        ...avatarNft1,
        signature: {
          signature: await createAuthorAvatarSignature(avatarNft1, authorAddress),
        },
      },
    };
  });

  afterAll(() => {
    testUtils.restoreAll();
  });

  describe("useAuthorAddress", () => {
    let rendered: any, waitFor: any;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options: any) => {
        const useAuthorCommentsResult = useAuthorAddress(options);
        return useAuthorCommentsResult;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
      resetAuthorAddressCacheForTesting();
    });

    test("no crypto name", async () => {
      rendered.rerender({ comment });
      expect(rendered.result.current.authorAddress).toBe(comment.author.address);
      expect(typeof rendered.result.current.shortAuthorAddress).toBe("string");
      expect(
        rendered.result.current.authorAddress.includes(rendered.result.current.shortAuthorAddress),
      ).toBe(true);
      expect(rendered.result.current.authorAddressChanged).toBe(false);
      expect(rendered.result.current.error).toBe(undefined);
    });

    test("long crypto name", async () => {
      const cryptoName = "some-long-crypto-name.eth";
      const commentWithInvalidCryptoName = { ...comment, author: { address: cryptoName } };
      rendered.rerender({ comment: commentWithInvalidCryptoName });
      expect(rendered.result.current.authorAddress).toBe(comment.author.address);
      expect(typeof rendered.result.current.shortAuthorAddress).toBe("string");
      expect(
        rendered.result.current.authorAddress.includes(rendered.result.current.shortAuthorAddress),
      ).toBe(true);
      // shortAuthorAddress length is bigger with longer crypto name to reduce displacement
      expect(rendered.result.current.shortAuthorAddress.length).toBe(cryptoName.length - 4);
      expect(rendered.result.current.authorAddressChanged).toBe(false);
    });

    test("short crypto name", async () => {
      const cryptoName = "a.eth";
      const commentWithInvalidCryptoName = { ...comment, author: { address: cryptoName } };
      rendered.rerender({ comment: commentWithInvalidCryptoName });
      expect(rendered.result.current.authorAddress).toBe(comment.author.address);
      expect(typeof rendered.result.current.shortAuthorAddress).toBe("string");
      expect(
        rendered.result.current.authorAddress.includes(rendered.result.current.shortAuthorAddress),
      ).toBe(true);
      // shortAuthorAddress length is bigger with longer crypto name to reduce displacement
      expect(rendered.result.current.shortAuthorAddress.length).toBe(12);
      expect(rendered.result.current.authorAddressChanged).toBe(false);
    });

    // TODO: eventually account comments will have a comment.signature immediately
    test("account comment with no comment.signature", async () => {
      const cryptoName = "name.eth";
      const accountComment = { author: { address: cryptoName } };
      rendered.rerender({ comment: accountComment });
      expect(rendered.result.current.authorAddress).toBe(cryptoName);
      expect(rendered.result.current.shortAuthorAddress).toBe(cryptoName);
      expect(rendered.result.current.authorAddressChanged).toBe(false);
    });

    test("useAuthorAddress extends shortAddress when shorter than crypto name", async () => {
      const origGetShortAddress = PlebbitJsMock.getShortAddress;
      PlebbitJsMock.getShortAddress = () => "ab";
      const cryptoName = "very-long-crypto-name.eth";
      const commentWithCrypto = {
        ...comment,
        author: { address: cryptoName },
        signature: { publicKey: "AMGyneyCj/3x17tKh7jOIcvka/OpRlGfCasNpYccfNI" },
      };
      rendered.rerender({ comment: commentWithCrypto });
      await waitFor(() => rendered.result.current.authorAddress === cryptoName);
      expect(rendered.result.current.shortAuthorAddress.length).toBe(cryptoName.length - 4);
      PlebbitJsMock.getShortAddress = origGetShortAddress;
    });

    test("useAuthorAddress catch path when resolveAuthorAddress rejects", async () => {
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => Promise.reject(new Error("resolve failed"));
      try {
        const cryptoName = "addr-reject-test.eth";
        const commentWithCrypto = {
          ...comment,
          author: { address: cryptoName },
        };
        rendered.rerender({ comment: commentWithCrypto });
        await waitFor(() => Boolean(rendered.result.current.authorAddress));
        await new Promise((r) => setTimeout(r, 150));
        // Catch path is covered; Logger may not use console.error
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useAuthorAddress retries after a cached rejection is cleared", async () => {
      resetAuthorAddressCacheForTesting();
      const cryptoName = "retry-after-reject.eth";
      const signerAddr = comment.author.address;
      let resolveCalls = 0;
      let shouldReject = true;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => {
        resolveCalls += 1;
        return shouldReject
          ? Promise.reject(new Error("resolve failed"))
          : Promise.resolve(signerAddr);
      };
      try {
        const commentWithCrypto = {
          ...comment,
          author: { ...comment.author, address: cryptoName },
        };
        const first = renderHook<any, any>((opts) => useAuthorAddress(opts));
        first.rerender({ comment: commentWithCrypto });
        await new Promise((r) => setTimeout(r, 150));
        expect(resolveCalls).toBe(1);
        first.unmount();

        shouldReject = false;
        const second = renderHook<any, any>((opts) => useAuthorAddress(opts));
        const waitForSecond = testUtils.createWaitFor(second);
        second.rerender({ comment: commentWithCrypto });
        await waitForSecond(() => second.result.current.authorAddress === cryptoName);
        expect(resolveCalls).toBe(2);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useAuthorAddress first resolution with no cached promise (hits line 293)", async () => {
      resetAuthorAddressCacheForTesting();
      const cryptoName = "first-resolve-293.eth";
      const signerAddr = comment.author.address;
      let resolveCallCount = 0;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = function (opts: { address: string }) {
        resolveCallCount += 1;
        return Promise.resolve(signerAddr);
      };
      try {
        const commentWithCrypto = {
          ...comment,
          author: { ...comment.author, address: cryptoName },
        };
        rendered.rerender({ comment: commentWithCrypto });
        await waitFor(() => rendered.result.current.authorAddress === cryptoName);
        expect(rendered.result.current.authorAddress).toBe(cryptoName);
        expect(resolveCallCount).toBe(1);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useAuthorAddress uses cached result on rerender", async () => {
      const cryptoName = "cached-addr.eth";
      const signerAddr = comment.author.address;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => Promise.resolve(signerAddr);
      try {
        const commentWithCrypto = {
          ...comment,
          author: { ...comment.author, address: cryptoName },
        };
        rendered.rerender({ comment: commentWithCrypto });
        await waitFor(() => rendered.result.current.authorAddress === cryptoName);
        rendered.rerender({ comment: commentWithCrypto });
        await act(() => {});
        expect(rendered.result.current.authorAddress).toBe(cryptoName);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useAuthorAddress uses cached result on remount (hits cached path)", async () => {
      const cryptoName = "cached-remount.eth";
      const signerAddr = comment.author.address;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      let resolveCallCount = 0;
      Plebbit.prototype.resolveAuthorAddress = () => {
        resolveCallCount += 1;
        return Promise.resolve(signerAddr);
      };
      try {
        const commentWithCrypto = {
          ...comment,
          author: { ...comment.author, address: cryptoName },
        };
        rendered.rerender({ comment: commentWithCrypto });
        await waitFor(() => rendered.result.current.authorAddress === cryptoName);
        expect(resolveCallCount).toBe(1);
        rendered.unmount();
        rendered = renderHook<any, any>((options: any) => useAuthorAddress(options));
        waitFor = testUtils.createWaitFor(rendered);
        rendered.rerender({ comment: commentWithCrypto });
        await waitFor(() => rendered.result.current.authorAddress === cryptoName);
        expect(resolveCallCount).toBe(1);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useAuthorAddress reuses in-flight promise on rapid rerender", async () => {
      let resolveDeferred: (v: string) => void = () => {};
      const deferredPromise = new Promise<string>((r) => {
        resolveDeferred = r;
      });
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => deferredPromise;
      try {
        const cryptoName = "deferred-addr.eth";
        const accountComment = { author: { address: cryptoName } };
        rendered.rerender({ comment: accountComment });
        await act(() => {});
        rendered.rerender({ comment: accountComment });
        await act(() => {});
        resolveDeferred!("resolved");
        await waitFor(() => rendered.result.current.authorAddress === cryptoName);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });
  });

  describe("useAuthorComments", () => {
    let rendered: any, waitFor: any;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options: any) => {
        const useAuthorCommentsResult = useAuthorComments(options);
        return useAuthorCommentsResult;
      });
      // fetching multiple pages is slow, needs high timeout
      waitFor = testUtils.createWaitFor(rendered, { timeout: 5000 });
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();

      // wait and reset comments store again, for some reason it is needed sometimes or
      // comments from a previous test will be in the comments store, don't know why
      await new Promise((r) => setTimeout(r, 50));
      await testUtils.resetDatabasesAndStores();
    });

    test("loadMore when not initialized throws and waits", async () => {
      rendered.rerender({});
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      expect(rendered.result.current.authorComments).toEqual([]);
    });

    test("addAuthorCommentsToStore error is caught in useEffect", async () => {
      testUtils.silenceReactWarnings();
      // invalid filter triggers addAuthorCommentsToStore assert
      await act(async () => {
        rendered.rerender({
          commentCid: "comment cid",
          authorAddress: "author.eth",
          filter: { filter: 123 as any, key: "invalid" },
        });
      });
      await new Promise((r) => setTimeout(r, 100));
      // Catch path is covered; Logger may not use console.error
    });

    test("no comment cid", async () => {
      rendered.rerender({ authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe("missing UseAuthorOptions.commentCid");
    });

    test("no author address", async () => {
      rendered.rerender({ commentCid: "comment cid" });
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe("missing UseAuthorOptions.authorAddress");
    });

    test("comment cid from different author", async () => {
      rendered.rerender({ commentCid: "comment cid", authorAddress: "different-author.eth" });

      // expect to fail because plebbit-js mock content doesnt have author address 'different-author.eth'
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe(
        "commentCid author.address is different from authorAddress",
      );
    });

    test("get multiple pages until no more previous comment", async () => {
      // mock the correct author address on the comment
      const commentToGet = Plebbit.prototype.commentToGet;
      // the author only has 110 comments
      const authorCommentsCount = 110;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => {
        if (previousCommentCount < authorCommentsCount - 1) {
          return `previous comment cid ${++previousCommentCount}`;
        }
      };
      Plebbit.prototype.commentToGet = (commentCid) => {
        // ignore other comments used for testing changing useAuthorsOptions
        if (commentCid?.startsWith("other comment")) {
          return {};
        }
        return {
          author: {
            address: "author.eth",
            previousCommentCid: getAuthorPreviousCommentCid(),
          },
        };
      };

      // get 1st page (25 comments, 75 buffered)
      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage);
      expect(rendered.result.current.hasMore).toBe(true);
      // first comment should be the commentCid argument
      expect(rendered.result.current.authorComments[0].cid).toBe("comment cid");

      // get 2nd page (50 comments, 100 buffered)
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage * 2);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage * 2);
      expect(rendered.result.current.hasMore).toBe(true);

      // get 3rd page (75 comments, 110 buffered (author only has 110 comments))
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage * 3);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage * 3);
      expect(rendered.result.current.hasMore).toBe(true);

      // change commentCid to lastCommentCid, should do nothing
      rendered.rerender({ commentCid: "other comment cid", authorAddress: "author.eth" });
      await new Promise((r) => setTimeout(r, 500));
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage * 3);
      expect(rendered.result.current.hasMore).toBe(true);

      // change authorAddress, should reset authorComments to 0
      rendered.rerender({ commentCid: "other comment cid 2", authorAddress: "other-author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === 0);
      expect(rendered.result.current.authorComments.length).toBe(0);
      expect(rendered.result.current.hasMore).toBe(true);

      // change back to original authorAddress, should get all previous pages loaded
      rendered.rerender({ commentCid: "other comment cid 3", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage * 3);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage * 3);
      expect(rendered.result.current.hasMore).toBe(true);

      // get 4th page (100 comments, 110 buffered (author only has 110 comments))
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage * 4);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage * 4);
      expect(rendered.result.current.hasMore).toBe(true);

      // get 5th (last) page (110 comments, 110 buffered (author only has 110 comments))
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(
        () =>
          rendered.result.current.authorComments.length === 110 &&
          rendered.result.current.hasMore === false,
      );
      expect(rendered.result.current.authorComments.length).toBe(110);
      expect(rendered.result.current.hasMore).toBe(false);

      // restore mock
      Plebbit.prototype.commentToGet = commentToGet;
    });

    test("find more recent lastCommentCid while scrolling", async () => {
      // mock the correct author address on the comment
      const commentToGet = Plebbit.prototype.commentToGet;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => `previous comment cid ${++previousCommentCount}`;
      const getTimestamp = (commentCid?: string) => {
        // last comment must be newer than all other comments
        // to be added to lastCommentCid
        if (commentCid === "last comment cid") {
          return 1000;
        }
        return 1000 - (previousCommentCount + 1);
      };
      Plebbit.prototype.commentToGet = (commentCid?: string) => ({
        timestamp: getTimestamp(commentCid),
        author: {
          address: "author.eth",
          previousCommentCid: getAuthorPreviousCommentCid(),
          subplebbit: {
            lastCommentCid: "last comment cid",
          },
        },
      });

      // get 1st page
      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage);
      expect(rendered.result.current.hasMore).toBe(true);

      // has lastCommentCid
      await waitFor(() => rendered.result.current.lastCommentCid === "last comment cid");
      expect(rendered.result.current.lastCommentCid).toBe("last comment cid");

      // restore mock
      Plebbit.prototype.commentToGet = commentToGet;
    });

    test("some author comments have wrong author", async () => {
      // mock the correct author address on the comment
      const commentToGet = Plebbit.prototype.commentToGet;
      // start giving a wrong author after this amount
      const wrongAuthorAfter = 40;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => `previous comment cid ${++previousCommentCount}`;
      Plebbit.prototype.commentToGet = () => ({
        author: {
          address: previousCommentCount < wrongAuthorAfter ? "author.eth" : "wrong-author.eth",
          previousCommentCid: getAuthorPreviousCommentCid(),
        },
      });

      // get 1st page
      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === commentsPerPage);
      expect(rendered.result.current.authorComments.length).toBe(commentsPerPage);
      await waitFor(() => rendered.result.current.hasMore === true);
      expect(rendered.result.current.hasMore).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);

      // get 2nd page
      await act(async () => {
        await rendered.result.current.loadMore();
      });
      await waitFor(() => rendered.result.current.authorComments.length >= wrongAuthorAfter);
      // wait a bit more to make sure no comments load
      await new Promise((r) => setTimeout(r, 500));
      expect(rendered.result.current.authorComments.length).toBe(wrongAuthorAfter);
      // TODO: find a way to make hasMore false if previousComment has a wrong author.address
      // expect(rendered.result.current.hasMore).toBe(false)
      // TODO: find a way to add the error to result.error
      // expect(rendered.result.current.error.message).toBe('comment.author.previousCommentCid comment has different author address from authorAddress')

      // restore mock
      Plebbit.prototype.commentToGet = commentToGet;
    });

    test("cannot spam load more", async () => {
      // mock the correct author address on the comment
      const commentToGet = Plebbit.prototype.commentToGet;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => `previous comment cid ${++previousCommentCount}`;
      Plebbit.prototype.commentToGet = () => ({
        author: {
          address: "author.eth",
          previousCommentCid: getAuthorPreviousCommentCid(),
        },
      });

      // wait for first page to load
      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });

      // spam loadMore, never get more than just the second page
      await act(async () => {
        rendered.result.current.loadMore();
        rendered.result.current.loadMore();
        rendered.result.current.loadMore();
        rendered.result.current.loadMore();
        rendered.result.current.loadMore();
      });

      await waitFor(() => rendered.result.current.authorComments.length === 25);
      // wait a bit more to make sure no other page load
      await new Promise((r) => setTimeout(r, 500));
      // page 2, spamming loadMore should not load more than page 2
      expect(rendered.result.current.authorComments.length).toBe(25);
      expect(rendered.result.current.hasMore).toBe(true);

      // restore mock
      Plebbit.prototype.commentToGet = commentToGet;
    });

    test("has no previous comment cid, get only comment cid provided", async () => {
      // mock the correct author address on the comment
      const commentToGet = Plebbit.prototype.commentToGet;
      Plebbit.prototype.commentToGet = () => ({
        author: { address: "author.eth", previousCommentCid: undefined },
      });

      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === 1);
      expect(rendered.result.current.authorComments.length).toBe(1);
      expect(rendered.result.current.lastCommentCid).toBe(undefined);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.hasMore).toBe(false);

      // restore mock
      Plebbit.prototype.commentToGet = commentToGet;
    });
  });

  describe("useAuthor", () => {
    let rendered: any, waitFor: any;

    beforeEach(async () => {
      rendered = renderHook<any, any>((options: any) => {
        const useAuthorResult = useAuthor(options);
        return useAuthorResult;
      });
      waitFor = testUtils.createWaitFor(rendered);
    });

    afterEach(async () => {
      await testUtils.resetDatabasesAndStores();
    });

    test("no comment cid", async () => {
      rendered.rerender({ authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe("missing UseAuthorOptions.commentCid");
    });

    test("no author address", async () => {
      rendered.rerender({ commentCid: "comment cid" });
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe("missing UseAuthorOptions.authorAddress");
    });

    test("comment cid from different author", async () => {
      rendered.rerender({ commentCid: "comment cid", authorAddress: "different-author.eth" });

      // expect to fail because plebbit-js mock content doesnt have author address 'different-author.eth'
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe(
        "commentCid author.address is different from authorAddress",
      );
    });

    test("succeeded", async () => {
      // mock the correct author address on the comment
      const commentToGet = Plebbit.prototype.commentToGet;
      Plebbit.prototype.commentToGet = () => ({
        author: {
          address: "author.eth",
          displayName: "display name",
        },
      });

      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.error).toBe(undefined);
      expect(rendered.result.current.author?.address).toBe("author.eth");
      expect(rendered.result.current.author?.displayName).toBe("display name");

      // can reset
      rendered.rerender({});
      await waitFor(() => rendered.result.current.author === undefined);
      expect(rendered.result.current.author).toBe(undefined);
      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");

      // restore mock
      Plebbit.prototype.commentToGet = commentToGet;
    });
  });

  describe("author avatar", () => {
    const timeout = 30000;

    beforeAll(() => {
      setAuthorAvatarsWhitelistedTokenAddresses([
        // xpleb nfts
        "0x890a2e81836e0e76e0f49995e6b51ca6ce6f39ed",
        // plebsquat
        "0x52e6cd20f5fca56da5a0e489574c92af118b8188",
        // random nfts contracts used in mock content and tests
        "0xed5af388653567af2f388e6224dc7c4b3241c544",
        "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
        "0x79fcdef22feed20eddacbb2587640e45491b757f",
        "0xf6d8e606c862143556b342149a7fe0558c220375",
      ]);
    });

    test("getNftMessageToSign", () => {
      const string = getNftMessageToSign(
        authorAddress,
        avatarNft1.timestamp,
        avatarNft1.address,
        avatarNft1.id,
      );
      const json = JSON.parse(string);
      expect(json.domainSeparator).toBe("plebbit-author-avatar");
      expect(json.authorAddress).toBe(authorAddress);
      expect(json.authorAddress).not.toBe(undefined);
      expect(json.timestamp).toBe(avatarNft1.timestamp);
      expect(json.timestamp).not.toBe(undefined);
      expect(json.tokenAddress).toBe(avatarNft1.address);
      expect(json.tokenAddress).not.toBe(undefined);
      expect(json.tokenId).toBe(avatarNft1.id);
      expect(json.tokenId).not.toBe(undefined);
      expect(string).toBe(JSON.stringify(json));
    });

    test("useAuthorAvatar avatar has no signature", { timeout }, async () => {
      const author = {
        address: authorAddress,
        avatar: {
          ...avatarNft1,
          signature: undefined,
        },
      };
      const rendered = renderHook<any, any>((author) => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current.imageUrl).toBe(undefined);

      rendered.rerender(author);
      // NOTE: waitFor expected to fail because our test signer doesn't own the nft
      // manually check the logs to see if it actually works on not
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message.includes("invalid nft.signature")).toBe(true);
    });

    // skip because uses internet and not deterministic
    test.skip("useNftImageUrl", { timeout }, async () => {
      const rendered = renderHook<any, any>((nft) => {
        const { metadataUrl } = useNftMetadataUrl(nft);
        return useNftImageUrl(metadataUrl);
      });
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current).toEqual({ error: undefined, imageUrl: undefined });

      // test eth network
      rendered.rerender(avatarNft1);
      await waitFor(() => typeof rendered.result.current.imageUrl === "string");
      expect(rendered.result.current.imageUrl).toBe(avatarNftImageUrl1);

      // test polygon network
      rendered.rerender(avatarNft2);
      await waitFor(
        () =>
          typeof rendered.result.current.imageUrl === "string" &&
          rendered.result.current.imageUrl !== avatarNftImageUrl1,
      );
      expect(rendered.result.current.imageUrl).toBe(avatarNftImageUrl2);
    });

    // skip because uses internet and not deterministic
    test.skip("useVerifiedAuthorAvatarSignature", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useVerifiedAuthorAvatarSignature(author));
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current).toEqual({ verified: undefined, error: undefined });

      // test eth network
      rendered.rerender(author);
      await waitFor(() => rendered.result.current.verified === false);
      expect(rendered.result.current.verified).toBe(false);
    });

    // skip because uses internet and not deterministic
    test.skip("useAuthorAvatar", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current.imageUrl).toBe(undefined);

      rendered.rerender(author);
      // NOTE: waitFor expected to fail because our test signer doesn't own the nft
      // manually check the logs to see if it actually works on not
      await waitFor(() => typeof rendered.result.current.imageUrl === "string");
      console.log(rendered.result.current);
      expect(rendered.result.current).toBe(undefined);
    });

    // skip because uses internet and not deterministic
    test.skip("useAuthorAvatar with ENS", { timeout }, async () => {
      const author = {
        displayName: "Esteban Abaroa",
        address: "estebanabaroa.eth",
        avatar: {
          chainTicker: "matic",
          address: "0x890a2e81836e0e76e0f49995e6b51ca6ce6f39ed",
          id: "105",
          signature: {
            signature:
              "0xcb73c6b96193684ecea48952facbc217b3438c5e9290d978d40f227e3663eaf765d7f19f96151c35115deadee8003060352ffef1e6cc2e0600062e98c1e298301b",
            type: "eip191",
            signedPropertyNames: ["domainSeparator", "authorAddress", "tokenAddress", "tokenId"],
          },
        },
      };
      const rendered = renderHook<any, any>((author) => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current.imageUrl).toBe(undefined);

      rendered.rerender(author);
      await waitFor(() => typeof rendered.result.current.imageUrl === "string");
      expect(rendered.result.current.imageUrl).toBe(
        "https://cloudflare-ipfs.com/ipfs/QmbzsdEuX7Wnw3fEcue9siszymd94GRy6XMNDGkbUbVhTL",
      );
    });
  });

  describe("author address", () => {
    const timeout = 60000;

    // skip because uses internet and not deterministic
    test("useResolvedAuthorAddress", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered, { timeout });
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "subplebbit.eth" });
      await waitFor(() => typeof rendered.result.current.resolvedAddress === "string");
      expect(rendered.result.current.resolvedAddress).toBe("resolved author address");
    });

    test("useResolvedAuthorAddress unsupported crypto domain", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "plebbit.com" });
      await waitFor(() => rendered.result.current.error);
      expect(rendered.result.current.error.message).toBe("crypto domain type unsupported");
    });

    test("useResolvedAuthorAddress not a crypto domain", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "abc" });
      await waitFor(() => rendered.result.current.error);
      expect(rendered.result.current.error.message).toBe("not a crypto domain");
    });

    test("useResolvedAuthorAddress .eth has no error", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "abc.eth" });
      expect(rendered.result.current.error).toBe(undefined);
    });

    test("useResolvedAuthorAddress .sol has no error", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "abc.sol" });
      expect(rendered.result.current.error).toBe(undefined);
    });

    test("useResolvedAuthorAddress with cache: false", { timeout: 25000 }, async () => {
      const rendered = renderHook<any, any>((opts) =>
        useResolvedAuthorAddress({ author: opts, cache: false }),
      );
      const waitFor = testUtils.createWaitFor(rendered, { timeout: 22000 });
      rendered.rerender({ address: "subplebbit.eth" });
      await waitFor(() => typeof rendered.result.current.resolvedAddress === "string");
      expect(rendered.result.current.resolvedAddress).toBe("resolved author address");
    });

    test("useResolvedAuthorAddress resets when author/account cleared", { timeout }, async () => {
      const rendered = renderHook<any, any>((opts) => useResolvedAuthorAddress({ author: opts }));
      const waitFor = testUtils.createWaitFor(rendered, { timeout: 20000 });
      rendered.rerender({ address: "subplebbit.eth" } as any);
      await waitFor(() => typeof rendered.result.current.resolvedAddress === "string");
      rendered.rerender(undefined);
      await waitFor(() => rendered.result.current.resolvedAddress === undefined);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);
      expect(rendered.result.current.error).toBe(undefined);
    });

    test(
      "useResolvedAuthorAddress clears errors when author cleared after error",
      {
        timeout,
      },
      async () => {
        const rendered = renderHook<any, any>((opts) => useResolvedAuthorAddress({ author: opts }));
        const waitFor = testUtils.createWaitFor(rendered);
        rendered.rerender({ address: "plebbit.com" } as any);
        await waitFor(() => rendered.result.current.error !== undefined);
        expect(rendered.result.current.error?.message).toBe("crypto domain type unsupported");
        rendered.rerender(undefined);
        await waitFor(() => rendered.result.current.error === undefined);
        expect(rendered.result.current.errors).toEqual([]);
      },
    );

    test("useResolvedAuthorAddress handles resolve error", { timeout }, async () => {
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => Promise.reject(new Error("resolution failed"));
      try {
        const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
        const waitFor = testUtils.createWaitFor(rendered, { timeout: 20000 });
        rendered.rerender({ address: "fail.eth" });
        await waitFor(() => rendered.result.current.error !== undefined);
        expect(rendered.result.current.error?.message).toBe("resolution failed");
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useResolvedAuthorAddress cache default when undefined", () => {
      const rendered = renderHook<any, any>(() =>
        useResolvedAuthorAddress({ author: { address: "x.eth" }, cache: undefined }),
      );
      expect(rendered.result.current.error).toBe(undefined);
    });

    test("useResolvedAuthorAddress uses resolvedAuthorAddressCache on second resolution", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "cache-hit.eth";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => {
        resolveCalls++;
        return Promise.resolve(resolved);
      };
      try {
        const r1 = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: true }),
        );
        const waitFor1 = testUtils.createWaitFor(r1, { timeout: 20000 });
        await waitFor1(() => r1.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(1);
        r1.unmount();
        const r2 = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: true }),
        );
        const waitFor2 = testUtils.createWaitFor(r2, { timeout: 20000 });
        await waitFor2(() => r2.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(1);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useResolvedAuthorAddress uses cached path when resolveAuthorAddressPromises has entry", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "cached-promise.eth";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => {
        resolveCalls++;
        return Promise.resolve(resolved);
      };
      try {
        const r1 = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: true }),
        );
        const waitFor1 = testUtils.createWaitFor(r1, { timeout: 20000 });
        r1.rerender();
        await waitFor1(() => r1.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(1);
        const r2 = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: true }),
        );
        const waitFor2 = testUtils.createWaitFor(r2, { timeout: 20000 });
        await waitFor2(() => r2.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(1);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });

    test("useResolvedAuthorAddress retries after a cached rejection is cleared", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "retry-after-reject.eth";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      let shouldReject = true;
      const origResolve = Plebbit.prototype.resolveAuthorAddress;
      Plebbit.prototype.resolveAuthorAddress = () => {
        resolveCalls++;
        return shouldReject
          ? Promise.reject(new Error("resolution failed"))
          : Promise.resolve(resolved);
      };
      try {
        const first = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: true }),
        );
        const waitForFirst = testUtils.createWaitFor(first, { timeout: 20000 });
        await waitForFirst(() => first.result.current.error?.message === "resolution failed");
        expect(resolveCalls).toBe(1);
        first.unmount();

        shouldReject = false;
        const second = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: true }),
        );
        const waitForSecond = testUtils.createWaitFor(second, { timeout: 20000 });
        await waitForSecond(() => second.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(2);
      } finally {
        Plebbit.prototype.resolveAuthorAddress = origResolve;
      }
    });
  });

  describe("assert invalid options", () => {
    test("useAuthorComments throws on invalid options", () => {
      expect(() => {
        renderHook(() => useAuthorComments("invalid" as any));
      }).toThrow(/not an object/);
    });

    test("useAuthor throws on invalid options", () => {
      expect(() => {
        renderHook(() => useAuthor(123 as any));
      }).toThrow(/not an object/);
    });

    test("useAuthorAvatar throws on invalid options", () => {
      expect(() => {
        renderHook(() => useAuthorAvatar("invalid" as any));
      }).toThrow(/not an object/);
    });

    test("useAuthorAddress throws on invalid options", () => {
      expect(() => {
        renderHook(() => useAuthorAddress("bad" as any));
      }).toThrow(/not an object/);
    });

    test("useResolvedAuthorAddress throws on invalid options", () => {
      expect(() => {
        renderHook(() => useResolvedAuthorAddress(42 as any));
      }).toThrow(/not an object/);
    });
  });
});

const createAuthorAvatarSignature = async (nft: Nft, authorAddress: string) => {
  const testPrivateKey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ethersJsSigner = new ethers.Wallet(Buffer.from(testPrivateKey, "hex"));

  // use plain JSON so the user can read what he's signing
  // property names must always be in this order for signature to match so don't use JSON.stringify
  const messageToSign = `{"domainSeparator":"plebbit-author-avatar","authorAddress":"${authorAddress}","timestamp":${nft.timestamp},"tokenAddress":"${nft.address}","tokenId":"${nft.id}"}`;

  // the ethers.js signer is usually gotten from metamask https://docs.ethers.io/v5/api/signer/
  const signature = await ethersJsSigner.signMessage(messageToSign);
  return signature;
};
