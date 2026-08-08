var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "./accounts/index.js";
import validator from "../lib/validator.js";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:comments:hooks");
import assert from "assert";
import useCommentsStore from "../stores/comments/index.js";
import useAccountsStore from "../stores/accounts/index.js";
import { commentIsValid } from "../lib/utils/index.js";
import { addCommentModeration, addCommentModerationToComments, } from "../lib/utils/comment-moderation.js";
import useCommunitiesPagesStore from "../stores/communities-pages/index.js";
import useRepliesPagesStore from "../stores/replies-pages/index.js";
import shallow from "zustand/shallow";
import { assertCommunityRef } from "../lib/community-ref.js";
import { addOptimisticVoteCounts, addOptimisticVoteCountsToComments, } from "../lib/utils/optimistic-vote-counts.js";
export function getCommentFreshness(comment) {
    var _a, _b;
    if (!comment)
        return 0;
    return Math.max((_a = comment.updatedAt) !== null && _a !== void 0 ? _a : 0, (_b = comment.timestamp) !== null && _b !== void 0 ? _b : 0, 0);
}
export function preferFresher(current, candidate) {
    if (!candidate)
        return current;
    if (!current)
        return candidate;
    return getCommentFreshness(candidate) > getCommentFreshness(current) ? candidate : current;
}
const getCommentStateAndReplyCount = (comment) => {
    let state = (comment === null || comment === void 0 ? void 0 : comment.updatingState) || "initializing";
    // force 'fetching-ipns' even if could be something else, so the frontend can use
    // the correct loading skeleton
    if (comment === null || comment === void 0 ? void 0 : comment.timestamp) {
        state = "fetching-update-ipns";
    }
    // force succeeded even if the comment is fecthing a new update
    if (comment === null || comment === void 0 ? void 0 : comment.updatedAt) {
        state = "succeeded";
    }
    // force succeeded if the comment is newer than 5 minutes, no need to display loading skeleton if comment was just created
    let replyCount = comment === null || comment === void 0 ? void 0 : comment.replyCount;
    if ((comment === null || comment === void 0 ? void 0 : comment.replyCount) === undefined &&
        (comment === null || comment === void 0 ? void 0 : comment.timestamp) &&
        (comment === null || comment === void 0 ? void 0 : comment.timestamp) > Date.now() / 1000 - 5 * 60) {
        state = "succeeded";
        // set replyCount because some frontend are likely to check if replyCount === undefined to show a loading skeleton
        replyCount = 0;
    }
    return { state, replyCount };
};
const getCommentsState = (comments) => comments.every((comment) => getCommentStateAndReplyCount(comment).state === "succeeded")
    ? "succeeded"
    : "fetching-ipfs";
let commentAutoUpdateSubscriptionCount = 0;
let commentsAutoUpdateSubscriptionCount = 0;
const getCommentCreateCommentData = (commentCid, community, ...comments) => {
    if (!commentCid) {
        return undefined;
    }
    const createCommentData = { cid: commentCid };
    let hasCommunityData = false;
    for (const comment of comments) {
        if (!comment) {
            continue;
        }
        if (!createCommentData.communityPublicKey && comment.communityPublicKey) {
            createCommentData.communityPublicKey = comment.communityPublicKey;
            hasCommunityData = true;
        }
        if (!createCommentData.communityName && comment.communityName) {
            createCommentData.communityName = comment.communityName;
            hasCommunityData = true;
        }
    }
    if (community === null || community === void 0 ? void 0 : community.publicKey) {
        createCommentData.communityPublicKey = community.publicKey;
        hasCommunityData = true;
    }
    if (community === null || community === void 0 ? void 0 : community.name) {
        createCommentData.communityName = community.name;
        hasCommunityData = true;
    }
    return hasCommunityData ? createCommentData : undefined;
};
/**
 * @param commentCid - The IPFS CID of the comment to get
 * @param community - The community identifier, e.g. {name: 'memes.eth', publicKey: '12D3KooW...'}.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useComment(options) {
    assert(!options || typeof options === "object", `useComment options argument '${options}' not an object`);
    const { commentCid, community, accountName, onlyIfCached, autoUpdate = true } = options !== null && options !== void 0 ? options : {};
    if (community !== undefined) {
        assertCommunityRef(community, "useComment community");
    }
    const account = useAccount({ accountName });
    const commentFromStore = useCommentsStore((state) => state.comments[commentCid || ""]);
    const addCommentToStore = useCommentsStore((state) => state.addCommentToStore);
    const startCommentAutoUpdate = useCommentsStore((state) => state.startCommentAutoUpdate);
    const stopCommentAutoUpdate = useCommentsStore((state) => state.stopCommentAutoUpdate);
    const refreshCommentInStore = useCommentsStore((state) => state.refreshComment);
    const communitiesPagesComment = useCommunitiesPagesStore((state) => state.comments[commentCid || ""]);
    const repliesPagesComment = useRepliesPagesStore((state) => state.comments[commentCid || ""]);
    const errors = useCommentsStore((state) => state.errors[commentCid || ""]);
    // get account comment of the cid if any
    const accountCommentInfo = useAccountsStore((state) => state.commentCidsToAccountsComments[commentCid || ""]);
    const accountComment = useAccountsStore((state) => {
        var _a;
        return (_a = state.accountsComments[(accountCommentInfo === null || accountCommentInfo === void 0 ? void 0 : accountCommentInfo.accountId) || ""]) === null || _a === void 0 ? void 0 : _a[Number(accountCommentInfo === null || accountCommentInfo === void 0 ? void 0 : accountCommentInfo.accountCommentIndex)];
    });
    const accountVote = useAccountsStore((state) => { var _a; return (account === null || account === void 0 ? void 0 : account.id) && commentCid ? (_a = state.accountsVotes[account.id]) === null || _a === void 0 ? void 0 : _a[commentCid] : undefined; });
    const createCommentData = useMemo(() => getCommentCreateCommentData(commentCid, community, communitiesPagesComment, repliesPagesComment), [
        commentCid,
        community === null || community === void 0 ? void 0 : community.name,
        community === null || community === void 0 ? void 0 : community.publicKey,
        communitiesPagesComment === null || communitiesPagesComment === void 0 ? void 0 : communitiesPagesComment.communityName,
        communitiesPagesComment === null || communitiesPagesComment === void 0 ? void 0 : communitiesPagesComment.communityPublicKey,
        repliesPagesComment === null || repliesPagesComment === void 0 ? void 0 : repliesPagesComment.communityName,
        repliesPagesComment === null || repliesPagesComment === void 0 ? void 0 : repliesPagesComment.communityPublicKey,
    ]);
    const autoUpdateSubscriptionId = useRef(`useComment-${++commentAutoUpdateSubscriptionCount}`);
    const currentCommentCidRef = useRef(commentCid);
    currentCommentCidRef.current = commentCid;
    const [frozenComment, setFrozenComment] = useState();
    const [freezeSettledCid, setFreezeSettledCid] = useState();
    useEffect(() => {
        if (!commentCid || !account) {
            return;
        }
        validator.validateUseCommentArguments(commentCid, account);
        if (!commentFromStore && !onlyIfCached) {
            // if comment isn't already in store, add it
            const addCommentPromise = createCommentData
                ? addCommentToStore(commentCid, account, createCommentData)
                : addCommentToStore(commentCid, account);
            addCommentPromise.catch((error) => log.error("useComment addCommentToStore error", { commentCid, error }));
        }
    }, [commentCid, account === null || account === void 0 ? void 0 : account.id, onlyIfCached, createCommentData]);
    useEffect(() => {
        if (!commentCid || !account || onlyIfCached || !autoUpdate) {
            return;
        }
        const startAutoUpdatePromise = createCommentData
            ? startCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current, account, createCommentData)
            : startCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current, account);
        startAutoUpdatePromise.catch((error) => log.error("useComment startCommentAutoUpdate error", { commentCid, error }));
        return () => {
            stopCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current).catch((error) => log.error("useComment stopCommentAutoUpdate error", { commentCid, error }));
        };
    }, [commentCid, account === null || account === void 0 ? void 0 : account.id, onlyIfCached, autoUpdate, createCommentData]);
    let selectedComment = commentFromStore;
    if (commentCid && communitiesPagesComment) {
        selectedComment = preferFresher(selectedComment, communitiesPagesComment);
    }
    if (commentCid && repliesPagesComment) {
        selectedComment = preferFresher(selectedComment, repliesPagesComment);
    }
    // if comment is still not defined, but account comment is, use account comment
    // check `comment.timestamp` instead of `comment` in case comment exists but in a loading state
    const commentFromStoreNotLoaded = !(selectedComment === null || selectedComment === void 0 ? void 0 : selectedComment.timestamp);
    if (commentCid && commentFromStoreNotLoaded && accountComment) {
        selectedComment = accountComment;
    }
    const selectedCommentState = getCommentStateAndReplyCount(selectedComment).state;
    const freezeSettledForCurrentCid = freezeSettledCid === commentCid;
    useEffect(() => {
        if (autoUpdate) {
            setFrozenComment(undefined);
            setFreezeSettledCid(undefined);
            return;
        }
        setFrozenComment(undefined);
        setFreezeSettledCid(undefined);
    }, [commentCid, autoUpdate]);
    useEffect(() => {
        if (autoUpdate) {
            return;
        }
        if (!commentCid) {
            setFrozenComment(undefined);
            setFreezeSettledCid(undefined);
            return;
        }
        if (freezeSettledForCurrentCid || !selectedComment) {
            return;
        }
        setFrozenComment(selectedComment);
        if (selectedCommentState === "succeeded") {
            setFreezeSettledCid(commentCid);
        }
    }, [autoUpdate, commentCid, selectedComment, selectedCommentState, freezeSettledForCurrentCid]);
    const frozenCommentForCurrentCid = (frozenComment === null || frozenComment === void 0 ? void 0 : frozenComment.cid) === commentCid ? frozenComment : undefined;
    let comment = autoUpdate
        ? selectedComment
        : freezeSettledForCurrentCid
            ? frozenCommentForCurrentCid
            : frozenCommentForCurrentCid || selectedComment;
    comment = addCommentModeration(comment);
    comment = addOptimisticVoteCounts(comment, accountVote);
    const { state, replyCount } = getCommentStateAndReplyCount(comment);
    if (account && commentCid) {
        log("useComment", {
            commentCid,
            comment,
            replyCount,
            state,
            commentFromStore,
            communitiesPagesComment,
            repliesPagesComment,
            accountComment,
            commentsStore: useCommentsStore.getState().comments,
            account,
            onlyIfCached,
            autoUpdate,
        });
    }
    const refresh = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!commentCid || !account) {
            throw Error("useComment cannot refresh comment not initialized yet");
        }
        const refreshCommentCid = commentCid;
        const refreshedComment = createCommentData
            ? yield refreshCommentInStore(refreshCommentCid, account, createCommentData)
            : yield refreshCommentInStore(refreshCommentCid, account);
        if (!autoUpdate && refreshedComment && currentCommentCidRef.current === refreshCommentCid) {
            setFrozenComment(refreshedComment);
            setFreezeSettledCid(refreshCommentCid);
        }
    }), [account, autoUpdate, commentCid, createCommentData, refreshCommentInStore]);
    return useMemo(() => (Object.assign(Object.assign({}, comment), { replyCount,
        state,
        refresh, error: errors === null || errors === void 0 ? void 0 : errors[errors.length - 1], errors: errors || [] })), [comment, commentCid, errors, refresh, state, replyCount]);
}
/**
 * @param commentCids - The IPFS CIDs of the comments to get
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useComments(options) {
    assert(!options || typeof options === "object", `useComments options argument '${options}' not an object`);
    const { commentCids = [], accountName, onlyIfCached, autoUpdate = true } = options !== null && options !== void 0 ? options : {};
    const account = useAccount({ accountName });
    const accountVotes = useAccountsStore((state) => (account === null || account === void 0 ? void 0 : account.id) ? state.accountsVotes[account.id] : undefined);
    const commentsStoreComments = useCommentsStore((state) => commentCids.map((commentCid) => state.comments[commentCid || ""]), shallow);
    const communitiesPagesComments = useCommunitiesPagesStore((state) => commentCids.map((commentCid) => state.comments[commentCid || ""]), shallow);
    const addCommentToStore = useCommentsStore((state) => state.addCommentToStore);
    const startCommentAutoUpdate = useCommentsStore((state) => state.startCommentAutoUpdate);
    const stopCommentAutoUpdate = useCommentsStore((state) => state.stopCommentAutoUpdate);
    const refreshCommentInStore = useCommentsStore((state) => state.refreshComment);
    const autoUpdateSubscriptionId = useRef(`useComments-${++commentsAutoUpdateSubscriptionCount}`);
    const commentCidsKey = JSON.stringify(commentCids);
    const commentsKey = `${(account === null || account === void 0 ? void 0 : account.id) || ""}:${commentCidsKey}`;
    const currentCommentsKeyRef = useRef(commentsKey);
    currentCommentsKeyRef.current = commentsKey;
    const [frozenComments, setFrozenComments] = useState([]);
    const [frozenCommentsKey, setFrozenCommentsKey] = useState();
    const [freezeSettledKey, setFreezeSettledKey] = useState();
    useEffect(() => {
        if (!commentCids || !account) {
            return;
        }
        validator.validateUseCommentsArguments(commentCids, account);
        if (onlyIfCached) {
            return;
        }
        const uniqueCommentCids = new Set(commentCids);
        for (const commentCid of uniqueCommentCids) {
            addCommentToStore(commentCid, account).catch((error) => log.error("useComments addCommentToStore error", { commentCid, error }));
        }
    }, [commentCidsKey, account === null || account === void 0 ? void 0 : account.id, onlyIfCached]);
    useEffect(() => {
        if (!commentCids || !account || onlyIfCached || !autoUpdate) {
            return;
        }
        const uniqueCommentCids = [...new Set(commentCids)];
        for (const commentCid of uniqueCommentCids) {
            startCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current, account).catch((error) => log.error("useComments startCommentAutoUpdate error", { commentCid, error }));
        }
        return () => {
            for (const commentCid of uniqueCommentCids) {
                stopCommentAutoUpdate(commentCid, autoUpdateSubscriptionId.current).catch((error) => log.error("useComments stopCommentAutoUpdate error", { commentCid, error }));
            }
        };
    }, [commentCidsKey, account === null || account === void 0 ? void 0 : account.id, onlyIfCached, autoUpdate]);
    if (account && (commentCids === null || commentCids === void 0 ? void 0 : commentCids.length)) {
        log("useComments", {
            commentCids,
            commentsStoreComments,
            commentsStore: useCommentsStore.getState().comments,
            account,
        });
    }
    // if comment from community pages exists and is fresher (or current missing), use it instead
    const liveComments = useMemo(() => {
        const result = [...commentsStoreComments];
        for (const i in result) {
            const candidate = communitiesPagesComments[i];
            if (candidate)
                result[i] = preferFresher(result[i], candidate);
        }
        return result;
    }, [commentsStoreComments, communitiesPagesComments]);
    const liveCommentsSettled = liveComments.every((comment) => getCommentStateAndReplyCount(comment).state === "succeeded");
    const freezeSettledForCurrentKey = freezeSettledKey === commentsKey;
    useEffect(() => {
        if (autoUpdate) {
            setFrozenComments([]);
            setFrozenCommentsKey(undefined);
            setFreezeSettledKey(undefined);
            return;
        }
        setFrozenComments([]);
        setFrozenCommentsKey(undefined);
        setFreezeSettledKey(undefined);
    }, [commentsKey, autoUpdate]);
    useEffect(() => {
        if (autoUpdate || freezeSettledForCurrentKey) {
            return;
        }
        setFrozenComments(liveComments);
        setFrozenCommentsKey(commentsKey);
        if (liveCommentsSettled) {
            setFreezeSettledKey(commentsKey);
        }
    }, [autoUpdate, commentsKey, freezeSettledForCurrentKey, liveComments, liveCommentsSettled]);
    const frozenCommentsForCurrentSelection = frozenCommentsKey === commentsKey ? frozenComments : undefined;
    const comments = autoUpdate ? liveComments : frozenCommentsForCurrentSelection || liveComments;
    const normalizedComments = useMemo(() => addOptimisticVoteCountsToComments(addCommentModerationToComments(comments), accountVotes), [comments, accountVotes]);
    // succeed if no comments are undefined
    const state = getCommentsState(normalizedComments);
    const refresh = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!account) {
            throw Error("useComments cannot refresh comments not initialized yet");
        }
        const uniqueCommentCids = [...new Set(commentCids)];
        const refreshedComments = yield Promise.all(uniqueCommentCids.map((commentCid) => refreshCommentInStore(commentCid, account)));
        if (!autoUpdate && currentCommentsKeyRef.current === commentsKey) {
            const latestCommunitiesPagesComments = useCommunitiesPagesStore.getState().comments;
            const refreshedCommentsByCid = uniqueCommentCids.reduce((refreshedCommentsMap, commentCid, index) => {
                refreshedCommentsMap[commentCid] = refreshedComments[index];
                return refreshedCommentsMap;
            }, {});
            setFrozenComments(commentCids.map((commentCid) => preferFresher(refreshedCommentsByCid[commentCid || ""], latestCommunitiesPagesComments[commentCid || ""])));
            setFrozenCommentsKey(commentsKey);
            setFreezeSettledKey(commentsKey);
        }
    }), [account, autoUpdate, commentCids, commentsKey, refreshCommentInStore]);
    return useMemo(() => ({
        comments: normalizedComments,
        state,
        refresh,
        error: undefined,
        errors: [],
    }), [normalizedComments, commentsKey, refresh, state]);
}
export function useValidateComment(options) {
    assert(!options || typeof options === "object", `useValidateComment options argument '${options}' not an object`);
    let { comment, validateReplies, accountName } = options !== null && options !== void 0 ? options : {};
    validateReplies = validateReplies !== null && validateReplies !== void 0 ? validateReplies : true;
    const [validated, setValidated] = useState();
    const [errors] = useState([]);
    const account = useAccount({ accountName });
    useEffect(() => {
        if (!comment || !(account === null || account === void 0 ? void 0 : account.pkc)) {
            setValidated(undefined);
            return;
        }
        // don't automatically block community because what community it comes from
        // a malicious community could try to block other communities, etc
        const blockCommunity = false;
        commentIsValid(comment, { validateReplies, blockCommunity }, account.pkc).then((validated) => setValidated(validated));
    }, [comment, validateReplies, account === null || account === void 0 ? void 0 : account.pkc]);
    let state = "initializing";
    if (validated === true) {
        state = "succeeded";
    }
    if (validated === false) {
        state = "failed";
    }
    // start valid at true always because most of the time the value will be true and we dont want to cause a rerender
    let valid = true;
    if (validated == false) {
        valid = false;
    }
    // if comment isn't defined, it would be confusing for valid to be true
    if (!comment) {
        valid = false;
    }
    return useMemo(() => ({
        valid,
        state,
        error: errors[errors.length - 1],
        errors,
    }), [valid, state]);
}
//# sourceMappingURL=comments.js.map