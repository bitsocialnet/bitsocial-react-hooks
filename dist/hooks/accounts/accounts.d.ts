import type { Account, UseAccountCommunitiesOptions, UseAccountCommunitiesResult, UseAccountVoteOptions, UseAccountVoteResult, UseAccountVotesOptions, UseAccountVotesResult, UseAccountCommentsOptions, UseAccountCommentsResult, UseAccountCommentOptions, UseAccountCommentResult, UseNotificationsOptions, UseNotificationsResult, UseAccountEditsOptions, UseAccountEditsResult, UseEditedCommentOptions, UseEditedCommentResult, UseAccountOptions, UseAccountResult, UsePubsubSubscribeOptions, UsePubsubSubscribeResult } from "../../types.js";
/**
 * @param accountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, return
 * the active account id.
 */
export declare function useAccountId(accountName?: string): string | false | undefined;
/**
 * @param accountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, return
 * the active account.
 */
export declare function useAccount(options?: UseAccountOptions): UseAccountResult;
/**
 * Return all accounts in the order of `accountsStore.accountIds`. To reorder, use `accountsActions.setAccountsOrder(accountNames)`.
 */
export declare function useAccounts(): {
    accounts: Account[];
    state: string;
    error: undefined;
    errors: never[];
};
/**
 * Returns all communities where the account is a creator or moderator
 */
export declare function useAccountCommunities(options?: UseAccountCommunitiesOptions): UseAccountCommunitiesResult;
/**
 * Returns an account's notifications in an array. Unread notifications have a field markedAsRead: false.
 *
 * @param accountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, return
 * the active account's notifications.
 */
export declare function useNotifications(options?: UseNotificationsOptions): UseNotificationsResult;
export declare const haveAccountCommentStatesChanged: (nextStates: string[], previousStates: string[]) => boolean;
export declare function useAccountComments(options?: UseAccountCommentsOptions): UseAccountCommentsResult;
/**
 * Returns an account's single comment, e.g. a pending comment they published.
 */
export declare function useAccountComment(options?: UseAccountCommentOptions): UseAccountCommentResult;
/**
 * Returns the own user's votes stored locally, even those not yet published by the community owner.
 * Check UseAccountCommentsOptions type in types.tsx to filter them, e.g. filter = {communityAddresses: ['memes.eth']}.
 */
export declare function useAccountVotes(options?: UseAccountVotesOptions): UseAccountVotesResult;
/**
 * Returns an account's single vote on a comment, e.g. to know if you already voted on a comment.
 */
export declare function useAccountVote(options?: UseAccountVoteOptions): UseAccountVoteResult;
/**
 * Returns all the comment and community edits published by an account.
 */
export declare function useAccountEdits(options?: UseAccountEditsOptions): UseAccountEditsResult;
/**
 * Returns the comment edited (if has any edits), as well as the pending, succeeded or failed state of the edit.
 */
export declare function useEditedComment(options?: UseEditedCommentOptions): UseEditedCommentResult;
/**
 * This hook should be added to pages where the user is likely to publish something, i,e. the
 * submit page and the /c/<commentCid> page, it improves the speed of publishing to the pubsub
 * by subscribing to the pubsub right away.
 *
 * @param accountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'.
 * @param communityAddress - The community address to subscribe to, e.g. 'news.eth'.
 */
export declare function usePubsubSubscribe(options?: UsePubsubSubscribeOptions): UsePubsubSubscribeResult;
//# sourceMappingURL=accounts.d.ts.map