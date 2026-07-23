import {
  addOptimisticVoteCounts,
  addOptimisticVoteCountsToComments,
  addOptimisticVoteMetadata,
  getCommentVoteCountsVersion,
  optimisticVoteBaseKey,
  optimisticVoteObservedAtKey,
  optimisticVoteTransitionsKey,
} from "./optimistic-vote-counts";

describe("optimistic vote counts", () => {
  const comment = {
    cid: "comment cid",
    timestamp: 90,
    updatedAt: 100,
    upvoteCount: 3,
    downvoteCount: 2,
  };

  test("uses the freshest comment version", () => {
    expect(getCommentVoteCountsVersion(undefined)).toBe(0);
    expect(getCommentVoteCountsVersion({ timestamp: 90, updatedAt: 100 } as any)).toBe(100);
  });

  test("adds metadata for a new optimistic vote", () => {
    expect(
      addOptimisticVoteMetadata({ commentCid: comment.cid, vote: 1, timestamp: 101 }, undefined, {
        ...comment,
      }),
    ).toMatchObject({
      [optimisticVoteBaseKey]: 0,
      [optimisticVoteObservedAtKey]: 100,
      [optimisticVoteTransitionsKey]: [{ vote: 1, timestamp: 101 }],
    });
  });

  test("uses the previous canonical vote as the base", () => {
    const result = addOptimisticVoteMetadata(
      { commentCid: comment.cid, vote: -1, timestamp: 101 },
      { commentCid: comment.cid, vote: 1, timestamp: 50 },
      comment,
    );
    expect(result[optimisticVoteBaseKey]).toBe(1);
  });

  test("carries the original baseline and transition history through rapid vote changes", () => {
    const firstVote = addOptimisticVoteMetadata(
      { commentCid: comment.cid, vote: 1, timestamp: 101 },
      undefined,
      comment,
    );
    const result = addOptimisticVoteMetadata(
      { commentCid: comment.cid, vote: -1, timestamp: 102 },
      firstVote,
      comment,
    );
    expect(result[optimisticVoteBaseKey]).toBe(0);
    expect(result[optimisticVoteObservedAtKey]).toBe(100);
    expect(result[optimisticVoteTransitionsKey]).toEqual([
      { vote: 1, timestamp: 101 },
      { vote: -1, timestamp: 102 },
    ]);
  });

  test("retains history when a fresher copy has advanced", () => {
    const result = addOptimisticVoteMetadata(
      { commentCid: comment.cid, vote: -1, timestamp: 103 },
      {
        commentCid: comment.cid,
        vote: 1,
        timestamp: 101,
        [optimisticVoteBaseKey]: 0,
        [optimisticVoteObservedAtKey]: 100,
        [optimisticVoteTransitionsKey]: [{ vote: 1, timestamp: 101 }],
      },
      { ...comment, updatedAt: 102 },
    );
    expect(result[optimisticVoteBaseKey]).toBe(0);
    expect(result[optimisticVoteObservedAtKey]).toBe(100);
    expect(result[optimisticVoteTransitionsKey]).toEqual([
      { vote: 1, timestamp: 101 },
      { vote: -1, timestamp: 103 },
    ]);
  });

  test("falls back to the vote timestamp when the comment is not loaded", () => {
    const result = addOptimisticVoteMetadata(
      { commentCid: comment.cid, vote: 1, timestamp: 101 },
      undefined,
      undefined,
    );
    expect(result[optimisticVoteObservedAtKey]).toBe(101);
  });

  test.each([
    { name: "upvote", base: 0, vote: 1, upvotes: 4, downvotes: 2 },
    { name: "remove upvote", base: 1, vote: 0, upvotes: 2, downvotes: 2 },
    { name: "upvote after downvote", base: -1, vote: 1, upvotes: 4, downvotes: 1 },
    { name: "downvote after upvote", base: 1, vote: -1, upvotes: 2, downvotes: 3 },
  ])("applies an optimistic $name transition", ({ base, vote, upvotes, downvotes }) => {
    const result = addOptimisticVoteCounts(comment, {
      commentCid: comment.cid,
      vote,
      [optimisticVoteBaseKey]: base,
      [optimisticVoteObservedAtKey]: 100,
      [optimisticVoteTransitionsKey]: [{ vote, timestamp: 101 }],
    });
    expect(result?.upvoteCount).toBe(upvotes);
    expect(result?.downvoteCount).toBe(downvotes);
  });

  test("does not adjust an old account vote without optimistic metadata", () => {
    expect(addOptimisticVoteCounts(comment, { commentCid: comment.cid, vote: 1 })).toBe(comment);
  });

  test("stops adjusting after a canonical comment includes the latest vote", () => {
    const updatedComment = { ...comment, updatedAt: 101 };
    expect(
      addOptimisticVoteCounts(updatedComment, {
        commentCid: comment.cid,
        vote: 1,
        [optimisticVoteBaseKey]: 0,
        [optimisticVoteObservedAtKey]: 100,
        [optimisticVoteTransitionsKey]: [{ vote: 1, timestamp: 101 }],
      }),
    ).toBe(updatedComment);
  });

  test("reconciles each displayed version against rapid vote transitions", () => {
    const accountVote = {
      vote: -1,
      [optimisticVoteBaseKey]: 0,
      [optimisticVoteObservedAtKey]: 100,
      [optimisticVoteTransitionsKey]: [
        { vote: 1, timestamp: 101 },
        { vote: -1, timestamp: 102 },
      ],
    };

    const staleResult = addOptimisticVoteCounts(comment, accountVote);
    expect(staleResult).toMatchObject({ upvoteCount: 3, downvoteCount: 3 });

    const firstVoteCanonicalResult = addOptimisticVoteCounts(
      { ...comment, updatedAt: 101, upvoteCount: 4 },
      accountVote,
    );
    expect(firstVoteCanonicalResult).toMatchObject({ upvoteCount: 3, downvoteCount: 3 });

    const latestVoteCanonical = { ...comment, updatedAt: 102, downvoteCount: 3 };
    expect(addOptimisticVoteCounts(latestVoteCanonical, accountVote)).toBe(latestVoteCanonical);
  });

  test("keeps adjusting an older displayed copy when another store supplied the baseline", () => {
    const accountVote = {
      vote: 1,
      [optimisticVoteBaseKey]: 0,
      [optimisticVoteObservedAtKey]: 200,
      [optimisticVoteTransitionsKey]: [{ vote: 1, timestamp: 201 }],
    };

    expect(addOptimisticVoteCounts(comment, accountVote)).toMatchObject({
      upvoteCount: 4,
      downvoteCount: 2,
    });
    const canonicalUpdate = { ...comment, updatedAt: 201, upvoteCount: 4 };
    expect(addOptimisticVoteCounts(canonicalUpdate, accountVote)).toBe(canonicalUpdate);
  });

  test("preserves loading comments and unchanged votes", () => {
    expect(addOptimisticVoteCounts(undefined, undefined)).toBeUndefined();
    expect(
      addOptimisticVoteCounts({ cid: comment.cid } as any, {
        vote: 1,
        [optimisticVoteObservedAtKey]: 100,
      }),
    ).toEqual({ cid: comment.cid });
    expect(
      addOptimisticVoteCounts(comment, {
        vote: 1,
        [optimisticVoteBaseKey]: 1,
        [optimisticVoteObservedAtKey]: 100,
        [optimisticVoteTransitionsKey]: [{ vote: 1, timestamp: 101 }],
      }),
    ).toBe(comment);
  });

  test("never produces negative counts", () => {
    const result = addOptimisticVoteCounts(
      { ...comment, upvoteCount: 0, downvoteCount: 0 },
      {
        vote: -1,
        [optimisticVoteBaseKey]: 1,
        [optimisticVoteObservedAtKey]: 100,
        [optimisticVoteTransitionsKey]: [{ vote: -1, timestamp: 101 }],
      },
    );
    expect(result?.upvoteCount).toBe(0);
    expect(result?.downvoteCount).toBe(1);
  });

  test("adjusts comment arrays by cid", () => {
    expect(addOptimisticVoteCountsToComments(undefined, undefined)).toEqual([]);
    const result = addOptimisticVoteCountsToComments([comment, undefined], {
      [comment.cid]: {
        vote: 1,
        [optimisticVoteBaseKey]: 0,
        [optimisticVoteObservedAtKey]: 100,
        [optimisticVoteTransitionsKey]: [{ vote: 1, timestamp: 101 }],
      },
    });
    expect(result[0]?.upvoteCount).toBe(4);
    expect(result[1]).toBeUndefined();
  });
});
