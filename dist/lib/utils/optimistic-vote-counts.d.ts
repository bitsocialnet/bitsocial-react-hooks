import { AccountVote, Comment } from "../../types.js";
export declare const optimisticVoteBaseKey = "_optimisticVoteBase";
export declare const optimisticVoteObservedAtKey = "_optimisticVoteObservedAt";
export declare const optimisticVoteTransitionsKey = "_optimisticVoteTransitions";
export declare const getCommentVoteCountsVersion: (comment: Comment | undefined) => number;
export declare const addOptimisticVoteMetadata: (accountVote: AccountVote, previousAccountVote: AccountVote | undefined, comment: Comment | undefined) => AccountVote;
export declare const addOptimisticVoteCounts: (comment: Comment | undefined, accountVote: AccountVote | undefined) => Comment | undefined;
export declare const addOptimisticVoteCountsToComments: <T extends Comment | undefined>(comments: T[] | undefined, accountVotes: {
    [commentCid: string]: AccountVote;
} | undefined) => T[];
//# sourceMappingURL=optimistic-vote-counts.d.ts.map