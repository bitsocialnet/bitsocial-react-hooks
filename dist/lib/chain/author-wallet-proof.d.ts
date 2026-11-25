export type AuthorWalletOutcome = {
    outcome: "valid";
} | {
    outcome: "unknown";
} | {
    outcome: "invalid";
    reason: string;
};
export declare const AUTHOR_WALLET_PROOF_CLOCK_ALLOWANCE_SECONDS = 300;
/**
 * The exact string the wallet signs. Built by concatenation because BSIP-22 fixes the field order;
 * it is valid JSON only so wallets can show the user what they sign. `authorPublicKey` is the key
 * address of the author's signing key (12D3KooW...), never the runtime author.address.
 */
export declare const getWalletMessageToSign: (authorPublicKey: string, walletAddress: string, timestamp: number) => string;
/**
 * Verify one `author.wallets` entry. `authorPublicKey` is the key address (12D3KooW...) of the
 * signing key of the publication or list carrying the entry; the proof counts only if that record's
 * own signature is valid too. Rely on an entry (show it as the author's wallet, count holdings,
 * send funds) only when the outcome is valid. An unknown entry uses a signature type this check
 * doesn't implement: it is unproven, and communities don't reject publications over it.
 */
export declare const verifyAuthorWallet: (wallet: unknown, authorPublicKey: string, options?: {
    nowSeconds?: number;
}) => AuthorWalletOutcome;
/** The key address (12D3KooW...) of a PKC private key (base64 ed25519 seed), as pkc-js derives it. */
export declare const getKeyAddressFromPkcPrivateKey: (privateKeyBase64: string) => string;
//# sourceMappingURL=author-wallet-proof.d.ts.map