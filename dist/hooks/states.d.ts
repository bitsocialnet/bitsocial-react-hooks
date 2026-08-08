import { UseClientsStatesOptions, UseClientsStatesResult, UseCommunitiesStatesOptions, UseCommunitiesStatesResult } from "../types.js";
/**
 * @param comment - The comment to get the states from
 * @param community - The community to get the states from
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useClientsStates(options?: UseClientsStatesOptions): UseClientsStatesResult;
/**
 * @param communities - The communities to get the states from
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useCommunitiesStates(options?: UseCommunitiesStatesOptions): UseCommunitiesStatesResult;
//# sourceMappingURL=states.d.ts.map