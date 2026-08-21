import assert from "assert";
import { assertCommunityRef } from "./community-ref.js";
const toString = (value) => {
    if (typeof value === "string") {
        return value;
    }
    try {
        const string = JSON.stringify(value);
        return string;
    }
    catch (_a) { }
    return value;
};
const getPublicationCommunityAddress = (options) => (options === null || options === void 0 ? void 0 : options.communityAddress) || (options === null || options === void 0 ? void 0 : options.communityAddress);
const getAccountProtocolClient = (account) => (account === null || account === void 0 ? void 0 : account.pkc) || (account === null || account === void 0 ? void 0 : account.pkc);
const validateAccountsActionsPublishCommentArguments = ({ publishCommentOptions, accountName, account, }) => {
    assert(!accountName || typeof accountName === "string", `publishComment accountName '${accountName}' not a string`);
    assert(accountName !== "", `publishComment accountName argument is empty string`);
    assert(!accountName || account, `publishComment no account with name '${accountName}' in accountsStore`);
    assert(publishCommentOptions && typeof publishCommentOptions === "object", "publishComment publishCommentOptions not an object");
    assert(typeof publishCommentOptions.onChallenge === "function", "publishComment publishCommentOptions.onChallenge not a function");
    assert(typeof publishCommentOptions.onChallengeVerification === "function", "publishComment publishCommentOptions.onChallengeVerification not a function");
    assert(!publishCommentOptions.onError || typeof publishCommentOptions.onError === "function", "publishComment publishCommentOptions.onError not a function");
    assert(publishCommentOptions.onPendingComment == null ||
        typeof publishCommentOptions.onPendingComment === "function", "publishComment publishCommentOptions.onPendingComment not a function");
    assert(typeof getPublicationCommunityAddress(publishCommentOptions) === "string", "publishComment publishCommentOptions.communityAddress/communityAddress not a string");
    assert(!publishCommentOptions.parentCid || typeof publishCommentOptions.parentCid === "string", "publishComment publishCommentOptions.parentCid not a string");
    assert(!publishCommentOptions.timestamp || typeof publishCommentOptions.timestamp === "number", "publishComment publishCommentOptions.timestamp is not a number");
    // validate content
    assert(!publishCommentOptions.content || typeof publishCommentOptions.content === "string", "publishComment publishCommentOptions.content not a string");
    assert(publishCommentOptions.content !== "", "publishComment publishCommentOptions.content is an empty string");
    assert(!publishCommentOptions.link || typeof publishCommentOptions.link === "string", "publishComment publishCommentOptions.link not a string");
    assert(publishCommentOptions.link !== "", "publishComment publishCommentOptions.link is an empty string");
    assert(!publishCommentOptions.title || typeof publishCommentOptions.title === "string", "publishComment publishCommentOptions.title not a string");
    assert(publishCommentOptions.title !== "", "publishComment publishCommentOptions.title is an empty string");
};
const validateAccountsActionsPublishVoteArguments = ({ publishVoteOptions, accountName, account, }) => {
    assert(!accountName || typeof accountName === "string", `publishVote accountName '${accountName}' not a string`);
    assert(accountName !== "", `publishVote accountName argument is empty string`);
    assert(!accountName || account, `publishVote no account with name '${accountName}' in accountsStore`);
    assert(publishVoteOptions && typeof publishVoteOptions === "object", "publishVote publishVoteOptions not an object");
    assert(typeof publishVoteOptions.onChallenge === "function", "publishVote publishVoteOptions.onChallenge not a function");
    assert(typeof publishVoteOptions.onChallengeVerification === "function", "publishVote publishVoteOptions.onChallengeVerification not a function");
    assert(!publishVoteOptions.onError || typeof publishVoteOptions.onError === "function", "publishVote publishVoteOptions.onError not a function");
    assert(typeof getPublicationCommunityAddress(publishVoteOptions) === "string", "publishVote publishVoteOptions.communityAddress/communityAddress not a string");
    assert(typeof publishVoteOptions.commentCid === "string", "publishVote publishVoteOptions.commentCid not a string");
    assert(publishVoteOptions.vote === 1 ||
        publishVoteOptions.vote === 0 ||
        publishVoteOptions.vote === -1, "publishVote publishVoteOptions.vote not 1, 0 or -1");
    assert(!publishVoteOptions.timestamp || typeof publishVoteOptions.timestamp === "number", "publishVote publishVoteOptions.timestamp is not a number");
};
const validateAccountsActionsPublishCommentEditArguments = ({ publishCommentEditOptions, accountName, account, }) => {
    assert(!accountName || typeof accountName === "string", `publishCommentEdit accountName '${accountName}' not a string`);
    assert(accountName !== "", `publishCommentEdit accountName argument is empty string`);
    assert(!accountName || account, `publishCommentEdit no account with name '${accountName}' in accountsStore`);
    assert(publishCommentEditOptions && typeof publishCommentEditOptions === "object", "publishCommentEdit publishCommentEditOptions not an object");
    assert(typeof publishCommentEditOptions.onChallenge === "function", "publishCommentEdit publishCommentEditOptions.onChallenge not a function");
    assert(typeof publishCommentEditOptions.onChallengeVerification === "function", "publishCommentEdit publishCommentEditOptions.onChallengeVerification not a function");
    assert(!publishCommentEditOptions.onError || typeof publishCommentEditOptions.onError === "function", "publishCommentEditOptions publishCommentEditOptions.onError not a function");
    assert(typeof getPublicationCommunityAddress(publishCommentEditOptions) === "string", "publishCommentEdit publishCommentEditOptions.communityAddress/communityAddress not a string");
    assert(typeof publishCommentEditOptions.commentCid === "string", "publishCommentEdit publishCommentEditOptions.commentCid not a string");
    assert(!publishCommentEditOptions.timestamp || typeof publishCommentEditOptions.timestamp === "number", "publishCommentEdit publishCommentEditOptions.timestamp is not a number");
};
const validateAccountsActionsPublishCommentModerationArguments = ({ publishCommentModerationOptions, accountName, account, }) => {
    assert(!accountName || typeof accountName === "string", `publishCommentModeration accountName '${accountName}' not a string`);
    assert(accountName !== "", `publishCommentModeration accountName argument is empty string`);
    assert(!accountName || account, `publishCommentModeration no account with name '${accountName}' in accountsStore`);
    assert(publishCommentModerationOptions && typeof publishCommentModerationOptions === "object", "publishCommentModeration publishCommentModerationOptions not an object");
    assert(typeof publishCommentModerationOptions.onChallenge === "function", "publishCommentModeration publishCommentModerationOptions.onChallenge not a function");
    assert(typeof publishCommentModerationOptions.onChallengeVerification === "function", "publishCommentModeration publishCommentModerationOptions.onChallengeVerification not a function");
    assert(!publishCommentModerationOptions.onError ||
        typeof publishCommentModerationOptions.onError === "function", "publishCommentModerationOptions publishCommentModerationOptions.onError not a function");
    assert(typeof getPublicationCommunityAddress(publishCommentModerationOptions) === "string", "publishCommentModeration publishCommentModerationOptions.communityAddress/communityAddress not a string");
    assert(typeof publishCommentModerationOptions.commentCid === "string", "publishCommentModeration publishCommentModerationOptions.commentCid not a string");
    assert(!publishCommentModerationOptions.timestamp ||
        typeof publishCommentModerationOptions.timestamp === "number", "publishCommentModeration publishCommentModerationOptions.timestamp is not a number");
    assert(publishCommentModerationOptions.commentModeration &&
        typeof publishCommentModerationOptions.commentModeration === "object", "publishCommentModeration publishCommentModerationOptions.commentModeration is not an object");
};
const validateAccountsActionsPublishCommunityEditArguments = ({ communityAddress, publishCommunityEditOptions, accountName, account, }) => {
    assert(!accountName || typeof accountName === "string", `publishCommunityEdit accountName '${accountName}' not a string`);
    assert(accountName !== "", `publishCommunityEdit accountName argument is empty string`);
    assert(!accountName || account, `publishCommunityEdit no account with name '${accountName}' in accountsStore`);
    assert(publishCommunityEditOptions && typeof publishCommunityEditOptions === "object", "publishCommunityEdit publishCommunityEditOptions not an object");
    assert(typeof publishCommunityEditOptions.onChallenge === "function", "publishCommunityEdit publishCommunityEditOptions.onChallenge not a function");
    assert(typeof publishCommunityEditOptions.onChallengeVerification === "function", "publishCommunityEdit publishCommunityEditOptions.onChallengeVerification not a function");
    assert(!publishCommunityEditOptions.onError ||
        typeof publishCommunityEditOptions.onError === "function", "publishCommunityEdit publishCommunityEditOptions.onError not a function");
    assert(communityAddress !== "", `publishCommunityEdit communityAddress argument is empty string`);
    assert(typeof communityAddress === "string", "publishCommunityEdit communityAddress not a string");
    assert(!publishCommunityEditOptions.timestamp ||
        typeof publishCommunityEditOptions.timestamp === "number", "publishCommunityEdit publishCommunityEditOptions.timestamp is not a number");
};
const validateAccountsActionsExportAccountArguments = (accountName) => {
    assert(typeof accountName === "string", `exportAccount accountName '${accountName}' not a string`);
    assert(accountName !== "", `exportAccount accountName argument is empty string`);
};
const validateAccountsActionsSetAccountsOrderArguments = (newOrderedAccountNames, accountNames) => {
    assert(JSON.stringify([...accountNames].sort()) === JSON.stringify([...newOrderedAccountNames].sort()), `previous account names '${accountNames} contain different account names than argument newOrderedAccountNames '${newOrderedAccountNames}'`);
};
const validateAccountsActionsSetAccountArguments = (account) => {
    assert(account && typeof account === "object", `setAccount account '${account}' not an object`);
    assert(typeof account.name === "string", `setAccount account.name '${account.name}' not a string`);
    assert(account.name !== "", `setAccount account.name is empty string`);
    assert(typeof account.id === "string", `setAccount account.id '${account.id}' not a string`);
    assert(account.id !== "", `setAccount account.id is empty string`);
};
const validateAccountsActionsSetActiveAccountArguments = (accountName) => {
    assert(typeof accountName === "string", `setActiveAccountName accountName '${accountName}' not a string`);
    assert(accountName !== "", `setActiveAccountName accountName argument is empty string`);
};
const validateAccountsDatabaseGetAccountsArguments = (accountIds) => {
    assert(Array.isArray(accountIds), `accountsDatabase.getAccounts accountIds '${accountIds}' not an array`);
    assert(accountIds.length > 0, `accountsDatabase.getAccounts accountIds array is empty`);
    for (const accountId of accountIds) {
        assert(typeof accountId === "string", `accountsDatabase.getAccountsaccountIds '${accountIds}' accountId '${accountId}' not a string`);
        assert(accountId !== "", `accountsDatabase.getAccounts accountIds '${accountIds}' an accountId argument is empty string`);
    }
};
const validateAccountsDatabaseAccountNames = (accountNames) => {
    assert(Array.isArray(accountNames), `accountsDatabase accountNames '${accountNames}' not an array`);
    for (const accountName of accountNames) {
        assert(typeof accountName === "string", `accountsDatabase accountNames '${accountNames}' accountName '${accountName}' not a string`);
    }
};
const validateAccountsDatabaseAddAccountArguments = (account) => {
    assert(account && typeof account === "object", `accountsDatabase.addAccount '${account}' not an object`);
    assert(typeof account.name === "string", `accountsDatabase.addAccount account.name '${account.name}' not a string`);
    assert(account.name !== "", `accountsDatabase.addAccount account.name is empty string`);
    assert(typeof account.id === "string", `accountsDatabase.addAccount account.id '${account.id}' not a string`);
    assert(account.id !== "", `accountsDatabase.addAccount account.id is empty string`);
};
const validateUseCommentArguments = (commentCid, account) => {
    assert(typeof commentCid === "string", `useComment commentCid '${commentCid}' not a string`);
    assert(getAccountProtocolClient(account) && typeof getAccountProtocolClient(account) === "object", `useComment account.pkc/account.pkc '${getAccountProtocolClient(account)}' not an object`);
};
const validateUseCommentsArguments = (commentCids, account) => {
    assert(Array.isArray(commentCids), `useComment commentCids '${toString(commentCids)}' not an array`);
    for (const commentCid of commentCids) {
        assert(typeof commentCid === "string", `useComments commentCids '${toString(commentCids)}' commentCid '${toString(commentCid)}' not a string`);
    }
    assert(getAccountProtocolClient(account) && typeof getAccountProtocolClient(account) === "object", `useComments account.pkc/account.pkc '${getAccountProtocolClient(account)}' not an object`);
};
const validateCommunityIdentifierArguments = (community, legacyCommunityAddress, scope) => {
    assert(legacyCommunityAddress === undefined, `${scope} communityAddress has been removed, pass { community: { name, publicKey } }`);
    if (community === undefined) {
        return;
    }
    assertCommunityRef(community, `${scope} community`);
};
const validateUseCommunityArguments = ({ community, communityAddress, account }) => {
    validateCommunityIdentifierArguments(community, communityAddress, "useCommunity");
    if (account !== undefined && account !== null) {
        assert(getAccountProtocolClient(account) && typeof getAccountProtocolClient(account) === "object", `useCommunity account.pkc/account.pkc '${getAccountProtocolClient(account)}' not an object`);
    }
};
const validateUseCommunityStatsArguments = ({ community, communityAddress }) => {
    validateCommunityIdentifierArguments(community, communityAddress, "useCommunityStats");
};
const validateCommunitiesArguments = (communities, communityRefs, communityAddresses, scope) => {
    assert(communityRefs === undefined, `${scope} communityRefs has been removed, pass communities instead`);
    assert(communityAddresses === undefined, `${scope} communityAddresses has been removed, pass communities instead`);
    if (communities !== undefined) {
        assert(Array.isArray(communities), `${scope} communities '${toString(communities)}' not an array`);
        for (const community of communities) {
            assertCommunityRef(community, `${scope} communities '${toString(communities)}' community '${toString(community)}'`);
        }
    }
};
const validateUseCommunitiesArguments = ({ communities, communityRefs, communityAddresses, account, }) => {
    validateCommunitiesArguments(communities, communityRefs, communityAddresses, "useCommunities");
    if (account !== undefined && account !== null) {
        assert(getAccountProtocolClient(account) && typeof getAccountProtocolClient(account) === "object", `useCommunity account.pkc/account.pkc '${getAccountProtocolClient(account)}' not an object`);
    }
};
const validateFeedSortType = (sortType) => {
    assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `invalid feed sort type '${sortType}'`);
};
const validateUseFeedArguments = ({ communities, communityRefs, communityAddresses, sortType, accountName, postsPerPage, filter, newerThan, accountComments, }) => {
    validateCommunitiesArguments(communities, communityRefs, communityAddresses, "useFeed");
    assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `useFeed sortType argument '${sortType}' invalid`);
    if (accountName) {
        assert(typeof accountName === "string", `useFeed accountName argument '${accountName}' not a string`);
    }
    if (postsPerPage !== undefined && postsPerPage !== null) {
        assert(typeof postsPerPage === "number", `useFeed postsPerPage argument '${postsPerPage}' not a number`);
    }
    if (filter) {
        assert(typeof filter.filter === "function", `useFeed filter.filter argument '${filter.filter}' not a function, useFeedOptions.filter is now an object Filter {filter: (comment: Comment) => Boolean, key: string}`);
        assert(typeof filter.key === "string", `useFeed filter.key argument '${filter.key}' not a string, a unique filter.key is now required to cache the filter`);
    }
    if (newerThan !== undefined && newerThan !== null) {
        assert(typeof newerThan === "number", `useFeed newerThan argument '${newerThan}' not a number`);
    }
    if (accountComments) {
        assert(typeof accountComments === "object", `useFeed accountComments argument '${accountComments}' not an object`);
        assert(typeof accountComments.newerThan === "number", `useFeed accountComments.newerThan argument '${accountComments}' not a number`);
    }
};
const validateUseBufferedFeedsArguments = ({ feedsOptions, accountName, }) => {
    assert(Array.isArray(feedsOptions), `useBufferedFeeds feedsOptions argument '${toString(feedsOptions)}' not an array`);
    for (const { communities, communityRefs, communityAddresses, sortType, postsPerPage, filter, newerThan, } of feedsOptions) {
        validateCommunitiesArguments(communities, communityRefs, communityAddresses, "useBufferedFeeds feedOptions");
        assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `useBufferedFeeds feedOptions.sortType argument '${sortType}' invalid`);
        if (postsPerPage !== undefined && postsPerPage !== null) {
            assert(typeof postsPerPage === "number", `useBufferedFeeds feedOptions.postsPerPage argument '${postsPerPage}' not a number`);
        }
        if (filter) {
            assert(typeof filter.filter === "function", `useBufferedFeeds feedOptions.filter.filter argument '${filter.filter}' not a function, useFeedOptions.filter is now an object Filter {filter: (comment: Comment) => Boolean, key: string}`);
            assert(typeof filter.key === "string", `useBufferedFeeds feedOptions.filter.key argument '${filter.key}' not a string, a unique filter.key is now required to cache the filter`);
        }
        if (newerThan !== undefined && newerThan !== null) {
            assert(typeof newerThan === "number", `useBufferedFeeds feedOptions.newerThan argument '${newerThan}' not a number`);
        }
    }
    if (accountName) {
        assert(typeof accountName === "string", `useBufferedFeeds accountName argument '${accountName}' not a string`);
    }
};
const validateUseCommunitiesStatesArguments = ({ communities, communityRefs, communityAddresses, }) => {
    validateCommunitiesArguments(communities, communityRefs, communityAddresses, "useCommunitiesStates");
};
const validateRepliesSortType = (sortType) => {
    assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `invalid replies sort type '${sortType}'`);
};
const validateUseRepliesArguments = (comment, sortType, accountName, onlyIfCached, flat, accountComments, postsPerPage, filter) => {
    assert(!comment || typeof comment === "object", `useReplies comment argument '${comment}' not an object`);
    assert(!(comment === null || comment === void 0 ? void 0 : comment.cid) || typeof comment.cid === "string", `useReplies comment.cid argument '${comment === null || comment === void 0 ? void 0 : comment.cid}' not a string`);
    assert(sortType === undefined || (typeof sortType === "string" && sortType.length > 0), `useReplies sortType argument '${sortType}' invalid`);
    if (accountName) {
        assert(typeof accountName === "string", `useReplies accountName argument '${accountName}' not a string`);
    }
    if (onlyIfCached !== undefined && onlyIfCached !== null) {
        assert(typeof onlyIfCached === "boolean", `useReplies onlyIfCached argument '${onlyIfCached}' not a boolean`);
    }
    if (postsPerPage !== undefined && postsPerPage !== null) {
        assert(typeof postsPerPage === "number", `useReplies postsPerPage argument '${postsPerPage}' not a number`);
    }
    if (flat !== undefined && flat !== null) {
        assert(typeof flat === "boolean", `useReplies flat argument '${flat}' not a boolean`);
    }
    if (accountComments !== undefined && accountComments !== null) {
        assert(typeof accountComments.newerThan === "number", `useReplies accountComments.newerThan argument '${accountComments.newerThan}' not a number`);
        assert(!accountComments.append || typeof accountComments.append === "boolean", `useReplies accountComments.append argument '${accountComments.append}' not a boolean`);
    }
    if (filter) {
        assert(typeof filter.filter === "function", `useReplies filter.filter argument '${filter.filter}' not a function, useRepliesOptions.filter is now an object Filter {filter: (comment: Comment) => Boolean, key: string}`);
        assert(typeof filter.key === "string", `useReplies filter.key argument '${filter.key}' not a string, a unique filter.key is now required to cache the filter`);
    }
};
const validator = {
    validateAccountsActionsPublishCommentArguments,
    validateAccountsActionsPublishCommentEditArguments,
    validateAccountsActionsPublishCommentModerationArguments,
    validateAccountsActionsPublishCommunityEditArguments,
    validateAccountsActionsPublishVoteArguments,
    validateAccountsActionsExportAccountArguments,
    validateAccountsActionsSetAccountsOrderArguments,
    validateAccountsActionsSetAccountArguments,
    validateAccountsActionsSetActiveAccountArguments,
    validateAccountsDatabaseAddAccountArguments,
    validateAccountsDatabaseGetAccountsArguments,
    validateAccountsDatabaseAccountNames,
    validateUseCommentArguments,
    validateUseCommentsArguments,
    validateUseCommunityArguments,
    validateUseCommunityStatsArguments,
    validateUseCommunitiesArguments,
    validateUseCommunitiesStatesArguments,
    validateFeedSortType,
    validateUseFeedArguments,
    validateUseBufferedFeedsArguments,
    validateRepliesSortType,
    validateUseRepliesArguments,
};
export default validator;
//# sourceMappingURL=validator.js.map