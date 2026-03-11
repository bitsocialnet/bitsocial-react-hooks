import { useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import useAccountsStore from "../../stores/accounts";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:actions:hooks");
import assert from "assert";
import { useAccount, useAccountId } from "../accounts";

/** Wraps a callback to no-op when guard returns false. Exported for coverage. */
export function withGuardActive<T extends (...args: any[]) => void>(
  guardActive: () => boolean,
  fn: T,
): T {
  return ((...args: Parameters<T>) => {
    if (!guardActive()) return;
    return fn(...args);
  }) as T;
}

const noop = () => {};

/** For usePublishComment: when abandoned, catch should no-op. Exported for coverage. */
export function handlePublishErrorWhenAbandoned(
  activeRequestIdRef: { current: number | undefined },
  requestId: number,
  error: Error,
  setErrors: Dispatch<SetStateAction<Error[]>>,
  onError?: (e: Error) => void,
): void {
  if (activeRequestIdRef.current !== requestId) return;
  setErrors((errors) => [...errors, error]);
  (onError ?? noop)(error);
}

/** For usePublishVote catch. Exported for coverage. */
export function handlePublishVoteError(
  error: Error,
  setErrors: Dispatch<SetStateAction<Error[]>>,
  onError?: (e: Error) => void,
): void {
  setErrors((errors) => [...errors, error]);
  (onError ?? noop)(error);
}
import type {
  UseSubscribeOptions,
  UseSubscribeResult,
  UsePublishCommentOptions,
  UsePublishCommentResult,
  UseBlockOptions,
  UseBlockResult,
  UseCreateCommunityOptions,
  UseCreateCommunityResult,
  UsePublishVoteOptions,
  UsePublishVoteResult,
  UsePublishCommentEditOptions,
  UsePublishCommentEditResult,
  UsePublishCommentModerationOptions,
  UsePublishCommentModerationResult,
  UsePublishCommunityEditOptions,
  UsePublishCommunityEditResult,
  Challenge,
  ChallengeVerification,
  Comment,
  CommentEdit,
  CommentModeration,
  CommunityEdit,
  Vote,
  Community,
} from "../../types";

type PublishChallengeAnswers = (challengeAnswers: string[]) => Promise<void>;
const publishChallengeAnswersNotReady: PublishChallengeAnswers = async (challengeAnswers) => {
  throw Error(
    `can't call publishChallengeAnswers() before result.challenge is defined (before the challenge message is received)`,
  );
};

export function useSubscribe(options?: UseSubscribeOptions): UseSubscribeResult {
  assert(
    !options || typeof options === "object",
    `useSubscribe options argument '${options}' not an object`,
  );
  const { communityAddress, accountName, onError } = options || {};
  const account = useAccount({ accountName });
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const [errors, setErrors] = useState<Error[]>([]);
  let state = "initializing";
  let subscribed: boolean | undefined;

  // before the account and communityAddress is defined, nothing can happen
  if (account && communityAddress) {
    state = "ready";
    subscribed = Boolean(account.subscriptions?.includes(communityAddress));
  }

  const subscribe = async () => {
    try {
      await accountsActions.subscribe(communityAddress, accountName);
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      onError?.(e);
    }
  };

  const unsubscribe = async () => {
    try {
      await accountsActions.unsubscribe(communityAddress, accountName);
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      onError?.(e);
    }
  };

  return useMemo(
    () => ({
      subscribed,
      subscribe,
      unsubscribe,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [state, subscribed, errors, communityAddress, accountName],
  );
}

export function useBlock(options?: UseBlockOptions): UseBlockResult {
  assert(
    !options || typeof options === "object",
    `useBlock options argument '${options}' not an object`,
  );
  const { address, cid, accountName, onError } = options || {};
  if (address && cid) {
    throw Error(
      `can't useBlock with both an address '${address}' and cid '${cid}' argument at the same time`,
    );
  }
  const account = useAccount({ accountName });
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const [errors, setErrors] = useState<Error[]>([]);
  let state = "initializing";
  let blocked: boolean | undefined;

  // before the account and address is defined, nothing can happen
  if (account && (address || cid)) {
    state = "ready";
    if (address) {
      blocked = Boolean(account.blockedAddresses[address]);
    }
    if (cid) {
      blocked = Boolean(account.blockedCids[cid]);
    }
  }

  const block = async () => {
    try {
      if (cid) {
        await accountsActions.blockCid(cid, accountName);
      } else {
        await accountsActions.blockAddress(address, accountName);
      }
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      onError?.(e);
    }
  };

  const unblock = async () => {
    try {
      if (cid) {
        await accountsActions.unblockCid(cid, accountName);
      } else {
        await accountsActions.unblockAddress(address, accountName);
      }
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      onError?.(e);
    }
  };

  return useMemo(
    () => ({
      blocked,
      block,
      unblock,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [state, blocked, errors, address, accountName],
  );
}

export function usePublishComment(options?: UsePublishCommentOptions): UsePublishCommentResult {
  assert(
    !options || typeof options === "object",
    `usePublishComment options argument '${options}' not an object`,
  );
  const { accountName, ...publishCommentOptions } = options || {};
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const accountId = useAccountId(accountName);
  const [errors, setErrors] = useState<Error[]>([]);
  const [publishingState, setPublishingState] = useState<string>();
  const [index, setIndex] = useState<number>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [challengeVerification, setChallengeVerification] = useState<ChallengeVerification>();
  const [publishChallengeAnswers, setPublishChallengeAnswers] = useState<PublishChallengeAnswers>();
  const indexRef = useRef<number | undefined>(undefined);
  const publishRequestIdRef = useRef(0);
  const activePublishRequestIdRef = useRef<number | undefined>(undefined);
  const guardActive = () => activePublishRequestIdRef.current !== undefined;
  publishCommentOptions._onPendingCommentIndex = withGuardActive(
    guardActive,
    (pendingIndex: number) => {
      indexRef.current = pendingIndex;
      setIndex(pendingIndex);
    },
  );

  let initialState = "initializing";
  if (accountId && options) initialState = "ready";

  const originalOnError = publishCommentOptions.onError;
  const onError = async (error: Error) => {
    setErrors((errors) => [...errors, error]);
    (originalOnError ?? noop)(error);
  };
  publishCommentOptions.onError = onError;

  const originalOnChallenge = publishCommentOptions.onChallenge;
  publishCommentOptions.onChallenge = withGuardActive(
    guardActive,
    async (challenge: Challenge, comment: Comment) => {
      setPublishChallengeAnswers(() => comment?.publishChallengeAnswers.bind(comment));
      setChallenge(challenge);
      (originalOnChallenge ?? noop)(challenge, comment);
    },
  );

  const originalOnChallengeVerification = publishCommentOptions.onChallengeVerification;
  publishCommentOptions.onChallengeVerification = withGuardActive(
    guardActive,
    async (challengeVerification: ChallengeVerification, comment: Comment) => {
      setChallengeVerification(challengeVerification);
      (originalOnChallengeVerification ?? noop)(challengeVerification, comment);
    },
  );

  publishCommentOptions.onPublishingStateChange = withGuardActive(
    guardActive,
    (publishingState: string) => setPublishingState(publishingState),
  );

  const publishComment = async () => {
    const requestId = publishRequestIdRef.current + 1;
    publishRequestIdRef.current = requestId;
    activePublishRequestIdRef.current = requestId;
    try {
      const { index } = await accountsActions.publishComment(publishCommentOptions, accountName);
      if (activePublishRequestIdRef.current !== requestId) {
        return;
      }
      indexRef.current = index;
      setIndex(index);
    } catch (e: any) {
      handlePublishErrorWhenAbandoned(
        activePublishRequestIdRef,
        requestId,
        e,
        setErrors,
        originalOnError,
      );
    }
  };

  const abandonPublish = async () => {
    activePublishRequestIdRef.current = undefined;
    const idx = indexRef.current;
    if (idx !== undefined) {
      await accountsActions.deleteComment(idx, accountName);
    }
    indexRef.current = undefined;
    setChallenge(undefined);
    setChallengeVerification(undefined);
    setPublishChallengeAnswers(undefined);
    setIndex(undefined);
    setPublishingState(undefined);
  };

  return useMemo(
    () => ({
      index,
      challenge,
      challengeVerification,
      publishComment,
      abandonPublish,
      publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
      state: publishingState || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      publishingState,
      initialState,
      errors,
      index,
      challenge,
      challengeVerification,
      options,
      accountName,
      publishChallengeAnswers,
    ],
  );
}

export function usePublishVote(options?: UsePublishVoteOptions): UsePublishVoteResult {
  assert(
    !options || typeof options === "object",
    `usePublishVote options argument '${options}' not an object`,
  );
  const { accountName, ...publishVoteOptions } = options || {};
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const accountId = useAccountId(accountName);
  const [errors, setErrors] = useState<Error[]>([]);
  const [publishingState, setPublishingState] = useState<string>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [challengeVerification, setChallengeVerification] = useState<ChallengeVerification>();
  const [publishChallengeAnswers, setPublishChallengeAnswers] = useState<PublishChallengeAnswers>();

  let initialState = "initializing";
  // before the accountId and options is defined, nothing can happen
  if (accountId && options) {
    initialState = "ready";
  }

  // define onError if not defined
  const originalOnError = publishVoteOptions.onError;
  const onError = async (error: Error) => {
    setErrors((errors) => [...errors, error]);
    originalOnError?.(error);
  };
  publishVoteOptions.onError = onError;

  // define onChallenge if not defined
  const originalOnChallenge = publishVoteOptions.onChallenge;
  const onChallenge = async (challenge: Challenge, vote: Vote) => {
    setPublishChallengeAnswers(() => vote?.publishChallengeAnswers.bind(vote));
    setChallenge(challenge);
    (originalOnChallenge ?? (() => {}))(challenge, vote);
  };
  publishVoteOptions.onChallenge = onChallenge;

  const originalOnChallengeVerification = publishVoteOptions.onChallengeVerification;
  const onChallengeVerification = async (
    challengeVerification: ChallengeVerification,
    vote: Vote,
  ) => {
    setChallengeVerification(challengeVerification);
    (originalOnChallengeVerification ?? noop)(challengeVerification, vote);
  };
  publishVoteOptions.onChallengeVerification = onChallengeVerification;

  // change state on publishing state change
  publishVoteOptions.onPublishingStateChange = (publishingState: string) => {
    setPublishingState(publishingState);
  };

  const publishVote = async () => {
    try {
      await accountsActions.publishVote(publishVoteOptions, accountName);
    } catch (e: any) {
      handlePublishVoteError(e, setErrors, originalOnError);
    }
  };

  return useMemo(
    () => ({
      challenge,
      challengeVerification,
      publishVote,
      publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
      state: publishingState || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      publishingState,
      initialState,
      errors,
      challenge,
      challengeVerification,
      options,
      accountName,
      publishChallengeAnswers,
    ],
  );
}

export function usePublishCommentEdit(
  options?: UsePublishCommentEditOptions,
): UsePublishCommentEditResult {
  assert(
    !options || typeof options === "object",
    `usePublishCommentEdit options argument '${options}' not an object`,
  );
  const { accountName, ...publishCommentEditOptions } = options || {};
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const accountId = useAccountId(accountName);
  const [errors, setErrors] = useState<Error[]>([]);
  const [publishingState, setPublishingState] = useState<string>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [challengeVerification, setChallengeVerification] = useState<ChallengeVerification>();
  const [publishChallengeAnswers, setPublishChallengeAnswers] = useState<PublishChallengeAnswers>();

  let initialState = "initializing";
  // before the accountId and options is defined, nothing can happen
  if (accountId && options) {
    initialState = "ready";
  }

  // define onError if not defined
  const originalOnError = publishCommentEditOptions.onError;
  const onError = async (error: Error) => {
    setErrors((errors) => [...errors, error]);
    originalOnError?.(error);
  };
  publishCommentEditOptions.onError = onError;

  // define onChallenge if not defined
  const originalOnChallenge = publishCommentEditOptions.onChallenge;
  const onChallenge = async (challenge: Challenge, commentEdit: CommentEdit) => {
    // cannot set a function directly with setState
    setPublishChallengeAnswers(() => commentEdit?.publishChallengeAnswers.bind(commentEdit));
    setChallenge(challenge);
    originalOnChallenge?.(challenge, commentEdit);
  };
  publishCommentEditOptions.onChallenge = onChallenge;

  // define onChallengeVerification if not defined
  const originalOnChallengeVerification = publishCommentEditOptions.onChallengeVerification;
  const onChallengeVerification = async (
    challengeVerification: ChallengeVerification,
    commentEdit: CommentEdit,
  ) => {
    setChallengeVerification(challengeVerification);
    originalOnChallengeVerification?.(challengeVerification, commentEdit);
  };
  publishCommentEditOptions.onChallengeVerification = onChallengeVerification;

  // change state on publishing state change
  publishCommentEditOptions.onPublishingStateChange = (publishingState: string) => {
    setPublishingState(publishingState);
  };

  const publishCommentEdit = async () => {
    try {
      await accountsActions.publishCommentEdit(publishCommentEditOptions, accountName);
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      originalOnError?.(e);
    }
  };

  return useMemo(
    () => ({
      challenge,
      challengeVerification,
      publishCommentEdit,
      publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
      state: publishingState || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      publishingState,
      initialState,
      errors,
      challenge,
      challengeVerification,
      options,
      accountName,
      publishChallengeAnswers,
    ],
  );
}

export function usePublishCommentModeration(
  options?: UsePublishCommentModerationOptions,
): UsePublishCommentModerationResult {
  assert(
    !options || typeof options === "object",
    `usePublishCommentModeration options argument '${options}' not an object`,
  );
  const { accountName, ...publishCommentModerationOptions } = options || {};
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const accountId = useAccountId(accountName);
  const [errors, setErrors] = useState<Error[]>([]);
  const [publishingState, setPublishingState] = useState<string>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [challengeVerification, setChallengeVerification] = useState<ChallengeVerification>();
  const [publishChallengeAnswers, setPublishChallengeAnswers] = useState<PublishChallengeAnswers>();

  let initialState = "initializing";
  // before the accountId and options is defined, nothing can happen
  if (accountId && options) {
    initialState = "ready";
  }

  // define onError if not defined
  const originalOnError = publishCommentModerationOptions.onError;
  const onError = async (error: Error) => {
    setErrors((errors) => [...errors, error]);
    originalOnError?.(error);
  };
  publishCommentModerationOptions.onError = onError;

  // define onChallenge if not defined
  const originalOnChallenge = publishCommentModerationOptions.onChallenge;
  const onChallenge = async (challenge: Challenge, commentModeration: CommentModeration) => {
    // cannot set a function directly with setState
    setPublishChallengeAnswers(() =>
      commentModeration?.publishChallengeAnswers.bind(commentModeration),
    );
    setChallenge(challenge);
    originalOnChallenge?.(challenge, commentModeration);
  };
  publishCommentModerationOptions.onChallenge = onChallenge;

  // define onChallengeVerification if not defined
  const originalOnChallengeVerification = publishCommentModerationOptions.onChallengeVerification;
  const onChallengeVerification = async (
    challengeVerification: ChallengeVerification,
    commentModeration: CommentModeration,
  ) => {
    setChallengeVerification(challengeVerification);
    originalOnChallengeVerification?.(challengeVerification, commentModeration);
  };
  publishCommentModerationOptions.onChallengeVerification = onChallengeVerification;

  // change state on publishing state change
  publishCommentModerationOptions.onPublishingStateChange = (publishingState: string) => {
    setPublishingState(publishingState);
  };

  const publishCommentModeration = async () => {
    try {
      await accountsActions.publishCommentModeration(publishCommentModerationOptions, accountName);
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      originalOnError?.(e);
    }
  };

  return useMemo(
    () => ({
      challenge,
      challengeVerification,
      publishCommentModeration,
      publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
      state: publishingState || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      publishingState,
      initialState,
      errors,
      challenge,
      challengeVerification,
      options,
      accountName,
      publishChallengeAnswers,
    ],
  );
}

export function usePublishCommunityEdit(
  options?: UsePublishCommunityEditOptions,
): UsePublishCommunityEditResult {
  assert(
    !options || typeof options === "object",
    `usePublishCommunityEdit options argument '${options}' not an object`,
  );
  const { accountName, communityAddress, ...publishCommunityEditOptions } = options || {};
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const accountId = useAccountId(accountName);
  const [errors, setErrors] = useState<Error[]>([]);
  const [publishingState, setPublishingState] = useState<string>();
  const [challenge, setChallenge] = useState<Challenge>();
  const [challengeVerification, setChallengeVerification] = useState<ChallengeVerification>();
  const [publishChallengeAnswers, setPublishChallengeAnswers] = useState<PublishChallengeAnswers>();

  let initialState = "initializing";
  // before the accountId and options is defined, nothing can happen
  if (accountId && communityAddress) {
    initialState = "ready";
  }

  // define onError if not defined
  const originalOnError = publishCommunityEditOptions.onError;
  const onError = async (error: Error) => {
    setErrors((errors) => [...errors, error]);
    originalOnError?.(error);
  };
  publishCommunityEditOptions.onError = onError;

  // define onChallenge if not defined
  const originalOnChallenge = publishCommunityEditOptions.onChallenge;
  const onChallenge = async (challenge: Challenge, communityEdit: CommunityEdit) => {
    // cannot set a function directly with setState
    setPublishChallengeAnswers(() => communityEdit?.publishChallengeAnswers.bind(communityEdit));
    setChallenge(challenge);
    originalOnChallenge?.(challenge, communityEdit);
  };
  publishCommunityEditOptions.onChallenge = onChallenge;

  // define onChallengeVerification if not defined
  const originalOnChallengeVerification = publishCommunityEditOptions.onChallengeVerification;
  const onChallengeVerification = async (
    challengeVerification: ChallengeVerification,
    communityEdit: CommunityEdit,
  ) => {
    setChallengeVerification(challengeVerification);
    originalOnChallengeVerification?.(challengeVerification, communityEdit);
  };
  publishCommunityEditOptions.onChallengeVerification = onChallengeVerification;

  // change state on publishing state change
  publishCommunityEditOptions.onPublishingStateChange = (publishingState: string) => {
    setPublishingState(publishingState);
  };

  const publishCommunityEdit = async () => {
    try {
      await accountsActions.publishCommunityEdit(
        communityAddress,
        publishCommunityEditOptions,
        accountName,
      );
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      originalOnError?.(e);
    }
  };

  return useMemo(
    () => ({
      challenge,
      challengeVerification,
      publishCommunityEdit,
      publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
      state: publishingState || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [
      publishingState,
      initialState,
      errors,
      challenge,
      challengeVerification,
      options,
      accountName,
      publishChallengeAnswers,
    ],
  );
}

export function useCreateCommunity(options?: UseCreateCommunityOptions): UseCreateCommunityResult {
  assert(
    !options || typeof options === "object",
    `useCreateCommunity options argument '${options}' not an object`,
  );
  const { accountName, onError, ...createCommunityOptions } = options || {};
  const accountId = useAccountId(accountName);
  const accountsActions = useAccountsStore((state) => state.accountsActions);
  const [errors, setErrors] = useState<Error[]>([]);
  const [state, setState] = useState<string>();
  const [createdCommunity, setCreatedCommunity] = useState<Community>();

  let initialState = "initializing";
  // before the accountId and options is defined, nothing can happen
  if (accountId && options) {
    initialState = "ready";
  }

  const createCommunity = async () => {
    try {
      setState("creating");
      const createdCommunity = await accountsActions.createCommunity(
        createCommunityOptions,
        accountName,
      );
      setCreatedCommunity(createdCommunity);
      setState("succeeded");
    } catch (e: any) {
      setErrors((errors) => [...errors, e]);
      setState("failed");
      onError?.(e);
    }
  };

  return useMemo(
    () => ({
      createdCommunity,
      createCommunity,
      state: state || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [state, errors, createdCommunity, options, accountName],
  );
}
