import {
  getEthWalletFromPkcPrivateKey,
  getEthPrivateKeyFromPkcPrivateKey,
  validateEthWallet,
} from "../../dist";
// published as @bitsocial/bitsocial-react-hooks/author-wallet-proof
import {
  verifyAuthorWallet,
  getWalletMessageToSign,
} from "../../dist/lib/chain/author-wallet-proof.js";

// a real account key and its key address, as pkc-js derives it
const pkcPrivateKey = "Q2dsIzBWgHZuof0Aq1KhtMhmW2z5gM8NYY0NL+daBcI";
const authorPublicKey = "12D3KooWNzFJQ7CCcSCZNg7925WWHMzqVS4qe663PfQ3uBNCHZQb";
const walletTimestamp = 1759958639;

// BSIP-22 test vector (bitsocialnet/BSIPs assets/bsip-22/wallet-proof-vectors.json, CC0)
const vector = {
  authorPublicKey: "12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5",
  walletAddress: "0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c",
  timestamp: 1790000000,
  proofMessage:
    '{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5","walletAddress":"0x5050a4f4b3f9338c3472dcc01a87c76a144b3c9c","timestamp":1790000000}',
  signature:
    "0xfc705f790e2744d8acbec610783ce999e253392b9699cef1c20b338648a5aa132b8e6f5f836d314ad173ec97bb453d8a2df2fd1207ced2263f5701bdad17f0e31c",
};

describe("chain", () => {
  describe("BSIP-22 wallet proofs", () => {
    test("verifyAuthorWallet and getWalletMessageToSign match the BSIP-22 vector", () => {
      expect(
        getWalletMessageToSign(vector.authorPublicKey, vector.walletAddress, vector.timestamp),
      ).toBe(vector.proofMessage);
      const entry = {
        address: vector.walletAddress,
        timestamp: vector.timestamp,
        signature: { signature: vector.signature, type: "eip191" },
      };
      expect(
        verifyAuthorWallet(entry, vector.authorPublicKey, { nowSeconds: vector.timestamp }).outcome,
      ).toBe("valid");
      expect(
        verifyAuthorWallet({ ...entry, timestamp: vector.timestamp + 1 }, vector.authorPublicKey, {
          nowSeconds: vector.timestamp,
        }).outcome,
      ).toBe("invalid");
      expect(
        verifyAuthorWallet(
          { ...entry, signature: { ...entry.signature, type: "future" } },
          vector.authorPublicKey,
        ).outcome,
      ).toBe("unknown");
    });
  });

  describe("eth wallet", () => {
    let wallet, privateKey;
    beforeAll(async () => {
      privateKey = await getEthPrivateKeyFromPkcPrivateKey(pkcPrivateKey);
      const dateNow = Date.now;
      Date.now = () => walletTimestamp * 1000;
      wallet = await getEthWalletFromPkcPrivateKey(pkcPrivateKey);
      Date.now = dateNow;
    });

    test("getEthWalletFromPkcPrivateKey signs a BSIP-22 proof over the key address", async () => {
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
      ).rejects.toThrow("signature does not recover the wallet address");
      await expect(
        validateEthWallet(
          { ...wallet, address: "0x0000000000000000000000000000000000000000" },
          authorPublicKey,
        ),
      ).rejects.toThrow("signature does not recover the wallet address");
      await expect(
        validateEthWallet({ ...wallet, signature: undefined }, authorPublicKey),
      ).rejects.toThrow("signature is not an object");
      // the runtime author.address or a name is never the signed author
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
      await expect(validateEthWallet(oldWallet, authorPublicKey)).rejects.toThrow(
        "signature does not recover the wallet address",
      );
    });
  });
});
