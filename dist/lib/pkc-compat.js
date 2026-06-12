var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import assert from "assert";
import { BsoResolver } from "@bitsocial/bso-resolver";
export const getProtocolClient = (account) => account === null || account === void 0 ? void 0 : account.pkc;
export const getProtocolOptions = (account) => account === null || account === void 0 ? void 0 : account.pkcOptions;
export const getChainProviders = (account) => { var _a; return (account === null || account === void 0 ? void 0 : account.chainProviders) || ((_a = getProtocolOptions(account)) === null || _a === void 0 ? void 0 : _a.chainProviders); };
export const getNameResolversChainProviders = (account) => { var _a; return (account === null || account === void 0 ? void 0 : account.nameResolversChainProviders) || ((_a = getProtocolOptions(account)) === null || _a === void 0 ? void 0 : _a.nameResolversChainProviders); };
export const getRpcClients = (protocolClient) => { var _a; return ((_a = protocolClient === null || protocolClient === void 0 ? void 0 : protocolClient.clients) === null || _a === void 0 ? void 0 : _a.pkcRpcClients) || {}; };
export const getPageRpcClients = (clients) => (clients === null || clients === void 0 ? void 0 : clients.pkcRpcClients) || {};
export const getProtocolNameResolverClients = (protocolClient) => {
    var _a, _b, _c;
    return ((_a = protocolClient === null || protocolClient === void 0 ? void 0 : protocolClient.clients) === null || _a === void 0 ? void 0 : _a.nameResolvers) ||
        ((_c = (_b = protocolClient === null || protocolClient === void 0 ? void 0 : protocolClient._clientsManager) === null || _b === void 0 ? void 0 : _b.clients) === null || _c === void 0 ? void 0 : _c.nameResolvers) ||
        {};
};
const isEthAliasDomain = (address) => typeof address === "string" &&
    (address.toLowerCase().endsWith(".eth") || address.toLowerCase().endsWith(".bso"));
const isSupportedBsoResolverProvider = (provider) => provider === "viem" || /^(https?:\/\/|wss?:\/\/)/i.test(provider);
const getNameResolverProviderLabel = (provider) => {
    try {
        return new URL(provider).hostname;
    }
    catch (error) {
        return provider;
    }
};
const getConfiguredEthNameResolverProviders = (account) => {
    var _a, _b, _c, _d;
    const nameResolverUrls = (_b = (_a = getNameResolversChainProviders(account)) === null || _a === void 0 ? void 0 : _a.eth) === null || _b === void 0 ? void 0 : _b.urls;
    const chainProviderUrls = (_d = (_c = getChainProviders(account)) === null || _c === void 0 ? void 0 : _c.eth) === null || _d === void 0 ? void 0 : _d.urls;
    const urls = Array.isArray(nameResolverUrls) && nameResolverUrls.length
        ? nameResolverUrls
        : chainProviderUrls;
    if (!Array.isArray(urls)) {
        return [];
    }
    return urls.filter((provider) => typeof provider === "string" && provider.length > 0);
};
export const getConfiguredNameResolverInfoByKey = (account) => {
    const infoByKey = {};
    for (const provider of getConfiguredEthNameResolverProviders(account)) {
        if (!isSupportedBsoResolverProvider(provider)) {
            continue;
        }
        const providerLabel = getNameResolverProviderLabel(provider);
        const key = `eth-${providerLabel}`;
        if (!infoByKey[key]) {
            infoByKey[key] = {
                key,
                nameSystem: "eth",
                chainTicker: "eth",
                provider,
                providerLabel,
            };
        }
    }
    return infoByKey;
};
export const getMatchingNameResolvers = (account, address) => {
    if (!isEthAliasDomain(address)) {
        return [];
    }
    return Object.values(getConfiguredNameResolverInfoByKey(account));
};
const buildConfiguredNameResolvers = (account, dataPath) => Object.values(getConfiguredNameResolverInfoByKey(account)).map((resolverInfo) => new BsoResolver({
    key: resolverInfo.key,
    provider: resolverInfo.provider,
    dataPath,
}));
const normalizeResolvedAuthorName = (result) => {
    if (typeof result === "string") {
        return result;
    }
    assert(typeof (result === null || result === void 0 ? void 0 : result.resolvedAuthorName) === "string", "protocol client resolveAuthorName returned invalid resolvedAuthorName");
    return result.resolvedAuthorName;
};
export const resolveAuthorNameWithProtocol = (protocolClient, options) => __awaiter(void 0, void 0, void 0, function* () {
    const resolveAuthorName = protocolClient === null || protocolClient === void 0 ? void 0 : protocolClient.resolveAuthorName;
    if (typeof resolveAuthorName === "function") {
        return normalizeResolvedAuthorName(yield resolveAuthorName.call(protocolClient, options));
    }
    const resolveAuthorAddress = protocolClient === null || protocolClient === void 0 ? void 0 : protocolClient.resolveAuthorAddress;
    assert(typeof resolveAuthorAddress === "function", "protocol client resolveAuthorName/resolveAuthorAddress missing");
    return resolveAuthorAddress.call(protocolClient, { address: options.name });
});
export const normalizeOptionsForPkcClient = (options) => {
    if (!options) {
        return options;
    }
    const normalized = Object.assign({}, options);
    if (normalized.resolveAuthorNames == null && normalized.resolveAuthorAddresses != null) {
        normalized.resolveAuthorNames = normalized.resolveAuthorAddresses;
    }
    delete normalized.resolveAuthorAddresses;
    delete normalized.chainProviders;
    delete normalized.nameResolversChainProviders;
    return normalized;
};
export const getPkcClientOptions = (account, options) => {
    const normalized = normalizeOptionsForPkcClient(options);
    if (!normalized) {
        return normalized;
    }
    const nameResolvers = buildConfiguredNameResolvers(account, normalized.dataPath);
    if (nameResolvers.length) {
        normalized.nameResolvers = nameResolvers;
    }
    return normalized;
};
export const normalizeAccountProtocolConfig = (account, defaultChainProviders) => {
    if (!account) {
        return account;
    }
    const nextAccount = Object.assign({}, account);
    const protocolOptions = nextAccount.pkcOptions && typeof nextAccount.pkcOptions === "object"
        ? Object.assign({}, nextAccount.pkcOptions) : nextAccount.pkcOptions;
    const chainProviders = nextAccount.chainProviders || (protocolOptions === null || protocolOptions === void 0 ? void 0 : protocolOptions.chainProviders) || defaultChainProviders;
    if (chainProviders !== undefined) {
        nextAccount.chainProviders = chainProviders;
    }
    if (nextAccount.nameResolversChainProviders === undefined &&
        (protocolOptions === null || protocolOptions === void 0 ? void 0 : protocolOptions.nameResolversChainProviders) !== undefined) {
        nextAccount.nameResolversChainProviders = protocolOptions.nameResolversChainProviders;
    }
    if (protocolOptions && typeof protocolOptions === "object") {
        delete protocolOptions.chainProviders;
        delete protocolOptions.nameResolversChainProviders;
        nextAccount.pkcOptions = protocolOptions;
    }
    return nextAccount;
};
export const withProtocolAliases = (account, protocolClient, protocolOptions) => {
    const nextAccount = Object.assign({}, account);
    if (protocolClient !== undefined) {
        nextAccount.pkc = protocolClient;
    }
    if (protocolOptions !== undefined) {
        nextAccount.pkcOptions = protocolOptions;
    }
    return nextAccount;
};
const publishChallengeAnswersCompatMarker = Symbol.for("bitsocial-react-hooks.publishChallengeAnswersCompat");
export const normalizeChallengeAnswersForPkc = (challengeAnswers) => ({
    challengeAnswers: Array.isArray(challengeAnswers)
        ? challengeAnswers
        : (challengeAnswers === null || challengeAnswers === void 0 ? void 0 : challengeAnswers.challengeAnswers) || [],
});
export const withPublishChallengeAnswersCompat = (publication) => {
    const target = publication;
    if (!target ||
        typeof target.publishChallengeAnswers !== "function" ||
        target[publishChallengeAnswersCompatMarker]) {
        return publication;
    }
    const publishChallengeAnswers = target.publishChallengeAnswers.bind(publication);
    target.publishChallengeAnswers = (challengeAnswers) => publishChallengeAnswers(normalizeChallengeAnswersForPkc(challengeAnswers));
    target[publishChallengeAnswersCompatMarker] = true;
    return publication;
};
export * from "./protocol-compat.js";
//# sourceMappingURL=pkc-compat.js.map