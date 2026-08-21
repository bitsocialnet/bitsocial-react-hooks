/**
 * Public interface
 */
export interface Options {
    accountName?: string;
    onError?(error: Error): void;
}
export interface Result {
    state: string;
    error: Error | undefined;
    errors: Error[];
}
export interface NameResolverInfo {
    key: string;
    nameSystem: string;
    chainTicker: string;
    provider: string;
    providerLabel: string;
}
export type CommunityIdentifier = {
    name: string;
    publicKey?: string;
} | {
    name?: string;
    publicKey: string;
};
export interface UseAccountOptions extends Options {
}
export interface UseAccountResult extends Result, Account {
}
export interface UseAccountsOptions extends Options {
}
export interface UseAccountsResult extends Result {
    accounts: Account[];
}
export interface UseAccountCommentsOptions extends Options {
    filter?: AccountPublicationsFilter;
    commentCid?: string;
    commentIndices?: number[];
    communityAddress?: string;
    parentCid?: string;
    newerThan?: number;
    page?: number;
    pageSize?: number;
    sortType?: "new" | "old";
    /** @deprecated use sortType */
    order?: "asc" | "desc";
}
export interface UseAccountCommentsResult extends Result {
    accountComments: AccountComment[];
}
export interface UseAccountCommentOptions extends Options {
    commentIndex?: number;
    commentCid?: string;
}
export interface UseAccountCommentResult extends Result, AccountComment {
}
export interface UseAccountVotesOptions extends Options {
    filter?: AccountPublicationsFilter;
    vote?: number;
    commentCid?: string;
    communityAddress?: string;
    newerThan?: number;
    page?: number;
    pageSize?: number;
    sortType?: "new" | "old";
    /** @deprecated use sortType */
    order?: "asc" | "desc";
}
export interface UseAccountVotesResult extends Result {
    accountVotes: AccountVote[];
}
export interface UseAccountVoteOptions extends Options {
    commentCid?: string;
}
export interface UseAccountVoteResult extends Result, AccountVote {
    commentCid: string | undefined;
    vote: number | undefined;
}
export interface UseAccountEditsOptions extends Options {
    filter?: AccountPublicationsFilter;
}
export interface UseAccountEditsResult extends Result {
    accountEdits: AccountEdit[];
}
export interface UseNotificationsOptions extends Options {
}
export interface UseNotificationsResult extends Result {
    notifications: Notification[];
    markAsRead(): Promise<void>;
}
export interface UseAccountCommunitiesOptions extends Options {
    onlyIfCached?: boolean;
}
export interface UseAccountCommunitiesResult extends Result {
    accountCommunities: {
        [communityAddress: string]: AccountCommunity & Partial<Community>;
    };
}
export interface UsePubsubSubscribeOptions extends Options {
    communityAddress?: string;
}
export interface UsePubsubSubscribeResult extends Result {
}
export interface UseCommentOptions extends Options {
    commentCid?: string;
    community?: CommunityIdentifier;
    /** Initial data passed to pkc.createComment, for example an embedded crosspost record. */
    initialComment?: Comment;
    onlyIfCached?: boolean;
    autoUpdate?: boolean;
}
export interface UseCommentResult extends Result, Comment {
    refresh(): Promise<void>;
}
export interface Crosspost {
    cid: string;
    comment: Comment;
}
export interface UseCrosspostOptions extends Options {
    crosspost?: Crosspost;
    autoUpdate?: boolean;
}
export interface UseCrosspostResult extends UseCommentResult {
    /** True once the referenced community's signed CommentUpdate has been loaded. */
    isCommunityVerified: boolean;
}
export interface UseCommentsOptions extends Options {
    commentCids?: string[];
    onlyIfCached?: boolean;
    autoUpdate?: boolean;
}
export interface UseCommentsResult extends Result {
    comments: (Comment | undefined)[];
    refresh(): Promise<void>;
}
export interface UseValidateCommentOptions extends Options {
    comment?: Comment;
    validateReplies?: boolean;
}
export interface UseValidateCommentResult extends Result {
    valid: boolean;
}
export interface UseRepliesOptions extends Options {
    comment?: Comment;
    onlyIfCached?: boolean;
    sortType?: string;
    repliesPerPage?: number;
    flat?: boolean;
    flatDepth?: number;
    accountComments?: FeedOptionsAccountComments;
    filter?: CommentsFilter;
    validateOptimistically?: boolean;
    streamPage?: boolean;
}
export interface UseRepliesResult extends Result {
    replies: Comment[];
    bufferedReplies: Comment[];
    updatedReplies: Comment[];
    hasMore: boolean;
    loadMore(): Promise<void>;
    reset(): Promise<void>;
}
export interface UseEditedCommentOptions extends Options {
    comment?: Comment;
}
export interface UseEditedCommentResult extends Result {
    editedComment: Comment | undefined;
    succeededEdits: {
        [succeededEditPropertyName: string]: any;
    };
    pendingEdits: {
        [pendingEditPropertyName: string]: any;
    };
    failedEdits: {
        [failedEditPropertyName: string]: any;
    };
}
export type CommunitySyncState = "initializing" | "loading" | "retrying" | "succeeded" | "failed" | "stopped";
export interface UseCommunityOptions extends Options {
    community?: CommunityIdentifier;
    onlyIfCached?: boolean;
}
export interface UseCommunityResult extends Result, Community {
    syncState: CommunitySyncState;
    hasCachedData: boolean;
    lastFetchAttemptAt: number | undefined;
    lastSuccessfulFetchAt: number | undefined;
}
export interface UseCommunitiesOptions extends Options {
    communities?: CommunityIdentifier[];
    onlyIfCached?: boolean;
}
export interface UseCommunitiesResult extends Result {
    communities: (Community | undefined)[];
}
export interface UseCommunityStatsOptions extends Options {
    community?: CommunityIdentifier;
    onlyIfCached?: boolean;
}
export interface UseCommunityStatsResult extends Result, CommunityStats {
}
export interface UseResolvedCommunityAddressOptions extends Options {
    communityAddress: string | undefined;
    cache?: boolean;
}
export interface UseResolvedCommunityAddressResult extends Result {
    resolvedAddress: string | undefined;
    chainProvider: ChainProvider | undefined;
}
export interface UseFeedOptions extends Options {
    communities?: CommunityIdentifier[];
    sortType?: string;
    postsPerPage?: number;
    newerThan?: number;
    accountComments?: FeedOptionsAccountComments;
    filter?: CommentsFilter;
    modQueue?: string[];
}
export interface UseFeedResult extends Result {
    feed: Comment[];
    hasMore: boolean;
    loadMore(): Promise<void>;
    expandTimeWindow(newerThan?: number): Promise<void>;
    communityKeysWithNewerPosts: string[];
    reset(): Promise<void>;
}
export interface UseBufferedFeedsOptions extends Options {
    feedsOptions?: UseFeedOptions[];
}
export interface UseBufferedFeedsResult extends Result {
    bufferedFeeds: Comment[][];
}
export interface UseAuthorOptions extends Options {
    authorAddress?: string;
    commentCid?: string;
}
export interface UseAuthorResult extends Result {
    author: Author | undefined;
}
export interface UseAuthorCommentsOptions extends Options {
    authorAddress?: string;
    commentCid?: string;
    filter?: CommentsFilter;
}
export interface UseAuthorCommentsResult extends Result {
    authorComments: (Comment | undefined)[];
    lastCommentCid: string | undefined;
    hasMore: boolean;
    loadMore(): Promise<void>;
}
export interface UseResolvedAuthorAddressOptions extends Options {
    author?: Author;
    cache?: boolean;
}
export interface UseResolvedAuthorAddressResult extends Result {
    resolvedAddress: string | undefined;
    chainProvider: ChainProvider | undefined;
    nameResolver: NameResolverInfo | undefined;
}
export interface UseAuthorAvatarOptions extends Options {
    author?: Author;
}
export interface UseAuthorAvatarResult extends Result {
    imageUrl: string | undefined;
    metadataUrl: string | undefined;
    chainProvider: ChainProvider | undefined;
}
export interface UseAuthorAddressOptions extends Options {
    comment?: Comment;
}
export interface UseAuthorAddressResult extends Result {
    authorAddress: string | undefined;
    shortAuthorAddress: string | undefined;
    authorAddressChanged: boolean;
}
export interface UsePublishCommentOptions extends Options {
    /** Called immediately with the provisional comment, then again if persistence shifts its index. */
    onPendingComment?(accountCommentIndex: number, comment: AccountComment): void;
    onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
    onChallengeVerification?(challengeVerification: ChallengeVerification, comment?: Comment): Promise<void>;
    [publishOption: string]: any;
}
export interface UsePublishCommentResult extends Result {
    index: number | undefined;
    challenge: Challenge | undefined;
    challengeVerification: ChallengeVerification | undefined;
    publishComment(): Promise<void>;
    abandonPublish(): Promise<void>;
    publishChallengeAnswers(challengeAnswers?: string[]): Promise<void>;
}
export interface UsePublishVoteOptions extends Options {
    onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
    onChallengeVerification?(challengeVerification: ChallengeVerification, comment?: Comment): Promise<void>;
    [publishOption: string]: any;
}
export interface UsePublishVoteResult extends Result {
    challenge: Challenge | undefined;
    challengeVerification: ChallengeVerification | undefined;
    publishVote(): Promise<void>;
    publishChallengeAnswers(challengeAnswers?: string[]): Promise<void>;
}
export interface UsePublishCommentEditOptions extends Options {
    onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
    onChallengeVerification?(challengeVerification: ChallengeVerification, comment?: Comment): Promise<void>;
    [publishOption: string]: any;
}
export interface UsePublishCommentEditResult extends Result {
    challenge: Challenge | undefined;
    challengeVerification: ChallengeVerification | undefined;
    publishCommentEdit(): Promise<void>;
    publishChallengeAnswers(challengeAnswers?: string[]): Promise<void>;
}
export interface UsePublishCommentModerationOptions extends Options {
    onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
    onChallengeVerification?(challengeVerification: ChallengeVerification, comment?: Comment): Promise<void>;
    [publishOption: string]: any;
}
export interface UsePublishCommentModerationResult extends Result {
    challenge: Challenge | undefined;
    challengeVerification: ChallengeVerification | undefined;
    publishCommentModeration(): Promise<void>;
    publishChallengeAnswers(challengeAnswers?: string[]): Promise<void>;
}
export interface UsePublishCommunityEditOptions extends Options {
    communityAddress?: string;
    onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
    onChallengeVerification?(challengeVerification: ChallengeVerification, comment?: Comment): Promise<void>;
    [publishOption: string]: any;
}
export interface UsePublishCommunityEditResult extends Result {
    challenge: Challenge | undefined;
    challengeVerification: ChallengeVerification | undefined;
    publishCommunityEdit(): Promise<void>;
    publishChallengeAnswers(challengeAnswers?: string[]): Promise<void>;
}
export interface UseCreateCommunityOptions extends Options {
    [createCommunityOption: string]: any;
}
export interface UseCreateCommunityResult extends Result {
    createdCommunity: Community | undefined;
    createCommunity(): Promise<void>;
}
export interface UseExportCommunityOptions extends Options {
    communityAddress?: string;
    communityAddresses?: string[];
    includePrivateKey?: boolean;
    exportPath?: string;
    signal?: AbortSignal;
}
export interface UseExportCommunityResult extends Result {
    communityExports: CommunityExport[];
    exportCommunity(): Promise<void>;
}
export interface UseSubscribeOptions extends Options {
    communityAddress?: string;
    multisubAddress?: string;
    authorAddress?: string;
}
export interface UseSubscribeResult extends Result {
    subscribed: boolean | undefined;
    subscribe(): Promise<void>;
    unsubscribe(): Promise<void>;
}
export interface UseBlockOptions extends Options {
    address?: string;
    cid?: string;
}
export interface UseBlockResult extends Result {
    blocked: boolean | undefined;
    block(): Promise<void>;
    unblock(): Promise<void>;
}
export interface UseClientsStatesOptions extends Options {
    comment?: Comment;
    community?: Community;
}
type ClientUrls = string[];
type Peer = string;
export interface UseClientsStatesResult extends Result {
    states: {
        [state: string]: ClientUrls;
    };
    peers: {
        [clientUrl: string]: Peer[];
    };
}
export interface UseCommunitiesStatesOptions extends Options {
    communities?: CommunityIdentifier[];
}
export interface UseCommunitiesStatesResult extends Result {
    states: {
        [state: string]: {
            communityAddresses: string[];
            clientUrls: string[];
        };
    };
    peers: {
        [clientUrl: string]: Peer[];
    };
}
export type PkcRpcChallengeOptionInput = {
    option: string;
    label: string;
    default?: string;
    description?: string;
    placeholder?: string;
    required?: boolean;
    [key: string]: unknown;
};
export type PkcRpcChallengeSettings = {
    optionInputs?: PkcRpcChallengeOptionInput[];
    type?: string;
    challenge?: string;
    caseInsensitive?: boolean;
    description?: string;
    [key: string]: unknown;
};
export type PkcRpcSettings = {
    pkcOptions?: Record<string, unknown>;
    challenges?: Record<string, PkcRpcChallengeSettings>;
    [key: string]: any;
};
export interface UsePkcRpcSettingsOptions extends Options {
}
export interface UsePkcRpcSettingsResult extends Result {
    pkcRpcSettings: PkcRpcSettings | undefined;
    setPkcRpcSettings(pkcRpcSettings: PkcRpcSettings): Promise<void>;
}
/**
 * TODO: define these types more in depth, most are already defined in:
 * https://github.com/pkcprotocol/pkc-js or
 * https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/schema.md
 */
export type Account = {
    [key: string]: any;
};
export type AccountsActions = {
    [key: string]: any;
};
export type PublishCommentOptions = {
    [key: string]: any;
};
export type PublishVoteOptions = {
    [key: string]: any;
};
export type PublishCommentEditOptions = {
    [key: string]: any;
};
export type PublishCommentModerationOptions = {
    [key: string]: any;
};
export type PublishCommunityEditOptions = {
    [key: string]: any;
};
export interface ExportCommunityOptions {
    includePrivateKey?: boolean;
    exportPath?: string;
    signal?: AbortSignal;
    [key: string]: unknown;
}
export type Challenge = {
    [key: string]: any;
};
export type ChallengeVerification = {
    [key: string]: any;
};
export type CreateCommentOptions = {
    [key: string]: any;
};
export type CreateCommunityOptions = {
    [key: string]: any;
};
export type CreateVoteOptions = {
    [key: string]: any;
};
export type Comment = {
    [key: string]: any;
};
export type Vote = {
    [key: string]: any;
};
export type CommentEdit = {
    [key: string]: any;
};
export type CommentModeration = {
    [key: string]: any;
};
export type CommunityEdit = {
    [key: string]: any;
};
export type Community = {
    [key: string]: any;
};
export type CommunityExport = {
    communityAddress: string;
    exportId: string;
    name?: string;
    publicKey?: string;
    includePrivateKey?: boolean;
    progress?: number;
    url?: string;
    [key: string]: unknown;
};
export type CommunityStats = {
    [key: string]: any;
};
export type Notification = {
    [key: string]: any;
};
export type Nft = {
    [key: string]: any;
};
export type Author = {
    [key: string]: any;
};
export type Wallet = {
    [key: string]: any;
};
/**
 * Communities and comments store
 */
export type Communities = {
    [communityAddress: string]: Community;
};
export type Comments = {
    [commentCid: string]: Comment;
};
/**
 * Accounts store
 */
export type Accounts = {
    [accountId: string]: Account;
};
export type AccountNamesToAccountIds = {
    [accountName: string]: string;
};
export interface AccountComment extends Comment {
    index: number;
    accountId: string;
}
export type AccountComments = AccountComment[];
export type AccountsComments = {
    [accountId: string]: AccountComments;
};
export type AccountCommentsIndex = {
    byCommunityAddress: {
        [communityAddress: string]: number[];
    };
    byParentCid: {
        [parentCid: string]: number[];
    };
};
export type AccountsCommentsIndexes = {
    [accountId: string]: AccountCommentsIndex;
};
export type CommentCidsToAccountsComments = {
    [commentCid: string]: {
        accountId: string;
        accountCommentIndex: number;
    };
};
export interface AccountCommentReply extends Comment {
    markedAsRead: boolean;
}
export type AccountCommentsReplies = {
    [replyCid: string]: AccountCommentReply;
};
export type AccountsCommentsReplies = {
    [accountId: string]: AccountCommentsReplies;
};
export type AccountsNotifications = {
    [accountId: string]: Notification[];
};
export type Role = {
    role: "owner" | "admin" | "moderator";
};
export type AccountCommunity = {
    role: Role;
};
export type AccountsVotes = {
    [accountId: string]: AccountVotes;
};
export type AccountVotes = {
    [commentCid: string]: AccountVote;
};
export type AccountVote = {
    [publishOption: string]: any;
};
export type AccountsEdits = {
    [accountId: string]: AccountEdits;
};
export type AccountEdits = {
    [commentCidOrCommunityAddress: string]: AccountEdit[];
};
export type AccountEditPropertySummary = {
    timestamp: number;
    value: any;
};
export type AccountEditsSummary = {
    [commentCidOrCommunityAddress: string]: {
        [propertyName: string]: AccountEditPropertySummary;
    };
};
export type AccountsEditsSummaries = {
    [accountId: string]: AccountEditsSummary;
};
export type AccountEdit = {
    [publishOption: string]: any;
};
export type AccountPublicationsFilter = (publication: AccountComment | AccountVote | AccountEdit) => Boolean;
/**
 * Feeds store
 */
export type Feed = Comment[];
export type Feeds = {
    [feedName: string]: Feed;
};
export type FeedOptions = {
    communities: CommunityIdentifier[];
    communityKeys: string[];
    sortType?: string;
    /** @deprecated Ignored. Feed sort names are no longer derived from time windows. */
    requestedSortType?: string;
    accountId: string;
    pageNumber: number;
    postsPerPage: number;
    filter: CommentsFilter;
    newerThan?: number;
    accountComments?: FeedOptionsAccountComments;
    modQueue?: string[];
};
export type FeedOptionsAccountComments = {
    newerThan?: number;
    append?: boolean;
};
export type FeedsOptions = {
    [feedName: string]: FeedOptions;
};
export type FeedCommunitiesPostCounts = {
    [communityAddress: string]: number;
};
export type FeedsCommunitiesPostCounts = {
    [feedName: string]: FeedCommunitiesPostCounts;
};
export type CommunityPage = {
    nextCid?: string;
    comments: Comment[];
};
export type CommunitiesPages = {
    [pageCid: string]: CommunityPage;
};
export type CommentsFilter = {
    filter(comment: Comment): Boolean;
    key: string;
};
/**
 * Replies store
 */
export type RepliesFeedOptions = {
    commentCid: string;
    commentDepth: number;
    postCid: string;
    sortType?: string;
    accountId: string;
    pageNumber: number;
    repliesPerPage: number;
    onlyIfCached?: boolean;
    flat?: boolean;
    accountComments?: FeedOptionsAccountComments;
    filter?: CommentsFilter;
    streamPage?: boolean;
};
export type RepliesFeedsOptions = {
    [feedName: string]: RepliesFeedOptions;
};
export type RepliesPage = CommunityPage;
export type RepliesPages = {
    [pageCid: string]: RepliesPage;
};
/**
 * Authors comments store
 */
export type AuthorsComments = {
    [authorCommentsName: string]: Comment[];
};
export type AuthorCommentsOptions = {
    authorAddress: string;
    pageNumber: number;
    filter?: CommentsFilter;
    accountId: string;
};
export type AuthorsCommentsOptions = {
    [authorCommentsName: string]: FeedOptions;
};
/**
 * Other
 */
export type ChainProvider = {
    chainId?: number;
    urls?: string[];
};
export type ChainProviders = {
    [chainTicker: string]: ChainProvider;
};
export {};
//# sourceMappingURL=types.d.ts.map