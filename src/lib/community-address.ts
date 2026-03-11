const isEthAliasDomain = (address: string) => {
  const lower = address.toLowerCase();
  return lower.endsWith(".eth") || lower.endsWith(".bso");
};

export const normalizeEthAliasDomain = (address: string) =>
  address.toLowerCase().endsWith(".bso") ? address.slice(0, -4) + ".eth" : address;

export const getCanonicalCommunityAddress = (address: string) =>
  address.toLowerCase().endsWith(".eth") ? address.slice(0, -4) + ".bso" : address;

export const getEquivalentCommunityAddressGroupKey = (address: string) => {
  const lower = address.toLowerCase();
  return isEthAliasDomain(lower) ? getCanonicalCommunityAddress(lower) : address;
};

export const pickPreferredEquivalentCommunityAddress = (addresses: string[]) =>
  addresses.find((address) => address.toLowerCase().endsWith(".bso")) || addresses[0];

export const areEquivalentCommunityAddresses = (addressA?: string, addressB?: string) => {
  if (addressA === addressB) {
    return true;
  }
  if (typeof addressA !== "string" || typeof addressB !== "string") {
    return false;
  }
  const lowerA = addressA.toLowerCase();
  const lowerB = addressB.toLowerCase();
  if (!isEthAliasDomain(lowerA) || !isEthAliasDomain(lowerB)) {
    return false;
  }
  return normalizeEthAliasDomain(lowerA) === normalizeEthAliasDomain(lowerB);
};
