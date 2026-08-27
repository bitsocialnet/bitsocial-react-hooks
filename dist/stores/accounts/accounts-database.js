var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import PkcJs from "../../lib/pkc-js/index.js";
import validator from "../../lib/validator.js";
import chain from "../../lib/chain/index.js";
import assert from "assert";
import localForage from "localforage";
import isEqual from "lodash.isequal";
import localForageLru from "../../lib/localforage-lru/index.js";
import utils from "../../lib/utils/index.js";
import { getDefaultChainProviders, getDefaultPkcOptions, overwritePkcOptions, } from "./account-generator.js";
import { getAccountsEditsSummary, sanitizeStoredAccountComment } from "./utils.js";
import { getPkcClientOptions, normalizeAccountProtocolConfig, withProtocolAliases, } from "../../lib/pkc-compat.js";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
// Storage keeps the existing namespace so current installs reuse the same IndexedDB data.
const accountsDatabaseNamespace = "bitsocialReactHooks";
const getAccountsDatabaseName = (databaseName) => `${accountsDatabaseNamespace}-${databaseName}`;
const getPerAccountDatabaseName = (databaseName, accountId) => `${getAccountsDatabaseName(databaseName)}-${accountId}`;
const accountsDatabase = localForage.createInstance({ name: getAccountsDatabaseName("accounts") });
const accountsMetadataDatabase = localForage.createInstance({
    name: getAccountsDatabaseName("accountsMetadata"),
});
const storageVersionKey = "__storageVersion";
const votesLatestIndexKey = "__commentCidToLatestIndex";
const editsTargetToIndicesKey = "__targetToIndices";
const editsSummaryKey = "__summary";
const commentStorageVersion = 2;
const voteStorageVersion = 1;
const editStorageVersion = 1;
// TODO: remove this eventually after everyone has migrated
// migrate to name with safe prefix
const migrate = () => __awaiter(void 0, void 0, void 0, function* () {
    const previousAccountsDatabase = localForage.createInstance({ name: "accounts" });
    const previousAccountsMetadataDatabase = localForage.createInstance({ name: "accountsMetadata" });
    // no previous db to migrate
    if (!(yield previousAccountsMetadataDatabase.getItem("activeAccountId"))) {
        return;
    }
    // db already migrated
    if (yield accountsMetadataDatabase.getItem("activeAccountId")) {
        return;
    }
    // migrate
    const promises = [];
    for (const key of yield previousAccountsDatabase.keys()) {
        promises.push(previousAccountsDatabase.getItem(key).then((value) => accountsDatabase.setItem(key, value)));
    }
    for (const key of yield previousAccountsMetadataDatabase.keys()) {
        promises.push(previousAccountsMetadataDatabase
            .getItem(key)
            .then((value) => accountsMetadataDatabase.setItem(key, value)));
    }
    const accountIds = yield previousAccountsMetadataDatabase.getItem("accountIds");
    if (Array.isArray(accountIds)) {
        const databaseNames = [
            "accountComments",
            "accountVotes",
            "accountCommentsReplies",
            "accountEdits",
        ];
        for (const databaseName of databaseNames) {
            for (const accountId of accountIds) {
                const previousDatabase = localForage.createInstance({
                    name: `${databaseName}-${accountId}`,
                });
                const database = localForage.createInstance({
                    name: getPerAccountDatabaseName(databaseName, accountId),
                });
                for (const key of yield previousDatabase.keys()) {
                    promises.push(previousDatabase.getItem(key).then((value) => database.setItem(key, value)));
                }
            }
        }
    }
    yield Promise.all(promises);
});
const getAccountsFromStoredAccounts = (storedAccounts) => __awaiter(void 0, void 0, void 0, function* () {
    const accounts = {};
    for (const [accountId, storedAccount] of Object.entries(storedAccounts)) {
        const storedVersion = storedAccount.version || 1;
        const migratedAccount = yield migrateAccount(storedAccount);
        if (storedVersion !== migratedAccount.version) {
            yield accountsDatabase.setItem(accountId, migratedAccount);
        }
        accounts[accountId] = normalizeAccountProtocolConfig(migratedAccount, getDefaultChainProviders());
        // protocol options aren't saved to database if they are default
        if (!accounts[accountId].pkcOptions) {
            accounts[accountId].pkcOptions = getDefaultPkcOptions();
        }
        const protocolOptions = Object.assign(Object.assign({}, (accounts[accountId].pkcOptions || accounts[accountId].pkcOptions)), overwritePkcOptions);
        const pkc = yield PkcJs.PKC(getPkcClientOptions(accounts[accountId], protocolOptions));
        // handle errors or error events are uncaught
        // no need to log them because pkc-js already logs them
        pkc.on("error", (error) => log.error("uncaught pkc instance error, should never happen", { error }));
        accounts[accountId] = withProtocolAliases(accounts[accountId], pkc, protocolOptions);
    }
    return accounts;
});
const getAccounts = (accountIds) => __awaiter(void 0, void 0, void 0, function* () {
    validator.validateAccountsDatabaseGetAccountsArguments(accountIds);
    const accountsArray = yield Promise.all(accountIds.map((accountId) => accountsDatabase.getItem(accountId)));
    const storedAccounts = {};
    for (const [index, accountId] of accountIds.entries()) {
        assert(accountsArray[index], `accountId '${accountId}' not found in database`);
        storedAccounts[accountId] = accountsArray[index];
    }
    return getAccountsFromStoredAccounts(storedAccounts);
});
const accountVersion = 6;
const migrateAccount = (account) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    account = normalizeAccountProtocolConfig(account);
    let version = account.version || 1;
    // version 2
    if (version === 1) {
        version++;
        if ((_a = account.pkcOptions) === null || _a === void 0 ? void 0 : _a.ipfsHttpClientsOptions) {
            account.pkcOptions.kuboRpcClientsOptions = account.pkcOptions.ipfsHttpClientsOptions;
            delete account.pkcOptions.ipfsHttpClientsOptions;
        }
        if ((_b = account.pkcOptions) === null || _b === void 0 ? void 0 : _b.pubsubHttpClientsOptions) {
            account.pkcOptions.pubsubKuboRpcClientsOptions = account.pkcOptions.pubsubHttpClientsOptions;
            delete account.pkcOptions.pubsubHttpClientsOptions;
        }
    }
    // version 3
    if (version === 2) {
        version++;
        if (!account.author.wallets) {
            account.author.wallets = {};
        }
        if (!account.author.wallets.eth) {
            account.author.wallets.eth = yield chain.getEthWalletFromPkcPrivateKey(account.signer.privateKey, account.address);
        }
    }
    if (version === 3) {
        version++;
        // in version 3, wallets had timestamps in ms, should be seconds
        if (((_e = (_d = (_c = account.author) === null || _c === void 0 ? void 0 : _c.wallets) === null || _d === void 0 ? void 0 : _d.eth) === null || _e === void 0 ? void 0 : _e.timestamp) > 1e12) {
            account.author.wallets.eth = yield chain.getEthWalletFromPkcPrivateKey(account.signer.privateKey, account.address);
        }
    }
    if (version === 4) {
        version++;
        account = normalizeAccountProtocolConfig(account);
    }
    if (version === 5) {
        version++;
        if (!Array.isArray(account.savedComments)) {
            account.savedComments = [];
        }
    }
    account.version = accountVersion;
    return account;
});
const getAccount = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accounts = yield getAccounts([accountId]);
    return accounts[accountId];
});
const getExportedAccountJson = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    assert(accountId && typeof accountId === "string", `getAccountJson argument accountId '${accountId}' invalid`);
    // do not serialize or instantiate anything (unlike getAccount)
    const account = yield accountsDatabase.getItem(accountId);
    if (!account) {
        throw Error(`getAccountJson no account in database with accountId '${accountId}'`);
    }
    const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
    const accountVotesDatabase = getAccountVotesDatabase(accountId);
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    yield ensureAccountCommentsDatabaseLayout(accountId);
    const [accountComments, accountVotes, accountEdits] = yield Promise.all([
        getDatabaseAsArray(accountCommentsDatabase),
        getDatabaseAsArray(accountVotesDatabase),
        getDatabaseAsArray(accountEditsDatabase),
    ]);
    return JSON.stringify({ account, accountComments, accountVotes, accountEdits });
});
// accountVotes, accountComments and accountEdits are indexeddb
// databases formed like an array (keys are numbers)
const getDatabaseAsArray = (database) => __awaiter(void 0, void 0, void 0, function* () {
    const length = (yield database.getItem("length")) || 0;
    let promises = [];
    let i = 0;
    while (i < length) {
        promises.push(database.getItem(String(i++)));
    }
    const items = yield Promise.all(promises);
    return items;
});
const replaceDatabaseArray = (database, items, metadata) => __awaiter(void 0, void 0, void 0, function* () {
    yield database.clear();
    yield Promise.all([
        ...items.map((item, index) => database.setItem(String(index), item)),
        database.setItem("length", items.length),
        ...Object.entries(metadata).map(([key, value]) => database.setItem(key, value)),
    ]);
});
const getDatabaseSnapshot = (database) => __awaiter(void 0, void 0, void 0, function* () {
    const keys = yield database.keys();
    return Promise.all(keys.map((key) => __awaiter(void 0, void 0, void 0, function* () { return [key, yield database.getItem(key)]; })));
});
const restoreDatabaseSnapshot = (database, snapshot) => __awaiter(void 0, void 0, void 0, function* () {
    yield database.clear();
    yield Promise.all(snapshot.map(([key, value]) => database.setItem(key, value)));
});
export const replaceDatabaseArraysWithRollback = (replacements) => __awaiter(void 0, void 0, void 0, function* () {
    const snapshots = yield Promise.all(replacements.map(({ database }) => getDatabaseSnapshot(database)));
    const replacementResults = yield Promise.allSettled(replacements.map(({ database, items, metadata }) => replaceDatabaseArray(database, items, metadata)));
    const replacementFailure = replacementResults.find((result) => result.status === "rejected");
    if (!replacementFailure) {
        return;
    }
    const rollbackResults = yield Promise.allSettled(replacements.map(({ database }, index) => restoreDatabaseSnapshot(database, snapshots[index])));
    const rollbackFailure = rollbackResults.find((result) => result.status === "rejected");
    if (rollbackFailure) {
        const rollbackError = new Error(`importAccountHistory failed and could not restore previous history`);
        rollbackError.cause = replacementFailure.reason;
        rollbackError.rollbackError = rollbackFailure.reason;
        throw rollbackError;
    }
    throw replacementFailure.reason;
});
const removeFunctionsAndSensitiveFields = (publication) => {
    const sanitizedPublication = {};
    for (const key in publication) {
        if (key === "signer" || key === "author" || typeof publication[key] === "function") {
            continue;
        }
        sanitizedPublication[key] = publication[key];
    }
    return sanitizedPublication;
};
const isNumericDatabaseKey = (key) => /^[0-9]+$/.test(key);
const rebuildVotesLatestIndex = (votes) => {
    const latestIndexByCommentCid = {};
    for (const [index, vote] of votes.entries()) {
        if (vote === null || vote === void 0 ? void 0 : vote.commentCid) {
            latestIndexByCommentCid[vote.commentCid] = index;
        }
    }
    return latestIndexByCommentCid;
};
const rebuildEditsTargetIndexes = (edits) => {
    const targetToIndices = {};
    for (const [index, edit] of edits.entries()) {
        const editTarget = getAccountEditTarget(edit);
        if (!editTarget) {
            continue;
        }
        if (!targetToIndices[editTarget]) {
            targetToIndices[editTarget] = [];
        }
        targetToIndices[editTarget].push(index);
    }
    return targetToIndices;
};
const addAccount = (account, options) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    validator.validateAccountsDatabaseAddAccountArguments(account);
    let [accountIds, accountNamesToAccountIds] = yield Promise.all([
        accountsMetadataDatabase.getItem("accountIds"),
        accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);
    if (!accountNamesToAccountIds) {
        accountNamesToAccountIds = {};
    }
    // handle no duplicate names
    const existingAccountId = accountNamesToAccountIds[account.name];
    if (existingAccountId && existingAccountId !== account.id) {
        const existingAccount = yield accountsDatabase.getItem(existingAccountId);
        if ((existingAccount === null || existingAccount === void 0 ? void 0 : existingAccount.name) === account.name) {
            throw Error(`account name '${account.name}' already exists in database`);
        }
        delete accountNamesToAccountIds[account.name];
    }
    if (accountIds === null || accountIds === void 0 ? void 0 : accountIds.length) {
        const storedAccounts = yield Promise.all(accountIds
            .filter((accountId) => accountId !== account.id)
            .map((accountId) => accountsDatabase.getItem(accountId)));
        if (storedAccounts.some((storedAccount) => (storedAccount === null || storedAccount === void 0 ? void 0 : storedAccount.name) === account.name)) {
            throw Error(`account name '${account.name}' already exists in database`);
        }
    }
    // handle updating accounts database
    const accountToPutInDatabase = normalizeAccountProtocolConfig(Object.assign(Object.assign({}, account), { pkc: undefined }));
    const protocolOptions = accountToPutInDatabase.pkcOptions;
    accountToPutInDatabase.pkcOptions = protocolOptions;
    // don't save default protocol options in database in case they change
    if (JSON.stringify(protocolOptions) === JSON.stringify(getDefaultPkcOptions())) {
        delete accountToPutInDatabase.pkcOptions;
    }
    if (JSON.stringify(accountToPutInDatabase.chainProviders) ===
        JSON.stringify(getDefaultChainProviders())) {
        delete accountToPutInDatabase.chainProviders;
    }
    // make sure accountToPutInDatabase protocol options are valid
    let hydratedAccount;
    if (options === null || options === void 0 ? void 0 : options.returnHydratedAccount) {
        hydratedAccount = (yield getAccountsFromStoredAccounts({
            [accountToPutInDatabase.id]: accountToPutInDatabase,
        }))[accountToPutInDatabase.id];
    }
    else if (protocolOptions) {
        const pkc = yield PkcJs.PKC(getPkcClientOptions(accountToPutInDatabase, protocolOptions));
        pkc.on("error", () => { });
        void ((_a = pkc.destroy) === null || _a === void 0 ? void 0 : _a.call(pkc)); // gc; errors intentionally unhandled to avoid uncounted callback
    }
    yield accountsDatabase.setItem(accountToPutInDatabase.id, accountToPutInDatabase);
    // handle updating accountNamesToAccountIds database
    for (const [accountName, accountId] of Object.entries(accountNamesToAccountIds)) {
        if (accountId === account.id && accountName !== account.name) {
            delete accountNamesToAccountIds[accountName];
        }
    }
    accountNamesToAccountIds[account.name] = account.id;
    yield accountsMetadataDatabase.setItem("accountNamesToAccountIds", accountNamesToAccountIds);
    // handle updating accountIds database
    if (!accountIds) {
        accountIds = [account.id];
    }
    if (!accountIds.includes(account.id)) {
        accountIds.push(account.id);
    }
    yield accountsMetadataDatabase.setItem("accountIds", accountIds);
    // handle updating activeAccountId database
    if (accountIds.length === 1) {
        yield accountsMetadataDatabase.setItem("activeAccountId", account.id);
    }
    return hydratedAccount;
});
const removeAccount = (account) => __awaiter(void 0, void 0, void 0, function* () {
    assert((account === null || account === void 0 ? void 0 : account.id) && typeof (account === null || account === void 0 ? void 0 : account.id) === "string", `accountsDatabase.removeAccount invalid account.id '${account.id}'`);
    // handle updating accounts database
    yield accountsDatabase.removeItem(account.id);
    // handle updating accountNamesToAccountIds database
    let accountNamesToAccountIds = yield accountsMetadataDatabase.getItem("accountNamesToAccountIds");
    if (!accountNamesToAccountIds) {
        accountNamesToAccountIds = {};
    }
    delete accountNamesToAccountIds[account.name];
    yield accountsMetadataDatabase.setItem("accountNamesToAccountIds", accountNamesToAccountIds);
    // handle updating accountIds database
    let accountIds = yield accountsMetadataDatabase.getItem("accountIds");
    accountIds = (accountIds || []).filter((accountId) => accountId !== account.id);
    yield accountsMetadataDatabase.setItem("accountIds", accountIds);
    // handle updating activeAccountId database
    const activeAccountId = yield accountsMetadataDatabase.getItem("activeAccountId");
    if (activeAccountId === account.id) {
        if (accountIds.length) {
            yield accountsMetadataDatabase.setItem("activeAccountId", accountIds[0]);
        }
        else {
            yield accountsMetadataDatabase.removeItem("activeAccountId");
        }
    }
    const accountCommentsDatabase = getAccountCommentsDatabase(account.id);
    yield accountCommentsDatabase.clear();
    const accountVotesDatabase = getAccountVotesDatabase(account.id);
    yield accountVotesDatabase.clear();
    const accountCommentsRepliesDatabase = getAccountCommentsRepliesDatabase(account.id);
    yield accountCommentsRepliesDatabase.clear();
    const accountEditsDatabase = getAccountEditsDatabase(account.id);
    yield accountEditsDatabase.clear();
});
const accountsCommentsDatabases = {};
const accountCommentsLayoutMigrations = {};
const getAccountCommentsDatabase = (accountId) => {
    assert(accountId && typeof accountId === "string", `getAccountCommentsDatabase '${accountId}' not a string`);
    if (!accountsCommentsDatabases[accountId]) {
        accountsCommentsDatabases[accountId] = localForage.createInstance({
            name: getPerAccountDatabaseName("accountComments", accountId),
        });
    }
    return accountsCommentsDatabases[accountId];
};
const ensureAccountCommentsDatabaseLayout = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
    if ((yield accountCommentsDatabase.getItem(storageVersionKey)) === commentStorageVersion) {
        return;
    }
    if (!accountCommentsLayoutMigrations[accountId]) {
        accountCommentsLayoutMigrations[accountId] = (() => __awaiter(void 0, void 0, void 0, function* () {
            if ((yield accountCommentsDatabase.getItem(storageVersionKey)) === commentStorageVersion) {
                return;
            }
            const comments = yield getDatabaseAsArray(accountCommentsDatabase);
            const updatedComments = comments
                .map((comment) => (comment ? sanitizeStoredAccountComment(comment) : undefined))
                .filter((comment) => comment !== undefined);
            const rewritePromises = [];
            for (const [index, updatedComment] of updatedComments.entries()) {
                if (!isEqual(updatedComment, comments[index])) {
                    rewritePromises.push(accountCommentsDatabase.setItem(String(index), updatedComment));
                }
            }
            for (let index = updatedComments.length; index < comments.length; index++) {
                rewritePromises.push(accountCommentsDatabase.removeItem(String(index)));
            }
            rewritePromises.push(accountCommentsDatabase.setItem("length", updatedComments.length));
            yield Promise.all(rewritePromises);
            yield accountCommentsDatabase.setItem(storageVersionKey, commentStorageVersion);
        }))().finally(() => {
            delete accountCommentsLayoutMigrations[accountId];
        });
    }
    yield accountCommentsLayoutMigrations[accountId];
});
const deleteAccountComment = (accountId, accountCommentIndex) => __awaiter(void 0, void 0, void 0, function* () {
    const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
    yield ensureAccountCommentsDatabaseLayout(accountId);
    const length = (yield accountCommentsDatabase.getItem("length")) || 0;
    assert(accountCommentIndex >= 0 && accountCommentIndex < length, `deleteAccountComment accountCommentIndex '${accountCommentIndex}' out of range [0, ${length})`);
    const items = yield getDatabaseAsArray(accountCommentsDatabase);
    items.splice(accountCommentIndex, 1);
    const newLength = length - 1;
    const promises = [];
    for (let i = 0; i < newLength; i++) {
        promises.push(accountCommentsDatabase.setItem(String(i), items[i]));
    }
    promises.push(accountCommentsDatabase.removeItem(String(length - 1)));
    promises.push(accountCommentsDatabase.setItem("length", newLength));
    yield Promise.all(promises);
});
const addAccountComment = (accountId, comment, accountCommentIndex) => __awaiter(void 0, void 0, void 0, function* () {
    const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
    yield ensureAccountCommentsDatabaseLayout(accountId);
    const length = (yield accountCommentsDatabase.getItem("length")) || 0;
    comment = sanitizeStoredAccountComment(comment);
    if (typeof accountCommentIndex === "number") {
        assert(accountCommentIndex < length, `addAccountComment cannot edit comment no comment in database at accountCommentIndex '${accountCommentIndex}'`);
        yield Promise.all([
            accountCommentsDatabase.setItem(String(accountCommentIndex), comment),
            accountCommentsDatabase.setItem(storageVersionKey, commentStorageVersion),
        ]);
    }
    else {
        yield Promise.all([
            accountCommentsDatabase.setItem(String(length), comment),
            accountCommentsDatabase.setItem(storageVersionKey, commentStorageVersion),
            accountCommentsDatabase.setItem("length", length + 1),
        ]);
    }
});
const getAccountComments = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
    yield ensureAccountCommentsDatabaseLayout(accountId);
    const length = (yield accountCommentsDatabase.getItem("length")) || 0;
    if (length === 0) {
        return [];
    }
    let promises = [];
    let i = 0;
    while (i < length) {
        promises.push(accountCommentsDatabase.getItem(String(i++)));
    }
    const comments = yield Promise.all(promises);
    // add index and account id to account comments for easier updating
    for (const i in comments) {
        comments[i] = sanitizeStoredAccountComment(comments[i]);
        comments[i].index = Number(i);
        comments[i].accountId = accountId;
    }
    return comments;
});
const getAccountsComments = (accountIds) => __awaiter(void 0, void 0, void 0, function* () {
    assert(Array.isArray(accountIds), `getAccountsComments invalid accountIds '${accountIds}' not an array`);
    const promises = [];
    for (const accountId of accountIds) {
        promises.push(getAccountComments(accountId));
    }
    const accountsCommentsArray = yield Promise.all(promises);
    const accountsComments = {};
    for (const [i, accountId] of accountIds.entries()) {
        accountsComments[accountId] = accountsCommentsArray[i];
    }
    return accountsComments;
});
const accountsVotesDatabases = {};
const getAccountVotesDatabase = (accountId) => {
    assert(accountId && typeof accountId === "string", `getAccountVotesDatabase '${accountId}' not a string`);
    if (!accountsVotesDatabases[accountId]) {
        accountsVotesDatabases[accountId] = localForage.createInstance({
            name: getPerAccountDatabaseName("accountVotes", accountId),
        });
    }
    return accountsVotesDatabases[accountId];
};
const ensureAccountVotesDatabaseLayout = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountVotesDatabase = getAccountVotesDatabase(accountId);
    if ((yield accountVotesDatabase.getItem(storageVersionKey)) === voteStorageVersion) {
        return;
    }
    const votes = yield getDatabaseAsArray(accountVotesDatabase);
    const latestIndexByCommentCid = rebuildVotesLatestIndex(votes);
    const keys = yield accountVotesDatabase.keys();
    const duplicateKeysToDelete = keys.filter((key) => !isNumericDatabaseKey(key) &&
        key !== "length" &&
        key !== storageVersionKey &&
        key !== votesLatestIndexKey &&
        latestIndexByCommentCid[key] !== undefined);
    yield Promise.all([
        ...duplicateKeysToDelete.map((key) => accountVotesDatabase.removeItem(key)),
        accountVotesDatabase.setItem(votesLatestIndexKey, latestIndexByCommentCid),
        accountVotesDatabase.setItem(storageVersionKey, voteStorageVersion),
    ]);
});
const addAccountVote = (accountId, createVoteOptions) => __awaiter(void 0, void 0, void 0, function* () {
    assert((createVoteOptions === null || createVoteOptions === void 0 ? void 0 : createVoteOptions.commentCid) && typeof (createVoteOptions === null || createVoteOptions === void 0 ? void 0 : createVoteOptions.commentCid) === "string", `addAccountVote createVoteOptions.commentCid '${createVoteOptions === null || createVoteOptions === void 0 ? void 0 : createVoteOptions.commentCid}' not a string`);
    const accountVotesDatabase = getAccountVotesDatabase(accountId);
    yield ensureAccountVotesDatabaseLayout(accountId);
    const length = (yield accountVotesDatabase.getItem("length")) || 0;
    const vote = removeFunctionsAndSensitiveFields(createVoteOptions);
    const existingLatestIndexByCommentCid = yield accountVotesDatabase.getItem(votesLatestIndexKey);
    const latestIndexByCommentCid = Object.assign(Object.assign({}, existingLatestIndexByCommentCid), { [vote.commentCid]: length });
    yield Promise.all([
        accountVotesDatabase.setItem(String(length), vote),
        accountVotesDatabase.setItem(votesLatestIndexKey, latestIndexByCommentCid),
        accountVotesDatabase.setItem(storageVersionKey, voteStorageVersion),
        accountVotesDatabase.setItem("length", length + 1),
    ]);
});
const getAccountVotes = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountVotesDatabase = getAccountVotesDatabase(accountId);
    yield ensureAccountVotesDatabaseLayout(accountId);
    const latestIndexByCommentCid = (yield accountVotesDatabase.getItem(votesLatestIndexKey)) || {};
    const votes = {};
    const latestIndexes = Object.values(latestIndexByCommentCid);
    if (latestIndexes.length === 0) {
        return votes;
    }
    const promises = latestIndexes.map((index) => accountVotesDatabase.getItem(String(index)));
    const votesArray = yield Promise.all(promises);
    for (const vote of votesArray) {
        votes[vote === null || vote === void 0 ? void 0 : vote.commentCid] = vote;
    }
    return votes;
});
const getAccountsVotes = (accountIds) => __awaiter(void 0, void 0, void 0, function* () {
    assert(Array.isArray(accountIds), `getAccountsVotes invalid accountIds '${accountIds}' not an array`);
    const promises = [];
    for (const accountId of accountIds) {
        promises.push(getAccountVotes(accountId));
    }
    const accountsVotesArray = yield Promise.all(promises);
    const accountsVotes = {};
    for (const [i, accountId] of accountIds.entries()) {
        accountsVotes[accountId] = accountsVotesArray[i];
    }
    return accountsVotes;
});
const accountsCommentsRepliesDatabases = {};
const getAccountCommentsRepliesDatabase = (accountId) => {
    assert(accountId && typeof accountId === "string", `getAccountCommentsRepliesDatabase '${accountId}' not a string`);
    if (!accountsCommentsRepliesDatabases[accountId]) {
        accountsCommentsRepliesDatabases[accountId] = localForageLru.createInstance({
            name: getPerAccountDatabaseName("accountCommentsReplies", accountId),
            size: 1000,
        });
    }
    return accountsCommentsRepliesDatabases[accountId];
};
const addAccountCommentReply = (accountId, reply) => __awaiter(void 0, void 0, void 0, function* () {
    const accountCommentsRepliesDatabase = getAccountCommentsRepliesDatabase(accountId);
    yield accountCommentsRepliesDatabase.setItem(reply.cid, utils.clone(reply));
});
const getAccountCommentsReplies = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountCommentsRepliesDatabase = getAccountCommentsRepliesDatabase(accountId);
    const accountCommentsRepliesEntries = yield accountCommentsRepliesDatabase.entries();
    const replies = {};
    for (const [, reply] of accountCommentsRepliesEntries) {
        // @ts-ignore
        replies[reply.cid] = reply;
    }
    return replies;
});
const getAccountsCommentsReplies = (accountIds) => __awaiter(void 0, void 0, void 0, function* () {
    assert(Array.isArray(accountIds), `getAccountsCommentsReplies invalid accountIds '${accountIds}' not an array`);
    const promises = [];
    for (const accountId of accountIds) {
        promises.push(getAccountCommentsReplies(accountId));
    }
    const accountsCommentsRepliesArray = yield Promise.all(promises);
    const accountsCommentsReplies = {};
    for (const [i, accountId] of accountIds.entries()) {
        accountsCommentsReplies[accountId] = accountsCommentsRepliesArray[i];
    }
    return accountsCommentsReplies;
});
const accountsEditsDatabases = {};
const getAccountEditsDatabase = (accountId) => {
    assert(accountId && typeof accountId === "string", `getAccountEditsDatabase '${accountId}' not a string`);
    if (!accountsEditsDatabases[accountId]) {
        accountsEditsDatabases[accountId] = localForage.createInstance({
            name: getPerAccountDatabaseName("accountEdits", accountId),
        });
    }
    return accountsEditsDatabases[accountId];
};
const getAccountEditTarget = (edit) => (edit === null || edit === void 0 ? void 0 : edit.commentCid) || (edit === null || edit === void 0 ? void 0 : edit.communityAddress) || (edit === null || edit === void 0 ? void 0 : edit.communityAddress);
const persistAccountEditsIndexes = (accountId, edits) => __awaiter(void 0, void 0, void 0, function* () {
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    const targetToIndices = rebuildEditsTargetIndexes(edits);
    const summary = getAccountsEditsSummary(Object.fromEntries(Object.entries(targetToIndices).map(([target, indices]) => [
        target,
        indices.map((index) => edits[index]).filter(Boolean),
    ])));
    yield Promise.all([
        accountEditsDatabase.setItem(editsTargetToIndicesKey, targetToIndices),
        accountEditsDatabase.setItem(editsSummaryKey, summary),
        accountEditsDatabase.setItem(storageVersionKey, editStorageVersion),
    ]);
    return { targetToIndices, summary };
});
const ensureAccountEditsDatabaseLayout = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    if ((yield accountEditsDatabase.getItem(storageVersionKey)) === editStorageVersion) {
        return;
    }
    const edits = yield getDatabaseAsArray(accountEditsDatabase);
    const keys = yield accountEditsDatabase.keys();
    const duplicateKeysToDelete = keys.filter((key) => !isNumericDatabaseKey(key) &&
        key !== "length" &&
        key !== storageVersionKey &&
        key !== editsTargetToIndicesKey &&
        key !== editsSummaryKey &&
        edits.some((edit) => getAccountEditTarget(edit) === key));
    yield Promise.all(duplicateKeysToDelete.map((key) => accountEditsDatabase.removeItem(key)));
    yield persistAccountEditsIndexes(accountId, edits);
});
const addAccountEdit = (accountId, createEditOptions) => __awaiter(void 0, void 0, void 0, function* () {
    const editTarget = getAccountEditTarget(createEditOptions);
    assert(typeof editTarget === "string", `addAccountEdit target '${editTarget}' not a string`);
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    yield ensureAccountEditsDatabaseLayout(accountId);
    const length = (yield accountEditsDatabase.getItem("length")) || 0;
    const edit = removeFunctionsAndSensitiveFields(createEditOptions);
    const existingEdits = yield getDatabaseAsArray(accountEditsDatabase);
    existingEdits[length] = edit;
    yield Promise.all([
        accountEditsDatabase.setItem(String(length), edit),
        accountEditsDatabase.setItem(storageVersionKey, editStorageVersion),
        accountEditsDatabase.setItem("length", length + 1),
    ]);
    yield persistAccountEditsIndexes(accountId, existingEdits);
});
const doesStoredAccountEditMatch = (storedAccountEdit, targetStoredAccountEdit) => (storedAccountEdit === null || storedAccountEdit === void 0 ? void 0 : storedAccountEdit.clientId) && (targetStoredAccountEdit === null || targetStoredAccountEdit === void 0 ? void 0 : targetStoredAccountEdit.clientId)
    ? storedAccountEdit.clientId === targetStoredAccountEdit.clientId
    : isEqual(storedAccountEdit, targetStoredAccountEdit);
const deleteAccountEdit = (accountId, editToDelete) => __awaiter(void 0, void 0, void 0, function* () {
    const editTarget = getAccountEditTarget(editToDelete);
    assert(typeof editTarget === "string", `deleteAccountEdit target '${editTarget}' not a string`);
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    yield ensureAccountEditsDatabaseLayout(accountId);
    const length = (yield accountEditsDatabase.getItem("length")) || 0;
    const items = yield getDatabaseAsArray(accountEditsDatabase);
    let deletedEdit = false;
    const nextItems = items.filter((item) => {
        if (!deletedEdit && doesStoredAccountEditMatch(item, editToDelete)) {
            deletedEdit = true;
            return false;
        }
        return true;
    });
    const newLength = nextItems.length;
    const promises = [];
    for (let i = 0; i < newLength; i++) {
        promises.push(accountEditsDatabase.setItem(String(i), nextItems[i]));
    }
    if (length > newLength) {
        promises.push(accountEditsDatabase.removeItem(String(length - 1)));
        promises.push(accountEditsDatabase.setItem("length", newLength));
    }
    yield Promise.all(promises);
    yield persistAccountEditsIndexes(accountId, nextItems);
    return deletedEdit;
});
const getAccountEdits = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    yield ensureAccountEditsDatabaseLayout(accountId);
    const targetToIndices = (yield accountEditsDatabase.getItem(editsTargetToIndicesKey)) || {};
    const edits = {};
    const targets = Object.keys(targetToIndices);
    if (targets.length === 0) {
        return edits;
    }
    for (const target of targets) {
        const targetIndices = targetToIndices[target];
        const targetEdits = yield Promise.all(targetIndices.map((index) => accountEditsDatabase.getItem(String(index))));
        edits[target] = targetEdits.filter(Boolean);
    }
    return edits;
});
const getAccountEditsSummary = (accountId) => __awaiter(void 0, void 0, void 0, function* () {
    const accountEditsDatabase = getAccountEditsDatabase(accountId);
    yield ensureAccountEditsDatabaseLayout(accountId);
    return (yield accountEditsDatabase.getItem(editsSummaryKey)) || {};
});
const getAccountsEdits = (accountIds) => __awaiter(void 0, void 0, void 0, function* () {
    assert(Array.isArray(accountIds), `getAccountsEdits invalid accountIds '${accountIds}' not an array`);
    const promises = [];
    for (const accountId of accountIds) {
        promises.push(getAccountEdits(accountId));
    }
    const accountsEditsArray = yield Promise.all(promises);
    const accountsEdits = {};
    for (const [i, accountId] of accountIds.entries()) {
        accountsEdits[accountId] = accountsEditsArray[i];
    }
    return accountsEdits;
});
const getAccountsEditsSummaries = (accountIds) => __awaiter(void 0, void 0, void 0, function* () {
    assert(Array.isArray(accountIds), `getAccountsEditsSummaries invalid accountIds '${accountIds}' not an array`);
    const accountsEditsSummaries = yield Promise.all(accountIds.map((accountId) => getAccountEditsSummary(accountId)));
    return Object.fromEntries(accountIds.map((accountId, index) => [accountId, accountsEditsSummaries[index]]));
});
/**
 * Replaces all comments, votes, and edits for an account. If any store replacement fails,
 * every history store is restored to its exact pre-call state before the error is rethrown.
 */
const importAccountHistory = (accountId_1, _a) => __awaiter(void 0, [accountId_1, _a], void 0, function* (accountId, { accountComments = [], accountVotes = [], accountEdits = [], }) {
    const storedComments = accountComments.map((comment) => sanitizeStoredAccountComment(comment));
    const storedVotes = accountVotes.map((vote) => {
        assert((vote === null || vote === void 0 ? void 0 : vote.commentCid) && typeof vote.commentCid === "string", `addAccountVote createVoteOptions.commentCid '${vote === null || vote === void 0 ? void 0 : vote.commentCid}' not a string`);
        return removeFunctionsAndSensitiveFields(vote);
    });
    const storedEdits = accountEdits.map((edit) => {
        const editTarget = getAccountEditTarget(edit);
        assert(typeof editTarget === "string", `addAccountEdit target '${editTarget}' not a string`);
        return removeFunctionsAndSensitiveFields(edit);
    });
    const latestVoteIndexByCommentCid = rebuildVotesLatestIndex(storedVotes);
    const editTargetToIndices = rebuildEditsTargetIndexes(storedEdits);
    const accountEditsSummary = getAccountsEditsSummary(Object.fromEntries(Object.entries(editTargetToIndices).map(([target, indices]) => [
        target,
        indices.map((index) => storedEdits[index]).filter(Boolean),
    ])));
    const historyDatabases = [
        getAccountCommentsDatabase(accountId),
        getAccountVotesDatabase(accountId),
        getAccountEditsDatabase(accountId),
    ];
    yield replaceDatabaseArraysWithRollback([
        {
            database: historyDatabases[0],
            items: storedComments,
            metadata: { [storageVersionKey]: commentStorageVersion },
        },
        {
            database: historyDatabases[1],
            items: storedVotes,
            metadata: {
                [votesLatestIndexKey]: latestVoteIndexByCommentCid,
                [storageVersionKey]: voteStorageVersion,
            },
        },
        {
            database: historyDatabases[2],
            items: storedEdits,
            metadata: {
                [editsTargetToIndicesKey]: editTargetToIndices,
                [editsSummaryKey]: accountEditsSummary,
                [storageVersionKey]: editStorageVersion,
            },
        },
    ]);
    const accountCommentsWithIndexes = storedComments.map((comment, index) => (Object.assign(Object.assign({}, comment), { index,
        accountId })));
    const accountVotesByCommentCid = Object.fromEntries(Object.entries(latestVoteIndexByCommentCid).map(([commentCid, index]) => [
        commentCid,
        storedVotes[index],
    ]));
    return {
        accountComments: accountCommentsWithIndexes,
        accountVotes: accountVotesByCommentCid,
        accountEditsSummary,
    };
});
const database = {
    accountsDatabase,
    accountsMetadataDatabase,
    getAccountsVotes,
    getAccountVotes,
    addAccountVote,
    getAccountsComments,
    getAccountComments,
    addAccountComment,
    deleteAccountComment,
    addAccount,
    removeAccount,
    getExportedAccountJson,
    getAccounts,
    getAccount,
    addAccountCommentReply,
    getAccountCommentsReplies,
    getAccountsCommentsReplies,
    getAccountsEdits,
    getAccountEdits,
    getAccountsEditsSummaries,
    getAccountEditsSummary,
    addAccountEdit,
    deleteAccountEdit,
    importAccountHistory,
    accountVersion,
    migrate,
    getAccountsDatabaseName,
    getPerAccountDatabaseName,
};
export default database;
//# sourceMappingURL=accounts-database.js.map