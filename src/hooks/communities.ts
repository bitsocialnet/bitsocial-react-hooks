import { useEffect, useState, useMemo } from "react";
import { useAccount } from "./accounts";
import validator from "../lib/validator";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:communities:hooks");
import assert from "assert";
import {
  Community,
  CommunityStats,
  ChainProviders,
  UseResolvedCommunityAddressOptions,
  UseResolvedCommunityAddressResult,
  UseCommunityOptions,
  UseCommunityResult,
  UseCommunitiesOptions,
  UseCommunitiesResult,
  UseCommunityStatsOptions,
  UseCommunityStatsResult,
} from "../types";
import useInterval from "./utils/use-interval";
import createStore from "zustand";
import { resolveEnsTxtRecord } from "../lib/chain";
import useCommunitiesStore from "../stores/communities";
import useAccountsStore from "../stores/accounts";
import shallow from "zustand/shallow";
import { getChainProviders, getPkcCommunityAddresses } from "../lib/pkc-compat";
import { getCommunityRefKey, getUniqueSortedCommunityRefs } from "../lib/community-ref";

const parseMaybeJson = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);

const tryParseMaybeJson = (value: unknown) => {
  try {
    return parseMaybeJson(value);
  } catch {
    return value;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const isCommunityStatsPayload = (value: unknown): value is CommunityStats =>
  isRecord(value) &&
  ("hourActiveUserCount" in value || "weekActiveUserCount" in value || "allPostCount" in value);

const parseFetchedCommunityStats = (fetchedCid: unknown): CommunityStats => {
  const parsedCid = parseMaybeJson(fetchedCid);
  if (isCommunityStatsPayload(parsedCid)) {
    return parsedCid;
  }
  if (isRecord(parsedCid) && "content" in parsedCid) {
    const parsedContent = tryParseMaybeJson(parsedCid.content);
    if (isCommunityStatsPayload(parsedContent)) {
      return parsedContent;
    }
  }
  return parsedCid as CommunityStats;
};

/**
 * @param community - The community identifier, e.g. {name: 'memes.eth'} or {publicKey: '12D3KooW...'}
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useCommunity(options?: UseCommunityOptions): UseCommunityResult {
  assert(
    !options || typeof options === "object",
    `useCommunity options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { community: communityInput, accountName, onlyIfCached } = opts;
  const account = useAccount({ accountName });
  const accountId = account?.id || "";
  validator.validateUseCommunityArguments({
    community: communityInput,
    communityAddress: (opts as any).communityAddress,
    account,
  });
  const communityKey = communityInput ? getCommunityRefKey(communityInput) : "";
  const storedCommunity = useCommunitiesStore((state: any) => state.communities[communityKey]);
  const addCommunityToStore = useCommunitiesStore((state: any) => state.addCommunityToStore);
  const errors = useCommunitiesStore((state: any) => state.errors[communityKey]);
  const syncStatus = useCommunitiesStore((state: any) => state.syncStatuses[communityKey]);
  const communityEditSummary = useAccountsStore((state: any) => {
    const accountEditsSummaries = state.accountsEditsSummaries[accountId] || {};
    const candidateCommunityKeys = [
      storedCommunity?.address,
      storedCommunity?.name,
      storedCommunity?.publicKey,
      communityInput?.name,
      communityInput?.publicKey,
    ];
    for (const candidateCommunityKey of candidateCommunityKeys) {
      if (
        typeof candidateCommunityKey === "string" &&
        accountEditsSummaries[candidateCommunityKey]
      ) {
        return accountEditsSummaries[candidateCommunityKey];
      }
    }
  });

  useEffect(() => {
    if (!communityInput || !account) {
      return;
    }
    if (!storedCommunity && !onlyIfCached) {
      // if community isn't already in store, add it
      addCommunityToStore(communityInput, account).catch((error: unknown) =>
        log.error("useCommunity addCommunityToStore error", { communityInput, error }),
      );
    }
  }, [communityKey, account?.id]);

  if (account && communityInput) {
    log("useCommunity", {
      community: communityInput,
      communityKey,
      storedCommunity,
      account,
    });
  }

  const mergedCommunity = useMemo(() => {
    if (!communityEditSummary) {
      return storedCommunity;
    }
    const localCommunityAddresses = getPkcCommunityAddresses(account?.pkc);
    const editedCommunityAddress = communityEditSummary.address?.value;
    const inputCommunityIdentifiers = [communityInput?.name, communityInput?.publicKey].filter(
      (communityIdentifier): communityIdentifier is string =>
        typeof communityIdentifier === "string",
    );
    if (
      !storedCommunity &&
      editedCommunityAddress &&
      !inputCommunityIdentifiers.some((communityIdentifier) =>
        localCommunityAddresses.includes(communityIdentifier),
      ) &&
      !localCommunityAddresses.includes(editedCommunityAddress)
    ) {
      return storedCommunity;
    }
    if (
      storedCommunity?.address &&
      editedCommunityAddress &&
      storedCommunity.address !== editedCommunityAddress
    ) {
      return storedCommunity;
    }
    const summaryValues = Object.fromEntries(
      Object.entries(communityEditSummary).map(([propertyName, propertySummary]: [string, any]) => [
        propertyName,
        propertySummary?.value,
      ]),
    );
    return {
      ...(storedCommunity || { address: communityInput?.name || communityInput?.publicKey }),
      ...summaryValues,
    };
  }, [account?.pkc, storedCommunity, communityInput, communityEditSummary]);

  let state = mergedCommunity?.updatingState || "initializing";
  // force succeeded even if the community is fecthing a new update
  if (mergedCommunity?.updatedAt) {
    state = "succeeded";
  }

  return useMemo(
    () => ({
      ...mergedCommunity,
      state,
      syncState: syncStatus?.syncState || (onlyIfCached ? "stopped" : "initializing"),
      hasCachedData: typeof mergedCommunity?.updatedAt === "number",
      lastFetchAttemptAt: syncStatus?.lastFetchAttemptAt,
      lastSuccessfulFetchAt: syncStatus?.lastSuccessfulFetchAt,
      error: errors?.[errors.length - 1],
      errors: errors || [],
    }),
    [mergedCommunity, communityKey, errors, onlyIfCached, syncStatus],
  );
}

/**
 * @param community - The community identifier, e.g. {name: 'memes.eth'} or {publicKey: '12D3KooW...'}
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useCommunityStats(options?: UseCommunityStatsOptions): UseCommunityStatsResult {
  assert(
    !options || typeof options === "object",
    `useCommunityStats options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { community, accountName, onlyIfCached } = opts;
  validator.validateUseCommunityStatsArguments({
    community,
    communityAddress: (opts as any).communityAddress,
  });
  const account = useAccount({ accountName });
  const communityKey = community ? getCommunityRefKey(community) : "";
  const fetchedCommunity = useCommunity({ community, onlyIfCached });
  const communityStatsCid = fetchedCommunity?.statsCid;
  const communityStats = useCommunitiesStatsStore(
    (state: CommunitiesStatsState) => state.communitiesStats[communityKey],
  );
  const setCommunityStats = useCommunitiesStatsStore(
    (state: CommunitiesStatsState) => state.setCommunityStats,
  );
  const [fetchError, setFetchError] = useState<Error | undefined>();

  useEffect(() => {
    setFetchError(undefined);
    if (!communityKey || !communityStatsCid || !account) {
      return;
    }
    let cancelled = false;
    (async () => {
      let fetchedCid;
      try {
        fetchedCid = await account.pkc.fetchCid({ cid: communityStatsCid });
        fetchedCid = parseFetchedCommunityStats(fetchedCid);
        if (cancelled) {
          return;
        }
        setCommunityStats(communityKey, fetchedCid);
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(typeof error === "string" ? error : "error");
        if (cancelled) {
          return;
        }
        setFetchError(normalizedError);
        log.error("useCommunityStats pkc.fetchCid error", {
          community,
          communityKey,
          communityStatsCid,
          fetchedCommunity,
          fetchedCid,
          error: normalizedError,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [communityStatsCid, account?.id, communityKey, setCommunityStats]);

  if (account && communityStatsCid) {
    log("useCommunityStats", {
      community,
      communityKey,
      communityStatsCid,
      communityStats,
      fetchedCommunity,
      account,
    });
  }

  const state =
    !communityKey || !account || !communityStatsCid
      ? "uninitialized"
      : fetchError
        ? "failed"
        : communityStats
          ? "succeeded"
          : "fetching-ipfs";

  return useMemo(
    () => ({
      ...communityStats,
      state,
      error: fetchError,
      errors: fetchError ? [fetchError] : [],
    }),
    [communityStats, state, fetchError],
  );
}

type CommunitiesStatsState = {
  communitiesStats: { [communityAddress: string]: CommunityStats };
  setCommunityStats: Function;
};

const useCommunitiesStatsStore = createStore<CommunitiesStatsState>((setState: Function) => ({
  communitiesStats: {},
  setCommunityStats: (communityAddress: string, communityStats: CommunityStats) =>
    setState((state: CommunitiesStatsState) => ({
      communitiesStats: { ...state.communitiesStats, [communityAddress]: communityStats },
    })),
}));

/**
 * @param communities - The communities to fetch, e.g. [{name: 'memes.eth'}, {publicKey: '12D3KooW...'}]
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
export function useCommunities(options?: UseCommunitiesOptions): UseCommunitiesResult {
  assert(
    !options || typeof options === "object",
    `useCommunities options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { communities: communitiesInput, accountName, onlyIfCached } = opts;
  const account = useAccount({ accountName });
  validator.validateUseCommunitiesArguments({
    communities: communitiesInput,
    communityRefs: (opts as any).communityRefs,
    communityAddresses: (opts as any).communityAddresses,
    account,
  });
  const normalizedCommunityRefs = useMemo(() => communitiesInput || [], [communitiesInput]);
  const communityKeys = useMemo(
    () => normalizedCommunityRefs.map(getCommunityRefKey),
    [normalizedCommunityRefs],
  );
  const communities: (Community | undefined)[] = useCommunitiesStore(
    (state: any) => communityKeys.map((communityKey) => state.communities[communityKey || ""]),
    shallow,
  );
  const communitiesErrors: (Error[] | undefined)[] = useCommunitiesStore(
    (state: any) => communityKeys.map((communityKey) => state.errors[communityKey || ""]),
    shallow,
  );
  const addCommunityToStore = useCommunitiesStore((state: any) => state.addCommunityToStore);

  useEffect(() => {
    if (!normalizedCommunityRefs.length || !account) {
      return;
    }
    if (onlyIfCached) {
      return;
    }
    const uniqueCommunityRefs = getUniqueSortedCommunityRefs(normalizedCommunityRefs);
    for (const communityRef of uniqueCommunityRefs) {
      addCommunityToStore(communityRef, account).catch((error: unknown) =>
        log.error("useCommunities addCommunityToStore error", { communityRef, error }),
      );
    }
  }, [account?.id, communityKeys.toString(), onlyIfCached, normalizedCommunityRefs]);

  if (account && normalizedCommunityRefs.length) {
    log("useCommunities", {
      requestedCommunities: normalizedCommunityRefs,
      communityKeys,
      communities,
      account,
    });
  }

  const errors = useMemo(
    () => communitiesErrors.flatMap((communityErrors) => communityErrors || []),
    [communitiesErrors],
  );
  const hasFailedCommunity = communities.some(
    (community, index) => !community && Boolean(communitiesErrors[index]?.length),
  );
  const state = hasFailedCommunity
    ? "failed"
    : communities.indexOf(undefined) === -1
      ? "succeeded"
      : "fetching-ipns";

  return useMemo(
    () => ({
      communities,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [communities, state, errors, communityKeys.toString()],
  );
}

// TODO: pkc.listCommunities() has been removed, rename this and use event communitieschanged instead of polling
/**
 * Returns all the owner communities created by pkc-js by calling pkc.listCommunities()
 */
export function useListCommunities(accountName?: string) {
  const account = useAccount({ accountName });
  const [communityAddresses, setCommunityAddresses] = useState<string[]>([]);

  const delay = 1000;
  const immediate = true;
  useInterval(
    () => {
      const pkc = account?.pkc;
      if (!pkc) return;
      const newAddrs = getPkcCommunityAddresses(pkc);
      if (newAddrs.toString() !== communityAddresses.toString()) {
        log("useListCommunities", { communityAddresses });
        setCommunityAddresses(newAddrs);
      }
    },
    delay,
    immediate,
  );

  return communityAddresses;
}

/**
 * @param communityAddress - The community address to resolve to a public key, e.g. 'news.eth' resolves to '12D3KooW...'.
 * @param acountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, use
 * the active account.
 */
// NOTE: useResolvedCommunityAddress tests are skipped, if changes are made they must be tested manually
export function useResolvedCommunityAddress(
  options?: UseResolvedCommunityAddressOptions,
): UseResolvedCommunityAddressResult {
  assert(
    !options || typeof options === "object",
    `useResolvedCommunityAddress options argument '${options}' not an object`,
  );
  let { communityAddress, accountName, cache } = options ?? {};

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
  const chainProviders = getChainProviders(account);
  const [resolvedAddress, setResolvedAddress] = useState<string>();
  const [errors, setErrors] = useState<Error[]>([]);
  const [state, setState] = useState<string>();

  let initialState = "initializing";
  // before those defined, nothing can happen
  if (options && account && communityAddress) {
    initialState = "ready";
  }

  useInterval(
    () => {
      if (!account || !communityAddress) {
        setResolvedAddress(undefined);
        setState(undefined);
        setErrors((prevErrors) => (prevErrors.length ? [] : prevErrors));
        return;
      }

      // address isn't a crypto domain, can't be resolved
      if (!communityAddress?.includes(".")) {
        if (state !== "failed") {
          setErrors([Error("not a crypto domain")]);
          setState("failed");
          setResolvedAddress(undefined);
        }
        return;
      }

      // only support resolving '.eth' for now
      if (!communityAddress?.endsWith(".eth")) {
        if (state !== "failed") {
          setErrors([Error("crypto domain type unsupported")]);
          setState("failed");
          setResolvedAddress(undefined);
        }
        return;
      }

      (async () => {
        try {
          setState("resolving");
          const res = await resolveCommunityAddress(communityAddress, chainProviders);
          setState("succeeded");
          if (res !== resolvedAddress) {
            setResolvedAddress(res);
          }
        } catch (error: any) {
          setErrors([...errors, error]);
          setState("failed");
          setResolvedAddress(undefined);
          log.error("useResolvedCommunityAddress resolveCommunityAddress error", {
            communityAddress,
            chainProviders,
            error,
          });
        }
      })();
    },
    interval,
    true,
    [communityAddress, chainProviders],
  );

  // only support ENS at the moment
  const chainProvider = chainProviders?.["eth"];

  // log('useResolvedCommunityAddress', {communityAddress, state, errors, resolvedAddress, chainProviders})
  return {
    resolvedAddress,
    chainProvider,
    state: state || initialState,
    error: errors[errors.length - 1],
    errors,
  };
}

// NOTE: resolveCommunityAddress tests are skipped, if changes are made they must be tested manually
export const resolveCommunityAddress = async (
  communityAddress: string,
  chainProviders: ChainProviders,
) => {
  let resolvedCommunityAddress;
  if (communityAddress.endsWith(".eth")) {
    resolvedCommunityAddress = await resolveEnsTxtRecord(
      communityAddress,
      "community-address",
      "eth",
      chainProviders?.["eth"]?.urls?.[0],
      chainProviders?.["eth"]?.chainId,
    );
  } else {
    throw Error(`resolveCommunityAddress invalid communityAddress '${communityAddress}'`);
  }
  return resolvedCommunityAddress;
};
