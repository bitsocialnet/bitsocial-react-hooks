import assert from "assert";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import accountsDatabase from "./accounts-database";
import accountGenerator from "./account-generator";
import { preloadAccountChainLibraries } from "../../lib/chain";
import {
  AccountNamesToAccountIds,
  Account,
  Accounts,
  AccountsActions,
  Comment,
  AccountsVotes,
  AccountsEdits,
  AccountsEditsSummaries,
  AccountComment,
  AccountsComments,
  AccountsCommentsIndexes,
  AccountsCommentsReplies,
  CommentCidsToAccountsComments,
} from "../../types";
import createStore from "zustand";
import * as accountsActions from "./accounts-actions";
import * as accountsActionsInternal from "./accounts-actions-internal";
import localForage from "localforage";
import {
  getAccountsCommentsIndexes,
  getCommentCidsToAccountsComments,
  getInitAccountCommentsToUpdate,
} from "./utils";

// reset all event listeners in between tests
export const listeners: any = [];

type AccountsState = {
  accounts: Accounts;
  accountIds: string[];
  activeAccountId: string | undefined;
  accountNamesToAccountIds: AccountNamesToAccountIds;
  accountsComments: AccountsComments;
  accountsCommentsIndexes: AccountsCommentsIndexes;
  commentCidsToAccountsComments: CommentCidsToAccountsComments;
  accountsCommentsUpdating: { [commentCid: string]: boolean };
  accountsCommentsReplies: AccountsCommentsReplies;
  accountsVotes: AccountsVotes;
  accountsEdits: AccountsEdits;
  accountsEditsSummaries: AccountsEditsSummaries;
  accountsEditsLoaded: { [accountId: string]: boolean };
  accountsActions: { [functionName: string]: Function };
  accountsActionsInternal: { [functionName: string]: Function };
};

const accountsStore = createStore<AccountsState>((setState: Function, getState: Function) => ({
  accounts: {},
  accountIds: [],
  activeAccountId: undefined,
  accountNamesToAccountIds: {},
  accountsComments: {},
  accountsCommentsIndexes: {},
  commentCidsToAccountsComments: {},
  accountsCommentsUpdating: {},
  accountsCommentsReplies: {},
  accountsVotes: {},
  accountsEdits: {},
  accountsEditsSummaries: {},
  accountsEditsLoaded: {},
  accountsActions,
  accountsActionsInternal,
}));

// load accounts from database once on load
const initializeAccountsStore = async () => {
  await accountsDatabase.migrate();

  let accountIds: string[] | undefined;
  let activeAccountId: string | undefined;
  let accounts: Accounts;
  let accountNamesToAccountIds: AccountNamesToAccountIds | undefined;
  accountIds = (await accountsDatabase.accountsMetadataDatabase.getItem("accountIds")) || undefined;
  // get accounts from database if any
  if (accountIds?.length) {
    [activeAccountId, accounts, accountNamesToAccountIds] = await Promise.all<any>([
      accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId"),
      accountsDatabase.getAccounts(accountIds),
      accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);
  }
  // no accounts in database, create a default account
  else {
    const defaultAccount = await accountGenerator.generateDefaultAccount();
    await accountsDatabase.addAccount(defaultAccount);
    accounts = { [defaultAccount.id]: defaultAccount };
    [accountIds, activeAccountId, accountNamesToAccountIds] = await Promise.all<any>([
      accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
      accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId"),
      accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);
    assert(
      accountIds && activeAccountId && accountNamesToAccountIds,
      `accountsStore error creating a default account during initialization accountsMetadataDatabase.accountIds '${accountIds}' accountsMetadataDatabase.activeAccountId '${activeAccountId}' accountsMetadataDatabase.accountNamesToAccountIds '${JSON.stringify(
        accountNamesToAccountIds,
      )}'`,
    );
  }
  const [accountsComments, accountsVotes, accountsCommentsReplies, accountsEditsSummaries] =
    await Promise.all<any>([
      accountsDatabase.getAccountsComments(accountIds),
      accountsDatabase.getAccountsVotes(accountIds),
      accountsDatabase.getAccountsCommentsReplies(accountIds),
      accountsDatabase.getAccountsEditsSummaries(accountIds),
    ]);
  const commentCidsToAccountsComments = getCommentCidsToAccountsComments(accountsComments);
  const accountsCommentsIndexes = getAccountsCommentsIndexes(accountsComments);
  accountsStore.setState((state) => ({
    accounts,
    accountIds,
    activeAccountId,
    accountNamesToAccountIds,
    accountsComments,
    accountsCommentsIndexes,
    commentCidsToAccountsComments,
    accountsVotes,
    accountsCommentsReplies,
    // Keep accountsEditsSummaries hot while accountsEdits stays cold until accountsEditsLoaded flips true.
    accountsEdits: Object.fromEntries(accountIds.map((accountId) => [accountId, {}])),
    accountsEditsSummaries,
    accountsEditsLoaded: Object.fromEntries(accountIds.map((accountId) => [accountId, false])),
  }));

  // start looking for updates for all accounts comments in database
  for (const { accountComment, accountId } of getInitAccountCommentsToUpdate(accountsComments)) {
    accountsStore
      .getState()
      .accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(
        accountComment,
        accounts[accountId],
        accountComment.index,
      )
      .catch((error: unknown) =>
        log.error(
          "accountsStore.initializeAccountsStore startUpdatingAccountCommentOnCommentUpdateEvents error",
          {
            accountComment,
            accountCommentIndex: accountComment.index,
            accounts,
            error,
          },
        ),
      );
  }
};

// @ts-ignore
const isInitializing = () => !!window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;
const waitForInitialized = async () => {
  while (isInitializing()) {
    // uncomment to debug accounts init
    // console.warn(`can't reset accounts store while initializing, waiting 100ms`)
    await new Promise((r) => setTimeout(r, 100));
  }
};

(async () => {
  // don't initialize on load multiple times when loading the file multiple times during karma tests
  // @ts-ignore
  if (window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE) {
    return;
  }

  // @ts-ignore
  window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE = true;
  // @ts-ignore
  window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING = true;

  preloadAccountChainLibraries();
  log("accounts store initializing started");
  try {
    await initializeAccountsStore();
  } catch (error) {
    // initializing can fail in tests when store is being reset at the same time as databases are being deleted
    log.error("accountsStore.initializeAccountsStore error", {
      accountsStore: accountsStore.getState(),
      error,
    });
  } finally {
    // @ts-ignore
    delete window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;
  }
  log("accounts store initializing finished");
})();

// reset store in between tests
const originalState = accountsStore.getState();
// async function because some stores have async init
export const resetAccountsStore = async () => {
  // don't reset while initializing, it could happen during quick successive tests
  await waitForInitialized();

  log("accounts store reset started");

  // remove all event listeners
  listeners.forEach((listener: any) => listener.removeAllListeners());
  accountsStore.getState().accountsActionsInternal.resetLazyAccountHistoryLoaders?.();
  // destroy all component subscriptions to the store
  accountsStore.destroy();
  // restore original state
  accountsStore.setState(originalState);
  // init the store
  await initializeAccountsStore();

  log("accounts store reset finished");
};

// reset database and store in between tests
export const resetAccountsDatabaseAndStore = async () => {
  // don't reset while initializing, it could happen during quick successive tests
  await waitForInitialized();

  await Promise.all([
    localForage.createInstance({ name: "bitsocialReactHooks-accountsMetadata" }).clear(),
    localForage.createInstance({ name: "bitsocialReactHooks-accounts" }).clear(),
  ]);
  await resetAccountsStore();
};

export default accountsStore;
