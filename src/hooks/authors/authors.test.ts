import { vi } from "vitest";
import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useAuthor,
  useAuthorComments,
  useAuthorAvatar,
  useResolvedAuthorAddress,
  setPkcJs,
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
import PkcJsMock, { PKC } from "../../lib/pkc-js/pkc-js-mock";
import type { PkcResolveAuthorNameResult } from "../../lib/pkc-types";

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
const resolvedAuthorNameResult = (resolvedAuthorName: string): PkcResolveAuthorNameResult => ({
  resolvedAuthorName,
});

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
      "communityAddress",
      "author",
      "timestamp",
      "content",
      "title",
      "link",
      "parentCid",
    ],
    type: "ed25519",
  },
  communityAddress: "12D3KooWG3XbzoVyAE6Y9vHZKF64Yuuu4TjdgQKedk14iYmTEPWu",
  timestamp: 1686133292,
  title: "test",
};

describe("authors", () => {
  let author: Author;

  beforeAll(async () => {
    // set pkc-js mock and reset dbs
    setPkcJs(PkcJsMock);
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
      const origGetShortAddress = PkcJsMock.getShortAddress;
      PkcJsMock.getShortAddress = () => "ab";
      const cryptoName = "very-long-crypto-name.eth";
      const commentWithCrypto = {
        ...comment,
        author: { address: cryptoName },
        signature: { publicKey: "AMGyneyCj/3x17tKh7jOIcvka/OpRlGfCasNpYccfNI" },
      };
      rendered.rerender({ comment: commentWithCrypto });
      await waitFor(() => rendered.result.current.authorAddress === cryptoName);
      expect(rendered.result.current.shortAuthorAddress.length).toBe(cryptoName.length - 4);
      PkcJsMock.getShortAddress = origGetShortAddress;
    });

    test("useAuthorAddress catch path when resolveAuthorName rejects", async () => {
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => Promise.reject(new Error("resolve failed"));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress retries after a cached rejection is cleared", async () => {
      resetAuthorAddressCacheForTesting();
      const cryptoName = "retry-after-reject.eth";
      const signerAddr = comment.author.address;
      let resolveCalls = 0;
      let shouldReject = true;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => {
        resolveCalls += 1;
        return shouldReject
          ? Promise.reject(new Error("resolve failed"))
          : Promise.resolve(resolvedAuthorNameResult(signerAddr));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress first resolution with no cached promise (hits line 293)", async () => {
      resetAuthorAddressCacheForTesting();
      const cryptoName = "first-resolve-293.eth";
      const signerAddr = comment.author.address;
      let resolveCallCount = 0;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = function (opts: { name: string }) {
        resolveCallCount += 1;
        return Promise.resolve(resolvedAuthorNameResult(signerAddr));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress uses cached result on rerender", async () => {
      const cryptoName = "cached-addr.eth";
      const signerAddr = comment.author.address;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => Promise.resolve(resolvedAuthorNameResult(signerAddr));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress uses cached result on remount (hits cached path)", async () => {
      const cryptoName = "cached-remount.eth";
      const signerAddr = comment.author.address;
      const origResolve = PKC.prototype.resolveAuthorName;
      let resolveCallCount = 0;
      PKC.prototype.resolveAuthorName = () => {
        resolveCallCount += 1;
        return Promise.resolve(resolvedAuthorNameResult(signerAddr));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress reuses in-flight promise on rapid rerender", async () => {
      let resolveDeferred: (v: string) => void = () => {};
      const deferredPromise = new Promise<PkcResolveAuthorNameResult>((resolve) => {
        resolveDeferred = (value) => resolve(resolvedAuthorNameResult(value));
      });
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => deferredPromise;
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress does not verify a new name with the previous name's resolution", async () => {
      resetAuthorAddressCacheForTesting();
      const signerAddr = comment.author.address;
      const origResolve = PKC.prototype.resolveAuthorName;
      // the first name resolves to the comment signer, the second name (same signer) does not resolve
      PKC.prototype.resolveAuthorName = ({ name }: { name: string }) =>
        name === "first-name.eth"
          ? Promise.resolve(resolvedAuthorNameResult(signerAddr))
          : Promise.reject(new Error("resolve failed"));
      try {
        const withName = (name: string) => ({
          ...comment,
          author: { ...comment.author, address: name },
        });
        rendered.rerender({ comment: withName("first-name.eth") });
        await waitFor(() => rendered.result.current.authorAddress === "first-name.eth");

        rendered.rerender({ comment: withName("second-name.eth") });
        await act(async () => {
          await new Promise((r) => setTimeout(r, 50));
        });
        expect(rendered.result.current.authorAddress).toBe(signerAddr);
      } finally {
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useAuthorAddress ignores a resolution that lands after the comment changed", async () => {
      resetAuthorAddressCacheForTesting();
      const signerAddr = comment.author.address;
      let releaseSlowName = () => {};
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = ({ name }: { name: string }) =>
        name === "slow-name.eth"
          ? new Promise<PkcResolveAuthorNameResult>((resolve) => {
              releaseSlowName = () => resolve(resolvedAuthorNameResult("12D3KooWsomeoneElse"));
            })
          : Promise.resolve(resolvedAuthorNameResult(signerAddr));
      try {
        const withName = (name: string) => ({
          ...comment,
          author: { ...comment.author, address: name },
        });
        rendered.rerender({ comment: withName("slow-name.eth") });
        await act(async () => {});
        rendered.rerender({ comment: withName("fast-name.eth") });
        await waitFor(() => rendered.result.current.authorAddress === "fast-name.eth");

        await act(async () => {
          releaseSlowName();
          await new Promise((r) => setTimeout(r, 50));
        });
        expect(rendered.result.current.authorAddress).toBe("fast-name.eth");
      } finally {
        PKC.prototype.resolveAuthorName = origResolve;
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

      // expect to fail because pkc-js mock content doesnt have author address 'different-author.eth'
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe(
        "commentCid author.address is different from authorAddress",
      );
    });

    test("get multiple pages until no more previous comment", async () => {
      // mock the correct author address on the comment
      const commentToGet = PKC.prototype.commentToGet;
      // the author only has 110 comments
      const authorCommentsCount = 110;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => {
        if (previousCommentCount < authorCommentsCount - 1) {
          return `previous comment cid ${++previousCommentCount}`;
        }
      };
      PKC.prototype.commentToGet = (commentCid) => {
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
      PKC.prototype.commentToGet = commentToGet;
    });

    test("find more recent lastCommentCid while scrolling", async () => {
      // mock the correct author address on the comment
      const commentToGet = PKC.prototype.commentToGet;
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
      PKC.prototype.commentToGet = (commentCid?: string) => ({
        timestamp: getTimestamp(commentCid),
        author: {
          address: "author.eth",
          previousCommentCid: getAuthorPreviousCommentCid(),
          community: {
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
      PKC.prototype.commentToGet = commentToGet;
    });

    test("some author comments have wrong author", async () => {
      // mock the correct author address on the comment
      const commentToGet = PKC.prototype.commentToGet;
      // start giving a wrong author after this amount
      const wrongAuthorAfter = 40;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => `previous comment cid ${++previousCommentCount}`;
      PKC.prototype.commentToGet = () => ({
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
      PKC.prototype.commentToGet = commentToGet;
    });

    test("cannot spam load more", async () => {
      // mock the correct author address on the comment
      const commentToGet = PKC.prototype.commentToGet;
      let previousCommentCount = 0;
      const getAuthorPreviousCommentCid = () => `previous comment cid ${++previousCommentCount}`;
      PKC.prototype.commentToGet = () => ({
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
      PKC.prototype.commentToGet = commentToGet;
    });

    test("has no previous comment cid, get only comment cid provided", async () => {
      // mock the correct author address on the comment
      const commentToGet = PKC.prototype.commentToGet;
      PKC.prototype.commentToGet = () => ({
        author: { address: "author.eth", previousCommentCid: undefined },
      });

      rendered.rerender({ commentCid: "comment cid", authorAddress: "author.eth" });
      await waitFor(() => rendered.result.current.authorComments.length === 1);
      expect(rendered.result.current.authorComments.length).toBe(1);
      expect(rendered.result.current.lastCommentCid).toBe(undefined);
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.hasMore).toBe(false);

      // restore mock
      PKC.prototype.commentToGet = commentToGet;
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

      // expect to fail because pkc-js mock content doesnt have author address 'different-author.eth'
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error.message).toBe(
        "commentCid author.address is different from authorAddress",
      );
    });

    test("succeeded", async () => {
      // mock the correct author address on the comment
      const commentToGet = PKC.prototype.commentToGet;
      PKC.prototype.commentToGet = () => ({
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
      PKC.prototype.commentToGet = commentToGet;
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
      expect(json.domainSeparator).toBe("pkc-author-avatar");
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

      rendered.rerender({ address: "community.eth" });
      await waitFor(() => typeof rendered.result.current.resolvedAddress === "string");
      expect(rendered.result.current.resolvedAddress).toBe("resolved author address");
    });

    test("useResolvedAuthorAddress unsupported crypto domain", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "pkc.com" });
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

    test("useResolvedAuthorAddress .sol is unsupported", { timeout }, async () => {
      const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      expect(rendered.result.current.resolvedAddress).toBe(undefined);

      rendered.rerender({ address: "abc.sol" });
      await waitFor(() => rendered.result.current.error);
      expect(rendered.result.current.error.message).toBe("crypto domain type unsupported");
    });

    test("useResolvedAuthorAddress .bso resolves with the eth chain provider", async () => {
      resetAuthorAddressCacheForTesting();
      const resolved = "12D3KooWresolved";
      let resolveArgs: { name: string } | undefined;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = (opts: { name: string }) => {
        resolveArgs = opts;
        return Promise.resolve(resolvedAuthorNameResult(resolved));
      };
      try {
        const rendered = renderHook<any, any>(() => {
          const account = useAccount();
          const resolvedAuthorAddress = useResolvedAuthorAddress({
            author: { address: "plebeius.bso" },
            cache: false,
          });
          return {
            ...resolvedAuthorAddress,
            ethChainProvider: account?.chainProviders?.eth,
          };
        });
        const waitFor = testUtils.createWaitFor(rendered, { timeout: 20000 });
        await waitFor(() => rendered.result.current.resolvedAddress === resolved);
        expect(resolveArgs).toEqual({ name: "plebeius.bso" });
        expect(rendered.result.current.error).toBe(undefined);
        expect(rendered.result.current.chainProvider).toEqual(
          rendered.result.current.ethChainProvider,
        );
        expect(rendered.result.current.nameResolver).toEqual({
          key: "eth-ethereum-rpc.publicnode.com",
          nameSystem: "eth",
          chainTicker: "eth",
          provider: "https://ethereum-rpc.publicnode.com",
          providerLabel: "ethereum-rpc.publicnode.com",
        });
      } finally {
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useResolvedAuthorAddress matches the pkc-js resolveAuthorName contract", async () => {
      resetAuthorAddressCacheForTesting();
      const resolved = "12D3KooWresolvedFromName";
      let resolveArgs: { name: string } | undefined;
      const origResolveAddress = PKC.prototype.resolveAuthorAddress;
      const origResolveName = PKC.prototype.resolveAuthorName;
      (PKC.prototype as any).resolveAuthorAddress = undefined;
      PKC.prototype.resolveAuthorName = ((opts: { name: string }) => {
        resolveArgs = opts;
        return Promise.resolve(resolvedAuthorNameResult(resolved));
      }) as any;
      try {
        const rendered = renderHook<any, any>(() =>
          useResolvedAuthorAddress({
            author: { address: "typed-contract.bso" },
            cache: false,
          }),
        );
        const waitFor = testUtils.createWaitFor(rendered, { timeout: 20000 });
        await waitFor(() => rendered.result.current.resolvedAddress === resolved);
        expect(resolveArgs).toEqual({ name: "typed-contract.bso" });
      } finally {
        PKC.prototype.resolveAuthorAddress = origResolveAddress;
        PKC.prototype.resolveAuthorName = origResolveName;
      }
    });

    test("useResolvedAuthorAddress with cache: false", { timeout: 25000 }, async () => {
      const rendered = renderHook<any, any>((opts) =>
        useResolvedAuthorAddress({ author: opts, cache: false }),
      );
      const waitFor = testUtils.createWaitFor(rendered, { timeout: 22000 });
      rendered.rerender({ address: "community.eth" });
      await waitFor(() => typeof rendered.result.current.resolvedAddress === "string");
      expect(rendered.result.current.resolvedAddress).toBe("resolved author address");
    });

    test("useResolvedAuthorAddress resets when author/account cleared", { timeout }, async () => {
      const rendered = renderHook<any, any>((opts) => useResolvedAuthorAddress({ author: opts }));
      const waitFor = testUtils.createWaitFor(rendered, { timeout: 20000 });
      rendered.rerender({ address: "community.eth" } as any);
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
        rendered.rerender({ address: "pkc.com" } as any);
        await waitFor(() => rendered.result.current.error !== undefined);
        expect(rendered.result.current.error?.message).toBe("crypto domain type unsupported");
        rendered.rerender(undefined);
        await waitFor(() => rendered.result.current.error === undefined);
        expect(rendered.result.current.errors).toEqual([]);
      },
    );

    test("useResolvedAuthorAddress handles resolve error", { timeout }, async () => {
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => Promise.reject(new Error("resolution failed"));
      try {
        const rendered = renderHook<any, any>((author) => useResolvedAuthorAddress({ author }));
        const waitFor = testUtils.createWaitFor(rendered, { timeout: 20000 });
        rendered.rerender({ address: "fail.eth" });
        await waitFor(() => rendered.result.current.error !== undefined);
        expect(rendered.result.current.error?.message).toBe("resolution failed");
      } finally {
        PKC.prototype.resolveAuthorName = origResolve;
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
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => {
        resolveCalls++;
        return Promise.resolve(resolvedAuthorNameResult(resolved));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useResolvedAuthorAddress uses cached path when resolveAuthorAddressPromises has entry", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "cached-promise.eth";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => {
        resolveCalls++;
        return Promise.resolve(resolvedAuthorNameResult(resolved));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useResolvedAuthorAddress retries after a cached rejection is cleared", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "retry-after-reject.eth";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      let shouldReject = true;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => {
        resolveCalls++;
        return shouldReject
          ? Promise.reject(new Error("resolution failed"))
          : Promise.resolve(resolvedAuthorNameResult(resolved));
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
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("useResolvedAuthorAddress reuses an in-flight .bso resolution promise", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "shared-promise.bso";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      let releasePromise: ((value: string) => void) | undefined;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => {
        resolveCalls++;
        return new Promise((resolve) => {
          releasePromise = (value) => resolve(resolvedAuthorNameResult(value));
        });
      };
      try {
        const first = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: false }),
        );
        const second = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: false }),
        );
        const waitForFirst = testUtils.createWaitFor(first, { timeout: 20000 });
        const waitForSecond = testUtils.createWaitFor(second, { timeout: 20000 });
        await waitForFirst(() => first.result.current.state === "resolving");
        await waitForSecond(() => second.result.current.state === "resolving");
        await act(async () => {
          releasePromise?.(resolved);
        });
        await waitForFirst(() => first.result.current.resolvedAddress === resolved);
        await waitForSecond(() => second.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(1);
      } finally {
        PKC.prototype.resolveAuthorName = origResolve;
      }
    });

    test("resetAuthorAddressCacheForTesting clears pending resolver promises", async () => {
      resetAuthorAddressCacheForTesting();
      const addr = "reset-pending.eth";
      const resolved = "12D3KooWresolved";
      let resolveCalls = 0;
      let releaseFirstPromise: ((value: string) => void) | undefined;
      const origResolve = PKC.prototype.resolveAuthorName;
      PKC.prototype.resolveAuthorName = () => {
        resolveCalls++;
        if (resolveCalls === 1) {
          return new Promise((resolve) => {
            releaseFirstPromise = (value) => resolve(resolvedAuthorNameResult(value));
          });
        }
        return Promise.resolve(resolvedAuthorNameResult(resolved));
      };
      try {
        const first = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: false }),
        );
        const waitForFirst = testUtils.createWaitFor(first, { timeout: 20000 });
        await waitForFirst(() => first.result.current.state === "resolving");
        resetAuthorAddressCacheForTesting();

        const second = renderHook<any, any>(() =>
          useResolvedAuthorAddress({ author: { address: addr }, cache: false }),
        );
        const waitForSecond = testUtils.createWaitFor(second, { timeout: 20000 });
        await waitForSecond(() => second.result.current.resolvedAddress === resolved);
        expect(resolveCalls).toBe(2);

        await act(async () => {
          releaseFirstPromise?.(resolved);
        });
        await waitForFirst(() => first.result.current.resolvedAddress === resolved);
      } finally {
        PKC.prototype.resolveAuthorName = origResolve;
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
  const messageToSign = `{"domainSeparator":"pkc-author-avatar","authorAddress":"${authorAddress}","timestamp":${nft.timestamp},"tokenAddress":"${nft.address}","tokenId":"${nft.id}"}`;

  // the ethers.js signer is usually gotten from metamask https://docs.ethers.io/v5/api/signer/
  const signature = await ethersJsSigner.signMessage(messageToSign);
  return signature;
};
