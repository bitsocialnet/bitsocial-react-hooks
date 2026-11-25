import { Wallet } from "../../types.js";
export declare const preloadAccountChainLibraries: () => void;
export declare const getNftImageUrl: (...args: any) => Promise<any>;
export declare const getNftMetadataUrl: (...args: any) => Promise<any>;
export declare const getNftOwner: (...args: any) => Promise<any>;
export declare const resolveEnsTxtRecord: (...args: any) => Promise<any>;
/**
 * The author wallet derived from the author's PKC private key, with a BSIP-22 proof. The proof
 * binds the key address of that private key, so it stays valid when author.address changes to a
 * name. The second argument is ignored: it used to be author.address, which BSIP-22 forbids.
 */
export declare const getEthWalletFromPkcPrivateKey: (privateKeyBase64: string, _authorAddress?: string) => Promise<{
    address: string;
    timestamp: number;
    signature: {
        signature: string;
        type: string;
    };
} | undefined>;
export declare const getEthPrivateKeyFromPkcPrivateKey: (privateKeyBase64: string, authorAddress?: string) => Promise<string | undefined>;
/**
 * Resolve when `wallet` is a valid BSIP-22 proof for the author key address `authorPublicKey`
 * (12D3KooW..., never author.address), throw otherwise, including for a signature type this check
 * doesn't implement. Use verifyAuthorWallet to tell invalid and unknown entries apart.
 */
export declare const validateEthWallet: (wallet: Wallet, authorPublicKey: string) => Promise<void>;
declare const _default: {
    getNftOwner: (...args: any) => Promise<any>;
    getNftMetadataUrl: (...args: any) => Promise<any>;
    getNftImageUrl: (...args: any) => Promise<any>;
    resolveEnsTxtRecord: (...args: any) => Promise<any>;
    getEthWalletFromPkcPrivateKey: (privateKeyBase64: string, _authorAddress?: string) => Promise<{
        address: string;
        timestamp: number;
        signature: {
            signature: string;
            type: string;
        };
    } | undefined>;
    getEthPrivateKeyFromPkcPrivateKey: (privateKeyBase64: string, authorAddress?: string) => Promise<string | undefined>;
    validateEthWallet: (wallet: Wallet, authorPublicKey: string) => Promise<void>;
};
export default _default;
//# sourceMappingURL=chain.d.ts.map