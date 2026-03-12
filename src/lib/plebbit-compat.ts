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

export const normalizePublicationOptionsForPlebbit = <T extends Record<string, any>>(
  _plebbit: any,
  options: T,
): T => {
  const communityAddress = options.communityAddress ?? options.subplebbitAddress;
  if (!communityAddress) {
    return options;
  }
  // The pinned plebbit-js dependency still documents and validates publication payloads with
  // legacy subplebbit* field names even when some community lifecycle methods are renamed.
  const normalized: Record<string, any> = { ...options, subplebbitAddress: communityAddress };
  delete normalized.communityAddress;
  return normalized as T;
};

export const normalizePublicationOptionsForStore = <T extends Record<string, any>>(
  options: T,
): T => {
  const communityAddress = options.communityAddress ?? options.subplebbitAddress;
  if (!communityAddress) {
    return options;
  }
  const normalized: Record<string, any> = { ...options, communityAddress };
  delete normalized.subplebbitAddress;
  return normalized as T;
};

export const normalizeCommunityEditOptionsForPlebbit = <T extends Record<string, any>>(
  plebbit: any,
  options: T,
): T => {
  const normalized: Record<string, any> = normalizePublicationOptionsForPlebbit(plebbit, options);
  const editOptions = normalized.communityEdit ?? normalized.subplebbitEdit;
  if (!editOptions) {
    return normalized as T;
  }
  normalized.subplebbitEdit = editOptions;
  delete normalized.communityEdit;
  return normalized as T;
};

export const getCommentCommunityAddress = (comment: any): string | undefined =>
  comment?.communityAddress || comment?.subplebbitAddress;

const isLiveCommentInstance = (comment: any) =>
  typeof comment?.on === "function" ||
  typeof comment?.once === "function" ||
  typeof comment?.update === "function";

export const normalizeCommentCommunityAddress = <T extends Record<string, any> | undefined>(
  comment: T,
): T => {
  if (!comment || comment.communityAddress || !comment.subplebbitAddress) {
    return comment;
  }
  if (isLiveCommentInstance(comment)) {
    comment.communityAddress = comment.subplebbitAddress;
    return comment;
  }
  return { ...comment, communityAddress: comment.subplebbitAddress } as T;
};

export const backfillPublicationCommunityAddress = <
  T extends Record<string, any> | undefined,
  O extends Record<string, any> | undefined,
>(
  publication: T,
  options: O,
): T => {
  if (!publication || publication.communityAddress) {
    return publication;
  }
  const communityAddress =
    publication.subplebbitAddress ?? options?.communityAddress ?? options?.subplebbitAddress;
  if (!communityAddress) {
    return publication;
  }
  publication.communityAddress = communityAddress;
  return publication;
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
