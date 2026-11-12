import { AccountNamesToAccountIds, Accounts, AccountsVotes, AccountsEdits, AccountsEditsSummaries, AccountsComments, AccountsCommentsIndexes, AccountsCommentsReplies, CommentCidsToAccountsComments } from "../../types.js";
export declare const listeners: any;
type AccountsState = {
    accounts: Accounts;
    accountIds: string[];
    activeAccountId: string | undefined;
    accountNamesToAccountIds: AccountNamesToAccountIds;
    accountsComments: AccountsComments;
    accountsCommentsIndexes: AccountsCommentsIndexes;
    commentCidsToAccountsComments: CommentCidsToAccountsComments;
    accountsCommentsUpdating: {
        [accountIdAndCommentCid: string]: boolean;
    };
    accountsCommentsReplies: AccountsCommentsReplies;
    accountsVotes: AccountsVotes;
    accountsEdits: AccountsEdits;
    accountsEditsSummaries: AccountsEditsSummaries;
    accountsEditsLoaded: {
        [accountId: string]: boolean;
    };
    accountsActions: {
        [functionName: string]: Function;
    };
    accountsActionsInternal: {
        [functionName: string]: Function;
    };
};
declare const accountsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AccountsState>>;
export declare const resetAccountsStore: () => Promise<void>;
export declare const resetAccountsDatabaseAndStore: () => Promise<void>;
export default accountsStore;
//# sourceMappingURL=accounts-store.d.ts.map