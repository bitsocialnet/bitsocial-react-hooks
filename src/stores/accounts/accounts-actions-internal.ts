// internal accounts actions that are not called by the user

import accountsStore, { listeners } from "./accounts-store";
import accountsDatabase from "./accounts-database";
import Logger from "@plebbit/plebbit-logger";
import assert from "assert";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import {
  Account,
  PublishCommentOptions,
  AccountCommentReply,
  Comment,
  AccountsComments,
  AccountCommentsReplies,
  Community,
} from "../../types";
import utils from "../../lib/utils";

// TODO: we currently subscribe to updates for every single comment
// in the user's account history. This probably does not scale, we
// need to eventually schedule and queue older comments to look
// for updates at a lower priority.
export const startUpdatingAccountCommentOnCommentUpdateEvents = async (
  comment: Comment,
  account: Account,
  accountCommentIndex: number,
) => {
  assert(
    typeof accountCommentIndex === "number",
    `startUpdatingAccountCommentOnCommentUpdateEvents accountCommentIndex '${accountCommentIndex}' not a number`,
  );
  assert(
    typeof account?.id === "string",
    `startUpdatingAccountCommentOnCommentUpdateEvents account '${account}' account.id '${account?.id}' not a string`,
  );
  const commentArgument = comment;

  // comment doesn't have a cid yet, so can't receive updates
  if (!comment.cid) {
    return;
  }

  // account comment already updating
  if (accountsStore.getState().accountsCommentsUpdating[comment.cid]) {
    return;
  }
  accountsStore.setState(({ accountsCommentsUpdating }) => ({
    accountsCommentsUpdating: { ...accountsCommentsUpdating, [comment.cid]: true },
  }));

  // comment is not a `Comment` instance
  if (!comment.on) {
    comment = await account.plebbit.createComment(comment);
  }

  comment.on("update", async (updatedComment: Comment) => {
    const mapping =
      accountsStore.getState().commentCidsToAccountsComments[updatedComment.cid || ""];
    if (!mapping || mapping.accountId !== account.id) {
      accountsStore.setState(({ accountsCommentsUpdating }) => {
        const next = { ...accountsCommentsUpdating };
        delete next[updatedComment.cid || ""];
        return { accountsCommentsUpdating: next };
      });
      try {
        if (typeof comment.removeAllListeners === "function") comment.removeAllListeners();
        if (typeof (comment as any).stop === "function") (comment as any).stop();
      } catch (e) {
        log.trace("startUpdatingAccountCommentOnCommentUpdateEvents stop/removeAllListeners", {
          cid: updatedComment.cid,
          error: e,
        });
      }
      return;
    }
    const currentIndex = mapping.accountCommentIndex;

    // merge should not be needed if plebbit-js is implemented properly, but no harm in fixing potential errors
    updatedComment = utils.merge(commentArgument, comment, updatedComment);
    await accountsDatabase.addAccountComment(account.id, updatedComment, currentIndex);
    log("startUpdatingAccountCommentOnCommentUpdateEvents comment update", {
      commentCid: comment.cid,
      accountCommentIndex: currentIndex,
      updatedComment,
      account,
    });
    accountsStore.setState(({ accountsComments }) => {
      // account no longer exists
      if (!accountsComments[account.id]) {
        log.error(
          `startUpdatingAccountCommentOnCommentUpdateEvents comment.on('update') invalid accountsStore.accountsComments['${account.id}'] '${
            accountsComments[account.id]
          }', account may have been deleted`,
        );
        return {};
      }

      const updatedAccountComments = [...accountsComments[account.id]];
      const previousComment = updatedAccountComments[currentIndex];
      const updatedAccountComment = utils.clone({
        ...updatedComment,
        index: currentIndex,
        accountId: account.id,
      });
      updatedAccountComments[currentIndex] = updatedAccountComment;
      return { accountsComments: { ...accountsComments, [account.id]: updatedAccountComments } };
    });

    // update AccountCommentsReplies with new replies if has any new replies
    const replyPageArray: any[] = Object.values(updatedComment.replies?.pages || {});
    const getReplyCount = (replyPage: any) => replyPage?.comments?.length ?? 0;
    const replyCount =
      replyPageArray.length > 0
        ? replyPageArray.map(getReplyCount).reduce((prev, curr) => prev + curr)
        : 0;
    const hasReplies = replyCount > 0;
    const repliesAreValid = await utils.repliesAreValid(
      updatedComment,
      { validateReplies: false, blockCommunity: true },
      account.plebbit,
    );

    if (hasReplies && repliesAreValid) {
      accountsStore.setState(({ accountsCommentsReplies }) => {
        // account no longer exists
        if (!accountsCommentsReplies[account.id]) {
          log.error(
            `startUpdatingAccountCommentOnCommentUpdateEvents comment.on('update') invalid accountsStore.accountsCommentsReplies['${account.id}'] '${
              accountsCommentsReplies[account.id]
            }', account may have been deleted`,
          );
          return {};
        }

        // check which replies are read or not
        const updatedAccountCommentsReplies: { [replyCid: string]: AccountCommentReply } = {};
        for (const replyPage of replyPageArray) {
          for (const reply of replyPage?.comments || []) {
            const markedAsRead =
              accountsCommentsReplies[account.id]?.[reply.cid]?.markedAsRead === true
                ? true
                : false;
            updatedAccountCommentsReplies[reply.cid] = { ...reply, markedAsRead };
          }
        }

        // add all to database
        const promises = [];
        for (const replyCid in updatedAccountCommentsReplies) {
          promises.push(
            accountsDatabase.addAccountCommentReply(
              account.id,
              updatedAccountCommentsReplies[replyCid],
            ),
          );
        }
        Promise.all(promises);

        // set new store
        const newAccountCommentsReplies = {
          ...accountsCommentsReplies[account.id],
          ...updatedAccountCommentsReplies,
        };
        return {
          accountsCommentsReplies: {
            ...accountsCommentsReplies,
            [account.id]: newAccountCommentsReplies,
          },
        };
      });
    }
  });
  listeners.push(comment);
  comment.update().catch((error: unknown) => log.trace("comment.update error", { comment, error }));
};

// internal accounts action: the comment CID is not known at the time of publishing, so every time
// we fetch a new comment, check if its our own, and attempt to add the CID
export const addCidToAccountComment = async (comment: Comment) => {
  const { accounts } = accountsStore.getState();
  assert(accounts, `can't use accountsStore.accountActions before initialized`);
  const accountCommentsWithoutCids = getAccountsCommentsWithoutCids()[comment?.author?.address];
  if (!accountCommentsWithoutCids) {
    return;
  }
  for (const accountComment of accountCommentsWithoutCids) {
    // if author address and timestamp is the same, we assume it's the right comment
    if (accountComment.timestamp && accountComment.timestamp === comment.timestamp) {
      const commentWithCid = utils.merge(accountComment, comment);
      await accountsDatabase.addAccountComment(
        accountComment.accountId,
        commentWithCid,
        accountComment.index,
      );
      log("accountsActions.addCidToAccountComment", {
        commentCid: comment.cid,
        accountCommentIndex: accountComment.index,
        accountComment: commentWithCid,
      });
      accountsStore.setState(({ accountsComments, commentCidsToAccountsComments }) => {
        const updatedAccountComments = [...accountsComments[accountComment.accountId]];
        updatedAccountComments[accountComment.index] = commentWithCid;
        const newAccountsComments = {
          ...accountsComments,
          [accountComment.accountId]: updatedAccountComments,
        };
        return {
          accountsComments: newAccountsComments,
          commentCidsToAccountsComments: {
            ...commentCidsToAccountsComments,
            [comment.cid]: {
              accountId: accountComment.accountId,
              accountCommentIndex: accountComment.index,
            },
          },
        };
      });

      startUpdatingAccountCommentOnCommentUpdateEvents(
        comment,
        accounts[accountComment.accountId],
        accountComment.index,
      ).catch((error: unknown) =>
        log.error(
          "accountsActions.addCidToAccountComment startUpdatingAccountCommentOnCommentUpdateEvents error",
          {
            comment,
            account: accounts[accountComment.accountId],
            accountCommentIndex: accountComment.index,
            error,
          },
        ),
      );
      break;
    }
  }
};

// cache the last result of this function
let previousAccountsCommentsJson: string;
let previousAccountsCommentsWithoutCids: any = {};
const getAccountsCommentsWithoutCids = () => {
  const { accounts, accountsComments } = accountsStore.getState();

  // same accounts comments as last time, return cached value
  const accountsCommentsJson = JSON.stringify(accountsComments);
  if (accountsCommentsJson === previousAccountsCommentsJson) {
    return previousAccountsCommentsWithoutCids;
  }
  previousAccountsCommentsJson = accountsCommentsJson;

  const accountsCommentsWithoutCids: AccountsComments = {};
  if (!accounts || !accountsComments) {
    return accountsCommentsWithoutCids;
  }
  for (const accountId in accountsComments) {
    const accountComments = accountsComments[accountId];
    const account = accounts[accountId];
    for (const accountCommentIndex in accountComments) {
      const accountComment = accountComments[accountCommentIndex];
      if (!accountComment.cid) {
        const authorAddress = account?.author?.address;
        if (!authorAddress) {
          continue;
        }
        if (!accountsCommentsWithoutCids[authorAddress]) {
          accountsCommentsWithoutCids[authorAddress] = [];
        }
        accountsCommentsWithoutCids[authorAddress].push(accountComment);
      }
    }
  }
  previousAccountsCommentsWithoutCids = accountsCommentsWithoutCids;
  return accountsCommentsWithoutCids;
};

// internal accounts action: mark an account's notifications as read
export const markNotificationsAsRead = async (account: Account) => {
  const { accountsCommentsReplies } = accountsStore.getState();
  assert(
    typeof account?.id === "string",
    `accountsStore.markNotificationsAsRead invalid account argument '${account}'`,
  );

  // find all unread replies
  const repliesToMarkAsRead: AccountCommentsReplies = {};
  for (const replyCid in accountsCommentsReplies[account.id]) {
    if (!accountsCommentsReplies[account.id][replyCid].markedAsRead) {
      repliesToMarkAsRead[replyCid] = {
        ...accountsCommentsReplies[account.id][replyCid],
        markedAsRead: true,
      };
    }
  }

  // add all to database
  const promises = [];
  for (const replyCid in repliesToMarkAsRead) {
    promises.push(
      accountsDatabase.addAccountCommentReply(account.id, repliesToMarkAsRead[replyCid]),
    );
  }
  await Promise.all(promises);

  // add all to react store
  log("accountsActions.markNotificationsAsRead", { account, repliesToMarkAsRead });
  accountsStore.setState(({ accountsCommentsReplies }) => {
    const updatedAccountCommentsReplies = {
      ...accountsCommentsReplies[account.id],
      ...repliesToMarkAsRead,
    };
    return {
      accountsCommentsReplies: {
        ...accountsCommentsReplies,
        [account.id]: updatedAccountCommentsReplies,
      },
    };
  });
};

// internal accounts action: if a community has a role with an account's address
// add it to the account.communities database
export const addCommunityRoleToAccountsCommunities = async (community: Community) => {
  if (!community) {
    return;
  }
  const { accounts } = accountsStore.getState();
  assert(accounts, `can't use accountsStore.accountActions before initialized`);

  // find community roles to add and remove
  const getRole = (community: any, authorAddress: string) =>
    community.roles && community.roles[authorAddress];
  const getChange = (accounts: any, community: any) => {
    const toUpsert: string[] = [];
    const toRemove: string[] = [];
    for (const accountId in accounts) {
      const account = accounts[accountId];
      const role = getRole(community, account.author.address);
      if (!role) {
        if (account.communities[community.address]) {
          toRemove.push(accountId);
        }
      } else {
        const currentRole = account.communities[community.address]?.role;
        if (!currentRole || currentRole.role !== role.role) {
          toUpsert.push(accountId);
        }
      }
    }
    return {
      toUpsert,
      toRemove,
      hasChange: toUpsert.length !== 0 || toRemove.length !== 0,
    };
  };

  const { hasChange } = getChange(accounts, community);
  if (!hasChange) {
    return;
  }

  accountsStore.setState(({ accounts }) => {
    const { toUpsert, toRemove } = getChange(accounts, community);
    const nextAccounts = { ...accounts };

    // edit databases and build next accounts (toUpsert implies role exists from getChange)
    for (const accountId of toUpsert) {
      const account = { ...nextAccounts[accountId] };
      const role = community.roles![account.author.address];
      account.communities = {
        ...account.communities,
        [community.address]: { ...account.communities[community.address], role },
      };
      nextAccounts[accountId] = account;
      accountsDatabase.addAccount(account);
    }
    for (const accountId of toRemove) {
      const account = { ...nextAccounts[accountId] };
      account.communities = { ...account.communities };
      delete account.communities[community.address];
      nextAccounts[accountId] = account;
      accountsDatabase.addAccount(account);
    }

    log("accountsActions.addCommunityRoleToAccountsCommunities", {
      community,
      toUpsert,
      toRemove,
    });
    return { accounts: nextAccounts };
  });
};
