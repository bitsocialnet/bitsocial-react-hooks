import { vi } from "vitest";
import { act } from "@testing-library/react";
import testUtils, { renderHook } from "../../lib/test-utils";
import {
  useNftMetadataUrl,
  useNftImageUrl,
  useVerifiedAuthorAvatarSignature,
  useAuthorAvatarIsWhitelisted,
  setAuthorAvatarsWhitelistedTokenAddresses,
  verifyAuthorAvatarSignature,
  getNftMessageToSign,
} from "./author-avatars";
import { useAuthorAvatar } from "./authors";
import { setPkcJs } from "../..";
import PkcJsMock from "../../lib/pkc-js/pkc-js-mock";
import { Nft, Author } from "../../types";
import { ethers } from "ethers";

vi.mock("../../lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/chain")>();
  return {
    ...actual,
    getNftMetadataUrl: vi.fn(),
    getNftImageUrl: vi.fn(),
    getNftOwner: vi.fn(),
  };
});

import { getNftMetadataUrl, getNftImageUrl, getNftOwner } from "../../lib/chain";

const nft: Nft = {
  chainTicker: "eth",
  address: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
  id: "100",
  timestamp: Math.ceil(Date.now() / 1000),
};

describe("author-avatars", () => {
  beforeAll(async () => {
    setPkcJs(PkcJsMock);
    await testUtils.resetDatabasesAndStores();
    testUtils.silenceReactWarnings();
  });

  afterAll(() => {
    testUtils.restoreAll();
  });

  beforeEach(() => {
    vi.mocked(getNftMetadataUrl).mockReset();
    vi.mocked(getNftImageUrl).mockReset();
    vi.mocked(getNftOwner).mockReset();
    delete process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT;
  });

  afterEach(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  describe("useNftMetadataUrl", () => {
    it("returns metadataUrl on success", async () => {
      vi.mocked(getNftMetadataUrl).mockResolvedValue("https://metadata.url");
      const rendered = renderHook(() => useNftMetadataUrl(nft));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.metadataUrl === "https://metadata.url");
      expect(rendered.result.current.metadataUrl).toBe("https://metadata.url");
      expect(rendered.result.current.error).toBe(undefined);
    });

    it("sets error when getNftMetadataUrl throws", async () => {
      const err = new Error("metadata fetch failed");
      vi.mocked(getNftMetadataUrl).mockRejectedValue(err);
      const rendered = renderHook(() => useNftMetadataUrl(nft));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.error !== undefined);
      expect(rendered.result.current.error).toBe(err);
      expect(rendered.result.current.metadataUrl).toBe(undefined);
    });

    it("returns undefined when no account", async () => {
      const rendered = renderHook(() => useNftMetadataUrl(nft, "nonexistent-account"));
      await act(() => {});
      expect(rendered.result.current.metadataUrl).toBe(undefined);
      expect(vi.mocked(getNftMetadataUrl)).not.toHaveBeenCalled();
    });

    it("returns undefined when no nft", async () => {
      const rendered = renderHook(() => useNftMetadataUrl(undefined));
      await act(() => {});
      expect(rendered.result.current.metadataUrl).toBe(undefined);
      expect(vi.mocked(getNftMetadataUrl)).not.toHaveBeenCalled();
    });
  });

  describe("useNftImageUrl", () => {
    it("throws when nftMetadataUrl is not string", () => {
      expect(() => renderHook(() => useNftImageUrl(123 as any))).toThrow(
        "useNftImageUrl invalid argument nftMetadataUrl",
      );
    });

    it("returns imageUrl on success", async () => {
      vi.mocked(getNftImageUrl).mockResolvedValue("https://image.url");
      const rendered = renderHook(() => useNftImageUrl("https://metadata.url"));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.imageUrl === "https://image.url");
      expect(rendered.result.current.imageUrl).toBe("https://image.url");
      expect(rendered.result.current.error).toBe(undefined);
    });

    it("sets error when getNftImageUrl throws", async () => {
      const err = new Error("image fetch failed");
      vi.mocked(getNftImageUrl).mockRejectedValue(err);
      const rendered = renderHook(() => useNftImageUrl("https://metadata.url"));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.error !== undefined);
      expect(rendered.result.current.error).toBe(err);
      expect(rendered.result.current.imageUrl).toBe(undefined);
    });

    it("returns undefined when no account", async () => {
      const rendered = renderHook(() => useNftImageUrl("https://meta.url", "nonexistent"));
      await act(() => {});
      expect(rendered.result.current.imageUrl).toBe(undefined);
      expect(vi.mocked(getNftImageUrl)).not.toHaveBeenCalled();
    });

    it("returns undefined when no nftMetadataUrl", async () => {
      const rendered = renderHook(() => useNftImageUrl(undefined));
      await act(() => {});
      expect(rendered.result.current.imageUrl).toBe(undefined);
      expect(vi.mocked(getNftImageUrl)).not.toHaveBeenCalled();
    });
  });

  describe("useVerifiedAuthorAvatarSignature", () => {
    const author: Author = {
      address: "12D3KooW...",
      avatar: { ...nft, signature: { signature: "0x123" } as any },
    };

    it("returns verified true when signature matches owner", async () => {
      const signerAddr = "0x1234567890123456789012345678901234567890";
      vi.mocked(getNftOwner).mockResolvedValue(signerAddr);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue(signerAddr as any);

      const rendered = renderHook(() => useVerifiedAuthorAvatarSignature(author));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.verified === true);
      expect(rendered.result.current.verified).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);
    });

    it("returns verified false when owner does not match signature", async () => {
      vi.mocked(getNftOwner).mockResolvedValue("0xowner");
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue("0xsigner" as any);

      const rendered = renderHook(() => useVerifiedAuthorAvatarSignature(author));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.verified === false);
      expect(rendered.result.current.verified).toBe(false);
    });

    it("sets error when verifyAuthorAvatarSignature throws", async () => {
      vi.mocked(getNftOwner).mockRejectedValue(new Error("chain error"));
      const rendered = renderHook(() => useVerifiedAuthorAvatarSignature(author));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.error !== undefined);
      expect(rendered.result.current.error?.message).toBe("chain error");
    });

    it("returns verified true when REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT is set", async () => {
      const orig = process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT;
      process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT = "1";
      const rendered = renderHook(() => useVerifiedAuthorAvatarSignature(author));
      expect(rendered.result.current.verified).toBe(true);
      expect(rendered.result.current.error).toBe(undefined);
      process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT = orig;
    });

    it("returns undefined when no account", async () => {
      delete process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT;
      const rendered = renderHook(() => useVerifiedAuthorAvatarSignature(author, "nonexistent"));
      await act(() => {});
      expect(rendered.result.current.verified).toBe(undefined);
      expect(vi.mocked(getNftOwner)).not.toHaveBeenCalled();
    });

    it("returns undefined when no author avatar", async () => {
      delete process.env.REACT_APP_BITSOCIAL_REACT_HOOKS_MOCK_CONTENT;
      const rendered = renderHook(() =>
        useVerifiedAuthorAvatarSignature({ ...author, avatar: undefined }),
      );
      await act(() => {});
      expect(rendered.result.current.verified).toBe(undefined);
      expect(vi.mocked(getNftOwner)).not.toHaveBeenCalled();
    });
  });

  describe("useAuthorAvatarIsWhitelisted and setAuthorAvatarsWhitelistedTokenAddresses", () => {
    it("returns true when nft address is whitelisted", () => {
      setAuthorAvatarsWhitelistedTokenAddresses(["0xNEWADDR"]);
      const rendered = renderHook(() =>
        useAuthorAvatarIsWhitelisted({ ...nft, address: "0xNEWADDR" }),
      );
      expect(rendered.result.current).toBe(true);
    });

    it("returns true when nft address is whitelisted (lowercase)", () => {
      setAuthorAvatarsWhitelistedTokenAddresses(["0xnewaddr"]);
      const rendered = renderHook(() =>
        useAuthorAvatarIsWhitelisted({ ...nft, address: "0xNEWADDR" }),
      );
      expect(rendered.result.current).toBe(true);
    });

    it("returns false when nft address is not whitelisted", () => {
      setAuthorAvatarsWhitelistedTokenAddresses([]);
      const rendered = renderHook(() => useAuthorAvatarIsWhitelisted(nft));
      expect(rendered.result.current).toBe(false);
    });

    it("returns false when nft has no address", () => {
      const rendered = renderHook(() => useAuthorAvatarIsWhitelisted(undefined));
      expect(rendered.result.current).toBeFalsy();
    });
  });

  describe("useAuthorAvatar states", () => {
    beforeAll(() => {
      setAuthorAvatarsWhitelistedTokenAddresses(["0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d"]);
    });

    it("shows fetching-owner when getNftOwner is pending", async () => {
      vi.mocked(getNftOwner).mockImplementation(() => new Promise(() => {}));
      const author: Author = {
        address: "12D3KooW...",
        avatar: { ...nft, signature: { signature: "0x123" } as any },
      };
      const rendered = renderHook(() => useAuthorAvatar({ author }));
      await act(() => {});
      expect(rendered.result.current.state).toBe("fetching-owner");
    });

    it("shows fetching-uri when verified is set but metadataUrl pending", async () => {
      const signerAddr = "0x1234567890123456789012345678901234567890";
      vi.mocked(getNftOwner).mockResolvedValue(signerAddr);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue(signerAddr as any);
      vi.mocked(getNftMetadataUrl).mockImplementation(() => new Promise(() => {}));
      const author: Author = {
        address: "12D3KooW...",
        avatar: { ...nft, signature: { signature: "0x123" } as any },
      };
      const rendered = renderHook(() => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "fetching-uri");
      expect(rendered.result.current.state).toBe("fetching-uri");
    });

    it("shows fetching-metadata when metadataUrl is set but imageUrl pending", async () => {
      const signerAddr = "0x1234567890123456789012345678901234567890";
      vi.mocked(getNftOwner).mockResolvedValue(signerAddr);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue(signerAddr as any);
      vi.mocked(getNftMetadataUrl).mockResolvedValue("https://metadata.url");
      vi.mocked(getNftImageUrl).mockImplementation(() => new Promise(() => {}));
      const author: Author = {
        address: "12D3KooW...",
        avatar: { ...nft, signature: { signature: "0x123" } as any },
      };
      const rendered = renderHook(() => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "fetching-metadata");
      expect(rendered.result.current.state).toBe("fetching-metadata");
    });

    it("shows succeeded when imageUrl is resolved", async () => {
      const signerAddr = "0x1234567890123456789012345678901234567890";
      vi.mocked(getNftOwner).mockResolvedValue(signerAddr);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue(signerAddr as any);
      vi.mocked(getNftMetadataUrl).mockResolvedValue("https://metadata.url");
      vi.mocked(getNftImageUrl).mockResolvedValue("https://image.url");
      const author: Author = {
        address: "12D3KooW...",
        avatar: { ...nft, signature: { signature: "0x123" } as any },
      };
      const rendered = renderHook(() => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "succeeded");
      expect(rendered.result.current.state).toBe("succeeded");
      expect(rendered.result.current.imageUrl).toBe("https://image.url");
    });

    it("shows failed when verified is false (verifiedError)", async () => {
      setAuthorAvatarsWhitelistedTokenAddresses(["0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d"]);
      vi.mocked(getNftOwner).mockResolvedValue("0xowner");
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue("0xsigner" as any);
      const author: Author = {
        address: "12D3KooW...",
        avatar: { ...nft, signature: { signature: "0x123" } as any },
      };
      const rendered = renderHook(() => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error?.message).toContain("signature proof invalid");
    });

    it("shows failed when not whitelisted (whitelistedError)", async () => {
      setAuthorAvatarsWhitelistedTokenAddresses([]);
      const signerAddr = "0x1234567890123456789012345678901234567890";
      vi.mocked(getNftOwner).mockResolvedValue(signerAddr);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue(signerAddr as any);
      const author: Author = {
        address: "12D3KooW...",
        avatar: { ...nft, signature: { signature: "0x123" } as any },
      };
      const rendered = renderHook(() => useAuthorAvatar({ author }));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "failed");
      expect(rendered.result.current.state).toBe("failed");
      expect(rendered.result.current.error?.message).toContain("not whitelisted");
    });
  });

  describe("results of previous inputs", () => {
    const authorWithNftId = (address: string, id: string): Author => ({
      address,
      avatar: { ...nft, id, signature: { signature: "0x123" } as any },
    });
    const flush = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

    it("useVerifiedAuthorAvatarSignature ignores the verification of a previous author", async () => {
      let releaseFirstOwner: (owner: string) => void = () => {};
      vi.mocked(getNftOwner).mockImplementation(((address: string, id: string) =>
        id === "1"
          ? new Promise((resolve) => (releaseFirstOwner = resolve))
          : Promise.resolve("0xowner")) as any);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue("0xsigner" as any);

      const rendered = renderHook<any, any>((author) => useVerifiedAuthorAvatarSignature(author), {
        initialProps: authorWithNftId("12D3KooWfirst", "1"),
      });
      await flush();
      rendered.rerender(authorWithNftId("12D3KooWsecond", "2"));
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.verified === false);

      // the first author's nft owner arrives late and would verify
      releaseFirstOwner("0xsigner");
      await flush();
      expect(rendered.result.current.verified).toBe(false);
    });

    it("useNftMetadataUrl ignores the metadata url of a previous nft", async () => {
      let releaseFirstUrl: (url: string) => void = () => {};
      vi.mocked(getNftMetadataUrl).mockImplementation(
        () => new Promise((resolve) => (releaseFirstUrl = resolve)) as any,
      );
      const rendered = renderHook<any, any>((nft) => useNftMetadataUrl(nft), {
        initialProps: nft,
      });
      await flush();
      rendered.rerender(undefined);

      releaseFirstUrl("https://first.metadata.url");
      await flush();
      expect(rendered.result.current.metadataUrl).toBe(undefined);
    });

    it("useNftImageUrl ignores the image url of a previous metadata url", async () => {
      let releaseFirstUrl: (url: string) => void = () => {};
      vi.mocked(getNftImageUrl).mockImplementation(
        () => new Promise((resolve) => (releaseFirstUrl = resolve)) as any,
      );
      const rendered = renderHook<any, any>((metadataUrl) => useNftImageUrl(metadataUrl), {
        initialProps: "https://first.metadata.url",
      });
      await flush();
      rendered.rerender(undefined);

      releaseFirstUrl("https://first.image.url");
      await flush();
      expect(rendered.result.current.imageUrl).toBe(undefined);
    });

    it("useAuthorAvatar doesn't return the previous author's image", async () => {
      setAuthorAvatarsWhitelistedTokenAddresses([nft.address]);
      vi.mocked(getNftOwner).mockImplementation(((address: string, id: string) =>
        id === "1" ? Promise.resolve("0xsigner") : new Promise(() => {})) as any);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue("0xsigner" as any);
      let releaseFirstMetadataUrl: (url: string) => void = () => {};
      vi.mocked(getNftMetadataUrl).mockImplementation(
        () => new Promise((resolve) => (releaseFirstMetadataUrl = resolve)) as any,
      );
      vi.mocked(getNftImageUrl).mockResolvedValue("https://first.image.url");

      const rendered = renderHook<any, any>((author) => useAuthorAvatar({ author }), {
        initialProps: authorWithNftId("12D3KooWfirst", "1"),
      });
      const waitFor = testUtils.createWaitFor(rendered);
      await waitFor(() => rendered.result.current.state === "fetching-uri");

      // the second author's ownership is still unverified when the first metadata url arrives
      rendered.rerender(authorWithNftId("12D3KooWsecond", "2"));
      await flush();
      releaseFirstMetadataUrl("https://first.metadata.url");
      await flush();
      expect(rendered.result.current.imageUrl).toBe(undefined);
      expect(rendered.result.current.state).toBe("fetching-owner");
    });
  });

  describe("getNftMessageToSign", () => {
    it("returns correctly formatted message", () => {
      const msg = getNftMessageToSign("0xauthor", 123, "0xtoken", "1");
      const parsed = JSON.parse(msg);
      expect(parsed.domainSeparator).toBe("pkc-author-avatar");
      expect(parsed.authorAddress).toBe("0xauthor");
      expect(parsed.timestamp).toBe(123);
      expect(parsed.tokenAddress).toBe("0xtoken");
      expect(parsed.tokenId).toBe("1");
    });
  });

  describe("verifyAuthorAvatarSignature", () => {
    const validNft: Nft = {
      ...nft,
      signature: {
        signature: "0xsig",
        type: "eip191",
        signedPropertyNames: [],
      } as any,
    };

    it("returns true when owner matches signature", async () => {
      const ownerAddr = "0x1234567890123456789012345678901234567890";
      vi.mocked(getNftOwner).mockResolvedValue(ownerAddr);
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue(ownerAddr as any);
      const res = await verifyAuthorAvatarSignature(validNft, "0xauthor", {
        eth: { urls: ["http://rpc"], chainId: 1 },
      } as any);
      expect(res).toBe(true);
    });

    it("returns false when owner does not match signature", async () => {
      vi.mocked(getNftOwner).mockResolvedValue("0xowner");
      vi.spyOn(ethers.utils, "verifyMessage").mockReturnValue("0xsigner" as any);
      const res = await verifyAuthorAvatarSignature(validNft, "0xauthor", {
        eth: { urls: ["http://rpc"], chainId: 1 },
      } as any);
      expect(res).toBe(false);
    });

    it("throws when nft is invalid", async () => {
      await expect(verifyAuthorAvatarSignature(null as any, "0xauthor", {} as any)).rejects.toThrow(
        "invalid nft argument",
      );
    });

    it("throws when nft.address is missing", async () => {
      await expect(
        verifyAuthorAvatarSignature(
          { ...validNft, address: undefined as any },
          "0xauthor",
          {} as any,
        ),
      ).rejects.toThrow("invalid nft.address");
    });

    it("throws when nft.id is invalid", async () => {
      await expect(
        verifyAuthorAvatarSignature({ ...validNft, id: 123 as any }, "0xauthor", {} as any),
      ).rejects.toThrow("invalid nft.tokenAddress");
    });

    it("throws when nft.timestamp is invalid", async () => {
      await expect(
        verifyAuthorAvatarSignature(
          { ...validNft, timestamp: "123" as any },
          "0xauthor",
          {} as any,
        ),
      ).rejects.toThrow("invalid nft.timestamp");
    });

    it("throws when nft.signature is missing", async () => {
      await expect(
        verifyAuthorAvatarSignature(
          { ...validNft, signature: undefined as any },
          "0xauthor",
          {} as any,
        ),
      ).rejects.toThrow("invalid nft.signature");
    });

    it("throws when nft.signature.signature is missing", async () => {
      await expect(
        verifyAuthorAvatarSignature({ ...validNft, signature: {} as any }, "0xauthor", {} as any),
      ).rejects.toThrow("invalid nft.signature.signature");
    });

    it("throws when authorAddress is empty", async () => {
      await expect(verifyAuthorAvatarSignature(validNft, "", {} as any)).rejects.toThrow(
        "invalid authorAddress",
      );
    });
  });
});
