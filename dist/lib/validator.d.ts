declare const validator: {
    validateAccountsActionsPublishCommentArguments: ({ publishCommentOptions, accountName, account, }: any) => void;
    validateAccountsActionsPublishCommentEditArguments: ({ publishCommentEditOptions, accountName, account, }: any) => void;
    validateAccountsActionsPublishCommentModerationArguments: ({ publishCommentModerationOptions, accountName, account, }: any) => void;
    validateAccountsActionsPublishCommunityEditArguments: ({ communityAddress, publishCommunityEditOptions, accountName, account, }: any) => void;
    validateAccountsActionsCreateCommunityArguments: (createCommunityOptions: any) => void;
    validateAccountsActionsPublishVoteArguments: ({ publishVoteOptions, accountName, account, }: any) => void;
    validateAccountsActionsExportAccountArguments: (accountName: any) => void;
    validateAccountsActionsSetAccountsOrderArguments: (newOrderedAccountNames: any, accountNames: any) => void;
    validateAccountsActionsSetAccountArguments: (account: any) => void;
    validateAccountsActionsSetAccountAuthorName: (author: any, previousAuthor: any) => void;
    validateAccountsActionsSetActiveAccountArguments: (accountName: any) => void;
    validateAccountsDatabaseAddAccountArguments: (account: any) => void;
    validateAccountsDatabaseGetAccountsArguments: (accountIds: any) => void;
    validateAccountsDatabaseAccountNames: (accountNames: any) => void;
    validateUseCommentArguments: (commentCid: any, account: any) => void;
    validateUseCommentsArguments: (commentCids: any, account: any) => void;
    validateUseCommunityArguments: ({ community, communityAddress, account }: any) => void;
    validateUseCommunityStatsArguments: ({ community, communityAddress }: any) => void;
    validateUseCommunitiesArguments: ({ communities, communityRefs, communityAddresses, account, }: any) => void;
    validateUseCommunitiesStatesArguments: ({ communities, communityRefs, communityAddresses, }: any) => void;
    validateFeedSortType: (sortType: any) => void;
    validateUseFeedArguments: ({ communities, communityRefs, communityAddresses, sortType, accountName, postsPerPage, filter, newerThan, accountComments, }: any) => void;
    validateUseBufferedFeedsArguments: ({ feedsOptions, accountName, }: {
        feedsOptions?: any;
        accountName?: any;
    }) => void;
    validateRepliesSortType: (sortType: any) => void;
    validateUseRepliesArguments: (comment?: any, sortType?: any, accountName?: any, onlyIfCached?: any, flat?: any, accountComments?: any, postsPerPage?: any, filter?: any) => void;
};
export default validator;
//# sourceMappingURL=validator.d.ts.map