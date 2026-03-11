import {
  Account,
  Role,
  Communities,
  AccountComment,
  AccountsComments,
  CommentCidsToAccountsComments,
  Comment,
} from "../../types";
import assert from "assert";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import commentsStore from "../comments";
import repliesPagesStore from "../replies-pages";
import communitiesPagesStore from "../communities-pages";
import PlebbitJs from "../../lib/plebbit-js";

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

export const addShortAddressesToAccountComment = (comment: Comment) => {
  comment = { ...comment };
  try {
    comment.shortCommunityAddress = PlebbitJs.Plebbit.getShortAddress({
      address: comment.communityAddress,
    });
  } catch (e) {}
  try {
    comment.author = { ...comment.author };
    comment.author.shortAddress = PlebbitJs.Plebbit.getShortAddress({
      address: comment.author.address,
    });
  } catch (e) {}
  return comment;
};

const utils = {
  getAccountCommunities,
  getCommentCidsToAccountsComments,
  fetchCommentLinkDimensions,
  getInitAccountCommentsToUpdate,
  getAccountCommentDepth,
  addShortAddressesToAccountComment,
  promiseAny,
};

export default utils;
