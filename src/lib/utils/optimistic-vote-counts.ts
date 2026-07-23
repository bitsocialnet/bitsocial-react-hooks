import { AccountVote, Comment } from "../../types";

export const optimisticVoteBaseKey = "_optimisticVoteBase";
export const optimisticVoteObservedAtKey = "_optimisticVoteObservedAt";

const normalizeVote = (vote: unknown): -1 | 0 | 1 => (vote === 1 || vote === -1 ? vote : 0);

export const getCommentVoteCountsVersion = (comment: Comment | undefined): number =>
  Math.max(comment?.updatedAt ?? 0, comment?.timestamp ?? 0, 0);

export const addOptimisticVoteMetadata = (
  accountVote: AccountVote,
  previousAccountVote: AccountVote | undefined,
  comment: Comment | undefined,
): AccountVote => {
  const currentVersion = getCommentVoteCountsVersion(comment);
  const previousVoteIsPending =
    previousAccountVote?.[optimisticVoteObservedAtKey] !== undefined &&
    currentVersion <= previousAccountVote[optimisticVoteObservedAtKey];
  const baseVote = previousVoteIsPending
    ? normalizeVote(previousAccountVote?.[optimisticVoteBaseKey])
    : normalizeVote(previousAccountVote?.vote);

  return {
    ...accountVote,
    [optimisticVoteBaseKey]: baseVote,
    [optimisticVoteObservedAtKey]: currentVersion || accountVote.timestamp || 0,
  };
};

export const addOptimisticVoteCounts = (
  comment: Comment | undefined,
  accountVote: AccountVote | undefined,
): Comment | undefined => {
  if (
    !comment ||
    !accountVote ||
    typeof accountVote[optimisticVoteObservedAtKey] !== "number" ||
    typeof comment.upvoteCount !== "number" ||
    typeof comment.downvoteCount !== "number" ||
    getCommentVoteCountsVersion(comment) > accountVote[optimisticVoteObservedAtKey]
  ) {
    return comment;
  }

  const baseVote = normalizeVote(accountVote[optimisticVoteBaseKey]);
  const vote = normalizeVote(accountVote.vote);
  if (baseVote === vote) {
    return comment;
  }

  return {
    ...comment,
    upvoteCount: Math.max(0, comment.upvoteCount + Number(vote === 1) - Number(baseVote === 1)),
    downvoteCount: Math.max(
      0,
      comment.downvoteCount + Number(vote === -1) - Number(baseVote === -1),
    ),
  };
};

export const addOptimisticVoteCountsToComments = <T extends Comment | undefined>(
  comments: T[] | undefined,
  accountVotes: { [commentCid: string]: AccountVote } | undefined,
): T[] =>
  (comments || []).map((comment) =>
    addOptimisticVoteCounts(comment, comment?.cid ? accountVotes?.[comment.cid] : undefined),
  ) as T[];
