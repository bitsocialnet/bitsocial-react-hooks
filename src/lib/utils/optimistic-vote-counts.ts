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
  const recoveredPreviousTransitions: OptimisticVoteTransition[] =
    !hasPreviousTransitionHistory &&
    previousAccountVote &&
    typeof previousAccountVote.timestamp === "number"
      ? [
          {
            vote: normalizeVote(previousAccountVote.vote),
            timestamp: previousAccountVote.timestamp,
          },
        ]
      : [];
  const transitions = hasPreviousTransitionHistory
    ? previousTransitions
    : recoveredPreviousTransitions;
  const observedAt = hasPreviousTransitionHistory
    ? previousAccountVote[optimisticVoteObservedAtKey]
    : currentVersion || Math.max((accountVote.timestamp || 1) - 1, 0);
  const baseVote = hasPreviousTransitionHistory
    ? normalizeVote(previousAccountVote?.[optimisticVoteBaseKey])
    : recoveredPreviousTransitions.length > 0
      ? 0
      : normalizeVote(previousAccountVote?.vote);
  const lastTransition = transitions[transitions.length - 1];
  const transition: OptimisticVoteTransition = {
    vote: normalizeVote(accountVote.vote),
    // A displayed comment can only include this vote after both the vote was
    // published and every comment copy used to establish the initial baseline.
    timestamp: Math.max(
      accountVote.timestamp || 0,
      observedAt + 1,
      lastTransition ? lastTransition.timestamp + 1 : 0,
    ),
  };

  return {
    ...accountVote,
    [optimisticVoteBaseKey]: baseVote,
    [optimisticVoteObservedAtKey]: observedAt,
    [optimisticVoteTransitionsKey]: [...transitions, transition],
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
  // Each transition timestamp already includes the initial baseline, so every
  // displayed copy can reconcile directly against its own canonical version.
  for (const transition of accountVote[optimisticVoteTransitionsKey]) {
    if (typeof transition?.timestamp === "number" && transition.timestamp <= commentVersion) {
      baseVote = normalizeVote(transition.vote);
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
