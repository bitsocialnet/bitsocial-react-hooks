import { Communities, CommunitySyncState } from "../../types.js";
export declare const COMMUNITY_UPDATE_INTERVAL_MS: number;
interface CommunitySyncStatus {
    syncState: CommunitySyncState;
    lastFetchAttemptAt?: number;
    lastSuccessfulFetchAt?: number;
}
export type CommunitiesState = {
    communities: Communities;
    errors: {
        [communityAddress: string]: Error[];
    };
    syncStatuses: {
        [communityAddress: string]: CommunitySyncStatus;
    };
    addCommunityToStore: Function;
    refreshCommunity: Function;
    editCommunity: Function;
    createCommunity: Function;
    deleteCommunity: Function;
};
declare const communitiesStore: import("zustand").UseBoundStore<import("zustand").StoreApi<CommunitiesState>>;
export declare const resetCommunitiesStore: () => Promise<void>;
export declare const resetCommunitiesDatabaseAndStore: () => Promise<void>;
export default communitiesStore;
//# sourceMappingURL=communities-store.d.ts.map