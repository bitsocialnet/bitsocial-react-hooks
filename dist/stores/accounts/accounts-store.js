var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import assert from "assert";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import accountsDatabase from "./accounts-database.js";
import accountGenerator from "./account-generator.js";
import { preloadAccountChainLibraries } from "../../lib/chain/index.js";
import createStore from "zustand";
import * as accountsActions from "./accounts-actions.js";
import * as accountsActionsInternal from "./accounts-actions-internal.js";
import localForage from "localforage";
import { getAccountsCommentsIndexes, getCommentCidsToAccountsComments, getInitAccountCommentsToUpdate, } from "./utils.js";
// reset all event listeners in between tests
export const listeners = [];
const accountsStore = createStore((setState, getState) => ({
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
const initializeAccountsStore = () => __awaiter(void 0, void 0, void 0, function* () {
    yield accountsDatabase.migrate();
    let accountIds;
    let activeAccountId;
    let accounts;
    let accountNamesToAccountIds;
    accountIds = (yield accountsDatabase.accountsMetadataDatabase.getItem("accountIds")) || undefined;
    // get accounts from database if any
    if (accountIds === null || accountIds === void 0 ? void 0 : accountIds.length) {
        [activeAccountId, accounts, accountNamesToAccountIds] = yield Promise.all([
            accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId"),
            accountsDatabase.getAccounts(accountIds),
            accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
        ]);
    }
    // no accounts in database, create a default account
    else {
        const defaultAccount = yield accountGenerator.generateDefaultAccount();
        yield accountsDatabase.addAccount(defaultAccount);
        accounts = { [defaultAccount.id]: defaultAccount };
        [accountIds, activeAccountId, accountNamesToAccountIds] = yield Promise.all([
            accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
            accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId"),
            accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
        ]);
        assert(accountIds && activeAccountId && accountNamesToAccountIds, `accountsStore error creating a default account during initialization accountsMetadataDatabase.accountIds '${accountIds}' accountsMetadataDatabase.activeAccountId '${activeAccountId}' accountsMetadataDatabase.accountNamesToAccountIds '${JSON.stringify(accountNamesToAccountIds)}'`);
    }
    const [accountsComments, accountsVotes, accountsCommentsReplies, accountsEditsSummaries] = yield Promise.all([
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
            .accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(accountComment, accounts[accountId], accountComment.index)
            .catch((error) => log.error("accountsStore.initializeAccountsStore startUpdatingAccountCommentOnCommentUpdateEvents error", {
            accountComment,
            accountCommentIndex: accountComment.index,
            accounts,
            error,
        }));
    }
});
// @ts-ignore
const isInitializing = () => !!window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;
const waitForInitialized = () => __awaiter(void 0, void 0, void 0, function* () {
    while (isInitializing()) {
        // uncomment to debug accounts init
        // console.warn(`can't reset accounts store while initializing, waiting 100ms`)
        yield new Promise((r) => setTimeout(r, 100));
    }
});
(() => __awaiter(void 0, void 0, void 0, function* () {
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
        yield initializeAccountsStore();
    }
    catch (error) {
        // initializing can fail in tests when store is being reset at the same time as databases are being deleted
        log.error("accountsStore.initializeAccountsStore error", {
            accountsStore: accountsStore.getState(),
            error,
        });
    }
    finally {
        // @ts-ignore
        delete window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING;
    }
    log("accounts store initializing finished");
}))();
// reset store in between tests
const originalState = accountsStore.getState();
// async function because some stores have async init
export const resetAccountsStore = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // don't reset while initializing, it could happen during quick successive tests
    yield waitForInitialized();
    log("accounts store reset started");
    // remove all event listeners
    listeners.forEach((listener) => listener.removeAllListeners());
    (_b = (_a = accountsStore.getState().accountsActionsInternal).resetLazyAccountHistoryLoaders) === null || _b === void 0 ? void 0 : _b.call(_a);
    // destroy all component subscriptions to the store
    accountsStore.destroy();
    // restore original state
    accountsStore.setState(originalState);
    // init the store
    yield initializeAccountsStore();
    log("accounts store reset finished");
});
// reset database and store in between tests
export const resetAccountsDatabaseAndStore = () => __awaiter(void 0, void 0, void 0, function* () {
    // don't reset while initializing, it could happen during quick successive tests
    yield waitForInitialized();
    yield Promise.all([
        localForage.createInstance({ name: "bitsocialReactHooks-accountsMetadata" }).clear(),
        localForage.createInstance({ name: "bitsocialReactHooks-accounts" }).clear(),
    ]);
    yield resetAccountsStore();
});
export default accountsStore;
//# sourceMappingURL=accounts-store.js.map