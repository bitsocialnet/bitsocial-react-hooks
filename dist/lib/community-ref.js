import assert from "assert";
import { areEquivalentCommunityAddresses } from "./community-address.js";
const getLegacyCommunityAddress = (communityRef) => communityRef.address;
export const getCommunityRefKey = (communityRef) => {
    const communityKey = communityRef.publicKey || getLegacyCommunityAddress(communityRef) || communityRef.name;
    assert(typeof communityKey === "string" && communityKey.length > 0, "community ref missing key");
    return communityKey;
};
export const getCommunityRefKeys = (communityRefs) => communityRefs.map(getCommunityRefKey);
export const getCommunityLookupOptions = (communityRefOrAddress) => {
    if (typeof communityRefOrAddress === "string") {
        return { address: communityRefOrAddress };
    }
    const legacyCommunityAddress = getLegacyCommunityAddress(communityRefOrAddress);
    if (legacyCommunityAddress) {
        return { address: legacyCommunityAddress };
    }
    const options = {};
    if (communityRefOrAddress.name) {
        options.name = communityRefOrAddress.name;
    }
    if (communityRefOrAddress.publicKey) {
        options.publicKey = communityRefOrAddress.publicKey;
    }
    return options;
};
export const mergeCommunityRefs = (base, extra) => {
    const mergedAddress = getLegacyCommunityAddress(base) || getLegacyCommunityAddress(extra);
    const mergedName = base.name || extra.name;
    const mergedPublicKey = base.publicKey || extra.publicKey;
    if (mergedPublicKey) {
        return Object.assign(Object.assign({ publicKey: mergedPublicKey }, (mergedAddress ? { address: mergedAddress } : undefined)), (mergedName ? { name: mergedName } : undefined));
    }
    if (mergedAddress) {
        return Object.assign({ address: mergedAddress }, (mergedName ? { name: mergedName } : undefined));
    }
    assert(typeof mergedName === "string" && mergedName.length > 0, "community ref missing name");
    return { name: mergedName };
};
export const getUniqueSortedCommunityRefs = (communityRefs) => {
    const refsByKey = new Map();
    for (const communityRef of communityRefs || []) {
        const communityKey = getCommunityRefKey(communityRef);
        const existingCommunityRef = refsByKey.get(communityKey);
        refsByKey.set(communityKey, existingCommunityRef ? mergeCommunityRefs(existingCommunityRef, communityRef) : communityRef);
    }
    return [...refsByKey.entries()]
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([, communityRef]) => communityRef);
};
export const isCommunityRef = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const communityRef = value;
    const hasAddress = typeof communityRef.address === "string" && communityRef.address.length > 0;
    const hasName = typeof communityRef.name === "string" && communityRef.name.length > 0;
    const hasPublicKey = typeof communityRef.publicKey === "string" && communityRef.publicKey.length > 0;
    return hasAddress || hasName || hasPublicKey;
};
export function assertCommunityRef(value, label) {
    assert(isCommunityRef(value), `${label} must be an object with address, name, or publicKey`);
}
export const doesAddressMatchCommunityRef = (communityAddress, communityRef, community) => {
    if (typeof communityAddress !== "string") {
        return false;
    }
    const legacyCommunityAddress = getLegacyCommunityAddress(communityRef);
    if (legacyCommunityAddress) {
        if (communityAddress === legacyCommunityAddress) {
            return true;
        }
        if (areEquivalentCommunityAddresses(communityAddress, legacyCommunityAddress)) {
            return true;
        }
    }
    if (communityRef.publicKey && communityAddress === communityRef.publicKey) {
        return true;
    }
    if (communityRef.name) {
        if (communityAddress === communityRef.name) {
            return true;
        }
        if (areEquivalentCommunityAddresses(communityAddress, communityRef.name)) {
            return true;
        }
    }
    const communityIdentifiers = [community === null || community === void 0 ? void 0 : community.address, community === null || community === void 0 ? void 0 : community.publicKey, community === null || community === void 0 ? void 0 : community.name];
    for (const identifier of communityIdentifiers) {
        if (typeof identifier !== "string") {
            continue;
        }
        if (communityAddress === identifier) {
            return true;
        }
        if (areEquivalentCommunityAddresses(communityAddress, identifier)) {
            return true;
        }
    }
    return false;
};
export const getMatchingCommunityRefKeys = (communityRefs, communityAddress, community) => {
    const matchingCommunityKeys = new Set();
    for (const communityRef of communityRefs) {
        if (doesAddressMatchCommunityRef(communityAddress, communityRef, community)) {
            matchingCommunityKeys.add(getCommunityRefKey(communityRef));
        }
    }
    return [...matchingCommunityKeys];
};
//# sourceMappingURL=community-ref.js.map