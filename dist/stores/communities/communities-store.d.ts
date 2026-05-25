import { Communities } from "../../types.js";
export declare const COMMUNITY_UPDATE_INTERVAL_MS: number;
export type CommunitiesState = {
    communities: Communities;
    errors: {
        [communityAddress: string]: Error[];
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