import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { getPkcAddressFromPublicKey } from "../pkc-address";

// Author wallet proofs as specified by BSIP-22 (https://github.com/bitsocialnet/BSIPs/blob/master/BSIPS/bsip-22.md).
// The same rules as pkc-js src/signer/author-wallet-proof.ts, which communities apply on acceptance.
// Verification is one hash and one public key recovery, so it is synchronous and needs no network.
// The hooks import this module dynamically so the curves stay out of an app's startup bundle; keep
// its top level free of calls so a bundler can drop it when an app doesn't use it.

export type AuthorWalletOutcome =
  | { outcome: "valid" }
  | { outcome: "unknown" }
  | { outcome: "invalid"; reason: string };

// a proof dated more than five minutes ahead of the verifier's clock is not valid yet
export const AUTHOR_WALLET_PROOF_CLOCK_ALLOWANCE_SECONDS = 300;

const DOMAIN_SEPARATOR = "bitsocial-author-wallet";
const WALLET_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_REGEX = /^0x[0-9a-fA-F]{130}$/;
// BSIP-10 key address: the base58btc peer id of an ed25519 key
const KEY_ADDRESS_REGEX = /^12D3KooW[1-9A-HJ-NP-Za-km-z]{44}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertKeyAddress = (authorPublicKey: unknown, functionName: string) => {
  if (typeof authorPublicKey !== "string" || !KEY_ADDRESS_REGEX.test(authorPublicKey)) {
    throw Error(
      `${functionName} authorPublicKey '${authorPublicKey}' is not a key address (12D3KooW...): pass the key address of the author's signing key, never author.address or author.name`,
    );
  }
};

/**
 * The exact string the wallet signs. Built by concatenation because BSIP-22 fixes the field order;
 * it is valid JSON only so wallets can show the user what they sign. `authorPublicKey` is the key
 * address of the author's signing key (12D3KooW...), never the runtime author.address.
 */
export const getWalletMessageToSign = (
  authorPublicKey: string,
  walletAddress: string,
  timestamp: number,
) => {
  assertKeyAddress(authorPublicKey, "getWalletMessageToSign");
  return `{"domainSeparator":"${DOMAIN_SEPARATOR}","authorPublicKey":"${authorPublicKey}","walletAddress":"${walletAddress.toLowerCase()}","timestamp":${timestamp}}`;
};

// EIP-191 version 0x45 (personal_sign): keccak256("\x19Ethereum Signed Message:\n" + byteLength + message)
const hashPersonalMessage = (message: string) => {
  const messageBytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${messageBytes.length}`);
  const bytes = new Uint8Array(prefix.length + messageBytes.length);
  bytes.set(prefix, 0);
  bytes.set(messageBytes, prefix.length);
  return keccak_256(bytes);
};

// the lowercase 0x address that signed `digest`, or undefined when no key recovers
const recoverAddress = (digest: Uint8Array, signatureBytes: Uint8Array) => {
  try {
    const signature = secp256k1.Signature.fromBytes(
      signatureBytes.slice(0, 64),
      "compact",
    ).addRecoveryBit(signatureBytes[64] - 27);
    const publicKey = signature.recoverPublicKey(digest).toBytes(false);
    return `0x${bytesToHex(keccak_256(publicKey.slice(1)).slice(12))}`;
  } catch {
    return;
  }
};

/**
 * Verify one `author.wallets` entry. `authorPublicKey` is the key address (12D3KooW...) of the
 * signing key of the publication or list carrying the entry; the proof counts only if that record's
 * own signature is valid too. Rely on an entry (show it as the author's wallet, count holdings,
 * send funds) only when the outcome is valid. An unknown entry uses a signature type this check
 * doesn't implement: it is unproven, and communities don't reject publications over it.
 */
export const verifyAuthorWallet = (
  wallet: unknown,
  authorPublicKey: string,
  options?: { nowSeconds?: number },
): AuthorWalletOutcome => {
  // a malformed key can come from the record being read, so it's an outcome, as in pkc-js
  if (typeof authorPublicKey !== "string" || !KEY_ADDRESS_REGEX.test(authorPublicKey)) {
    return {
      outcome: "invalid",
      reason:
        "authorPublicKey is not a key address (12D3KooW...), never author.address or author.name",
    };
  }
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const invalid = (reason: string): AuthorWalletOutcome => ({ outcome: "invalid", reason });

  // the shape every entry has, whatever its type; members BSIP-22 doesn't define are ignored
  if (!isRecord(wallet)) return invalid("wallet is not an object");
  const { address, timestamp, signature } = wallet;
  if (typeof address !== "string") return invalid("address is not a string");
  if (typeof timestamp !== "number" || !Number.isInteger(timestamp)) {
    return invalid("timestamp is not an integer");
  }
  if (!isRecord(signature)) return invalid("signature is not an object");
  if (typeof signature.signature !== "string")
    return invalid("signature.signature is not a string");
  if (typeof signature.type !== "string") return invalid("signature.type is not a string");

  if (signature.type !== "eip191") return { outcome: "unknown" };

  if (!WALLET_ADDRESS_REGEX.test(address)) {
    return invalid("address is not a 0x address with 40 hex digits");
  }
  if (timestamp < 0) return invalid("timestamp is negative");
  if (timestamp > nowSeconds + AUTHOR_WALLET_PROOF_CLOCK_ALLOWANCE_SECONDS) {
    return invalid(
      `timestamp is more than ${AUTHOR_WALLET_PROOF_CLOCK_ALLOWANCE_SECONDS} seconds in the future`,
    );
  }
  if (!SIGNATURE_REGEX.test(signature.signature)) {
    return invalid("signature is not 65 bytes as 0x and 130 hex digits");
  }
  const signatureBytes = hexToBytes(signature.signature.slice(2));
  // recovery libraries accept a v of 0/1 and a high s, so both are checked here
  const v = signatureBytes[64];
  if (v !== 27 && v !== 28) return invalid("signature v is not 27 or 28");
  const s = BigInt(`0x${bytesToHex(signatureBytes.slice(32, 64))}`);
  if (s > secp256k1.Point.Fn.ORDER >> BigInt(1)) {
    return invalid("signature s is in the upper half of the curve order");
  }

  const message = getWalletMessageToSign(authorPublicKey, address, timestamp);
  if (recoverAddress(hashPersonalMessage(message), signatureBytes) !== address.toLowerCase()) {
    return invalid("signature does not recover the wallet address");
  }
  return { outcome: "valid" };
};

/** The key address (12D3KooW...) of a PKC private key (base64 ed25519 seed), as pkc-js derives it. */
export const getKeyAddressFromPkcPrivateKey = (privateKeyBase64: string) => {
  const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
  if (privateKeyBytes.length !== 32) {
    throw Error("failed getting key address from private key not 32 bytes");
  }
  return getPkcAddressFromPublicKey(
    uint8ArrayToString(ed25519.getPublicKey(privateKeyBytes), "base64"),
  );
};
