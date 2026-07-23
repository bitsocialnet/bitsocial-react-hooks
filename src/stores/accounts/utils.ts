import {
  Account,
  Role,
  Communities,
  AccountComment,
  AccountsComments,
  AccountsCommentsIndexes,
  AccountCommentsIndex,
  CommentCidsToAccountsComments,
  Comment,
  AccountEdit,
  AccountEditsSummary,
} from "../../types";
import assert from "assert";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import commentsStore from "../comments";
import repliesPagesStore from "../replies-pages";
import communitiesPagesStore from "../communities-pages";
import repliesCommentsStore from "../replies/replies-comments-store";
import PkcJs from "../../lib/pkc-js";
import { getCommentVoteCountsVersion } from "../../lib/utils/optimistic-vote-counts";

const getAuthorAddressRolesFromCommunities = (authorAddress: string, communities: Communities) => {
  const roles: { [communityAddress: string]: Role } = {};
  for (const communityAddress in communities) {
    const role = communities[communityAddress]?.roles?.[authorAddress];
    if (role) {
      roles[communityAddress] = role;
    }
  }
  return roles;
};

export const getAccountCommunities = (account: Account, communities: Communities) => {
  assert(
    account?.author?.address && typeof account?.author?.address === "string",
    `accountsStore utils getAccountCommunities invalid account.author.address '${account?.author?.address}'`,
  );
  assert(
    communities && typeof communities === "object",
    `accountsStore utils getAccountCommunities invalid communities '${communities}'`,
  );

  const roles = getAuthorAddressRolesFromCommunities(account.author.address, communities);
  const accountCommunities = { ...account.communities };
  for (const communityAddress in roles) {
    accountCommunities[communityAddress] = { ...accountCommunities[communityAddress] };
    accountCommunities[communityAddress].role = roles[communityAddress];
  }
  return accountCommunities;
};

export const getCommentCidsToAccountsComments = (accountsComments: AccountsComments) => {
  const commentCidsToAccountsComments: CommentCidsToAccountsComments = {};
  for (const accountId in accountsComments) {
    for (const accountComment of accountsComments[accountId]) {
      if (accountComment.cid) {
        commentCidsToAccountsComments[accountComment.cid] = {
          accountId,
          accountCommentIndex: accountComment.index,
        };
      }
    }
  }
  return commentCidsToAccountsComments;
};

const cloneWithoutFunctions = (value: any): any => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cloneWithoutFunctions(entry))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") {
    return typeof value === "function" ? undefined : value;
  }

  const clonedValue: Record<string, any> = {};
  for (const key in value) {
    if (typeof value[key] === "function") {
      continue;
    }
    const clonedChild = cloneWithoutFunctions(value[key]);
    if (clonedChild !== undefined) {
      clonedValue[key] = clonedChild;
    }
  }
  return clonedValue;
};

const compactStoredCommentAuthor = (author: any) => {
  if (!author || typeof author !== "object") {
    return undefined;
  }

  const compactAuthor = cloneWithoutFunctions({
    address: author.address,
    shortAddress: author.shortAddress,
    displayName: author.displayName,
    avatar: author.avatar,
    flair: author.flair,
  });

  return compactAuthor && Object.keys(compactAuthor).length > 0 ? compactAuthor : undefined;
};

const compactStoredOriginalComment = (originalComment: any) => {
  if (!originalComment || typeof originalComment !== "object") {
    return undefined;
  }

  const compactOriginalComment = cloneWithoutFunctions({
    cid: originalComment.cid,
    content: originalComment.content,
    title: originalComment.title,
    link: originalComment.link,
    linkWidth: originalComment.linkWidth,
    linkHeight: originalComment.linkHeight,
    linkHtmlTagName: originalComment.linkHtmlTagName,
    thumbnailUrl: originalComment.thumbnailUrl,
    media: originalComment.media,
    spoiler: originalComment.spoiler,
    nsfw: originalComment.nsfw,
    deleted: originalComment.deleted,
    removed: originalComment.removed,
    reason: originalComment.reason,
    quotedCids: originalComment.quotedCids,
    parentCid: originalComment.parentCid,
    postCid: originalComment.postCid,
    communityAddress: originalComment.communityAddress,
    timestamp: originalComment.timestamp,
    author: compactStoredCommentAuthor(originalComment.author),
  });

  return compactOriginalComment && Object.keys(compactOriginalComment).length > 0
    ? compactOriginalComment
    : undefined;
};

const compactStoredReplies = (replies: any) => {
  if (!replies || typeof replies !== "object") {
    return undefined;
  }

  const compactReplies = cloneWithoutFunctions(
    Object.fromEntries(
      Object.entries(replies).filter(
        ([replyKey]) => replyKey !== "pages" && replyKey !== "clients",
      ),
    ),
  );

  return compactReplies && Object.keys(compactReplies).length > 0 ? compactReplies : undefined;
};

export const sanitizeAccountCommentForState = (comment: Comment) => {
  const sanitizedComment = cloneWithoutFunctions({
    ...comment,
    signer: undefined,
    raw: undefined,
    replies: comment?.replies
      ? Object.fromEntries(
          Object.entries(comment.replies).filter(([replyKey]) => replyKey !== "pages"),
        )
      : comment?.replies,
  });

  if (!sanitizedComment || typeof sanitizedComment !== "object") {
    return sanitizedComment;
  }
  if (sanitizedComment?.replies?.pages) {
    sanitizedComment.replies = { ...sanitizedComment.replies };
    delete sanitizedComment.replies.pages;
  }
  if (sanitizedComment?.replies && Object.keys(sanitizedComment.replies).length === 0) {
    delete sanitizedComment.replies;
  }
  return sanitizedComment;
};

export const sanitizeStoredAccountComment = (comment: Comment) => {
  const preprocessedComment = {
    ...comment,
    signer: undefined,
    clients: undefined,
    raw: undefined,
    replies: compactStoredReplies(comment?.replies),
    original: comment?.edit ? compactStoredOriginalComment(comment.original) : undefined,
  };
  const sanitizedComment = cloneWithoutFunctions(preprocessedComment);
  if (!sanitizedComment || typeof sanitizedComment !== "object") {
    return sanitizedComment;
  }
  if (sanitizedComment?.replies && Object.keys(sanitizedComment.replies).length === 0) {
    delete sanitizedComment.replies;
  }
  if (sanitizedComment?.original && Object.keys(sanitizedComment.original).length === 0) {
    delete sanitizedComment.original;
  }
  return sanitizedComment;
};

export const getAccountCommentsIndex = (
  accountComments: AccountComment[] | undefined,
): AccountCommentsIndex => {
  const index: AccountCommentsIndex = {
    byCommunityAddress: {},
    byParentCid: {},
  };
  for (const accountComment of accountComments || []) {
    if (accountComment.communityAddress) {
      if (!index.byCommunityAddress[accountComment.communityAddress]) {
        index.byCommunityAddress[accountComment.communityAddress] = [];
      }
      index.byCommunityAddress[accountComment.communityAddress].push(accountComment.index);
    }
    if (accountComment.parentCid) {
      if (!index.byParentCid[accountComment.parentCid]) {
        index.byParentCid[accountComment.parentCid] = [];
      }
      index.byParentCid[accountComment.parentCid].push(accountComment.index);
    }
  }
  return index;
};

export const getAccountsCommentsIndexes = (accountsComments: AccountsComments) => {
  const indexes: AccountsCommentsIndexes = {};
  for (const accountId in accountsComments) {
    indexes[accountId] = getAccountCommentsIndex(accountsComments[accountId]);
  }
  return indexes;
};

const accountEditNonPropertyNames = new Set([
  "author",
  "signer",
  "clientId",
  "commentCid",
  "communityAddress",
  "communityAddress",
  "timestamp",
]);

export const COMMENT_MODERATION_AUTHOR_SUMMARY_KEY = "commentModeration.author";

const normalizeAccountEditForSummary = (accountEdit: AccountEdit) => {
  const normalizedAccountEdit = { ...accountEdit };
  const commentModeration = normalizedAccountEdit.commentModeration;
  if (commentModeration && typeof commentModeration === "object") {
    const { author, ...commentModerationProperties } = commentModeration;
    Object.assign(normalizedAccountEdit, commentModerationProperties);
    if (Object.prototype.hasOwnProperty.call(commentModeration, "author")) {
      normalizedAccountEdit[COMMENT_MODERATION_AUTHOR_SUMMARY_KEY] = author;
    }
    delete normalizedAccountEdit.commentModeration;
  }
  const communityEdit = normalizedAccountEdit.communityEdit ?? normalizedAccountEdit.communityEdit;
  if (communityEdit && typeof communityEdit === "object") {
    Object.assign(normalizedAccountEdit, communityEdit);
  }
  delete normalizedAccountEdit.communityEdit;
  delete normalizedAccountEdit.communityEdit;
  return normalizedAccountEdit;
};

export const getAccountEditPropertySummary = (accountEdits: AccountEdit[] | undefined) => {
  const accountEditPropertySummary: AccountEditsSummary[string] = {};
  for (const accountEdit of accountEdits || []) {
    const normalizedAccountEdit = normalizeAccountEditForSummary(accountEdit);
    for (const propertyName in normalizedAccountEdit) {
      if (
        (normalizedAccountEdit[propertyName] === undefined &&
          propertyName !== COMMENT_MODERATION_AUTHOR_SUMMARY_KEY) ||
        accountEditNonPropertyNames.has(propertyName)
      ) {
        continue;
      }
      const previousTimestamp = accountEditPropertySummary[propertyName]?.timestamp || 0;
      if ((normalizedAccountEdit.timestamp || 0) >= previousTimestamp) {
        accountEditPropertySummary[propertyName] = {
          timestamp: normalizedAccountEdit.timestamp,
          value: normalizedAccountEdit[propertyName],
        };
      }
    }
  }
  return accountEditPropertySummary;
};

export const getAccountsEditsSummary = (accountEdits: {
  [commentCidOrCommunityAddress: string]: AccountEdit[];
}) => {
  const summary: AccountEditsSummary = {};
  for (const target in accountEdits || {}) {
    summary[target] = getAccountEditPropertySummary(accountEdits[target]);
  }
  return summary;
};

interface CommentLinkDimensions {
  linkWidth?: number;
  linkHeight?: number;
  linkHtmlTagName?: "img" | "video" | "audio";
}

// polyfill Promise.any, exported for test coverage of empty-array branch
const promiseAny = <T>(promises: Promise<T>[]): Promise<T> =>
  new Promise((res, rej) => {
    let count = promises.length;
    if (count === 0) return rej(Error("all promises rejected"));
    promises.forEach((p) =>
      Promise.resolve(p)
        .then(res)
        .catch((e) => {
          if (--count === 0) rej(Error("all promises rejected"));
        }),
    );
  });

export const fetchCommentLinkDimensions = async (link: string): Promise<CommentLinkDimensions> => {
  if (!link) {
    return {};
  }

  const fetchImageDimensions = (url: string) =>
    new Promise<CommentLinkDimensions>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        // don't accept 0px value
        if (!image.width || !image.height) {
          return reject(Error(`failed fetching image dimensions for url '${url}'`));
        }
        resolve({
          linkWidth: image.width,
          linkHeight: image.height,
          linkHtmlTagName: "img",
        });

        // remove image from memory
        try {
          image.src = "";
        } catch (e) {}
      };
      image.onerror = (error) => {
        reject(Error(`failed fetching image dimensions for url '${url}'`));
      };

      // max loading time
      const timeout = 10000;
      setTimeout(
        () =>
          reject(Error(`failed fetching image dimensions for url '${url}' timeout '${timeout}'`)),
        timeout,
      );

      // start loading
      image.src = url;
    });

  const fetchVideoDimensions = (url: string) =>
    new Promise<CommentLinkDimensions>((resolve, reject) => {
      const video = document.createElement("video");
      video.muted = true;
      video.loop = false;
      video.addEventListener("loadeddata", () => {
        // don't accept 0px value
        if (!video.videoWidth || !video.videoHeight) {
          return reject(Error(`failed fetching video dimensions for url '${url}'`));
        }
        resolve({
          linkWidth: video.videoWidth,
          linkHeight: video.videoHeight,
          linkHtmlTagName: "video",
        });
        // prevent video from playing
        try {
          video.pause();
        } catch (e) {}
        // prevent video from loading
        try {
          video.src = "";
        } catch (e) {}
      });
      video.addEventListener("error", (error) => {
        reject(Error(`failed fetching video dimensions for url '${url}'`));
      });

      // max loading time
      const timeout = 30000;
      setTimeout(
        () =>
          reject(Error(`failed fetching video dimensions for url '${url}' timeout '${timeout}'`)),
        timeout,
      );

      // start loading
      video.src = url;
    });

  const fetchAudio = (url: string) =>
    new Promise<CommentLinkDimensions>((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.addEventListener("loadeddata", () => {
        resolve({
          linkHtmlTagName: "audio",
        });
        try {
          audio.pause();
        } catch {}
        try {
          audio.src = "";
        } catch {}
      });
      audio.addEventListener("error", () =>
        reject(Error(`failed fetching audio html tag name for url '${url}'`)),
      );

      const timeout = 20000;
      setTimeout(
        () =>
          reject(
            Error(`failed fetching audio html tag name for url '${url}' timeout '${timeout}'`),
          ),
        timeout,
      );

      audio.src = url;
    });

  try {
    if (new URL(link).protocol !== "https:") {
      throw Error(`failed fetching comment.link dimensions for link '${link}' not https protocol`);
    }
    const dimensions = await promiseAny([
      fetchImageDimensions(link),
      fetchVideoDimensions(link),
      fetchAudio(link),
    ]);
    return dimensions;
  } catch (error: any) {
    log.error("fetchCommentLinkDimensions error", { error, link });
    return {};
  }
};

export const getInitAccountCommentsToUpdate = (accountsComments: AccountsComments) => {
  const accountCommentsToUpdate: { accountComment: AccountComment; accountId: string }[] = [];
  for (const accountId in accountsComments) {
    for (const accountComment of accountsComments[accountId]) {
      accountCommentsToUpdate.push({ accountComment, accountId });
    }
  }

  // update newer comments first, more likely to have notifications
  accountCommentsToUpdate.sort((a, b) => b.accountComment.timestamp - a.accountComment.timestamp);

  // updating too many comments during init slows down fetching comments/subs
  if (accountCommentsToUpdate.length > 10) {
    accountCommentsToUpdate.length = 10;
  }

  // TODO: add some algo to fetch all notifications (even old), but not on init
  // during downtimes when we're not fetching anything else
  return accountCommentsToUpdate;
};

export const getAccountCommentDepth = (comment: Comment) => {
  if (!comment.parentCid) {
    return 0;
  }
  let parentCommentDepth = commentsStore.getState().comments[comment.parentCid]?.depth;
  if (typeof parentCommentDepth === "number") {
    return parentCommentDepth + 1;
  }
  parentCommentDepth = repliesPagesStore.getState().comments[comment.parentCid]?.depth;
  if (typeof parentCommentDepth === "number") {
    return parentCommentDepth + 1;
  }
  parentCommentDepth = communitiesPagesStore.getState().comments[comment.parentCid]?.depth;
  if (typeof parentCommentDepth === "number") {
    return parentCommentDepth + 1;
  }
  // if can't find the parent comment depth anywhere, don't include it with the account comment
  // it will be added automatically when challenge verification is received
};

export const getFreshestLoadedComment = (
  commentCid: string,
  ...additionalCandidates: (Comment | undefined)[]
): Comment | undefined => {
  const candidates = [
    commentsStore.getState().comments[commentCid],
    repliesPagesStore.getState().comments[commentCid],
    communitiesPagesStore.getState().comments[commentCid],
    repliesCommentsStore.getState().comments[commentCid],
    ...additionalCandidates,
  ];
  return candidates.reduce<Comment | undefined>(
    (freshest, candidate) =>
      getCommentVoteCountsVersion(candidate) > getCommentVoteCountsVersion(freshest)
        ? candidate
        : freshest,
    undefined,
  );
};

export const addShortAddressesToAccountComment = (comment: Comment) => {
  comment = { ...comment };
  try {
    comment.shortCommunityAddress = PkcJs.PKC.getShortAddress({
      address: comment.communityAddress,
    });
  } catch (e) {}
  try {
    comment.author = { ...comment.author };
    comment.author.shortAddress = PkcJs.PKC.getShortAddress({
      address: comment.author.address,
    });
  } catch (e) {}
  return comment;
};

const utils = {
  getAccountCommunities,
  getCommentCidsToAccountsComments,
  getAccountCommentsIndex,
  getAccountsCommentsIndexes,
  sanitizeAccountCommentForState,
  sanitizeStoredAccountComment,
  getAccountEditPropertySummary,
  getAccountsEditsSummary,
  fetchCommentLinkDimensions,
  getInitAccountCommentsToUpdate,
  getAccountCommentDepth,
  getFreshestLoadedComment,
  addShortAddressesToAccountComment,
  promiseAny,
};

export default utils;
