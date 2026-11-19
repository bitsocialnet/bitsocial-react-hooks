import type { Challenge, ChallengeAnswersByIndex, PublishChallengeAnswersInput } from "../types.js";
import type { PkcResolveAuthorName, PkcResolveAuthorNameOptions } from "./pkc-types.js";
export declare const getProtocolClient: (account: any) => any;
export declare const getProtocolOptions: (account: any) => any;
export declare const getChainProviders: (account: any) => any;
export declare const getNameResolversChainProviders: (account: any) => any;
export declare const getRpcClients: (protocolClient: any) => any;
export declare const getPageRpcClients: (clients: any) => any;
export declare const getProtocolNameResolverClients: (protocolClient: any) => any;
export type NameResolverInfo = {
    key: string;
    nameSystem: string;
    chainTicker: string;
    provider: string;
    providerLabel: string;
};
export declare const getConfiguredNameResolverInfoByKey: (account: any) => Record<string, NameResolverInfo>;
export declare const getMatchingNameResolvers: (account: any, address?: string) => NameResolverInfo[];
type LegacyResolveAuthorAddress = (options: {
    address: string;
}) => Promise<string> | string;
type AuthorNameProtocolClient = {
    resolveAuthorName?: PkcResolveAuthorName;
    resolveAuthorAddress?: LegacyResolveAuthorAddress;
};
export declare const resolveAuthorNameWithProtocol: (protocolClient: AuthorNameProtocolClient | undefined, options: PkcResolveAuthorNameOptions) => Promise<string>;
export declare const normalizeOptionsForPkcClient: <T extends Record<string, any> | undefined>(options: T) => T;
export declare const getPkcClientOptions: <T extends Record<string, any> | undefined>(account: any, options: T) => Promise<T>;
export declare const normalizeAccountProtocolConfig: <T extends Record<string, any> | undefined>(account: T, defaultChainProviders?: Record<string, any>) => T;
export declare const withProtocolAliases: <T extends Record<string, any>>(account: T, protocolClient?: any, protocolOptions?: any) => T;
type ChallengeAnswersInput = PublishChallengeAnswersInput | string[] | {
    challengeAnswers: string[];
} | undefined;
/** The challenge indexes a CHALLENGE message asks to answer, in ascending order. */
export declare const getChallengeIndexes: (challenge: Challenge | undefined) => string[];
/**
 * Converts publishChallengeAnswers() input to pkc-js's { challengeAnswers: { [challengeIndex]: answer } }.
 * A deprecated positional array is mapped onto `challengeIndexes`, the ascending keys of the latest
 * CHALLENGE, so a caller that still passes an array keeps working. Missing or empty answers throw
 * instead of becoming an empty record that pkc-js would reject with a schema error.
 */
export declare const normalizeChallengeAnswersForPkc: (challengeAnswers: ChallengeAnswersInput, challengeIndexes?: string[]) => {
    challengeAnswers: ChallengeAnswersByIndex;
};
/**
 * Lets publication.publishChallengeAnswers() take the hooks' input forms. Call it with every
 * CHALLENGE the publication receives: the publication is wrapped once, and the challenge indexes
 * used to map a deprecated array are those of the latest CHALLENGE.
 */
export declare const withPublishChallengeAnswersCompat: <T>(publication: T, challenge: Challenge) => T;
export * from "./protocol-compat.js";
//# sourceMappingURL=pkc-compat.d.ts.map