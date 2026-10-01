import { Wallet } from "../../types.js";
export declare const preloadAccountChainLibraries: () => void;
export declare const getNftImageUrl: (...args: any) => Promise<any>;
export declare const getNftMetadataUrl: (...args: any) => Promise<any>;
export declare const getNftOwner: (...args: any) => Promise<any>;
export declare const resolveEnsTxtRecord: (...args: any) => Promise<any>;
export declare const getWalletMessageToSign: (authorAddress: string, timestamp: number) => string;
export declare const getEthWalletFromPkcPrivateKey: (privateKeyBase64: string, authorAddress: string) => Promise<{
    address: string;
    timestamp: number;
    signature: {
        signature: string;
        type: string;
    };
} | undefined>;
export declare const getEthPrivateKeyFromPkcPrivateKey: (privateKeyBase64: string, authorAddress: string) => Promise<string | undefined>;
export declare const validateEthWallet: (wallet: Wallet, authorAddress: string) => Promise<void>;
export declare const validateEthWalletViem: (wallet: Wallet, authorAddress: string) => Promise<void>;
declare const _default: {
    getNftOwner: (...args: any) => Promise<any>;
    getNftMetadataUrl: (...args: any) => Promise<any>;
    getNftImageUrl: (...args: any) => Promise<any>;
    resolveEnsTxtRecord: (...args: any) => Promise<any>;
    getEthWalletFromPkcPrivateKey: (privateKeyBase64: string, authorAddress: string) => Promise<{
        address: string;
        timestamp: number;
        signature: {
            signature: string;
            type: string;
        };
    } | undefined>;
    getEthPrivateKeyFromPkcPrivateKey: (privateKeyBase64: string, authorAddress: string) => Promise<string | undefined>;
    validateEthWallet: (wallet: Wallet, authorAddress: string) => Promise<void>;
    validateEthWalletViem: (wallet: Wallet, authorAddress: string) => Promise<void>;
};
export default _default;
//# sourceMappingURL=chain.d.ts.map