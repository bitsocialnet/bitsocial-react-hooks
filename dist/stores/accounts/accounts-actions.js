// public accounts actions that are called by the user
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import accountsStore, { listeners } from "./accounts-store.js";
import communitiesStore from "../communities/index.js";
import accountsDatabase from "./accounts-database.js";
import accountGenerator from "./account-generator.js";
import Logger from "@pkcprotocol/pkc-logger";
import validator from "../../lib/validator.js";
import chain from "../../lib/chain/index.js";
import assert from "assert";
const log = Logger("bitsocial-react-hooks:accounts:stores");
import * as accountsActionsInternal from "./accounts-actions-internal.js";
import { backfillPublicationCommunityAddress, createPkcCommunity, createPkcCommunityEdit, getPkcCommunityAddresses, normalizeCommunityEditOptionsForPkc, normalizePublicationOptionsForStore, normalizePublicationOptionsForPkc, withPublishChallengeAnswersCompat, } from "../../lib/pkc-compat.js";
import { getAccountCommentsIndex, getAccountCommunities, getCommentCidsToAccountsComments, COMMENT_MODERATION_AUTHOR_SUMMARY_KEY, getAccountEditPropertySummary, fetchCommentLinkDimensions, getAccountCommentDepth, addShortAddressesToAccountComment, sanitizeAccountCommentForState, sanitizeStoredAccountComment, getFreshestLoadedComment, getInitAccountCommentsToUpdate, } from "./utils.js";
import isEqual from "lodash.isequal";
import { v4 as uuid } from "uuid";
import utils from "../../lib/utils/index.js";
import { addOptimisticVoteMetadata } from "../../lib/utils/optimistic-vote-counts.js";
// Active publish-session tracking for pending comments (Task 3)
const activePublishSessions = new Map();
const abandonedPublishSessionIds = new Set();
const getClientsSnapshotForState = (clients) => {
    if (!clients || typeof clients !== "object") {
        return undefined;
    }
    if (typeof clients.on === "function" || "state" in clients) {
        return { state: clients.state };
    }
    const snapshot = {};
    for (const key in clients) {
        const childSnapshot = getClientsSnapshotForState(clients[key]);
        if (childSnapshot !== undefined) {
            snapshot[key] = childSnapshot;
        }
    }
    return Object.keys(snapshot).length > 0 ? snapshot : undefined;
};
const unsafeCommentUpdatePropertyNames = new Set(["__proto__", "constructor", "prototype"]);
const applyChallengeVerificationCommentUpdateToPublication = (challengeVerification, publication) => {
    const commentUpdate = challengeVerification === null || challengeVerification === void 0 ? void 0 : challengeVerification.commentUpdate;
    if (!commentUpdate ||
        typeof commentUpdate !== "object" ||
        Array.isArray(commentUpdate) ||
        !publication ||
        typeof publication !== "object") {
        return;
    }
    for (const key of Object.keys(commentUpdate)) {
        if (!unsafeCommentUpdatePropertyNames.has(key)) {
            publication[key] = commentUpdate[key];
        }
    }
};
const syncCommentClientsSnapshot = (publishSessionId, accountId, publication) => {
    const session = getPublishSession(publishSessionId);
    if ((session === null || session === void 0 ? void 0 : session.currentIndex) === undefined) {
        return;
    }
    const snapshot = getClientsSnapshotForState(publication === null || publication === void 0 ? void 0 : publication.clients);
    accountsStore.setState(({ accountsComments }) => maybeUpdateAccountComment(accountsComments, accountId, session.currentIndex, (ac, acc) => {
        const updatedAccountComment = Object.assign({}, acc);
        if (snapshot === undefined) {
            delete updatedAccountComment.clients;
        }
        else {
            updatedAccountComment.clients = snapshot;
        }
        ac[session.currentIndex] = updatedAccountComment;
    }));
};
const accountOwnsCommunityLocally = (account, communityAddress) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const localCommunityAddresses = getPkcCommunityAddresses(account.pkc);
    if (localCommunityAddresses.includes(communityAddress)) {
        return true;
    }
    const storedCommunity = communitiesStore.getState().communities[communityAddress];
    if (((_b = (_a = storedCommunity === null || storedCommunity === void 0 ? void 0 : storedCommunity.roles) === null || _a === void 0 ? void 0 : _a[account.author.address]) === null || _b === void 0 ? void 0 : _b.role) === "owner") {
        return true;
    }
    if (((_c = storedCommunity === null || storedCommunity === void 0 ? void 0 : storedCommunity.signer) === null || _c === void 0 ? void 0 : _c.address) &&
        storedCommunity.signer.address === ((_d = account.signer) === null || _d === void 0 ? void 0 : _d.address)) {
        return true;
    }
    return ((_g = (_f = (_e = account.communities) === null || _e === void 0 ? void 0 : _e[communityAddress]) === null || _f === void 0 ? void 0 : _f.role) === null || _g === void 0 ? void 0 : _g.role) === "owner";
};
const createPublishSession = (accountId, index) => {
    const sessionId = uuid();
    activePublishSessions.set(sessionId, {
        accountId,
        originalIndex: index,
        currentIndex: index,
    });
    return sessionId;
};
const updatePublishSessionComment = (sessionId, comment) => {
    const session = activePublishSessions.get(sessionId);
    if (!session) {
        return;
    }
    activePublishSessions.set(sessionId, Object.assign(Object.assign({}, session), { comment }));
};
const abandonAndStopPublishSession = (accountId, index) => {
    var _a, _b;
    const session = getPublishSessionByCurrentIndex(accountId, index);
    if (!session)
        return;
    abandonedPublishSessionIds.add(session.sessionId);
    try {
        const stop = (_b = (_a = session.comment) === null || _a === void 0 ? void 0 : _a.stop) === null || _b === void 0 ? void 0 : _b.bind(session.comment);
        if (typeof stop === "function")
            stop();
    }
    catch (e) {
        log.error("comment.stop() error during abandon", { accountId, index, error: e });
    }
    activePublishSessions.delete(session.sessionId);
};
const isPublishSessionAbandoned = (sessionId) => abandonedPublishSessionIds.has(sessionId);
const getPublishSession = (sessionId) => activePublishSessions.get(sessionId);
/** Returns state update or {} when accountComment not yet in state (no-op). Exported for coverage. */
export const maybeUpdateAccountComment = (accountsComments, accountId, index, updater) => {
    const accountComments = [...(accountsComments[accountId] || [])];
    const accountComment = accountComments[index];
    if (!accountComment)
        return {};
    updater(accountComments, accountComment);
    return { accountsComments: Object.assign(Object.assign({}, accountsComments), { [accountId]: accountComments }) };
};
const getPublishSessionByCurrentIndex = (accountId, index) => {
    for (const [key, session] of activePublishSessions) {
        if (session.accountId === accountId && session.currentIndex === index) {
            return Object.assign({ sessionId: key }, session);
        }
    }
    return undefined;
};
const shiftPublishSessionIndicesAfterDelete = (accountId, deletedIndex) => {
    for (const session of activePublishSessions.values()) {
        if (session.accountId === accountId && session.currentIndex > deletedIndex) {
            session.currentIndex -= 1;
        }
    }
};
const cleanupPublishSessionOnTerminal = (sessionId) => {
    activePublishSessions.delete(sessionId);
    abandonedPublishSessionIds.delete(sessionId);
};
export const doesStoredAccountEditMatch = (storedAccountEdit, targetStoredAccountEdit) => (storedAccountEdit === null || storedAccountEdit === void 0 ? void 0 : storedAccountEdit.clientId) && (targetStoredAccountEdit === null || targetStoredAccountEdit === void 0 ? void 0 : targetStoredAccountEdit.clientId)
    ? storedAccountEdit.clientId === targetStoredAccountEdit.clientId
    : isEqual(storedAccountEdit, targetStoredAccountEdit);
export const sanitizeStoredAccountEdit = (storedAccountEdit) => {
    const sanitizedStoredAccountEdit = Object.assign({}, storedAccountEdit);
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
const normalizeStoredAccountEditForSummary = (storedAccountEdit) => {
    var _a;
    const normalizedEdit = Object.assign({}, storedAccountEdit);
    const commentModeration = normalizedEdit.commentModeration;
    if (commentModeration && typeof commentModeration === "object") {
        const { author } = commentModeration, commentModerationProperties = __rest(commentModeration, ["author"]);
        Object.assign(normalizedEdit, commentModerationProperties);
        if (Object.prototype.hasOwnProperty.call(commentModeration, "author")) {
            normalizedEdit[COMMENT_MODERATION_AUTHOR_SUMMARY_KEY] = author;
        }
        normalizedEdit.commentModeration = undefined;
    }
    const communityEdit = (_a = normalizedEdit.communityEdit) !== null && _a !== void 0 ? _a : normalizedEdit.communityEdit;
    if (communityEdit && typeof communityEdit === "object") {
        Object.assign(normalizedEdit, communityEdit);
    }
    delete normalizedEdit.communityEdit;
    delete normalizedEdit.communityEdit;
    return normalizedEdit;
};
const getStoredAccountEditTarget = (storedAccountEdit) => storedAccountEdit.commentCid ||
    storedAccountEdit.communityAddress ||
    storedAccountEdit.communityAddress;
export const addStoredAccountEditSummaryToState = (accountsEditsSummaries, accountId, storedAccountEdit) => {
    var _a;
    const editTarget = getStoredAccountEditTarget(storedAccountEdit);
    if (!editTarget) {
        return { accountsEditsSummaries };
    }
    const accountEditsSummary = accountsEditsSummaries[accountId] || {};
    const targetSummary = accountEditsSummary[editTarget] || {};
    const nextSummary = Object.assign({}, targetSummary);
    const normalizedEdit = normalizeStoredAccountEditForSummary(storedAccountEdit);
    for (const propertyName in normalizedEdit) {
        if ((normalizedEdit[propertyName] === undefined &&
            propertyName !== COMMENT_MODERATION_AUTHOR_SUMMARY_KEY) ||
            accountEditNonPropertyNames.has(propertyName)) {
            continue;
        }
        const previousTimestamp = ((_a = nextSummary[propertyName]) === null || _a === void 0 ? void 0 : _a.timestamp) || 0;
        if ((normalizedEdit.timestamp || 0) >= previousTimestamp) {
            nextSummary[propertyName] = {
                timestamp: normalizedEdit.timestamp,
                value: normalizedEdit[propertyName],
            };
        }
    }
    return {
        accountsEditsSummaries: Object.assign(Object.assign({}, accountsEditsSummaries), { [accountId]: Object.assign(Object.assign({}, accountEditsSummary), { [editTarget]: nextSummary }) }),
    };
};
export const removeStoredAccountEditSummaryFromState = (accountsEditsSummaries, accountsEdits, accountId, storedAccountEdit) => {
    var _a;
    const editTarget = getStoredAccountEditTarget(storedAccountEdit);
    if (!editTarget) {
        return { accountsEditsSummaries };
    }
    let deletedEdit = false;
    const editsForTarget = (((_a = accountsEdits[accountId]) === null || _a === void 0 ? void 0 : _a[editTarget]) || []).filter((storedEdit) => {
        if (!deletedEdit && doesStoredAccountEditMatch(storedEdit, storedAccountEdit)) {
            deletedEdit = true;
            return false;
        }
        return true;
    });
    const nextTargetSummary = getAccountEditPropertySummary(editsForTarget);
    const nextAccountSummary = Object.assign({}, (accountsEditsSummaries[accountId] || {}));
    if (Object.keys(nextTargetSummary).length > 0) {
        nextAccountSummary[editTarget] = nextTargetSummary;
    }
    else {
        delete nextAccountSummary[editTarget];
    }
    return {
        accountsEditsSummaries: Object.assign(Object.assign({}, accountsEditsSummaries), { [accountId]: nextAccountSummary }),
    };
};
export const hasTerminalChallengeVerificationError = (challengeVerification) => {
    const challengeErrors = challengeVerification === null || challengeVerification === void 0 ? void 0 : challengeVerification.challengeErrors;
    const hasChallengeErrors = Array.isArray(challengeErrors)
        ? challengeErrors.length > 0
        : challengeErrors && typeof challengeErrors === "object"
            ? Object.keys(challengeErrors).length > 0
            : Boolean(challengeErrors);
    return (!(challengeVerification === null || challengeVerification === void 0 ? void 0 : challengeVerification.challengeSuccess) &&
        (hasChallengeErrors || Boolean(challengeVerification === null || challengeVerification === void 0 ? void 0 : challengeVerification.reason)));
};
export const addStoredAccountEditToState = (accountsEdits, accountId, storedAccountEdit) => {
    const accountEdits = accountsEdits[accountId] || {};
    const editTarget = getStoredAccountEditTarget(storedAccountEdit);
    if (!editTarget) {
        return { accountsEdits };
    }
    const commentEdits = accountEdits[editTarget] || [];
    return {
        accountsEdits: Object.assign(Object.assign({}, accountsEdits), { [accountId]: Object.assign(Object.assign({}, accountEdits), { [editTarget]: [...commentEdits, storedAccountEdit] }) }),
    };
};
export const removeStoredAccountEditFromState = (accountsEdits, accountId, storedAccountEdit) => {
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
    const nextAccountEdits = nextCommentEdits.length > 0
        ? Object.assign(Object.assign({}, accountEdits), { [editTarget]: nextCommentEdits }) : Object.fromEntries(Object.entries(accountEdits).filter(([target]) => target !== editTarget));
    return {
        accountsEdits: Object.assign(Object.assign({}, accountsEdits), { [accountId]: nextAccountEdits }),
    };
};
const addNewAccountToDatabaseAndState = (newAccount) => __awaiter(void 0, void 0, void 0, function* () {
    // add to database first to init the account
    yield accountsDatabase.addAccount(newAccount);
    // use database data for these because it's easier
    const [newAccountIds, newAccountNamesToAccountIds] = yield Promise.all([
        accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
        accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);
    // set the new state
    const { accounts, accountsComments, accountsCommentsIndexes, accountsVotes, accountsEdits, accountsEditsSummaries, accountsEditsLoaded, accountsCommentsReplies, } = accountsStore.getState();
    const newAccounts = Object.assign(Object.assign({}, accounts), { [newAccount.id]: newAccount });
    const newState = {
        accounts: newAccounts,
        accountIds: newAccountIds,
        accountNamesToAccountIds: newAccountNamesToAccountIds,
        accountsComments: Object.assign(Object.assign({}, accountsComments), { [newAccount.id]: [] }),
        accountsCommentsIndexes: Object.assign(Object.assign({}, accountsCommentsIndexes), { [newAccount.id]: getAccountCommentsIndex([]) }),
        accountsVotes: Object.assign(Object.assign({}, accountsVotes), { [newAccount.id]: {} }),
        accountsEdits: Object.assign(Object.assign({}, accountsEdits), { [newAccount.id]: {} }),
        accountsEditsSummaries: Object.assign(Object.assign({}, accountsEditsSummaries), { [newAccount.id]: {} }),
        accountsEditsLoaded: Object.assign(Object.assign({}, accountsEditsLoaded), { [newAccount.id]: false }),
        accountsCommentsReplies: Object.assign(Object.assign({}, accountsCommentsReplies), { [newAccount.id]: {} }),
    };
    // if there is only 1 account, make it active
    // otherwise stay on the same active account
    if (newAccountIds.length === 1) {
        newState.activeAccountId = newAccount.id;
    }
    accountsStore.setState(newState);
});
export const createAccount = (accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const newAccount = yield accountGenerator.generateDefaultAccount();
    if (accountName) {
        newAccount.name = accountName;
    }
    yield addNewAccountToDatabaseAndState(newAccount);
    log("accountsActions.createAccount", { accountName, account: newAccount });
});
export const deleteAccount = (accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId, accountsComments, accountsCommentsIndexes, accountsVotes, accountsEdits, accountsEditsSummaries, accountsEditsLoaded, } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.deleteAccount account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    yield accountsDatabase.removeAccount(account);
    const newAccounts = Object.assign({}, accounts);
    delete newAccounts[account.id];
    const [newAccountIds, newActiveAccountId, newAccountNamesToAccountIds] = yield Promise.all([
        accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
        accountsDatabase.accountsMetadataDatabase.getItem("activeAccountId"),
        accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);
    const newAccountsComments = Object.assign({}, accountsComments);
    delete newAccountsComments[account.id];
    const newAccountsCommentsIndexes = Object.assign({}, accountsCommentsIndexes);
    delete newAccountsCommentsIndexes[account.id];
    const newCommentCidsToAccountsComments = getCommentCidsToAccountsComments(newAccountsComments);
    const newAccountsVotes = Object.assign({}, accountsVotes);
    delete newAccountsVotes[account.id];
    const newAccountsEdits = Object.assign({}, accountsEdits);
    delete newAccountsEdits[account.id];
    const newAccountsEditsSummaries = Object.assign({}, accountsEditsSummaries);
    delete newAccountsEditsSummaries[account.id];
    const newAccountsEditsLoaded = Object.assign({}, accountsEditsLoaded);
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
});
export const setActiveAccount = (accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accountNamesToAccountIds } = accountsStore.getState();
    assert(accountNamesToAccountIds, `can't use accountsStore.accountActions before initialized`);
    validator.validateAccountsActionsSetActiveAccountArguments(accountName);
    const accountId = accountNamesToAccountIds[accountName];
    yield accountsDatabase.accountsMetadataDatabase.setItem("activeAccountId", accountId);
    log("accountsActions.setActiveAccount", { accountName, accountId });
    accountsStore.setState({ activeAccountId: accountId });
});
export const setAccount = (account) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { accounts } = accountsStore.getState();
    validator.validateAccountsActionsSetAccountArguments(account);
    assert(accounts === null || accounts === void 0 ? void 0 : accounts[account.id], `cannot set account with account.id '${account.id}' id does not exist in database`);
    // if author.address has changed, add new community roles of author.address found in communities store
    // TODO: add test to check if roles get added
    if (account.author.address !== accounts[account.id].author.address) {
        const communities = getAccountCommunities(account, communitiesStore.getState().communities);
        account = Object.assign(Object.assign({}, account), { communities });
        // wallet.signature changes if author.address changes
        if ((_a = account.author.wallets) === null || _a === void 0 ? void 0 : _a.eth) {
            const pkcSignerWalletWithNewAuthorAddress = yield chain.getEthWalletFromPkcPrivateKey(account.signer.privateKey, account.author.address);
            // wallet is using pkc signer, redo signature with new author.address
            if (account.author.wallets.eth.address === (pkcSignerWalletWithNewAuthorAddress === null || pkcSignerWalletWithNewAuthorAddress === void 0 ? void 0 : pkcSignerWalletWithNewAuthorAddress.address)) {
                account.author.wallets = Object.assign(Object.assign({}, account.author.wallets), { eth: pkcSignerWalletWithNewAuthorAddress });
            }
        }
    }
    // use this function to serialize and update all databases
    yield accountsDatabase.addAccount(account);
    const [newAccount, newAccountNamesToAccountIds] = yield Promise.all([
        // use this function to deserialize
        accountsDatabase.getAccount(account.id),
        accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
    ]);
    const newAccounts = Object.assign(Object.assign({}, accounts), { [newAccount.id]: newAccount });
    log("accountsActions.setAccount", { account: newAccount });
    accountsStore.setState({
        accounts: newAccounts,
        accountNamesToAccountIds: newAccountNamesToAccountIds,
    });
});
export const setAccountsOrder = (newOrderedAccountNames) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds, `can't use accountsStore.accountActions before initialized`);
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
    yield accountsDatabase.accountsMetadataDatabase.setItem("accountIds", accountIds);
    accountsStore.setState({ accountIds });
});
export const importAccount = (serializedAccount) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let imported;
    try {
        imported = JSON.parse(serializedAccount);
    }
    catch (e) { }
    assert((imported === null || imported === void 0 ? void 0 : imported.account) && ((_a = imported === null || imported === void 0 ? void 0 : imported.account) === null || _a === void 0 ? void 0 : _a.id) && ((_b = imported === null || imported === void 0 ? void 0 : imported.account) === null || _b === void 0 ? void 0 : _b.name), `accountsActions.importAccount failed JSON.stringify json serializedAccount '${serializedAccount}'`);
    // add community roles already in communities store to imported account
    // TODO: add test to check if roles get added
    const communities = getAccountCommunities(imported.account, communitiesStore.getState().communities);
    // if imported.account.name already exists, add ' 2', don't overwrite
    if (accountNamesToAccountIds[imported.account.name]) {
        imported.account.name += " 2";
    }
    // Always assign a new local id so importing the same backup cannot overwrite an existing account.
    const accountToImport = Object.assign(Object.assign(Object.assign({}, accountGenerator.getDefaultAccountFields()), imported.account), { communities, id: uuid() });
    // Hydrate the imported identity once, then persist its history in bulk instead of replaying
    // every record through the single-publication write path.
    const newAccount = yield accountsDatabase.addAccount(accountToImport, {
        returnHydratedAccount: true,
    });
    assert(newAccount, `accountsActions.importAccount failed to hydrate imported account`);
    let importedHistory;
    let accountIds;
    let newAccountNamesToAccountIds;
    try {
        importedHistory = yield accountsDatabase.importAccountHistory(newAccount.id, {
            accountComments: imported.accountComments || [],
            accountVotes: imported.accountVotes || [],
            accountEdits: imported.accountEdits || [],
        });
        [accountIds, newAccountNamesToAccountIds] = yield Promise.all([
            accountsDatabase.accountsMetadataDatabase.getItem("accountIds"),
            accountsDatabase.accountsMetadataDatabase.getItem("accountNamesToAccountIds"),
        ]);
    }
    catch (error) {
        yield accountsDatabase.removeAccount(newAccount);
        void ((_d = (_c = newAccount.pkc) === null || _c === void 0 ? void 0 : _c.destroy) === null || _d === void 0 ? void 0 : _d.call(_c));
        throw error;
    }
    const { accountComments, accountVotes, accountEditsSummary } = importedHistory;
    accountsStore.setState((state) => ({
        accounts: Object.assign(Object.assign({}, state.accounts), { [newAccount.id]: newAccount }),
        accountIds,
        accountNamesToAccountIds: newAccountNamesToAccountIds,
        accountsComments: Object.assign(Object.assign({}, state.accountsComments), { [newAccount.id]: accountComments }),
        accountsCommentsIndexes: Object.assign(Object.assign({}, state.accountsCommentsIndexes), { [newAccount.id]: getAccountCommentsIndex(accountComments) }),
        commentCidsToAccountsComments: getCommentCidsToAccountsComments(Object.assign(Object.assign({}, state.accountsComments), { [newAccount.id]: accountComments })),
        accountsVotes: Object.assign(Object.assign({}, state.accountsVotes), { [newAccount.id]: accountVotes }),
        accountsEdits: Object.assign(Object.assign({}, state.accountsEdits), { [newAccount.id]: {} }),
        accountsEditsSummaries: Object.assign(Object.assign({}, state.accountsEditsSummaries), { [newAccount.id]: accountEditsSummary }),
        accountsEditsLoaded: Object.assign(Object.assign({}, state.accountsEditsLoaded), { [newAccount.id]: false }),
        // don't import/export replies to own comments, those are just cached and can be refetched
        accountsCommentsReplies: Object.assign(Object.assign({}, state.accountsCommentsReplies), { [newAccount.id]: {} }),
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
            .accountsActionsInternal.startUpdatingAccountCommentOnCommentUpdateEvents(accountComment, newAccount, accountComment.index)
            .catch((error) => log.error("accountsActions.importAccount startUpdatingAccountCommentOnCommentUpdateEvents error", {
            accountComment,
            accountCommentIndex: accountComment.index,
            importedAccount: newAccount,
            error,
        }));
    }
    // TODO: add options to only import private key, account settings, or include all account comments/votes history
});
export const exportAccount = (accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.exportAccount account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    const exportedAccountJson = yield accountsDatabase.getExportedAccountJson(account.id);
    log("accountsActions.exportAccount", { exportedAccountJson });
    return exportedAccountJson;
});
const getCommunityAddressesToExport = (communityAddressOrAddresses, account) => {
    if (Array.isArray(communityAddressOrAddresses)) {
        return communityAddressOrAddresses;
    }
    if (communityAddressOrAddresses) {
        return [communityAddressOrAddresses];
    }
    return getPkcCommunityAddresses(account.pkc);
};
export const exportCommunity = (communityAddressOrAddresses_1, ...args_1) => __awaiter(void 0, [communityAddressOrAddresses_1, ...args_1], void 0, function* (communityAddressOrAddresses, exportCommunityOptions = {}, accountName) {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountsActions before initialized`);
    assert(!exportCommunityOptions || typeof exportCommunityOptions === "object", `accountsActions.exportCommunity invalid exportCommunityOptions argument '${exportCommunityOptions}'`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.exportCommunity account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    const communityAddresses = getCommunityAddressesToExport(communityAddressOrAddresses, account);
    assert(communityAddresses.length > 0, `accountsActions.exportCommunity no community addresses to export`);
    for (const communityAddress of communityAddresses) {
        assert(communityAddress && typeof communityAddress === "string", `accountsActions.exportCommunity invalid communityAddress '${communityAddress}'`);
    }
    const communityExports = yield Promise.all([...new Set(communityAddresses)].map((communityAddress) => __awaiter(void 0, void 0, void 0, function* () {
        const community = yield createPkcCommunity(account.pkc, { address: communityAddress });
        assert(typeof (community === null || community === void 0 ? void 0 : community.export) === "function", `accountsActions.exportCommunity community.export missing for communityAddress '${communityAddress}'`);
        const exportedCommunity = yield community.export(exportCommunityOptions);
        return Object.assign(Object.assign({}, exportedCommunity), { communityAddress });
    })));
    log("accountsActions.exportCommunity", {
        communityAddresses,
        includePrivateKey: exportCommunityOptions.includePrivateKey === true,
        communityExportCount: communityExports.length,
    });
    return communityExports;
});
export const subscribe = (communityAddress, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(communityAddress && typeof communityAddress === "string", `accountsActions.subscribe invalid communityAddress '${communityAddress}'`);
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.subscribe account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    let subscriptions = account.subscriptions || [];
    if (subscriptions.includes(communityAddress)) {
        throw Error(`account '${account.id}' already subscribed to '${communityAddress}'`);
    }
    subscriptions = [...subscriptions, communityAddress];
    const updatedAccount = Object.assign(Object.assign({}, account), { subscriptions });
    // update account in db async for instant feedback speed
    accountsDatabase.addAccount(updatedAccount);
    const updatedAccounts = Object.assign(Object.assign({}, accounts), { [updatedAccount.id]: updatedAccount });
    log("accountsActions.subscribe", { account: updatedAccount, accountName, communityAddress });
    accountsStore.setState({ accounts: updatedAccounts });
});
export const unsubscribe = (communityAddress, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(communityAddress && typeof communityAddress === "string", `accountsActions.unsubscribe invalid communityAddress '${communityAddress}'`);
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.unsubscribe account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    let subscriptions = account.subscriptions || [];
    if (!subscriptions.includes(communityAddress)) {
        throw Error(`account '${account.id}' already unsubscribed from '${communityAddress}'`);
    }
    // remove communityAddress
    subscriptions = subscriptions.filter((address) => address !== communityAddress);
    const updatedAccount = Object.assign(Object.assign({}, account), { subscriptions });
    // update account in db async for instant feedback speed
    accountsDatabase.addAccount(updatedAccount);
    const updatedAccounts = Object.assign(Object.assign({}, accounts), { [updatedAccount.id]: updatedAccount });
    log("accountsActions.unsubscribe", { account: updatedAccount, accountName, communityAddress });
    accountsStore.setState({ accounts: updatedAccounts });
});
export const blockAddress = (address, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(address && typeof address === "string", `accountsActions.blockAddress invalid address '${address}'`);
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.blockAddress account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    const blockedAddresses = Object.assign({}, account.blockedAddresses);
    if (blockedAddresses[address] === true) {
        throw Error(`account '${account.id}' already blocked address '${address}'`);
    }
    blockedAddresses[address] = true;
    const updatedAccount = Object.assign(Object.assign({}, account), { blockedAddresses });
    // update account in db async for instant feedback speed
    accountsDatabase.addAccount(updatedAccount);
    const updatedAccounts = Object.assign(Object.assign({}, accounts), { [updatedAccount.id]: updatedAccount });
    log("accountsActions.blockAddress", { account: updatedAccount, accountName, address });
    accountsStore.setState({ accounts: updatedAccounts });
});
export const unblockAddress = (address, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(address && typeof address === "string", `accountsActions.unblockAddress invalid address '${address}'`);
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.unblockAddress account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    const blockedAddresses = Object.assign({}, account.blockedAddresses);
    if (!blockedAddresses[address]) {
        throw Error(`account '${account.id}' already unblocked address '${address}'`);
    }
    delete blockedAddresses[address];
    const updatedAccount = Object.assign(Object.assign({}, account), { blockedAddresses });
    // update account in db async for instant feedback speed
    accountsDatabase.addAccount(updatedAccount);
    const updatedAccounts = Object.assign(Object.assign({}, accounts), { [updatedAccount.id]: updatedAccount });
    log("accountsActions.unblockAddress", { account: updatedAccount, accountName, address });
    accountsStore.setState({ accounts: updatedAccounts });
});
export const blockCid = (cid, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(cid && typeof cid === "string", `accountsActions.blockCid invalid cid '${cid}'`);
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.blockCid account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    const blockedCids = Object.assign({}, account.blockedCids);
    if (blockedCids[cid] === true) {
        throw Error(`account '${account.id}' already blocked cid '${cid}'`);
    }
    blockedCids[cid] = true;
    const updatedAccount = Object.assign(Object.assign({}, account), { blockedCids });
    // update account in db async for instant feedback speed
    accountsDatabase.addAccount(updatedAccount);
    const updatedAccounts = Object.assign(Object.assign({}, accounts), { [updatedAccount.id]: updatedAccount });
    log("accountsActions.blockCid", { account: updatedAccount, accountName, cid });
    accountsStore.setState({ accounts: updatedAccounts });
});
export const unblockCid = (cid, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(cid && typeof cid === "string", `accountsActions.unblockCid invalid cid '${cid}'`);
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.unblockCid account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist, activeAccountId '${activeAccountId}' accountName '${accountName}'`);
    const blockedCids = Object.assign({}, account.blockedCids);
    if (!blockedCids[cid]) {
        throw Error(`account '${account.id}' already unblocked cid '${cid}'`);
    }
    delete blockedCids[cid];
    const updatedAccount = Object.assign(Object.assign({}, account), { blockedCids });
    // update account in db async for instant feedback speed
    accountsDatabase.addAccount(updatedAccount);
    const updatedAccounts = Object.assign(Object.assign({}, accounts), { [updatedAccount.id]: updatedAccount });
    log("accountsActions.unblockCid", { account: updatedAccount, accountName, cid });
    accountsStore.setState({ accounts: updatedAccounts });
});
export const publishComment = (publishCommentOptions, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { accounts, accountsComments, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
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
        .filter((comment) => comment.cid)
        // author can change his address, his previousCommentCid becomes invalid
        .filter((comment) => { var _a, _b; return ((_a = comment.author) === null || _a === void 0 ? void 0 : _a.address) === ((_b = account.author) === null || _b === void 0 ? void 0 : _b.address); });
    const previousCommentCid = (_a = accountCommentsWithCids[accountCommentsWithCids.length - 1]) === null || _a === void 0 ? void 0 : _a.cid;
    const author = Object.assign({}, account.author);
    if (previousCommentCid) {
        author.previousCommentCid = previousCommentCid;
    }
    let createCommentOptions = normalizePublicationOptionsForPkc(account.pkc, Object.assign({ timestamp: Math.floor(Date.now() / 1000), author, signer: account.signer }, publishCommentOptions));
    delete createCommentOptions.onChallenge;
    delete createCommentOptions.onChallengeVerification;
    delete createCommentOptions.onError;
    delete createCommentOptions.onPendingComment;
    delete createCommentOptions.onPublishingStateChange;
    delete createCommentOptions._onPendingCommentIndex;
    const storedCreateCommentOptions = normalizePublicationOptionsForStore(createCommentOptions);
    // make sure the options dont throw
    yield account.pkc.createComment(createCommentOptions);
    // try to get comment depth needed for custom depth flat account replies
    const depth = getAccountCommentDepth(createCommentOptions);
    // set fetching link dimensions state
    let fetchingLinkDimensionsStates;
    if (publishCommentOptions.link) {
        (_b = publishCommentOptions.onPublishingStateChange) === null || _b === void 0 ? void 0 : _b.call(publishCommentOptions, "fetching-link-dimensions");
        fetchingLinkDimensionsStates = {
            state: "publishing",
            publishingState: "fetching-link-dimensions",
        };
    }
    // save comment to db
    let accountCommentIndex = accountsComments[account.id].length;
    const publishSessionId = createPublishSession(account.id, accountCommentIndex);
    let savedOnce = false;
    const saveCreatedAccountComment = (accountComment) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (isPublishSessionAbandoned(publishSessionId)) {
            return;
        }
        const isUpdate = savedOnce;
        const session = getPublishSession(publishSessionId);
        const currentIndex = (_a = session === null || session === void 0 ? void 0 : session.currentIndex) !== null && _a !== void 0 ? _a : accountCommentIndex;
        const persistedAccountComment = addShortAddressesToAccountComment(sanitizeStoredAccountComment(accountComment));
        const liveAccountComment = addShortAddressesToAccountComment(sanitizeAccountCommentForState(accountComment));
        const liveAccountComments = accountsStore.getState().accountsComments[account.id] || [];
        if (isUpdate && !liveAccountComments[currentIndex]) {
            return;
        }
        yield accountsDatabase.addAccountComment(account.id, persistedAccountComment, isUpdate ? currentIndex : undefined);
        const currentSession = getPublishSession(publishSessionId);
        if (!currentSession || isPublishSessionAbandoned(publishSessionId)) {
            return;
        }
        const persistedIndex = currentSession.currentIndex;
        savedOnce = true;
        accountsStore.setState(({ accountsComments, accountsCommentsIndexes }) => {
            const accountComments = [...accountsComments[account.id]];
            if (isUpdate && !accountComments[persistedIndex]) {
                return {};
            }
            accountComments[persistedIndex] = Object.assign(Object.assign({}, liveAccountComment), { index: persistedIndex, accountId: account.id });
            return {
                accountsComments: Object.assign(Object.assign({}, accountsComments), { [account.id]: accountComments }),
                accountsCommentsIndexes: Object.assign(Object.assign({}, accountsCommentsIndexes), { [account.id]: getAccountCommentsIndex(accountComments) }),
            };
        });
        return persistedIndex;
    });
    let createdAccountComment = Object.assign(Object.assign({}, storedCreateCommentOptions), { depth, index: accountCommentIndex, accountId: account.id });
    createdAccountComment = addShortAddressesToAccountComment(sanitizeAccountCommentForState(createdAccountComment));
    const reportOnPendingCommentError = (error, pendingCommentIndex) => {
        log.error("accountsActions.publishComment onPendingComment callback error", {
            accountId: account.id,
            accountCommentIndex: pendingCommentIndex,
            error,
        });
    };
    const notifyPendingComment = (pendingCommentIndex, pendingComment) => {
        var _a;
        try {
            const pendingCommentSnapshot = utils.clone(pendingComment);
            void Promise.resolve((_a = publishCommentOptions.onPendingComment) === null || _a === void 0 ? void 0 : _a.call(publishCommentOptions, pendingCommentIndex, pendingCommentSnapshot)).catch((error) => reportOnPendingCommentError(error, pendingCommentIndex));
        }
        catch (error) {
            reportOnPendingCommentError(error, pendingCommentIndex);
        }
    };
    notifyPendingComment(accountCommentIndex, createdAccountComment);
    const pendingCommentIndex = yield saveCreatedAccountComment(createdAccountComment);
    if (pendingCommentIndex === undefined) {
        return createdAccountComment;
    }
    createdAccountComment = Object.assign(Object.assign({}, createdAccountComment), { index: pendingCommentIndex });
    if (pendingCommentIndex !== accountCommentIndex) {
        notifyPendingComment(pendingCommentIndex, createdAccountComment);
    }
    (_c = publishCommentOptions._onPendingCommentIndex) === null || _c === void 0 ? void 0 : _c.call(publishCommentOptions, pendingCommentIndex, createdAccountComment);
    let comment;
    (() => __awaiter(void 0, void 0, void 0, function* () {
        // fetch comment.link dimensions
        if (publishCommentOptions.link) {
            const commentLinkDimensions = yield fetchCommentLinkDimensions(publishCommentOptions.link);
            createCommentOptions = Object.assign(Object.assign({}, createCommentOptions), commentLinkDimensions);
            // save dimensions to db
            createdAccountComment = Object.assign(Object.assign({}, createdAccountComment), commentLinkDimensions);
            yield saveCreatedAccountComment(createdAccountComment);
        }
        if (isPublishSessionAbandoned(publishSessionId)) {
            return;
        }
        comment = backfillPublicationCommunityAddress(yield account.pkc.createComment(createCommentOptions), createCommentOptions);
        syncCommentClientsSnapshot(publishSessionId, account.id, comment);
        publishAndRetryFailedChallengeVerification();
        log("accountsActions.publishComment", { createCommentOptions });
    }))();
    let lastChallenge;
    let lastReportedPublishError;
    const normalizePublishError = (error) => error instanceof Error ? error : new Error(String(error));
    const getActiveSessionForComment = (activeComment) => {
        const session = getPublishSession(publishSessionId);
        if (!session ||
            isPublishSessionAbandoned(publishSessionId) ||
            session.comment !== activeComment) {
            return undefined;
        }
        return session;
    };
    const queueCleanupFailedPublishSession = (activeComment) => {
        if (!getActiveSessionForComment(activeComment))
            return;
        queueMicrotask(() => {
            if (getActiveSessionForComment(activeComment)) {
                cleanupPublishSessionOnTerminal(publishSessionId);
            }
        });
    };
    const recordPublishCommentError = (rawError, activeComment) => {
        const error = normalizePublishError(rawError);
        if (lastReportedPublishError === error) {
            return error;
        }
        lastReportedPublishError = error;
        const session = getActiveSessionForComment(activeComment);
        if (!session)
            return error;
        const currentIndex = session.currentIndex;
        accountsStore.setState(({ accountsComments }) => maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
            const previousErrors = Array.isArray(acc.errors) ? acc.errors : [];
            const errors = previousErrors[previousErrors.length - 1] === error
                ? previousErrors
                : [...previousErrors, error];
            ac[currentIndex] = Object.assign(Object.assign({}, acc), { errors, error });
        }));
        return error;
    };
    const reportActivePublishCommentError = (rawError, activeComment) => {
        var _a;
        if (!getActiveSessionForComment(activeComment))
            return;
        const error = recordPublishCommentError(rawError, activeComment);
        queueCleanupFailedPublishSession(activeComment);
        (_a = publishCommentOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommentOptions, error, activeComment);
    };
    function publishAndRetryFailedChallengeVerification() {
        return __awaiter(this, void 0, void 0, function* () {
            if (isPublishSessionAbandoned(publishSessionId)) {
                return;
            }
            const activeComment = comment;
            updatePublishSessionComment(publishSessionId, activeComment);
            activeComment.once("challenge", (challenge) => __awaiter(this, void 0, void 0, function* () {
                lastChallenge = challenge;
                publishCommentOptions.onChallenge(challenge, withPublishChallengeAnswersCompat(activeComment));
            }));
            activeComment.once("challengeverification", (challengeVerification) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                applyChallengeVerificationCommentUpdateToPublication(challengeVerification, activeComment);
                publishCommentOptions.onChallengeVerification(challengeVerification, activeComment);
                if (!challengeVerification.challengeSuccess && lastChallenge) {
                    // publish again automatically on fail
                    const timestamp = Math.floor(Date.now() / 1000);
                    createCommentOptions = Object.assign(Object.assign({}, createCommentOptions), { timestamp });
                    createdAccountComment = Object.assign(Object.assign({}, createdAccountComment), { timestamp });
                    updatePublishSessionComment(publishSessionId, undefined);
                    yield saveCreatedAccountComment(createdAccountComment);
                    if (isPublishSessionAbandoned(publishSessionId)) {
                        return;
                    }
                    comment = backfillPublicationCommunityAddress(yield account.pkc.createComment(createCommentOptions), createCommentOptions);
                    syncCommentClientsSnapshot(publishSessionId, account.id, comment);
                    lastChallenge = undefined;
                    publishAndRetryFailedChallengeVerification();
                }
                else {
                    // the challengeverification message of a comment publication should in theory send back the CID
                    // of the published comment which is needed to resolve it for replies, upvotes, etc
                    const session = getPublishSession(publishSessionId);
                    const currentIndex = (_a = session === null || session === void 0 ? void 0 : session.currentIndex) !== null && _a !== void 0 ? _a : accountCommentIndex;
                    if (!session || isPublishSessionAbandoned(publishSessionId))
                        return;
                    queueMicrotask(() => cleanupPublishSessionOnTerminal(publishSessionId));
                    if ((_b = challengeVerification === null || challengeVerification === void 0 ? void 0 : challengeVerification.commentUpdate) === null || _b === void 0 ? void 0 : _b.cid) {
                        const persistedCommentWithCid = addShortAddressesToAccountComment(sanitizeStoredAccountComment(normalizePublicationOptionsForStore(comment)));
                        const liveCommentWithCid = addShortAddressesToAccountComment(sanitizeAccountCommentForState(normalizePublicationOptionsForStore(comment)));
                        delete persistedCommentWithCid.clients;
                        delete persistedCommentWithCid.publishingState;
                        delete persistedCommentWithCid.error;
                        delete persistedCommentWithCid.errors;
                        delete liveCommentWithCid.clients;
                        delete liveCommentWithCid.publishingState;
                        delete liveCommentWithCid.error;
                        delete liveCommentWithCid.errors;
                        yield accountsDatabase.addAccountComment(account.id, persistedCommentWithCid, currentIndex);
                        accountsStore.setState(({ accountsComments, accountsCommentsIndexes, commentCidsToAccountsComments }) => {
                            var _a;
                            const updatedAccountComments = [...accountsComments[account.id]];
                            const updatedAccountComment = Object.assign(Object.assign({}, liveCommentWithCid), { index: currentIndex, accountId: account.id });
                            updatedAccountComments[currentIndex] = updatedAccountComment;
                            return {
                                accountsComments: Object.assign(Object.assign({}, accountsComments), { [account.id]: updatedAccountComments }),
                                accountsCommentsIndexes: Object.assign(Object.assign({}, accountsCommentsIndexes), { [account.id]: getAccountCommentsIndex(updatedAccountComments) }),
                                commentCidsToAccountsComments: Object.assign(Object.assign({}, commentCidsToAccountsComments), { [(_a = challengeVerification === null || challengeVerification === void 0 ? void 0 : challengeVerification.commentUpdate) === null || _a === void 0 ? void 0 : _a.cid]: {
                                        accountId: account.id,
                                        accountCommentIndex: currentIndex,
                                    } }),
                            };
                        });
                        // clone the comment or it bugs publishing callbacks
                        const updatingComment = yield account.pkc.createComment(normalizePublicationOptionsForPkc(account.pkc, Object.assign({}, comment)));
                        applyChallengeVerificationCommentUpdateToPublication(challengeVerification, updatingComment);
                        accountsActionsInternal
                            .startUpdatingAccountCommentOnCommentUpdateEvents(updatingComment, account, currentIndex)
                            .catch((error) => log.error("accountsActions.publishComment startUpdatingAccountCommentOnCommentUpdateEvents error", { comment, account, accountCommentIndex, error }));
                    }
                }
            }));
            activeComment.on("error", (error) => {
                reportActivePublishCommentError(error, activeComment);
            });
            activeComment.on("statechange", (state) => {
                const session = getActiveSessionForComment(activeComment);
                if (!session)
                    return;
                const currentIndex = session.currentIndex;
                let hasTerminalFailedState = false;
                accountsStore.setState(({ accountsComments }) => maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
                    const nextAccountComment = Object.assign(Object.assign({}, acc), { state });
                    ac[currentIndex] = nextAccountComment;
                    hasTerminalFailedState =
                        nextAccountComment.state === "stopped" &&
                            nextAccountComment.publishingState === "failed";
                }));
                if (hasTerminalFailedState) {
                    queueCleanupFailedPublishSession(activeComment);
                }
            });
            activeComment.on("publishingstatechange", (publishingState) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const session = getActiveSessionForComment(activeComment);
                if (!session)
                    return;
                const currentIndex = session.currentIndex;
                let hasTerminalFailedState = false;
                accountsStore.setState(({ accountsComments }) => maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
                    const nextAccountComment = Object.assign(Object.assign({}, acc), { publishingState });
                    ac[currentIndex] = nextAccountComment;
                    hasTerminalFailedState =
                        nextAccountComment.state === "stopped" &&
                            nextAccountComment.publishingState === "failed";
                }));
                if (hasTerminalFailedState) {
                    queueCleanupFailedPublishSession(activeComment);
                }
                (_a = publishCommentOptions.onPublishingStateChange) === null || _a === void 0 ? void 0 : _a.call(publishCommentOptions, publishingState);
            }));
            // set clients on account comment so the frontend can display it, dont persist in db because a reload cancels publishing
            utils.clientsOnStateChange(activeComment.clients, (clientState, clientType, clientUrl, chainTicker) => {
                const session = getActiveSessionForComment(activeComment);
                if (!session)
                    return;
                const currentIndex = session.currentIndex;
                accountsStore.setState(({ accountsComments }) => maybeUpdateAccountComment(accountsComments, account.id, currentIndex, (ac, acc) => {
                    const clients = getClientsSnapshotForState(activeComment.clients) || {};
                    const client = { state: clientState };
                    if (chainTicker) {
                        const chainProviders = Object.assign(Object.assign({}, clients[clientType][chainTicker]), { [clientUrl]: client });
                        clients[clientType] = Object.assign(Object.assign({}, clients[clientType]), { [chainTicker]: chainProviders });
                    }
                    else {
                        clients[clientType] = Object.assign(Object.assign({}, clients[clientType]), { [clientUrl]: client });
                    }
                    ac[currentIndex] = Object.assign(Object.assign({}, acc), { clients });
                }));
            });
            listeners.push(activeComment);
            try {
                // publish will resolve after the challenge request
                // if it fails before, like failing to resolve ENS, we can emit the error
                yield activeComment.publish();
            }
            catch (error) {
                reportActivePublishCommentError(error, activeComment);
            }
        });
    }
    return createdAccountComment;
});
export const deleteComment = (commentCidOrAccountCommentIndex, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountsComments, accountNamesToAccountIds, activeAccountId, commentCidsToAccountsComments, } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    assert(account === null || account === void 0 ? void 0 : account.id, `accountsActions.deleteComment account.id '${account === null || account === void 0 ? void 0 : account.id}' doesn't exist`);
    const accountComments = accountsComments[account.id] || [];
    assert(accountComments.length > 0, `accountsActions.deleteComment no comments for account`);
    let accountCommentIndex;
    if (typeof commentCidOrAccountCommentIndex === "number") {
        accountCommentIndex = commentCidOrAccountCommentIndex;
    }
    else {
        const mapping = commentCidsToAccountsComments[commentCidOrAccountCommentIndex];
        assert(mapping && mapping.accountId === account.id, `accountsActions.deleteComment cid '${commentCidOrAccountCommentIndex}' not found for account`);
        accountCommentIndex = mapping.accountCommentIndex;
    }
    assert(accountCommentIndex >= 0 && accountCommentIndex < accountComments.length, `accountsActions.deleteComment index '${accountCommentIndex}' out of range`);
    abandonAndStopPublishSession(account.id, accountCommentIndex);
    shiftPublishSessionIndicesAfterDelete(account.id, accountCommentIndex);
    const spliced = [...accountComments];
    spliced.splice(accountCommentIndex, 1);
    const reindexed = spliced.map((c, i) => (Object.assign(Object.assign({}, c), { index: i, accountId: account.id })));
    const newAccountsComments = Object.assign(Object.assign({}, accountsComments), { [account.id]: reindexed });
    const newCommentCidsToAccountsComments = getCommentCidsToAccountsComments(newAccountsComments);
    accountsStore.setState(({ accountsCommentsIndexes }) => ({
        accountsComments: newAccountsComments,
        accountsCommentsIndexes: Object.assign(Object.assign({}, accountsCommentsIndexes), { [account.id]: getAccountCommentsIndex(reindexed) }),
        commentCidsToAccountsComments: newCommentCidsToAccountsComments,
    }));
    yield accountsDatabase.deleteAccountComment(account.id, accountCommentIndex);
    log("accountsActions.deleteComment", { accountId: account.id, accountCommentIndex });
});
export const publishVote = (publishVoteOptions, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
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
    let createVoteOptions = normalizePublicationOptionsForPkc(account.pkc, Object.assign({ timestamp: Math.floor(Date.now() / 1000), author: account.author, signer: account.signer }, publishVoteOptions));
    delete createVoteOptions.onChallenge;
    delete createVoteOptions.onChallengeVerification;
    delete createVoteOptions.onError;
    delete createVoteOptions.onPublishingStateChange;
    const accountsState = accountsStore.getState();
    const accountCommentInfo = accountsState.commentCidsToAccountsComments[createVoteOptions.commentCid];
    const accountComment = accountCommentInfo
        ? (_a = accountsState.accountsComments[accountCommentInfo.accountId]) === null || _a === void 0 ? void 0 : _a[accountCommentInfo.accountCommentIndex]
        : undefined;
    const storedCreateVoteOptions = addOptimisticVoteMetadata(normalizePublicationOptionsForStore(createVoteOptions), (_b = accountsState.accountsVotes[account.id]) === null || _b === void 0 ? void 0 : _b[createVoteOptions.commentCid], getFreshestLoadedComment(createVoteOptions.commentCid, accountComment));
    let vote = backfillPublicationCommunityAddress(yield account.pkc.createVote(createVoteOptions), createVoteOptions);
    let lastChallenge;
    const publishAndRetryFailedChallengeVerification = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        vote.once("challenge", (challenge) => __awaiter(void 0, void 0, void 0, function* () {
            lastChallenge = challenge;
            publishVoteOptions.onChallenge(challenge, withPublishChallengeAnswersCompat(vote));
        }));
        vote.once("challengeverification", (challengeVerification) => __awaiter(void 0, void 0, void 0, function* () {
            publishVoteOptions.onChallengeVerification(challengeVerification, vote);
            if (!challengeVerification.challengeSuccess && lastChallenge) {
                // publish again automatically on fail
                createVoteOptions = Object.assign(Object.assign({}, createVoteOptions), { timestamp: Math.floor(Date.now() / 1000) });
                vote = backfillPublicationCommunityAddress(yield account.pkc.createVote(createVoteOptions), createVoteOptions);
                lastChallenge = undefined;
                publishAndRetryFailedChallengeVerification();
            }
        }));
        vote.on("error", (error) => { var _a; return (_a = publishVoteOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishVoteOptions, error, vote); });
        // TODO: add publishingState to account votes
        vote.on("publishingstatechange", (publishingState) => { var _a; return (_a = publishVoteOptions.onPublishingStateChange) === null || _a === void 0 ? void 0 : _a.call(publishVoteOptions, publishingState); });
        listeners.push(vote);
        try {
            // publish will resolve after the challenge request
            // if it fails before, like failing to resolve ENS, we can emit the error
            yield vote.publish();
        }
        catch (error) {
            (_a = publishVoteOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishVoteOptions, error, vote);
        }
    });
    publishAndRetryFailedChallengeVerification();
    yield accountsDatabase.addAccountVote(account.id, storedCreateVoteOptions);
    log("accountsActions.publishVote", { createVoteOptions });
    accountsStore.setState(({ accountsVotes }) => ({
        accountsVotes: Object.assign(Object.assign({}, accountsVotes), { [account.id]: Object.assign(Object.assign({}, accountsVotes[account.id]), { [storedCreateVoteOptions.commentCid]: Object.assign(Object.assign({}, storedCreateVoteOptions), { signer: undefined, author: undefined }) }) }),
    }));
});
export const publishCommentEdit = (publishCommentEditOptions, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
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
    let createCommentEditOptions = normalizePublicationOptionsForPkc(account.pkc, Object.assign({ timestamp: Math.floor(Date.now() / 1000), author: account.author, signer: account.signer }, publishCommentEditOptions));
    delete createCommentEditOptions.onChallenge;
    delete createCommentEditOptions.onChallengeVerification;
    delete createCommentEditOptions.onError;
    delete createCommentEditOptions.onPublishingStateChange;
    const storedCreateCommentEditOptions = Object.assign(Object.assign({}, normalizePublicationOptionsForStore(createCommentEditOptions)), { clientId: uuid() });
    const storedCommentEdit = sanitizeStoredAccountEdit(storedCreateCommentEditOptions);
    let commentEdit = backfillPublicationCommunityAddress(yield account.pkc.createCommentEdit(createCommentEditOptions), createCommentEditOptions);
    let lastChallenge;
    let challengeSucceeded = false;
    let rollbackPendingEditPromise;
    const rollbackStoredCommentEdit = () => {
        if (!rollbackPendingEditPromise && !challengeSucceeded) {
            rollbackPendingEditPromise = Promise.all([
                accountsDatabase.deleteAccountEdit(account.id, storedCommentEdit),
                Promise.resolve(accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
                    const nextState = removeStoredAccountEditSummaryFromState(accountsEditsSummaries, accountsEdits, account.id, storedCommentEdit);
                    Object.assign(nextState, removeStoredAccountEditFromState(accountsEdits, account.id, storedCommentEdit));
                    return nextState;
                })),
            ]).then(() => { });
        }
        return rollbackPendingEditPromise;
    };
    yield accountsDatabase.addAccountEdit(account.id, storedCreateCommentEditOptions);
    log("accountsActions.publishCommentEdit", { createCommentEditOptions });
    accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
        const nextState = addStoredAccountEditSummaryToState(accountsEditsSummaries, account.id, storedCommentEdit);
        Object.assign(nextState, addStoredAccountEditToState(accountsEdits, account.id, storedCommentEdit));
        return nextState;
    });
    const publishAndRetryFailedChallengeVerification = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        commentEdit.once("challenge", (challenge) => __awaiter(void 0, void 0, void 0, function* () {
            lastChallenge = challenge;
            publishCommentEditOptions.onChallenge(challenge, withPublishChallengeAnswersCompat(commentEdit));
        }));
        commentEdit.once("challengeverification", (challengeVerification) => __awaiter(void 0, void 0, void 0, function* () {
            publishCommentEditOptions.onChallengeVerification(challengeVerification, commentEdit);
            if (challengeVerification.challengeSuccess) {
                challengeSucceeded = true;
            }
            if (hasTerminalChallengeVerificationError(challengeVerification)) {
                lastChallenge = undefined;
                yield rollbackStoredCommentEdit();
                return;
            }
            if (!challengeVerification.challengeSuccess && lastChallenge) {
                // publish again automatically on fail
                createCommentEditOptions = Object.assign(Object.assign({}, createCommentEditOptions), { timestamp: Math.floor(Date.now() / 1000) });
                commentEdit = backfillPublicationCommunityAddress(yield account.pkc.createCommentEdit(createCommentEditOptions), createCommentEditOptions);
                lastChallenge = undefined;
                publishAndRetryFailedChallengeVerification();
            }
        }));
        commentEdit.on("error", (error) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            yield rollbackStoredCommentEdit();
            (_a = publishCommentEditOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommentEditOptions, error, commentEdit);
        }));
        // TODO: add publishingState to account edits
        commentEdit.on("publishingstatechange", (publishingState) => { var _a; return (_a = publishCommentEditOptions.onPublishingStateChange) === null || _a === void 0 ? void 0 : _a.call(publishCommentEditOptions, publishingState); });
        listeners.push(commentEdit);
        try {
            // publish will resolve after the challenge request
            // if it fails before, like failing to resolve ENS, we can emit the error
            yield commentEdit.publish();
        }
        catch (error) {
            yield rollbackStoredCommentEdit();
            (_a = publishCommentEditOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommentEditOptions, error, commentEdit);
        }
    });
    publishAndRetryFailedChallengeVerification();
});
export const publishCommentModeration = (publishCommentModerationOptions, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
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
    let createCommentModerationOptions = normalizePublicationOptionsForPkc(account.pkc, Object.assign({ timestamp: Math.floor(Date.now() / 1000), author: account.author, signer: account.signer }, publishCommentModerationOptions));
    delete createCommentModerationOptions.onChallenge;
    delete createCommentModerationOptions.onChallengeVerification;
    delete createCommentModerationOptions.onError;
    delete createCommentModerationOptions.onPublishingStateChange;
    const storedCreateCommentModerationOptions = Object.assign(Object.assign({}, normalizePublicationOptionsForStore(createCommentModerationOptions)), { clientId: uuid() });
    const storedCommentModeration = sanitizeStoredAccountEdit(storedCreateCommentModerationOptions);
    let commentModeration = backfillPublicationCommunityAddress(yield account.pkc.createCommentModeration(createCommentModerationOptions), createCommentModerationOptions);
    let lastChallenge;
    let challengeSucceeded = false;
    let storedCommentModerationAdded = false;
    let rollbackStoredCommentModerationRequested = false;
    let rollbackPendingEditPromise;
    const rollbackStoredCommentModeration = () => {
        rollbackStoredCommentModerationRequested = true;
        if (!storedCommentModerationAdded) {
            return Promise.resolve();
        }
        if (!rollbackPendingEditPromise && !challengeSucceeded) {
            rollbackPendingEditPromise = Promise.all([
                accountsDatabase.deleteAccountEdit(account.id, storedCommentModeration),
                Promise.resolve(accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
                    const nextState = removeStoredAccountEditSummaryFromState(accountsEditsSummaries, accountsEdits, account.id, storedCommentModeration);
                    Object.assign(nextState, removeStoredAccountEditFromState(accountsEdits, account.id, storedCommentModeration));
                    return nextState;
                })),
            ]).then(() => { });
        }
        return rollbackPendingEditPromise || Promise.resolve();
    };
    const publishAndRetryFailedChallengeVerification = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        commentModeration.once("challenge", (challenge) => __awaiter(void 0, void 0, void 0, function* () {
            lastChallenge = challenge;
            publishCommentModerationOptions.onChallenge(challenge, withPublishChallengeAnswersCompat(commentModeration));
        }));
        commentModeration.once("challengeverification", (challengeVerification) => __awaiter(void 0, void 0, void 0, function* () {
            publishCommentModerationOptions.onChallengeVerification(challengeVerification, commentModeration);
            if (challengeVerification.challengeSuccess) {
                challengeSucceeded = true;
            }
            if (hasTerminalChallengeVerificationError(challengeVerification)) {
                lastChallenge = undefined;
                yield rollbackStoredCommentModeration();
                return;
            }
            if (!challengeVerification.challengeSuccess && lastChallenge) {
                // publish again automatically on fail
                createCommentModerationOptions = Object.assign(Object.assign({}, createCommentModerationOptions), { timestamp: Math.floor(Date.now() / 1000) });
                commentModeration = backfillPublicationCommunityAddress(yield account.pkc.createCommentModeration(createCommentModerationOptions), createCommentModerationOptions);
                lastChallenge = undefined;
                publishAndRetryFailedChallengeVerification();
            }
        }));
        commentModeration.on("error", (error) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            yield rollbackStoredCommentModeration();
            (_a = publishCommentModerationOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommentModerationOptions, error, commentModeration);
        }));
        // TODO: add publishingState to account edits
        commentModeration.on("publishingstatechange", (publishingState) => { var _a; return (_a = publishCommentModerationOptions.onPublishingStateChange) === null || _a === void 0 ? void 0 : _a.call(publishCommentModerationOptions, publishingState); });
        listeners.push(commentModeration);
        try {
            // publish will resolve after the challenge request
            // if it fails before, like failing to resolve ENS, we can emit the error
            yield commentModeration.publish();
        }
        catch (error) {
            yield rollbackStoredCommentModeration();
            (_a = publishCommentModerationOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommentModerationOptions, error, commentModeration);
        }
    });
    publishAndRetryFailedChallengeVerification();
    yield accountsDatabase.addAccountEdit(account.id, storedCreateCommentModerationOptions);
    log("accountsActions.publishCommentModeration", { createCommentModerationOptions });
    accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
        const nextState = addStoredAccountEditSummaryToState(accountsEditsSummaries, account.id, storedCommentModeration);
        Object.assign(nextState, addStoredAccountEditToState(accountsEdits, account.id, storedCommentModeration));
        return nextState;
    });
    storedCommentModerationAdded = true;
    if (rollbackStoredCommentModerationRequested) {
        yield rollbackStoredCommentModeration();
    }
});
export const publishCommunityEdit = (communityAddress, publishCommunityEditOptions, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountActions before initialized`);
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
    const communityEditOptions = Object.assign({}, publishCommunityEditOptions);
    delete communityEditOptions.onChallenge;
    delete communityEditOptions.onChallengeVerification;
    delete communityEditOptions.onError;
    delete communityEditOptions.onPublishingStateChange;
    let createCommunityEditOptions = normalizeCommunityEditOptionsForPkc(account.pkc, {
        timestamp: Math.floor(Date.now() / 1000),
        author: account.author,
        signer: account.signer,
        // not possible to edit community.address over pubsub, only locally
        communityAddress,
        communityEdit: communityEditOptions,
    });
    const storedCreateCommunityEditOptions = Object.assign(Object.assign({}, normalizePublicationOptionsForStore(createCommunityEditOptions)), { clientId: uuid() });
    const storedCommunityEdit = sanitizeStoredAccountEdit(storedCreateCommunityEditOptions);
    let challengeSucceeded = false;
    let rollbackPendingEditPromise;
    const rollbackStoredCommunityEdit = () => {
        if (!rollbackPendingEditPromise && !challengeSucceeded) {
            rollbackPendingEditPromise = Promise.all([
                accountsDatabase.deleteAccountEdit(account.id, storedCommunityEdit),
                Promise.resolve(accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
                    const nextState = removeStoredAccountEditSummaryFromState(accountsEditsSummaries, accountsEdits, account.id, storedCommunityEdit);
                    Object.assign(nextState, removeStoredAccountEditFromState(accountsEdits, account.id, storedCommunityEdit));
                    return nextState;
                })),
            ]).then(() => { });
        }
        return rollbackPendingEditPromise;
    };
    const storePublishedCommunityEdit = () => __awaiter(void 0, void 0, void 0, function* () {
        yield accountsDatabase.addAccountEdit(account.id, storedCreateCommunityEditOptions);
        accountsStore.setState(({ accountsEdits, accountsEditsSummaries }) => {
            const nextState = addStoredAccountEditSummaryToState(accountsEditsSummaries, account.id, storedCommunityEdit);
            Object.assign(nextState, addStoredAccountEditToState(accountsEdits, account.id, storedCommunityEdit));
            return nextState;
        });
    });
    // account is the owner of the community and can edit it locally, no need to publish
    if (accountOwnsCommunityLocally(account, communityAddress)) {
        yield communitiesStore
            .getState()
            .editCommunity(communityAddress, communityEditOptions, account);
        yield storePublishedCommunityEdit();
        // create fake success challenge verification for consistent behavior with remote community edit
        publishCommunityEditOptions.onChallengeVerification({ challengeSuccess: true });
        (_a = publishCommunityEditOptions.onPublishingStateChange) === null || _a === void 0 ? void 0 : _a.call(publishCommunityEditOptions, "succeeded");
        return;
    }
    assert(!publishCommunityEditOptions.address ||
        publishCommunityEditOptions.address === communityAddress, `accountsActions.publishCommunityEdit can't edit address of a remote community`);
    let communityEdit = backfillPublicationCommunityAddress(yield createPkcCommunityEdit(account.pkc, createCommunityEditOptions), createCommunityEditOptions);
    let lastChallenge;
    const publishAndRetryFailedChallengeVerification = () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        communityEdit.once("challenge", (challenge) => __awaiter(void 0, void 0, void 0, function* () {
            lastChallenge = challenge;
            publishCommunityEditOptions.onChallenge(challenge, withPublishChallengeAnswersCompat(communityEdit));
        }));
        communityEdit.once("challengeverification", (challengeVerification) => __awaiter(void 0, void 0, void 0, function* () {
            publishCommunityEditOptions.onChallengeVerification(challengeVerification, communityEdit);
            if (challengeVerification.challengeSuccess) {
                challengeSucceeded = true;
            }
            if (hasTerminalChallengeVerificationError(challengeVerification)) {
                lastChallenge = undefined;
                yield rollbackStoredCommunityEdit();
                return;
            }
            if (!challengeVerification.challengeSuccess && lastChallenge) {
                // publish again automatically on fail
                createCommunityEditOptions = Object.assign(Object.assign({}, createCommunityEditOptions), { timestamp: Math.floor(Date.now() / 1000) });
                communityEdit = backfillPublicationCommunityAddress(yield createPkcCommunityEdit(account.pkc, createCommunityEditOptions), createCommunityEditOptions);
                lastChallenge = undefined;
                publishAndRetryFailedChallengeVerification();
            }
        }));
        communityEdit.on("error", (error) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            yield rollbackStoredCommunityEdit();
            (_a = publishCommunityEditOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommunityEditOptions, error, communityEdit);
        }));
        // TODO: add publishingState to account edits
        communityEdit.on("publishingstatechange", (publishingState) => { var _a; return (_a = publishCommunityEditOptions.onPublishingStateChange) === null || _a === void 0 ? void 0 : _a.call(publishCommunityEditOptions, publishingState); });
        listeners.push(communityEdit);
        try {
            // publish will resolve after the challenge request
            // if it fails before, like failing to resolve ENS, we can emit the error
            yield communityEdit.publish();
        }
        catch (error) {
            yield rollbackStoredCommunityEdit();
            (_a = publishCommunityEditOptions.onError) === null || _a === void 0 ? void 0 : _a.call(publishCommunityEditOptions, error, communityEdit);
        }
    });
    yield storePublishedCommunityEdit();
    publishAndRetryFailedChallengeVerification();
    log("accountsActions.publishCommunityEdit", { createCommunityEditOptions });
});
export const createCommunity = (createCommunityOptions, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountsActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    const community = yield communitiesStore
        .getState()
        .createCommunity(createCommunityOptions, account);
    log("accountsActions.createCommunity", { createCommunityOptions, community });
    return community;
});
export const deleteCommunity = (communityAddress, accountName) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts, accountNamesToAccountIds, activeAccountId } = accountsStore.getState();
    assert(accounts && accountNamesToAccountIds && activeAccountId, `can't use accountsStore.accountsActions before initialized`);
    let account = accounts[activeAccountId];
    if (accountName) {
        const accountId = accountNamesToAccountIds[accountName];
        account = accounts[accountId];
    }
    yield communitiesStore.getState().deleteCommunity(communityAddress, account);
    log("accountsActions.deleteCommunity", { communityAddress });
});
//# sourceMappingURL=accounts-actions.js.map