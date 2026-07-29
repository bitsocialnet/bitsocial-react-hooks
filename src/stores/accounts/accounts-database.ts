import PkcJs from "../../lib/pkc-js";
import validator from "../../lib/validator";
import chain from "../../lib/chain";
import assert from "assert";
import localForage from "localforage";
import isEqual from "lodash.isequal";
import localForageLru from "../../lib/localforage-lru";
import {
  Accounts,
  AccountNamesToAccountIds,
  CreateCommentOptions,
  Account,
  Comment,
  AccountsComments,
  AccountCommentReply,
  AccountsCommentsReplies,
  AccountEdit,
  AccountEditsSummary,
} from "../../types";
import utils from "../../lib/utils";
import {
  getDefaultChainProviders,
  getDefaultPkcOptions,
  overwritePkcOptions,
} from "./account-generator";
import { getAccountsEditsSummary, sanitizeStoredAccountComment } from "./utils";
import {
  getPkcClientOptions,
  normalizeAccountProtocolConfig,
  withProtocolAliases,
} from "../../lib/pkc-compat";
import Logger from "@pkcprotocol/pkc-logger";
const log = Logger("bitsocial-react-hooks:accounts:stores");
// Storage keeps the existing namespace so current installs reuse the same IndexedDB data.
const accountsDatabaseNamespace = "bitsocialReactHooks";
const getAccountsDatabaseName = (databaseName: string) =>
  `${accountsDatabaseNamespace}-${databaseName}`;
const getPerAccountDatabaseName = (databaseName: string, accountId: string) =>
  `${getAccountsDatabaseName(databaseName)}-${accountId}`;
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
const migrate = async () => {
  const previousAccountsDatabase = localForage.createInstance({ name: "accounts" });
  const previousAccountsMetadataDatabase = localForage.createInstance({ name: "accountsMetadata" });
  // no previous db to migrate
  if (!(await previousAccountsMetadataDatabase.getItem("activeAccountId"))) {
    return;
  }
  // db already migrated
  if (await accountsMetadataDatabase.getItem("activeAccountId")) {
    return;
  }
  // migrate
  const promises = [];
  for (const key of await previousAccountsDatabase.keys()) {
    promises.push(
      previousAccountsDatabase.getItem(key).then((value) => accountsDatabase.setItem(key, value)),
    );
  }
  for (const key of await previousAccountsMetadataDatabase.keys()) {
    promises.push(
      previousAccountsMetadataDatabase
        .getItem(key)
        .then((value) => accountsMetadataDatabase.setItem(key, value)),
    );
  }
  const accountIds = await previousAccountsMetadataDatabase.getItem("accountIds");
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
        for (const key of await previousDatabase.keys()) {
          promises.push(
            previousDatabase.getItem(key).then((value) => database.setItem(key, value)),
          );
        }
      }
    }
  }
  await Promise.all(promises);
};

const getAccountsFromStoredAccounts = async (storedAccounts: Accounts) => {
  const accounts: Accounts = {};
  for (const [accountId, storedAccount] of Object.entries(storedAccounts)) {
    accounts[accountId] = normalizeAccountProtocolConfig(
      await migrateAccount(storedAccount),
      getDefaultChainProviders(),
    );
    // protocol options aren't saved to database if they are default
    if (!accounts[accountId].pkcOptions) {
      accounts[accountId].pkcOptions = getDefaultPkcOptions();
    }
    const protocolOptions = {
      ...(accounts[accountId].pkcOptions || accounts[accountId].pkcOptions),
      ...overwritePkcOptions,
    };
    const pkc = await PkcJs.PKC(getPkcClientOptions(accounts[accountId], protocolOptions));
    // handle errors or error events are uncaught
    // no need to log them because pkc-js already logs them
    pkc.on("error", (error: any) =>
      log.error("uncaught pkc instance error, should never happen", { error }),
    );
    accounts[accountId] = withProtocolAliases(accounts[accountId], pkc, protocolOptions);
  }
  return accounts;
};

const getAccounts = async (accountIds: string[]) => {
  validator.validateAccountsDatabaseGetAccountsArguments(accountIds);
  const accountsArray: any = await Promise.all(
    accountIds.map((accountId) => accountsDatabase.getItem(accountId)),
  );
  const storedAccounts: Accounts = {};
  for (const [index, accountId] of accountIds.entries()) {
    assert(accountsArray[index], `accountId '${accountId}' not found in database`);
    storedAccounts[accountId] = accountsArray[index];
  }
  return getAccountsFromStoredAccounts(storedAccounts);
};

const accountVersion = 5;
const migrateAccount = async (account: any) => {
  account = normalizeAccountProtocolConfig(account);

  let version = account.version || 1;

  // version 2
  if (version === 1) {
    version++;
    if (account.pkcOptions?.ipfsHttpClientsOptions) {
      account.pkcOptions.kuboRpcClientsOptions = account.pkcOptions.ipfsHttpClientsOptions;
      delete account.pkcOptions.ipfsHttpClientsOptions;
    }
    if (account.pkcOptions?.pubsubHttpClientsOptions) {
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
      account.author.wallets.eth = await chain.getEthWalletFromPkcPrivateKey(
        account.signer.privateKey,
        account.address,
      );
    }
  }

  if (version === 3) {
    version++;
    // in version 3, wallets had timestamps in ms, should be seconds
    if (account.author?.wallets?.eth?.timestamp > 1e12) {
      account.author.wallets.eth = await chain.getEthWalletFromPkcPrivateKey(
        account.signer.privateKey,
        account.address,
      );
    }
  }

  if (version === 4) {
    version++;
    account = normalizeAccountProtocolConfig(account);
  }

  account.version = accountVersion;
  return account;
};

const getAccount = async (accountId: string) => {
  const accounts = await getAccounts([accountId]);
  return accounts[accountId];
};

const getExportedAccountJson = async (accountId: string) => {
  assert(
    accountId && typeof accountId === "string",
    `getAccountJson argument accountId '${accountId}' invalid`,
  );
  // do not serialize or instantiate anything (unlike getAccount)
  const account = await accountsDatabase.getItem(accountId);
  if (!account) {
    throw Error(`getAccountJson no account in database with accountId '${accountId}'`);
  }
  const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
  const accountVotesDatabase = getAccountVotesDatabase(accountId);
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  await ensureAccountCommentsDatabaseLayout(accountId);
  const [accountComments, accountVotes, accountEdits] = await Promise.all([
    getDatabaseAsArray(accountCommentsDatabase),
    getDatabaseAsArray(accountVotesDatabase),
    getDatabaseAsArray(accountEditsDatabase),
  ]);
  return JSON.stringify({ account, accountComments, accountVotes, accountEdits });
};

// accountVotes, accountComments and accountEdits are indexeddb
// databases formed like an array (keys are numbers)
const getDatabaseAsArray = async (database: any) => {
  const length = (await database.getItem("length")) || 0;
  let promises = [];
  let i = 0;
  while (i < length) {
    promises.push(database.getItem(String(i++)));
  }
  const items = await Promise.all(promises);
  return items;
};

const replaceDatabaseArray = async (database: any, items: any[], metadata: Record<string, any>) => {
  await database.clear();
  await Promise.all([
    ...items.map((item, index) => database.setItem(String(index), item)),
    database.setItem("length", items.length),
    ...Object.entries(metadata).map(([key, value]) => database.setItem(key, value)),
  ]);
};

const removeFunctionsAndSensitiveFields = (publication: CreateCommentOptions) => {
  const sanitizedPublication: Record<string, any> = {};
  for (const key in publication) {
    if (key === "signer" || key === "author" || typeof publication[key] === "function") {
      continue;
    }
    sanitizedPublication[key] = publication[key];
  }
  return sanitizedPublication;
};

const isNumericDatabaseKey = (key: string) => /^[0-9]+$/.test(key);

const rebuildVotesLatestIndex = (votes: any[]) => {
  const latestIndexByCommentCid: Record<string, number> = {};
  for (const [index, vote] of votes.entries()) {
    if (vote?.commentCid) {
      latestIndexByCommentCid[vote.commentCid] = index;
    }
  }
  return latestIndexByCommentCid;
};

const rebuildEditsTargetIndexes = (edits: any[]) => {
  const targetToIndices: Record<string, number[]> = {};
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

const addAccount = async (account: Account, options?: { returnHydratedAccount?: boolean }) => {
  validator.validateAccountsDatabaseAddAccountArguments(account);
  let [accountIds, accountNamesToAccountIds] = await Promise.all([
    accountsMetadataDatabase.getItem<string[]>("accountIds"),
    accountsMetadataDatabase.getItem<AccountNamesToAccountIds>("accountNamesToAccountIds"),
  ]);
  if (!accountNamesToAccountIds) {
    accountNamesToAccountIds = {};
  }
  // handle no duplicate names
  const existingAccountId = accountNamesToAccountIds[account.name];
  if (existingAccountId && existingAccountId !== account.id) {
    const existingAccount = await accountsDatabase.getItem<Account>(existingAccountId);
    if (existingAccount?.name === account.name) {
      throw Error(`account name '${account.name}' already exists in database`);
    }
    delete accountNamesToAccountIds[account.name];
  }

  // handle updating accounts database
  const accountToPutInDatabase: any = normalizeAccountProtocolConfig({
    ...account,
    pkc: undefined,
  });
  const protocolOptions = accountToPutInDatabase.pkcOptions;
  accountToPutInDatabase.pkcOptions = protocolOptions;
  // don't save default protocol options in database in case they change
  if (JSON.stringify(protocolOptions) === JSON.stringify(getDefaultPkcOptions())) {
    delete accountToPutInDatabase.pkcOptions;
  }
  if (
    JSON.stringify(accountToPutInDatabase.chainProviders) ===
    JSON.stringify(getDefaultChainProviders())
  ) {
    delete accountToPutInDatabase.chainProviders;
  }
  // make sure accountToPutInDatabase protocol options are valid
  let hydratedAccount: Account | undefined;
  if (options?.returnHydratedAccount) {
    hydratedAccount = (
      await getAccountsFromStoredAccounts({
        [accountToPutInDatabase.id]: accountToPutInDatabase,
      })
    )[accountToPutInDatabase.id];
  } else if (protocolOptions) {
    const pkc = await PkcJs.PKC(getPkcClientOptions(accountToPutInDatabase, protocolOptions));
    pkc.on("error", () => {});
    void pkc.destroy?.(); // gc; errors intentionally unhandled to avoid uncounted callback
  }
  await accountsDatabase.setItem(accountToPutInDatabase.id, accountToPutInDatabase);

  // handle updating accountNamesToAccountIds database
  for (const [accountName, accountId] of Object.entries(accountNamesToAccountIds)) {
    if (accountId === account.id && accountName !== account.name) {
      delete accountNamesToAccountIds[accountName];
    }
  }
  accountNamesToAccountIds[account.name] = account.id;
  await accountsMetadataDatabase.setItem("accountNamesToAccountIds", accountNamesToAccountIds);

  // handle updating accountIds database
  if (!accountIds) {
    accountIds = [account.id];
  }
  if (!accountIds.includes(account.id)) {
    accountIds.push(account.id);
  }
  await accountsMetadataDatabase.setItem("accountIds", accountIds);

  // handle updating activeAccountId database
  if (accountIds.length === 1) {
    await accountsMetadataDatabase.setItem("activeAccountId", account.id);
  }
  return hydratedAccount;
};

const removeAccount = async (account: Account) => {
  assert(
    account?.id && typeof account?.id === "string",
    `accountsDatabase.removeAccount invalid account.id '${account.id}'`,
  );

  // handle updating accounts database
  await accountsDatabase.removeItem(account.id);

  // handle updating accountNamesToAccountIds database
  let accountNamesToAccountIds: AccountNamesToAccountIds | null =
    await accountsMetadataDatabase.getItem("accountNamesToAccountIds");
  if (!accountNamesToAccountIds) {
    accountNamesToAccountIds = {};
  }
  delete accountNamesToAccountIds[account.name];
  await accountsMetadataDatabase.setItem("accountNamesToAccountIds", accountNamesToAccountIds);

  // handle updating accountIds database
  let accountIds: string[] | null = await accountsMetadataDatabase.getItem("accountIds");
  accountIds = (accountIds || []).filter((accountId) => accountId !== account.id);
  await accountsMetadataDatabase.setItem("accountIds", accountIds);

  // handle updating activeAccountId database
  const activeAccountId = await accountsMetadataDatabase.getItem("activeAccountId");
  if (activeAccountId === account.id) {
    if (accountIds.length) {
      await accountsMetadataDatabase.setItem("activeAccountId", accountIds[0]);
    } else {
      await accountsMetadataDatabase.removeItem("activeAccountId");
    }
  }

  const accountCommentsDatabase = getAccountCommentsDatabase(account.id);
  await accountCommentsDatabase.clear();

  const accountVotesDatabase = getAccountVotesDatabase(account.id);
  await accountVotesDatabase.clear();

  const accountCommentsRepliesDatabase = getAccountCommentsRepliesDatabase(account.id);
  await accountCommentsRepliesDatabase.clear();

  const accountEditsDatabase = getAccountEditsDatabase(account.id);
  await accountEditsDatabase.clear();
};

const accountsCommentsDatabases: any = {};
const accountCommentsLayoutMigrations: Record<string, Promise<void> | undefined> = {};
const getAccountCommentsDatabase = (accountId: string) => {
  assert(
    accountId && typeof accountId === "string",
    `getAccountCommentsDatabase '${accountId}' not a string`,
  );
  if (!accountsCommentsDatabases[accountId]) {
    accountsCommentsDatabases[accountId] = localForage.createInstance({
      name: getPerAccountDatabaseName("accountComments", accountId),
    });
  }
  return accountsCommentsDatabases[accountId];
};

const ensureAccountCommentsDatabaseLayout = async (accountId: string) => {
  const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
  if ((await accountCommentsDatabase.getItem(storageVersionKey)) === commentStorageVersion) {
    return;
  }
  if (!accountCommentsLayoutMigrations[accountId]) {
    accountCommentsLayoutMigrations[accountId] = (async () => {
      if ((await accountCommentsDatabase.getItem(storageVersionKey)) === commentStorageVersion) {
        return;
      }

      const comments = await getDatabaseAsArray(accountCommentsDatabase);
      const updatedComments = comments
        .map((comment) => (comment ? sanitizeStoredAccountComment(comment) : undefined))
        .filter((comment) => comment !== undefined);
      const rewritePromises: Promise<void>[] = [];
      for (const [index, updatedComment] of updatedComments.entries()) {
        if (!isEqual(updatedComment, comments[index])) {
          rewritePromises.push(accountCommentsDatabase.setItem(String(index), updatedComment));
        }
      }
      for (let index = updatedComments.length; index < comments.length; index++) {
        rewritePromises.push(accountCommentsDatabase.removeItem(String(index)));
      }
      rewritePromises.push(accountCommentsDatabase.setItem("length", updatedComments.length));
      await Promise.all(rewritePromises);
      await accountCommentsDatabase.setItem(storageVersionKey, commentStorageVersion);
    })().finally(() => {
      delete accountCommentsLayoutMigrations[accountId];
    });
  }

  await accountCommentsLayoutMigrations[accountId];
};

const deleteAccountComment = async (accountId: string, accountCommentIndex: number) => {
  const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
  await ensureAccountCommentsDatabaseLayout(accountId);
  const length = (await accountCommentsDatabase.getItem("length")) || 0;
  assert(
    accountCommentIndex >= 0 && accountCommentIndex < length,
    `deleteAccountComment accountCommentIndex '${accountCommentIndex}' out of range [0, ${length})`,
  );
  const items = await getDatabaseAsArray(accountCommentsDatabase);
  items.splice(accountCommentIndex, 1);
  const newLength = length - 1;
  const promises: Promise<void>[] = [];
  for (let i = 0; i < newLength; i++) {
    promises.push(accountCommentsDatabase.setItem(String(i), items[i]));
  }
  promises.push(accountCommentsDatabase.removeItem(String(length - 1)));
  promises.push(accountCommentsDatabase.setItem("length", newLength));
  await Promise.all(promises);
};

const addAccountComment = async (
  accountId: string,
  comment: CreateCommentOptions | Comment,
  accountCommentIndex?: number,
) => {
  const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
  await ensureAccountCommentsDatabaseLayout(accountId);
  const length = (await accountCommentsDatabase.getItem("length")) || 0;
  comment = sanitizeStoredAccountComment(comment);
  if (typeof accountCommentIndex === "number") {
    assert(
      accountCommentIndex < length,
      `addAccountComment cannot edit comment no comment in database at accountCommentIndex '${accountCommentIndex}'`,
    );
    await Promise.all([
      accountCommentsDatabase.setItem(String(accountCommentIndex), comment),
      accountCommentsDatabase.setItem(storageVersionKey, commentStorageVersion),
    ]);
  } else {
    await Promise.all([
      accountCommentsDatabase.setItem(String(length), comment),
      accountCommentsDatabase.setItem(storageVersionKey, commentStorageVersion),
      accountCommentsDatabase.setItem("length", length + 1),
    ]);
  }
};

const getAccountComments = async (accountId: string) => {
  const accountCommentsDatabase = getAccountCommentsDatabase(accountId);
  await ensureAccountCommentsDatabaseLayout(accountId);
  const length = (await accountCommentsDatabase.getItem("length")) || 0;
  if (length === 0) {
    return [];
  }
  let promises = [];
  let i = 0;
  while (i < length) {
    promises.push(accountCommentsDatabase.getItem(String(i++)));
  }
  const comments = await Promise.all(promises);
  // add index and account id to account comments for easier updating
  for (const i in comments) {
    comments[i] = sanitizeStoredAccountComment(comments[i]);
    comments[i].index = Number(i);
    comments[i].accountId = accountId;
  }
  return comments;
};

const getAccountsComments = async (accountIds: string[]) => {
  assert(
    Array.isArray(accountIds),
    `getAccountsComments invalid accountIds '${accountIds}' not an array`,
  );
  const promises = [];
  for (const accountId of accountIds) {
    promises.push(getAccountComments(accountId));
  }
  const accountsCommentsArray = await Promise.all(promises);
  const accountsComments: AccountsComments = {};
  for (const [i, accountId] of accountIds.entries()) {
    accountsComments[accountId] = accountsCommentsArray[i];
  }
  return accountsComments;
};

const accountsVotesDatabases: any = {};
const getAccountVotesDatabase = (accountId: string) => {
  assert(
    accountId && typeof accountId === "string",
    `getAccountVotesDatabase '${accountId}' not a string`,
  );
  if (!accountsVotesDatabases[accountId]) {
    accountsVotesDatabases[accountId] = localForage.createInstance({
      name: getPerAccountDatabaseName("accountVotes", accountId),
    });
  }
  return accountsVotesDatabases[accountId];
};

const ensureAccountVotesDatabaseLayout = async (accountId: string) => {
  const accountVotesDatabase = getAccountVotesDatabase(accountId);
  if ((await accountVotesDatabase.getItem(storageVersionKey)) === voteStorageVersion) {
    return;
  }

  const votes = await getDatabaseAsArray(accountVotesDatabase);
  const latestIndexByCommentCid = rebuildVotesLatestIndex(votes);
  const keys = await accountVotesDatabase.keys();
  const duplicateKeysToDelete = keys.filter(
    (key: string) =>
      !isNumericDatabaseKey(key) &&
      key !== "length" &&
      key !== storageVersionKey &&
      key !== votesLatestIndexKey &&
      latestIndexByCommentCid[key] !== undefined,
  );
  await Promise.all([
    ...duplicateKeysToDelete.map((key: string) => accountVotesDatabase.removeItem(key)),
    accountVotesDatabase.setItem(votesLatestIndexKey, latestIndexByCommentCid),
    accountVotesDatabase.setItem(storageVersionKey, voteStorageVersion),
  ]);
};

const addAccountVote = async (accountId: string, createVoteOptions: CreateCommentOptions) => {
  assert(
    createVoteOptions?.commentCid && typeof createVoteOptions?.commentCid === "string",
    `addAccountVote createVoteOptions.commentCid '${createVoteOptions?.commentCid}' not a string`,
  );
  const accountVotesDatabase = getAccountVotesDatabase(accountId);
  await ensureAccountVotesDatabaseLayout(accountId);
  const length = (await accountVotesDatabase.getItem("length")) || 0;
  const vote = removeFunctionsAndSensitiveFields(createVoteOptions);
  const existingLatestIndexByCommentCid = await accountVotesDatabase.getItem(votesLatestIndexKey);
  const latestIndexByCommentCid = {
    ...existingLatestIndexByCommentCid,
    [vote.commentCid]: length,
  };
  await Promise.all([
    accountVotesDatabase.setItem(String(length), vote),
    accountVotesDatabase.setItem(votesLatestIndexKey, latestIndexByCommentCid),
    accountVotesDatabase.setItem(storageVersionKey, voteStorageVersion),
    accountVotesDatabase.setItem("length", length + 1),
  ]);
};

const getAccountVotes = async (accountId: string) => {
  const accountVotesDatabase = getAccountVotesDatabase(accountId);
  await ensureAccountVotesDatabaseLayout(accountId);
  const latestIndexByCommentCid = (await accountVotesDatabase.getItem(votesLatestIndexKey)) || {};
  const votes: any = {};
  const latestIndexes = Object.values<number>(latestIndexByCommentCid);
  if (latestIndexes.length === 0) {
    return votes;
  }
  const promises = latestIndexes.map((index) => accountVotesDatabase.getItem(String(index)));
  const votesArray = await Promise.all(promises);
  for (const vote of votesArray) {
    votes[vote?.commentCid] = vote;
  }
  return votes;
};

const getAccountsVotes = async (accountIds: string[]) => {
  assert(
    Array.isArray(accountIds),
    `getAccountsVotes invalid accountIds '${accountIds}' not an array`,
  );
  const promises = [];
  for (const accountId of accountIds) {
    promises.push(getAccountVotes(accountId));
  }
  const accountsVotesArray = await Promise.all(promises);
  const accountsVotes: any = {};
  for (const [i, accountId] of accountIds.entries()) {
    accountsVotes[accountId] = accountsVotesArray[i];
  }
  return accountsVotes;
};

const accountsCommentsRepliesDatabases: any = {};
const getAccountCommentsRepliesDatabase = (accountId: string) => {
  assert(
    accountId && typeof accountId === "string",
    `getAccountCommentsRepliesDatabase '${accountId}' not a string`,
  );
  if (!accountsCommentsRepliesDatabases[accountId]) {
    accountsCommentsRepliesDatabases[accountId] = localForageLru.createInstance({
      name: getPerAccountDatabaseName("accountCommentsReplies", accountId),
      size: 1000,
    });
  }
  return accountsCommentsRepliesDatabases[accountId];
};

const addAccountCommentReply = async (accountId: string, reply: AccountCommentReply) => {
  const accountCommentsRepliesDatabase = getAccountCommentsRepliesDatabase(accountId);
  await accountCommentsRepliesDatabase.setItem(reply.cid, utils.clone(reply));
};

const getAccountCommentsReplies = async (accountId: string) => {
  const accountCommentsRepliesDatabase = getAccountCommentsRepliesDatabase(accountId);
  const accountCommentsRepliesEntries = await accountCommentsRepliesDatabase.entries();
  const replies = {};
  for (const [, reply] of accountCommentsRepliesEntries) {
    // @ts-ignore
    replies[reply.cid] = reply;
  }
  return replies;
};

const getAccountsCommentsReplies = async (accountIds: string[]) => {
  assert(
    Array.isArray(accountIds),
    `getAccountsCommentsReplies invalid accountIds '${accountIds}' not an array`,
  );
  const promises = [];
  for (const accountId of accountIds) {
    promises.push(getAccountCommentsReplies(accountId));
  }
  const accountsCommentsRepliesArray = await Promise.all(promises);
  const accountsCommentsReplies: AccountsCommentsReplies = {};
  for (const [i, accountId] of accountIds.entries()) {
    accountsCommentsReplies[accountId] = accountsCommentsRepliesArray[i];
  }
  return accountsCommentsReplies;
};

const accountsEditsDatabases: any = {};
const getAccountEditsDatabase = (accountId: string) => {
  assert(
    accountId && typeof accountId === "string",
    `getAccountEditsDatabase '${accountId}' not a string`,
  );
  if (!accountsEditsDatabases[accountId]) {
    accountsEditsDatabases[accountId] = localForage.createInstance({
      name: getPerAccountDatabaseName("accountEdits", accountId),
    });
  }
  return accountsEditsDatabases[accountId];
};

const getAccountEditTarget = (edit: AccountEdit) =>
  edit?.commentCid || edit?.communityAddress || edit?.communityAddress;

const persistAccountEditsIndexes = async (accountId: string, edits: AccountEdit[]) => {
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  const targetToIndices = rebuildEditsTargetIndexes(edits);
  const summary = getAccountsEditsSummary(
    Object.fromEntries(
      Object.entries(targetToIndices).map(([target, indices]) => [
        target,
        indices.map((index) => edits[index]).filter(Boolean),
      ]),
    ),
  );
  await Promise.all([
    accountEditsDatabase.setItem(editsTargetToIndicesKey, targetToIndices),
    accountEditsDatabase.setItem(editsSummaryKey, summary),
    accountEditsDatabase.setItem(storageVersionKey, editStorageVersion),
  ]);
  return { targetToIndices, summary };
};

const ensureAccountEditsDatabaseLayout = async (accountId: string) => {
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  if ((await accountEditsDatabase.getItem(storageVersionKey)) === editStorageVersion) {
    return;
  }

  const edits = await getDatabaseAsArray(accountEditsDatabase);
  const keys = await accountEditsDatabase.keys();
  const duplicateKeysToDelete = keys.filter(
    (key: string) =>
      !isNumericDatabaseKey(key) &&
      key !== "length" &&
      key !== storageVersionKey &&
      key !== editsTargetToIndicesKey &&
      key !== editsSummaryKey &&
      edits.some((edit) => getAccountEditTarget(edit as AccountEdit) === key),
  );
  await Promise.all(
    duplicateKeysToDelete.map((key: string) => accountEditsDatabase.removeItem(key)),
  );
  await persistAccountEditsIndexes(accountId, edits as AccountEdit[]);
};

const addAccountEdit = async (accountId: string, createEditOptions: CreateCommentOptions) => {
  const editTarget = getAccountEditTarget(createEditOptions as AccountEdit);
  assert(typeof editTarget === "string", `addAccountEdit target '${editTarget}' not a string`);
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  await ensureAccountEditsDatabaseLayout(accountId);
  const length = (await accountEditsDatabase.getItem("length")) || 0;
  const edit = removeFunctionsAndSensitiveFields(createEditOptions);
  const existingEdits = await getDatabaseAsArray(accountEditsDatabase);
  existingEdits[length] = edit;
  await Promise.all([
    accountEditsDatabase.setItem(String(length), edit),
    accountEditsDatabase.setItem(storageVersionKey, editStorageVersion),
    accountEditsDatabase.setItem("length", length + 1),
  ]);
  await persistAccountEditsIndexes(accountId, existingEdits as AccountEdit[]);
};

const doesStoredAccountEditMatch = (storedAccountEdit: any, targetStoredAccountEdit: any) =>
  storedAccountEdit?.clientId && targetStoredAccountEdit?.clientId
    ? storedAccountEdit.clientId === targetStoredAccountEdit.clientId
    : isEqual(storedAccountEdit, targetStoredAccountEdit);

const deleteAccountEdit = async (accountId: string, editToDelete: CreateCommentOptions) => {
  const editTarget = getAccountEditTarget(editToDelete as AccountEdit);
  assert(typeof editTarget === "string", `deleteAccountEdit target '${editTarget}' not a string`);
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  await ensureAccountEditsDatabaseLayout(accountId);
  const length = (await accountEditsDatabase.getItem("length")) || 0;
  const items = await getDatabaseAsArray(accountEditsDatabase);

  let deletedEdit = false;
  const nextItems = items.filter((item) => {
    if (!deletedEdit && doesStoredAccountEditMatch(item, editToDelete)) {
      deletedEdit = true;
      return false;
    }
    return true;
  });

  const newLength = nextItems.length;
  const promises: Promise<void>[] = [];
  for (let i = 0; i < newLength; i++) {
    promises.push(accountEditsDatabase.setItem(String(i), nextItems[i]));
  }
  if (length > newLength) {
    promises.push(accountEditsDatabase.removeItem(String(length - 1)));
    promises.push(accountEditsDatabase.setItem("length", newLength));
  }
  await Promise.all(promises);
  await persistAccountEditsIndexes(accountId, nextItems as AccountEdit[]);
  return deletedEdit;
};

const getAccountEdits = async (accountId: string) => {
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  await ensureAccountEditsDatabaseLayout(accountId);
  const targetToIndices = (await accountEditsDatabase.getItem(editsTargetToIndicesKey)) || {};
  const edits: any = {};
  const targets = Object.keys(targetToIndices);
  if (targets.length === 0) {
    return edits;
  }
  for (const target of targets) {
    const targetIndices: number[] = targetToIndices[target];
    const targetEdits = await Promise.all(
      targetIndices.map((index) => accountEditsDatabase.getItem(String(index))),
    );
    edits[target] = targetEdits.filter(Boolean);
  }
  return edits;
};

const getAccountEditsSummary = async (accountId: string): Promise<AccountEditsSummary> => {
  const accountEditsDatabase = getAccountEditsDatabase(accountId);
  await ensureAccountEditsDatabaseLayout(accountId);
  return (await accountEditsDatabase.getItem(editsSummaryKey)) || {};
};

const getAccountsEdits = async (accountIds: string[]) => {
  assert(
    Array.isArray(accountIds),
    `getAccountsEdits invalid accountIds '${accountIds}' not an array`,
  );
  const promises = [];
  for (const accountId of accountIds) {
    promises.push(getAccountEdits(accountId));
  }
  const accountsEditsArray = await Promise.all(promises);
  const accountsEdits: any = {};
  for (const [i, accountId] of accountIds.entries()) {
    accountsEdits[accountId] = accountsEditsArray[i];
  }
  return accountsEdits;
};

const getAccountsEditsSummaries = async (accountIds: string[]) => {
  assert(
    Array.isArray(accountIds),
    `getAccountsEditsSummaries invalid accountIds '${accountIds}' not an array`,
  );
  const accountsEditsSummaries = await Promise.all(
    accountIds.map((accountId) => getAccountEditsSummary(accountId)),
  );
  return Object.fromEntries(
    accountIds.map((accountId, index) => [accountId, accountsEditsSummaries[index]]),
  );
};

const importAccountHistory = async (
  accountId: string,
  {
    accountComments = [],
    accountVotes = [],
    accountEdits = [],
  }: {
    accountComments?: Comment[];
    accountVotes?: CreateCommentOptions[];
    accountEdits?: CreateCommentOptions[];
  },
) => {
  const storedComments = accountComments.map((comment) => sanitizeStoredAccountComment(comment));
  const storedVotes = accountVotes.map((vote) => {
    assert(
      vote?.commentCid && typeof vote.commentCid === "string",
      `addAccountVote createVoteOptions.commentCid '${vote?.commentCid}' not a string`,
    );
    return removeFunctionsAndSensitiveFields(vote);
  });
  const storedEdits = accountEdits.map((edit) => {
    const editTarget = getAccountEditTarget(edit as AccountEdit);
    assert(typeof editTarget === "string", `addAccountEdit target '${editTarget}' not a string`);
    return removeFunctionsAndSensitiveFields(edit);
  });

  const latestVoteIndexByCommentCid = rebuildVotesLatestIndex(storedVotes);
  const editTargetToIndices = rebuildEditsTargetIndexes(storedEdits);
  const accountEditsSummary = getAccountsEditsSummary(
    Object.fromEntries(
      Object.entries(editTargetToIndices).map(([target, indices]) => [
        target,
        indices.map((index) => storedEdits[index]).filter(Boolean),
      ]),
    ),
  );

  await Promise.all([
    replaceDatabaseArray(getAccountCommentsDatabase(accountId), storedComments, {
      [storageVersionKey]: commentStorageVersion,
    }),
    replaceDatabaseArray(getAccountVotesDatabase(accountId), storedVotes, {
      [votesLatestIndexKey]: latestVoteIndexByCommentCid,
      [storageVersionKey]: voteStorageVersion,
    }),
    replaceDatabaseArray(getAccountEditsDatabase(accountId), storedEdits, {
      [editsTargetToIndicesKey]: editTargetToIndices,
      [editsSummaryKey]: accountEditsSummary,
      [storageVersionKey]: editStorageVersion,
    }),
  ]);

  const accountCommentsWithIndexes = storedComments.map((comment, index) => ({
    ...comment,
    index,
    accountId,
  }));
  const accountVotesByCommentCid = Object.fromEntries(
    Object.entries(latestVoteIndexByCommentCid).map(([commentCid, index]) => [
      commentCid,
      storedVotes[index],
    ]),
  );

  return {
    accountComments: accountCommentsWithIndexes,
    accountVotes: accountVotesByCommentCid,
    accountEditsSummary,
  };
};

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
