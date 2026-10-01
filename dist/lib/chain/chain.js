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
import utils from "../utils/index.js";
// ethers and viem are large and only needed once an author wallet, NFT avatar, or ENS record is
// used, so they load on demand instead of with the hooks that apps import at startup. Every
// function below that uses `ethers` awaits loadEthers() first.
let ethers;
const loadEthers = () => __awaiter(void 0, void 0, void 0, function* () {
    ethers || (ethers = (yield import("ethers")).ethers);
    return ethers;
});
// Account setup needs ethers (the author's eth wallet) and bso-resolver (the PKC client's name
// resolvers) as soon as pkc-js loads. Starting both downloads when the accounts store initializes
// loads them alongside pkc-js instead of one after another, without blocking the app's first render.
export const preloadAccountChainLibraries = () => {
    loadEthers().catch(() => { });
    import("@bitsocial/bso-resolver").catch(() => { });
};
// NOTE: getNftImageUrl tests are skipped, if changes are made they must be tested manually
const getNftImageUrlNoCache = (nftMetadataUrl, ipfsGatewayUrl) => __awaiter(void 0, void 0, void 0, function* () {
    assert(nftMetadataUrl && typeof nftMetadataUrl === "string", `getNftImageUrl invalid nftMetadataUrl '${nftMetadataUrl}'`);
    assert(ipfsGatewayUrl && typeof ipfsGatewayUrl === "string", `getNftImageUrl invalid ipfsGatewayUrl '${ipfsGatewayUrl}'`);
    let nftImageUrl;
    // if the ipfs file is json, it probably has an 'image' property
    const text = yield fetch(nftMetadataUrl).then((resp) => resp.text());
    try {
        nftImageUrl = JSON.parse(text).image;
    }
    catch (e) {
        // dont throw the json parse error, instead throw the http response
        throw Error(text);
    }
    // if the image property is an ipfs url, get the image url using the ipfs gateway in account settings
    if (nftImageUrl.startsWith("ipfs://")) {
        nftImageUrl = `${ipfsGatewayUrl}/${nftImageUrl.replace("://", "/")}`;
    }
    return nftImageUrl;
});
export const getNftImageUrl = utils.memo(getNftImageUrlNoCache, { maxSize: 5000 });
// NOTE: getNftMetadataUrl tests are skipped, if changes are made they must be tested manually
// don't use objects in arguments for faster caching
const getNftMetadataUrlNoCache = (nftAddress, nftId, chainTicker, chainProviderUrl, chainId, ipfsGatewayUrl) => __awaiter(void 0, void 0, void 0, function* () {
    assert(nftAddress && typeof nftAddress === "string", `getNftMetadataUrl invalid nftAddress '${nftAddress}'`);
    assert(nftId && typeof nftId === "string", `getNftMetadataUrl invalid nftId '${nftId}'`);
    assert(chainTicker && typeof chainTicker === "string", `getNftMetadataUrl invalid chainTicker '${chainTicker}'`);
    assert(chainProviderUrl && typeof chainProviderUrl === "string", `getNftMetadataUrl invalid chainProviderUrl '${chainProviderUrl}'`);
    assert(typeof chainId === "number", `getNftMetadataUrl invalid chainId '${chainId}' not a number`);
    assert(ipfsGatewayUrl && typeof ipfsGatewayUrl === "string", `getNftMetadataUrl invalid ipfsGatewayUrl '${ipfsGatewayUrl}'`);
    yield loadEthers();
    const chainProvider = getChainProvider(chainTicker, chainProviderUrl, chainId);
    const nftContract = new ethers.Contract(nftAddress, nftAbi, chainProvider);
    let nftMetadataUrl = yield nftContract.tokenURI(nftId);
    // if the image property is an ipfs url, get the image url using the ipfs gateway in account settings
    if (nftMetadataUrl.startsWith("ipfs://")) {
        nftMetadataUrl = `${ipfsGatewayUrl}/${nftMetadataUrl.replace("://", "/")}`;
    }
    return nftMetadataUrl;
});
export const getNftMetadataUrl = utils.memo(getNftMetadataUrlNoCache, { maxSize: 5000 });
// don't use objects in arguments for faster caching
const getNftOwnerNoCache = (nftAddress, nftId, chainTicker, chainProviderUrl, chainId) => __awaiter(void 0, void 0, void 0, function* () {
    assert(nftAddress && typeof nftAddress === "string", `getNftOwner invalid nftAddress '${nftAddress}'`);
    assert(nftId && typeof nftId === "string", `getNftOwner invalid nftId '${nftId}'`);
    assert(chainTicker && typeof chainTicker === "string", `getNftOwner invalid chainTicker '${chainTicker}'`);
    assert(chainProviderUrl && typeof chainProviderUrl === "string", `getNftOwner invalid chainProviderUrl '${chainProviderUrl}'`);
    assert(typeof chainId === "number", `getNftOwner invalid chainId '${chainId}' not a number`);
    yield loadEthers();
    const chainProvider = getChainProvider(chainTicker, chainProviderUrl, chainId);
    const nftContract = new ethers.Contract(nftAddress, nftAbi, chainProvider);
    const currentNftOwnerAddress = yield nftContract.ownerOf(nftId);
    return currentNftOwnerAddress;
});
export const getNftOwner = utils.memo(getNftOwnerNoCache, {
    maxSize: 5000,
    maxAge: 1000 * 60 * 60 * 24,
});
const resolveEnsTxtRecordNoCache = (ensName, txtRecordName, chainTicker, chainProviderUrl, chainId) => __awaiter(void 0, void 0, void 0, function* () {
    yield loadEthers();
    const chainProvider = getChainProvider(chainTicker, chainProviderUrl, chainId);
    const resolver = yield chainProvider.getResolver(ensName);
    if (!resolver) {
        throw Error(`name not registered or network error`);
    }
    const txtRecordResult = yield resolver.getText(txtRecordName);
    return txtRecordResult;
});
export const resolveEnsTxtRecord = utils.memo(resolveEnsTxtRecordNoCache, {
    maxSize: 10000,
    maxAge: 1000 * 60 * 60 * 24,
});
// cache the chain providers because only 1 should be running at the same time
const getChainProviderNoCache = (chainTicker, chainProviderUrl, chainId) => {
    if (chainTicker === "eth") {
        // if using eth, use ethers' default provider unless another provider is specified
        if (!chainProviderUrl || chainProviderUrl === "ethers.js") {
            return ethers.getDefaultProvider();
        }
    }
    if (!chainProviderUrl) {
        throw Error(`getChainProvider invalid chainProviderUrl '${chainProviderUrl}'`);
    }
    if (!chainId && chainId !== 0) {
        throw Error(`getChainProvider invalid chainId '${chainId}'`);
    }
    return new ethers.providers.JsonRpcProvider({ url: chainProviderUrl }, chainId);
};
const getChainProvider = utils.memoSync(getChainProviderNoCache, { maxSize: 1000 });
const nftAbi = [
    {
        inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
        name: "tokenURI",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
        name: "ownerOf",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
];
export const getWalletMessageToSign = (authorAddress, timestamp) => {
    // use plain JSON so the user can read what he's signing
    // property names must always be in this order for signature to match so don't use JSON.stringify
    return `{"domainSeparator":"pkc-author-wallet","authorAddress":"${authorAddress}","timestamp":${timestamp}}`;
};
export const getEthWalletFromPkcPrivateKey = (privateKeyBase64, authorAddress) => __awaiter(void 0, void 0, void 0, function* () {
    // ignore private key used in pkc-js signer mock so tests run faster, also make sure nobody uses it
    if (privateKeyBase64 === "private key") {
        return;
    }
    const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
    if (privateKeyBytes.length !== 32) {
        throw Error("failed getting eth address from private key not 32 bytes");
    }
    yield loadEthers();
    const publicKeyHex = ethers.utils.computePublicKey(privateKeyBytes, false);
    const privateKeyHex = ethers.utils.hexlify(privateKeyBytes);
    const ethAddress = ethers.utils.computeAddress(publicKeyHex);
    // generate signature
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = yield new ethers.Wallet(privateKeyHex).signMessage(getWalletMessageToSign(authorAddress, timestamp));
    return { address: ethAddress, timestamp, signature: { signature, type: "eip191" } };
});
export const getEthPrivateKeyFromPkcPrivateKey = (privateKeyBase64, authorAddress) => __awaiter(void 0, void 0, void 0, function* () {
    // ignore private key used in pkc-js signer mock so tests run faster, also make sure nobody uses it
    if (privateKeyBase64 === "private key") {
        return;
    }
    const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
    if (privateKeyBytes.length !== 32) {
        throw Error("failed getting eth address from private key not 32 bytes");
    }
    yield loadEthers();
    const privateKeyHex = ethers.utils.hexlify(privateKeyBytes);
    return privateKeyHex;
});
export const validateEthWallet = (wallet, authorAddress) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    assert(wallet && typeof wallet === "object", `validateEthWallet invalid wallet argument '${wallet}'`);
    assert(wallet === null || wallet === void 0 ? void 0 : wallet.address, `validateEthWallet invalid wallet.address '${wallet === null || wallet === void 0 ? void 0 : wallet.address}'`);
    assert(typeof (wallet === null || wallet === void 0 ? void 0 : wallet.timestamp) === "number", `validateEthWallet invalid wallet.timestamp '${wallet === null || wallet === void 0 ? void 0 : wallet.timestamp}' not a number`);
    assert(wallet === null || wallet === void 0 ? void 0 : wallet.signature, `validateEthWallet invalid wallet.signature '${wallet === null || wallet === void 0 ? void 0 : wallet.signature}'`);
    assert((_a = wallet === null || wallet === void 0 ? void 0 : wallet.signature) === null || _a === void 0 ? void 0 : _a.signature, `validateEthWallet invalid wallet.signature.signature '${(_b = wallet === null || wallet === void 0 ? void 0 : wallet.signature) === null || _b === void 0 ? void 0 : _b.signature}'`);
    assert(wallet.signature.type === "eip191", `validateEthWallet invalid wallet.signature.type '${(_c = wallet === null || wallet === void 0 ? void 0 : wallet.signature) === null || _c === void 0 ? void 0 : _c.type}'`);
    assert(authorAddress && typeof authorAddress === "string", `validateEthWallet invalid authorAddress '${authorAddress}'`);
    assert((wallet === null || wallet === void 0 ? void 0 : wallet.timestamp) <= Date.now() / 1000, `validateEthWallet invalid wallet.timestamp '${wallet === null || wallet === void 0 ? void 0 : wallet.timestamp}' greater than current Date.now() / 1000`);
    yield loadEthers();
    const signatureAddress = ethers.utils.verifyMessage(getWalletMessageToSign(authorAddress, wallet.timestamp), wallet.signature.signature);
    if (wallet.address.toLowerCase() !== signatureAddress.toLowerCase()) {
        throw Error("wallet address does not equal signature address");
    }
});
export const validateEthWalletViem = (wallet, authorAddress) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    // sanity checks
    assert(wallet && typeof wallet === "object", `validateEthWallet invalid wallet argument '${wallet}'`);
    assert(wallet === null || wallet === void 0 ? void 0 : wallet.address, `validateEthWallet invalid wallet.address '${wallet === null || wallet === void 0 ? void 0 : wallet.address}'`);
    assert(typeof (wallet === null || wallet === void 0 ? void 0 : wallet.timestamp) === "number", `validateEthWallet invalid wallet.timestamp '${wallet === null || wallet === void 0 ? void 0 : wallet.timestamp}' not a number`);
    assert(wallet === null || wallet === void 0 ? void 0 : wallet.signature, `validateEthWallet invalid wallet.signature '${wallet === null || wallet === void 0 ? void 0 : wallet.signature}'`);
    assert((_a = wallet === null || wallet === void 0 ? void 0 : wallet.signature) === null || _a === void 0 ? void 0 : _a.signature, `validateEthWallet invalid wallet.signature.signature '${(_b = wallet === null || wallet === void 0 ? void 0 : wallet.signature) === null || _b === void 0 ? void 0 : _b.signature}'`);
    assert(wallet.signature.type === "eip191", `validateEthWallet invalid wallet.signature.type '${(_c = wallet === null || wallet === void 0 ? void 0 : wallet.signature) === null || _c === void 0 ? void 0 : _c.type}'`);
    assert(authorAddress && typeof authorAddress === "string", `validateEthWallet invalid authorAddress '${authorAddress}'`);
    assert((wallet === null || wallet === void 0 ? void 0 : wallet.timestamp) <= Date.now() / 1000, `validateEthWallet invalid wallet.timestamp '${wallet === null || wallet === void 0 ? void 0 : wallet.timestamp}' greater than current Date.now() / 1000`);
    const { verifyMessage } = yield import("viem");
    const valid = yield verifyMessage({
        address: wallet.address,
        message: getWalletMessageToSign(authorAddress, wallet.timestamp),
        signature: wallet.signature.signature,
    });
    if (!valid) {
        throw Error("wallet address does not equal signature address");
    }
});
export default {
    getNftOwner,
    getNftMetadataUrl,
    getNftImageUrl,
    resolveEnsTxtRecord,
    getEthWalletFromPkcPrivateKey,
    getEthPrivateKeyFromPkcPrivateKey,
    validateEthWallet,
    validateEthWalletViem,
};
//# sourceMappingURL=chain.js.map