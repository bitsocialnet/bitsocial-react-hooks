import { useMemo, useState, useEffect } from "react";
import isEqual from "lodash.isequal";
import useAccountsStore from "../../stores/accounts";
import Logger from "@plebbit/plebbit-logger";
const log = Logger("bitsocial-react-hooks:accounts:hooks");
import assert from "assert";
import { useListCommunities, useCommunities } from "../communities";
import type {
  AccountComment,
  AccountComments,
  Account,
  Accounts,
  AccountVote,
  AccountsComments,
  AccountsCommentsReplies,
  UseAccountCommunitiesOptions,
  UseAccountCommunitiesResult,
  UseAccountVoteOptions,
  UseAccountVoteResult,
  UseAccountVotesOptions,
  UseAccountVotesResult,
  UseAccountCommentsOptions,
  UseAccountCommentsResult,
  UseAccountCommentOptions,
  UseAccountCommentResult,
  UseNotificationsOptions,
  UseNotificationsResult,
  UseAccountEditsOptions,
  UseAccountEditsResult,
  UseEditedCommentOptions,
  UseEditedCommentResult,
  UseAccountOptions,
  UseAccountResult,
  UsePubsubSubscribeOptions,
  UsePubsubSubscribeResult,
} from "../../types";
import {
  useAccountsWithCalculatedProperties,
  useAccountWithCalculatedProperties,
  useCalculatedNotifications,
} from "./utils";
import {
  getCanonicalCommunityAddress,
  getEquivalentCommunityAddressGroupKey,
  pickPreferredEquivalentCommunityAddress,
} from "../../lib/community-address";
import { addCommentModeration } from "../../lib/utils/comment-moderation";
import useInterval from "../utils/use-interval";

/**
 * @param accountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, return
 * the active account id.
 */
export function useAccountId(accountName?: string) {
  const accountId = useAccountsStore((state) => state.accountNamesToAccountIds[accountName || ""]);
  // don't consider active account if account name is defined
  const activeAccountId = useAccountsStore((state) => !accountName && state.activeAccountId);
  const accountIdToUse = accountName ? accountId : activeAccountId;
  return accountIdToUse;
}

/**
 * @param accountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, return
 * the active account.
 */
export function useAccount(options?: UseAccountOptions): UseAccountResult {
  assert(
    !options || typeof options === "object",
    `useAccount options argument '${options}' not an object`,
  );
  const { accountName } = options || {};
  // get state
  const accountId = useAccountId(accountName);
  const accountStore = useAccountsStore((state) => state.accounts[accountId || ""]);
  const accountComments = useAccountsStore((state) => state.accountsComments[accountId || ""]);
  const accountCommentsReplies = useAccountsStore(
    (state) => state.accountsCommentsReplies[accountId || ""],
  );
  const account = useAccountWithCalculatedProperties(
    accountStore,
    accountComments,
    accountCommentsReplies,
  );
  log("useAccount", { accountId, account, accountName });
  return account;
}

/**
 * Return all accounts in the order of `accountsStore.accountIds`. To reorder, use `accountsActions.setAccountsOrder(accountNames)`.
 */
export function useAccounts() {
  const accountIds = useAccountsStore((state) => state.accountIds);
  const accountsStore = useAccountsStore((state) => state.accounts);
  const accountsComments = useAccountsStore((state) => state.accountsComments);
  const accountsCommentsReplies = useAccountsStore((state) => state.accountsCommentsReplies);
  const accounts = useAccountsWithCalculatedProperties(
    accountsStore,
    accountsComments,
    accountsCommentsReplies,
  );
  const accountsArray: Account[] = useMemo(() => {
    const accountsArray = [];
    if (accountIds?.length && accounts) {
      for (const accountId of accountIds) {
        accountsArray.push(accounts[accountId]);
      }
    }
    return accountsArray;
  }, [accounts, accountIds]);

  log("useAccounts", { accounts, accountIds });

  const state = accountsArray?.length ? "succeeded" : "initializing";

  return useMemo(
    () => ({
      accounts: accountsArray,
      state,
      error: undefined,
      errors: [],
    }),
    [accountsArray, state],
  );
}

/**
 * Returns all communities where the account is a creator or moderator
 */
export function useAccountCommunities(
  options?: UseAccountCommunitiesOptions,
): UseAccountCommunitiesResult {
  assert(
    !options || typeof options === "object",
    `useAccountCommunities options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { accountName, onlyIfCached } = opts;
  const accountId = useAccountId(accountName);
  const accountIdKey = accountId || "";
  const accountsStoreAccountCommunities = useAccountsStore(
    (state) => state.accounts[accountIdKey]?.communities,
  );

  // get all unique account community addresses
  const ownerCommunityAddresses = useListCommunities(accountName);
  const groupedCommunityAddresses = useMemo(() => {
    const accountCommunityAddresses = [];
    if (accountsStoreAccountCommunities) {
      for (const communityAddress in accountsStoreAccountCommunities) {
        accountCommunityAddresses.push(communityAddress);
      }
    }
    const allCommunityAddresses = [
      ...new Set([...ownerCommunityAddresses, ...accountCommunityAddresses]),
    ].sort();
    const groupedAddresses = new Map<string, string[]>();
    for (const communityAddress of allCommunityAddresses) {
      const groupKey = getEquivalentCommunityAddressGroupKey(communityAddress);
      const addresses = groupedAddresses.get(groupKey);
      if (addresses) {
        addresses.push(communityAddress);
      } else {
        groupedAddresses.set(groupKey, [communityAddress]);
      }
    }
    return [...groupedAddresses.entries()].map(([groupKey, addresses]) => ({
      groupKey,
      addresses,
      preferredAddress: pickPreferredEquivalentCommunityAddress(addresses),
    }));
  }, [accountsStoreAccountCommunities, ownerCommunityAddresses]);
  const uniqueCommunityAddresses = useMemo(
    () => groupedCommunityAddresses.map(({ preferredAddress }) => preferredAddress),
    [groupedCommunityAddresses],
  );

  // fetch all community data
  const {
    communities: communitiesArray,
    state: communitiesState,
    error: communitiesError,
    errors: communitiesErrors,
  } = useCommunities({
    communityAddresses: uniqueCommunityAddresses,
    accountName,
    onlyIfCached,
  });
  const canonicalAddressByGroupKey = useMemo(() => {
    const canonicalAddresses: { [groupKey: string]: string } = {};
    for (const [i, { groupKey, preferredAddress }] of groupedCommunityAddresses.entries()) {
      const fetchedAddress = communitiesArray[i]?.address;
      canonicalAddresses[groupKey] = getCanonicalCommunityAddress(
        fetchedAddress || preferredAddress,
      );
    }
    return canonicalAddresses;
  }, [groupedCommunityAddresses, communitiesArray]);
  const communities: any = useMemo(() => {
    const communities: any = {};
    for (const [i, community] of communitiesArray.entries()) {
      const { groupKey, preferredAddress } = groupedCommunityAddresses[i];
      const canonicalAddress =
        canonicalAddressByGroupKey[groupKey] ||
        getCanonicalCommunityAddress(community?.address || preferredAddress);
      communities[canonicalAddress] = {
        ...communities[canonicalAddress],
        ...community,
        // make sure the canonical address is defined even if the community hasn't fetched yet
        address: canonicalAddress,
      };
    }
    return communities;
  }, [communitiesArray, groupedCommunityAddresses, canonicalAddressByGroupKey]);

  // merged community data with account.communities data
  const accountCommunities: any = useMemo(() => {
    const accountCommunities: any = { ...communities };
    if (accountsStoreAccountCommunities) {
      for (const communityAddress in accountsStoreAccountCommunities) {
        const groupKey = getEquivalentCommunityAddressGroupKey(communityAddress);
        const canonicalAddress =
          canonicalAddressByGroupKey[groupKey] || getCanonicalCommunityAddress(communityAddress);
        accountCommunities[canonicalAddress] = {
          ...accountCommunities[canonicalAddress],
          ...accountsStoreAccountCommunities[communityAddress],
          address: canonicalAddress,
        };
      }
    }
    // add plebbit.communities data
    for (const communityAddress of ownerCommunityAddresses) {
      const groupKey = getEquivalentCommunityAddressGroupKey(communityAddress);
      const canonicalAddress =
        canonicalAddressByGroupKey[groupKey] || getCanonicalCommunityAddress(communityAddress);
      accountCommunities[canonicalAddress] = {
        ...accountCommunities[canonicalAddress],
        address: canonicalAddress,
        role: { role: "owner" },
      };
    }
    return accountCommunities;
  }, [
    accountsStoreAccountCommunities,
    ownerCommunityAddresses,
    communities,
    canonicalAddressByGroupKey,
  ]);

  if (accountId) {
    log("useAccountCommunities", { accountCommunities });
  }

  const state = accountId ? communitiesState : "initializing";

  return useMemo(
    () => ({
      accountCommunities,
      state,
      error: communitiesError,
      errors: communitiesErrors,
    }),
    [accountCommunities, state, communitiesError, communitiesErrors],
  );
}

/**
 * Returns an account's notifications in an array. Unread notifications have a field markedAsRead: false.
 *
 * @param accountName - The nickname of the account, e.g. 'Account 1'. If no accountName is provided, return
 * the active account's notifications.
 */
export function useNotifications(options?: UseNotificationsOptions): UseNotificationsResult {
  assert(
    !options || typeof options === "object",
    `useNotifications options argument '${options}' not an object`,
  );
  const { accountName } = options || {};
  // get state
  const accountId = useAccountId(accountName);
  const account = useAccountsStore((state) => state.accounts[accountId || ""]);
  const accountCommentsReplies = useAccountsStore(
    (state) => state.accountsCommentsReplies[accountId || ""],
  );
  const accountsActionsInternal = useAccountsStore((state) => state.accountsActionsInternal);
  const notifications = useCalculatedNotifications(account, accountCommentsReplies);
  const [errors, setErrors] = useState<Error[]>([]);

  const markAsRead = async () => {
    try {
      if (!account) {
        throw Error("useNotifications cannot mark as read accounts not initalized yet");
      }
      accountsActionsInternal.markNotificationsAsRead(account);
    } catch (e: any) {
      setErrors([...errors, e]);
    }
  };

  if (account) {
    log("useNotifications", { notifications });
  }

  const state = accountId ? "succeeded" : "initializing";

  return useMemo(
    () => ({
      notifications,
      markAsRead,
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [notifications, errors],
  );
}

const getAccountCommentsStates = (accountComments: AccountComment[]) => {
  // no longer consider an pending ater an expiry time of 20 minutes, consider failed
  const now = Math.round(Date.now() / 1000);
  const expiryTime = now - 60 * 20;

  const states: string[] = [];
  for (const accountComment of accountComments) {
    let state = "succeeded";
    if (!accountComment.cid) {
      if (accountComment.timestamp > expiryTime) {
        state = "pending";
      } else {
        state = "failed";
      }
    }
    states.push(state);
  }

  return states;
};

export function useAccountComments(options?: UseAccountCommentsOptions): UseAccountCommentsResult {
  assert(
    !options || typeof options === "object",
    `useAccountComments options argument '${options}' not an object`,
  );
  const { accountName, filter } = options || {};
  assert(
    !filter || typeof filter === "function",
    `useAccountComments options.filter argument '${filter}' not an function`,
  );
  const accountId = useAccountId(accountName);
  const accountComments = useAccountsStore((state) => state.accountsComments[accountId || ""]);
  const [accountCommentStates, setAccountCommentStates] = useState<string[]>([]);

  const filteredAccountComments = useMemo(() => {
    if (!accountComments) {
      return [];
    }
    if (filter) {
      return accountComments.filter(filter);
    }
    return accountComments;
  }, [accountComments, filter]);

  // recheck the states for changes every 1 minute because succeeded / failed / pending aren't events, they are time elapsed
  const delay = 60_000;
  const immediate = false;
  useInterval(
    () => {
      const states = getAccountCommentsStates(filteredAccountComments);
      if (states.toString() !== accountCommentStates.toString()) {
        setAccountCommentStates(states);
      }
    },
    delay,
    immediate,
  );

  const filteredAccountCommentsWithStates = useMemo(() => {
    const states = getAccountCommentsStates(filteredAccountComments);
    return filteredAccountComments.map((comment, i) => ({
      ...comment,
      state: states[i] || "initializing",
    }));
  }, [filteredAccountComments, accountCommentStates]);

  if (options) {
    log("useAccountComments", {
      accountId,
      filteredAccountCommentsWithStates,
      accountComments,
      filter,
    });
  }

  const state = accountId ? "succeeded" : "initializing";

  return useMemo(
    () => ({
      accountComments: filteredAccountCommentsWithStates,
      state,
      error: undefined,
      errors: [],
    }),
    [filteredAccountCommentsWithStates, state],
  );
}

/**
 * Returns an account's single comment, e.g. a pending comment they published.
 */
export function useAccountComment(options?: UseAccountCommentOptions): UseAccountCommentResult {
  assert(
    !options || typeof options === "object",
    `useAccountComment options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { commentIndex, accountName } = opts;
  const { accountComments } = useAccountComments({ accountName });
  const accountComment = useMemo(
    () => accountComments?.[Number(commentIndex)] || {},
    [accountComments, commentIndex],
  );
  const state = accountComment.state || "initializing";

  return useMemo(
    () => ({
      ...accountComment,
      state,
      error: accountComment.error,
      errors: accountComment.errors || [],
    }),
    [accountComment, state],
  );
}

/**
 * Returns the own user's votes stored locally, even those not yet published by the community owner.
 * Check UseAccountCommentsOptions type in types.tsx to filter them, e.g. filter = {communityAddresses: ['memes.eth']}.
 */
export function useAccountVotes(options?: UseAccountVotesOptions): UseAccountVotesResult {
  assert(
    !options || typeof options === "object",
    `useAccountVotes options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { accountName, filter } = opts;
  assert(
    !filter || typeof filter === "function",
    `useAccountVotes options.filter argument '${filter}' not an function`,
  );
  const accountId = useAccountId(accountName);
  const accountVotes = useAccountsStore((state) => state.accountsVotes[accountId || ""]);

  const filteredAccountVotesArray = useMemo(() => {
    let accountVotesArray: AccountVote[] = [];
    if (!accountVotes) {
      return accountVotesArray;
    }
    for (const i in accountVotes) {
      accountVotesArray.push(accountVotes[i]);
    }
    if (filter) {
      accountVotesArray = accountVotesArray.filter(filter);
    }
    return accountVotesArray;
  }, [accountVotes, filter]);

  if (accountVotes && filter) {
    log("useAccountVotes", { accountId, filteredAccountVotesArray, accountVotes, filter });
  }

  // TODO: add failed / pending states

  const state = accountId ? "succeeded" : "initializing";

  return useMemo(
    () => ({
      accountVotes: filteredAccountVotesArray,
      state,
      error: undefined,
      errors: [],
    }),
    [filteredAccountVotesArray, state],
  );
}

/**
 * Returns an account's single vote on a comment, e.g. to know if you already voted on a comment.
 */
export function useAccountVote(options?: UseAccountVoteOptions): UseAccountVoteResult {
  assert(
    !options || typeof options === "object",
    `useAccountVote options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { commentCid, accountName } = opts;
  const accountId = useAccountId(accountName);
  const accountIdKey = accountId || "";
  const commentCidKey = commentCid || "";
  const accountVotes = useAccountsStore((state) => state.accountsVotes[accountIdKey]);
  const accountVote: any = accountVotes?.[commentCidKey];
  const state = accountId && commentCid ? "succeeded" : "initializing";

  // TODO: add failed / pending state

  return useMemo(
    () => ({
      ...accountVote,
      state,
      error: undefined,
      errors: [],
    }),
    [accountVote, state],
  );
}

/**
 * Returns all the comment and community edits published by an account.
 */
export function useAccountEdits(options?: UseAccountEditsOptions): UseAccountEditsResult {
  assert(
    !options || typeof options === "object",
    `useAccountEdits options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { filter, accountName } = opts;
  assert(
    !filter || typeof filter === "function",
    `useAccountEdits options.filter argument '${filter}' not an function`,
  );
  const accountId = useAccountId(accountName);
  const accountEdits = useAccountsStore((state) => state.accountsEdits[accountId || ""]);

  const accountEditsArray = useMemo(() => {
    const accountEditsArray = [];
    for (const i in accountEdits) {
      accountEditsArray.push(...accountEdits[i]);
    }
    // sort by oldest first
    return accountEditsArray.sort((a, b) => a.timestamp - b.timestamp);
  }, [accountEdits]);

  const filteredAccountEditsArray = useMemo(() => {
    if (!filter) {
      return accountEditsArray;
    }
    return accountEditsArray.filter(filter);
  }, [accountEditsArray, filter]);

  // TODO: add failed / pending states

  const state = accountId ? "succeeded" : "initializing";

  return useMemo(
    () => ({
      accountEdits: filteredAccountEditsArray,
      state,
      error: undefined,
      errors: [],
    }),
    [filteredAccountEditsArray, state],
  );
}

/**
 * Returns the comment edited (if has any edits), as well as the pending, succeeded or failed state of the edit.
 */
export function useEditedComment(options?: UseEditedCommentOptions): UseEditedCommentResult {
  assert(
    !options || typeof options === "object",
    `useEditedComment options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { comment, accountName } = opts;
  const accountId = useAccountId(accountName);
  const accountIdKey = accountId || "";
  const commentCidKey = (comment && comment.cid) || "";
  const commentEdits = useAccountsStore(
    (state) => state.accountsEdits[accountIdKey]?.[commentCidKey],
  );

  let initialState = "initializing";
  if (accountId && comment && comment.cid) {
    initialState = "unedited";
  }

  const editedResult = useMemo(() => {
    const editedResult: any = {
      editedComment: undefined,
      succeededEdits: {},
      pendingEdits: {},
      failedEdits: {},
      state: undefined,
    };

    // there are no edits
    if (!commentEdits?.length) {
      return editedResult;
    }

    // don't include these props as they are not edit props, they are publication props
    const nonEditPropertyNames = new Set([
      "author",
      "signer",
      "commentCid",
      "communityAddress",
      "subplebbitAddress",
      "timestamp",
    ]);

    // iterate over commentEdits and consolidate them into 1 propertyNameEdits object
    const propertyNameEdits: any = {};
    for (let commentEdit of commentEdits) {
      // TODO: commentEdit and commentModeration are now separate, but both still in accountEdits store
      // merge them until we find a better design
      let editToUse: any = commentEdit;
      if (commentEdit.commentModeration) {
        editToUse = { ...commentEdit, ...commentEdit.commentModeration };
        delete editToUse.commentModeration;
      }

      for (const propertyName in editToUse) {
        // not valid edited properties
        if (editToUse[propertyName] === undefined || nonEditPropertyNames.has(propertyName)) {
          continue;
        }
        const previousTimestamp = propertyNameEdits[propertyName]?.timestamp || 0;
        // only use the latest propertyNameEdit timestamp
        if (editToUse.timestamp > previousTimestamp) {
          propertyNameEdits[propertyName] = {
            timestamp: editToUse.timestamp,
            value: editToUse[propertyName],
            // NOTE: don't use comment edit challengeVerification.challengeSuccess
            // to know if an edit has failed or succeeded, since another mod can also edit
            // if another mod overrides an edit, consider the edit failed
          };
        }
      }
    }

    const now = Math.round(Date.now() / 1000);
    // no longer consider an edit pending ater an expiry time of 20 minutes
    const expiryTime = 60 * 20;

    // iterate over propertyNameEdits and find if succeeded, pending or failed
    for (const propertyName in propertyNameEdits) {
      const propertyNameEdit = propertyNameEdits[propertyName];

      const setPropertyNameEditState = (state: "succeeded" | "pending" | "failed") => {
        // set propertyNameEdit e.g. editedResult.succeededEdits.removed = true
        editedResult[`${state}Edits`][propertyName] = propertyNameEdit.value;

        // if any propertyNameEdit failed, consider the commentEdit failed
        if (state === "failed") {
          editedResult.state = "failed";
        }
        // if all propertyNameEdit succeeded, consider the commentEdit succeeded
        if (state === "succeeded" && !editedResult.state) {
          editedResult.state = "succeeded";
        }
        // if any propertyNameEdit are pending, and none have failed, consider the commentEdit pending
        if (state === "pending" && editedResult.state !== "failed") {
          editedResult.state = "pending";
        }
      };

      // comment update hasn't been received, impossible to evaluate the status of a comment edit
      // better to show pending than unedited, otherwise the editor might try to edit again
      if (!comment?.updatedAt) {
        setPropertyNameEditState("pending");
        continue;
      }

      // comment.updatedAt is older than propertyNameEdit, propertyNameEdit is pending
      // because we haven't received the update yet and can't evaluate
      if (comment.updatedAt < propertyNameEdit.timestamp) {
        setPropertyNameEditState("pending");
        continue;
      }

      // comment.updatedAt is newer than propertyNameEdit, a comment update
      // has been received after the edit was published so we can evaluate
      else {
        // comment has propertyNameEdit, propertyNameEdit succeeded
        if (isEqual(comment[propertyName], propertyNameEdit.value)) {
          setPropertyNameEditState("succeeded");
          continue;
        }

        // comment does not have propertyNameEdit
        else {
          // propertyNameEdit is newer than 20min, it is too recent to evaluate
          // so we should assume pending
          if (propertyNameEdit.timestamp > now - expiryTime) {
            setPropertyNameEditState("pending");
            continue;
          }

          // propertyNameEdit is older than 20min, we can evaluate it
          else {
            // comment update was received too shortly after propertyNameEdit was
            // published, assume pending until a more recent comment update is received
            const timeSinceUpdate = comment.updatedAt - propertyNameEdit.timestamp;
            if (timeSinceUpdate < expiryTime) {
              setPropertyNameEditState("pending");
              continue;
            }

            // comment update time is sufficiently distanced from propertyNameEdit
            // and comment doesn't have propertyNameEdit, assume failed
            else {
              setPropertyNameEditState("failed");
              continue;
            }
          }
        }
      }
    }

    // define editedComment
    editedResult.editedComment = { ...comment };
    // add pending and succeeded props so the editor can see his changes right away
    // don't add failed edits to reflect the current state of the edited comment
    for (const propertyName in editedResult.pendingEdits) {
      editedResult.editedComment[propertyName] = editedResult.pendingEdits[propertyName];
    }
    for (const propertyName in editedResult.succeededEdits) {
      editedResult.editedComment[propertyName] = editedResult.succeededEdits[propertyName];
    }
    editedResult.editedComment = addCommentModeration(editedResult.editedComment);

    return editedResult;
  }, [comment, commentEdits]);

  return useMemo(
    () => ({
      ...editedResult,
      state: editedResult.state || initialState,
      error: undefined,
      errors: [],
    }),
    [editedResult, initialState],
  );
}

/**
 * This hook should be added to pages where the user is likely to publish something, i,e. the
 * submit page and the /c/<commentCid> page, it improves the speed of publishing to the pubsub
 * by subscribing to the pubsub right away.
 *
 * @param accountName - The nickname of the account, e.g. 'Account 1'.
 * @param communityAddress - The community address to subscribe to, e.g. 'news.eth'.
 */
export function usePubsubSubscribe(options?: UsePubsubSubscribeOptions): UsePubsubSubscribeResult {
  assert(
    !options || typeof options === "object",
    `usePubsubSubscribe options argument '${options}' not an object`,
  );
  const opts = options ?? {};
  const { accountName, communityAddress } = opts;
  const accountId = useAccountId(accountName);
  const accountIdKey = accountId || "";
  const account = useAccountsStore((state) => state.accounts[accountIdKey]);
  const [state, setState] = useState("initializing");
  const [errors, setErrors] = useState<Error[]>([]);

  useEffect(() => {
    if (!account?.plebbit || !communityAddress) {
      return;
    }
    setState("subscribing");
    account.plebbit
      .pubsubSubscribe(communityAddress)
      .then(() => setState("succeeded"))
      .catch((error: any) => {
        setErrors([...errors, error]);
        setState("failed");
        log.error("usePubsubSubscribe plebbit.pubsubSubscribe error", { communityAddress, error });
      });

    // unsub on component unmount
    return function () {
      account.plebbit.pubsubUnsubscribe(communityAddress).catch((error: any) => {
        setErrors([...errors, error]);
        log.error("usePubsubSubscribe plebbit.pubsubUnsubscribe error", {
          communityAddress,
          error,
        });
      });
    };
  }, [account?.plebbit, communityAddress]);

  return useMemo(
    () => ({
      state,
      error: errors[errors.length - 1],
      errors,
    }),
    [state, errors],
  );
}
