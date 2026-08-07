var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import PkcJs from "../../lib/pkc-js/index.js";
import validator from "../../lib/validator.js";
import chain from "../../lib/chain/index.js";
import { v4 as uuid } from "uuid";
import accountsDatabase from "./accounts-database.js";
import { getPkcClientOptions, normalizeAccountProtocolConfig, withProtocolAliases, } from "../../lib/pkc-compat.js";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
export const DEFAULT_ETH_RPC_URL = "https://ethereum-rpc.publicnode.com";
export const DEFAULT_ETH_RPC_URLS = [
    DEFAULT_ETH_RPC_URL,
    "https://eth.drpc.org",
    "https://ethereum.publicnode.com",
    "https://rpc.mevblocker.io",
    "https://1rpc.io/eth",
    "https://eth-pokt.nodies.app",
];
export const DEFAULT_HTTP_ROUTER_URLS = [
    "https://peers.pleb.bot",
    "https://routing.lol",
    "https://peers.forumindex.com",
    "https://peers.plebpubsub.xyz",
    "https://routerofbitsocial.xyz",
    "https://bsotracker.online",
];
// default chain providers
const chainProviders = {
    eth: {
        // Use explicit RPCs for default name resolution; viem's default transport is opt-in.
        urls: [...DEFAULT_ETH_RPC_URLS, "ethers.js"],
        chainId: 1,
    },
    matic: {
        urls: ["https://polygon-rpc.com"],
        chainId: 137,
    },
};
// force using these options or can cause bugs
export const overwritePkcOptions = {
    resolveAuthorNames: false,
    resolveAuthorAddresses: false,
    validatePages: false,
};
const aliasProtocolOptions = (options) => {
    var _a, _b, _c, _d;
    return (Object.assign(Object.assign({}, options), { resolveAuthorNames: (_b = (_a = options.resolveAuthorNames) !== null && _a !== void 0 ? _a : options.resolveAuthorAddresses) !== null && _b !== void 0 ? _b : false, resolveAuthorAddresses: (_d = (_c = options.resolveAuthorAddresses) !== null && _c !== void 0 ? _c : options.resolveAuthorNames) !== null && _d !== void 0 ? _d : false }));
};
const addMissingChainProviders = (options) => {
    const optionsWithChainProviders = Object.assign({}, options);
    if (!optionsWithChainProviders.chainProviders) {
        optionsWithChainProviders.chainProviders = {};
    }
    for (const chainTicker in chainProviders) {
        if (!optionsWithChainProviders.chainProviders[chainTicker]) {
            optionsWithChainProviders.chainProviders[chainTicker] = chainProviders[chainTicker];
        }
    }
    return optionsWithChainProviders;
};
export const getDefaultChainProviders = () => {
    // @ts-ignore
    const defaultWindowOptions = window.defaultPkcOptions;
    const windowChainProviders = (defaultWindowOptions === null || defaultWindowOptions === void 0 ? void 0 : defaultWindowOptions.chainProviders)
        ? JSON.parse(JSON.stringify(defaultWindowOptions.chainProviders))
        : undefined;
    return addMissingChainProviders({
        chainProviders: windowChainProviders,
    }).chainProviders;
};
// default options aren't saved to database so they can be changed
export const getDefaultPkcOptions = () => {
    // default PKC options defined by the electron process
    // @ts-ignore
    const defaultWindowOptions = window.defaultPkcOptions;
    if (defaultWindowOptions) {
        // @ts-ignore
        const defaultPkcOptions = JSON.parse(JSON.stringify(Object.assign(Object.assign({}, defaultWindowOptions), { libp2pJsClientsOptions: undefined })));
        delete defaultPkcOptions.chainProviders;
        delete defaultPkcOptions.nameResolversChainProviders;
        // @ts-ignore
        defaultPkcOptions.libp2pJsClientsOptions = defaultWindowOptions.libp2pJsClientsOptions; // libp2pJsClientsOptions is not always just json
        return aliasProtocolOptions(Object.assign(Object.assign({}, defaultPkcOptions), overwritePkcOptions));
    }
    // default PKC options for web client
    return aliasProtocolOptions(Object.assign({ libp2pJsClientsOptions: [{ key: "libp2pjs" }], ipfsGatewayUrls: undefined, kuboRpcClientsOptions: undefined, pubsubKuboRpcClientsOptions: undefined, httpRoutersOptions: [...DEFAULT_HTTP_ROUTER_URLS] }, overwritePkcOptions));
};
// the gateway to use in <img src> for nft avatars
// @ts-ignore
const defaultMediaIpfsGatewayUrl = window.defaultMediaIpfsGatewayUrl || "https://ipfs.io";
export const getDefaultAccountFields = () => ({
    subscriptions: [],
    blockedAddresses: {},
    blockedCids: {},
    communities: {},
    mediaIpfsGatewayUrl: defaultMediaIpfsGatewayUrl,
});
const generateDefaultAccount = () => __awaiter(void 0, void 0, void 0, function* () {
    const pkcOptions = getDefaultPkcOptions();
    const chainProviders = getDefaultChainProviders();
    const pkc = yield PkcJs.PKC(getPkcClientOptions({
        chainProviders,
        pkcOptions,
    }, pkcOptions));
    // handle errors or error events are uncaught
    // no need to log them because pkc-js already logs them
    pkc.on("error", (error) => log.error("uncaught pkc instance error, should never happen", { error }));
    const signer = yield pkc.createSigner();
    const author = {
        address: signer.address,
        wallets: {
            eth: yield chain.getEthWalletFromPkcPrivateKey(signer.privateKey, signer.address),
        },
    };
    const accountName = yield getNextAvailableDefaultAccountName();
    // communities where the account has a role, like moderator, admin, owner, etc.
    const communities = {};
    const account = normalizeAccountProtocolConfig(withProtocolAliases(Object.assign(Object.assign({ id: uuid(), version: accountsDatabase.accountVersion, name: accountName, author,
        signer,
        chainProviders,
        pkcOptions }, getDefaultAccountFields()), { communities }), pkc, pkcOptions), chainProviders);
    return account;
});
const getNextAvailableDefaultAccountName = () => __awaiter(void 0, void 0, void 0, function* () {
    const accountIds = yield accountsDatabase.accountsMetadataDatabase.getItem("accountIds");
    const accountNames = [];
    if (accountIds === null || accountIds === void 0 ? void 0 : accountIds.length) {
        const accounts = yield accountsDatabase.getAccounts(accountIds);
        for (const accountId of accountIds) {
            accountNames.push(accounts[accountId].name);
        }
    }
    let accountNumber = 1;
    if (!(accountNames === null || accountNames === void 0 ? void 0 : accountNames.length)) {
        return `Account ${accountNumber}`;
    }
    validator.validateAccountsDatabaseAccountNames(accountNames);
    const accountNamesSet = new Set(accountNames);
    while (true) {
        const accountName = `Account ${accountNumber}`;
        if (!accountNamesSet.has(accountName)) {
            return accountName;
        }
        accountNumber++;
    }
});
const accountGenerator = {
    generateDefaultAccount,
    getDefaultAccountFields,
    getDefaultPkcOptions,
};
export default accountGenerator;
//# sourceMappingURL=account-generator.js.map