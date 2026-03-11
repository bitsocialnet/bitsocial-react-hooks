// public accounts actions that are called by the user

import accountsStore, { listeners } from "./accounts-store";
import communitiesStore from "../communities";
import accountsDatabase from "./accounts-database";
import accountGenerator from "./account-generator";
import Logger from "@plebbit/plebbit-logger";
import validator from "../../lib/validator";
import chain from "../../lib/chain";
import assert from "assert";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import {
  Account,
  Accounts,
  PublishCommentOptions,
  Challenge,
  ChallengeVerification,
  PublishVoteOptions,
  PublishCommentEditOptions,
  PublishCommentModerationOptions,
  PublishCommunityEditOptions,
  CreateCommunityOptions,
  Communities,
  AccountComment,
} from "../../types";
import * as accountsActionsInternal from "./accounts-actions-internal";
import {
  createPlebbitCommunityEdit,
  getPlebbitCommunityAddresses,
  normalizeCommunityEditOptionsForPlebbit,
  normalizePublicationOptionsForPlebbit,
} from "../../lib/plebbit-compat";
import {
  getAccountCommunities,
  getCommentCidsToAccountsComments,
  fetchCommentLinkDimensions,
  getAccountCommentDepth,
  addShortAddressesToAccountComment,
} from "./utils";
import utils from "../../lib/utils";

// Active publish-session tracking for pending comments (Task 3)
const activePublishSessions = new Map<
  string,
  { comment: any; abandoned: boolean; currentIndex: number }
>();
const abandonedPublishKeys = new Set<string>();
const getPublishSessionKey = (accountId: string, index: number) => `${accountId}:${index}`;

const registerPublishSession = (accountId: string, index: number, comment: any) => {
  activePublishSessions.set(getPublishSessionKey(accountId, index), {
    comment,
    abandoned: false,
    currentIndex: index,
  });
};

const abandonAndStopPublishSession = (accountId: string, index: number) => {
  const key = getPublishSessionKey(accountId, index);
  abandonedPublishKeys.add(key);
  const session = activePublishSessions.get(key);
  if (!session) return;
  try {
    const stop = session.comment?.stop?.bind(session.comment);
    if (typeof stop === "function") stop();
  } catch (e) {
    log.error("comment.stop() error during abandon", { accountId, index, error: e });
  }
  activePublishSessions.delete(key);
};

const isPublishSessionAbandoned = (accountId: string, index: number) => {
  return abandonedPublishKeys.has(getPublishSessionKey(accountId, index));
};

/** Returns state update or {} when accountComment not yet in state (no-op). Exported for coverage. */
export const maybeUpdateAccountComment = (
  accountsComments: Record<string, any[]>,
  accountId: string,
  index: number,
  updater: (accountComments: any[], accountComment: any) => void,
) => {
  const accountComments = [...(accountsComments[accountId] || [])];
  const accountComment = accountComments[index];
  if (!accountComment) return {};
  updater(accountComments, accountComment);
  return { accountsComments: { ...accountsComments, [accountId]: accountComments } };
};

const getPublishSessionForComment = (
  accountId: string,
  comment: any,
): { currentIndex: number; sessionKey: string; keyIndex: number } | undefined => {
  for (const [key, session] of activePublishSessions) {
    const [aid, idxStr] = key.split(":");
    if (aid === accountId && session.comment === comment) {
      return {
        currentIndex: session.currentIndex,
        sessionKey: key,
        keyIndex: parseInt(idxStr, 10),
      };
    }
  }
  return undefined;
};

const shiftPublishSessionIndicesAfterDelete = (accountId: string, deletedIndex: number) => {
  for (const [key, session] of activePublishSessions) {
    const [aid] = key.split(":");
    if (aid === accountId && session.currentIndex > deletedIndex) {
      session.currentIndex -= 1;
    }
  }
};

const cleanupPublishSessionOnTerminal = (accountId: string, index: number) => {
  const key = getPublishSessionKey(accountId, index);
  activePublishSessions.delete(key);
  abandonedPublishKeys.delete(key);
};

const addNewAccountToDatabaseAndState = async (newAccount: Account) => {
  // add to database first to init the account
  await accountsDatabase.addAccount(newAccount);
  // use database data for these because it's easier
  const [newAccountIds, newAccountNamesToAccountIds] = await Promise.all<any>([
    accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
    accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
  ]);

  // set the new state
  const { accounts, accountsComments, accountsVotes, accountsEdits, accountsCommentsReplies } =
    accountsStore.getState();
  const newAccounts = { ...accounts, [newAccount.id]: newAccount };
  const newState: any = {
    accounts: newAccounts,
    accountIds: newAccountIds,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
    accountsComments: { ...accountsComments, [newAccount.id]: [] },
    accountsVotes: { ...accountsVotes, [newAccount.id]: {} },
    accountsEdits: { ...accountsEdits, [newAccount.id]: {} },
    accountsCommentsReplies: { ...accountsCommentsReplies, [newAccount.id]: {} },
  };
  // if there is only 1 account, make it active
  // otherwise stay on the same active account
  if (newAccountIds.length === 1) {
    newState.activeAccountId = newAccount.id;
  }
  accountsStore.setState(newState);
};

export const createAccount = async (accountName?: string) => {
  const newAccount = await accountGenerator.generateDefaultAccount();
  if (accountName) {
    newAccount.name = accountName;
  }
  await addNewAccountToDatabaseAndState(newAccount);
  log("accountsActions.createAccount", { accountName, account: newAccount });
};

export const deleteAccount = async (accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId, accountsComments, accountsVotes } =
    accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.deleteAccount account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );
  await accountsDatabase.removeAccount(account);
  const newAccounts = { ...accounts };
  delete newAccounts[account.id];
  const [newAccountIds, newActiveAccountId, newAccountNamesToAccountIds] = await Promise.all<any>([
    accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
    accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId"),
    accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
  ]);
  const newAccountsComments = { ...accountsComments };
  delete newAccountsComments[account.id];
  const newAccountsVotes = { ...accountsVotes };
  delete newAccountsVotes[account.id];

  accountsStore.setState({
    accounts: newAccounts,
    accountIds: newAccountIds,
    activeAccountId: newActiveAccountId,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
    accountsComments: newAccountsComments,
    accountsVotes: newAccountsVotes,
  });
};

export const setActiveAccount = async (accountName: string) => {
  const { accountNamesToAccountIds } = accountsStore.getState();
  assert(accountNamesToAccountIds, `can't use accountsStore.accountActions before initialized`);
  validator.validateAccountsActionsSetActiveAccountArguments(accountName);
  const accountId = accountNamesToAccountIds[accountName];
  await accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", accountId);
  log("accountsActions.setActiveAccount", { accountName, accountId });
  accountsStore.setState({ activeAccountId: accountId });
};

export const setAccount = async (account: Account) => {
  const { accounts } = accountsStore.getState();
  validator.validateAccountsActionsSetAccountArguments(account);
  assert(
    accounts?.[account.id],
    `cannot set account with account.id '${account.id}' id does not exist in database`,
  );

  // if author.address has changed, add new community roles of author.address found in communities store
  // TODO: add test to check if roles get added
  if (account.author.address !== accounts[account.id].author.address) {
    const communities = getAccountCommunities(account, communitiesStore.getState().communities);
    account = { ...account, communities };

    // wallet.signature changes if author.address changes
    if (account.author.wallets?.eth) {
      const plebbitSignerWalletWithNewAuthorAddress = await chain.getEthWalletFromPlebbitPrivateKey(
        account.signer.privateKey,
        account.author.address,
      );
      // wallet is using plebbit signer, redo signature with new author.address
      if (account.author.wallets.eth.address === plebbitSignerWalletWithNewAuthorAddress?.address) {
        account.author.wallets = {
          ...account.author.wallets,
          eth: plebbitSignerWalletWithNewAuthorAddress,
        };
      }
    }
  }

  // use this function to serialize and update all databases
  await accountsDatabase.addAccount(account);
  const [newAccount, newAccountNamesToAccountIds] = await Promise.all<any>([
    // use this function to deserialize
    accountsDatabase.getAccount(account.id),
    accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
  ]);
  const newAccounts: Accounts = { ...accounts, [newAccount.id]: newAccount };
  log("accountsActions.setAccount", { account: newAccount });
  accountsStore.setState({
    accounts: newAccounts,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
  });
};

export const setAccountsOrder = async (newOrderedAccountNames: string[]) => {
  const { accounts, accountNamesToAccountIds } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds,
    `can't use accountsStore.accountActions before initialized`,
  );
  const accountIds = [];
  const accountNames = [];
  for (const accountName of newOrderedAccountNames) {
    const accountId = accountNamesToAccountIds[accountName];
    accountIds.push(accountId);
    accountNames.push(accounts[accountId].name);
  }
  validator.validateAccountsActionsSetAccountsOrderArguments(newOrderedAccountNames, accountNames);
  log("accountsActions.setAccountsOrder", {
    previousAccountNames: accountNames,
    newAccountNames: newOrderedAccountNames,
  });
  await accountsDatabase.accountsMetadataDatabase.setItem("accountIds", accountIds);
  accountsStore.setState({ accountIds });
};

export const importAccount = async (serializedAccount: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let imported;
  try {
    imported = JSON.parse(serializedAccount);
  } catch (e) {}
  assert(
    imported?.account && imported?.account?.id && imported?.account?.name,
    `accountsActions.importAccount failed JSON.stringify json serializedAccount '${serializedAccount}'`,
  );

  // add community roles already in communities store to imported account
  // TODO: add test to check if roles get added
  const communities = getAccountCommunities(
    imported.account,
    communitiesStore.getState().communities,
  );

  // if imported.account.name already exists, add ' 2', don't overwrite
  if (accountNamesToAccountIds[imported.account.name]) {
    imported.account.name += " 2";
  }

  // generate new account
  const generatedAccount = await accountGenerator.generateDefaultAccount();
  // use generatedAccount to init properties like .plebbit and .id on a new account
  // overwrite account.id to avoid duplicate ids
  const newAccount = {
    ...generatedAccount,
    ...imported.account,
    communities,
    id: generatedAccount.id,
  };

  // add account to database
  await accountsDatabase.addAccount(newAccount);

  // add account comments, votes, edits to database
  for (const accountComment of imported.accountComments || []) {
    await accountsDatabase.addAccountComment(newAccount.id, accountComment);
  }
  for (const accountVote of imported.accountVotes || []) {
    await accountsDatabase.addAccountVote(newAccount.id, accountVote);
  }
  for (const accountEdit of imported.accountEdits || []) {
    await accountsDatabase.addAccountEdit(newAccount.id, accountEdit);
  }

  // set new state

  // get new state data from database because it's easier
  const [accountComments, accountVotes, accountEdits, accountIds, newAccountNamesToAccountIds] =
    await Promise.all<any>([
      accountsDatabase.getAccountComments(newAccount.id),
      accountsDatabase.getAccountVotes(newAccount.id),
      accountsDatabase.getAccountEdits(newAccount.id),
      accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
      accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);

  accountsStore.setState((state) => ({
    accounts: { ...state.accounts, [newAccount.id]: newAccount },
    accountIds,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
    accountsComments: { ...state.accountsComments, [newAccount.id]: accountComments },
    commentCidsToAccountsComments: getCommentCidsToAccountsComments({
      ...state.accountsComments,
      [newAccount.id]: accountComments,
    }),
    accountsVotes: { ...state.accountsVotes, [newAccount.id]: accountVotes },
    accountsEdits: { ...state.accountsEdits, [newAccount.id]: accountEdits },
    // don't import/export replies to own comments, those are just cached and can be refetched
    accountsCommentsReplies: { ...state.accountsCommentsReplies, [newAccount.id]: {} },
  }));

  log("accountsActions.importAccount", {
    account: newAccount,
    accountComments,
    accountVotes,
    accountEdits,
  });

  // start looking for updates for all accounts comments in database
  for (const accountComment of accountComments) {
    accountsStore
      .getState()
      .accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        accountComment,
        newAccount,
        accountComment.index,
      )
      .catch((error: unknown) =>
        log.error(
          "accountsActions.importAccount startUpdatingAccountCommentOnCommentUpdateEvents error",
          {
            accountComment,
            accountCommentIndex: accountComment.index,
            importedAccount: newAccount,
            error,
          },
        ),
      );
  }

  // TODO: add options to only import private key, account settings, or include all account comments/votes history
};

export const exportAccount = async (accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.exportAccount account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );
  const exportedAccountJson = await accountsDatabase.getExportedAccountJson(account.id);
  log("accountsActions.exportAccount", { exportedAccountJson });
  return exportedAccountJson;
};

export const subscribe = async (communityAddress: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    communityAddress && typeof communityAddress === "string",
    `accountsActions.subscribe invalid communityAddress '${communityAddress}'`,
  );
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.subscribe account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  let subscriptions: string[] = account.subscriptions || [];
  if (subscriptions.includes(communityAddress)) {
    throw Error(`account '${account.id}' already subscribed to '${communityAddress}'`);
  }
  subscriptions = [...subscriptions, communityAddress];

  const updatedAccount: Account = { ...account, subscriptions };
  // update account in db async for instant feedback speed
  accountsDatabase.addAccount(updatedAccount);
  const updatedAccounts = { ...accounts, [updatedAccount.id]: updatedAccount };
  log("accountsActions.subscribe", { account: updatedAccount, accountName, communityAddress });
  accountsStore.setState({ accounts: updatedAccounts });
};

export const unsubscribe = async (communityAddress: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    communityAddress && typeof communityAddress === "string",
    `accountsActions.unsubscribe invalid communityAddress '${communityAddress}'`,
  );
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.unsubscribe account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  let subscriptions: string[] = account.subscriptions || [];
  if (!subscriptions.includes(communityAddress)) {
    throw Error(`account '${account.id}' already unsubscribed from '${communityAddress}'`);
  }
  // remove communityAddress
  subscriptions = subscriptions.filter((address) => address !== communityAddress);

  const updatedAccount: Account = { ...account, subscriptions };
  // update account in db async for instant feedback speed
  accountsDatabase.addAccount(updatedAccount);
  const updatedAccounts = { ...accounts, [updatedAccount.id]: updatedAccount };
  log("accountsActions.unsubscribe", { account: updatedAccount, accountName, communityAddress });
  accountsStore.setState({ accounts: updatedAccounts });
};

export const blockAddress = async (address: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    address && typeof address === "string",
    `accountsActions.blockAddress invalid address '${address}'`,
  );
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.blockAddress account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  const blockedAddresses: { [address: string]: boolean } = { ...account.blockedAddresses };
  if (blockedAddresses[address] === true) {
    throw Error(`account '${account.id}' already blocked address '${address}'`);
  }
  blockedAddresses[address] = true;

  const updatedAccount: Account = { ...account, blockedAddresses };
  // update account in db async for instant feedback speed
  accountsDatabase.addAccount(updatedAccount);
  const updatedAccounts = { ...accounts, [updatedAccount.id]: updatedAccount };
  log("accountsActions.blockAddress", { account: updatedAccount, accountName, address });
  accountsStore.setState({ accounts: updatedAccounts });
};

export const unblockAddress = async (address: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    address && typeof address === "string",
    `accountsActions.unblockAddress invalid address '${address}'`,
  );
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.unblockAddress account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  const blockedAddresses: { [address: string]: boolean } = { ...account.blockedAddresses };
  if (!blockedAddresses[address]) {
    throw Error(`account '${account.id}' already unblocked address '${address}'`);
  }
  delete blockedAddresses[address];

  const updatedAccount: Account = { ...account, blockedAddresses };
  // update account in db async for instant feedback speed
  accountsDatabase.addAccount(updatedAccount);
  const updatedAccounts = { ...accounts, [updatedAccount.id]: updatedAccount };
  log("accountsActions.unblockAddress", { account: updatedAccount, accountName, address });
  accountsStore.setState({ accounts: updatedAccounts });
};

export const blockCid = async (cid: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(cid && typeof cid === "string", `accountsActions.blockCid invalid cid '${cid}'`);
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.blockCid account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  const blockedCids: { [cid: string]: boolean } = { ...account.blockedCids };
  if (blockedCids[cid] === true) {
    throw Error(`account '${account.id}' already blocked cid '${cid}'`);
  }
  blockedCids[cid] = true;

  const updatedAccount: Account = { ...account, blockedCids };
  // update account in db async for instant feedback speed
  accountsDatabase.addAccount(updatedAccount);
  const updatedAccounts = { ...accounts, [updatedAccount.id]: updatedAccount };
  log("accountsActions.blockCid", { account: updatedAccount, accountName, cid });
  accountsStore.setState({ accounts: updatedAccounts });
};

export const unblockCid = async (cid: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(cid && typeof cid === "string", `accountsActions.unblockCid invalid cid '${cid}'`);
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.unblockCid account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  const blockedCids: { [cid: string]: boolean } = { ...account.blockedCids };
  if (!blockedCids[cid]) {
    throw Error(`account '${account.id}' already unblocked cid '${cid}'`);
  }
  delete blockedCids[cid];

  const updatedAccount: Account = { ...account, blockedCids };
  // update account in db async for instant feedback speed
  accountsDatabase.addAccount(updatedAccount);
  const updatedAccounts = { ...accounts, [updatedAccount.id]: updatedAccount };
  log("accountsActions.unblockCid", { account: updatedAccount, accountName, cid });
  accountsStore.setState({ accounts: updatedAccounts });
};

export const publishComment = async (
  publishCommentOptions: PublishCommentOptions,
  accountName?: string,
) => {
  const { accounts, accountsComments, accountNamesToAccountIds, activeAccountId } =
    accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  validator.validateAccountsActionsPublishCommentArguments({
    publishCommentOptions,
    accountName,
    account,
  });

  // find author.previousCommentCid if any
  const accountCommentsWithCids = accountsComments[account.id]
    .filter((comment: AccountComment) => comment.cid)
    // author can change his address, his previousCommentCid becomes invalid
    .filter((comment: AccountComment) => comment.author?.address === account.author?.address);
  const previousCommentCid = accountCommentsWithCids[accountCommentsWithCids.length - 1]?.cid;
  const author = { ...account.author };
  if (previousCommentCid) {
    author.previousCommentCid = previousCommentCid;
  }

  let createCommentOptions: any = normalizePublicationOptionsForPlebbit(account.plebbit, {
    timestamp: Math.floor(Date.now() / 1000),
    author,
    signer: account.signer,
    ...publishCommentOptions,
  });
  delete createCommentOptions.onChallenge;
  delete createCommentOptions.onChallengeVerification;
  delete createCommentOptions.onError;
  delete createCommentOptions.onPublishingStateChange;
  delete createCommentOptions._onPendingCommentIndex;

  // make sure the options dont throw
  await account.plebbit.createComment(createCommentOptions);

  // try to get comment depth needed for custom depth flat account replies
  const depth = getAccountCommentDepth(createCommentOptions);

  // set fetching link dimensions state
  let fetchingLinkDimensionsStates: { state: string; publishingState: string };
  if (publishCommentOptions.link) {
    publishCommentOptions.onPublishingStateChange?.("fetching-link-dimensions");
    fetchingLinkDimensionsStates = {
      state: "publishing",
      publishingState: "fetching-link-dimensions",
    };
  }

  // save comment to db
  let accountCommentIndex = accountsComments[account.id].length;
  let savedOnce = false;
  const saveCreatedAccountComment = async (accountComment: AccountComment) => {
    await accountsDatabase.addAccountComment(
      account.id,
      createdAccountComment,
      savedOnce ? accountCommentIndex : undefined,
    );
    savedOnce = true;
    accountsStore.setState(({ accountsComments }) => {
      const accountComments = [...accountsComments[account.id]];
      accountComments[accountCommentIndex] = accountComment;
      return { accountsComments: { ...accountsComments, [account.id]: accountComments } };
    });
  };
  let createdAccountComment = {
    ...createCommentOptions,
    depth,
    index: accountCommentIndex,
    accountId: account.id,
  };
  createdAccountComment = addShortAddressesToAccountComment(createdAccountComment);
  await saveCreatedAccountComment(createdAccountComment);
  publishCommentOptions._onPendingCommentIndex?.(accountCommentIndex, createdAccountComment);

  let comment: any;
  (async () => {
    // fetch comment.link dimensions
    if (publishCommentOptions.link) {
      const commentLinkDimensions = await fetchCommentLinkDimensions(publishCommentOptions.link);
      createCommentOptions = { ...createCommentOptions, ...commentLinkDimensions };
      // save dimensions to db
      createdAccountComment = { ...createdAccountComment, ...commentLinkDimensions };
      await saveCreatedAccountComment(createdAccountComment);
    }
    comment = await account.plebbit.createComment(createCommentOptions);
    publishAndRetryFailedChallengeVerification();
    log("accountsActions.publishComment", { createCommentOptions });
  })();

  let lastChallenge: Challenge | undefined;
  async function publishAndRetryFailedChallengeVerification() {
    cleanupPublishSessionOnTerminal(account.id, accountCommentIndex);
    registerPublishSession(account.id, accountCommentIndex, comment);
    comment.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommentOptions.onChallenge(challenge, comment);
    });
    comment.once("challengeverification", async (challengeVerification: ChallengeVerification) => {
      publishCommentOptions.onChallengeVerification(challengeVerification, comment);
      if (!challengeVerification.challengeSuccess && lastChallenge) {
        // publish again automatically on fail
        const timestamp = Math.floor(Date.now() / 1000);
        createCommentOptions = { ...createCommentOptions, timestamp };
        createdAccountComment = { ...createdAccountComment, timestamp };
        await saveCreatedAccountComment(createdAccountComment);
        comment = await account.plebbit.createComment(createCommentOptions);
        lastChallenge = undefined;
        publishAndRetryFailedChallengeVerification();
      } else {
        // the challengeverification message of a comment publication should in theory send back the CID
        // of the published comment which is needed to resolve it for replies, upvotes, etc
        if (challengeVerification?.commentUpdate?.cid) {
          const sessionInfo = getPublishSessionForComment(account.id, comment);
          const currentIndex = sessionInfo?.currentIndex ?? accountCommentIndex;
          if (!sessionInfo || abandonedPublishKeys.has(sessionInfo.sessionKey)) return;
          cleanupPublishSessionOnTerminal(account.id, sessionInfo.keyIndex);
          const commentWithCid = comment;
          await accountsDatabase.addAccountComment(account.id, commentWithCid, currentIndex);
          accountsStore.setState(({ accountsComments, commentCidsToAccountsComments }) => {
            const updatedAccountComments = [...accountsComments[account.id]];
            const updatedAccountComment = {
              ...commentWithCid,
              index: currentIndex,
              accountId: account.id,
            };
            updatedAccountComments[currentIndex] = updatedAccountComment;
            return {
              accountsComments: { ...accountsComments, [account.id]: updatedAccountComments },
              commentCidsToAccountsComments: {
                ...commentCidsToAccountsComments,
                [challengeVerification?.commentUpdate?.cid]: {
                  accountId: account.id,
                  accountCommentIndex: currentIndex,
                },
              },
            };
          });

          // clone the comment or it bugs publishing callbacks
          const updatingComment = await account.plebbit.createComment({ ...comment });
          accountsActionsInternal
            .startUpdatingAccountCommentOnCommentUpdateEvents(
              updatingComment,
              account,
              currentIndex,
            )
            .catch((error: unknown) =>
              log.error(
                "accountsActions.publishComment startUpdatingAccountCommentOnCommentUpdateEvents error",
                { comment, account, accountCommentIndex, error },
              ),
            );
        }
      }
    });

    comment.on("error", (error: Error) => {
      if (isPublishSessionAbandoned(account.id, accountCommentIndex)) return;
      accountsStore.setState(({ accountsComments }) =>
        maybeUpdateAccountComment(accountsComments, account.id, accountCommentIndex, (ac, acc) => {
          const errors = [...(acc.errors || []), error];
          ac[accountCommentIndex] = { ...acc, errors, error };
        }),
      );
      publishCommentOptions.onError?.(error, comment);
    });
    comment.on("publishingstatechange", async (publishingState: string) => {
      if (isPublishSessionAbandoned(account.id, accountCommentIndex)) return;
      accountsStore.setState(({ accountsComments }) =>
        maybeUpdateAccountComment(accountsComments, account.id, accountCommentIndex, (ac, acc) => {
          ac[accountCommentIndex] = { ...acc, publishingState };
        }),
      );
      publishCommentOptions.onPublishingStateChange?.(publishingState);
    });

    // set clients on account comment so the frontend can display it, dont persist in db because a reload cancels publishing
    utils.clientsOnStateChange(
      comment.clients,
      (clientState: string, clientType: string, clientUrl: string, chainTicker?: string) => {
        if (isPublishSessionAbandoned(account.id, accountCommentIndex)) return;
        accountsStore.setState(({ accountsComments }) =>
          maybeUpdateAccountComment(
            accountsComments,
            account.id,
            accountCommentIndex,
            (ac, acc) => {
              const clients = { ...comment.clients };
              const client = { state: clientState };
              if (chainTicker) {
                const chainProviders = { ...clients[clientType][chainTicker], [clientUrl]: client };
                clients[clientType] = { ...clients[clientType], [chainTicker]: chainProviders };
              } else {
                clients[clientType] = { ...clients[clientType], [clientUrl]: client };
              }
              ac[accountCommentIndex] = { ...acc, clients };
            },
          ),
        );
      },
    );

    listeners.push(comment);
    try {
      // publish will resolve after the challenge request
      // if it fails before, like failing to resolve ENS, we can emit the error
      await comment.publish();
    } catch (error) {
      publishCommentOptions.onError?.(error, comment);
    }
  }

  return createdAccountComment;
};

export const deleteComment = async (
  commentCidOrAccountCommentIndex: string | number,
  accountName?: string,
) => {
  const {
    accounts,
    accountsComments,
    accountNamesToAccountIds,
    activeAccountId,
    commentCidsToAccountsComments,
  } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(account?.id, `accountsActions.deleteComment account.id '${account?.id}' doesn't exist`);
  const accountComments = accountsComments[account.id] || [];
  assert(accountComments.length > 0, `accountsActions.deleteComment no comments for account`);

  let accountCommentIndex: number;
  if (typeof commentCidOrAccountCommentIndex === "number") {
    accountCommentIndex = commentCidOrAccountCommentIndex;
  } else {
    const mapping = commentCidsToAccountsComments[commentCidOrAccountCommentIndex];
    assert(
      mapping && mapping.accountId === account.id,
      `accountsActions.deleteComment cid '${commentCidOrAccountCommentIndex}' not found for account`,
    );
    accountCommentIndex = mapping.accountCommentIndex;
  }
  assert(
    accountCommentIndex >= 0 && accountCommentIndex < accountComments.length,
    `accountsActions.deleteComment index '${accountCommentIndex}' out of range`,
  );

  abandonAndStopPublishSession(account.id, accountCommentIndex);
  shiftPublishSessionIndicesAfterDelete(account.id, accountCommentIndex);

  const spliced = [...accountComments];
  spliced.splice(accountCommentIndex, 1);
  const reindexed = spliced.map((c, i) => ({ ...c, index: i, accountId: account.id }));
  const newAccountsComments = { ...accountsComments, [account.id]: reindexed };
  const newCommentCidsToAccountsComments = getCommentCidsToAccountsComments(newAccountsComments);

  accountsStore.setState({
    accountsComments: newAccountsComments,
    commentCidsToAccountsComments: newCommentCidsToAccountsComments,
  });

  await accountsDatabase.deleteAccountComment(account.id, accountCommentIndex);

  log("accountsActions.deleteComment", { accountId: account.id, accountCommentIndex });
};

export const publishVote = async (publishVoteOptions: PublishVoteOptions, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  validator.validateAccountsActionsPublishVoteArguments({
    publishVoteOptions,
    accountName,
    account,
  });

  let createVoteOptions: any = normalizePublicationOptionsForPlebbit(account.plebbit, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    ...publishVoteOptions,
  });
  delete createVoteOptions.onChallenge;
  delete createVoteOptions.onChallengeVerification;
  delete createVoteOptions.onError;
  delete createVoteOptions.onPublishingStateChange;

  let vote = await account.plebbit.createVote(createVoteOptions);
  let lastChallenge: Challenge | undefined;
  const publishAndRetryFailedChallengeVerification = async () => {
    vote.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishVoteOptions.onChallenge(challenge, vote);
    });
    vote.once("challengeverification", async (challengeVerification: ChallengeVerification) => {
      publishVoteOptions.onChallengeVerification(challengeVerification, vote);
      if (!challengeVerification.challengeSuccess && lastChallenge) {
        // publish again automatically on fail
        createVoteOptions = { ...createVoteOptions, timestamp: Math.floor(Date.now() / 1000) };
        vote = await account.plebbit.createVote(createVoteOptions);
        lastChallenge = undefined;
        publishAndRetryFailedChallengeVerification();
      }
    });
    vote.on("error", (error: Error) => publishVoteOptions.onError?.(error, vote));
    // TODO: add publishingState to account votes
    vote.on("publishingstatechange", (publishingState: string) =>
      publishVoteOptions.onPublishingStateChange?.(publishingState),
    );
    listeners.push(vote);
    try {
      // publish will resolve after the challenge request
      // if it fails before, like failing to resolve ENS, we can emit the error
      await vote.publish();
    } catch (error) {
      publishVoteOptions.onError?.(error, vote);
    }
  };

  publishAndRetryFailedChallengeVerification();
  await accountsDatabase.addAccountVote(account.id, createVoteOptions);
  log("accountsActions.publishVote", { createVoteOptions });
  accountsStore.setState(({ accountsVotes }) => ({
    accountsVotes: {
      ...accountsVotes,
      [account.id]: {
        ...accountsVotes[account.id],
        [createVoteOptions.commentCid]:
          // remove signer and author because not needed and they expose private key
          { ...createVoteOptions, signer: undefined, author: undefined },
      },
    },
  }));
};

export const publishCommentEdit = async (
  publishCommentEditOptions: PublishCommentEditOptions,
  accountName?: string,
) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  validator.validateAccountsActionsPublishCommentEditArguments({
    publishCommentEditOptions,
    accountName,
    account,
  });

  let createCommentEditOptions: any = normalizePublicationOptionsForPlebbit(account.plebbit, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    ...publishCommentEditOptions,
  });
  delete createCommentEditOptions.onChallenge;
  delete createCommentEditOptions.onChallengeVerification;
  delete createCommentEditOptions.onError;
  delete createCommentEditOptions.onPublishingStateChange;

  let commentEdit = await account.plebbit.createCommentEdit(createCommentEditOptions);
  let lastChallenge: Challenge | undefined;
  const publishAndRetryFailedChallengeVerification = async () => {
    commentEdit.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommentEditOptions.onChallenge(challenge, commentEdit);
    });
    commentEdit.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        publishCommentEditOptions.onChallengeVerification(challengeVerification, commentEdit);
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          createCommentEditOptions = {
            ...createCommentEditOptions,
            timestamp: Math.floor(Date.now() / 1000),
          };
          commentEdit = await account.plebbit.createCommentEdit(createCommentEditOptions);
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        }
      },
    );
    commentEdit.on("error", (error: Error) =>
      publishCommentEditOptions.onError?.(error, commentEdit),
    );
    // TODO: add publishingState to account edits
    commentEdit.on("publishingstatechange", (publishingState: string) =>
      publishCommentEditOptions.onPublishingStateChange?.(publishingState),
    );
    listeners.push(commentEdit);
    try {
      // publish will resolve after the challenge request
      // if it fails before, like failing to resolve ENS, we can emit the error
      await commentEdit.publish();
    } catch (error) {
      publishCommentEditOptions.onError?.(error, commentEdit);
    }
  };

  publishAndRetryFailedChallengeVerification();

  await accountsDatabase.addAccountEdit(account.id, createCommentEditOptions);
  log("accountsActions.publishCommentEdit", { createCommentEditOptions });
  accountsStore.setState(({ accountsEdits }) => {
    // remove signer and author because not needed and they expose private key
    const commentEdit = { ...createCommentEditOptions, signer: undefined, author: undefined };
    let commentEdits = accountsEdits[account.id][createCommentEditOptions.commentCid] || [];
    commentEdits = [...commentEdits, commentEdit];
    return {
      accountsEdits: {
        ...accountsEdits,
        [account.id]: {
          ...accountsEdits[account.id],
          [createCommentEditOptions.commentCid]: commentEdits,
        },
      },
    };
  });
};

export const publishCommentModeration = async (
  publishCommentModerationOptions: PublishCommentModerationOptions,
  accountName?: string,
) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  validator.validateAccountsActionsPublishCommentModerationArguments({
    publishCommentModerationOptions,
    accountName,
    account,
  });

  let createCommentModerationOptions: any = normalizePublicationOptionsForPlebbit(account.plebbit, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    ...publishCommentModerationOptions,
  });
  delete createCommentModerationOptions.onChallenge;
  delete createCommentModerationOptions.onChallengeVerification;
  delete createCommentModerationOptions.onError;
  delete createCommentModerationOptions.onPublishingStateChange;

  let commentModeration = await account.plebbit.createCommentModeration(
    createCommentModerationOptions,
  );
  let lastChallenge: Challenge | undefined;
  const publishAndRetryFailedChallengeVerification = async () => {
    commentModeration.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommentModerationOptions.onChallenge(challenge, commentModeration);
    });
    commentModeration.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        publishCommentModerationOptions.onChallengeVerification(
          challengeVerification,
          commentModeration,
        );
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          createCommentModerationOptions = {
            ...createCommentModerationOptions,
            timestamp: Math.floor(Date.now() / 1000),
          };
          commentModeration = await account.plebbit.createCommentModeration(
            createCommentModerationOptions,
          );
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        }
      },
    );
    commentModeration.on("error", (error: Error) =>
      publishCommentModerationOptions.onError?.(error, commentModeration),
    );
    // TODO: add publishingState to account edits
    commentModeration.on("publishingstatechange", (publishingState: string) =>
      publishCommentModerationOptions.onPublishingStateChange?.(publishingState),
    );
    listeners.push(commentModeration);
    try {
      // publish will resolve after the challenge request
      // if it fails before, like failing to resolve ENS, we can emit the error
      await commentModeration.publish();
    } catch (error) {
      publishCommentModerationOptions.onError?.(error, commentModeration);
    }
  };

  publishAndRetryFailedChallengeVerification();

  await accountsDatabase.addAccountEdit(account.id, createCommentModerationOptions);
  log("accountsActions.publishCommentModeration", { createCommentModerationOptions });
  accountsStore.setState(({ accountsEdits }) => {
    // remove signer and author because not needed and they expose private key
    const commentModeration = {
      ...createCommentModerationOptions,
      signer: undefined,
      author: undefined,
    };
    let commentModerations =
      accountsEdits[account.id][createCommentModerationOptions.commentCid] || [];
    commentModerations = [...commentModerations, commentModeration];
    return {
      accountsEdits: {
        ...accountsEdits,
        [account.id]: {
          ...accountsEdits[account.id],
          [createCommentModerationOptions.commentCid]: commentModerations,
        },
      },
    };
  });
};

export const publishCommunityEdit = async (
  communityAddress: string,
  publishCommunityEditOptions: PublishCommunityEditOptions,
  accountName?: string,
) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  validator.validateAccountsActionsPublishCommunityEditArguments({
    communityAddress,
    publishCommunityEditOptions,
    accountName,
    account,
  });

  const communityEditOptions = { ...publishCommunityEditOptions };
  delete communityEditOptions.onChallenge;
  delete communityEditOptions.onChallengeVerification;
  delete communityEditOptions.onError;
  delete communityEditOptions.onPublishingStateChange;

  // account is the owner of the community and can edit it locally, no need to publish
  const localCommunityAddresses = getPlebbitCommunityAddresses(account.plebbit);
  if (localCommunityAddresses.includes(communityAddress)) {
    await communitiesStore
      .getState()
      .editCommunity(communityAddress, communityEditOptions, account);
    // create fake success challenge verification for consistent behavior with remote community edit
    publishCommunityEditOptions.onChallengeVerification({ challengeSuccess: true });
    publishCommunityEditOptions.onPublishingStateChange?.("succeeded");
    return;
  }

  assert(
    !publishCommunityEditOptions.address ||
      publishCommunityEditOptions.address === communityAddress,
    `accountsActions.publishCommunityEdit can't edit address of a remote community`,
  );
  let createCommunityEditOptions: any = normalizeCommunityEditOptionsForPlebbit(account.plebbit, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    // not possible to edit community.address over pubsub, only locally
    communityAddress,
    communityEdit: communityEditOptions,
    subplebbitEdit: communityEditOptions,
  });

  let communityEdit = await createPlebbitCommunityEdit(account.plebbit, createCommunityEditOptions);
  let lastChallenge: Challenge | undefined;
  const publishAndRetryFailedChallengeVerification = async () => {
    communityEdit.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommunityEditOptions.onChallenge(challenge, communityEdit);
    });
    communityEdit.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        publishCommunityEditOptions.onChallengeVerification(challengeVerification, communityEdit);
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          createCommunityEditOptions = {
            ...createCommunityEditOptions,
            timestamp: Math.floor(Date.now() / 1000),
          };
          communityEdit = await createPlebbitCommunityEdit(
            account.plebbit,
            createCommunityEditOptions,
          );
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        }
      },
    );
    communityEdit.on("error", (error: Error) =>
      publishCommunityEditOptions.onError?.(error, communityEdit),
    );
    // TODO: add publishingState to account edits
    communityEdit.on("publishingstatechange", (publishingState: string) =>
      publishCommunityEditOptions.onPublishingStateChange?.(publishingState),
    );
    listeners.push(communityEdit);
    try {
      // publish will resolve after the challenge request
      // if it fails before, like failing to resolve ENS, we can emit the error
      await communityEdit.publish();
    } catch (error) {
      publishCommunityEditOptions.onError?.(error, communityEdit);
    }
  };

  publishAndRetryFailedChallengeVerification();
  log("accountsActions.publishCommunityEdit", { createCommunityEditOptions });
};

export const createCommunity = async (
  createCommunityOptions: CreateCommunityOptions,
  accountName?: string,
) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountsActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }

  const community = await communitiesStore
    .getState()
    .createCommunity(createCommunityOptions, account);
  log("accountsActions.createCommunity", { createCommunityOptions, community });
  return community;
};

export const deleteCommunity = async (communityAddress: string, accountName?: string) => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountsActions before initialized`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }

  await communitiesStore.getState().deleteCommunity(communityAddress, account);
  log("accountsActions.deleteCommunity", { communityAddress });
};
