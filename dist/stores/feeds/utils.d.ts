import { Comment, Feeds, FeedsOptions, Community, Communities, Accounts, CommunitiesPages, FeedsCommunitiesPostCounts } from "../../types.js";
/**
 * Calculate the feeds from all the loaded community pages, filter and sort them
 */
export declare const getFilteredSortedFeeds: (feedsOptions: FeedsOptions, communities: Communities, communitiesPages: CommunitiesPages, accounts: Accounts, freshestComments?: {
    [commentCid: string]: Comment;
}) => Feeds;
export declare const getLoadedFeeds: (feedsOptions: FeedsOptions, filteredSortedFeeds: Feeds, loadedFeeds: Feeds, bufferedFeeds: Feeds, accounts: Accounts) => Promise<Feeds>;
export declare const addAccountsComments: (feedsOptions: FeedsOptions, loadedFeeds: Feeds) => boolean;
export declare const getBufferedFeedsWithoutLoadedFeeds: (bufferedFeeds: Feeds, loadedFeeds: Feeds) => Feeds;
export declare const getUpdatedFeeds: (feedsOptions: FeedsOptions, filteredSortedFeeds: Feeds, updatedFeeds: Feeds, loadedFeeds: Feeds, accounts: Accounts) => Promise<Feeds>;
export declare const getFeedsCommunityKeysWithNewerPosts: (feedsOptions: FeedsOptions, filteredSortedFeeds: Feeds, loadedFeeds: Feeds, previousFeedsCommunityKeysWithNewerPosts: {
    [feedName: string]: string[];
}) => {
    [feedName: string]: string[];
};
export declare const getFeedsCommunitiesPostCounts: (feedsOptions: FeedsOptions, feeds: Feeds) => FeedsCommunitiesPostCounts;
/**
 * Get which feeds have more posts, i.e. have not reached the final page of all subs
 */
export declare const getFeedsHaveMore: (feedsOptions: FeedsOptions, bufferedFeeds: Feeds, communities: Communities, communitiesPages: CommunitiesPages, accounts: Accounts) => {
    [feedName: string]: boolean;
};
/**
 * Get which communities of each feed still have more posts: buffered posts the feed has not loaded
 * yet, or pages not fetched yet. Blocked communities are left out.
 */
export declare const getFeedsCommunityKeysWithMore: (feedsOptions: FeedsOptions, bufferedFeedsCommunitiesPostCounts: FeedsCommunitiesPostCounts, communities: Communities, communitiesPages: CommunitiesPages, accounts: Accounts, previousFeedsCommunityKeysWithMore: {
    [feedName: string]: string[];
}) => {
    [feedName: string]: string[];
};
export declare const getFeedsCommunities: (feedsOptions: FeedsOptions, communities: Communities) => Map<string, Community>;
export declare const feedsCommunitiesChanged: (previousFeedsCommunities: Map<string, Community>, feedsCommunities: Map<string, Community>) => boolean;
export declare const getFeedsCommunitiesFirstPageCids: (feedsCommunities: Map<string, Community>) => string[];
export declare const getFeedsCommunitiesPostsPagesFirstUpdatedAts: (feedsCommunities: Map<string, Community>) => string;
export declare const getFeedsCommunitiesLoadedCount: (feedsCommunities: Map<string, Community>) => number;
export declare const getAccountsBlockedAddresses: (accounts: Accounts) => string[];
export declare const accountsBlockedAddressesChanged: (previousAccountsBlockedAddresses: {
    [address: string]: boolean;
}[], accountsBlockedAddresses: {
    [address: string]: boolean;
}[]) => boolean;
export declare const feedsHaveChangedBlockedAddresses: (feedsOptions: FeedsOptions, bufferedFeeds: Feeds, blockedAddresses: string[], previousBlockedAddresses: string[]) => boolean;
export declare const getAccountsBlockedCids: (accounts: Accounts) => string[];
export declare const accountsBlockedCidsChanged: (previousAccountsBlockedCids: {
    [address: string]: boolean;
}[], accountsBlockedCids: {
    [address: string]: boolean;
}[]) => boolean;
export declare const feedsHaveChangedBlockedCids: (feedsOptions: FeedsOptions, bufferedFeeds: Feeds, blockedCids: string[], previousBlockedCids: string[]) => boolean;
//# sourceMappingURL=utils.d.ts.map