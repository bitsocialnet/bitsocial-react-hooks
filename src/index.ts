import polyfill from "./lib/polyfill";
polyfill();

// accounts
import {
  useAccount,
  useAccounts,
  useAccountComment,
  useAccountComments,
  useAccountVotes,
  useAccountVote,
  useAccountEdits,
  useEditedComment,
  useNotifications,
  useAccountCommunities,
  usePubsubSubscribe,
} from "./hooks/accounts";

// comments
import { useComment, useComments, useCrosspost, useValidateComment } from "./hooks/comments";

// replies
import { useReplies } from "./hooks/replies";

// communities
import {
  useCommunity,
  useCommunities,
  useCommunityStats,
  useListCommunities,
  useResolvedCommunityAddress,
} from "./hooks/communities";

// feeds
import { useFeed, useBufferedFeeds } from "./hooks/feeds";

// authors
import {
  useAuthor,
  useAuthorComments,
  useAuthorAvatar,
  useResolvedAuthorAddress,
  useAuthorAddress,
  setAuthorAvatarsWhitelistedTokenAddresses,
  resetAuthorAddressCacheForTesting,
} from "./hooks/authors";

// actions
import {
  useSubscribe,
  useBlock,
  usePublishComment,
  usePublishVote,
  useCreateCommunity,
  usePublishCommentEdit,
  usePublishCommentModeration,
  usePublishCommunityEdit,
  useExportCommunity,
} from "./hooks/actions";

// actions that don't have their own hooks yet
import {
  createAccount,
  deleteAccount,
  deleteComment,
  setAccount,
  setActiveAccount,
  setAccountsOrder,
  importAccount,
  exportAccount,
  deleteCommunity,
} from "./stores/accounts/accounts-actions";

// states
import { useClientsStates, useCommunitiesStates } from "./hooks/states";

// pkc-rpc
import { usePkcRpcSettings } from "./hooks/pkc-rpc";

// chain
import {
  getEthWalletFromPkcPrivateKey,
  getEthPrivateKeyFromPkcPrivateKey,
  validateEthWallet,
} from "./lib/chain";

// utils
import { setPkcJs, restorePkcJs } from "./lib/pkc-js";
import { deleteDatabases, deleteCaches } from "./lib/debug-utils";
import { createCrosspost } from "./lib/crosspost";

// types
export * from "./types";

// IMPORTANT: should be the same as 'export default hooks'
export {
  // accounts
  useAccount,
  useAccounts,
  useAccountComment,
  useAccountComments,
  useAccountVotes,
  useAccountVote,
  useAccountEdits,
  useAccountCommunities,
  useNotifications,
  usePubsubSubscribe,
  // comments
  useComment,
  useComments,
  useCrosspost,
  useEditedComment,
  useValidateComment,
  // replies
  useReplies,
  // communities
  useCommunity,
  useCommunities,
  useCommunityStats,
  useListCommunities,
  useResolvedCommunityAddress,
  // authors
  useAuthor,
  useAuthorComments,
  useAuthorAvatar,
  useResolvedAuthorAddress,
  useAuthorAddress,
  setAuthorAvatarsWhitelistedTokenAddresses,
  resetAuthorAddressCacheForTesting,
  // feeds
  useFeed,
  useBufferedFeeds,
  // actions
  useSubscribe,
  useBlock,
  usePublishComment,
  usePublishVote,
  usePublishCommentEdit,
  usePublishCommentModeration,
  usePublishCommunityEdit,
  useCreateCommunity,
  useExportCommunity,
  // actions that don't have their own hooks yet
  createAccount,
  deleteAccount,
  deleteComment,
  setAccount,
  setActiveAccount,
  setAccountsOrder,
  importAccount,
  exportAccount,
  deleteCommunity,
  // states
  useClientsStates,
  useCommunitiesStates,
  // pkc-rpc
  usePkcRpcSettings,
  // chain
  getEthWalletFromPkcPrivateKey,
  getEthPrivateKeyFromPkcPrivateKey,
  validateEthWallet,
  // utils
  setPkcJs,
  restorePkcJs,
  deleteDatabases,
  deleteCaches,
  createCrosspost,
};

// IMPORTANT: should be the same as 'export {}'
const hooks = {
  // accounts
  useAccount,
  useAccounts,
  useAccountComment,
  useAccountComments,
  useAccountVotes,
  useAccountVote,
  useAccountEdits,
  useAccountCommunities,
  useNotifications,
  usePubsubSubscribe,
  // comments
  useComment,
  useComments,
  useCrosspost,
  useEditedComment,
  useValidateComment,
  // replies
  useReplies,
  // communities
  useCommunity,
  useCommunities,
  useCommunityStats,
  useListCommunities,
  useResolvedCommunityAddress,
  // authors
  useAuthor,
  useAuthorComments,
  useAuthorAvatar,
  useResolvedAuthorAddress,
  useAuthorAddress,
  setAuthorAvatarsWhitelistedTokenAddresses,
  resetAuthorAddressCacheForTesting,
  // feeds
  useFeed,
  useBufferedFeeds,
  // actions
  useSubscribe,
  useBlock,
  usePublishComment,
  usePublishVote,
  usePublishCommentEdit,
  usePublishCommentModeration,
  usePublishCommunityEdit,
  useCreateCommunity,
  useExportCommunity,
  // actions that don't have their own hooks yet
  createAccount,
  deleteAccount,
  deleteComment,
  setAccount,
  setActiveAccount,
  setAccountsOrder,
  importAccount,
  exportAccount,
  deleteCommunity,
  // states
  useClientsStates,
  useCommunitiesStates,
  // pkc-rpc
  usePkcRpcSettings,
  // chain
  getEthWalletFromPkcPrivateKey,
  getEthPrivateKeyFromPkcPrivateKey,
  validateEthWallet,
  // utils
  setPkcJs,
  restorePkcJs,
  deleteDatabases,
  deleteCaches,
  createCrosspost,
};

export default hooks;
