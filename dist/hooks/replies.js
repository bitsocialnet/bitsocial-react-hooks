var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useEffect, useState, useMemo } from "react";
import { useAccount } from "./accounts";
import validator from "../lib/validator";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:replies:hooks");
import assert from "assert";
import { addCommentModerationToComments } from "../lib/utils/comment-moderation";
import useRepliesStore, { feedOptionsToFeedName, getRepliesFirstPageSkipValidation, } from "../stores/replies";
/** Pure helper to append an error to the errors array; used for deterministic coverage of reset/loadMore catch paths. */
export function appendErrorToErrors(prevErrors, e) {
    return [...prevErrors, e];
}
export function useReplies(options) {
    var _a;
    assert(!options || typeof options === "object", `useReplies options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    let { comment, sortType, accountName, flat, flatDepth, accountComments, repliesPerPage, filter, validateOptimistically, streamPage, } = opts;
    sortType = sortType || "best";
    flatDepth = typeof flatDepth === "number" ? flatDepth : 0;
    validateOptimistically = validateOptimistically !== false;
    const invalidFlatDepth = flat && typeof (comment === null || comment === void 0 ? void 0 : comment.depth) === "number" && flatDepth !== comment.depth;
    validator.validateUseRepliesArguments(comment, sortType, accountName, flat, accountComments, repliesPerPage, filter);
    const [errors, setErrors] = useState([]);
    // add replies to store
    const account = useAccount({ accountName });
    const feedOptions = {
        commentCid: comment === null || comment === void 0 ? void 0 : comment.cid,
        commentDepth: comment === null || comment === void 0 ? void 0 : comment.depth,
        postCid: comment === null || comment === void 0 ? void 0 : comment.postCid,
        sortType,
        accountId: account === null || account === void 0 ? void 0 : account.id,
        repliesPerPage,
        flat,
        accountComments,
        filter,
        streamPage,
    };
    const repliesFeedName = feedOptionsToFeedName(feedOptions);
    const addFeedToStoreOrUpdateComment = useRepliesStore((state) => state.addFeedToStoreOrUpdateComment);
    useEffect(() => {
        if (!(comment === null || comment === void 0 ? void 0 : comment.cid) || !account || invalidFlatDepth) {
            return;
        }
        addFeedToStoreOrUpdateComment(comment, feedOptions).catch((error) => log.error("useReplies addFeedToStoreOrUpdateComment error", {
            repliesFeedName,
            comment,
            feedOptions,
            error,
        }));
    }, [repliesFeedName, comment]);
    let replies = useRepliesStore((state) => state.loadedFeeds[repliesFeedName || ""]);
    let bufferedReplies = useRepliesStore((state) => state.bufferedFeeds[repliesFeedName || ""]);
    let updatedReplies = useRepliesStore((state) => state.updatedFeeds[repliesFeedName || ""]);
    let hasMore = useRepliesStore((state) => state.feedsHaveMore[repliesFeedName || ""]);
    hasMore = comment ? (repliesFeedName && typeof hasMore === "boolean" ? hasMore : true) : false;
    const incrementFeedPageNumber = useRepliesStore((state) => state.incrementFeedPageNumber);
    let loadMore = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!(comment === null || comment === void 0 ? void 0 : comment.cid) || !account) {
                throw Error("useReplies cannot load more replies not initalized yet");
            }
            incrementFeedPageNumber(repliesFeedName);
        }
        catch (e) {
            yield new Promise((r) => setTimeout(r, 50));
            setErrors(appendErrorToErrors(errors, e));
        }
    });
    const resetFeed = useRepliesStore((state) => state.resetFeed);
    let reset = () => __awaiter(this, void 0, void 0, function* () {
        try {
            if (!(comment === null || comment === void 0 ? void 0 : comment.cid) || !account) {
                throw Error("useReplies cannot reset replies not initalized yet");
            }
            resetFeed(repliesFeedName);
        }
        catch (e) {
            yield new Promise((r) => setTimeout(r, 50));
            setErrors(appendErrorToErrors(errors, e));
        }
    });
    // optimistically avoid the initial validation delay by using skipped validation until validated feed is loaded
    const skipValidation = useMemo(() => {
        if (validateOptimistically && !replies && (comment === null || comment === void 0 ? void 0 : comment.cid) && (account === null || account === void 0 ? void 0 : account.id)) {
            return getRepliesFirstPageSkipValidation(comment, feedOptions);
        }
    }, [validateOptimistically, replies, comment === null || comment === void 0 ? void 0 : comment.cid, account === null || account === void 0 ? void 0 : account.id, comment, repliesFeedName]);
    if (validateOptimistically && !replies && ((_a = skipValidation === null || skipValidation === void 0 ? void 0 : skipValidation.replies) === null || _a === void 0 ? void 0 : _a.length)) {
        replies = skipValidation.replies;
        hasMore = skipValidation.hasMore;
    }
    // don't display nested replies when flat
    // to start flat replies at a depth other than 0, e.g. a twitter reply thread, change flatDepth
    if (invalidFlatDepth) {
        replies = emptyArray;
        bufferedReplies = emptyArray;
        updatedReplies = emptyArray;
        hasMore = false;
        loadMore = emptyFunction;
        reset = emptyFunction;
    }
    if (account && (comment === null || comment === void 0 ? void 0 : comment.cid)) {
        log("useReplies", {
            repliesLength: (replies === null || replies === void 0 ? void 0 : replies.length) || 0,
            hasMore,
            comment,
            sortType,
            flat,
            flatDepth,
            repliesStoreOptions: useRepliesStore.getState().feedsOptions,
            repliesStore: useRepliesStore.getState(),
            invalidFlatDepth,
        });
    }
    const state = !hasMore ? "succeeded" : "fetching";
    const normalizedReplies = useMemo(() => addCommentModerationToComments(replies), [replies]);
    const normalizedBufferedReplies = useMemo(() => addCommentModerationToComments(bufferedReplies), [bufferedReplies]);
    const normalizedUpdatedReplies = useMemo(() => addCommentModerationToComments(updatedReplies), [updatedReplies]);
    return useMemo(() => ({
        replies: normalizedReplies,
        bufferedReplies: normalizedBufferedReplies,
        updatedReplies: normalizedUpdatedReplies,
        hasMore,
        loadMore,
        reset,
        state,
        error: errors[errors.length - 1],
        errors,
    }), [
        normalizedReplies,
        normalizedBufferedReplies,
        normalizedUpdatedReplies,
        repliesFeedName,
        hasMore,
        errors,
    ]);
}
const emptyArray = [];
const emptyFunction = () => __awaiter(void 0, void 0, void 0, function* () { });
