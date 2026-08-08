import { UseAuthorOptions, UseAuthorResult, UseAuthorCommentsOptions, UseAuthorCommentsResult, UseAuthorAvatarOptions, UseAuthorAvatarResult, UseResolvedAuthorAddressOptions, UseResolvedAuthorAddressResult, UseAuthorAddressOptions, UseAuthorAddressResult } from "../../types.js";
export { setAuthorAvatarsWhitelistedTokenAddresses } from "./author-avatars.js";
/**
 * @param authorAddress - The address of the author
 * @param commentCid - The last known comment cid of the author (not possible to get an author without providing at least 1 comment cid)
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useAuthorComments(options?: UseAuthorCommentsOptions): UseAuthorCommentsResult;
/**
 * @param authorAddress - The address of the author
 * @param commentCid - The last known comment cid of the author (not possible to get an author without providing at least 1 comment cid)
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useAuthor(options?: UseAuthorOptions): UseAuthorResult;
/**
 * @param author - The Author object to resolve the avatar image URL of.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useAuthorAvatar(options?: UseAuthorAvatarOptions): UseAuthorAvatarResult;
/**
 * @param author - The Author object to resolve the address of.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useAuthorAddress(options?: UseAuthorAddressOptions): UseAuthorAddressResult;
/** For tests: reset caches to make resolution paths deterministic. */
export declare function resetAuthorAddressCacheForTesting(): void;
/**
 * @param author - The author with author.address to resolve to a public key, e.g. 'john.eth' resolves to '12D3KooW...'.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export declare function useResolvedAuthorAddress(options?: UseResolvedAuthorAddressOptions): UseResolvedAuthorAddressResult;
//# sourceMappingURL=authors.d.ts.map