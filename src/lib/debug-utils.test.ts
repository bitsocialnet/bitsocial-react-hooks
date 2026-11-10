import localForage from "localforage";
import testUtils from "./test-utils";
import { deleteCaches, deleteDatabases } from "./debug-utils";
import accountsStore from "../stores/accounts";
import accountsDatabase from "../stores/accounts/accounts-database";
import { setPkcJs } from "./pkc-js";
import PkcJsMock from "./pkc-js/pkc-js-mock";

// a localForageLru cache is stored as 2 localForage databases, name and name + "2"
const cacheDatabaseNames = ["communities", "comments", "communitiesPages", "repliesPages"].flatMap(
  (name) => [`bitsocialReactHooks-${name}`, `bitsocialReactHooks-${name}2`],
);
const getAccountDatabaseNames = (accountId: string) =>
  ["accountComments", "accountVotes", "accountEdits", "accountCommentsReplies"]
    .map((name) => accountsDatabase.getPerAccountDatabaseName(name, accountId))
    .flatMap((name) => (name.includes("accountCommentsReplies") ? [name, name + "2"] : [name]));
const accountsDatabaseNames = [
  "bitsocialReactHooks-accounts",
  "bitsocialReactHooks-accountsMetadata",
];

const fillDatabases = (names: string[]) =>
  Promise.all(names.map((name) => localForage.createInstance({ name }).setItem("key", "value")));
const getDatabaseLengths = async (names: string[]) => {
  const lengths: { [name: string]: number } = {};
  for (const name of names) {
    lengths[name] = await localForage.createInstance({ name }).length();
  }
  return lengths;
};
const getEmptyDatabaseLengths = (names: string[]) =>
  Object.fromEntries(names.map((name) => [name, 0]));

describe("debug utils", () => {
  let accountId: string;
  beforeEach(async () => {
    setPkcJs(PkcJsMock);
    await testUtils.resetDatabasesAndStores();
    accountId = accountsStore.getState().activeAccountId!;
    expect(accountId).toBeTruthy();
  });
  afterAll(async () => {
    await testUtils.resetDatabasesAndStores();
  });

  test("deleteCaches deletes every cache and keeps the accounts data", async () => {
    await fillDatabases([...cacheDatabaseNames, ...getAccountDatabaseNames(accountId)]);

    await deleteCaches();

    expect(await getDatabaseLengths(cacheDatabaseNames)).toEqual(
      getEmptyDatabaseLengths(cacheDatabaseNames),
    );
    for (const length of Object.values(
      await getDatabaseLengths(getAccountDatabaseNames(accountId)),
    )) {
      expect(length).toBeGreaterThan(0);
    }
    expect(await accountsDatabase.accountsDatabase.getItem(accountId)).toBeTruthy();
  });

  test("deleteDatabases deletes the caches, the accounts and every account's databases", async () => {
    await fillDatabases([...cacheDatabaseNames, ...getAccountDatabaseNames(accountId)]);

    await deleteDatabases();

    const databaseNames = [
      ...cacheDatabaseNames,
      ...accountsDatabaseNames,
      ...getAccountDatabaseNames(accountId),
    ];
    expect(await getDatabaseLengths(databaseNames)).toEqual(getEmptyDatabaseLengths(databaseNames));
  });

  test("deleteDatabases deletes the unprefixed databases of older versions, so a reload doesn't migrate them back", async () => {
    // databases from before the bitsocialReactHooks- prefix, which accountsDatabase.migrate() copies
    // on load while the prefixed accounts metadata has no activeAccountId
    const legacyAccountId = "legacy account id";
    const legacyAccountDatabaseNames = [
      ...["accountComments", "accountVotes", "accountEdits", "accountCommentsReplies"].map(
        (name) => `${name}-${legacyAccountId}`,
      ),
      `accountCommentsReplies-${legacyAccountId}2`,
    ];
    const legacyAccountsMetadataDatabase = localForage.createInstance({ name: "accountsMetadata" });
    await Promise.all([
      localForage
        .createInstance({ name: "accounts" })
        .setItem(legacyAccountId, { id: legacyAccountId, name: "Legacy Account" }),
      legacyAccountsMetadataDatabase.setItem("activeAccountId", legacyAccountId),
      legacyAccountsMetadataDatabase.setItem("accountIds", [legacyAccountId]),
      legacyAccountsMetadataDatabase.setItem("accountNamesToAccountIds", {
        "Legacy Account": legacyAccountId,
      }),
      fillDatabases(legacyAccountDatabaseNames),
    ]);

    await deleteDatabases();
    // the next load runs the migration
    await accountsDatabase.migrate();

    expect(await accountsDatabase.accountsDatabase.keys()).toEqual([]);
    expect(await accountsDatabase.accountsMetadataDatabase.keys()).toEqual([]);
    const databaseNames = [
      "accounts",
      "accountsMetadata",
      ...legacyAccountDatabaseNames,
      ...getAccountDatabaseNames(legacyAccountId),
    ];
    expect(await getDatabaseLengths(databaseNames)).toEqual(getEmptyDatabaseLengths(databaseNames));
  });
});
