import assert from "./assert";
import type { Challenge, ChallengeAnswersByIndex, PublishChallengeAnswersInput } from "../types";
import type {
  PkcResolveAuthorName,
  PkcResolveAuthorNameOptions,
  PkcResolveAuthorNameResult,
} from "./pkc-types";

export const getProtocolClient = (account: any) => account?.pkc;

export const getProtocolOptions = (account: any) => account?.pkcOptions;

export const getChainProviders = (account: any) =>
  account?.chainProviders || getProtocolOptions(account)?.chainProviders;

export const getNameResolversChainProviders = (account: any) =>
  account?.nameResolversChainProviders || getProtocolOptions(account)?.nameResolversChainProviders;

export const getRpcClients = (protocolClient: any) => protocolClient?.clients?.pkcRpcClients || {};

export const getPageRpcClients = (clients: any) => clients?.pkcRpcClients || {};

export const getProtocolNameResolverClients = (protocolClient: any) =>
  protocolClient?.clients?.nameResolvers ||
  protocolClient?._clientsManager?.clients?.nameResolvers ||
  {};

export type NameResolverInfo = {
  key: string;
  nameSystem: string;
  chainTicker: string;
  provider: string;
  providerLabel: string;
};

const isEthAliasDomain = (address?: string) =>
  typeof address === "string" &&
  (address.toLowerCase().endsWith(".eth") || address.toLowerCase().endsWith(".bso"));

const isSupportedBsoResolverProvider = (provider: string) =>
  provider === "viem" || /^(https?:\/\/|wss?:\/\/)/i.test(provider);

const getNameResolverProviderLabel = (provider: string) => {
  try {
    return new URL(provider).hostname;
  } catch (error) {
    return provider;
  }
};

const getConfiguredEthNameResolverProviders = (account: any): string[] => {
  const nameResolverUrls = getNameResolversChainProviders(account)?.eth?.urls;
  const chainProviderUrls = getChainProviders(account)?.eth?.urls;
  const urls =
    Array.isArray(nameResolverUrls) && nameResolverUrls.length
      ? nameResolverUrls
      : chainProviderUrls;

  if (!Array.isArray(urls)) {
    return [];
  }

  return urls.filter(
    (provider): provider is string => typeof provider === "string" && provider.length > 0,
  );
};

export const getConfiguredNameResolverInfoByKey = (
  account: any,
): Record<string, NameResolverInfo> => {
  const infoByKey: Record<string, NameResolverInfo> = {};

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

export const getMatchingNameResolvers = (account: any, address?: string): NameResolverInfo[] => {
  if (!isEthAliasDomain(address)) {
    return [];
  }

  return Object.values(getConfiguredNameResolverInfoByKey(account));
};

const buildConfiguredNameResolvers = async (account: any, dataPath?: string) => {
  const resolverInfos = Object.values(getConfiguredNameResolverInfoByKey(account));
  if (!resolverInfos.length) {
    return [];
  }
  // bso-resolver bundles viem; load it when a PKC client is created rather than with the hooks
  // that apps import at startup.
  const { BsoResolver } = await import("@bitsocial/bso-resolver");
  return resolverInfos.map(
    (resolverInfo) =>
      new BsoResolver({
        key: resolverInfo.key,
        provider: resolverInfo.provider,
        dataPath,
      }),
  );
};

type LegacyResolveAuthorAddress = (options: { address: string }) => Promise<string> | string;

type AuthorNameProtocolClient = {
  resolveAuthorName?: PkcResolveAuthorName;
  resolveAuthorAddress?: LegacyResolveAuthorAddress;
};

const normalizeResolvedAuthorName = (result: PkcResolveAuthorNameResult | string): string => {
  if (typeof result === "string") {
    return result;
  }

  assert(
    typeof result?.resolvedAuthorName === "string",
    "protocol client resolveAuthorName returned invalid resolvedAuthorName",
  );
  return result.resolvedAuthorName;
};

export const resolveAuthorNameWithProtocol = async (
  protocolClient: AuthorNameProtocolClient | undefined,
  options: PkcResolveAuthorNameOptions,
): Promise<string> => {
  const resolveAuthorName = protocolClient?.resolveAuthorName;
  if (typeof resolveAuthorName === "function") {
    return normalizeResolvedAuthorName(await resolveAuthorName.call(protocolClient, options));
  }

  const resolveAuthorAddress = protocolClient?.resolveAuthorAddress;
  assert(
    typeof resolveAuthorAddress === "function",
    "protocol client resolveAuthorName/resolveAuthorAddress missing",
  );
  return resolveAuthorAddress.call(protocolClient, { address: options.name });
};

export const normalizeOptionsForPkcClient = <T extends Record<string, any> | undefined>(
  options: T,
): T => {
  if (!options) {
    return options;
  }

  const normalized: Record<string, any> = { ...options };

  if (normalized.resolveAuthorNames == null && normalized.resolveAuthorAddresses != null) {
    normalized.resolveAuthorNames = normalized.resolveAuthorAddresses;
  }

  delete normalized.resolveAuthorAddresses;
  delete normalized.chainProviders;
  delete normalized.nameResolversChainProviders;

  return normalized as T;
};

export const getPkcClientOptions = async <T extends Record<string, any> | undefined>(
  account: any,
  options: T,
): Promise<T> => {
  const normalized = normalizeOptionsForPkcClient(options);

  if (!normalized) {
    return normalized;
  }

  const nameResolvers = await buildConfiguredNameResolvers(account, normalized.dataPath);
  if (nameResolvers.length) {
    normalized.nameResolvers = nameResolvers;
  }

  return normalized as T;
};

export const normalizeAccountProtocolConfig = <T extends Record<string, any> | undefined>(
  account: T,
  defaultChainProviders?: Record<string, any>,
): T => {
  if (!account) {
    return account;
  }

  const nextAccount: Record<string, any> = { ...account };
  const protocolOptions =
    nextAccount.pkcOptions && typeof nextAccount.pkcOptions === "object"
      ? { ...nextAccount.pkcOptions }
      : nextAccount.pkcOptions;

  const chainProviders =
    nextAccount.chainProviders || protocolOptions?.chainProviders || defaultChainProviders;
  if (chainProviders !== undefined) {
    nextAccount.chainProviders = chainProviders;
  }

  if (
    nextAccount.nameResolversChainProviders === undefined &&
    protocolOptions?.nameResolversChainProviders !== undefined
  ) {
    nextAccount.nameResolversChainProviders = protocolOptions.nameResolversChainProviders;
  }

  if (protocolOptions && typeof protocolOptions === "object") {
    delete protocolOptions.chainProviders;
    delete protocolOptions.nameResolversChainProviders;
    nextAccount.pkcOptions = protocolOptions;
  }

  return nextAccount as T;
};

export const withProtocolAliases = <T extends Record<string, any>>(
  account: T,
  protocolClient?: any,
  protocolOptions?: any,
): T => {
  const nextAccount: Record<string, any> = { ...account };

  if (protocolClient !== undefined) {
    nextAccount.pkc = protocolClient;
  }
  if (protocolOptions !== undefined) {
    nextAccount.pkcOptions = protocolOptions;
  }

  return nextAccount as T;
};

type ChallengeAnswersInput =
  | PublishChallengeAnswersInput
  | string[]
  | { challengeAnswers: string[] }
  | undefined;

const publishChallengeAnswersCompatMarker = Symbol.for(
  "bitsocial-react-hooks.publishChallengeAnswersCompat",
);
const challengeIndexesKey = Symbol.for("bitsocial-react-hooks.challengeIndexes");

const emptyChallengeAnswersMessage =
  'publishChallengeAnswers() needs a non-empty record of answers keyed by challenge index, for example { "0": "answer" }';

/** The challenge indexes a CHALLENGE message asks to answer, in ascending order. */
export const getChallengeIndexes = (challenge: Challenge | undefined): string[] => {
  const challenges = challenge?.challenges;
  if (!challenges || typeof challenges !== "object") {
    return [];
  }
  return Object.keys(challenges).sort((a, b) => Number(a) - Number(b));
};

/**
 * Converts publishChallengeAnswers() input to pkc-js's { challengeAnswers: { [challengeIndex]: answer } }.
 * A deprecated positional array is mapped onto `challengeIndexes`, the ascending keys of the latest
 * CHALLENGE, so a caller that still passes an array keeps working. Missing or empty answers throw
 * instead of becoming an empty record that pkc-js would reject with a schema error.
 */
export const normalizeChallengeAnswersForPkc = (
  challengeAnswers: ChallengeAnswersInput,
  challengeIndexes: string[] = [],
): { challengeAnswers: ChallengeAnswersByIndex } => {
  const answers =
    challengeAnswers &&
    typeof challengeAnswers === "object" &&
    !Array.isArray(challengeAnswers) &&
    Object.prototype.hasOwnProperty.call(challengeAnswers, "challengeAnswers")
      ? (challengeAnswers as { challengeAnswers: unknown }).challengeAnswers
      : challengeAnswers;

  if (Array.isArray(answers)) {
    assert(answers.length > 0, emptyChallengeAnswersMessage);
    assert(
      challengeIndexes.length > 0,
      "publishChallengeAnswers() can't map an array of answers before a challenge message is received, pass a record keyed by challenge index",
    );
    const answersByIndex: ChallengeAnswersByIndex = {};
    challengeIndexes.slice(0, answers.length).forEach((challengeIndex, position) => {
      answersByIndex[challengeIndex] = answers[position];
    });
    return { challengeAnswers: answersByIndex };
  }

  assert(
    answers && typeof answers === "object" && Object.keys(answers).length > 0,
    emptyChallengeAnswersMessage,
  );
  return { challengeAnswers: answers as ChallengeAnswersByIndex };
};

/**
 * Lets publication.publishChallengeAnswers() take the hooks' input forms. Call it with every
 * CHALLENGE the publication receives: the publication is wrapped once, and the challenge indexes
 * used to map a deprecated array are those of the latest CHALLENGE.
 */
export const withPublishChallengeAnswersCompat = <T>(publication: T, challenge: Challenge): T => {
  const target = publication as Record<string | symbol, any> | undefined;
  if (!target || typeof target.publishChallengeAnswers !== "function") {
    return publication;
  }

  target[challengeIndexesKey] = getChallengeIndexes(challenge);
  if (target[publishChallengeAnswersCompatMarker]) {
    return publication;
  }

  const publishChallengeAnswers = target.publishChallengeAnswers.bind(publication);
  target.publishChallengeAnswers = async (challengeAnswers: ChallengeAnswersInput) =>
    publishChallengeAnswers(
      normalizeChallengeAnswersForPkc(challengeAnswers, target[challengeIndexesKey]),
    );
  target[publishChallengeAnswersCompatMarker] = true;

  return publication;
};

export * from "./protocol-compat";
