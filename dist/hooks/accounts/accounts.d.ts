import type { Account, UseAccountCommunitiesOptions, UseAccountCommunitiesResult, UseAccountVoteOptions, UseAccountVoteResult, UseAccountVotesOptions, UseAccountVotesResult, UseAccountCommentsOptions, UseAccountCommentsResult, UseAccountCommentOptions, UseAccountCommentResult, UseIsAccountCommentOptions, Comment, UseNotificationsOptions, UseNotificationsResult, UseAccountEditsOptions, UseAccountEditsResult, UseEditedCommentOptions, UseEditedCommentResult, UseAccountOptions, UseAccountResult, UsePubsubSubscribeOptions, UsePubsubSubscribeResult } from "../../types.js";
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
 * Whether the account published a loaded comment: it is in the account's local history (pending
 * comments included), it is signed by the account's key, or the community that aliased it on a
 * pseudonymous board tagged it as the account's (`pseudonymityAuthorTag`). The last two work on any
 * device holding the account key. Defaults to the active account. Use it outside React, e.g. to
 * check every reply of a thread.
 *
 * The signature and the tag are read, not verified: pass comments loaded through the hooks or
 * pkc-js, which verify them, or a comment from another source only after validateComment.
 *
 * The tag check loads the first time a comment needs it. Until then a comment recognized only by
 * its tag returns false; useIsAccountComment rerenders once it has loaded.
 */
export declare function isAccountComment(comment: Comment | undefined, options?: Pick<UseIsAccountCommentOptions, "accountName">): boolean;
/**
 * Whether the account published `comment`, see isAccountComment. Rerenders when the account or
 * its history changes whether the comment is the account's.
 */
export declare function useIsAccountComment(options?: UseIsAccountCommentOptions): boolean;
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