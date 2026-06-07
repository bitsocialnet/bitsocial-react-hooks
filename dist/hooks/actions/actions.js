var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { useMemo, useRef, useState } from "react";
import useAccountsStore from "../../stores/accounts/index.js";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:actions:hooks");
import assert from "assert";
import { useAccount, useAccountId } from "../accounts/index.js";
/** Wraps a callback to no-op when guard returns false. Exported for coverage. */
export function withGuardActive(guardActive, fn) {
    return ((...args) => {
        if (!guardActive())
            return;
        return fn(...args);
    });
}
const noop = () => { };
/** For usePublishComment: when abandoned, catch should no-op. Exported for coverage. */
export function handlePublishErrorWhenAbandoned(activeRequestIdRef, requestId, error, setErrors, onError) {
    if (activeRequestIdRef.current !== requestId)
        return;
    setErrors((errors) => [...errors, error]);
    (onError !== null && onError !== void 0 ? onError : noop)(error);
}
/** For usePublishVote catch. Exported for coverage. */
export function handlePublishVoteError(error, setErrors, onError) {
    setErrors((errors) => [...errors, error]);
    (onError !== null && onError !== void 0 ? onError : noop)(error);
}
const publishChallengeAnswersNotReady = (challengeAnswers) => __awaiter(void 0, void 0, void 0, function* () {
    throw Error(`can't call publishChallengeAnswers() before result.challenge is defined (before the challenge message is received)`);
});
export function useSubscribe(options) {
    var _a;
    assert(!options || typeof options === "object", `useSubscribe options argument '${options}' not an object`);
    const { communityAddress, accountName, onError } = options || {};
    const account = useAccount({ accountName });
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const [errors, setErrors] = useState([]);
    let state = "initializing";
    let subscribed;
    // before the account and communityAddress is defined, nothing can happen
    if (account && communityAddress) {
        state = "ready";
        subscribed = Boolean((_a = account.subscriptions) === null || _a === void 0 ? void 0 : _a.includes(communityAddress));
    }
    const subscribe = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield accountsActions.subscribe(communityAddress, accountName);
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            onError === null || onError === void 0 ? void 0 : onError(e);
        }
    });
    const unsubscribe = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield accountsActions.unsubscribe(communityAddress, accountName);
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            onError === null || onError === void 0 ? void 0 : onError(e);
        }
    });
    return useMemo(() => ({
        subscribed,
        subscribe,
        unsubscribe,
        state,
        error: errors[errors.length - 1],
        errors,
    }), [state, subscribed, errors, communityAddress, accountName]);
}
export function useBlock(options) {
    assert(!options || typeof options === "object", `useBlock options argument '${options}' not an object`);
    const { address, cid, accountName, onError } = options || {};
    if (address && cid) {
        throw Error(`can't useBlock with both an address '${address}' and cid '${cid}' argument at the same time`);
    }
    const account = useAccount({ accountName });
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const [errors, setErrors] = useState([]);
    let state = "initializing";
    let blocked;
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
    const block = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (cid) {
                yield accountsActions.blockCid(cid, accountName);
            }
            else {
                yield accountsActions.blockAddress(address, accountName);
            }
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            onError === null || onError === void 0 ? void 0 : onError(e);
        }
    });
    const unblock = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (cid) {
                yield accountsActions.unblockCid(cid, accountName);
            }
            else {
                yield accountsActions.unblockAddress(address, accountName);
            }
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            onError === null || onError === void 0 ? void 0 : onError(e);
        }
    });
    return useMemo(() => ({
        blocked,
        block,
        unblock,
        state,
        error: errors[errors.length - 1],
        errors,
    }), [state, blocked, errors, address, accountName]);
}
export function usePublishComment(options) {
    assert(!options || typeof options === "object", `usePublishComment options argument '${options}' not an object`);
    const _a = options || {}, { accountName } = _a, publishCommentOptions = __rest(_a, ["accountName"]);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const accountId = useAccountId(accountName);
    const [errors, setErrors] = useState([]);
    const [publishingState, setPublishingState] = useState();
    const [index, setIndex] = useState();
    const [challenge, setChallenge] = useState();
    const [challengeVerification, setChallengeVerification] = useState();
    const [publishChallengeAnswers, setPublishChallengeAnswers] = useState();
    const indexRef = useRef(undefined);
    const publishRequestIdRef = useRef(0);
    const activePublishRequestIdRef = useRef(undefined);
    const guardActive = () => activePublishRequestIdRef.current !== undefined;
    publishCommentOptions._onPendingCommentIndex = withGuardActive(guardActive, (pendingIndex) => {
        indexRef.current = pendingIndex;
        setIndex(pendingIndex);
    });
    let initialState = "initializing";
    if (accountId && options)
        initialState = "ready";
    const originalOnError = publishCommentOptions.onError;
    const onError = (error) => __awaiter(this, void 0, void 0, function* () {
        setErrors((errors) => [...errors, error]);
        (originalOnError !== null && originalOnError !== void 0 ? originalOnError : noop)(error);
    });
    publishCommentOptions.onError = onError;
    const originalOnChallenge = publishCommentOptions.onChallenge;
    publishCommentOptions.onChallenge = withGuardActive(guardActive, (challenge, comment) => __awaiter(this, void 0, void 0, function* () {
        setPublishChallengeAnswers(() => comment === null || comment === void 0 ? void 0 : comment.publishChallengeAnswers.bind(comment));
        setChallenge(challenge);
        (originalOnChallenge !== null && originalOnChallenge !== void 0 ? originalOnChallenge : noop)(challenge, comment);
    }));
    const originalOnChallengeVerification = publishCommentOptions.onChallengeVerification;
    publishCommentOptions.onChallengeVerification = withGuardActive(guardActive, (challengeVerification, comment) => __awaiter(this, void 0, void 0, function* () {
        setChallengeVerification(challengeVerification);
        (originalOnChallengeVerification !== null && originalOnChallengeVerification !== void 0 ? originalOnChallengeVerification : noop)(challengeVerification, comment);
    }));
    publishCommentOptions.onPublishingStateChange = withGuardActive(guardActive, (publishingState) => setPublishingState(publishingState));
    const publishComment = () => __awaiter(this, void 0, void 0, function* () {
        const requestId = publishRequestIdRef.current + 1;
        publishRequestIdRef.current = requestId;
        activePublishRequestIdRef.current = requestId;
        try {
            const { index } = yield accountsActions.publishComment(publishCommentOptions, accountName);
            if (activePublishRequestIdRef.current !== requestId) {
                return;
            }
            indexRef.current = index;
            setIndex(index);
        }
        catch (e) {
            handlePublishErrorWhenAbandoned(activePublishRequestIdRef, requestId, e, setErrors, originalOnError);
        }
    });
    const abandonPublish = () => __awaiter(this, void 0, void 0, function* () {
        activePublishRequestIdRef.current = undefined;
        const idx = indexRef.current;
        if (idx !== undefined) {
            yield accountsActions.deleteComment(idx, accountName);
        }
        indexRef.current = undefined;
        setChallenge(undefined);
        setChallengeVerification(undefined);
        setPublishChallengeAnswers(undefined);
        setIndex(undefined);
        setPublishingState(undefined);
    });
    return useMemo(() => ({
        index,
        challenge,
        challengeVerification,
        publishComment,
        abandonPublish,
        publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
        state: publishingState || initialState,
        error: errors[errors.length - 1],
        errors,
    }), [
        publishingState,
        initialState,
        errors,
        index,
        challenge,
        challengeVerification,
        options,
        accountName,
        publishChallengeAnswers,
    ]);
}
export function usePublishVote(options) {
    assert(!options || typeof options === "object", `usePublishVote options argument '${options}' not an object`);
    const _a = options || {}, { accountName } = _a, publishVoteOptions = __rest(_a, ["accountName"]);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const accountId = useAccountId(accountName);
    const [errors, setErrors] = useState([]);
    const [publishingState, setPublishingState] = useState();
    const [challenge, setChallenge] = useState();
    const [challengeVerification, setChallengeVerification] = useState();
    const [publishChallengeAnswers, setPublishChallengeAnswers] = useState();
    let initialState = "initializing";
    // before the accountId and options is defined, nothing can happen
    if (accountId && options) {
        initialState = "ready";
    }
    // define onError if not defined
    const originalOnError = publishVoteOptions.onError;
    const onError = (error) => __awaiter(this, void 0, void 0, function* () {
        setErrors((errors) => [...errors, error]);
        originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(error);
    });
    publishVoteOptions.onError = onError;
    // define onChallenge if not defined
    const originalOnChallenge = publishVoteOptions.onChallenge;
    const onChallenge = (challenge, vote) => __awaiter(this, void 0, void 0, function* () {
        setPublishChallengeAnswers(() => vote === null || vote === void 0 ? void 0 : vote.publishChallengeAnswers.bind(vote));
        setChallenge(challenge);
        (originalOnChallenge !== null && originalOnChallenge !== void 0 ? originalOnChallenge : (() => { }))(challenge, vote);
    });
    publishVoteOptions.onChallenge = onChallenge;
    const originalOnChallengeVerification = publishVoteOptions.onChallengeVerification;
    const onChallengeVerification = (challengeVerification, vote) => __awaiter(this, void 0, void 0, function* () {
        setChallengeVerification(challengeVerification);
        (originalOnChallengeVerification !== null && originalOnChallengeVerification !== void 0 ? originalOnChallengeVerification : noop)(challengeVerification, vote);
    });
    publishVoteOptions.onChallengeVerification = onChallengeVerification;
    // change state on publishing state change
    publishVoteOptions.onPublishingStateChange = (publishingState) => {
        setPublishingState(publishingState);
    };
    const publishVote = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield accountsActions.publishVote(publishVoteOptions, accountName);
        }
        catch (e) {
            handlePublishVoteError(e, setErrors, originalOnError);
        }
    });
    return useMemo(() => ({
        challenge,
        challengeVerification,
        publishVote,
        publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
        state: publishingState || initialState,
        error: errors[errors.length - 1],
        errors,
    }), [
        publishingState,
        initialState,
        errors,
        challenge,
        challengeVerification,
        options,
        accountName,
        publishChallengeAnswers,
    ]);
}
export function usePublishCommentEdit(options) {
    assert(!options || typeof options === "object", `usePublishCommentEdit options argument '${options}' not an object`);
    const _a = options || {}, { accountName } = _a, publishCommentEditOptions = __rest(_a, ["accountName"]);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const accountId = useAccountId(accountName);
    const [errors, setErrors] = useState([]);
    const [publishingState, setPublishingState] = useState();
    const [challenge, setChallenge] = useState();
    const [challengeVerification, setChallengeVerification] = useState();
    const [publishChallengeAnswers, setPublishChallengeAnswers] = useState();
    let initialState = "initializing";
    // before the accountId and options is defined, nothing can happen
    if (accountId && options) {
        initialState = "ready";
    }
    // define onError if not defined
    const originalOnError = publishCommentEditOptions.onError;
    const onError = (error) => __awaiter(this, void 0, void 0, function* () {
        setErrors((errors) => [...errors, error]);
        originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(error);
    });
    publishCommentEditOptions.onError = onError;
    // define onChallenge if not defined
    const originalOnChallenge = publishCommentEditOptions.onChallenge;
    const onChallenge = (challenge, commentEdit) => __awaiter(this, void 0, void 0, function* () {
        // cannot set a function directly with setState
        setPublishChallengeAnswers(() => commentEdit === null || commentEdit === void 0 ? void 0 : commentEdit.publishChallengeAnswers.bind(commentEdit));
        setChallenge(challenge);
        originalOnChallenge === null || originalOnChallenge === void 0 ? void 0 : originalOnChallenge(challenge, commentEdit);
    });
    publishCommentEditOptions.onChallenge = onChallenge;
    // define onChallengeVerification if not defined
    const originalOnChallengeVerification = publishCommentEditOptions.onChallengeVerification;
    const onChallengeVerification = (challengeVerification, commentEdit) => __awaiter(this, void 0, void 0, function* () {
        setChallengeVerification(challengeVerification);
        originalOnChallengeVerification === null || originalOnChallengeVerification === void 0 ? void 0 : originalOnChallengeVerification(challengeVerification, commentEdit);
    });
    publishCommentEditOptions.onChallengeVerification = onChallengeVerification;
    // change state on publishing state change
    publishCommentEditOptions.onPublishingStateChange = (publishingState) => {
        setPublishingState(publishingState);
    };
    const publishCommentEdit = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield accountsActions.publishCommentEdit(publishCommentEditOptions, accountName);
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(e);
        }
    });
    return useMemo(() => ({
        challenge,
        challengeVerification,
        publishCommentEdit,
        publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
        state: publishingState || initialState,
        error: errors[errors.length - 1],
        errors,
    }), [
        publishingState,
        initialState,
        errors,
        challenge,
        challengeVerification,
        options,
        accountName,
        publishChallengeAnswers,
    ]);
}
export function usePublishCommentModeration(options) {
    assert(!options || typeof options === "object", `usePublishCommentModeration options argument '${options}' not an object`);
    const _a = options || {}, { accountName } = _a, publishCommentModerationOptions = __rest(_a, ["accountName"]);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const accountId = useAccountId(accountName);
    const [errors, setErrors] = useState([]);
    const [publishingState, setPublishingState] = useState();
    const [challenge, setChallenge] = useState();
    const [challengeVerification, setChallengeVerification] = useState();
    const [publishChallengeAnswers, setPublishChallengeAnswers] = useState();
    let initialState = "initializing";
    // before the accountId and options is defined, nothing can happen
    if (accountId && options) {
        initialState = "ready";
    }
    // define onError if not defined
    const originalOnError = publishCommentModerationOptions.onError;
    const onError = (error) => __awaiter(this, void 0, void 0, function* () {
        setErrors((errors) => [...errors, error]);
        originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(error);
    });
    publishCommentModerationOptions.onError = onError;
    // define onChallenge if not defined
    const originalOnChallenge = publishCommentModerationOptions.onChallenge;
    const onChallenge = (challenge, commentModeration) => __awaiter(this, void 0, void 0, function* () {
        // cannot set a function directly with setState
        setPublishChallengeAnswers(() => commentModeration === null || commentModeration === void 0 ? void 0 : commentModeration.publishChallengeAnswers.bind(commentModeration));
        setChallenge(challenge);
        originalOnChallenge === null || originalOnChallenge === void 0 ? void 0 : originalOnChallenge(challenge, commentModeration);
    });
    publishCommentModerationOptions.onChallenge = onChallenge;
    // define onChallengeVerification if not defined
    const originalOnChallengeVerification = publishCommentModerationOptions.onChallengeVerification;
    const onChallengeVerification = (challengeVerification, commentModeration) => __awaiter(this, void 0, void 0, function* () {
        setChallengeVerification(challengeVerification);
        originalOnChallengeVerification === null || originalOnChallengeVerification === void 0 ? void 0 : originalOnChallengeVerification(challengeVerification, commentModeration);
    });
    publishCommentModerationOptions.onChallengeVerification = onChallengeVerification;
    // change state on publishing state change
    publishCommentModerationOptions.onPublishingStateChange = (publishingState) => {
        setPublishingState(publishingState);
    };
    const publishCommentModeration = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield accountsActions.publishCommentModeration(publishCommentModerationOptions, accountName);
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(e);
        }
    });
    return useMemo(() => ({
        challenge,
        challengeVerification,
        publishCommentModeration,
        publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
        state: publishingState || initialState,
        error: errors[errors.length - 1],
        errors,
    }), [
        publishingState,
        initialState,
        errors,
        challenge,
        challengeVerification,
        options,
        accountName,
        publishChallengeAnswers,
    ]);
}
export function usePublishCommunityEdit(options) {
    assert(!options || typeof options === "object", `usePublishCommunityEdit options argument '${options}' not an object`);
    const _a = options || {}, { accountName, communityAddress } = _a, publishCommunityEditOptions = __rest(_a, ["accountName", "communityAddress"]);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const accountId = useAccountId(accountName);
    const [errors, setErrors] = useState([]);
    const [publishingState, setPublishingState] = useState();
    const [challenge, setChallenge] = useState();
    const [challengeVerification, setChallengeVerification] = useState();
    const [publishChallengeAnswers, setPublishChallengeAnswers] = useState();
    let initialState = "initializing";
    // before the accountId and options is defined, nothing can happen
    if (accountId && communityAddress) {
        initialState = "ready";
    }
    // define onError if not defined
    const originalOnError = publishCommunityEditOptions.onError;
    const onError = (error) => __awaiter(this, void 0, void 0, function* () {
        setErrors((errors) => [...errors, error]);
        originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(error);
    });
    publishCommunityEditOptions.onError = onError;
    // define onChallenge if not defined
    const originalOnChallenge = publishCommunityEditOptions.onChallenge;
    const onChallenge = (challenge, communityEdit) => __awaiter(this, void 0, void 0, function* () {
        // cannot set a function directly with setState
        setPublishChallengeAnswers(() => communityEdit === null || communityEdit === void 0 ? void 0 : communityEdit.publishChallengeAnswers.bind(communityEdit));
        setChallenge(challenge);
        originalOnChallenge === null || originalOnChallenge === void 0 ? void 0 : originalOnChallenge(challenge, communityEdit);
    });
    publishCommunityEditOptions.onChallenge = onChallenge;
    // define onChallengeVerification if not defined
    const originalOnChallengeVerification = publishCommunityEditOptions.onChallengeVerification;
    const onChallengeVerification = (challengeVerification, communityEdit) => __awaiter(this, void 0, void 0, function* () {
        setChallengeVerification(challengeVerification);
        originalOnChallengeVerification === null || originalOnChallengeVerification === void 0 ? void 0 : originalOnChallengeVerification(challengeVerification, communityEdit);
    });
    publishCommunityEditOptions.onChallengeVerification = onChallengeVerification;
    // change state on publishing state change
    publishCommunityEditOptions.onPublishingStateChange = (publishingState) => {
        setPublishingState(publishingState);
    };
    const publishCommunityEdit = () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield accountsActions.publishCommunityEdit(communityAddress, publishCommunityEditOptions, accountName);
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            originalOnError === null || originalOnError === void 0 ? void 0 : originalOnError(e);
        }
    });
    return useMemo(() => ({
        challenge,
        challengeVerification,
        publishCommunityEdit,
        publishChallengeAnswers: publishChallengeAnswers || publishChallengeAnswersNotReady,
        state: publishingState || initialState,
        error: errors[errors.length - 1],
        errors,
    }), [
        publishingState,
        initialState,
        errors,
        challenge,
        challengeVerification,
        options,
        accountName,
        publishChallengeAnswers,
    ]);
}
export function useCreateCommunity(options) {
    assert(!options || typeof options === "object", `useCreateCommunity options argument '${options}' not an object`);
    const _a = options || {}, { accountName, onError } = _a, createCommunityOptions = __rest(_a, ["accountName", "onError"]);
    const accountId = useAccountId(accountName);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const [errors, setErrors] = useState([]);
    const [state, setState] = useState();
    const [createdCommunity, setCreatedCommunity] = useState();
    let initialState = "initializing";
    // before the accountId and options is defined, nothing can happen
    if (accountId && options) {
        initialState = "ready";
    }
    const createCommunity = () => __awaiter(this, void 0, void 0, function* () {
        try {
            setState("creating");
            const createdCommunity = yield accountsActions.createCommunity(createCommunityOptions, accountName);
            setCreatedCommunity(createdCommunity);
            setState("succeeded");
        }
        catch (e) {
            setErrors((errors) => [...errors, e]);
            setState("failed");
            onError === null || onError === void 0 ? void 0 : onError(e);
        }
    });
    return useMemo(() => ({
        createdCommunity,
        createCommunity,
        state: state || initialState,
        error: errors[errors.length - 1],
        errors,
    }), [state, errors, createdCommunity, options, accountName]);
}
export function useExportCommunity(options) {
    assert(!options || typeof options === "object", `useExportCommunity options argument '${options}' not an object`);
    const _a = options || {}, { accountName, communityAddress, communityAddresses, onError } = _a, exportCommunityOptions = __rest(_a, ["accountName", "communityAddress", "communityAddresses", "onError"]);
    const accountsActions = useAccountsStore((state) => state.accountsActions);
    const accountId = useAccountId(accountName);
    const [errors, setErrors] = useState([]);
    const [exportingState, setExportingState] = useState();
    const [communityExports, setCommunityExports] = useState([]);
    const targetCommunityAddresses = communityAddresses || (communityAddress ? [communityAddress] : undefined);
    const exportContextKey = JSON.stringify([
        accountId || null,
        targetCommunityAddresses || null,
        exportCommunityOptions.includePrivateKey === true,
        exportCommunityOptions.exportPath,
    ]);
    const previousExportContextKeyRef = useRef(exportContextKey);
    const exportContextVersionRef = useRef(0);
    if (previousExportContextKeyRef.current !== exportContextKey) {
        previousExportContextKeyRef.current = exportContextKey;
        exportContextVersionRef.current += 1;
    }
    const [exportingContext, setExportingContext] = useState();
    let initialState = "initializing";
    if (accountId) {
        initialState = "ready";
    }
    const hasCurrentExportState = accountId &&
        (exportingContext === null || exportingContext === void 0 ? void 0 : exportingContext.key) === exportContextKey &&
        exportingContext.version === exportContextVersionRef.current;
    const exportCommunity = () => __awaiter(this, void 0, void 0, function* () {
        try {
            setExportingContext({
                key: exportContextKey,
                version: exportContextVersionRef.current,
            });
            setExportingState("exporting");
            const communityExports = yield accountsActions.exportCommunity(targetCommunityAddresses, exportCommunityOptions, accountName);
            setCommunityExports(communityExports);
            setExportingState("succeeded");
        }
        catch (e) {
            setExportingState("failed");
            setErrors((errors) => [...errors, e]);
            onError === null || onError === void 0 ? void 0 : onError(e);
        }
    });
    return {
        communityExports: hasCurrentExportState ? communityExports : [],
        exportCommunity,
        state: hasCurrentExportState ? exportingState : initialState,
        error: hasCurrentExportState ? errors[errors.length - 1] : undefined,
        errors: hasCurrentExportState ? errors : [],
    };
}
//# sourceMappingURL=actions.js.map