import { AccountSubplebbit } from "../../types";
export declare const overwritePlebbitOptions: {
    resolveAuthorAddresses: boolean;
    validatePages: boolean;
};
export declare const getDefaultPlebbitOptions: () => any;
export declare const defaultMediaIpfsGatewayUrl: string;
export declare const generateDefaultAccount: () => Promise<{
    id: string;
    version: number;
    name: string;
    author: {
        address: any;
        wallets: {
            eth: {
                address: string;
                timestamp: number;
                signature: {
                    signature: string;
                    type: string;
                };
            } | undefined;
            sol: {
                address: string;
                timestamp: number;
                signature: {
                    signature: string;
                    type: string;
                };
            } | undefined;
        };
    };
    signer: any;
    plebbitOptions: any;
    plebbit: any;
    subscriptions: never[];
    blockedAddresses: {};
    blockedCids: {};
    subplebbits: {
        [subplebbitAddress: string]: AccountSubplebbit;
    };
    mediaIpfsGatewayUrl: string;
}>;
declare const accountGenerator: {
    generateDefaultAccount: () => Promise<{
        id: string;
        version: number;
        name: string;
        author: {
            address: any;
            wallets: {
                eth: {
                    address: string;
                    timestamp: number;
                    signature: {
                        signature: string;
                        type: string;
                    };
                } | undefined;
                sol: {
                    address: string;
                    timestamp: number;
                    signature: {
                        signature: string;
                        type: string;
                    };
                } | undefined;
            };
        };
        signer: any;
        plebbitOptions: any;
        plebbit: any;
        subscriptions: never[];
        blockedAddresses: {};
        blockedCids: {};
        subplebbits: {
            [subplebbitAddress: string]: AccountSubplebbit;
        };
        mediaIpfsGatewayUrl: string;
    }>;
    getDefaultPlebbitOptions: () => any;
};
export default accountGenerator;
