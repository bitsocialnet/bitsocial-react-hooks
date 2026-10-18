import { Feeds, FeedsOptions, FeedsCommunitiesPostCounts } from "../../types.js";
export declare const defaultPostsPerPage = 25;
type FeedsState = {
    feedsOptions: FeedsOptions;
    bufferedFeeds: Feeds;
    loadedFeeds: Feeds;
    updatedFeeds: Feeds;
    bufferedFeedsCommunitiesPostCounts: FeedsCommunitiesPostCounts;
    feedsHaveMore: {
        [feedName: string]: boolean;
    };
    feedsCommunityKeysWithNewerPosts: {
        [feedName: string]: string[];
    };
    feedsCommunityKeysWithMore: {
        [feedName: string]: string[];
    };
    addFeedToStore: Function;
    incrementFeedPageNumber: Function;
    expandFeedTimeWindow: Function;
    resetFeed: Function;
    updateFeeds: Function;
};
declare const feedsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<FeedsState>>;
export declare const resetFeedsStore: () => Promise<void>;
export declare const resetFeedsDatabaseAndStore: () => Promise<void>;
export default feedsStore;
//# sourceMappingURL=feeds-store.d.ts.map