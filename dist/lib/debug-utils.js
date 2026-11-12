var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import localForage from "localforage";
import localForageLru from "../lib/localforage-lru/index.js";
import accountsDatabase from "../stores/accounts/accounts-database.js";
const cacheDatabaseNames = [
    "bitsocialReactHooks-communities",
    "bitsocialReactHooks-comments",
    "bitsocialReactHooks-communitiesPages",
    "bitsocialReactHooks-repliesPages",
];
// clear an account's databases, getDatabaseName gives each database's full name
const deleteAccountDatabases = (getDatabaseName) => Promise.all([
    ...["accountComments", "accountVotes", "accountEdits"].map((databaseName) => localForage.createInstance({ name: getDatabaseName(databaseName) }).clear()),
    localForageLru.clearInstance(getDatabaseName("accountCommentsReplies")),
]);
// the ids of the accounts listed in the metadata database or stored in the accounts database
const getAccountIds = (accountsStorage, accountsMetadataStorage) => __awaiter(void 0, void 0, void 0, function* () {
    const [listedAccountIds, storedAccountIds] = yield Promise.all([
        accountsMetadataStorage.getItem("accountIds"),
        accountsStorage.keys(),
    ]);
    return [
        ...new Set([
            ...(Array.isArray(listedAccountIds) ? listedAccountIds : []),
            ...storedAccountIds,
        ]),
    ];
});
const deleteCaches = () => __awaiter(void 0, void 0, void 0, function* () {
    yield Promise.all(cacheDatabaseNames.map((name) => localForageLru.clearInstance(name)));
});
const deleteDatabases = () => __awaiter(void 0, void 0, void 0, function* () {
    // the unprefixed databases of older versions: accountsDatabase.migrate() copies them back on the
    // next load if they're left, because the prefixed accounts metadata is empty then
    const legacyAccountsDatabase = localForage.createInstance({ name: "accounts" });
    const legacyAccountsMetadataDatabase = localForage.createInstance({ name: "accountsMetadata" });
    // read the account ids before deleting the accounts, they name the accounts' databases
    const [accountIds, legacyAccountIds] = yield Promise.all([
        getAccountIds(accountsDatabase.accountsDatabase, accountsDatabase.accountsMetadataDatabase),
        getAccountIds(legacyAccountsDatabase, legacyAccountsMetadataDatabase),
    ]);
    yield Promise.all([
        accountsDatabase.accountsMetadataDatabase.clear(),
        accountsDatabase.accountsDatabase.clear(),
        legacyAccountsMetadataDatabase.clear(),
        legacyAccountsDatabase.clear(),
        ...accountIds.map((accountId) => deleteAccountDatabases((databaseName) => accountsDatabase.getPerAccountDatabaseName(databaseName, accountId))),
        ...legacyAccountIds.map((accountId) => deleteAccountDatabases((databaseName) => `${databaseName}-${accountId}`)),
        deleteCaches(),
    ]);
});
const debugUtils = {
    deleteDatabases,
    deleteCaches,
};
export { deleteDatabases, deleteCaches };
export default debugUtils;
//# sourceMappingURL=debug-utils.js.map