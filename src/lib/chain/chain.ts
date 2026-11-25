import assert from "../assert";
import { Nft, ChainProviders, Wallet } from "../../types";
import utils from "../utils";

// ethers and viem are large and only needed once an author wallet, NFT avatar, or ENS record is
// used, so they load on demand instead of with the hooks that apps import at startup. Every
// function below that uses `ethers` awaits loadEthers() first.
let ethers: typeof import("ethers").ethers;
const loadEthers = async () => {
  ethers ||= (await import("ethers")).ethers;
  return ethers;
};

// The BSIP-22 proof code (noble curves) loads on demand for the same reason.
const loadAuthorWalletProof = () => import("./author-wallet-proof");

// Account setup needs ethers (the author's eth wallet) and bso-resolver (the PKC client's name
// resolvers) as soon as pkc-js loads. Starting both downloads when the accounts store initializes
// loads them alongside pkc-js instead of one after another, without blocking the app's first render.
export const preloadAccountChainLibraries = () => {
  loadEthers().catch(() => {});
  import("@bitsocial/bso-resolver").catch(() => {});
};

// NOTE: getNftImageUrl tests are skipped, if changes are made they must be tested manually
const getNftImageUrlNoCache = async (nftMetadataUrl: string, ipfsGatewayUrl: string) => {
  assert(
    nftMetadataUrl && typeof nftMetadataUrl === "string",
    `getNftImageUrl invalid nftMetadataUrl '${nftMetadataUrl}'`,
  );
  assert(
    ipfsGatewayUrl && typeof ipfsGatewayUrl === "string",
    `getNftImageUrl invalid ipfsGatewayUrl '${ipfsGatewayUrl}'`,
  );

  let nftImageUrl;

  // if the ipfs file is json, it probably has an 'image' property
  const text = await fetch(nftMetadataUrl).then((resp: any) => resp.text());
  try {
    nftImageUrl = JSON.parse(text).image;
  } catch (e) {
    // dont throw the json parse error, instead throw the http response
    throw Error(text);
  }

  // if the image property is an ipfs url, get the image url using the ipfs gateway in account settings
  if (nftImageUrl.startsWith("ipfs://")) {
    nftImageUrl = `${ipfsGatewayUrl}/${nftImageUrl.replace("://", "/")}`;
  }

  return nftImageUrl;
};
export const getNftImageUrl = utils.memo(getNftImageUrlNoCache, { maxSize: 5000 });

// NOTE: getNftMetadataUrl tests are skipped, if changes are made they must be tested manually
// don't use objects in arguments for faster caching
const getNftMetadataUrlNoCache = async (
  nftAddress: string,
  nftId: string,
  chainTicker: string,
  chainProviderUrl: string,
  chainId: number,
  ipfsGatewayUrl: string,
) => {
  assert(
    nftAddress && typeof nftAddress === "string",
    `getNftMetadataUrl invalid nftAddress '${nftAddress}'`,
  );
  assert(nftId && typeof nftId === "string", `getNftMetadataUrl invalid nftId '${nftId}'`);
  assert(
    chainTicker && typeof chainTicker === "string",
    `getNftMetadataUrl invalid chainTicker '${chainTicker}'`,
  );
  assert(
    chainProviderUrl && typeof chainProviderUrl === "string",
    `getNftMetadataUrl invalid chainProviderUrl '${chainProviderUrl}'`,
  );
  assert(
    typeof chainId === "number",
    `getNftMetadataUrl invalid chainId '${chainId}' not a number`,
  );
  assert(
    ipfsGatewayUrl && typeof ipfsGatewayUrl === "string",
    `getNftMetadataUrl invalid ipfsGatewayUrl '${ipfsGatewayUrl}'`,
  );

  await loadEthers();
  const chainProvider = getChainProvider(chainTicker, chainProviderUrl, chainId);
  const nftContract = new ethers.Contract(nftAddress, nftAbi, chainProvider);
  let nftMetadataUrl = await nftContract.tokenURI(nftId);

  // if the image property is an ipfs url, get the image url using the ipfs gateway in account settings
  if (nftMetadataUrl.startsWith("ipfs://")) {
    nftMetadataUrl = `${ipfsGatewayUrl}/${nftMetadataUrl.replace("://", "/")}`;
  }

  return nftMetadataUrl;
};
export const getNftMetadataUrl = utils.memo(getNftMetadataUrlNoCache, { maxSize: 5000 });

// don't use objects in arguments for faster caching
const getNftOwnerNoCache = async (
  nftAddress: string,
  nftId: string,
  chainTicker: string,
  chainProviderUrl: string,
  chainId: number,
) => {
  assert(
    nftAddress && typeof nftAddress === "string",
    `getNftOwner invalid nftAddress '${nftAddress}'`,
  );
  assert(nftId && typeof nftId === "string", `getNftOwner invalid nftId '${nftId}'`);
  assert(
    chainTicker && typeof chainTicker === "string",
    `getNftOwner invalid chainTicker '${chainTicker}'`,
  );
  assert(
    chainProviderUrl && typeof chainProviderUrl === "string",
    `getNftOwner invalid chainProviderUrl '${chainProviderUrl}'`,
  );
  assert(typeof chainId === "number", `getNftOwner invalid chainId '${chainId}' not a number`);
  await loadEthers();
  const chainProvider = getChainProvider(chainTicker, chainProviderUrl, chainId);
  const nftContract = new ethers.Contract(nftAddress, nftAbi, chainProvider);
  const currentNftOwnerAddress = await nftContract.ownerOf(nftId);
  return currentNftOwnerAddress;
};
export const getNftOwner = utils.memo(getNftOwnerNoCache, {
  maxSize: 5000,
  maxAge: 1000 * 60 * 60 * 24,
});

const resolveEnsTxtRecordNoCache = async (
  ensName: string,
  txtRecordName: string,
  chainTicker: string,
  chainProviderUrl?: string,
  chainId?: number,
) => {
  await loadEthers();
  const chainProvider = getChainProvider(chainTicker, chainProviderUrl, chainId);
  const resolver = await chainProvider.getResolver(ensName);
  if (!resolver) {
    throw Error(`name not registered or network error`);
  }
  const txtRecordResult = await resolver.getText(txtRecordName);
  return txtRecordResult;
};
export const resolveEnsTxtRecord = utils.memo(resolveEnsTxtRecordNoCache, {
  maxSize: 10000,
  maxAge: 1000 * 60 * 60 * 24,
});

// cache the chain providers because only 1 should be running at the same time
const getChainProviderNoCache = (
  chainTicker: string,
  chainProviderUrl?: string,
  chainId?: number,
) => {
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

const decodePkcPrivateKey = (privateKeyBase64: string) => {
  const privateKeyBytes = Uint8Array.from(atob(privateKeyBase64), (c) => c.charCodeAt(0));
  if (privateKeyBytes.length !== 32) {
    throw Error("failed getting eth address from private key not 32 bytes");
  }
  return privateKeyBytes;
};

/**
 * The author wallet derived from the author's PKC private key, with a BSIP-22 proof. The proof
 * binds the key address of that private key, so it stays valid when author.address changes to a
 * name. The second argument is ignored: it used to be author.address, which BSIP-22 forbids.
 */
export const getEthWalletFromPkcPrivateKey = async (
  privateKeyBase64: string,
  _authorAddress?: string,
) => {
  // ignore private key used in pkc-js signer mock so tests run faster, also make sure nobody uses it
  if (privateKeyBase64 === "private key") {
    return;
  }

  const privateKeyBytes = decodePkcPrivateKey(privateKeyBase64);
  const { getKeyAddressFromPkcPrivateKey, getWalletMessageToSign } = await loadAuthorWalletProof();
  const authorPublicKey = getKeyAddressFromPkcPrivateKey(privateKeyBase64);
  await loadEthers();
  const publicKeyHex = ethers.utils.computePublicKey(privateKeyBytes, false);
  const privateKeyHex = ethers.utils.hexlify(privateKeyBytes);
  const ethAddress = ethers.utils.computeAddress(publicKeyHex);

  // ethers signs as a wallet does: EIP-191 personal message, low s, v of 27 or 28
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await new ethers.Wallet(privateKeyHex).signMessage(
    getWalletMessageToSign(authorPublicKey, ethAddress, timestamp),
  );

  return { address: ethAddress, timestamp, signature: { signature, type: "eip191" } };
};

export const getEthPrivateKeyFromPkcPrivateKey = async (
  privateKeyBase64: string,
  authorAddress?: string,
) => {
  // ignore private key used in pkc-js signer mock so tests run faster, also make sure nobody uses it
  if (privateKeyBase64 === "private key") {
    return;
  }

  const privateKeyBytes = decodePkcPrivateKey(privateKeyBase64);
  await loadEthers();
  const privateKeyHex = ethers.utils.hexlify(privateKeyBytes);
  return privateKeyHex;
};

/**
 * Resolve when `wallet` is a valid BSIP-22 proof for the author key address `authorPublicKey`
 * (12D3KooW..., never author.address), throw otherwise, including for a signature type this check
 * doesn't implement. Use verifyAuthorWallet to tell invalid and unknown entries apart.
 */
export const validateEthWallet = async (wallet: Wallet, authorPublicKey: string) => {
  const { verifyAuthorWallet } = await loadAuthorWalletProof();
  const result = verifyAuthorWallet(wallet, authorPublicKey);
  if (result.outcome === "unknown") {
    throw Error(`validateEthWallet unknown wallet.signature.type '${wallet?.signature?.type}'`);
  }
  if (result.outcome === "invalid") {
    throw Error(`validateEthWallet invalid wallet: ${result.reason}`);
  }
};

export default {
  getNftOwner,
  getNftMetadataUrl,
  getNftImageUrl,
  resolveEnsTxtRecord,
  getEthWalletFromPkcPrivateKey,
  getEthPrivateKeyFromPkcPrivateKey,
  validateEthWallet,
};
