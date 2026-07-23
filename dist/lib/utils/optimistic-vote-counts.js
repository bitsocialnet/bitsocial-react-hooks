export const optimisticVoteBaseKey = "_optimisticVoteBase";
export const optimisticVoteObservedAtKey = "_optimisticVoteObservedAt";
export const optimisticVoteTransitionsKey = "_optimisticVoteTransitions";
const normalizeVote = (vote) => (vote === 1 || vote === -1 ? vote : 0);
export const getCommentVoteCountsVersion = (comment) => { var _a, _b; return Math.max((_a = comment === null || comment === void 0 ? void 0 : comment.updatedAt) !== null && _a !== void 0 ? _a : 0, (_b = comment === null || comment === void 0 ? void 0 : comment.timestamp) !== null && _b !== void 0 ? _b : 0, 0); };
export const addOptimisticVoteMetadata = (accountVote, previousAccountVote, comment) => {
    const currentVersion = getCommentVoteCountsVersion(comment);
    // Keep the full local transition chain so cached comment copies at different
    // versions can each determine which account vote their counts already include.
    const previousTransitions = Array.isArray(previousAccountVote === null || previousAccountVote === void 0 ? void 0 : previousAccountVote[optimisticVoteTransitionsKey])
        ? previousAccountVote[optimisticVoteTransitionsKey]
        : [];
    const hasPreviousTransitionHistory = previousTransitions.length > 0 &&
        typeof (previousAccountVote === null || previousAccountVote === void 0 ? void 0 : previousAccountVote[optimisticVoteObservedAtKey]) === "number";
    const recoveredPreviousTransitions = !hasPreviousTransitionHistory &&
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
        ? normalizeVote(previousAccountVote === null || previousAccountVote === void 0 ? void 0 : previousAccountVote[optimisticVoteBaseKey])
        : recoveredPreviousTransitions.length > 0
            ? 0
            : normalizeVote(previousAccountVote === null || previousAccountVote === void 0 ? void 0 : previousAccountVote.vote);
    const lastTransition = transitions[transitions.length - 1];
    const transition = {
        vote: normalizeVote(accountVote.vote),
        // A displayed comment can only include this vote after both the vote was
        // published and every comment copy used to establish the initial baseline.
        timestamp: Math.max(accountVote.timestamp || 0, observedAt + 1, lastTransition ? lastTransition.timestamp + 1 : 0),
    };
    return Object.assign(Object.assign({}, accountVote), { [optimisticVoteBaseKey]: baseVote, [optimisticVoteObservedAtKey]: observedAt, [optimisticVoteTransitionsKey]: [...transitions, transition] });
};
export const addOptimisticVoteCounts = (comment, accountVote) => {
    if (!comment ||
        !accountVote ||
        typeof accountVote[optimisticVoteObservedAtKey] !== "number" ||
        !Array.isArray(accountVote[optimisticVoteTransitionsKey]) ||
        typeof comment.upvoteCount !== "number" ||
        typeof comment.downvoteCount !== "number") {
        return comment;
    }
    const commentVersion = getCommentVoteCountsVersion(comment);
    let baseVote = normalizeVote(accountVote[optimisticVoteBaseKey]);
    // Each transition timestamp already includes the initial baseline, so every
    // displayed copy can reconcile directly against its own canonical version.
    for (const transition of accountVote[optimisticVoteTransitionsKey]) {
        if (typeof (transition === null || transition === void 0 ? void 0 : transition.timestamp) === "number" && transition.timestamp <= commentVersion) {
            baseVote = normalizeVote(transition.vote);
        }
    }
    const vote = normalizeVote(accountVote.vote);
    if (baseVote === vote) {
        return comment;
    }
    return Object.assign(Object.assign({}, comment), { upvoteCount: Math.max(0, comment.upvoteCount + Number(vote === 1) - Number(baseVote === 1)), downvoteCount: Math.max(0, comment.downvoteCount + Number(vote === -1) - Number(baseVote === -1)) });
};
export const addOptimisticVoteCountsToComments = (comments, accountVotes) => (comments || []).map((comment) => addOptimisticVoteCounts(comment, (comment === null || comment === void 0 ? void 0 : comment.cid) ? accountVotes === null || accountVotes === void 0 ? void 0 : accountVotes[comment.cid] : undefined));
//# sourceMappingURL=optimistic-vote-counts.js.map