const isEthAliasDomain = (address: string) => {
  const lower = address.toLowerCase();
  return lower.endsWith(".eth") || lower.endsWith(".bso");
};

export const normalizeEthAliasDomain = (address: string) =>
  address.endsWith(".bso") ? address.slice(0, -4) + ".eth" : address;

export const areEquivalentSubplebbitAddresses = (addressA?: string, addressB?: string) => {
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
