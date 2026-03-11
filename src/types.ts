// Note: the commented out types are TODO functionalities to implement

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

// useAccount(options): result
export interface UseAccountOptions extends Options {}
export interface UseAccountResult extends Result, Account {}

// useAccounts(options): result
export interface UseAccountsOptions extends Options {}
export interface UseAccountsResult extends Result {
  accounts: Account[];
}

// useAccountComments(options): result
export interface UseAccountCommentsOptions extends Options {
  filter?: AccountPublicationsFilter;
}
export interface UseAccountCommentsResult extends Result {
  accountComments: AccountComment[];
}

// useAccountComment(options): result
export interface UseAccountCommentOptions extends Options {
  commentIndex?: number;
}
export interface UseAccountCommentResult extends Result, AccountComment {}

// useAccountVotes(options): result
export interface UseAccountVotesOptions extends Options {
  filter?: AccountPublicationsFilter;
}
export interface UseAccountVotesResult extends Result {
  accountVotes: AccountVote[];
}

// useAccountVote(options): result
export interface UseAccountVoteOptions extends Options {
  commentCid?: string;
}
export interface UseAccountVoteResult extends Result, AccountVote {
  commentCid: string | undefined;
  vote: number | undefined;
}

// useAccountEdits(options): result
export interface UseAccountEditsOptions extends Options {
  filter?: AccountPublicationsFilter;
}
export interface UseAccountEditsResult extends Result {
  accountEdits: AccountEdit[];
}

// useNotifications(options): result
export interface UseNotificationsOptions extends Options {}
export interface UseNotificationsResult extends Result {
  notifications: Notification[];
  markAsRead(): Promise<void>;
}

// useAccountCommunities(options): result
export interface UseAccountCommunitiesOptions extends Options {
  onlyIfCached?: boolean;
}
export interface UseAccountCommunitiesResult extends Result {
  accountCommunities: { [communityAddress: string]: AccountCommunity & Partial<Community> };
}

// usePubsubSubscribe(options): result
export interface UsePubsubSubscribeOptions extends Options {
  communityAddress?: string;
}
export interface UsePubsubSubscribeResult extends Result {}

// useComment(options): result
export interface UseCommentOptions extends Options {
  commentCid?: string;
  onlyIfCached?: boolean;
}
export interface UseCommentResult extends Result, Comment {}

// useComments(options): result
export interface UseCommentsOptions extends Options {
  commentCids?: string[];
  onlyIfCached?: boolean;
}
export interface UseCommentsResult extends Result {
  // TODO: remove | undefined, that shouldn't happen when comments have comment.state
  comments: (Comment | undefined)[];
}

// useValidateComment(options): result
export interface UseValidateCommentOptions extends Options {
  comment?: Comment;
  validateReplies?: boolean;
}
export interface UseValidateCommentResult extends Result {
  valid: boolean;
}

// useCommentThumbnailUrl(options): result
// export interface UseCommentThumbnailUrlOptions extends Options {
//   comment?: Comment
// }
// export interface UseCommentThumbnailUrlResult extends Result {
//   thumnbailUrl: string | undefined
// }

// useReplies(options): result
export interface UseRepliesOptions extends Options {
  comment?: Comment;
  sortType?: string;
  repliesPerPage?: number;
  flat?: boolean;
  flatDepth?: number;
  accountComments?: FeedOptionsAccountComments;
  filter?: CommentsFilter;
  validateOptimistically?: boolean; // assume replies are valid to first render immediately, then validate, then remove invalid replies, generally safe because validation takes less than 100ms
  streamPage?: boolean; // by default, replies with depth > 1 won't continuously fill the page until repliesPerPage is reached, to not displace the UI
}
export interface UseRepliesResult extends Result {
  replies: Comment[];
  hasMore: boolean;
  loadMore(): Promise<void>;
}

// useEditedComment(options): result
export interface UseEditedCommentOptions extends Options {
  comment?: Comment;
}
export interface UseEditedCommentResult extends Result {
  // editedComment only contains the succeeded and pending props, failed props aren't added
  editedComment: Comment | undefined;
  succeededEdits: { [succeededEditPropertyName: string]: any };
  pendingEdits: { [pendingEditPropertyName: string]: any };
  failedEdits: { [failedEditPropertyName: string]: any };
  // state: 'initializing' | 'unedited' | 'succeeded' | 'pending' | 'failed'
}

// useCommunity(options): result
export interface UseCommunityOptions extends Options {
  communityAddress?: string;
  onlyIfCached?: boolean;
}
export interface UseCommunityResult extends Result, Community {}

// useCommunities(options): result
export interface UseCommunitiesOptions extends Options {
  communityAddresses?: string[];
  onlyIfCached?: boolean;
}
export interface UseCommunitiesResult extends Result {
  communities: (Community | undefined)[];
}

// useCommunityStats(options): result
export interface UseCommunityStatsOptions extends Options {
  communityAddress?: string;
  onlyIfCached?: boolean;
}
export interface UseCommunityStatsResult extends Result, CommunityStats {}

// useResolvedCommunityAddress(options): result
export interface UseResolvedCommunityAddressOptions extends Options {
  communityAddress: string | undefined;
  cache?: boolean;
}
export interface UseResolvedCommunityAddressResult extends Result {
  resolvedAddress: string | undefined;
  chainProvider: ChainProvider | undefined;
}

// useFeed(options): result
export interface UseFeedOptions extends Options {
  communityAddresses: string[];
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
  communityAddressesWithNewerPosts: string[];
  reset(): Promise<void>;
}

// useBufferedFeeds(options): result
export interface UseBufferedFeedsOptions extends Options {
  feedsOptions?: UseFeedOptions[];
}
export interface UseBufferedFeedsResult extends Result {
  bufferedFeeds: Comment[][];
}

// useAuthor(options): result
export interface UseAuthorOptions extends Options {
  authorAddress?: string;
  // the last known comment cid of this author (required, can't fetch author from author address alone)
  commentCid?: string;
}
export interface UseAuthorResult extends Result {
  author: Author | undefined;
}

// useAuthorComments(options): result
export interface UseAuthorCommentsOptions extends Options {
  authorAddress?: string;
  // the last known comment cid of this author (required, can't fetch author comment from author address alone)
  commentCid?: string;
  // TODO: add filter
  filter?: CommentsFilter;
}
export interface UseAuthorCommentsResult extends Result {
  // TODO: remove | undefined, that shouldn't happen when comments have comment.state
  authorComments: (Comment | undefined)[];
  lastCommentCid: string | undefined;
  hasMore: boolean;
  loadMore(): Promise<void>;
}

// useResolvedAuthorAddress(options): result
export interface UseResolvedAuthorAddressOptions extends Options {
  author?: Author;
  cache?: boolean;
}
export interface UseResolvedAuthorAddressResult extends Result {
  resolvedAddress: string | undefined;
  chainProvider: ChainProvider | undefined;
}

// useAuthorAvatar(options): result
export interface UseAuthorAvatarOptions extends Options {
  author?: Author;
}
export interface UseAuthorAvatarResult extends Result {
  imageUrl: string | undefined;
  metadataUrl: string | undefined;
  chainProvider: ChainProvider | undefined;
}

// useAuthorAddress(options): result
export interface UseAuthorAddressOptions extends Options {
  comment?: Comment;
}
export interface UseAuthorAddressResult extends Result {
  authorAddress: string | undefined;
  shortAuthorAddress: string | undefined;
  authorAddressChanged: boolean;
}

// useCreateAccount(options): result
// export interface UseCreateAccountOptions extends Options {}
// export interface UseCreateAccountResult extends Result {
//   createdAccount: Account | undefined
//   createAccount(): Promise<void>
// }

// useDeleteAccount(options): result
// export interface UseDeleteAccountOptions extends Options {}
// export interface UseDeleteAccountResult extends Result {
//   deletedAccount: Account | undefined
//   deleteAccount(): Promise<void>
// }

// useSetAccount(options): result
// export interface UseSetAccountOptions extends Options {
//   account?: Account
// }
// export interface UseSetAccountResult extends Result {
//   account: Account | undefined
//   setAccount(): Promise<void>
// }

// useSetActiveAccount(options): result
// export interface UseSetActiveAccountOptions extends Options {
//   activeAccount?: string
// }
// export interface UseSetActiveAccountResult extends Result {
//   activeAccount: string | undefined
//   setActiveAccount(): Promise<void>
// }

// useSetAccountsOrder(options): result
// export interface UseSetAccountsOrderOptions extends Options {
//   accountsOrder?: string[]
// }
// export interface UseSetAccountsOrderResult extends Result {
//   accountsOrder: string[]
//   setAccountsOrder(): Promise<void>
// }

// useImportAccount(options): result
// export interface UseImportAccountOptions extends Options {
//   account?: string
// }
// export interface UseImportAccountResult extends Result {
//   importedAccount: Account | undefined
//   importAccount(): Promise<void>
// }

// useExportAccount(options): result
// export interface UseExportAccountOptions extends Options {}
// export interface UseExportAccountResult extends Result {
//   exportedAccount: string | undefined
//   exportAccount(): Promise<void>
// }

// usePublishComment(options): result
export interface UsePublishCommentOptions extends Options {
  onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
  onChallengeVerification?(
    challengeVerification: ChallengeVerification,
    comment?: Comment,
  ): Promise<void>;
  [publishOption: string]: any;
}
export interface UsePublishCommentResult extends Result {
  index: number | undefined;
  challenge: Challenge | undefined;
  challengeVerification: ChallengeVerification | undefined;
  publishComment(): Promise<void>;
  abandonPublish(): Promise<void>;
  publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
}

// usePublishVote(options): result
export interface UsePublishVoteOptions extends Options {
  onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
  onChallengeVerification?(
    challengeVerification: ChallengeVerification,
    comment?: Comment,
  ): Promise<void>;
  [publishOption: string]: any;
}
export interface UsePublishVoteResult extends Result {
  challenge: Challenge | undefined;
  challengeVerification: ChallengeVerification | undefined;
  publishVote(): Promise<void>;
  publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
}

// usePublishCommentEdit(options): result
export interface UsePublishCommentEditOptions extends Options {
  onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
  onChallengeVerification?(
    challengeVerification: ChallengeVerification,
    comment?: Comment,
  ): Promise<void>;
  [publishOption: string]: any;
}
export interface UsePublishCommentEditResult extends Result {
  challenge: Challenge | undefined;
  challengeVerification: ChallengeVerification | undefined;
  publishCommentEdit(): Promise<void>;
  publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
}

// usePublishCommentModeration(options): result
export interface UsePublishCommentModerationOptions extends Options {
  onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
  onChallengeVerification?(
    challengeVerification: ChallengeVerification,
    comment?: Comment,
  ): Promise<void>;
  [publishOption: string]: any;
}
export interface UsePublishCommentModerationResult extends Result {
  challenge: Challenge | undefined;
  challengeVerification: ChallengeVerification | undefined;
  publishCommentModeration(): Promise<void>;
  publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
}

// usePublishCommunityEdit(options): result
export interface UsePublishCommunityEditOptions extends Options {
  communityAddress?: string;
  onChallenge?(challenge: Challenge, comment?: Comment): Promise<void>;
  onChallengeVerification?(
    challengeVerification: ChallengeVerification,
    comment?: Comment,
  ): Promise<void>;
  [publishOption: string]: any;
}
export interface UsePublishCommunityEditResult extends Result {
  challenge: Challenge | undefined;
  challengeVerification: ChallengeVerification | undefined;
  publishCommunityEdit(): Promise<void>;
  publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
}

// useCreateCommunity(options): result
export interface UseCreateCommunityOptions extends Options {
  [createCommunityOption: string]: any;
}
export interface UseCreateCommunityResult extends Result {
  createdCommunity: Community | undefined;
  createCommunity(): Promise<void>;
}

// useDeleteCommunity(options): result
// export interface UseDeleteCommunityOptions extends Options {
//   communityAddress?: string
// }
// export interface UseDeleteCommunityResult extends Result {
//   deletedCommunity: Community | undefined
//   deleteCommunity(): Promise<void>
// }

// useSubscribe(options): result
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

// useBlock(options): result
export interface UseBlockOptions extends Options {
  address?: string;
  cid?: string;
}
export interface UseBlockResult extends Result {
  blocked: boolean | undefined;
  block(): Promise<void>;
  unblock(): Promise<void>;
}

// useNotify(options): result
// export interface UseNotifyOptions extends Options {
//   communityAddress?: string
//   multisubAddress?: string
//   authorAddress?: string
//   commentCid?: string
// }
// export interface UseNotifyCommunityResult extends Result {
//   notifying: boolean | undefined
//   notify(): Promise<void>
//   unnotify(): Promise<void>
// }

// useLimit(options): result
// export interface UseLimitOptions extends Options {
//   address?: string
// }
// export interface UseLimitResult extends Result {
//   limited: number | undefined
//   limit(): Promise<void>
//   unlimit(): Promise<void>
// }

// useSave(options): result
// export interface UseSaveOptions extends Options {
//   commentCid?: string
// }
// export interface UseSaveResult extends Result {
//   saved: boolean | undefined
//   save(): Promise<void>
//   unsave(): Promise<void>
// }

// useDeleteComment(options): result
// export interface UseDeleteCommentOptions extends Options {
//   commentCid?: string
//   accountCommentIndex?: number
// }
// export interface UseDeleteCommentResult extends Result {
//   deletedComment: Comment | undefined
//   deleteComment(): Promise<void>
//   undeleteComment(): Promise<void>
// }

export interface UseClientsStatesOptions extends Options {
  comment?: Comment;
  community?: Community;
}
type ClientUrls = string[];
type Peer = string;
export interface UseClientsStatesResult extends Result {
  states: { [state: string]: ClientUrls };
  peers: { [clientUrl: string]: Peer[] };
}

export interface UseCommunitiesStatesOptions extends Options {
  communityAddresses?: string[];
}
export interface UseCommunitiesStatesResult extends Result {
  states: { [state: string]: { communityAddresses: string[]; clientUrls: string[] } };
  peers: { [clientUrl: string]: Peer[] };
}

export type PlebbitRpcSettings = { [key: string]: any };
export interface UsePlebbitRpcSettingsOptions extends Options {}
export interface UsePlebbitRpcSettingsResult extends Result {
  plebbitRpcSettings: PlebbitRpcSettings | undefined;
  setPlebbitRpcSettings(plebbitRpcSettings: PlebbitRpcSettings): Promise<void>;
}

/**
 * TODO: define these types more in depth, most are already defined in:
 * https://github.com/plebbit/plebbit-js or
 * https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/schema.md
 */
export type Account = { [key: string]: any };
export type AccountsActions = { [key: string]: any };
export type PublishCommentOptions = { [key: string]: any };
export type PublishVoteOptions = { [key: string]: any };
export type PublishCommentEditOptions = { [key: string]: any };
export type PublishCommentModerationOptions = { [key: string]: any };
export type PublishCommunityEditOptions = { [key: string]: any };
export type Challenge = { [key: string]: any };
export type ChallengeVerification = { [key: string]: any };
export type CreateCommentOptions = { [key: string]: any };
export type CreateCommunityOptions = { [key: string]: any };
export type CreateVoteOptions = { [key: string]: any };
export type Comment = { [key: string]: any };
export type Vote = { [key: string]: any };
export type CommentEdit = { [key: string]: any };
export type CommentModeration = { [key: string]: any };
export type CommunityEdit = { [key: string]: any };
export type Community = { [key: string]: any };
export type CommunityStats = { [key: string]: any };
export type Notification = { [key: string]: any };
export type Nft = { [key: string]: any };
export type Author = { [key: string]: any };
export type Wallet = { [key: string]: any };

/**
 * Communities and comments store
 */
export type Communities = { [communityAddress: string]: Community };
export type Comments = { [commentCid: string]: Comment };

/**
 * Accounts store
 */
export type Accounts = { [accountId: string]: Account };
export type AccountNamesToAccountIds = { [accountName: string]: string };
export interface AccountComment extends Comment {
  index: number;
  accountId: string;
}
export type AccountComments = AccountComment[];
export type AccountsComments = { [accountId: string]: AccountComments };
export type CommentCidsToAccountsComments = {
  [commentCid: string]: { accountId: string; accountCommentIndex: number };
};
export interface AccountCommentReply extends Comment {
  markedAsRead: boolean;
}
export type AccountCommentsReplies = { [replyCid: string]: AccountCommentReply };
export type AccountsCommentsReplies = { [accountId: string]: AccountCommentsReplies };
export type AccountsNotifications = { [accountId: string]: Notification[] };
export type Role = {
  role: "owner" | "admin" | "moderator";
};
export type AccountCommunity = {
  role: Role;
};
export type AccountsVotes = { [accountId: string]: AccountVotes };
export type AccountVotes = { [commentCid: string]: AccountVote };
export type AccountVote = {
  // has all the publish options like commentCid, vote, timestamp, etc
  [publishOption: string]: any;
};
export type AccountsEdits = { [accountId: string]: AccountEdits };
export type AccountEdits = { [commentCidOrCommunityAddress: string]: AccountEdit[] };
export type AccountEdit = {
  // has all the publish options like commentCid, vote, timestamp, etc (both comment edits and community edits)
  [publishOption: string]: any;
};
export type AccountPublicationsFilter = (
  publication: AccountComment | AccountVote | AccountEdit,
) => Boolean;

/**
 * Feeds store
 */
export type Feed = Comment[];
export type Feeds = { [feedName: string]: Feed };
export type FeedOptions = {
  communityAddresses: string[];
  sortType: string;
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
  append?: boolean; // default to prepend, set append: true to append instead
};
export type FeedsOptions = { [feedName: string]: FeedOptions };
export type FeedCommunitiesPostCounts = { [communityAddress: string]: number };
export type FeedsCommunitiesPostCounts = { [feedName: string]: FeedCommunitiesPostCounts };
export type CommunityPage = {
  nextCid?: string;
  comments: Comment[];
};
export type CommunitiesPages = { [pageCid: string]: CommunityPage };
export type CommentsFilter = {
  filter(comment: Comment): Boolean;
  key: string;
};

/**
 * Replies store
 */
// NOTE: to have different replies options for different depth, eg smaller repliesPerPage for depth > 1,
// we will need another prop, eg `{depth: '>1': {repliesPerPage: 3}}`, because of how react renders work
export type RepliesFeedOptions = {
  commentCid: string;
  commentDepth: number;
  postCid: string;
  sortType: string;
  accountId: string;
  pageNumber: number;
  repliesPerPage: number;
  flat?: boolean;
  accountComments?: FeedOptionsAccountComments;
  filter?: CommentsFilter;
  streamPage?: boolean; // by default, replies with depth > 1 won't continuously fill the page until repliesPerPage is reached, to not displace the UI
};
export type RepliesFeedsOptions = { [feedName: string]: RepliesFeedOptions };
export type RepliesPage = CommunityPage;
export type RepliesPages = { [pageCid: string]: RepliesPage };

/**
 * Authors comments store
 */
// authorCommentsName is a string used a key to represent authorAddress + filter + accountId
export type AuthorsComments = { [authorCommentsName: string]: Comment[] };
export type AuthorCommentsOptions = {
  authorAddress: string;
  pageNumber: number;
  filter?: CommentsFilter;
  accountId: string;
};
export type AuthorsCommentsOptions = { [authorCommentsName: string]: FeedOptions };

/**
 * Other
 */
export type ChainProvider = {
  chainId?: number;
  urls?: string[];
};
export type ChainProviders = { [chainTicker: string]: ChainProvider };
