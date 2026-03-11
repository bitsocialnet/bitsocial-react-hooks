import assert from "assert";

export const getPlebbitCreateCommunity = (plebbit: any) =>
  plebbit?.createCommunity || plebbit?.createSubplebbit;

export const getPlebbitGetCommunity = (plebbit: any) =>
  plebbit?.getCommunity || plebbit?.getSubplebbit;

export const getPlebbitCreateCommunityEdit = (plebbit: any) =>
  plebbit?.createCommunityEdit || plebbit?.createSubplebbitEdit;

export const getPlebbitCommunityAddresses = (plebbit: any): string[] => {
  if (Array.isArray(plebbit?.communities)) {
    return plebbit.communities;
  }
  if (Array.isArray(plebbit?.subplebbits)) {
    return plebbit.subplebbits;
  }
  return [];
};

export const withLegacySubplebbitAddress = <T extends Record<string, any>>(options: T): T => {
  const communityAddress = options.communityAddress ?? options.subplebbitAddress;
  if (!communityAddress) {
    return options;
  }
  return {
    ...options,
    communityAddress,
    subplebbitAddress: options.subplebbitAddress ?? communityAddress,
  };
};

export const getCommentCommunityAddress = (comment: any): string | undefined =>
  comment?.communityAddress || comment?.subplebbitAddress;

export const normalizeCommentCommunityAddress = <T extends Record<string, any> | undefined>(
  comment: T,
): T => {
  if (!comment || comment.communityAddress || !comment.subplebbitAddress) {
    return comment;
  }
  return { ...comment, communityAddress: comment.subplebbitAddress } as T;
};

export const createPlebbitCommunity = async (plebbit: any, options: any) => {
  const createCommunity = getPlebbitCreateCommunity(plebbit);
  assert(typeof createCommunity === "function", "plebbit createCommunity/createSubplebbit missing");
  return createCommunity.call(plebbit, options);
};

export const getPlebbitCommunity = async (plebbit: any, options: any) => {
  const getCommunity = getPlebbitGetCommunity(plebbit);
  assert(typeof getCommunity === "function", "plebbit getCommunity/getSubplebbit missing");
  return getCommunity.call(plebbit, options);
};

export const createPlebbitCommunityEdit = async (plebbit: any, options: any) => {
  const createCommunityEdit = getPlebbitCreateCommunityEdit(plebbit);
  assert(
    typeof createCommunityEdit === "function",
    "plebbit createCommunityEdit/createSubplebbitEdit missing",
  );
  return createCommunityEdit.call(plebbit, options);
};
