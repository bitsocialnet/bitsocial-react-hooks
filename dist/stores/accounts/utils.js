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
import assert from "assert";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import commentsStore from "../comments/index.js";
import repliesPagesStore from "../replies-pages/index.js";
import communitiesPagesStore from "../communities-pages/index.js";
import PkcJs from "../../lib/pkc-js/index.js";
const getAuthorAddressRolesFromCommunities = (authorAddress, communities) => {
    var _a, _b;
    const roles = {};
    for (const communityAddress in communities) {
        const role = (_b = (_a = communities[communityAddress]) === null || _a === void 0 ? void 0 : _a.roles) === null || _b === void 0 ? void 0 : _b[authorAddress];
        if (role) {
            roles[communityAddress] = role;
        }
    }
    return roles;
};
export const getAccountCommunities = (account, communities) => {
    var _a, _b, _c;
    assert(((_a = account === null || account === void 0 ? void 0 : account.author) === null || _a === void 0 ? void 0 : _a.address) && typeof ((_b = account === null || account === void 0 ? void 0 : account.author) === null || _b === void 0 ? void 0 : _b.address) === "string", `accountsStore utils getAccountCommunities invalid account.author.address '${(_c = account === null || account === void 0 ? void 0 : account.author) === null || _c === void 0 ? void 0 : _c.address}'`);
    assert(communities && typeof communities === "object", `accountsStore utils getAccountCommunities invalid communities '${communities}'`);
    const roles = getAuthorAddressRolesFromCommunities(account.author.address, communities);
    const accountCommunities = Object.assign({}, account.communities);
    for (const communityAddress in roles) {
        accountCommunities[communityAddress] = Object.assign({}, accountCommunities[communityAddress]);
        accountCommunities[communityAddress].role = roles[communityAddress];
    }
    return accountCommunities;
};
export const getCommentCidsToAccountsComments = (accountsComments) => {
    const commentCidsToAccountsComments = {};
    for (const accountId in accountsComments) {
        for (const accountComment of accountsComments[accountId]) {
            if (accountComment.cid) {
                commentCidsToAccountsComments[accountComment.cid] = {
                    accountId,
                    accountCommentIndex: accountComment.index,
                };
            }
        }
    }
    return commentCidsToAccountsComments;
};
const cloneWithoutFunctions = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((entry) => cloneWithoutFunctions(entry))
            .filter((entry) => entry !== undefined);
    }
    if (!value || typeof value !== "object") {
        return typeof value === "function" ? undefined : value;
    }
    const clonedValue = {};
    for (const key in value) {
        if (typeof value[key] === "function") {
            continue;
        }
        const clonedChild = cloneWithoutFunctions(value[key]);
        if (clonedChild !== undefined) {
            clonedValue[key] = clonedChild;
        }
    }
    return clonedValue;
};
const compactStoredCommentAuthor = (author) => {
    if (!author || typeof author !== "object") {
        return undefined;
    }
    const compactAuthor = cloneWithoutFunctions({
        address: author.address,
        shortAddress: author.shortAddress,
        displayName: author.displayName,
        avatar: author.avatar,
        flair: author.flair,
    });
    return compactAuthor && Object.keys(compactAuthor).length > 0 ? compactAuthor : undefined;
};
const compactStoredOriginalComment = (originalComment) => {
    if (!originalComment || typeof originalComment !== "object") {
        return undefined;
    }
    const compactOriginalComment = cloneWithoutFunctions({
        cid: originalComment.cid,
        content: originalComment.content,
        title: originalComment.title,
        link: originalComment.link,
        linkWidth: originalComment.linkWidth,
        linkHeight: originalComment.linkHeight,
        linkHtmlTagName: originalComment.linkHtmlTagName,
        thumbnailUrl: originalComment.thumbnailUrl,
        media: originalComment.media,
        spoiler: originalComment.spoiler,
        nsfw: originalComment.nsfw,
        deleted: originalComment.deleted,
        removed: originalComment.removed,
        reason: originalComment.reason,
        quotedCids: originalComment.quotedCids,
        parentCid: originalComment.parentCid,
        postCid: originalComment.postCid,
        communityAddress: originalComment.communityAddress,
        timestamp: originalComment.timestamp,
        author: compactStoredCommentAuthor(originalComment.author),
    });
    return compactOriginalComment && Object.keys(compactOriginalComment).length > 0
        ? compactOriginalComment
        : undefined;
};
const compactStoredReplies = (replies) => {
    if (!replies || typeof replies !== "object") {
        return undefined;
    }
    const compactReplies = cloneWithoutFunctions(Object.fromEntries(Object.entries(replies).filter(([replyKey]) => replyKey !== "pages" && replyKey !== "clients")));
    return compactReplies && Object.keys(compactReplies).length > 0 ? compactReplies : undefined;
};
export const sanitizeAccountCommentForState = (comment) => {
    var _a;
    const sanitizedComment = cloneWithoutFunctions(Object.assign(Object.assign({}, comment), { signer: undefined, raw: undefined, replies: (comment === null || comment === void 0 ? void 0 : comment.replies)
            ? Object.fromEntries(Object.entries(comment.replies).filter(([replyKey]) => replyKey !== "pages"))
            : comment === null || comment === void 0 ? void 0 : comment.replies }));
    if (!sanitizedComment || typeof sanitizedComment !== "object") {
        return sanitizedComment;
    }
    if ((_a = sanitizedComment === null || sanitizedComment === void 0 ? void 0 : sanitizedComment.replies) === null || _a === void 0 ? void 0 : _a.pages) {
        sanitizedComment.replies = Object.assign({}, sanitizedComment.replies);
        delete sanitizedComment.replies.pages;
    }
    if ((sanitizedComment === null || sanitizedComment === void 0 ? void 0 : sanitizedComment.replies) && Object.keys(sanitizedComment.replies).length === 0) {
        delete sanitizedComment.replies;
    }
    return sanitizedComment;
};
export const sanitizeStoredAccountComment = (comment) => {
    const preprocessedComment = Object.assign(Object.assign({}, comment), { signer: undefined, clients: undefined, raw: undefined, replies: compactStoredReplies(comment === null || comment === void 0 ? void 0 : comment.replies), original: (comment === null || comment === void 0 ? void 0 : comment.edit) ? compactStoredOriginalComment(comment.original) : undefined });
    const sanitizedComment = cloneWithoutFunctions(preprocessedComment);
    if (!sanitizedComment || typeof sanitizedComment !== "object") {
        return sanitizedComment;
    }
    if ((sanitizedComment === null || sanitizedComment === void 0 ? void 0 : sanitizedComment.replies) && Object.keys(sanitizedComment.replies).length === 0) {
        delete sanitizedComment.replies;
    }
    if ((sanitizedComment === null || sanitizedComment === void 0 ? void 0 : sanitizedComment.original) && Object.keys(sanitizedComment.original).length === 0) {
        delete sanitizedComment.original;
    }
    return sanitizedComment;
};
export const getAccountCommentsIndex = (accountComments) => {
    const index = {
        byCommunityAddress: {},
        byParentCid: {},
    };
    for (const accountComment of accountComments || []) {
        if (accountComment.communityAddress) {
            if (!index.byCommunityAddress[accountComment.communityAddress]) {
                index.byCommunityAddress[accountComment.communityAddress] = [];
            }
            index.byCommunityAddress[accountComment.communityAddress].push(accountComment.index);
        }
        if (accountComment.parentCid) {
            if (!index.byParentCid[accountComment.parentCid]) {
                index.byParentCid[accountComment.parentCid] = [];
            }
            index.byParentCid[accountComment.parentCid].push(accountComment.index);
        }
    }
    return index;
};
export const getAccountsCommentsIndexes = (accountsComments) => {
    const indexes = {};
    for (const accountId in accountsComments) {
        indexes[accountId] = getAccountCommentsIndex(accountsComments[accountId]);
    }
    return indexes;
};
const accountEditNonPropertyNames = new Set([
    "author",
    "signer",
    "clientId",
    "commentCid",
    "communityAddress",
    "communityAddress",
    "timestamp",
]);
export const COMMENT_MODERATION_AUTHOR_SUMMARY_KEY = "commentModeration.author";
const normalizeAccountEditForSummary = (accountEdit) => {
    var _a;
    const normalizedAccountEdit = Object.assign({}, accountEdit);
    const commentModeration = normalizedAccountEdit.commentModeration;
    if (commentModeration && typeof commentModeration === "object") {
        const { author } = commentModeration, commentModerationProperties = __rest(commentModeration, ["author"]);
        Object.assign(normalizedAccountEdit, commentModerationProperties);
        if (Object.prototype.hasOwnProperty.call(commentModeration, "author")) {
            normalizedAccountEdit[COMMENT_MODERATION_AUTHOR_SUMMARY_KEY] = author;
        }
        delete normalizedAccountEdit.commentModeration;
    }
    const communityEdit = (_a = normalizedAccountEdit.communityEdit) !== null && _a !== void 0 ? _a : normalizedAccountEdit.communityEdit;
    if (communityEdit && typeof communityEdit === "object") {
        Object.assign(normalizedAccountEdit, communityEdit);
    }
    delete normalizedAccountEdit.communityEdit;
    delete normalizedAccountEdit.communityEdit;
    return normalizedAccountEdit;
};
export const getAccountEditPropertySummary = (accountEdits) => {
    var _a;
    const accountEditPropertySummary = {};
    for (const accountEdit of accountEdits || []) {
        const normalizedAccountEdit = normalizeAccountEditForSummary(accountEdit);
        for (const propertyName in normalizedAccountEdit) {
            if ((normalizedAccountEdit[propertyName] === undefined &&
                propertyName !== COMMENT_MODERATION_AUTHOR_SUMMARY_KEY) ||
                accountEditNonPropertyNames.has(propertyName)) {
                continue;
            }
            const previousTimestamp = ((_a = accountEditPropertySummary[propertyName]) === null || _a === void 0 ? void 0 : _a.timestamp) || 0;
            if ((normalizedAccountEdit.timestamp || 0) >= previousTimestamp) {
                accountEditPropertySummary[propertyName] = {
                    timestamp: normalizedAccountEdit.timestamp,
                    value: normalizedAccountEdit[propertyName],
                };
            }
        }
    }
    return accountEditPropertySummary;
};
export const getAccountsEditsSummary = (accountEdits) => {
    const summary = {};
    for (const target in accountEdits || {}) {
        summary[target] = getAccountEditPropertySummary(accountEdits[target]);
    }
    return summary;
};
// polyfill Promise.any, exported for test coverage of empty-array branch
const promiseAny = (promises) => new Promise((res, rej) => {
    let count = promises.length;
    if (count === 0)
        return rej(Error("all promises rejected"));
    promises.forEach((p) => Promise.resolve(p)
        .then(res)
        .catch((e) => {
        if (--count === 0)
            rej(Error("all promises rejected"));
    }));
});
export const fetchCommentLinkDimensions = (link) => __awaiter(void 0, void 0, void 0, function* () {
    if (!link) {
        return {};
    }
    const fetchImageDimensions = (url) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            // don't accept 0px value
            if (!image.width || !image.height) {
                return reject(Error(`failed fetching image dimensions for url '${url}'`));
            }
            resolve({
                linkWidth: image.width,
                linkHeight: image.height,
                linkHtmlTagName: "img",
            });
            // remove image from memory
            try {
                image.src = "";
            }
            catch (e) { }
        };
        image.onerror = (error) => {
            reject(Error(`failed fetching image dimensions for url '${url}'`));
        };
        // max loading time
        const timeout = 10000;
        setTimeout(() => reject(Error(`failed fetching image dimensions for url '${url}' timeout '${timeout}'`)), timeout);
        // start loading
        image.src = url;
    });
    const fetchVideoDimensions = (url) => new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.muted = true;
        video.loop = false;
        video.addEventListener("loadeddata", () => {
            // don't accept 0px value
            if (!video.videoWidth || !video.videoHeight) {
                return reject(Error(`failed fetching video dimensions for url '${url}'`));
            }
            resolve({
                linkWidth: video.videoWidth,
                linkHeight: video.videoHeight,
                linkHtmlTagName: "video",
            });
            // prevent video from playing
            try {
                video.pause();
            }
            catch (e) { }
            // prevent video from loading
            try {
                video.src = "";
            }
            catch (e) { }
        });
        video.addEventListener("error", (error) => {
            reject(Error(`failed fetching video dimensions for url '${url}'`));
        });
        // max loading time
        const timeout = 30000;
        setTimeout(() => reject(Error(`failed fetching video dimensions for url '${url}' timeout '${timeout}'`)), timeout);
        // start loading
        video.src = url;
    });
    const fetchAudio = (url) => new Promise((resolve, reject) => {
        const audio = document.createElement("audio");
        audio.addEventListener("loadeddata", () => {
            resolve({
                linkHtmlTagName: "audio",
            });
            try {
                audio.pause();
            }
            catch (_a) { }
            try {
                audio.src = "";
            }
            catch (_b) { }
        });
        audio.addEventListener("error", () => reject(Error(`failed fetching audio html tag name for url '${url}'`)));
        const timeout = 20000;
        setTimeout(() => reject(Error(`failed fetching audio html tag name for url '${url}' timeout '${timeout}'`)), timeout);
        audio.src = url;
    });
    try {
        if (new URL(link).protocol !== "https:") {
            throw Error(`failed fetching comment.link dimensions for link '${link}' not https protocol`);
        }
        const dimensions = yield promiseAny([
            fetchImageDimensions(link),
            fetchVideoDimensions(link),
            fetchAudio(link),
        ]);
        return dimensions;
    }
    catch (error) {
        log.error("fetchCommentLinkDimensions error", { error, link });
        return {};
    }
});
export const getInitAccountCommentsToUpdate = (accountsComments) => {
    const accountCommentsToUpdate = [];
    for (const accountId in accountsComments) {
        for (const accountComment of accountsComments[accountId]) {
            accountCommentsToUpdate.push({ accountComment, accountId });
        }
    }
    // update newer comments first, more likely to have notifications
    accountCommentsToUpdate.sort((a, b) => b.accountComment.timestamp - a.accountComment.timestamp);
    // updating too many comments during init slows down fetching comments/subs
    if (accountCommentsToUpdate.length > 10) {
        accountCommentsToUpdate.length = 10;
    }
    // TODO: add some algo to fetch all notifications (even old), but not on init
    // during downtimes when we're not fetching anything else
    return accountCommentsToUpdate;
};
export const getAccountCommentDepth = (comment) => {
    var _a, _b, _c;
    if (!comment.parentCid) {
        return 0;
    }
    let parentCommentDepth = (_a = commentsStore.getState().comments[comment.parentCid]) === null || _a === void 0 ? void 0 : _a.depth;
    if (typeof parentCommentDepth === "number") {
        return parentCommentDepth + 1;
    }
    parentCommentDepth = (_b = repliesPagesStore.getState().comments[comment.parentCid]) === null || _b === void 0 ? void 0 : _b.depth;
    if (typeof parentCommentDepth === "number") {
        return parentCommentDepth + 1;
    }
    parentCommentDepth = (_c = communitiesPagesStore.getState().comments[comment.parentCid]) === null || _c === void 0 ? void 0 : _c.depth;
    if (typeof parentCommentDepth === "number") {
        return parentCommentDepth + 1;
    }
    // if can't find the parent comment depth anywhere, don't include it with the account comment
    // it will be added automatically when challenge verification is received
};
export const addShortAddressesToAccountComment = (comment) => {
    comment = Object.assign({}, comment);
    try {
        comment.shortCommunityAddress = PkcJs.PKC.getShortAddress({
            address: comment.communityAddress,
        });
    }
    catch (e) { }
    try {
        comment.author = Object.assign({}, comment.author);
        comment.author.shortAddress = PkcJs.PKC.getShortAddress({
            address: comment.author.address,
        });
    }
    catch (e) { }
    return comment;
};
const utils = {
    getAccountCommunities,
    getCommentCidsToAccountsComments,
    getAccountCommentsIndex,
    getAccountsCommentsIndexes,
    sanitizeAccountCommentForState,
    sanitizeStoredAccountComment,
    getAccountEditPropertySummary,
    getAccountsEditsSummary,
    fetchCommentLinkDimensions,
    getInitAccountCommentsToUpdate,
    getAccountCommentDepth,
    addShortAddressesToAccountComment,
    promiseAny,
};
export default utils;
//# sourceMappingURL=utils.js.map