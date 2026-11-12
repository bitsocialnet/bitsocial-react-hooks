import localForage from "localforage";
import localForageLru from "../lib/localforage-lru";
import accountsDatabase from "../stores/accounts/accounts-database";

const cacheDatabaseNames = [
  "bitsocialReactHooks-communities",
  "bitsocialReactHooks-comments",
  "bitsocialReactHooks-communitiesPages",
  "bitsocialReactHooks-repliesPages",
];

// clear an account's databases, getDatabaseName gives each database's full name
const deleteAccountDatabases = (getDatabaseName: (databaseName: string) => string) =>
  Promise.all([
    ...["accountComments", "accountVotes", "accountEdits"].map((databaseName) =>
      localForage.createInstance({ name: getDatabaseName(databaseName) }).clear(),
    ),
    localForageLru.clearInstance(getDatabaseName("accountCommentsReplies")),
  ]);

// the ids of the accounts listed in the metadata database or stored in the accounts database
const getAccountIds = async (
  accountsStorage: LocalForage,
  accountsMetadataStorage: LocalForage,
) => {
  const [listedAccountIds, storedAccountIds] = await Promise.all([
    accountsMetadataStorage.getItem("accountIds"),
    accountsStorage.keys(),
  ]);
  return [
    ...new Set<string>([
      ...(Array.isArray(listedAccountIds) ? listedAccountIds : []),
      ...storedAccountIds,
    ]),
  ];
};

const deleteCaches = async (): Promise<void> => {
  await Promise.all(cacheDatabaseNames.map((name) => localForageLru.clearInstance(name)));
};

const deleteDatabases = async (): Promise<void> => {
  // the unprefixed databases of older versions: accountsDatabase.migrate() copies them back on the
  // next load if they're left, because the prefixed accounts metadata is empty then
  const legacyAccountsDatabase = localForage.createInstance({ name: "accounts" });
  const legacyAccountsMetadataDatabase = localForage.createInstance({ name: "accountsMetadata" });
  // read the account ids before deleting the accounts, they name the accounts' databases
  const [accountIds, legacyAccountIds] = await Promise.all([
    getAccountIds(accountsDatabase.accountsDatabase, accountsDatabase.accountsMetadataDatabase),
    getAccountIds(legacyAccountsDatabase, legacyAccountsMetadataDatabase),
  ]);
  await Promise.all([
    accountsDatabase.accountsMetadataDatabase.clear(),
    accountsDatabase.accountsDatabase.clear(),
    legacyAccountsMetadataDatabase.clear(),
    legacyAccountsDatabase.clear(),
    ...accountIds.map((accountId) =>
      deleteAccountDatabases((databaseName) =>
        accountsDatabase.getPerAccountDatabaseName(databaseName, accountId),
      ),
    ),
    ...legacyAccountIds.map((accountId) =>
      deleteAccountDatabases((databaseName) => `${databaseName}-${accountId}`),
    ),
    deleteCaches(),
  ]);
};

const debugUtils = {
  deleteDatabases,
  deleteCaches,
};

export { deleteDatabases, deleteCaches };
export default debugUtils;
