var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import assert from "./assert.js";
export const getPkcCreateCommunity = (pkc) => pkc === null || pkc === void 0 ? void 0 : pkc.createCommunity;
export const getPkcGetCommunity = (pkc) => pkc === null || pkc === void 0 ? void 0 : pkc.getCommunity;
export const getPkcCreateCommunityEdit = (pkc) => pkc === null || pkc === void 0 ? void 0 : pkc.createCommunityEdit;
// pkc-js >= 0.0.129 lists communities as { name?, publicKey, address, started } entries, where address is
// computed like community.address. older pkc-js listed address strings
export const getPkcCommunityAddresses = (pkc) => {
    if (!Array.isArray(pkc === null || pkc === void 0 ? void 0 : pkc.communities)) {
        return [];
    }
    return pkc.communities
        .map((entry) => (typeof entry === "string" ? entry : entry === null || entry === void 0 ? void 0 : entry.address))
        .filter((address) => typeof address === "string");
};
export const normalizePublicationOptionsForPkc = (_pkc, options) => options;
export const normalizePublicationOptionsForStore = (options) => options;
export const normalizeCommunityEditOptionsForPkc = (pkc, options) => {
    const normalized = normalizePublicationOptionsForPkc(pkc, options);
    const editOptions = normalized.communityEdit;
    if (!editOptions) {
        return normalized;
    }
    normalized.communityEdit = editOptions;
    return normalized;
};
export const getCommentCommunityAddress = (comment) => comment === null || comment === void 0 ? void 0 : comment.communityAddress;
const isLiveCommentInstance = (comment) => typeof (comment === null || comment === void 0 ? void 0 : comment.on) === "function" ||
    typeof (comment === null || comment === void 0 ? void 0 : comment.once) === "function" ||
    typeof (comment === null || comment === void 0 ? void 0 : comment.update) === "function";
export const normalizeCommentCommunityAddress = (comment) => {
    if (!comment || comment.communityAddress) {
        return comment;
    }
    return isLiveCommentInstance(comment) ? comment : Object.assign({}, comment);
};
export const backfillPublicationCommunityAddress = (publication, options) => {
    if (!publication || publication.communityAddress) {
        return publication;
    }
    const communityAddress = options === null || options === void 0 ? void 0 : options.communityAddress;
    if (!communityAddress) {
        return publication;
    }
    publication.communityAddress = communityAddress;
    return publication;
};
export const createPkcCommunity = (pkc, options) => __awaiter(void 0, void 0, void 0, function* () {
    const createCommunity = getPkcCreateCommunity(pkc);
    assert(typeof createCommunity === "function", "pkc createCommunity missing");
    return createCommunity.call(pkc, options);
});
export const getPkcCommunity = (pkc, options) => __awaiter(void 0, void 0, void 0, function* () {
    const getCommunity = getPkcGetCommunity(pkc);
    assert(typeof getCommunity === "function", "pkc getCommunity missing");
    return getCommunity.call(pkc, options);
});
export const createPkcCommunityEdit = (pkc, options) => __awaiter(void 0, void 0, void 0, function* () {
    const createCommunityEdit = getPkcCreateCommunityEdit(pkc);
    assert(typeof createCommunityEdit === "function", "pkc createCommunityEdit missing");
    return createCommunityEdit.call(pkc, options);
});
//# sourceMappingURL=protocol-compat.js.map