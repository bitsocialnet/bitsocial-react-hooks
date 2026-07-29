// public accounts actions that are called by the user

import accountsStore, { listeners } from "./accounts-store";
import communitiesStore from "../communities";
import accountsDatabase from "./accounts-database";
import accountGenerator from "./account-generator";
import Logger from "@pkcprotocol/pkc-logger";
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
  ExportCommunityOptions,
  CommunityExport,
  Communities,
  AccountComment,
} from "../../types";
import * as accountsActionsInternal from "./accounts-actions-internal";
import {
  backfillPublicationCommunityAddress,
  createPkcCommunity,
  createPkcCommunityEdit,
  getPkcCommunityAddresses,
  normalizeCommunityEditOptionsForPkc,
  normalizePublicationOptionsForStore,
  normalizePublicationOptionsForPkc,
  withPublishChallengeAnswersCompat,
} from "../../lib/pkc-compat";
import {
  getAccountCommentsIndex,
  getAccountCommunities,
  getCommentCidsToAccountsComments,
  getAccountsCommentsIndexes,
  COMMENT_MODERATION_AUTHOR_SUMMARY_KEY,
  getAccountEditPropertySummary,
  fetchCommentLinkDimensions,
  getAccountCommentDepth,
  addShortAddressesToAccountComment,
  sanitizeAccountCommentForState,
  sanitizeStoredAccountComment,
  getFreshestLoadedComment,
  getInitAccountCommentsToUpdate,
} from "./utils";
import isEqual from "lodash.isequal";
import { v4 as uuid } from "uuid";
import utils from "../../lib/utils";
import { addOptimisticVoteMetadata } from "../../lib/utils/optimistic-vote-counts";

type PublishSession = {
  accountId: string;
  originalIndex: number;
  currentIndex: number;
  comment?: any;
};

// Active publish-session tracking for pending comments (Task 3)
const activePublishSessions = new Map<string, PublishSession>();
const abandonedPublishSessionIds = new Set<string>();

const getClientsSnapshotForState = (clients: any): any => {
  if (!clients || typeof clients !== "object") {
    return undefined;
  }
  if (typeof clients.on === "function" || "state" in clients) {
    return { state: clients.state };
  }

  const snapshot: Record<string, any> = {};
  for (const key in clients) {
    const childSnapshot = getClientsSnapshotForState(clients[key]);
    if (childSnapshot !== undefined) {
      snapshot[key] = childSnapshot;
    }
  }
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
};

const unsafeCommentUpdatePropertyNames = new Set(["__proto__", "constructor", "prototype"]);

const applyChallengeVerificationCommentUpdateToPublication = (
  challengeVerification: ChallengeVerification | undefined,
  publication: Record<string, any> | undefined,
) => {
  const commentUpdate = challengeVerification?.commentUpdate;
  if (
    !commentUpdate ||
    typeof commentUpdate !== "object" ||
    Array.isArray(commentUpdate) ||
    !publication ||
    typeof publication !== "object"
  ) {
    return;
  }

  for (const key of Object.keys(commentUpdate)) {
    if (!unsafeCommentUpdatePropertyNames.has(key)) {
      publication[key] = commentUpdate[key];
    }
  }
};

const syncCommentClientsSnapshot = (
  publishSessionId: string,
  accountId: string,
  publication: any,
) => {
  const session = getPublishSession(publishSessionId);
  if (session?.currentIndex === undefined) {
    return;
  }

  const snapshot = getClientsSnapshotForState(publication?.clients);
  accountsStore.setState(({ accountsComments }) =>
    maybeUpdateAccountComment(accountsComments, accountId, session.currentIndex, (ac, acc) => {
      const updatedAccountComment = { ...acc };
      if (snapshot === undefined) {
        delete updatedAccountComment.clients;
      } else {
        updatedAccountComment.clients = snapshot;
      }
      ac[session.currentIndex] = updatedAccountComment;
    }),
  );
};

const accountOwnsCommunityLocally = (account: Account, communityAddress: string) => {
  const localCommunityAddresses = getPkcCommunityAddresses(account.pkc);
  if (localCommunityAddresses.includes(communityAddress)) {
    return true;
  }

  const storedCommunity = communitiesStore.getState().communities[communityAddress];
  if (storedCommunity?.roles?.[account.author.address]?.role === "owner") {
    return true;
  }
  if (
    storedCommunity?.signer?.address &&
    storedCommunity.signer.address === account.signer?.address
  ) {
    return true;
  }

  return account.communities?.[communityAddress]?.role?.role === "owner";
};

const createPublishSession = (accountId: string, index: number) => {
  const sessionId = uuid();
  activePublishSessions.set(sessionId, {
    accountId,
    originalIndex: index,
    currentIndex: index,
  });
  return sessionId;
};

const updatePublishSessionComment = (sessionId: string, comment?: any) => {
  const session = activePublishSessions.get(sessionId);
  if (!session) {
    return;
  }
  activePublishSessions.set(sessionId, { ...session, comment });
};

const abandonAndStopPublishSession = (accountId: string, index: number) => {
  const session = getPublishSessionByCurrentIndex(accountId, index);
  if (!session) return;
  abandonedPublishSessionIds.add(session.sessionId);
  try {
    const stop = session.comment?.stop?.bind(session.comment);
    if (typeof stop === "function") stop();
  } catch (e) {
    log.error("comment.stop() error during abandon", { accountId, index, error: e });
  }
  activePublishSessions.delete(session.sessionId);
};

const isPublishSessionAbandoned = (sessionId: string) => abandonedPublishSessionIds.has(sessionId);

const getPublishSession = (sessionId: string) => activePublishSessions.get(sessionId);

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

const getPublishSessionByCurrentIndex = (
  accountId: string,
  index: number,
): ({ sessionId: string } & PublishSession) | undefined => {
  for (const [key, session] of activePublishSessions) {
    if (session.accountId === accountId && session.currentIndex === index) {
      return { sessionId: key, ...session };
    }
  }
  return undefined;
};

const shiftPublishSessionIndicesAfterDelete = (accountId: string, deletedIndex: number) => {
  for (const session of activePublishSessions.values()) {
    if (session.accountId === accountId && session.currentIndex > deletedIndex) {
      session.currentIndex -= 1;
    }
  }
};

const cleanupPublishSessionOnTerminal = (sessionId: string) => {
  activePublishSessions.delete(sessionId);
  abandonedPublishSessionIds.delete(sessionId);
};

export const doesStoredAccountEditMatch = (storedAccountEdit: any, targetStoredAccountEdit: any) =>
  storedAccountEdit?.clientId && targetStoredAccountEdit?.clientId
    ? storedAccountEdit.clientId === targetStoredAccountEdit.clientId
    : isEqual(storedAccountEdit, targetStoredAccountEdit);

export const sanitizeStoredAccountEdit = (storedAccountEdit: any) => {
  const sanitizedStoredAccountEdit = { ...storedAccountEdit };
  delete sanitizedStoredAccountEdit.signer;
  delete sanitizedStoredAccountEdit.author;
  return sanitizedStoredAccountEdit;
};

const accountEditNonPropertyNames = new Set([
  "author",
  "signer",
  "clientId",
  "commentCid",
  "communityAddress",
  "communityAddress",
  "communityEdit",
  "communityEdit",
  "timestamp",
]);

const normalizeStoredAccountEditForSummary = (storedAccountEdit: any) => {
  const normalizedEdit = { ...storedAccountEdit };
  const commentModeration = normalizedEdit.commentModeration;
  if (commentModeration && typeof commentModeration === "object") {
    const { author, ...commentModerationProperties } = commentModeration;
    Object.assign(normalizedEdit, commentModerationProperties);
    if (Object.prototype.hasOwnProperty.call(commentModeration, "author")) {
      normalizedEdit[COMMENT_MODERATION_AUTHOR_SUMMARY_KEY] = author;
    }
    normalizedEdit.commentModeration = undefined;
  }
  const communityEdit = normalizedEdit.communityEdit ?? normalizedEdit.communityEdit;
  if (communityEdit && typeof communityEdit === "object") {
    Object.assign(normalizedEdit, communityEdit);
  }
  delete normalizedEdit.communityEdit;
  delete normalizedEdit.communityEdit;
  return normalizedEdit;
};

const getStoredAccountEditTarget = (storedAccountEdit: any) =>
  storedAccountEdit.commentCid ||
  storedAccountEdit.communityAddress ||
  storedAccountEdit.communityAddress;

export const addStoredAccountEditSummaryToState = (
  accountsEditsSummaries: Record<string, Record<string, any>>,
  accountId: string,
  storedAccountEdit: any,
) => {
  const editTarget = getStoredAccountEditTarget(storedAccountEdit);
  if (!editTarget) {
    return { accountsEditsSummaries };
  }

  const accountEditsSummary = accountsEditsSummaries[accountId] || {};
  const targetSummary = accountEditsSummary[editTarget] || {};
  const nextSummary = { ...targetSummary };
  const normalizedEdit = normalizeStoredAccountEditForSummary(storedAccountEdit);

  for (const propertyName in normalizedEdit) {
    if (
      (normalizedEdit[propertyName] === undefined &&
        propertyName !== COMMENT_MODERATION_AUTHOR_SUMMARY_KEY) ||
      accountEditNonPropertyNames.has(propertyName)
    ) {
      continue;
    }
    const previousTimestamp = nextSummary[propertyName]?.timestamp || 0;
    if ((normalizedEdit.timestamp || 0) >= previousTimestamp) {
      nextSummary[propertyName] = {
        timestamp: normalizedEdit.timestamp,
        value: normalizedEdit[propertyName],
      };
    }
  }

  return {
    accountsEditsSummaries: {
      ...accountsEditsSummaries,
      [accountId]: {
        ...accountEditsSummary,
        [editTarget]: nextSummary,
      },
    },
  };
};

export const removeStoredAccountEditSummaryFromState = (
  accountsEditsSummaries: Record<string, Record<string, any>>,
  accountsEdits: Record<string, Record<string, any[]>>,
  accountId: string,
  storedAccountEdit: any,
) => {
  const editTarget = getStoredAccountEditTarget(storedAccountEdit);
  if (!editTarget) {
    return { accountsEditsSummaries };
  }

  let deletedEdit = false;
  const editsForTarget = (accountsEdits[accountId]?.[editTarget] || []).filter((storedEdit) => {
    if (!deletedEdit && doesStoredAccountEditMatch(storedEdit, storedAccountEdit)) {
      deletedEdit = true;
      return false;
    }
    return true;
  });
  const nextTargetSummary = getAccountEditPropertySummary(editsForTarget);
  const nextAccountSummary = { ...(accountsEditsSummaries[accountId] || {}) };
  if (Object.keys(nextTargetSummary).length > 0) {
    nextAccountSummary[editTarget] = nextTargetSummary;
  } else {
    delete nextAccountSummary[editTarget];
  }

  return {
    accountsEditsSummaries: {
      ...accountsEditsSummaries,
      [accountId]: nextAccountSummary,
    },
  };
};

export const hasTerminalChallengeVerificationError = (challengeVerification: any) => {
  const challengeErrors = challengeVerification?.challengeErrors;
  const hasChallengeErrors = Array.isArray(challengeErrors)
    ? challengeErrors.length > 0
    : challengeErrors && typeof challengeErrors === "object"
      ? Object.keys(challengeErrors).length > 0
      : Boolean(challengeErrors);

  return (
    !challengeVerification?.challengeSuccess &&
    (hasChallengeErrors || Boolean(challengeVerification?.reason))
  );
};

export const addStoredAccountEditToState = (
  accountsEdits: Record<string, Record<string, any[]>>,
  accountId: string,
  storedAccountEdit: any,
) => {
  const accountEdits = accountsEdits[accountId] || {};
  const editTarget = getStoredAccountEditTarget(storedAccountEdit);
  if (!editTarget) {
    return { accountsEdits };
  }
  const commentEdits = accountEdits[editTarget] || [];
  return {
    accountsEdits: {
      ...accountsEdits,
      [accountId]: {
        ...accountEdits,
        [editTarget]: [...commentEdits, storedAccountEdit],
      },
    },
  };
};

export const removeStoredAccountEditFromState = (
  accountsEdits: Record<string, Record<string, any[]>>,
  accountId: string,
  storedAccountEdit: any,
) => {
  const accountEdits = accountsEdits[accountId] || {};
  const editTarget = getStoredAccountEditTarget(storedAccountEdit);
  if (!editTarget) {
    return { accountsEdits };
  }
  const commentEdits = accountEdits[editTarget] || [];
  let deletedEdit = false;
  const nextCommentEdits = commentEdits.filter((commentEdit) => {
    if (!deletedEdit && doesStoredAccountEditMatch(commentEdit, storedAccountEdit)) {
      deletedEdit = true;
      return false;
    }
    return true;
  });

  const nextAccountEdits =
    nextCommentEdits.length > 0
      ? {
          ...accountEdits,
          [editTarget]: nextCommentEdits,
        }
      : Object.fromEntries(
          Object.entries(accountEdits).filter(([target]) => target !== editTarget),
        );

  return {
    accountsEdits: {
      ...accountsEdits,
      [accountId]: nextAccountEdits,
    },
  };
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
  const {
    accounts,
    accountsComments,
    accountsCommentsIndexes,
    accountsVotes,
    accountsEdits,
    accountsEditsSummaries,
    accountsEditsLoaded,
    accountsCommentsReplies,
  } = accountsStore.getState();
  const newAccounts = { ...accounts, [newAccount.id]: newAccount };
  const newState: any = {
    accounts: newAccounts,
    accountIds: newAccountIds,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
    accountsComments: { ...accountsComments, [newAccount.id]: [] },
    accountsCommentsIndexes: {
      ...accountsCommentsIndexes,
      [newAccount.id]: getAccountCommentsIndex([]),
    },
    accountsVotes: { ...accountsVotes, [newAccount.id]: {} },
    accountsEdits: { ...accountsEdits, [newAccount.id]: {} },
    accountsEditsSummaries: { ...accountsEditsSummaries, [newAccount.id]: {} },
    accountsEditsLoaded: { ...accountsEditsLoaded, [newAccount.id]: false },
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
  const {
    accounts,
    accountNamesToAccountIds,
    activeAccountId,
    accountsComments,
    accountsCommentsIndexes,
    accountsVotes,
    accountsEdits,
    accountsEditsSummaries,
    accountsEditsLoaded,
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
  const newAccountsCommentsIndexes = { ...accountsCommentsIndexes };
  delete newAccountsCommentsIndexes[account.id];
  const newCommentCidsToAccountsComments = getCommentCidsToAccountsComments(newAccountsComments);
  const newAccountsVotes = { ...accountsVotes };
  delete newAccountsVotes[account.id];
  const newAccountsEdits = { ...accountsEdits };
  delete newAccountsEdits[account.id];
  const newAccountsEditsSummaries = { ...accountsEditsSummaries };
  delete newAccountsEditsSummaries[account.id];
  const newAccountsEditsLoaded = { ...accountsEditsLoaded };
  delete newAccountsEditsLoaded[account.id];

  accountsStore.setState({
    accounts: newAccounts,
    accountIds: newAccountIds,
    activeAccountId: newActiveAccountId,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
    accountsComments: newAccountsComments,
    accountsCommentsIndexes: newAccountsCommentsIndexes,
    commentCidsToAccountsComments: newCommentCidsToAccountsComments,
    accountsVotes: newAccountsVotes,
    accountsEdits: newAccountsEdits,
    accountsEditsSummaries: newAccountsEditsSummaries,
    accountsEditsLoaded: newAccountsEditsLoaded,
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
      const pkcSignerWalletWithNewAuthorAddress = await chain.getEthWalletFromPkcPrivateKey(
        account.signer.privateKey,
        account.author.address,
      );
      // wallet is using pkc signer, redo signature with new author.address
      if (account.author.wallets.eth.address === pkcSignerWalletWithNewAuthorAddress?.address) {
        account.author.wallets = {
          ...account.author.wallets,
          eth: pkcSignerWalletWithNewAuthorAddress,
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

  // Always assign a new local id so importing the same backup cannot overwrite an existing account.
  const accountToImport = {
    ...imported.account,
    communities,
    id: uuid(),
  };

  // Hydrate the imported identity once, then persist its history in bulk instead of replaying
  // every record through the single-publication write path.
  const newAccount = await accountsDatabase.addAccount(accountToImport, {
    returnHydratedAccount: true,
  });
  assert(newAccount, `accountsActions.importAccount failed to hydrate imported account`);
  const [
    { accountComments, accountVotes, accountEditsSummary },
    accountIds,
    newAccountNamesToAccountIds,
  ] = await Promise.all<any>([
    accountsDatabase.importAccountHistory(newAccount.id, {
      accountComments: imported.accountComments || [],
      accountVotes: imported.accountVotes || [],
      accountEdits: imported.accountEdits || [],
    }),
    accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
    accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
  ]);

  accountsStore.setState((state) => ({
    accounts: { ...state.accounts, [newAccount.id]: newAccount },
    accountIds,
    accountNamesToAccountIds: newAccountNamesToAccountIds,
    accountsComments: { ...state.accountsComments, [newAccount.id]: accountComments },
    accountsCommentsIndexes: {
      ...state.accountsCommentsIndexes,
      [newAccount.id]: getAccountCommentsIndex(accountComments),
    },
    commentCidsToAccountsComments: getCommentCidsToAccountsComments({
      ...state.accountsComments,
      [newAccount.id]: accountComments,
    }),
    accountsVotes: { ...state.accountsVotes, [newAccount.id]: accountVotes },
    accountsEdits: { ...state.accountsEdits, [newAccount.id]: {} },
    accountsEditsSummaries: {
      ...state.accountsEditsSummaries,
      [newAccount.id]: accountEditsSummary,
    },
    accountsEditsLoaded: { ...state.accountsEditsLoaded, [newAccount.id]: false },
    // don't import/export replies to own comments, those are just cached and can be refetched
    accountsCommentsReplies: { ...state.accountsCommentsReplies, [newAccount.id]: {} },
  }));

  log("accountsActions.importAccount", {
    account: newAccount,
    accountComments,
    accountVotes,
    accountEditsSummary,
  });

  // Match normal startup: refresh only the ten newest comments instead of opening a watcher
  // for the entire imported history at once.
  for (const { accountComment } of getInitAccountCommentsToUpdate({
    [newAccount.id]: accountComments,
  })) {
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

const getCommunityAddressesToExport = (
  communityAddressOrAddresses: string | string[] | undefined,
  account: Account,
) => {
  if (Array.isArray(communityAddressOrAddresses)) {
    return communityAddressOrAddresses;
  }
  if (communityAddressOrAddresses) {
    return [communityAddressOrAddresses];
  }
  return getPkcCommunityAddresses(account.pkc);
};

export const exportCommunity = async (
  communityAddressOrAddresses?: string | string[],
  exportCommunityOptions: ExportCommunityOptions = {},
  accountName?: string,
): Promise<CommunityExport[]> => {
  const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
  assert(
    accounts && accountNamesToAccountIds && activeAccountId,
    `can't use accountsStore.accountsActions before initialized`,
  );
  assert(
    !exportCommunityOptions || typeof exportCommunityOptions === "object",
    `accountsActions.exportCommunity invalid exportCommunityOptions argument '${exportCommunityOptions}'`,
  );
  let account = accounts[activeAccountId];
  if (accountName) {
    const accountId = accountNamesToAccountIds[accountName];
    account = accounts[accountId];
  }
  assert(
    account?.id,
    `accountsActions.exportCommunity account.id '${account?.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`,
  );

  const communityAddresses = getCommunityAddressesToExport(communityAddressOrAddresses, account);
  assert(
    communityAddresses.length > 0,
    `accountsActions.exportCommunity no community addresses to export`,
  );
  for (const communityAddress of communityAddresses) {
    assert(
      communityAddress && typeof communityAddress === "string",
      `accountsActions.exportCommunity invalid communityAddress '${communityAddress}'`,
    );
  }

  const communityExports = await Promise.all(
    [...new Set(communityAddresses)].map(async (communityAddress) => {
      const community = await createPkcCommunity(account.pkc, { address: communityAddress });
      assert(
        typeof community?.export === "function",
        `accountsActions.exportCommunity community.export missing for communityAddress '${communityAddress}'`,
      );
      const exportedCommunity = await community.export(exportCommunityOptions);
      return { ...exportedCommunity, communityAddress };
    }),
  );
  log("accountsActions.exportCommunity", {
    communityAddresses,
    includePrivateKey: exportCommunityOptions.includePrivateKey === true,
    communityExportCount: communityExports.length,
  });
  return communityExports;
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

  let createCommentOptions: any = normalizePublicationOptionsForPkc(account.pkc, {
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
  const storedCreateCommentOptions = normalizePublicationOptionsForStore(createCommentOptions);

  // make sure the options dont throw
  await account.pkc.createComment(createCommentOptions);

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
  const publishSessionId = createPublishSession(account.id, accountCommentIndex);
  let savedOnce = false;
  const saveCreatedAccountComment = async (accountComment: AccountComment) => {
    if (isPublishSessionAbandoned(publishSessionId)) {
      return;
    }
    const isUpdate = savedOnce;
    const session = getPublishSession(publishSessionId);
    const currentIndex = session?.currentIndex ?? accountCommentIndex;
    const persistedAccountComment = addShortAddressesToAccountComment(
      sanitizeStoredAccountComment(accountComment),
    ) as AccountComment;
    const liveAccountComment = addShortAddressesToAccountComment(
      sanitizeAccountCommentForState(accountComment),
    ) as AccountComment;
    const liveAccountComments = accountsStore.getState().accountsComments[account.id] || [];
    if (isUpdate && !liveAccountComments[currentIndex]) {
      return;
    }
    await accountsDatabase.addAccountComment(
      account.id,
      persistedAccountComment,
      isUpdate ? currentIndex : undefined,
    );
    savedOnce = true;
    accountsStore.setState(({ accountsComments, accountsCommentsIndexes }) => {
      const accountComments = [...accountsComments[account.id]];
      if (isUpdate && !accountComments[currentIndex]) {
        return {};
      }
      accountComments[currentIndex] = {
        ...liveAccountComment,
        index: currentIndex,
        accountId: account.id,
      };
      return {
        accountsComments: { ...accountsComments, [account.id]: accountComments },
        accountsCommentsIndexes: {
          ...accountsCommentsIndexes,
          [account.id]: getAccountCommentsIndex(accountComments),
        },
      };
    });
  };
  let createdAccountComment = {
    ...storedCreateCommentOptions,
    depth,
    index: accountCommentIndex,
    accountId: account.id,
  };
  createdAccountComment = addShortAddressesToAccountComment(
    sanitizeAccountCommentForState(createdAccountComment),
  );
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
    if (isPublishSessionAbandoned(publishSessionId)) {
      return;
    }
    comment = backfillPublicationCommunityAddress(
      await account.pkc.createComment(createCommentOptions),
      createCommentOptions,
    );
    syncCommentClientsSnapshot(publishSessionId, account.id, comment);
    publishAndRetryFailedChallengeVerification();
    log("accountsActions.publishComment", { createCommentOptions });
  })();

  let lastChallenge: Challenge | undefined;
  let lastReportedPublishError: Error | undefined;
  const normalizePublishError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error));
  const getActiveSessionForComment = (activeComment: any) => {
    const session = getPublishSession(publishSessionId);
    if (
      !session ||
      isPublishSessionAbandoned(publishSessionId) ||
      session.comment !== activeComment
    ) {
      return undefined;
    }
    return session;
  };
  const queueCleanupFailedPublishSession = (activeComment: any) => {
    if (!getActiveSessionForComment(activeComment)) return;
    queueMicrotask(() => {
      if (getActiveSessionForComment(activeComment)) {
        cleanupPublishSessionOnTerminal(publishSessionId);
      }
    });
  };
  const recordPublishCommentError = (rawError: unknown, activeComment: any) => {
    const error = normalizePublishError(rawError);
    if (lastReportedPublishError === error) {
      return error;
    }
    lastReportedPublishError = error;

    const session = getActiveSessionForComment(activeComment);
    if (!session) return error;
    const currentIndex = session.currentIndex;
    accountsStore.setState(({ accountsComments }) =>
      maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
        const previousErrors = Array.isArray(acc.errors) ? acc.errors : [];
        const errors =
          previousErrors[previousErrors.length - 1] === error
            ? previousErrors
            : [...previousErrors, error];
        ac[currentIndex] = { ...acc, errors, error };
      }),
    );
    return error;
  };
  const reportActivePublishCommentError = (rawError: unknown, activeComment: any) => {
    if (!getActiveSessionForComment(activeComment)) return;
    const error = recordPublishCommentError(rawError, activeComment);
    queueCleanupFailedPublishSession(activeComment);
    publishCommentOptions.onError?.(error, activeComment);
  };
  async function publishAndRetryFailedChallengeVerification() {
    if (isPublishSessionAbandoned(publishSessionId)) {
      return;
    }
    const activeComment = comment;
    updatePublishSessionComment(publishSessionId, activeComment);
    activeComment.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommentOptions.onChallenge(
        challenge,
        withPublishChallengeAnswersCompat(activeComment),
      );
    });
    activeComment.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        applyChallengeVerificationCommentUpdateToPublication(challengeVerification, activeComment);
        publishCommentOptions.onChallengeVerification(challengeVerification, activeComment);
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          const timestamp = Math.floor(Date.now() / 1000);
          createCommentOptions = { ...createCommentOptions, timestamp };
          createdAccountComment = { ...createdAccountComment, timestamp };
          updatePublishSessionComment(publishSessionId, undefined);
          await saveCreatedAccountComment(createdAccountComment);
          if (isPublishSessionAbandoned(publishSessionId)) {
            return;
          }
          comment = backfillPublicationCommunityAddress(
            await account.pkc.createComment(createCommentOptions),
            createCommentOptions,
          );
          syncCommentClientsSnapshot(publishSessionId, account.id, comment);
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        } else {
          // the challengeverification message of a comment publication should in theory send back the CID
          // of the published comment which is needed to resolve it for replies, upvotes, etc
          const session = getPublishSession(publishSessionId);
          const currentIndex = session?.currentIndex ?? accountCommentIndex;
          if (!session || isPublishSessionAbandoned(publishSessionId)) return;
          queueMicrotask(() => cleanupPublishSessionOnTerminal(publishSessionId));
          if (challengeVerification?.commentUpdate?.cid) {
            const persistedCommentWithCid = addShortAddressesToAccountComment(
              sanitizeStoredAccountComment(normalizePublicationOptionsForStore(comment as any)),
            );
            const liveCommentWithCid = addShortAddressesToAccountComment(
              sanitizeAccountCommentForState(normalizePublicationOptionsForStore(comment as any)),
            );
            delete (persistedCommentWithCid as any).clients;
            delete (persistedCommentWithCid as any).publishingState;
            delete (persistedCommentWithCid as any).error;
            delete (persistedCommentWithCid as any).errors;
            delete (liveCommentWithCid as any).clients;
            delete (liveCommentWithCid as any).publishingState;
            delete (liveCommentWithCid as any).error;
            delete (liveCommentWithCid as any).errors;
            await accountsDatabase.addAccountComment(
              account.id,
              persistedCommentWithCid,
              currentIndex,
            );
            accountsStore.setState(
              ({ accountsComments, accountsCommentsIndexes, commentCidsToAccountsComments }) => {
                const updatedAccountComments = [...accountsComments[account.id]];
                const updatedAccountComment = {
                  ...liveCommentWithCid,
                  index: currentIndex,
                  accountId: account.id,
                };
                updatedAccountComments[currentIndex] = updatedAccountComment;
                return {
                  accountsComments: { ...accountsComments, [account.id]: updatedAccountComments },
                  accountsCommentsIndexes: {
                    ...accountsCommentsIndexes,
                    [account.id]: getAccountCommentsIndex(updatedAccountComments),
                  },
                  commentCidsToAccountsComments: {
                    ...commentCidsToAccountsComments,
                    [challengeVerification?.commentUpdate?.cid]: {
                      accountId: account.id,
                      accountCommentIndex: currentIndex,
                    },
                  },
                };
              },
            );

            // clone the comment or it bugs publishing callbacks
            const updatingComment = await account.pkc.createComment(
              normalizePublicationOptionsForPkc(account.pkc, { ...comment }),
            );
            applyChallengeVerificationCommentUpdateToPublication(
              challengeVerification,
              updatingComment,
            );
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
      },
    );

    activeComment.on("error", (error: Error) => {
      reportActivePublishCommentError(error, activeComment);
    });
    activeComment.on("statechange", (state: string) => {
      const session = getActiveSessionForComment(activeComment);
      if (!session) return;
      const currentIndex = session.currentIndex;
      let hasTerminalFailedState = false;
      accountsStore.setState(({ accountsComments }) =>
        maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
          const nextAccountComment = { ...acc, state };
          ac[currentIndex] = nextAccountComment;
          hasTerminalFailedState =
            nextAccountComment.state === "stopped" &&
            nextAccountComment.publishingState === "failed";
        }),
      );
      if (hasTerminalFailedState) {
        queueCleanupFailedPublishSession(activeComment);
      }
    });
    activeComment.on("publishingstatechange", async (publishingState: string) => {
      const session = getActiveSessionForComment(activeComment);
      if (!session) return;
      const currentIndex = session.currentIndex;
      let hasTerminalFailedState = false;
      accountsStore.setState(({ accountsComments }) =>
        maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
          const nextAccountComment = { ...acc, publishingState };
          ac[currentIndex] = nextAccountComment;
          hasTerminalFailedState =
            nextAccountComment.state === "stopped" &&
            nextAccountComment.publishingState === "failed";
        }),
      );
      if (hasTerminalFailedState) {
        queueCleanupFailedPublishSession(activeComment);
      }
      publishCommentOptions.onPublishingStateChange?.(publishingState);
    });

    // set clients on account comment so the frontend can display it, dont persist in db because a reload cancels publishing
    utils.clientsOnStateChange(
      activeComment.clients,
      (clientState: string, clientType: string, clientUrl: string, chainTicker?: string) => {
        const session = getActiveSessionForComment(activeComment);
        if (!session) return;
        const currentIndex = session.currentIndex;
        accountsStore.setState(({ accountsComments }) =>
          maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
            const clients = getClientsSnapshotForState(activeComment.clients) || {};
            const client = { state: clientState };
            if (chainTicker) {
              const chainProviders = { ...clients[clientType][chainTicker], [clientUrl]: client };
              clients[clientType] = { ...clients[clientType], [chainTicker]: chainProviders };
            } else {
              clients[clientType] = { ...clients[clientType], [clientUrl]: client };
            }
            ac[currentIndex] = { ...acc, clients };
          }),
        );
      },
    );

    listeners.push(activeComment);
    try {
      // publish will resolve after the challenge request
      // if it fails before, like failing to resolve ENS, we can emit the error
      await activeComment.publish();
    } catch (error) {
      reportActivePublishCommentError(error, activeComment);
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

  accountsStore.setState(({ accountsCommentsIndexes }) => ({
    accountsComments: newAccountsComments,
    accountsCommentsIndexes: {
      ...accountsCommentsIndexes,
      [account.id]: getAccountCommentsIndex(reindexed),
    },
    commentCidsToAccountsComments: newCommentCidsToAccountsComments,
  }));

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

  let createVoteOptions: any = normalizePublicationOptionsForPkc(account.pkc, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    ...publishVoteOptions,
  });
  delete createVoteOptions.onChallenge;
  delete createVoteOptions.onChallengeVerification;
  delete createVoteOptions.onError;
  delete createVoteOptions.onPublishingStateChange;
  const accountsState = accountsStore.getState();
  const accountCommentInfo =
    accountsState.commentCidsToAccountsComments[createVoteOptions.commentCid];
  const accountComment = accountCommentInfo
    ? accountsState.accountsComments[accountCommentInfo.accountId]?.[
        accountCommentInfo.accountCommentIndex
      ]
    : undefined;
  const storedCreateVoteOptions = addOptimisticVoteMetadata(
    normalizePublicationOptionsForStore(createVoteOptions),
    accountsState.accountsVotes[account.id]?.[createVoteOptions.commentCid],
    getFreshestLoadedComment(createVoteOptions.commentCid, accountComment),
  );

  let vote = backfillPublicationCommunityAddress(
    await account.pkc.createVote(createVoteOptions),
    createVoteOptions,
  );
  let lastChallenge: Challenge | undefined;
  const publishAndRetryFailedChallengeVerification = async () => {
    vote.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishVoteOptions.onChallenge(challenge, withPublishChallengeAnswersCompat(vote));
    });
    vote.once("challengeverification", async (challengeVerification: ChallengeVerification) => {
      publishVoteOptions.onChallengeVerification(challengeVerification, vote);
      if (!challengeVerification.challengeSuccess && lastChallenge) {
        // publish again automatically on fail
        createVoteOptions = { ...createVoteOptions, timestamp: Math.floor(Date.now() / 1000) };
        vote = backfillPublicationCommunityAddress(
          await account.pkc.createVote(createVoteOptions),
          createVoteOptions,
        );
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
  await accountsDatabase.addAccountVote(account.id, storedCreateVoteOptions);
  log("accountsActions.publishVote", { createVoteOptions });
  accountsStore.setState(({ accountsVotes }) => ({
    accountsVotes: {
      ...accountsVotes,
      [account.id]: {
        ...accountsVotes[account.id],
        [storedCreateVoteOptions.commentCid]:
          // remove signer and author because not needed and they expose private key
          { ...storedCreateVoteOptions, signer: undefined, author: undefined },
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

  let createCommentEditOptions: any = normalizePublicationOptionsForPkc(account.pkc, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    ...publishCommentEditOptions,
  });
  delete createCommentEditOptions.onChallenge;
  delete createCommentEditOptions.onChallengeVerification;
  delete createCommentEditOptions.onError;
  delete createCommentEditOptions.onPublishingStateChange;
  const storedCreateCommentEditOptions = {
    ...normalizePublicationOptionsForStore(createCommentEditOptions),
    clientId: uuid(),
  };
  const storedCommentEdit = sanitizeStoredAccountEdit(storedCreateCommentEditOptions);

  let commentEdit = backfillPublicationCommunityAddress(
    await account.pkc.createCommentEdit(createCommentEditOptions),
    createCommentEditOptions,
  );
  let lastChallenge: Challenge | undefined;
  let challengeSucceeded = false;
  let rollbackPendingEditPromise: Promise<void> | undefined;
  const rollbackStoredCommentEdit = () => {
    if (!rollbackPendingEditPromise && !challengeSucceeded) {
      rollbackPendingEditPromise = Promise.all([
        accountsDatabase.deleteAccountEdit(account.id, storedCommentEdit),
        Promise.resolve(
          accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
            const nextState: any = removeStoredAccountEditSummaryFromState(
              accountsEditsSummaries,
              accountsEdits,
              account.id,
              storedCommentEdit,
            );
            Object.assign(
              nextState,
              removeStoredAccountEditFromState(accountsEdits, account.id, storedCommentEdit),
            );
            return nextState;
          }),
        ),
      ]).then(() => {});
    }
    return rollbackPendingEditPromise;
  };

  await accountsDatabase.addAccountEdit(account.id, storedCreateCommentEditOptions);
  log("accountsActions.publishCommentEdit", { createCommentEditOptions });
  accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
    const nextState: any = addStoredAccountEditSummaryToState(
      accountsEditsSummaries,
      account.id,
      storedCommentEdit,
    );
    Object.assign(
      nextState,
      addStoredAccountEditToState(accountsEdits, account.id, storedCommentEdit),
    );
    return nextState;
  });

  const publishAndRetryFailedChallengeVerification = async () => {
    commentEdit.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommentEditOptions.onChallenge(
        challenge,
        withPublishChallengeAnswersCompat(commentEdit),
      );
    });
    commentEdit.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        publishCommentEditOptions.onChallengeVerification(challengeVerification, commentEdit);
        if (challengeVerification.challengeSuccess) {
          challengeSucceeded = true;
        }
        if (hasTerminalChallengeVerificationError(challengeVerification)) {
          lastChallenge = undefined;
          await rollbackStoredCommentEdit();
          return;
        }
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          createCommentEditOptions = {
            ...createCommentEditOptions,
            timestamp: Math.floor(Date.now() / 1000),
          };
          commentEdit = backfillPublicationCommunityAddress(
            await account.pkc.createCommentEdit(createCommentEditOptions),
            createCommentEditOptions,
          );
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        }
      },
    );
    commentEdit.on("error", async (error: Error) => {
      await rollbackStoredCommentEdit();
      publishCommentEditOptions.onError?.(error, commentEdit);
    });
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
      await rollbackStoredCommentEdit();
      publishCommentEditOptions.onError?.(error, commentEdit);
    }
  };

  publishAndRetryFailedChallengeVerification();
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

  let createCommentModerationOptions: any = normalizePublicationOptionsForPkc(account.pkc, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    ...publishCommentModerationOptions,
  });
  delete createCommentModerationOptions.onChallenge;
  delete createCommentModerationOptions.onChallengeVerification;
  delete createCommentModerationOptions.onError;
  delete createCommentModerationOptions.onPublishingStateChange;
  const storedCreateCommentModerationOptions = {
    ...normalizePublicationOptionsForStore(createCommentModerationOptions),
    clientId: uuid(),
  };
  const storedCommentModeration = sanitizeStoredAccountEdit(storedCreateCommentModerationOptions);

  let commentModeration = backfillPublicationCommunityAddress(
    await account.pkc.createCommentModeration(createCommentModerationOptions),
    createCommentModerationOptions,
  );
  let lastChallenge: Challenge | undefined;
  let challengeSucceeded = false;
  let storedCommentModerationAdded = false;
  let rollbackStoredCommentModerationRequested = false;
  let rollbackPendingEditPromise: Promise<void> | undefined;
  const rollbackStoredCommentModeration = () => {
    rollbackStoredCommentModerationRequested = true;
    if (!storedCommentModerationAdded) {
      return Promise.resolve();
    }
    if (!rollbackPendingEditPromise && !challengeSucceeded) {
      rollbackPendingEditPromise = Promise.all([
        accountsDatabase.deleteAccountEdit(account.id, storedCommentModeration),
        Promise.resolve(
          accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
            const nextState: any = removeStoredAccountEditSummaryFromState(
              accountsEditsSummaries,
              accountsEdits,
              account.id,
              storedCommentModeration,
            );
            Object.assign(
              nextState,
              removeStoredAccountEditFromState(accountsEdits, account.id, storedCommentModeration),
            );
            return nextState;
          }),
        ),
      ]).then(() => {});
    }
    return rollbackPendingEditPromise || Promise.resolve();
  };

  const publishAndRetryFailedChallengeVerification = async () => {
    commentModeration.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommentModerationOptions.onChallenge(
        challenge,
        withPublishChallengeAnswersCompat(commentModeration),
      );
    });
    commentModeration.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        publishCommentModerationOptions.onChallengeVerification(
          challengeVerification,
          commentModeration,
        );
        if (challengeVerification.challengeSuccess) {
          challengeSucceeded = true;
        }
        if (hasTerminalChallengeVerificationError(challengeVerification)) {
          lastChallenge = undefined;
          await rollbackStoredCommentModeration();
          return;
        }
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          createCommentModerationOptions = {
            ...createCommentModerationOptions,
            timestamp: Math.floor(Date.now() / 1000),
          };
          commentModeration = backfillPublicationCommunityAddress(
            await account.pkc.createCommentModeration(createCommentModerationOptions),
            createCommentModerationOptions,
          );
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        }
      },
    );
    commentModeration.on("error", async (error: Error) => {
      await rollbackStoredCommentModeration();
      publishCommentModerationOptions.onError?.(error, commentModeration);
    });
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
      await rollbackStoredCommentModeration();
      publishCommentModerationOptions.onError?.(error, commentModeration);
    }
  };

  publishAndRetryFailedChallengeVerification();

  await accountsDatabase.addAccountEdit(account.id, storedCreateCommentModerationOptions);
  log("accountsActions.publishCommentModeration", { createCommentModerationOptions });
  accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
    const nextState: any = addStoredAccountEditSummaryToState(
      accountsEditsSummaries,
      account.id,
      storedCommentModeration,
    );
    Object.assign(
      nextState,
      addStoredAccountEditToState(accountsEdits, account.id, storedCommentModeration),
    );
    return nextState;
  });
  storedCommentModerationAdded = true;
  if (rollbackStoredCommentModerationRequested) {
    await rollbackStoredCommentModeration();
  }
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
  let createCommunityEditOptions: any = normalizeCommunityEditOptionsForPkc(account.pkc, {
    timestamp: Math.floor(Date.now() / 1000),
    author: account.author,
    signer: account.signer,
    // not possible to edit community.address over pubsub, only locally
    communityAddress,
    communityEdit: communityEditOptions,
  });
  const storedCreateCommunityEditOptions = {
    ...normalizePublicationOptionsForStore(createCommunityEditOptions),
    clientId: uuid(),
  };
  const storedCommunityEdit = sanitizeStoredAccountEdit(storedCreateCommunityEditOptions);
  let challengeSucceeded = false;
  let rollbackPendingEditPromise: Promise<void> | undefined;
  const rollbackStoredCommunityEdit = () => {
    if (!rollbackPendingEditPromise && !challengeSucceeded) {
      rollbackPendingEditPromise = Promise.all([
        accountsDatabase.deleteAccountEdit(account.id, storedCommunityEdit),
        Promise.resolve(
          accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
            const nextState: any = removeStoredAccountEditSummaryFromState(
              accountsEditsSummaries,
              accountsEdits,
              account.id,
              storedCommunityEdit,
            );
            Object.assign(
              nextState,
              removeStoredAccountEditFromState(accountsEdits, account.id, storedCommunityEdit),
            );
            return nextState;
          }),
        ),
      ]).then(() => {});
    }
    return rollbackPendingEditPromise;
  };
  const storePublishedCommunityEdit = async () => {
    await accountsDatabase.addAccountEdit(account.id, storedCreateCommunityEditOptions);
    accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
      const nextState: any = addStoredAccountEditSummaryToState(
        accountsEditsSummaries,
        account.id,
        storedCommunityEdit,
      );
      Object.assign(
        nextState,
        addStoredAccountEditToState(accountsEdits, account.id, storedCommunityEdit),
      );
      return nextState;
    });
  };

  // account is the owner of the community and can edit it locally, no need to publish
  if (accountOwnsCommunityLocally(account, communityAddress)) {
    await communitiesStore
      .getState()
      .editCommunity(communityAddress, communityEditOptions, account);
    await storePublishedCommunityEdit();
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
  let communityEdit = backfillPublicationCommunityAddress(
    await createPkcCommunityEdit(account.pkc, createCommunityEditOptions),
    createCommunityEditOptions,
  );
  let lastChallenge: Challenge | undefined;
  const publishAndRetryFailedChallengeVerification = async () => {
    communityEdit.once("challenge", async (challenge: Challenge) => {
      lastChallenge = challenge;
      publishCommunityEditOptions.onChallenge(
        challenge,
        withPublishChallengeAnswersCompat(communityEdit),
      );
    });
    communityEdit.once(
      "challengeverification",
      async (challengeVerification: ChallengeVerification) => {
        publishCommunityEditOptions.onChallengeVerification(challengeVerification, communityEdit);
        if (challengeVerification.challengeSuccess) {
          challengeSucceeded = true;
        }
        if (hasTerminalChallengeVerificationError(challengeVerification)) {
          lastChallenge = undefined;
          await rollbackStoredCommunityEdit();
          return;
        }
        if (!challengeVerification.challengeSuccess && lastChallenge) {
          // publish again automatically on fail
          createCommunityEditOptions = {
            ...createCommunityEditOptions,
            timestamp: Math.floor(Date.now() / 1000),
          };
          communityEdit = backfillPublicationCommunityAddress(
            await createPkcCommunityEdit(account.pkc, createCommunityEditOptions),
            createCommunityEditOptions,
          );
          lastChallenge = undefined;
          publishAndRetryFailedChallengeVerification();
        }
      },
    );
    communityEdit.on("error", async (error: Error) => {
      await rollbackStoredCommunityEdit();
      publishCommunityEditOptions.onError?.(error, communityEdit);
    });
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
      await rollbackStoredCommunityEdit();
      publishCommunityEditOptions.onError?.(error, communityEdit);
    }
  };

  await storePublishedCommunityEdit();
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
