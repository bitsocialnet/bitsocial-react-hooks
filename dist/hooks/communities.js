var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useEffect, useState, useMemo } from "react";
import { useAccount } from "./accounts/index.js";
import validator from "../lib/validator.js";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:communities:hooks");
import assert from "assert";
import useInterval from "./utils/use-interval.js";
import createStore from "zustand";
import { resolveEnsTxtRecord } from "../lib/chain/index.js";
import useCommunitiesStore from "../stores/communities/index.js";
import useAccountsStore from "../stores/accounts/index.js";
import shallow from "zustand/shallow";
import { getChainProviders, getPkcCommunityAddresses } from "../lib/pkc-compat.js";
import { getCommunityRefKey, getUniqueSortedCommunityRefs } from "../lib/community-ref.js";
const parseMaybeJson = (value) => (typeof value === "string" ? JSON.parse(value) : value);
const tryParseMaybeJson = (value) => {
    try {
        return parseMaybeJson(value);
    }
    catch (_a) {
        return value;
    }
};
const isRecord = (value) => !!value && typeof value === "object";
const isCommunityStatsPayload = (value) => isRecord(value) &&
    ("hourActiveUserCount" in value || "weekActiveUserCount" in value || "allPostCount" in value);
const parseFetchedCommunityStats = (fetchedCid) => {
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
    return parsedCid;
};
/**
 * @param community - The community identifier, e.g. {name: 'memes.eth'} or {publicKey: '12D3KooW...'}
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useCommunity(options) {
    assert(!options || typeof options === "object", `useCommunity options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    const { community: communityInput, accountName, onlyIfCached } = opts;
    const account = useAccount({ accountName });
    const accountId = (account === null || account === void 0 ? void 0 : account.id) || "";
    validator.validateUseCommunityArguments({
        community: communityInput,
        communityAddress: opts.communityAddress,
        account,
    });
    const communityKey = communityInput ? getCommunityRefKey(communityInput) : "";
    const storedCommunity = useCommunitiesStore((state) => state.communities[communityKey]);
    const addCommunityToStore = useCommunitiesStore((state) => state.addCommunityToStore);
    const errors = useCommunitiesStore((state) => state.errors[communityKey]);
    const syncStatus = useCommunitiesStore((state) => state.syncStatuses[communityKey]);
    const communityEditSummary = useAccountsStore((state) => {
        const accountEditsSummaries = state.accountsEditsSummaries[accountId] || {};
        const candidateCommunityKeys = [
            storedCommunity === null || storedCommunity === void 0 ? void 0 : storedCommunity.address,
            storedCommunity === null || storedCommunity === void 0 ? void 0 : storedCommunity.name,
            storedCommunity === null || storedCommunity === void 0 ? void 0 : storedCommunity.publicKey,
            communityInput === null || communityInput === void 0 ? void 0 : communityInput.name,
            communityInput === null || communityInput === void 0 ? void 0 : communityInput.publicKey,
        ];
        for (const candidateCommunityKey of candidateCommunityKeys) {
            if (typeof candidateCommunityKey === "string" &&
                accountEditsSummaries[candidateCommunityKey]) {
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
            addCommunityToStore(communityInput, account).catch((error) => log.error("useCommunity addCommunityToStore error", { communityInput, error }));
        }
    }, [communityKey, account === null || account === void 0 ? void 0 : account.id]);
    if (account && communityInput) {
        log("useCommunity", {
            community: communityInput,
            communityKey,
            storedCommunity,
            account,
        });
    }
    const mergedCommunity = useMemo(() => {
        var _a;
        if (!communityEditSummary) {
            return storedCommunity;
        }
        const localCommunityAddresses = getPkcCommunityAddresses(account === null || account === void 0 ? void 0 : account.pkc);
        const editedCommunityAddress = (_a = communityEditSummary.address) === null || _a === void 0 ? void 0 : _a.value;
        const inputCommunityIdentifiers = [communityInput === null || communityInput === void 0 ? void 0 : communityInput.name, communityInput === null || communityInput === void 0 ? void 0 : communityInput.publicKey].filter((communityIdentifier) => typeof communityIdentifier === "string");
        if (!storedCommunity &&
            editedCommunityAddress &&
            !inputCommunityIdentifiers.some((communityIdentifier) => localCommunityAddresses.includes(communityIdentifier)) &&
            !localCommunityAddresses.includes(editedCommunityAddress)) {
            return storedCommunity;
        }
        if ((storedCommunity === null || storedCommunity === void 0 ? void 0 : storedCommunity.address) &&
            editedCommunityAddress &&
            storedCommunity.address !== editedCommunityAddress) {
            return storedCommunity;
        }
        const summaryValues = Object.fromEntries(Object.entries(communityEditSummary).map(([propertyName, propertySummary]) => [
            propertyName,
            propertySummary === null || propertySummary === void 0 ? void 0 : propertySummary.value,
        ]));
        return Object.assign(Object.assign({}, (storedCommunity || { address: (communityInput === null || communityInput === void 0 ? void 0 : communityInput.name) || (communityInput === null || communityInput === void 0 ? void 0 : communityInput.publicKey) })), summaryValues);
    }, [account === null || account === void 0 ? void 0 : account.pkc, storedCommunity, communityInput, communityEditSummary]);
    let state = (mergedCommunity === null || mergedCommunity === void 0 ? void 0 : mergedCommunity.updatingState) || "initializing";
    // force succeeded even if the community is fecthing a new update
    if (mergedCommunity === null || mergedCommunity === void 0 ? void 0 : mergedCommunity.updatedAt) {
        state = "succeeded";
    }
    return useMemo(() => (Object.assign(Object.assign({}, mergedCommunity), { state, syncState: (syncStatus === null || syncStatus === void 0 ? void 0 : syncStatus.syncState) || (onlyIfCached ? "stopped" : "initializing"), hasCachedData: typeof (mergedCommunity === null || mergedCommunity === void 0 ? void 0 : mergedCommunity.updatedAt) === "number", lastFetchAttemptAt: syncStatus === null || syncStatus === void 0 ? void 0 : syncStatus.lastFetchAttemptAt, lastSuccessfulFetchAt: syncStatus === null || syncStatus === void 0 ? void 0 : syncStatus.lastSuccessfulFetchAt, error: errors === null || errors === void 0 ? void 0 : errors[errors.length - 1], errors: errors || [] })), [mergedCommunity, communityKey, errors, onlyIfCached, syncStatus]);
}
/**
 * @param community - The community identifier, e.g. {name: 'memes.eth'} or {publicKey: '12D3KooW...'}
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useCommunityStats(options) {
    assert(!options || typeof options === "object", `useCommunityStats options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    const { community, accountName, onlyIfCached } = opts;
    validator.validateUseCommunityStatsArguments({
        community,
        communityAddress: opts.communityAddress,
    });
    const account = useAccount({ accountName });
    const communityKey = community ? getCommunityRefKey(community) : "";
    const fetchedCommunity = useCommunity({ community, onlyIfCached });
    const communityStatsCid = fetchedCommunity === null || fetchedCommunity === void 0 ? void 0 : fetchedCommunity.statsCid;
    const communityStats = useCommunitiesStatsStore((state) => state.communitiesStats[communityKey]);
    const setCommunityStats = useCommunitiesStatsStore((state) => state.setCommunityStats);
    const [fetchError, setFetchError] = useState();
    useEffect(() => {
        setFetchError(undefined);
        if (!communityKey || !communityStatsCid || !account) {
            return;
        }
        let cancelled = false;
        (() => __awaiter(this, void 0, void 0, function* () {
            let fetchedCid;
            try {
                fetchedCid = yield account.pkc.fetchCid({ cid: communityStatsCid });
                fetchedCid = parseFetchedCommunityStats(fetchedCid);
                if (cancelled) {
                    return;
                }
                setCommunityStats(communityKey, fetchedCid);
            }
            catch (error) {
                const normalizedError = error instanceof Error ? error : new Error(typeof error === "string" ? error : "error");
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
        }))();
        return () => {
            cancelled = true;
        };
    }, [communityStatsCid, account === null || account === void 0 ? void 0 : account.id, communityKey, setCommunityStats]);
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
    const state = !communityKey || !account || !communityStatsCid
        ? "uninitialized"
        : fetchError
            ? "failed"
            : communityStats
                ? "succeeded"
                : "fetching-ipfs";
    return useMemo(() => (Object.assign(Object.assign({}, communityStats), { state, error: fetchError, errors: fetchError ? [fetchError] : [] })), [communityStats, state, fetchError]);
}
const useCommunitiesStatsStore = createStore((setState) => ({
    communitiesStats: {},
    setCommunityStats: (communityAddress, communityStats) => setState((state) => ({
        communitiesStats: Object.assign(Object.assign({}, state.communitiesStats), { [communityAddress]: communityStats }),
    })),
}));
/**
 * @param communities - The communities to fetch, e.g. [{name: 'memes.eth'}, {publicKey: '12D3KooW...'}]
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
export function useCommunities(options) {
    assert(!options || typeof options === "object", `useCommunities options argument '${options}' not an object`);
    const opts = options !== null && options !== void 0 ? options : {};
    const { communities: communitiesInput, accountName, onlyIfCached } = opts;
    const account = useAccount({ accountName });
    validator.validateUseCommunitiesArguments({
        communities: communitiesInput,
        communityRefs: opts.communityRefs,
        communityAddresses: opts.communityAddresses,
        account,
    });
    const normalizedCommunityRefs = useMemo(() => communitiesInput || [], [communitiesInput]);
    const communityKeys = useMemo(() => normalizedCommunityRefs.map(getCommunityRefKey), [normalizedCommunityRefs]);
    const communities = useCommunitiesStore((state) => communityKeys.map((communityKey) => state.communities[communityKey || ""]), shallow);
    const communitiesErrors = useCommunitiesStore((state) => communityKeys.map((communityKey) => state.errors[communityKey || ""]), shallow);
    const addCommunityToStore = useCommunitiesStore((state) => state.addCommunityToStore);
    useEffect(() => {
        if (!normalizedCommunityRefs.length || !account) {
            return;
        }
        if (onlyIfCached) {
            return;
        }
        const uniqueCommunityRefs = getUniqueSortedCommunityRefs(normalizedCommunityRefs);
        for (const communityRef of uniqueCommunityRefs) {
            addCommunityToStore(communityRef, account).catch((error) => log.error("useCommunities addCommunityToStore error", { communityRef, error }));
        }
    }, [account === null || account === void 0 ? void 0 : account.id, communityKeys.toString(), onlyIfCached, normalizedCommunityRefs]);
    if (account && normalizedCommunityRefs.length) {
        log("useCommunities", {
            requestedCommunities: normalizedCommunityRefs,
            communityKeys,
            communities,
            account,
        });
    }
    const errors = useMemo(() => communitiesErrors.flatMap((communityErrors) => communityErrors || []), [communitiesErrors]);
    const hasFailedCommunity = communities.some((community, index) => { var _a; return !community && Boolean((_a = communitiesErrors[index]) === null || _a === void 0 ? void 0 : _a.length); });
    const state = hasFailedCommunity
        ? "failed"
        : communities.indexOf(undefined) === -1
            ? "succeeded"
            : "fetching-ipns";
    return useMemo(() => ({
        communities,
        state,
        error: errors[errors.length - 1],
        errors,
    }), [communities, state, errors, communityKeys.toString()]);
}
// TODO: pkc.listCommunities() has been removed, rename this and use event communitieschanged instead of polling
/**
 * Returns all the owner communities created by pkc-js by calling pkc.listCommunities()
 */
export function useListCommunities(accountName) {
    const account = useAccount({ accountName });
    const [communityAddresses, setCommunityAddresses] = useState([]);
    const delay = 1000;
    const immediate = true;
    useInterval(() => {
        const pkc = account === null || account === void 0 ? void 0 : account.pkc;
        if (!pkc)
            return;
        const newAddrs = getPkcCommunityAddresses(pkc);
        if (newAddrs.toString() !== communityAddresses.toString()) {
            log("useListCommunities", { communityAddresses });
            setCommunityAddresses(newAddrs);
        }
    }, delay, immediate);
    return communityAddresses;
}
/**
 * @param communityAddress - The community address to resolve to a public key, e.g. 'news.eth' resolves to '12D3KooW...'.
 * @param acountName - The nickname of the account, e.g. 'Account KoXpxTwfnjA5'. If no accountName is provided, use
 * the active account.
 */
// NOTE: useResolvedCommunityAddress tests are skipped, if changes are made they must be tested manually
export function useResolvedCommunityAddress(options) {
    assert(!options || typeof options === "object", `useResolvedCommunityAddress options argument '${options}' not an object`);
    let { communityAddress, accountName, cache } = options !== null && options !== void 0 ? options : {};
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
    const [resolvedAddress, setResolvedAddress] = useState();
    const [errors, setErrors] = useState([]);
    const [state, setState] = useState();
    let initialState = "initializing";
    // before those defined, nothing can happen
    if (options && account && communityAddress) {
        initialState = "ready";
    }
    useInterval(() => {
        if (!account || !communityAddress) {
            setResolvedAddress(undefined);
            setState(undefined);
            setErrors((prevErrors) => (prevErrors.length ? [] : prevErrors));
            return;
        }
        // address isn't a crypto domain, can't be resolved
        if (!(communityAddress === null || communityAddress === void 0 ? void 0 : communityAddress.includes("."))) {
            if (state !== "failed") {
                setErrors([Error("not a crypto domain")]);
                setState("failed");
                setResolvedAddress(undefined);
            }
            return;
        }
        // only support resolving '.eth' for now
        if (!(communityAddress === null || communityAddress === void 0 ? void 0 : communityAddress.endsWith(".eth"))) {
            if (state !== "failed") {
                setErrors([Error("crypto domain type unsupported")]);
                setState("failed");
                setResolvedAddress(undefined);
            }
            return;
        }
        (() => __awaiter(this, void 0, void 0, function* () {
            try {
                setState("resolving");
                const res = yield resolveCommunityAddress(communityAddress, chainProviders);
                setState("succeeded");
                if (res !== resolvedAddress) {
                    setResolvedAddress(res);
                }
            }
            catch (error) {
                setErrors([...errors, error]);
                setState("failed");
                setResolvedAddress(undefined);
                log.error("useResolvedCommunityAddress resolveCommunityAddress error", {
                    communityAddress,
                    chainProviders,
                    error,
                });
            }
        }))();
    }, interval, true, [communityAddress, chainProviders]);
    // only support ENS at the moment
    const chainProvider = chainProviders === null || chainProviders === void 0 ? void 0 : chainProviders["eth"];
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
export const resolveCommunityAddress = (communityAddress, chainProviders) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    let resolvedCommunityAddress;
    if (communityAddress.endsWith(".eth")) {
        resolvedCommunityAddress = yield resolveEnsTxtRecord(communityAddress, "community-address", "eth", (_b = (_a = chainProviders === null || chainProviders === void 0 ? void 0 : chainProviders["eth"]) === null || _a === void 0 ? void 0 : _a.urls) === null || _b === void 0 ? void 0 : _b[0], (_c = chainProviders === null || chainProviders === void 0 ? void 0 : chainProviders["eth"]) === null || _c === void 0 ? void 0 : _c.chainId);
    }
    else {
        throw Error(`resolveCommunityAddress invalid communityAddress '${communityAddress}'`);
    }
    return resolvedCommunityAddress;
});
//# sourceMappingURL=communities.js.map