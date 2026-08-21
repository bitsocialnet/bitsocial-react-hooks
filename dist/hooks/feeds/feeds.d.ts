import { UseBufferedFeedsOptions, UseBufferedFeedsResult, UseFeedOptions, UseFeedResult } from "../../types.js";
/**
 * @param communities - The communities to fetch, e.g. [{name: 'memes.eth'}, {publicKey: '12D3KooW...'}]
 * @param sortType - A sort name published by the community. Omit it to use the preloaded sort.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useFeed(options?: UseFeedOptions): UseFeedResult;
/**
 * Use useBufferedFeeds to buffer multiple feeds in the background so what when
 * they are called by useFeed later, they are already preloaded.
 *
 * @param feedOptions - The options of the feed
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useBufferedFeeds(options?: UseBufferedFeedsOptions): UseBufferedFeedsResult;
//# sourceMappingURL=feeds.d.ts.map