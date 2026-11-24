import { ethers } from "ethers";
import { getNftImageUrl } from ".";
import {
  getEthWalletFromPkcPrivateKey,
  getEthPrivateKeyFromPkcPrivateKey,
  validateEthWallet,
  verifyAuthorWallet,
  getWalletMessageToSign,
} from "../..";
// BSIP-22 test vectors, copied from bitsocialnet/BSIPs assets/bsip-22/wallet-proof-vectors.json (CC0)
import vectors from "./fixtures/bsip-22-wallet-proof-vectors.json";

const avatarNft1 = {
  chainTicker: "eth",
  address: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", // the contract address of the nft
  id: 100, // the nft number 100 in the colletion
};
const avatarNft2 = {
  chainTicker: "matic",
  address: "0xf6d8e606c862143556b342149a7fe0558c220375", // the contract address of the nft
  id: 100, // the nft number 100 in the colletion
};

const ipfsGatewayUrl = "https://cloudflare-ipfs.com";

const chainProviders = {
  eth: {
    // default should not use a url, but rather ethers.js default provider
    urls: ["ethers.js"],
    chainId: 1,
  },
  avax: {
    urls: ["https://api.avax.network/ext/bc/C/rpc"],
    chainId: 43114,
  },
  matic: {
    urls: ["https://polygon-rpc.com"],
    chainId: 137,
  },
};

// a real account key and its key address, as pkc-js derives it
const pkcPrivateKey = "Q2dsIzBWgHZuof0Aq1KhtMhmW2z5gM8NYY0NL+daBcI";
const authorPublicKey = "12D3KooWNzFJQ7CCcSCZNg7925WWHMzqVS4qe663PfQ3uBNCHZQb";
const walletTimestamp = 1759958639;

describe("chain", () => {
  describe("nft", () => {
    const timeout = 30000;

    // skip because uses internet and not deterministic
    // also cache and pending is difficult to test without console logging it
    test.skip("getNftImageUrl (cache and pending)", { timeout }, async () => {
      // const url = await getNftImageUrl(avatarNft1, ipfsGatewayUrl, chainProviders)
      // console.log(url)
      // const cachedUrl = await getNftImageUrl(avatarNft1, ipfsGatewayUrl, chainProviders)
      // console.log(cachedUrl)
      // const res = await Promise.all([getNftImageUrl(avatarNft2, ipfsGatewayUrl, chainProviders), getNftImageUrl(avatarNft2, ipfsGatewayUrl, chainProviders)])
      // console.log(res)
    });
  });

  describe("BSIP-22 wallet proofs", () => {
    test("getWalletMessageToSign builds the exact proof message", () => {
      expect(
        getWalletMessageToSign(vectors.authorKey.address, vectors.walletAddress, vectors.timestamp),
      ).toBe(vectors.proofMessage);
      // the runtime author.address or a name is never the signed author
      expect(() =>
        getWalletMessageToSign("authoraddress.eth", vectors.walletAddress, vectors.timestamp),
      ).toThrow("is not a key address");
    });

    test("signing the proof message as hooks does reproduces the vector signature", async () => {
      const signature = await new ethers.Wallet(`0x${vectors.walletPrivateKeyHex}`).signMessage(
        getWalletMessageToSign(vectors.authorKey.address, vectors.walletAddress, vectors.timestamp),
      );
      expect(signature).toBe(vectors.validSignature);
    });

    test.each(vectors.cases)("vector: $name", (vectorCase: any) => {
      const key = vectorCase.authorKey === "other" ? vectors.otherKey : vectors.authorKey;
      const result = verifyAuthorWallet(vectorCase.entry, key.address, {
        nowSeconds: vectorCase.verifierTime,
      });
      expect(result.outcome).toBe(vectorCase.outcome);
    });
  });

  describe("eth wallet", () => {
    let wallet: any, privateKey: any;
    beforeAll(async () => {
      privateKey = await getEthPrivateKeyFromPkcPrivateKey(pkcPrivateKey);
      const dateNow = Date.now;
      Date.now = () => walletTimestamp * 1000;
      // the second argument used to be author.address and is ignored: the proof binds the key address
      wallet = await getEthWalletFromPkcPrivateKey(pkcPrivateKey, "authoraddress.eth");
      Date.now = dateNow;
    });

    test("getEthWalletFromPkcPrivateKey signs a BSIP-22 proof over the key address", () => {
      expect(wallet.timestamp).toBe(walletTimestamp);
      expect(wallet.address).toBe("0x9097084f571AF3BFcc64E4dcA33FB3223071E4aB");
      expect(wallet.privateKey).toBe(undefined);
      expect(privateKey).toBe("0x43676c23305680766ea1fd00ab52a1b4c8665b6cf980cf0d618d0d2fe75a05c2");
      expect(wallet.signature.type).toBe("eip191");
      expect(
        verifyAuthorWallet(wallet, authorPublicKey, { nowSeconds: walletTimestamp }).outcome,
      ).toBe("valid");
    });

    test("validateEthWallet resolves only for a valid proof", async () => {
      await validateEthWallet(wallet, authorPublicKey);

      await expect(
        validateEthWallet({ ...wallet, timestamp: wallet.timestamp + 1 }, authorPublicKey),
      ).rejects.toThrow(
        "validateEthWallet invalid wallet: signature does not recover the wallet address",
      );
      await expect(validateEthWallet(wallet, vectors.otherKey.address)).rejects.toThrow(
        "signature does not recover the wallet address",
      );
      await expect(
        validateEthWallet(
          { ...wallet, address: "0x0000000000000000000000000000000000000000" },
          authorPublicKey,
        ),
      ).rejects.toThrow("signature does not recover the wallet address");
      await expect(
        validateEthWallet({ ...wallet, timestamp: undefined }, authorPublicKey),
      ).rejects.toThrow("timestamp is not an integer");
      await expect(
        validateEthWallet({ ...wallet, signature: undefined }, authorPublicKey),
      ).rejects.toThrow("signature is not an object");
      await expect(
        validateEthWallet(
          { ...wallet, signature: { ...wallet.signature, type: "sol" } },
          authorPublicKey,
        ),
      ).rejects.toThrow("validateEthWallet unknown wallet.signature.type 'sol'");
      await expect(validateEthWallet(wallet, "authoraddress.eth")).rejects.toThrow(
        "is not a key address",
      );
    });

    test("a proof in the pre-BSIP-22 format is invalid", async () => {
      // signed by hooks before BSIP-22, over {"domainSeparator":"pkc-author-wallet","authorAddress":...}
      const oldWallet = {
        address: "0x9097084f571AF3BFcc64E4dcA33FB3223071E4aB",
        timestamp: 1759958639,
        signature: {
          signature:
            "0xc0248dd8dd2273612de17eedda131bb0152c9751f21d0aa1f7306f52124ec6985cd1c0584d6d04adaf5856862001241758687d5f1fd7bd67c47d748be400a68b1b",
          type: "eip191",
        },
      };
      expect(verifyAuthorWallet(oldWallet, authorPublicKey)).toEqual({
        outcome: "invalid",
        reason: "signature does not recover the wallet address",
      });
      await expect(validateEthWallet(oldWallet, authorPublicKey)).rejects.toThrow(
        "signature does not recover the wallet address",
      );
    });
  });
});
