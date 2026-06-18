import { Community, CommunityIdentifier } from "../types.js";
type LegacyCommunityRef = {
    address: string;
    name?: string;
    publicKey?: string;
};
export type CommunityLookupRef = CommunityIdentifier | LegacyCommunityRef;
export declare const getCommunityRefKey: (communityRef: CommunityLookupRef) => string;
export declare const getCommunityRefKeys: (communityRefs: CommunityLookupRef[]) => string[];
export declare const getCommunityLookupOptions: (communityRefOrAddress: CommunityLookupRef | string) => {
    name?: string;
    publicKey?: string;
} | {
    address: string;
};
export declare const mergeCommunityRefs: (base: CommunityLookupRef, extra: CommunityLookupRef) => CommunityLookupRef;
export declare const getUniqueSortedCommunityRefs: (communityRefs?: CommunityLookupRef[]) => CommunityLookupRef[];
export declare const isCommunityRef: (value: unknown) => value is CommunityLookupRef;
export declare function assertCommunityRef(value: unknown, label: string): asserts value is CommunityLookupRef;
export declare const doesAddressMatchCommunityRef: (communityAddress: string | undefined, communityRef: CommunityLookupRef, community?: Community) => boolean;
export declare const getMatchingCommunityRefKeys: (communityRefs: CommunityLookupRef[], communityAddress: string | undefined, community?: Community) => string[];
export {};
//# sourceMappingURL=community-ref.d.ts.map