import { AccountVote, Comment } from "../../types";

export const optimisticVoteBaseKey = "_optimisticVoteBase";
export const optimisticVoteObservedAtKey = "_optimisticVoteObservedAt";
export const optimisticVoteTransitionsKey = "_optimisticVoteTransitions";

const normalizeVote = (vote: unknown): -1 | 0 | 1 => (vote === 1 || vote === -1 ? vote : 0);

type OptimisticVoteTransition = {
  vote: -1 | 0 | 1;
  timestamp: number;
};

export const getCommentVoteCountsVersion = (comment: Comment | undefined): number =>
  Math.max(comment?.updatedAt ?? 0, comment?.timestamp ?? 0, 0);

export const addOptimisticVoteMetadata = (
  accountVote: AccountVote,
  previousAccountVote: AccountVote | undefined,
  comment: Comment | undefined,
): AccountVote => {
  const currentVersion = getCommentVoteCountsVersion(comment);
  // Keep the full local transition chain so cached comment copies at different
  // versions can each determine which account vote their counts already include.
  const previousTransitions: OptimisticVoteTransition[] = Array.isArray(
    previousAccountVote?.[optimisticVoteTransitionsKey],
  )
    ? previousAccountVote[optimisticVoteTransitionsKey]
    : [];
  const hasPreviousTransitionHistory =
    previousTransitions.length > 0 &&
    typeof previousAccountVote?.[optimisticVoteObservedAtKey] === "number";
  const observedAt = hasPreviousTransitionHistory
    ? previousAccountVote[optimisticVoteObservedAtKey]
    : currentVersion || accountVote.timestamp || 0;
  const baseVote = hasPreviousTransitionHistory
    ? normalizeVote(previousAccountVote?.[optimisticVoteBaseKey])
    : normalizeVote(previousAccountVote?.vote);
  const transition: OptimisticVoteTransition = {
    vote: normalizeVote(accountVote.vote),
    timestamp: accountVote.timestamp || observedAt,
  };

  return {
    ...accountVote,
    [optimisticVoteBaseKey]: baseVote,
    [optimisticVoteObservedAtKey]: observedAt,
    [optimisticVoteTransitionsKey]: [...previousTransitions, transition],
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
    !Array.isArray(accountVote[optimisticVoteTransitionsKey]) ||
    typeof comment.upvoteCount !== "number" ||
    typeof comment.downvoteCount !== "number"
  ) {
    return comment;
  }

  const commentVersion = getCommentVoteCountsVersion(comment);
  let baseVote = normalizeVote(accountVote[optimisticVoteBaseKey]);
  if (commentVersion > accountVote[optimisticVoteObservedAtKey]) {
    // A transition can only be reflected by a canonical comment version at or
    // after that vote publication's timestamp.
    for (const transition of accountVote[optimisticVoteTransitionsKey]) {
      if (typeof transition?.timestamp === "number" && transition.timestamp <= commentVersion) {
        baseVote = normalizeVote(transition.vote);
      }
    }
  }
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
