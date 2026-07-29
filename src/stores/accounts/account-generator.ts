import PkcJs from "../../lib/pkc-js";
import validator from "../../lib/validator";
import chain from "../../lib/chain";
import { v4 as uuid } from "uuid";
import accountsDatabase from "./accounts-database";
import { Accounts, AccountCommunity, ChainProviders } from "../../types";
import {
  getPkcClientOptions,
  normalizeAccountProtocolConfig,
  withProtocolAliases,
} from "../../lib/pkc-compat";
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
const chainProviders: ChainProviders = {
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

const aliasProtocolOptions = (options: Record<string, any>) => ({
  ...options,
  resolveAuthorNames: options.resolveAuthorNames ?? options.resolveAuthorAddresses ?? false,
  resolveAuthorAddresses: options.resolveAuthorAddresses ?? options.resolveAuthorNames ?? false,
});

const addMissingChainProviders = (options: Record<string, any>) => {
  const optionsWithChainProviders = { ...options };
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
  const windowChainProviders = defaultWindowOptions?.chainProviders
    ? JSON.parse(JSON.stringify(defaultWindowOptions.chainProviders))
    : undefined;
  return addMissingChainProviders({
    chainProviders: windowChainProviders,
  }).chainProviders as ChainProviders;
};

// default options aren't saved to database so they can be changed
export const getDefaultPkcOptions = () => {
  // default PKC options defined by the electron process
  // @ts-ignore
  const defaultWindowOptions = window.defaultPkcOptions;
  if (defaultWindowOptions) {
    // @ts-ignore
    const defaultPkcOptions: any = JSON.parse(
      JSON.stringify({ ...defaultWindowOptions, libp2pJsClientsOptions: undefined }),
    );
    delete defaultPkcOptions.chainProviders;
    delete defaultPkcOptions.nameResolversChainProviders;
    // @ts-ignore
    defaultPkcOptions.libp2pJsClientsOptions = defaultWindowOptions.libp2pJsClientsOptions; // libp2pJsClientsOptions is not always just json
    return aliasProtocolOptions({ ...defaultPkcOptions, ...overwritePkcOptions });
  }
  // default PKC options for web client
  return aliasProtocolOptions({
    ipfsGatewayUrls: [
      "https://ipfsgateway.xyz",
      "https://gateway.plebpubsub.xyz",
      "https://gateway.forumindex.com",
    ],
    kuboRpcClientsOptions: undefined,
    pubsubKuboRpcClientsOptions: [
      "https://pubsubprovider.xyz/api/v0",
      "https://plebpubsub.xyz/api/v0",
      "https://rannithepleb.com/api/v0",
    ],
    httpRoutersOptions: [...DEFAULT_HTTP_ROUTER_URLS],
    ...overwritePkcOptions,
  });
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

const generateDefaultAccount = async () => {
  const pkcOptions = getDefaultPkcOptions();
  const chainProviders = getDefaultChainProviders();
  const pkc = await PkcJs.PKC(
    getPkcClientOptions(
      {
        chainProviders,
        pkcOptions,
      },
      pkcOptions,
    ),
  );
  // handle errors or error events are uncaught
  // no need to log them because pkc-js already logs them
  pkc.on("error", (error: any) =>
    log.error("uncaught pkc instance error, should never happen", { error }),
  );

  const signer = await pkc.createSigner();
  const author = {
    address: signer.address,
    wallets: {
      eth: await chain.getEthWalletFromPkcPrivateKey(signer.privateKey, signer.address),
    },
  };

  const accountName = await getNextAvailableDefaultAccountName();

  // communities where the account has a role, like moderator, admin, owner, etc.
  const communities: { [communityAddress: string]: AccountCommunity } = {};

  const account = normalizeAccountProtocolConfig(
    withProtocolAliases(
      {
        id: uuid(),
        version: accountsDatabase.accountVersion,
        name: accountName,
        author,
        signer,
        chainProviders,
        pkcOptions,
        ...getDefaultAccountFields(),
        communities,
      },
      pkc,
      pkcOptions,
    ),
    chainProviders,
  );
  return account;
};

const getNextAvailableDefaultAccountName = async () => {
  const accountIds: string[] | null =
    await accountsDatabase.accountsMetadataDatabase.getItem("accountIds");
  const accountNames = [];
  if (accountIds?.length) {
    const accounts: Accounts | null = await accountsDatabase.getAccounts(accountIds);
    for (const accountId of accountIds) {
      accountNames.push(accounts[accountId].name);
    }
  }
  let accountNumber = 1;
  if (!accountNames?.length) {
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
};

const accountGenerator = {
  generateDefaultAccount,
  getDefaultAccountFields,
  getDefaultPkcOptions,
};

export default accountGenerator;
