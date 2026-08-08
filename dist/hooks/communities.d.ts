import { ChainProviders, UseResolvedCommunityAddressOptions, UseResolvedCommunityAddressResult, UseCommunityOptions, UseCommunityResult, UseCommunitiesOptions, UseCommunitiesResult, UseCommunityStatsOptions, UseCommunityStatsResult } from "../types.js";
/**
 * @param community - The community identifier, e.g. {name: 'memes.eth'} or {publicKey: '12D3KooW...'}
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useCommunity(options?: UseCommunityOptions): UseCommunityResult;
/**
 * @param community - The community identifier, e.g. {name: 'memes.eth'} or {publicKey: '12D3KooW...'}
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useCommunityStats(options?: UseCommunityStatsOptions): UseCommunityStatsResult;
/**
 * @param communities - The communities to fetch, e.g. [{name: 'memes.eth'}, {publicKey: '12D3KooW...'}]
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useCommunities(options?: UseCommunitiesOptions): UseCommunitiesResult;
/**
 * Returns all the owner communities created by pkc-js by calling pkc.listCommunities()
 */
export declare function useListCommunities(accountName?: string): string[];
/**
 * @param communityAddress - The community address to resolve to a public key, e.g. 'news.eth' resolves to '12D3KooW...'.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useResolvedCommunityAddress(options?: UseResolvedCommunityAddressOptions): UseResolvedCommunityAddressResult;
export declare const resolveCommunityAddress: (communityAddress: string, chainProviders: ChainProviders) => Promise<any>;
//# sourceMappingURL=communities.d.ts.map