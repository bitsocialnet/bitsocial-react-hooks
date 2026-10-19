var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import assert from "../assert.js";
import QuickLru from "quick-lru";
import Logger from "@pkcprotocol/pkc-logger";
import { areEquivalentCommunityAddresses } from "../community-address.js";
import { getCommentCommunityAddress, normalizePublicationOptionsForStore } from "../pkc-compat.js";
import { getPageRpcClients } from "../pkc-compat.js";
const log = Logger("bitsocial-react-hooks:utils");
const merge = (...args) => {
    // @ts-ignore
    const clonedArgs = args.map((arg) => {
        assert(arg && typeof arg === "object", `utils.merge argument '${arg}' not an object`);
        return clone(arg);
    });
    const mergedObj = {};
    while (clonedArgs.length) {
        const currentArg = clonedArgs.shift();
        for (const i in currentArg) {
            if (currentArg[i] === undefined || currentArg[i] === null) {
                continue;
            }
            mergedObj[i] = currentArg[i];
        }
    }
    return mergedObj;
};
const clone = (obj) => {
    var _a, _b;
    assert(obj && typeof obj === "object", `utils.clone argument '${obj}' not an object`);
    let clonedObj = {};
    // clean the object to be cloned
    for (const i in obj) {
        // remove functions
        if (typeof obj[i] === "function") {
            continue;
        }
        // remove internal props
        if (i.startsWith("_")) {
            continue;
        }
        if (obj[i] === undefined || obj[i] === null) {
            continue;
        }
        // pkc-js has a bug where pkc instances have circular deps
        if (((_b = (_a = obj[i]) === null || _a === void 0 ? void 0 : _a.constructor) === null || _b === void 0 ? void 0 : _b.name) === "PKC") {
            continue;
        }
        clonedObj[i] = obj[i];
    }
    // clone the object
    clonedObj = JSON.parse(JSON.stringify(clonedObj));
    return clonedObj;
};
// this function should not clone the comments to not waste memory
export const flattenCommentsPages = (pageInstanceOrPagesInstance) => {
    var _a, _b;
    const flattenedComments = [];
    // if is a Page instance
    if (pageInstanceOrPagesInstance === null || pageInstanceOrPagesInstance === void 0 ? void 0 : pageInstanceOrPagesInstance.comments) {
        for (const comment of pageInstanceOrPagesInstance.comments) {
            flattenedComments.push(comment);
            if (((_a = comment.replies) === null || _a === void 0 ? void 0 : _a.pages) && Object.keys(comment.replies.pages).length) {
                flattenedComments.push(...flattenCommentsPages(comment.replies));
            }
        }
    }
    // if is a Pages instance
    else if (pageInstanceOrPagesInstance === null || pageInstanceOrPagesInstance === void 0 ? void 0 : pageInstanceOrPagesInstance.pages) {
        for (const sortType in pageInstanceOrPagesInstance.pages) {
            flattenedComments.push(...flattenCommentsPages(pageInstanceOrPagesInstance.pages[sortType]));
        }
    }
    // if is a Pages.pages instance
    else {
        for (const sortType in pageInstanceOrPagesInstance) {
            const page = pageInstanceOrPagesInstance[sortType];
            if ((_b = page === null || page === void 0 ? void 0 : page.comments) === null || _b === void 0 ? void 0 : _b.length) {
                flattenedComments.push(...flattenCommentsPages(page));
            }
        }
    }
    // remove duplicate comments
    const flattenedCommentsObject = {};
    for (const comment of flattenedComments) {
        // @ts-ignore
        flattenedCommentsObject[comment.cid] = comment;
    }
    const uniqueFlattened = [];
    for (const cid in flattenedCommentsObject) {
        // @ts-ignore
        uniqueFlattened.push(flattenedCommentsObject[cid]);
    }
    return uniqueFlattened;
};
const memo = (functionToMemo, memoOptions) => {
    assert(typeof functionToMemo === "function", `memo first argument must be a function`);
    const pendingPromises = new Map();
    const cache = new QuickLru(memoOptions);
    // preserve function name
    const memoedFunctionName = functionToMemo.name || "memoedFunction";
    const obj = {
        [memoedFunctionName]: (...args) => __awaiter(void 0, void 0, void 0, function* () {
            let cacheKey = args[0];
            if (args.length > 1) {
                cacheKey = "";
                for (const arg of args) {
                    if (typeof arg !== "string" &&
                        typeof arg !== "number" &&
                        arg !== undefined &&
                        arg !== null) {
                        const argumentIndex = args.indexOf(arg);
                        throw Error(`memoed function '${memoedFunctionName}' invalid argument number '${argumentIndex}' '${arg}', memoed function can only use multiple arguments if they are all of type string, number, undefined or null`);
                    }
                    cacheKey += arg;
                }
            }
            // has cached result
            const cached = cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            // don't request the same thing twice if fetching is pending
            let pendingPromise = pendingPromises.get(cacheKey);
            if (pendingPromise) {
                return pendingPromise;
            }
            // create the pending promise
            let resolve, reject;
            pendingPromise = new Promise((_resolve, _reject) => {
                resolve = _resolve;
                reject = _reject;
            });
            pendingPromises.set(cacheKey, pendingPromise);
            // execute the function
            try {
                const result = yield functionToMemo(...args);
                cache.set(cacheKey, result);
                pendingPromises.delete(cacheKey);
                resolve === null || resolve === void 0 ? void 0 : resolve(result);
            }
            catch (error) {
                pendingPromises.delete(cacheKey);
                reject === null || reject === void 0 ? void 0 : reject(error);
            }
            return pendingPromise;
        }),
    };
    return obj[memoedFunctionName];
};
const memoSync = (functionToMemo, memoOptions) => {
    assert(typeof functionToMemo === "function", `memo first argument must be a function`);
    const cache = new QuickLru(memoOptions);
    // preserve function name
    const memoedFunctionName = functionToMemo.name || "memoedFunction";
    const obj = {
        [memoedFunctionName]: (...args) => {
            let cacheKey = args[0];
            if (args.length > 1) {
                cacheKey = "";
                for (const arg of args) {
                    if (typeof arg !== "string" &&
                        typeof arg !== "number" &&
                        arg !== undefined &&
                        arg !== null) {
                        const argumentIndex = args.indexOf(arg);
                        throw Error(`memoed function '${memoedFunctionName}' invalid argument number '${argumentIndex}' '${arg}', memoed function can only use multiple arguments if they are all of type string, number, undefined or null`);
                    }
                    cacheKey += arg;
                }
            }
            // has cached result
            const cached = cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            // execute the function
            const result = functionToMemo(...args);
            if (typeof (result === null || result === void 0 ? void 0 : result.then) === "function") {
                throw Error(`memoed function '${memoedFunctionName}' is an async function, cannot be used with memoSync, use memo instead`);
            }
            cache.set(cacheKey, result);
            return result;
        },
    };
    return obj[memoedFunctionName];
};
const clientsOnStateChange = (clients, onStateChange) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.ipfsGateways) {
        (_a = clients === null || clients === void 0 ? void 0 : clients.ipfsGateways) === null || _a === void 0 ? void 0 : _a[clientUrl].on("statechange", (state) => onStateChange(state, "ipfsGateways", clientUrl));
    }
    for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.kuboRpcClients) {
        (_b = clients === null || clients === void 0 ? void 0 : clients.kuboRpcClients) === null || _b === void 0 ? void 0 : _b[clientUrl].on("statechange", (state) => onStateChange(state, "kuboRpcClients", clientUrl));
    }
    for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.pubsubKuboRpcClients) {
        (_c = clients === null || clients === void 0 ? void 0 : clients.pubsubKuboRpcClients) === null || _c === void 0 ? void 0 : _c[clientUrl].on("statechange", (state) => onStateChange(state, "pubsubKuboRpcClients", clientUrl));
    }
    const rpcClients = getPageRpcClients(clients);
    for (const clientUrl in rpcClients) {
        rpcClients === null || rpcClients === void 0 ? void 0 : rpcClients[clientUrl].on("statechange", (state) => onStateChange(state, "pkcRpcClients", clientUrl));
    }
    for (const clientUrl in clients === null || clients === void 0 ? void 0 : clients.libp2pJsClients) {
        (_d = clients === null || clients === void 0 ? void 0 : clients.libp2pJsClients) === null || _d === void 0 ? void 0 : _d[clientUrl].on("statechange", (state) => onStateChange(state, "libp2pJsClients", clientUrl));
    }
    for (const chainTicker in clients === null || clients === void 0 ? void 0 : clients.chainProviders) {
        for (const clientUrl in (_e = clients === null || clients === void 0 ? void 0 : clients.chainProviders) === null || _e === void 0 ? void 0 : _e[chainTicker]) {
            (_g = (_f = clients === null || clients === void 0 ? void 0 : clients.chainProviders) === null || _f === void 0 ? void 0 : _f[chainTicker]) === null || _g === void 0 ? void 0 : _g[clientUrl].on("statechange", (state) => onStateChange(state, "chainProviders", clientUrl, chainTicker));
        }
    }
    for (const resolverKey in clients === null || clients === void 0 ? void 0 : clients.nameResolvers) {
        (_h = clients === null || clients === void 0 ? void 0 : clients.nameResolvers) === null || _h === void 0 ? void 0 : _h[resolverKey].on("statechange", (state) => onStateChange(state, "nameResolvers", resolverKey));
    }
};
const pageClientsOnStateChange = (clients, onStateChange) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    for (const sortType in clients === null || clients === void 0 ? void 0 : clients.ipfsGateways) {
        for (const clientUrl in (_a = clients === null || clients === void 0 ? void 0 : clients.ipfsGateways) === null || _a === void 0 ? void 0 : _a[sortType]) {
            (_c = (_b = clients === null || clients === void 0 ? void 0 : clients.ipfsGateways) === null || _b === void 0 ? void 0 : _b[sortType]) === null || _c === void 0 ? void 0 : _c[clientUrl].on("statechange", (state) => onStateChange(state, "ipfsGateways", sortType, clientUrl));
        }
    }
    for (const sortType in clients === null || clients === void 0 ? void 0 : clients.kuboRpcClients) {
        for (const clientUrl in (_d = clients === null || clients === void 0 ? void 0 : clients.kuboRpcClients) === null || _d === void 0 ? void 0 : _d[sortType]) {
            (_f = (_e = clients === null || clients === void 0 ? void 0 : clients.kuboRpcClients) === null || _e === void 0 ? void 0 : _e[sortType]) === null || _f === void 0 ? void 0 : _f[clientUrl].on("statechange", (state) => onStateChange(state, "kuboRpcClients", sortType, clientUrl));
        }
    }
    const rpcPageClients = getPageRpcClients(clients);
    for (const sortType in rpcPageClients) {
        for (const clientUrl in rpcPageClients === null || rpcPageClients === void 0 ? void 0 : rpcPageClients[sortType]) {
            (_g = rpcPageClients === null || rpcPageClients === void 0 ? void 0 : rpcPageClients[sortType]) === null || _g === void 0 ? void 0 : _g[clientUrl].on("statechange", (state) => onStateChange(state, "pkcRpcClients", sortType, clientUrl));
        }
    }
    for (const sortType in clients === null || clients === void 0 ? void 0 : clients.libp2pJsClients) {
        for (const clientUrl in (_h = clients === null || clients === void 0 ? void 0 : clients.libp2pJsClients) === null || _h === void 0 ? void 0 : _h[sortType]) {
            (_k = (_j = clients === null || clients === void 0 ? void 0 : clients.libp2pJsClients) === null || _j === void 0 ? void 0 : _j[sortType]) === null || _k === void 0 ? void 0 : _k[clientUrl].on("statechange", (state) => onStateChange(state, "libp2pJsClients", sortType, clientUrl));
        }
    }
};
export const communityPostsCacheExpired = (community) => {
    // NOTE: fetchedAt is undefined on owner communities
    if (!community || community.fetchedAt == null) {
        return false;
    }
    // if community cache is older than 1 hour, its community.posts are considered expired
    const oneHourAgo = Date.now() / 1000 - 60 * 60;
    return oneHourAgo > community.fetchedAt;
};
export const removeInvalidComments = (comments_1, _a, pkc_1) => __awaiter(void 0, [comments_1, _a, pkc_1], void 0, function* (comments, { validateReplies, blockCommunity }, pkc) {
    if (!comments.length) {
        return [];
    }
    const isValid = yield Promise.all(comments.map((comment) => commentIsValid(comment, { validateReplies, blockCommunity }, pkc)));
    const validComments = comments.filter((_, i) => isValid[i]);
    return validComments;
});
const communitiesWithInvalidComments = {};
export const commentIsValid = (comment_1, ...args_1) => __awaiter(void 0, [comment_1, ...args_1], void 0, function* (comment, { validateReplies, blockCommunity } = {}, pkc) {
    validateReplies = Boolean(validateReplies);
    if (blockCommunity === undefined || blockCommunity === null) {
        blockCommunity = true;
    }
    if (!comment) {
        return false;
    }
    if (communitiesWithInvalidComments[comment.communityAddress]) {
        console.log(`community '${comment.communityAddress}' had an invalid comment, invalidate all its future comments to avoid wasting resources`);
        return false;
    }
    try {
        yield pkc.validateComment(comment, { validateReplies });
    }
    catch (e) {
        if (blockCommunity) {
            communitiesWithInvalidComments[comment.communityAddress] = true;
        }
        console.log("invalid comment", { comment, error: e });
        return false;
    }
    return true;
});
const repliesAreValid = (comment_1, ...args_1) => __awaiter(void 0, [comment_1, ...args_1], void 0, function* (comment, { validateReplies, blockCommunity } = {}, pkc) {
    var _a;
    validateReplies = Boolean(validateReplies);
    if (blockCommunity === undefined || blockCommunity === null) {
        blockCommunity = true;
    }
    if (!comment) {
        return false;
    }
    const commentCommunityAddress = getCommentCommunityAddress(comment);
    if (commentCommunityAddress && communitiesWithInvalidComments[commentCommunityAddress]) {
        console.log(`community '${commentCommunityAddress}' had an invalid comment, invalidate all its future comments to avoid wasting resources`);
        return false;
    }
    const replyPageArray = Object.values(((_a = comment.replies) === null || _a === void 0 ? void 0 : _a.pages) || {});
    const replies = replyPageArray.flatMap((replyPage) => (replyPage === null || replyPage === void 0 ? void 0 : replyPage.comments) || []);
    const normalizedReplies = replies.map((reply) => {
        const normalizedReply = normalizePublicationOptionsForStore(reply);
        normalizedReply.communityAddress =
            getCommentCommunityAddress(normalizedReply) || commentCommunityAddress;
        return normalizedReply;
    });
    // manual validation
    for (const reply of normalizedReplies) {
        if (!areEquivalentCommunityAddresses(getCommentCommunityAddress(reply), commentCommunityAddress) ||
            reply.depth !== comment.depth + 1 ||
            reply.parentCid !== comment.cid) {
            if (blockCommunity && commentCommunityAddress) {
                communitiesWithInvalidComments[commentCommunityAddress] = true;
            }
            console.log("invalid comment", {
                comment: reply,
                error: "!areEquivalentCommunityAddresses(reply.communityAddress, comment.communityAddress) || reply.depth !== comment.depth + 1 || reply.parentCid !== comment.cid",
            });
            return false;
        }
    }
    // signature verification
    try {
        const promises = normalizedReplies.map((reply) => commentIsValid(reply, { validateReplies: false, blockCommunity: true }, pkc));
        yield Promise.all(promises);
    }
    catch (e) {
        if (blockCommunity && commentCommunityAddress) {
            communitiesWithInvalidComments[commentCommunityAddress] = true;
        }
        console.log("invalid comment", { comment, error: e });
        return false;
    }
    return true;
});
const utils = {
    merge,
    clone,
    flattenCommentsPages,
    memo,
    memoSync,
    retryInfinity: (f, o) => { },
    // export timeout values to mock them in tests
    retryInfinityMinTimeout: 1000,
    retryInfinityMaxTimeout: 1000 * 60 * 60 * 24,
    clientsOnStateChange,
    pageClientsOnStateChange,
    communityPostsCacheExpired,
    commentIsValid,
    removeInvalidComments,
    repliesAreValid,
};
const retryInfinity = (functionToRetry, options) => __awaiter(void 0, void 0, void 0, function* () {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let attempt = 0;
    while (true) {
        try {
            const res = yield functionToRetry();
            return res;
        }
        catch (e) {
            options === null || options === void 0 ? void 0 : options.onError(e || Error(`retryInfinity failed attempt ${attempt}`));
            const factor = 2;
            let timeout = Math.round(utils.retryInfinityMinTimeout * Math.pow(factor, attempt++));
            timeout = Math.min(timeout, utils.retryInfinityMaxTimeout);
            yield sleep(timeout);
        }
    }
});
utils.retryInfinity = retryInfinity;
export default utils;
//# sourceMappingURL=utils.js.map