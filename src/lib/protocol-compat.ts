import assert from "./assert";

export const getPkcCreateCommunity = (pkc: any) => pkc?.createCommunity;

export const getPkcGetCommunity = (pkc: any) => pkc?.getCommunity;

export const getPkcCreateCommunityEdit = (pkc: any) => pkc?.createCommunityEdit;

export const getPkcCommunityAddresses = (pkc: any): string[] => {
  if (Array.isArray(pkc?.communities)) {
    return pkc.communities;
  }
  return [];
};

export const normalizePublicationOptionsForPkc = <T extends Record<string, any>>(
  _pkc: any,
  options: T,
): T => options;

export const normalizePublicationOptionsForStore = <T extends Record<string, any>>(options: T): T =>
  options;

export const normalizeCommunityEditOptionsForPkc = <T extends Record<string, any>>(
  pkc: any,
  options: T,
): T => {
  const normalized: Record<string, any> = normalizePublicationOptionsForPkc(pkc, options);
  const editOptions = normalized.communityEdit;
  if (!editOptions) {
    return normalized as T;
  }
  normalized.communityEdit = editOptions;
  return normalized as T;
};

export const getCommentCommunityAddress = (comment: any): string | undefined =>
  comment?.communityAddress;

const isLiveCommentInstance = (comment: any) =>
  typeof comment?.on === "function" ||
  typeof comment?.once === "function" ||
  typeof comment?.update === "function";

export const normalizeCommentCommunityAddress = <T extends Record<string, any> | undefined>(
  comment: T,
): T => {
  if (!comment || comment.communityAddress) {
    return comment;
  }
  return isLiveCommentInstance(comment) ? comment : ({ ...comment } as T);
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
  const communityAddress = options?.communityAddress;
  if (!communityAddress) {
    return publication;
  }
  publication.communityAddress = communityAddress;
  return publication;
};

export const createPkcCommunity = async (pkc: any, options: any) => {
  const createCommunity = getPkcCreateCommunity(pkc);
  assert(typeof createCommunity === "function", "pkc createCommunity missing");
  return createCommunity.call(pkc, options);
};

export const getPkcCommunity = async (pkc: any, options: any) => {
  const getCommunity = getPkcGetCommunity(pkc);
  assert(typeof getCommunity === "function", "pkc getCommunity missing");
  return getCommunity.call(pkc, options);
};

export const createPkcCommunityEdit = async (pkc: any, options: any) => {
  const createCommunityEdit = getPkcCreateCommunityEdit(pkc);
  assert(typeof createCommunityEdit === "function", "pkc createCommunityEdit missing");
  return createCommunityEdit.call(pkc, options);
};
