import { useEffect, useState, useMemo } from "react";
import useInterval from "../utils/use-interval";
import { useAccount } from "../accounts";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:authors:hooks");
import assert from "assert";
import {
  ChainProviders,
  Author,
  UseAuthorOptions,
  UseAuthorResult,
  UseAuthorCommentsOptions,
  UseAuthorCommentsResult,
  UseAuthorAvatarOptions,
  UseAuthorAvatarResult,
  UseResolvedAuthorAddressOptions,
  UseResolvedAuthorAddressResult,
  UseAuthorAddressOptions,
  UseAuthorAddressResult,
} from "../../types";
import {
  useNftMetadataUrl,
  useNftImageUrl,
  useVerifiedAuthorAvatarSignature,
  useAuthorAvatarIsWhitelisted,
} from "./author-avatars";
import { useComment, useComments } from "../comments";
import { useAuthorCommentsName, usePkcAddress } from "./utils";
import useAuthorsCommentsStore from "../../stores/authors-comments";
import PkcJs from "../../lib/pkc-js";
import {
  getConfiguredNameResolverInfoByKey,
  getChainProviders,
  getMatchingNameResolvers,
  getProtocolClient,
  getProtocolNameResolverClients,
  resolveAuthorNameWithProtocol,
} from "../../lib/pkc-compat";
import QuickLRU from "quick-lru";
export { setAuthorAvatarsWhitelistedTokenAddresses } from "./author-avatars";

const cacheResolveAuthorAddressPromise = (
  address: string,
  promise: Promise<string>,
): Promise<string> => {
  resolveAuthorAddressPromises[address] = promise;
  const clearCachedPromise = () => {
    if (resolveAuthorAddressPromises[address] === promise) {
      delete resolveAuthorAddressPromises[address];
    }
  };
  void promise.then(clearCachedPromise, clearCachedPromise);
  return promise;
};

const removeStateChangeListener = (client: any, listener: (state: string) => void) => {
  if (typeof client?.off === "function") {
    client.off("statechange", listener);
    return;
  }
  client?.removeListener?.("statechange", listener);
};

/**
 * @param authorAddress - The address of the author
 * @param commentCid - The last known comment cid of the author (not possible to get an author without providing at least 1 comment cid)
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useAuthorComments(options?: UseAuthorCommentsOptions): UseAuthorCommentsResult {
  assert(
    !options || typeof options === "object",
    `useAuthorComments options argument '${options}' not an object`,
  );
  const { authorAddress, commentCid, accountName, filter } = options || {};
  const account = useAccount({ accountName });
  const authorCommentsName = useAuthorCommentsName(account?.id, authorAddress, filter);
  const incrementPageNumber = useAuthorsCommentsStore((state) => state.incrementPageNumber);
  const addAuthorCommentsToStore = useAuthorsCommentsStore(
    (state) => state.addAuthorCommentsToStore,
  );
  const hasMoreBufferedComments = useAuthorsCommentsStore(
    (state) => state.hasMoreBufferedComments[authorCommentsName || ""],
  );
  const hasNextCommentCidToFetch = useAuthorsCommentsStore((state) =>
    Boolean(state.nextCommentCidsToFetch[authorAddress || ""]),
  );
  const authorComments = useAuthorsCommentsStore(
    (state) => state.loadedComments[authorCommentsName || ""],
  );
  const lastCommentCid = useAuthorsCommentsStore(
    (state) => state.lastCommentCids[authorAddress || ""],
  );

  // add authors comments to store
  useEffect(() => {
    if (!authorAddress || !commentCid || !account) {
      return;
    }
    try {
      addAuthorCommentsToStore(authorCommentsName, authorAddress, commentCid, filter, account);
    } catch (error: any) {
      log.error("useAuthorComments addAuthorCommentsToStore error", { authorCommentsName, error });
    }
  }, [authorCommentsName, commentCid]);

  const loadMore = async () => {
    try {
      if (!authorAddress || !account) {
        throw Error("useAuthorComments cannot load more authorComments not initalized yet");
      }
      incrementPageNumber(authorCommentsName);
    } catch (e: any) {
      // wait 100 ms so infinite scroll doesn't spam this function
      await new Promise((r) => setTimeout(r, 50));
      // TODO: maybe add these errors to errors array
    }
  };

  const hasMore = hasMoreBufferedComments || hasNextCommentCidToFetch;

  const authorResult = useAuthor({ commentCid, authorAddress, accountName });
  const state = authorResult.state;
  const errors = authorResult.errors;

  if (authorResult.author) {
    log("useAuthorComments", {
      authorAddress,
      commentCid,
      // authorComments,
      authorCommentsSize: authorComments?.length || 0,
      lastCommentCid,
      hasMoreBufferedComments,
      hasNextCommentCidToFetch,
      hasMore,
      state,
      errors,
      authorResult,
      accountName,
    });
  }

  return useMemo(
    () => ({
      authorComments: authorComments || [],
      lastCommentCid,
      hasMore,
      loadMore,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [authorComments, lastCommentCid, hasMore, errors, state],
  );
}

/**
 * @param authorAddress - The address of the author
 * @param commentCid - The last known comment cid of the author (not possible to get an author without providing at least 1 comment cid)
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useAuthor(options?: UseAuthorOptions): UseAuthorResult {
  assert(
    !options || typeof options === "object",
    `useAuthor options argument '${options}' not an object`,
  );
  const { authorAddress, commentCid, accountName } = options || {};
  const comment = useComment({ commentCid, accountName });

  // the commentCid doesnt have the same author address as authorAddress
  const useAuthorError = useMemo(() => {
    // if comment is loaded and author address is different from authorAddress
    if (comment?.timestamp && authorAddress && comment?.author?.address !== authorAddress) {
      return Error("commentCid author.address is different from authorAddress");
    }
    if (commentCid && !authorAddress) {
      return Error("missing UseAuthorOptions.authorAddress");
    }
    if (!commentCid && authorAddress) {
      return Error("missing UseAuthorOptions.commentCid");
    }
  }, [commentCid, comment?.timestamp, comment?.author?.address, authorAddress]);

  // if has author error, don't return the autor
  let author: Author | undefined;
  if (!useAuthorError) {
    author = comment?.author;
  }

  // merge comment.errors with useAuthorError
  const errors = useMemo(() => {
    if (useAuthorError) {
      return [...comment.errors, useAuthorError];
    }
    return comment.errors;
  }, [comment.errors, useAuthorError]);

  // if has author error, state failed
  let state = author ? "succeeded" : comment?.state || "initializing";
  if (useAuthorError) {
    state = "failed";
  }

  if (comment?.timestamp) {
    log("useAuthor", {
      authorAddress,
      commentCid,
      author,
      comment,
      useAuthorError,
      state,
      accountName,
    });
  }

  return useMemo(
    () => ({
      author,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [author, errors, state],
  );
}

/**
 * @param author - The Author object to resolve the avatar image URL of.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
// NOTE: useAuthorAvatar tests are skipped, if changes are made they must be tested manually
export function useAuthorAvatar(options?: UseAuthorAvatarOptions): UseAuthorAvatarResult {
  assert(
    !options || typeof options === "object",
    `useAuthorAvatar options argument '${options}' not an object`,
  );
  const { author, accountName } = options || {};
  const account = useAccount({ accountName });

  // TODO: resolve crypto domain and check if one of the record is a profile pic

  const { verified, error: signatureError } = useVerifiedAuthorAvatarSignature(author, accountName);
  const verifiedError = verified === false && Error(`nft ownership signature proof invalid`);
  const isWhitelisted = useAuthorAvatarIsWhitelisted(author?.avatar);
  const whitelistedError =
    isWhitelisted === false && Error(`nft collection '${author?.avatar?.address}' not whitelisted`);
  // don't try to get avatar image url at all if signature isn't verified and whitelisted
  const avatar = verified && isWhitelisted ? author?.avatar : undefined;
  const { metadataUrl, error: nftMetadataError } = useNftMetadataUrl(avatar, accountName);
  const { imageUrl, error: nftImageUrlError } = useNftImageUrl(metadataUrl, accountName);
  const chainProvider = getChainProviders(account)?.[avatar?.chainTicker];

  const error =
    whitelistedError ||
    verifiedError ||
    signatureError ||
    nftMetadataError ||
    nftImageUrlError ||
    undefined;
  const errors = useMemo(() => (error ? [error] : []), [error]);

  let state = "initializing";
  if (!author?.avatar) {
    // do nothing, is initializing
  } else if (error) {
    state = "failed";
  } else if (imageUrl !== undefined) {
    state = "succeeded";
  } else if (metadataUrl !== undefined) {
    state = "fetching-metadata";
  } else if (verified !== undefined) {
    state = "fetching-uri";
  } else if (author?.avatar) {
    state = "fetching-owner";
  }

  if (author?.avatar) {
    log("useAuthorAvatar", { author, state, verified, isWhitelisted, metadataUrl, imageUrl });
  }

  return useMemo(
    () => ({
      imageUrl,
      metadataUrl,
      chainProvider,
      state,
      error,
      errors,
    }),
    [imageUrl, metadataUrl, chainProvider, state, error],
  );
}

/**
 * @param author - The Author object to resolve the address of.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useAuthorAddress(options?: UseAuthorAddressOptions): UseAuthorAddressResult {
  assert(
    !options || typeof options === "object",
    `useAuthorAddress options argument '${options}' not an object`,
  );
  const { comment, accountName } = options || {};
  const account = useAccount({ accountName });
  const protocolClient = getProtocolClient(account);
  const isCryptoName = !!comment?.author?.address?.includes?.(".");
  const [resolvedAddress, setResolvedAddress] = useState<string | undefined>(
    isCryptoName ? resolvedAuthorAddressCache.get(comment?.author?.address) : undefined,
  );
  const signerAddress = usePkcAddress(isCryptoName ? comment?.signature?.publicKey : undefined);

  // useful for triggering css animation when the address changes from unverified to verified
  const [authorAddressChanged, setAuthorAddressChanged] = useState(false);

  useEffect(() => {
    if (!protocolClient || !comment?.author?.address || !isCryptoName) {
      return;
    }
    const addr = comment?.author?.address;
    const resolveAuthorAddressNoCache = () => {
      const existing = resolveAuthorAddressPromises[addr];
      if (existing) return existing;
      log("useAuthorAddress protocol.resolveAuthorName", { name: addr });
      return cacheResolveAuthorAddressPromise(
        addr,
        resolveAuthorNameWithProtocol(protocolClient, { name: addr }),
      );
    };
    const resolveAuthorAddress = async () => {
      const cached = resolvedAuthorAddressCache.get(addr);
      if (cached) return cached;
      const res = await resolveAuthorAddressNoCache();
      resolvedAuthorAddressCache.set(addr, res);
      return res;
    };
    resolveAuthorAddress()
      .then((_resolvedAddress: string) => {
        if (_resolvedAddress !== resolvedAddress) {
          setResolvedAddress(_resolvedAddress);
          setAuthorAddressChanged(true);
        }
      })
      .catch((error: any) => log.error("useAuthorAddress error", { error, comment }));
  }, [protocolClient, comment?.author?.address, isCryptoName]);

  // use signer address by default
  let authorAddress = signerAddress;
  // if author address was resolved successfully, use author address
  if (resolvedAddress && signerAddress === resolvedAddress) {
    authorAddress = comment?.author?.address;
  }
  // if isn't crypto name, always use author address
  if (!isCryptoName) {
    authorAddress = comment?.author?.address;
  }
  // if comment has no signature, it's a pending account comment, no need to verify it
  // TODO: eventually account comments will have a signature immediately
  if (comment && !comment?.signature) {
    authorAddress = comment?.author?.address;
  }

  let shortAuthorAddress = authorAddress && PkcJs.PKC.getShortAddress({ address: authorAddress });

  // if shortAddress is smaller than crypto name, give a longer
  // shortAddress to cause the least UI displacement as possible
  // -4 chars because most fonts will make the address larger
  if (
    isCryptoName &&
    authorAddress &&
    shortAuthorAddress.length < comment?.author?.address?.length - 4
  ) {
    const restOfAuthorAddress = authorAddress.split(shortAuthorAddress).pop();
    shortAuthorAddress = (shortAuthorAddress + restOfAuthorAddress).substring(
      0,
      comment?.author?.address?.length - 4,
    );
  }

  return useMemo(
    () => ({
      authorAddress,
      shortAuthorAddress,
      authorAddressChanged,
      state: "initializing",
      error: undefined,
      errors: [],
    }),
    [authorAddress, shortAuthorAddress],
  );
}
// TODO: figure out how to upgrade to quick-lru 6+ to use maxAge
const resolvedAuthorAddressCache = new QuickLRU<string, string>({ maxSize: 1000 });
const resolveAuthorAddressPromises: { [address: string]: Promise<string> } = {};

/** For tests: reset caches to make resolution paths deterministic. */
export function resetAuthorAddressCacheForTesting() {
  resolvedAuthorAddressCache.clear();
  for (const k of Object.keys(resolveAuthorAddressPromises)) {
    delete resolveAuthorAddressPromises[k];
  }
}

/**
 * @param author - The author with author.address to resolve to a public key, e.g. 'john.eth' resolves to '12D3KooW...'.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
// NOTE: useResolvedAuthorAddress tests are skipped, if changes are made they must be tested manually
export function useResolvedAuthorAddress(
  options?: UseResolvedAuthorAddressOptions,
): UseResolvedAuthorAddressResult {
  assert(
    !options || typeof options === "object",
    `useResolvedAuthorAddress options argument '${options}' not an object`,
  );
  let { author, accountName, cache } = options || {};

  // cache by default
  if (typeof cache !== "boolean") {
    cache = true;
  }

  // poll every 15 seconds, about the duration of an eth block
  let interval = 15000;
  // no point in polling often if caching is on
  if (cache) {
    interval = 1000 * 60 * 60 * 25;
  }

  const account = useAccount({ accountName });
  const protocolClient = getProtocolClient(account);
  const chainProviders = getChainProviders(account);
  const configuredNameResolvers = useMemo(
    () => getMatchingNameResolvers(account, author?.address),
    [account, author?.address],
  );
  const configuredNameResolversByKey = useMemo(
    () => getConfiguredNameResolverInfoByKey(account),
    [account],
  );
  const [resolvedAddress, setResolvedAddress] = useState<string>();
  const [errors, setErrors] = useState<Error[]>([]);
  const [state, setState] = useState<string>();
  const [activeNameResolverKey, setActiveNameResolverKey] = useState<string>();

  let initialState = "initializing";
  // before those defined, nothing can happen
  if (options && account && author?.address) {
    initialState = "ready";
  }

  const isCryptoName = author?.address?.includes?.(".");

  const resolveAuthorAddressNoCache = () => {
    if (Boolean(resolveAuthorAddressPromises[author?.address])) {
      return resolveAuthorAddressPromises[author?.address];
    }
    log("useResolvedAuthorAddress protocol.resolveAuthorName", { name: author?.address });
    return cacheResolveAuthorAddressPromise(
      author?.address,
      resolveAuthorNameWithProtocol(protocolClient, {
        name: author?.address,
      }),
    );
  };
  const resolveAuthorAddress = async () => {
    const cached = resolvedAuthorAddressCache.get(author?.address);
    if (cached) {
      return cached;
    }
    const res = await resolveAuthorAddressNoCache();
    resolvedAuthorAddressCache.set(author?.address, res);
    return res;
  };

  useEffect(() => {
    if (!protocolClient || !author?.address) {
      setActiveNameResolverKey(undefined);
      return;
    }

    const nameResolverClients = getProtocolNameResolverClients(protocolClient);
    const entries = Object.entries(nameResolverClients);
    if (!entries.length) {
      setActiveNameResolverKey(undefined);
      return;
    }

    const syncFromCurrentClients = () => {
      const nextActiveKey = entries.find(
        ([, client]: [string, any]) => client?.state && client.state !== "stopped",
      )?.[0];
      if (nextActiveKey) {
        setActiveNameResolverKey(nextActiveKey);
      }
    };

    syncFromCurrentClients();

    const disposers = entries.map(([resolverKey, client]: [string, any]) => {
      if (typeof client?.on !== "function") {
        return undefined;
      }

      const onStateChange = (resolverState: string) => {
        setActiveNameResolverKey((previousResolverKey) => {
          if (resolverState !== "stopped") {
            return resolverKey;
          }
          if (previousResolverKey !== resolverKey) {
            return previousResolverKey;
          }
          return (
            entries.find(
              ([candidateResolverKey, candidateClient]: [string, any]) =>
                candidateResolverKey !== resolverKey &&
                candidateClient?.state &&
                candidateClient.state !== "stopped",
            )?.[0] || previousResolverKey
          );
        });
      };

      client.on("statechange", onStateChange);
      return () => removeStateChangeListener(client, onStateChange);
    });

    return () => {
      for (const dispose of disposers) {
        dispose?.();
      }
    };
  }, [author?.address, protocolClient]);

  useInterval(
    () => {
      // no options, do nothing or reset
      if (!account || !author?.address) {
        if (resolvedAddress !== undefined) {
          setResolvedAddress(undefined);
        }
        if (state !== undefined) {
          setState(undefined);
        }
        if (errors.length) {
          setErrors([]);
        }
        if (activeNameResolverKey !== undefined) {
          setActiveNameResolverKey(undefined);
        }
        return;
      }

      // address isn't a crypto domain, can't be resolved
      if (!isCryptoName) {
        if (state !== "failed") {
          setErrors([Error("not a crypto domain")]);
          setState("failed");
          setResolvedAddress(undefined);
          setActiveNameResolverKey(undefined);
        }
        return;
      }

      if (!configuredNameResolvers.length) {
        if (state !== "failed") {
          setErrors([Error("crypto domain type unsupported")]);
          setState("failed");
          setResolvedAddress(undefined);
          setActiveNameResolverKey(undefined);
        }
        return;
      }

      (async () => {
        try {
          setActiveNameResolverKey(
            (previousResolverKey) => previousResolverKey || configuredNameResolvers[0]?.key,
          );
          setState("resolving");
          let res;
          if (cache) {
            res = await resolveAuthorAddress();
          } else {
            res = await resolveAuthorAddressNoCache();
          }
          setState("succeeded");

          // TODO: check if resolved address is the same as author.signer.publicKey

          if (res !== resolvedAddress) {
            setResolvedAddress(res);
          }
        } catch (error: any) {
          setErrors((previousErrors) => [...previousErrors, error]);
          setState("failed");
          setResolvedAddress(undefined);
          log.error("useResolvedAuthorAddress resolveAuthorAddress error", {
            author,
            chainProviders,
            error,
          });
        }
      })();
    },
    interval,
    true,
    [author?.address, configuredNameResolvers, protocolClient],
  );

  const nameResolver =
    (activeNameResolverKey && configuredNameResolversByKey[activeNameResolverKey]) ||
    configuredNameResolvers[0];
  const chainProvider = nameResolver?.chainTicker
    ? chainProviders?.[nameResolver.chainTicker]
    : undefined;

  log("useResolvedAuthorAddress", {
    author,
    state,
    errors,
    resolvedAddress,
    chainProviders,
    nameResolver,
  });

  return useMemo(
    () => ({
      resolvedAddress,
      chainProvider,
      nameResolver,
      state: state || initialState,
      error: errors[errors.length - 1],
      errors,
    }),
    [resolvedAddress, chainProvider, nameResolver, state, errors],
  );
}
