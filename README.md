[![CI](https://github.com/bitsocialnet/bitsocial-react-hooks/actions/workflows/CI.yml/badge.svg?branch=master)](https://github.com/bitsocialnet/bitsocial-react-hooks/actions/workflows/CI.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/bitsocialnet/bitsocial-react-hooks/master/badges/coverage.json)](https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/scripts/write-coverage-badge.mjs)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-red.svg)](https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/LICENSE)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

<p align="left">
  <img src="./docs/assets/readme/react-hooks-banner.jpg" alt="React Hooks banner" width="340" />
</p>

# Bitsocial React Hooks

React hooks for the Bitsocial protocol. Build decentralized, serverless social apps with React using a familiar hooks API — fetch feeds, comments, author profiles, manage accounts, publish content, and more, all without a central server.

This package is published as [`@bitsocial/bitsocial-react-hooks`](https://www.npmjs.com/package/@bitsocial/bitsocial-react-hooks) and is used by [5chan](https://github.com/bitsocialnet/5chan) and other Bitsocial clients.

## Installation

```bash
yarn add @bitsocial/bitsocial-react-hooks
```

The published build is self-contained ESM, so consumers should not need postinstall import-rewrite patches.

## Development Setup

```bash
nvm install
nvm use
corepack enable
yarn install
```

Run `corepack enable` once per machine so plain `yarn` resolves to the pinned Yarn 4 release.

---

## Table of Contents

- [Installation](#installation)
- [Documentation Links](#documentation-links)
- [API Reference](#api-reference)
  - [Hooks](#hooks)
  - [Accounts Hooks](#accounts-hooks)
  - [Comments Hooks](#comments-hooks)
  - [Communities Hooks](#communities-hooks)
  - [Authors Hooks](#authors-hooks)
  - [Feeds Hooks](#feeds-hooks)
  - [Actions Hooks](#actions-hooks)
  - [States Hooks](#states-hooks)
  - [RPC Hooks](#rpc-hooks)
  - [Actions with no hooks implementations yet](#actions-with-no-hooks-implementations-yet)
  - [Utility functions](#utility-functions)
- [Recipes](#recipes)
  - [Getting started](#getting-started)
  - [Get the active account, if none exist in browser database, a default account is generated](#get-the-active-account-if-none-exist-in-browser-database-a-default-account-is-generated)
  - [Create accounts and change active account](#create-accounts-and-change-active-account)
  - [Get a post](#get-a-post)
  - [Get a comment](#get-a-comment)
  - [Get author avatar](#get-author-avatar)
  - [Get author profile page](#get-author-profile-page)
  - [Get a community](#get-a-community)
  - [Create a post or comment using callbacks](#create-a-post-or-comment-using-callbacks)
  - [Create a post or comment using hooks](#create-a-post-or-comment-using-hooks)
  - [Create a post or comment anonymously (without account.signer or account.author)](#create-a-post-or-comment-anonymously-without-accountsigner-or-accountauthor)
  - [Create a vote](#create-a-vote)
  - [Create a comment edit](#create-a-comment-edit)
  - [Create a comment moderation](#create-a-comment-moderation)
  - [Delete a comment](#delete-a-comment)
  - [Subscribe to a community](#subscribe-to-a-community)
  - [Get feed](#get-feed)
  - [Get mod queue (pending approval)](#get-mod-queue-pending-approval)
  - [Approve a pending approval comment](#approve-a-pending-approval-comment)
  - [Edit an account](#edit-an-account)
  - [Delete account](#delete-account)
  - [Get your own comments and votes](#get-your-own-comments-and-votes)
  - [Determine if a comment is your own](#determine-if-a-comment-is-your-own)
  - [Get account notifications](#get-account-notifications)
  - [Block an address (author, community or multisub)](#block-an-address-author-community-or-multisub)
  - [Block a cid (hide a comment)](#block-a-cid-hide-a-comment)
  - [(Desktop only) Create a community](#desktop-only-create-a-community)
  - [(Desktop only) List the communities you created](#desktop-only-list-the-communities-you-created)
  - [(Desktop only) Edit your community settings](#desktop-only-edit-your-community-settings)
  - [Export and import account](#export-and-import-account)
  - [View the status of a comment edit](#view-the-status-of-a-comment-edit)
  - [View the status of a specific comment edit property](#view-the-status-of-a-specific-comment-edit-property)
  - [List all comment and community edits the account has performed](#list-all-comment-and-community-edits-the-account-has-performed)
  - [Get replies to a post (nested or flat)](#get-replies-to-a-post-nested-or-flat)
  - [Format short CIDs and addresses](#format-short-cids-and-addresses)
  - [useBufferedFeeds with concurrency](#usebufferedfeeds-with-concurrency)

## Documentation Links

- [Hooks API](#hooks)
- [Getting started](#getting-started)
- Install, testing and building: https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/testing.md
- Mock content (for UI development): https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/mock-content.md
- Algorithms: https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/algorithms.md
- Schema (Types, IndexedDb and state management): https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/docs/schema.md
- Types: https://github.com/bitsocialnet/bitsocial-react-hooks/blob/master/src/types.ts

## API Reference

### Hooks

#### Accounts Hooks

```
useAccount(): Account | undefined
useAccountComment({commentIndex?: number, commentCid?: string}): Comment // get one own comment by index or cid
useAccountComments({filter?: AccountPublicationsFilter, commentCid?: string, commentIndices?: number[], communityAddress?: string, parentCid?: string, newerThan?: number, page?: number, pageSize?: number, sortType?: "new" | "old"}): {accountComments: Comment[]} // export or display list of own comments
useAccountVotes({filter?: AccountPublicationsFilter, vote?: number, commentCid?: string, communityAddress?: string, newerThan?: number, page?: number, pageSize?: number, sortType?: "new" | "old"}): {accountVotes: Vote[]}  // export or display list of own votes
useAccountVote({commentCid: string}): Vote // know if you already voted on some comment
useAccountEdits({filer: AccountPublicationsFilter}):  {accountEdits: AccountEdit[]}
useAccountCommunities(): {accountCommunities: {[communityAddress: string]: AccountCommunity}, onlyIfCached?: boolean}
useAccounts(): Account[]
useNotifications(): {notifications: Notification[], markAsRead: Function}
```

#### Comments Hooks

```
useComment({commentCid: string, community?: CommunityIdentifier, initialComment?: Comment, onlyIfCached?: boolean, autoUpdate?: boolean}): Comment & {refresh: Function}
useCrosspost({crosspost: Crosspost, autoUpdate?: boolean}): Comment & {isCommunityVerified: boolean, refresh: Function}
useReplies({comment: Comment, onlyIfCached?: boolean, sortType?: string, flat?: boolean, repliesPerPage?: number, filter?: CommentsFilter, accountComments?: {newerThan: number, append?: boolean}}): {replies: Comment[], hasMore: boolean, loadMore: function, reset: function, updatedReplies: Comment[], bufferedReplies: Comment[]}
useComments({commentCids: string[], onlyIfCached?: boolean, autoUpdate?: boolean}): {comments: Comment[], refresh: Function}
useEditedComment({comment: Comment}): {editedComment: Comment | undefined}
useValidateComment({comment: Comment, validateReplies?: boolean}): {valid: boolean}
```

#### Communities Hooks

```
useCommunity({community: {name?: string, publicKey?: string}, onlyIfCached?: boolean}): Community & {syncState: "initializing" | "loading" | "retrying" | "succeeded" | "failed" | "stopped", hasCachedData: boolean, lastFetchAttemptAt: number | undefined, lastSuccessfulFetchAt: number | undefined}
useCommunities({communities?: CommunityIdentifier[], onlyIfCached?: boolean}): {communities: Communities[]}
useCommunityStats({community: {name?: string, publicKey?: string}, onlyIfCached?: boolean}): CommunityStats
useResolvedCommunityAddress({communityAddress: string, cache: boolean}): {resolvedAddress: string | undefined} // use {cache: false} when checking the user's own community address
```

Pass `{ publicKey, name }` when you have both so `pkc-js` can fetch through the public key and resolve the name in the background. `communityAddress`, `communityAddresses`, and `communityRefs` are no longer accepted by these hooks.

`useCommunity` only exposes community error events that are not superseded by a later `update` event. Transient fetch errors are delayed briefly before surfacing through `error` or `errors`.

`useCommunity().state` remains `succeeded` when cached community data is available, even
while a refresh is running. Use `syncState` for the current refresh lifecycle:
`loading` covers active name, IPNS, and IPFS work, while `retrying` means a transient
failure is being retried. `lastFetchAttemptAt` and `lastSuccessfulFetchAt` are Unix
timestamps in seconds. A successful fetch only proves that a valid community record was
reachable; it does not prove that the community operator is currently online.

#### Authors Hooks

```
useAuthor({authorAddress: string, commentCid: string}): {author: Author | undefined}
useAuthorAddress({comment: Comment}): {authorAddress: string | undefined, shortAuthorAddress: string | undefined, authorAddressChanged: boolean}
useAuthorComments({authorAddress: string, commentCid: string, filter?: CommentsFilter}): {authorComments: Comment[], hasMore: boolean, loadMore: Promise<void>}
useResolvedAuthorAddress({author?: Author, cache?: boolean}): {resolvedAddress: string | undefined, nameResolver: NameResolverInfo | undefined} // supports .eth/.bso aliases; use {cache: false} when checking the user's own author address
useAuthorAvatar({author?: Author}): {imageUrl: string | undefined}
setAuthorAvatarsWhitelistedTokenAddresses(tokenAddresses: string[])
```

#### Feeds Hooks

```
useFeed({communities?: CommunityIdentifier[], sortType?: string, postsPerPage?: number, filter?: CommentsFilter, newerThan?: number, accountComments?: {newerThan: number, append?: boolean}, modQueue: ['pendingApproval']}): {feed: Comment[], loadMore: function, expandTimeWindow: function, hasMore: boolean, reset: function, updatedFeed: Comment[], bufferedFeed: Comment[], communityKeysWithNewerPosts: string[]}
useBufferedFeeds({feedsOptions: UseFeedOptions[]}) // preload or buffer feeds in the background, so they load faster when you call `useFeed`
```

`useFeed().reset()` clears the current feed and refreshes the latest community snapshots before rebuilding it.
`useFeed().expandTimeWindow(newerThan)` broadens `newerThan` in place without constructing a different sort name, so older posts can be appended without replacing the feed instance.

Feed and reply sort names are defined by each community record, not by a fixed hooks allowlist. Omit `sortType` to use the preloaded page, or discover the published names with `getAvailablePostSortTypes(community)` and `getAvailableReplySortTypes(comment)`. A requested sort that is not published is not silently replaced with another sort. Hooks preserve protocol page order for unknown custom sorts because their scoring algorithm is not available to the client.

#### Actions Hooks

```
useSubscribe({communityAddress: string}): {subscribed: boolean | undefined, subscribe: Function, unsubscribe: Function}
useBlock({address?: string, cid?: string}): {blocked: boolean | undefined, block: Function, unblock: Function}
usePublishComment(options: UsePublishCommentOptions): {index: number, abandonPublish: () => Promise<void>, ...UsePublishCommentResult}
usePublishVote(options: UsePublishVoteOptions): UsePublishVoteResult
usePublishCommentEdit(options: UsePublishCommentEditOptions): UsePublishCommentEditResult
usePublishCommentModeration(options: UsePublishCommentModerationOptions): UsePublishCommentModerationResult
usePublishCommunityEdit(options: UsePublishCommunityEditOptions): UsePublishCommunityEditResult
useCreateCommunity(options: CreateCommunityOptions): {createdCommunity: Community | undefined, createCommunity: Function}
useExportCommunity(options?: UseExportCommunityOptions): {
  communityExports: {communityAddress: string, exportId: string}[],
  exportCommunity: () => Promise<void>,
  state: string,
  error: Error | undefined,
  errors: Error[]
}
```

Before `publishComment`, `publishCommentEdit`, `publishVote`, `publishCommentModeration`, or `publishCommunityEdit` signs a publication, hooks load the community challenge configuration and apply compatible wordfilters. The current `@bitsocial/wordfilter-challenge` contract uses a JSON array of `{src, dst}` objects in `wordfilter/v1/rules` and an optional JSON array of dot-notation paths in `wordfilter/v1/fieldNames`, both published through `publicOptions`. Every path starts with the publication type and is resolved against the publication being signed, so a path for another type is simply skipped. Without configured paths the defaults apply: `comment.content`, `comment.title`, `comment.author.displayName`, `commentEdit.content`, `commentEdit.reason`, `commentEdit.author.displayName`, and `vote.author.displayName`. Moderator and owner text is opt-in through configured paths (`commentModeration.commentModeration.reason`, `communityEdit.communityEdit.title`, `communityEdit.communityEdit.description`); structural and signing fields are never rewritten by community configuration. Matching is literal and case-insensitive, not regular-expression or Unicode-evasion matching. The transformed values are the values signed, published, and stored as the pending account publication. If composed rule sets do not stabilize within eight passes, publication stops before signing.

#### States Hooks

```
useClientsStates({comment?: Comment, community?: Community}): {states, peers}
useCommunitiesStates({communities?: CommunityIdentifier[]}): {states, peers}
```

#### RPC Hooks

```
usePkcRpcSettings(): {pkcRpcSettings: {pkcOptions, challenges}, setPkcRpcSettings: Function}
```

Community edits preserve challenge `publicOptions` arrays, remote community records expose their published option values, and `usePkcRpcSettings` exposes each installed challenge's `optionInputs` metadata so clients can build challenge-specific configuration without hooks knowing each challenge schema.

#### Actions with no hooks implementations yet

```
createAccount(account: Account)
deleteAccount(accountName: string)
setAccount(account: Account)
setActiveAccount(accountName: string)
setAccountsOrder(accountNames: string[])
importAccount(serializedAccount: string)
exportAccount(accountName: string): string // don't allow undefined to prevent catastrophic bugs
deleteCommunity(communityAddress: string, accountName?: string)
deleteComment(commentCidOrAccountCommentIndex: string | number, accountName?: string): Promise<void>
```

#### Utility functions

```
setPkcJs(PKC) // swap the underlying protocol client implementation, e.g. for mocks or Electron
deleteDatabases() // delete all databases, including all caches and accounts data
deleteCaches() // delete the cached comments, cached communities and cached pages only, no accounts data
createCrosspost(comment: Comment): Crosspost // build the immutable payload accepted by pkc-js
getAvailablePostSortTypes(community: Community): string[]
getAvailableReplySortTypes(comment: Comment): string[]
getPreloadedPostSortType(community: Community): string | undefined
getPreloadedReplySortType(comment: Comment): string | undefined
resolvePostSortType(community: Community, requestedSortType?: string): string | undefined
resolveReplySortType(comment: Comment, requestedSortType?: string): string | undefined
```

`createCrosspost` requires a fully loaded comment with `comment.cid` and
`comment.raw.comment`. Publish the returned payload through the existing action hook:

```jsx
const crosspost = createCrosspost(sourceComment);
const { publishComment } = usePublishComment({
  communityAddress: targetCommunityAddress,
  title: sourceComment.title,
  crosspost,
});
await publishComment();
```

Render the author-signed embedded record immediately with `useCrosspost`. The referenced
community is only confirmed after its signed `CommentUpdate` has loaded, exposed as
`isCommunityVerified`:

```jsx
const original = useCrosspost({ crosspost: post.crosspost });

return <CrosspostCard comment={original} verified={original.isCommunityVerified} />;
```

## Recipes

#### Getting started

```jsx
import { useComment, useAccount } from "@bitsocial/bitsocial-react-hooks";

const account = useAccount();
const comment = useComment({ commentCid });
```

#### Get the active account, if none exist in browser database, a default account is generated

```jsx
const account = useAccount();
```

#### Create accounts and change active account

```jsx
import {
  useAccount,
  useAccounts,
  createAccount,
  setActiveAccount,
} from "@bitsocial/bitsocial-react-hooks";

const account = useAccount();
const { accounts } = useAccounts();

// on first render
console.log(accounts.length); // 1
console.log(account.name); // e.g. 'Account KoXpxTwfnjA5'
console.log(account.name === `Account ${account.author.shortAddress}`); // true

await createAccount(); // creates another uniquely named account
await createAccount();
const thirdAccountName = accounts[2].name;
await setActiveAccount(thirdAccountName);

// on render after updates
console.log(accounts.length); // 3
console.log(account.name); // thirdAccountName

// you are now publishing from the third account because it is active
const { publishComment } = usePublishComment(publishCommentOptions);
await publishComment();
```

#### Get a post

```jsx
const post = useComment({ commentCid, community: { name: communityAddress, publicKey: communityPublicKey } });

// manual refresh is always available
await post.refresh();

// post.author.address should not be used directly, it needs to be verified asynchronously using useAuthorAddress
const { authorAddress, shortAuthorAddress } = useAuthorAddress({ comment: post });
// exception: when linking to an author profile page, /u/${comment.author.address}/c/${comment.cid} should be used, not useAuthorAddress({comment}).authorAddress

// use many times in a page without affecting performance
const post = useComment({ commentCid, onlyIfCached: true });

// disable background polling and refresh on demand
const post = useComment({ commentCid, autoUpdate: false });
await post.refresh();

// post.replies are not validated, to show replies
const { replies, hasMore, loadMore } = useReplies({ comment: post });

// only use the comment's preloaded replies plus any reply pages already cached in memory
// won't fetch missing reply pages; hasMore only reflects cached replies still available to load
const cachedReplies = useReplies({ comment: post, onlyIfCached: true });

// to show a preloaded reply without rerenders, validate manually
const { valid } = useValidateComment({ comment: post.replies.pages.best.comments[0] });
if (valid === false) {
  // don't show this reply, it's malicious
}
// won't cause any rerenders if true
```

#### Get a comment

```jsx
const comment = useComment({ commentCid, community: { name: communityAddress, publicKey: communityPublicKey } });
const { comments, refresh } = useComments({ commentCids: [commentCid1, commentCid2, commentCid3] });
await refresh();

// content
console.log(comment.content || comment.link || comment.title);

// comment.author.address should not be used directly, it needs to be verified asynchronously using useAuthorAddress
const { authorAddress, shortAuthorAddress } = useAuthorAddress({ comment });
// exception: when linking to an author profile page, /u/${comment.author.address}/c/${comment.cid} should be used, not useAuthorAddress({comment}).authorAddress

// use without affecting performance
const { comments } = useComments({ commentCids, onlyIfCached: true });

// disable background polling and refresh this list on demand
const frozenComments = useComments({ commentCids, autoUpdate: false });
await frozenComments.refresh();
```

#### Get author avatar

```jsx
const comment = useComment({ commentCid });

// get the nft avatar image url of the comment author
const { imageUrl, state, error, chainProvider, metadataUrl } = useAuthorAvatar({
  author: comment.author,
});

// result
if (state === "succeeded") {
  console.log("Succeeded getting avatar image URL", imageUrl);
}
if (state === "failed") {
  console.log("Failed getting avatar image URL", error.message);
}

// pending
if (state === "fetching-owner") {
  console.log("Fetching NFT owner address from chain provider", chainProvider.urls);
}
if (state === "fetching-uri") {
  console.log("Fetching NFT URI from chain provider URL", chainProvider.urls);
}
if (state === "fetching-metadata") {
  console.log("Fetching NFT URI from", metadataUrl);
}
```

#### Get author profile page

```jsx
// NOTE: you must have a comment cid from the author to load his profile page
// e.g. the page url would be /#/u/<authorAddress>/c/<commentCid>
const authorResult = useAuthor({ commentCid, authorAddress });
const { imageUrl } = useAuthorAvatar({ author: authorResult.author });
const { authorComments, lastCommentCid, hasMore, loadMore } = useAuthorComments({
  commentCid,
  authorAddress,
});

// result
if (authorResult.state === "succeeded") {
  console.log("Succeeded getting author", authorResult.author);
}
if (state === "failed") {
  console.log("Failed getting author", authorResult.error.message);
}

// listing the author comments with infinite scroll
import { Virtuoso } from "react-virtuoso";

<Virtuoso
  data={authorComments}
  itemContent={(index, comment) => <Comment index={index} comment={comment} />}
  useWindowScroll={true}
  components={{ Footer: hasMore ? () => <Loading /> : undefined }}
  endReached={loadMore}
  increaseViewportBy={{ bottom: 600, top: 600 }}
/>;

// it is recommended to always redirect the user to the last known comment cid
// in case they want to share the url with someone, the author's comments
// will load faster when using the last comment cid
import { useParams } from "react-router-dom";
const params = useParams();

useEffect(() => {
  if (lastCommentCid && params.comentCid !== lastCommentCid) {
    history.push(`/u/${params.authorAddress}/c/${lastCommentCid}`);
  }
}, [lastCommentCid]);

// search an author's comments
const createSearchFilter = (searchTerm) => ({
  filter: (comment) => comment.title?.includes(searchTerm) || comment.content?.includes(searchTerm),
  key: `includes-${searchTerm}`, // required key to cache the filter
});
const filter = createSearchFilter("bitcoin");
const { authorComments, lastCommentCid, hasMore, loadMore } = useAuthorComments({
  commentCid,
  authorAddress,
  filter,
});
```

#### Get a community

```jsx
const community = useCommunity({ community: { name: communityAddress, publicKey: communityPublicKey } });
const {
  syncState,
  hasCachedData,
  lastFetchAttemptAt,
  lastSuccessfulFetchAt,
} = community;
const communityStats = useCommunityStats({
  community: { name: communityAddress, publicKey: communityPublicKey },
});
const { communities } = useCommunities({
  communities: [
    { name: communityAddress, publicKey: communityPublicKey },
    { name: communityAddress2, publicKey: communityPublicKey2 },
    { name: communityAddress3, publicKey: communityPublicKey3 },
  ],
});

// fetched communities are refreshed immediately and then every 15 minutes
// so long-lived tabs keep following community IPNS updates

// use without affecting performance
const { communities: cachedCommunities } = useCommunities({
  communities: [
    { name: communityAddress, publicKey: communityPublicKey },
    { name: communityAddress2, publicKey: communityPublicKey2 },
    { name: communityAddress3, publicKey: communityPublicKey3 },
  ],
  onlyIfCached: true,
});

// community.posts are not validated, to show posts
const { feed, hasMore, loadMore } = useFeed({
  communities: [{ name: communityAddress, publicKey: communityPublicKey }],
});

// to show a preloaded post without rerenders, validate manually
const { valid } = useValidateComment({ comment: community.posts.pages.topAll.comments[0] });
if (valid === false) {
  // don't show this post, it's malicious
}
// won't cause any rerenders if true
```

#### Create a post or comment using callbacks

```jsx
const onChallenge = async (challenges: Challenge[], comment: Comment) => {
  let challengeAnswers: string[]
  try {
    // ask the user to complete the challenges in a modal window
    challengeAnswers = await getChallengeAnswersFromUser(challenges)
  }
  catch (e) {
    // if he declines, throw error and don't get a challenge answer
  }
  if (challengeAnswers) {
    // if user declines, publishChallengeAnswers is not called, retry loop stops
    await comment.publishChallengeAnswers(challengeAnswers)
  }
}

const onChallengeVerification = (challengeVerification, comment) => {
  // if the challengeVerification fails, a new challenge request will be sent automatically
  // to break the loop, the user must decline to send a challenge answer
  // if the community owner sends more than 1 challenge for the same challenge request, subsequents will be ignored
  if (challengeVerification.challengeSuccess === true) {
    console.log('challenge success', {publishedCid: challengeVerification.publication.cid})
  }
  else if (challengeVerification.challengeSuccess === false) {
    console.error('challenge failed', {reason: challengeVerification.reason, errors: challengeVerification.errors})
  }
}

const onError = (error, comment) => console.error(error)

const onPendingComment = (accountCommentIndex, pendingComment) => {
  // render or navigate to the pending comment immediately, before local persistence finishes
  // this runs again with the corrected index if another local deletion shifts the comment while saving
  history.push(`/profile/c/${accountCommentIndex}`, {pendingComment})
}

const publishCommentOptions = {
  content: 'hello',
  title: 'hello',
  communityAddress: '12D3KooW...',
  onPendingComment,
  onChallenge,
  onChallengeVerification,
  onError
}

const {index, state, publishComment, abandonPublish} = usePublishComment(publishCommentOptions)

// create post
await publishComment()
// pending comment index
console.log(index)
// pending comment state
console.log(state)

// onPendingComment is called as soon as the provisional comment and index exist,
// and again with a corrected index if another local deletion shifts it while saving.
// Use it to immediately redirect the user to a page displaying the comment
// with a "pending" label. The index result is also defined after the pending
// comment has been stored locally.
if (index !== undefined) {
  // on the "pending" comment page, you can get the pending comment by doing
  // const accountComment = useAccountComment({commentIndex: index})
  // after accountComment.cid gets defined, it means the comment was published successfully
  // it is recommended to immediately redirect to `/p/${accountComment.communityAddress}/c/${useAccountComment.cid}`
}

// if the user closes the challenge modal and wants to cancel publishing:
await abandonPublish()
// the pending local account comment is removed from accountComments
// this works even if called immediately from onChallenge before publishComment() resolves

// reply to a post or comment
const publishReplyOptions = {
  content: 'hello',
  parentCid: 'Qm...', // the cid of the comment to reply to
  communityAddress: '12D3KooW...',
  onChallenge,
  onChallengeVerification,
  onError
}
const {publishComment} = usePublishComment(publishReplyOptions)
await publishComment()

// when displaying replies, it is recommended to include the user's pending replies
// https://github.com/bitsocialnet/bitsocial-react-hooks/#get-replies-to-a-post-nested (nested)
// https://github.com/bitsocialnet/bitsocial-react-hooks/#get-replies-to-a-post-flattened-not-nested (not nested)
```

#### Create a post or comment using hooks

```jsx
const publishCommentOptions = {
  content: "hello",
  title: "hello",
  communityAddress: "12D3KooW...",
};

const {
  index,
  state,
  publishComment,
  challenge,
  challengeVerification,
  publishChallengeAnswers,
  abandonPublish,
  error,
} = usePublishComment(publishCommentOptions);

if (challenge) {
  // display challenges to user and call publishChallengeAnswers(challengeAnswers)
}

if (challengeVerification) {
  // display challengeVerification.challengeSuccess to user
  // redirect to challengeVerification.publication.cid
}

if (error) {
  // display error to user
}

// if the user closes your challenge modal:
if (challenge && challengeModalClosedByUser) {
  await abandonPublish();
}

// after publishComment is called, the account comment index gets defined
// it is recommended to immediately redirect the user to a page displaying
// the user's comment with a "pending" label
if (index !== undefined) {
  history.push(`/profile/c/${index}`);
  // on the "pending" comment page, you can get the pending comment by doing
  // const accountComment = useAccountComment({commentIndex: index})
  // after accountComment.cid gets defined, it means the comment was published successfully
  // it is recommended to immediately redirect to `/p/${accountComment.communityAddress}/c/${useAccountComment.cid}`
}

// create post
await publishComment();
```

#### Create a post or comment anonymously (without account.signer or account.author)

```jsx
const account = useAccount();
const signer = await account.pkc.createSigner();

const publishCommentOptions = {
  content: "hello",
  title: "hello",
  communityAddress: "12D3KooW...",
  // use a newly generated author address (optional)
  signer,
  // use a different display name (optional)
  author: {
    displayName: "Esteban",
    address: signer.address,
  },
};

const { publishComment } = usePublishComment(publishCommentOptions);
await publishComment();
```

#### Create a vote

```jsx
const commentCid = "QmZVYzLChjKrYDVty6e5JokKffGDZivmEJz9318EYfp2ui";
const publishVoteOptions = {
  commentCid,
  vote: 1,
  communityAddress: "news.eth",
  onChallenge,
  onChallengeVerification,
  onError,
};
const { state, error, publishVote } = usePublishVote(publishVoteOptions);

await publishVote();
console.log(state);
console.log(error);

// display the user's vote
const { vote } = useAccountVote({ commentCid });

if (vote === 1) console.log("user voted 1");
if (vote === -1) console.log("user voted -1");
if (vote === 0) console.log("user voted 0");
if (vote === undefined) console.log(`user didn't vote yet`);
```

`useComment`, `useComments`, and `useReplies` apply the selected account's pending vote to
`upvoteCount` and `downvoteCount` immediately. The optimistic adjustment is replaced by the next
canonical comment update.

#### Create a comment edit

```jsx
const publishCommentEditOptions = {
  commentCid: "QmZVYzLChjKrYDVty6e5JokKffGDZivmEJz9318EYfp2ui",
  content: "edited content",
  communityAddress: "news.eth",
  onChallenge,
  onChallengeVerification,
  onError,
};
const { state, error, publishCommentEdit } = usePublishCommentEdit(publishCommentEditOptions);

await publishCommentEdit();
console.log(state);
console.log(error);

// view the status of a comment edit instantly
let comment = useComment({ commentCid: publishCommentEditOptions.commentCid });
const { state: editedCommentState, editedComment } = useEditedComment({ comment });

// if the comment has a succeeded, failed or pending edit, use the edited comment
if (editedComment) {
  comment = editedComment;
}

let editLabel;
if (editedCommentState === "succeeded") {
  editLabel = { text: "EDITED", color: "green" };
}
if (editedCommentState === "pending") {
  editLabel = { text: "PENDING EDIT", color: "orange" };
}
if (editedCommentState === "failed") {
  editLabel = { text: "FAILED EDIT", color: "red" };
}
```

#### Create a comment moderation

```jsx
const publishCommentModerationOptions = {
  commentCid: "QmZVYzLChjKrYDVty6e5JokKffGDZivmEJz9318EYfp2ui",
  communityAddress: "news.eth",
  commentModeration: { locked: true },
  onChallenge,
  onChallengeVerification,
  onError,
};
const { state, error, publishCommentModeration } = usePublishCommentModeration(
  publishCommentModerationOptions,
);

await publishCommentModeration();
console.log(state);
console.log(error);

// view the status of a comment moderation instantly
let comment = useComment({ commentCid: publishCommentModerationOptions.commentCid });
const { state: editedCommentState, editedComment } = useEditedComment({ comment });

// if the comment has a succeeded, failed or pending edit, use the edited comment
if (editedComment) {
  comment = editedComment;
}

let editLabel;
if (editedCommentState === "succeeded") {
  editLabel = { text: "EDITED", color: "green" };
}
if (editedCommentState === "pending") {
  editLabel = { text: "PENDING EDIT", color: "orange" };
}
if (editedCommentState === "failed") {
  editLabel = { text: "FAILED EDIT", color: "red" };
}
```

#### Delete a comment

You can remove comments from your local account database (local JSON export / IndexedDB state) in two ways.
This only removes local account history entries; it does not delete already-published network comments.

**1. Abandon a pending publish** — if you just published and want to cancel before it propagates:

```jsx
const { publishComment, abandonPublish } = usePublishComment(publishCommentOptions);

await publishComment();
// User changes mind — abandon the pending comment
await abandonPublish();
// Hook state returns to ready; the comment is removed from accountComments
```

**2. Delete by index or CID** — remove any of your comments (pending or published):

```jsx
import { deleteComment, useAccountComments } from "@bitsocial/bitsocial-react-hooks";

// By account comment index (from usePublishComment or useAccountComment)
const { index, publishComment } = usePublishComment(publishCommentOptions);
await publishComment();
await deleteComment(index);

// By comment CID (from useAccountComments or useAccountComment)
const { accountComments } = useAccountComments();
const accountComment = accountComments[0];
await deleteComment(accountComment.cid);
```

> **Note:** `accountComment.index` can change after deletions. If you delete a comment, indices of comments after it may shift. Prefer using `commentCid` when you need a stable identifier, or re-fetch `accountComments` after deletions.

**Common cleanup pattern (remove failed UI clutter):**

```jsx
import { deleteComment, useAccountComments } from "@bitsocial/bitsocial-react-hooks";

const { accountComments } = useAccountComments();
const failedComments = accountComments.filter((comment) => comment.state === "failed");

for (const failedComment of failedComments) {
  // failed pending comments may not have a cid yet, so fallback to index
  await deleteComment(failedComment.cid || failedComment.index);
}
```

#### Subscribe to a community

```jsx
let communityAddress = "news.eth";
communityAddress = "12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z";
communityAddress = "tech.eth";
const { subscribed, subscribe, unsubscribe } = useSubscribe({ communityAddress });
await subscribe();
console.log(subscribed); // true

// view subscriptions
const account = useAccount();
console.log(account.subscriptions); // ['news.eth', '12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z', 'tech.eth']

// unsubscribe
await unsubscribe();

// get a feed of subscriptions
const communities = account.subscriptions.map((communityAddress) => ({ name: communityAddress }));
const { feed, hasMore, loadMore } = useFeed({
  communities,
  sortType: "topAll",
});
console.log(feed);
```

#### Get feed

```jsx
import {Virtuoso} from 'react-virtuoso'
const topAllCommunities = [
  {name: 'memes.eth', publicKey: '12D3KooWMemes...'},
  {publicKey: '12D3KooWNews...'},
  {publicKey: '12D3KooWTech...'},
]
const {feed, hasMore, loadMore} = useFeed({communities: topAllCommunities, sortType: 'topAll'})

<Virtuoso
  data={feed}
  itemContent={(index, post) => <Post index={index} post={post}/>}
  useWindowScroll={true}
  components={{Footer: hasMore ? () => <Loading/> : undefined}}
  endReached={loadMore}
  increaseViewportBy={{bottom: 600, top: 600}}
/>

// you probably will want to buffer some feeds in the background so they are already loaded
// when you need them
useBufferedFeeds({
  feedsOptions: [
    {communities: [{name: 'news.eth'}, {name: 'crypto.eth'}], sortType: 'new'},
    {communities: [{name: 'memes.eth', publicKey: '12D3KooWMemes...'}], sortType: 'topWeek'},
    {communities: [{publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}], sortType: 'hot'}
  ]
})

// search a feed
const createSearchFilter = (searchTerm) => ({
  filter: (comment) => comment.title?.includes(searchTerm) || comment.content?.includes(searchTerm),
  key: `includes-${searchTerm}` // required key to cache the filter
})
const searchFilter = createSearchFilter('bitcoin')
const searchedCommunities = communityAddresses.map((communityAddress) => ({ name: communityAddress }))
const {feed, hasMore, loadMore} = useFeed({communities: searchedCommunities, filter: searchFilter})

// image only feed
const imageOnlyFilter = {
  filter: (comment) => getCommentLinkMediaType(comment?.link) === 'image',
  key: 'image-only' // required key to cache the filter
}
const {feed, hasMore, loadMore} = useFeed({
  communities: searchedCommunities,
  filter: imageOnlyFilter,
})

// widen a freshness window without replacing the current feed instance
const {feed, expandTimeWindow} = useFeed({
  communities: [{name: 'news.eth'}],
  sortType: 'active',
  newerThan: 60 * 60 * 24,
})

await expandTimeWindow(60 * 60 * 24 * 7)
```

#### Get mod queue (pending approval)

```jsx
import {Virtuoso} from 'react-virtuoso'
const {feed, hasMore, loadMore} = useFeed({
  communities: [{name: 'memes.eth'}, {publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}],
  modQueue: ['pendingApproval']
})

<Virtuoso
  data={feed}
  itemContent={(index, post) => <Post index={index} post={post}/>}
  useWindowScroll={true}
  components={{Footer: hasMore ? () => <Loading/> : undefined}}
  endReached={loadMore}
  increaseViewportBy={{bottom: 600, top: 600}}
/>
```

Comments automatically drop out of this feed once they are no longer returned by the pending-approval mod-queue pages.

#### Approve a pending approval comment

```jsx
const publishCommentModerationOptions = {
  commentCid: "QmZVYzLChjKrYDVty6e5JokKffGDZivmEJz9318EYfp2ui",
  communityAddress: "news.eth",
  commentModeration: { approved: true },
  onChallenge,
  onChallengeVerification,
  onError,
};
const { state, error, publishCommentModeration } = usePublishCommentModeration(
  publishCommentModerationOptions,
);

await publishCommentModeration();
console.log(state);
console.log(error);
```

#### Edit an account

```jsx
import {useAccount, setAccount, useResolvedAuthorAddress} from '@bitsocial/bitsocial-react-hooks'
const account = useAccount() // or useAccount('Account KoXpxTwfnjA5') to use an account by name

// `account.author.wallets` only auto-generates an `eth` wallet by default.
// `account.chainProviders` is the canonical chain config for wallets, NFT lookups, and other chain reads.
// Defaults use multiple explicit Ethereum RPCs for `.eth` / `.bso` author-name resolution.
// Web defaults run a browser libp2p client and use multiple HTTP routers to discover peers.
// IPFS gateways and HTTP pubsub providers remain available as explicit account or app overrides.
// `account.nameResolversChainProviders` optionally overrides only the RPCs used for that resolution.
console.log(account.author.wallets.eth)

const ethResolverRpcUrls = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://ethereum.publicnode.com',
  'https://rpc.mevblocker.io',
  'https://1rpc.io/eth',
  'https://eth-pokt.nodies.app',
]

const httpRoutersOptions = [
  'https://peers.pleb.bot',
  'https://routing.lol',
  'https://peers.forumindex.com',
  'https://peers.plebpubsub.xyz',
  'https://routerofbitsocial.xyz',
  'https://bsotracker.online',
]

const author: {...account.author, displayName: 'John'}
const editedAccount = {
  ...account,
  author,
  chainProviders: {
    ...account.chainProviders,
    eth: { urls: [...ethResolverRpcUrls, 'ethers.js'], chainId: 1 },
  },
  pkcOptions: {
    ...account.pkcOptions,
    httpRoutersOptions,
  },
  nameResolversChainProviders: {
    eth: { urls: ethResolverRpcUrls, chainId: 1 },
  },
}

await setAccount(editedAccount)

// check if the user has set their .eth or .bso author name properly, use {cache: false} or it won't update
const author = {...account.author, address: 'username.bso'} // or 'username.eth'
// authorAddress should equal to account.signer.address
const {resolvedAddress, state, error, chainProvider, nameResolver} = useResolvedAuthorAddress({author, cache: false})

// result
if (state === 'succeeded') {
  console.log('Succeeded resolving address', resolvedAddress)
}
if (state === 'failed') {
  console.log('Failed resolving address', error.message)
}

// pending
if (state === 'resolving' && nameResolver) {
  console.log(`Resolving ${nameResolver.nameSystem} address from ${nameResolver.providerLabel}`)
  console.log('Matching chain provider URLs', chainProvider?.urls)
}
```

#### Delete account

> Note: deleting account is unrecoverable, warn the user to export/backup his account before deleting

```jsx
import { deleteAccount } from "@bitsocial/bitsocial-react-hooks";

// delete active account
await deleteAccount();

// delete account by name
await deleteAccount("Account KoXpxTwfnjA5");
```

#### Get your own comments and votes

```jsx
// all my own comments
const { accountComments } = useAccountComments();
for (const accountComment of accountComments) {
  // it is recommended to show a label in the UI if accountComment.state is 'pending' or 'failed'
  console.log("comment", accountComment.index, "is status", accountComment.state);
}
// `state` becomes `failed` as soon as a pending local publish records terminal failure (`publishingState === "failed"` and `state === "stopped"`) or a publish error, instead of waiting for the 20-minute fallback.
// local account comments returned by useAccountComment and useAccountComments include the account author's address and shortAddress when an older cached account comment is missing author identity fields.
// note: accountComment.index can change after deletions; prefer commentCid for stable identifiers

// all my own votes
const { accountVotes } = useAccountVotes();

// my own comments in memes.eth
const communityAddress = "memes.eth";
const myCommentsInMemesEth = useAccountComments({ communityAddress });

// my own posts in memes.eth
const filter = useCallback(
  (comment) => comment.communityAddress === communityAddress && !comment.parentCid,
  [communityAddress],
);
const myPostsInMemesEth = useAccountComments({ filter });

// my own replies in a post with cid 'Qm...'
const postCid = "Qm...";
const filter = useCallback((comment) => comment.postCid === postCid, [postCid]);
const myCommentsInSomePost = useAccountComments({ filter });

// my own replies to a comment with cid 'Qm...'
const parentCommentCid = "Qm...";
const myRepliesToSomeComment = useAccountComments({ parentCid: parentCommentCid });

// recent own comments in memes.eth, newest first, one page at a time
const recentMyCommentsInMemesEth = useAccountComments({
  communityAddress,
  newerThan: 60 * 60 * 24 * 30,
  sortType: "new",
  page: 0,
  pageSize: 20,
});

// get one own comment directly by cid
const accountComment = useAccountComment({ commentCid: "Qm..." });

// get a specific set of own comments by account comment index
const replacementReplies = useAccountComments({ commentIndices: [5, 7, 9] });

// voted profile tab helpers
const recentUpvotes = useAccountVotes({
  vote: 1,
  newerThan: 60 * 60 * 24 * 30,
  sortType: "new",
  page: 0,
  pageSize: 20,
});

// know if you upvoted a comment already with cid 'Qm...'
const { vote } = useAccountVote({ commentCid: "Qm..." });
console.log(vote); // 1, -1 or 0

// my own pending posts in a feed
const { feed } = useFeed({
  communities: [{ name: communityAddress }],
  accountComments: { newerThan: Infinity, append: false },
});

// my own pending replies in a replies feed
const { replies } = useReplies({
  comment: post,
  accountComments: { newerThan: Infinity, append: false },
});

// pending local account comments are reconciled with their approved network version
// so the same post or reply is not shown twice after moderation approval
// published account replies stay visible and are deduplicated by cid while
// canonical replies propagate; explicitly purged replies are hidden after an
// exhausted canonical feed refreshes past their timestamp
```

#### Determine if a comment is your own

```jsx
const account = useAccount();
const comment = useComment({ commentCid });
const isMyOwnComment = account?.author.address === comment?.author.address;
```

#### Get account notifications

```jsx
const { notifications, markAsRead } = useNotifications();
for (const notification of notifications) {
  console.log(notification);
}
await markAsRead();

const johnsNotifications = useNotifications({ accountName: "John" });
for (const notification of johnsNotifications.notifications) {
  console.log(notification);
}
await johnsNotifications.markAsRead();

// get the unread notification counts for all accounts
const { accounts } = useAccounts();
const accountsUnreadNotificationsCounts = accounts?.map(
  (account) => account.unreadNotificationCount,
);
```

#### Block an address (author, community or multisub)

```jsx
const address: 'community-address.eth' // or 'author-address.eth' or '12D3KooW...'
const {blocked, unblock, block} = useBlock({address})

if (blocked) {
  console.log(`'${address}' is blocked`)
}
else {
  console.log(`'${address}' is not blocked`)
}

// to block
block()

// to unblock
unblock()
```

#### Block a cid (hide a comment)

```jsx
const { blocked, unblock, block } = useBlock({ cid: "Qm..." });

if (blocked) {
  console.log(`'${cid}' is blocked`);
} else {
  console.log(`'${cid}' is not blocked`);
}

// to block
block();

// to unblock
unblock();
```

#### (Desktop only) Create a community

```jsx
const createCommunityOptions = { title: "My community title" };
const { createdCommunity, createCommunity } = useCreateCommunity(createCommunityOptions);
await createCommunity();

// it is recommended to redirect to `p/${createdCommunity.address}` after creation
if (createdCommunity?.address) {
  console.log("created community with title", createdCommunity.title);
  history.push(`/p/${createdCommunity.address}`);
}

// after the community is created, fetch it using
const { accountCommunities } = useAccountCommunities();
const accountCommunityAddresses = Object.keys(accountCommunities);
const communities = useCommunities({
  communities: accountCommunityAddresses.map((communityAddress) => ({ name: communityAddress })),
});
// or
const _community = useCommunity({ community: { name: createdCommunity.address } });
```

#### (Desktop only) Export communities

```jsx
// Export one community.
const { communityExports, exportCommunity, state, error } = useExportCommunity({
  communityAddress: "your-community-address.eth",
});
await exportCommunity();

// Export several communities at the same time.
const exportMany = useExportCommunity({
  communityAddresses: ["community-1.eth", "community-2.eth"],
});
await exportMany.exportCommunity();

// Export every community listed by the active account's pkc client.
const exportAll = useExportCommunity();
await exportAll.exportCommunity();

if (state === "succeeded") {
  console.log("started exports", communityExports);
}
if (state === "failed") {
  console.log("failed to start export", error.message);
}
```

#### (Desktop only) List the communities you created

```jsx
const { accountCommunities } = useAccountCommunities();
const ownerCommunityAddresses = Object.keys(accountCommunities).filter(
  (communityAddress) => accountCommunities[communityAddress].role?.role === "owner",
);
const communities = useCommunities({
  communities: ownerCommunityAddresses.map((communityAddress) => ({ name: communityAddress })),
});
```

#### (Desktop only) Edit your community settings

```jsx
const onChallenge = async (challenges: Challenge[], communityEdit: CommunityEdit) => {
  let challengeAnswers: string[]
  try {
    challengeAnswers = await getChallengeAnswersFromUser(challenges)
  }
  catch (e) {}
  if (challengeAnswers) {
    await communityEdit.publishChallengeAnswers(challengeAnswers)
  }
}

const onChallengeVerification = (challengeVerification, communityEdit) => {
  console.log('challenge verified', challengeVerification)
}

const onError = (error, communityEdit) => console.error(error)

// add ENS to your community
const editCommunityOptions = {
  communityAddress: '12D3KooWANwdyPERMQaCgiMnTT1t3Lr4XLFbK1z4ptFVhW2ozg1z', // the previous address before changing it
  address: 'your-community-address.eth', // the new address to change to
  onChallenge,
  onChallengeVerification,
  onError
}

await publishCommunityEdit()

// edit other community settings
const editCommunityOptions = {
  communityAddress: 'your-community-address.eth', // the address of the community to change
  title: 'Your title',
  description: 'Your description',
  onChallenge,
  onChallengeVerification,
  onError
}
const {publishCommunityEdit} = usePublishCommunityEdit(editCommunityOptions)
await publishCommunityEdit()

// verify if ENS was set correctly, use {cache: false} or it won't update
const {resolvedAddress} = useResolvedCommunityAddress({communityAddress: 'your-community-address.eth', cache: false})

// result
if (state === 'succeeded') {
  console.log('Succeeded resolving address', resolvedAddress)
  console.log('ENS set correctly', resolvedAddress === community.signer.address)
}
if (state === 'failed') {
  console.log('Failed resolving address', error.message)
}

// pending
if (state === 'resolving') {
  console.log('Resolving address from chain provider URL', chainProvider.urls)
}
```

#### Export and import account

```jsx
import {
  exportAccount,
  importAccount,
  setActiveAccount,
  setAccountsOrder,
} from "@bitsocial/bitsocial-react-hooks";

// New accounts default to `Account {author short address}`, while custom and legacy names are preserved.
const activeAccount = useAccount();
const activeAccountName = activeAccount.name;

// export active account, tell user to copy or download this json
const activeAccountJson = await exportAccount();

// import account
await importAccount(activeAccountJson);

// Importing the same identity again uses the next available numeric suffix.
const importedAccountName = `${activeAccountName} 2`;
const importedAccount = useAccount(importedAccountName);

// make imported account active account
await setActiveAccount(importedAccountName);

// reorder the accounts list
await setAccountsOrder([importedAccountName, activeAccountName]);
```

#### View the status of a comment edit

```jsx
let comment = useComment({ commentCid });
const { state: editedCommentState, editedComment } = useEditedComment({ comment });

// if the comment has a succeeded, failed or pending edit, use the edited comment
if (editedComment) {
  comment = editedComment;
}

let editLabel;
if (editedCommentState === "succeeded") {
  editLabel = { text: "EDITED", color: "green" };
}
if (editedCommentState === "pending") {
  editLabel = { text: "PENDING EDIT", color: "orange" };
}
if (editedCommentState === "failed") {
  editLabel = { text: "FAILED EDIT", color: "red" };
}
```

#### View the status of a specific comment edit property

```jsx
const comment = useComment({ commentCid });
const editedComment = useEditedComment({ comment });
if (editedComment.failedEdits.removed !== undefined) {
  console.log("failed editing comment.removed property");
}
if (editedComment.succeededEdits.removed !== undefined) {
  console.log("succeeded editing comment.removed property");
}
if (editedCommentResult.pendingEdits.removed !== undefined) {
  console.log("pending editing comment.removed property");
}

// view the full comment with all edited properties (both succeeded and pending)
console.log(editedComment.editedComment);
console.log(editedComment.editedComment.commentModeration?.removed);

// view the state of all edits of the comment
console.log(editedComment.state); // 'unedited' | 'succeeded' | 'pending' | 'failed'
```

Moderation fields are mirrored on both the top-level keys like `comment.removed` and the nested `comment.commentModeration.removed` shape.

#### List all comment and community edits the account has performed

```jsx
const { accountEdits } = useAccountEdits();
for (const accountEdit of accountEdits) {
  console.log(accountEdit);
}
console.log(`there's ${accountEdits.length} account edits`);

// get only the account edits of a specific comment
const commentCid = "Qm...";
const filter = useCallback((edit) => edit.commentCid === commentCid, [commentCid]); // important to use useMemo or the same function or will cause rerenders
const { accountEdits } = useAccountEdits({ filter });

// only get account edits in a specific community
const communityAddress = "news.eth";
const filter = useCallback(
  (edit) => edit.communityAddress === communityAddress,
  [communityAddress],
);
const { accountEdits } = useAccountEdits({ filter });
```

#### Get replies to a post (nested or flat)

```jsx
import { useReplies, useComment, useAccountComment } from "@bitsocial/bitsocial-react-hooks";

// NOTE: recommended to use the same replies options for all depths, or will load slower
const useRepliesOptions = {
  sortType: "best",
  flat: false,
  repliesPerPage: 20,
  onlyIfCached: false,
  accountComments: { newerThan: Infinity, append: false },
};

// accountComments keeps pending and published local replies visible while
// canonical replies propagate and deduplicates them by cid; explicitly purged
// replies are hidden after an exhausted feed refreshes past their timestamp

const Reply = ({ reply, updatedReply }) => {
  const { replies, updatedReplies, bufferedReplies, hasMore, loadMore } = useReplies({
    ...useRepliesOptions,
    comment: reply,
  });

  // updatedReply updates values in real time, reply does not
  const score = (updatedReply?.upvoteCount || 0) - (updatedReply?.downvoteCount || 0);

  // bufferedReplies updates in real time, can show new replies count in real time
  const moreReplies =
    hasMore && bufferedReplies?.length !== 0 ? `(${bufferedReplies.length} more replies)` : "";

  // publishing states exist only on account comment
  const accountReply = useAccountComment({ commentIndex: reply.index });
  const state = accountReply?.state;
  const publishingStateString = useStateString(accountReply);

  return (
    <div>
      <div>
        {score} {reply.author.address} {reply.timestamp} {moreReplies}
      </div>
      {state === "pending" && <div>PENDING ({publishingStateString})</div>}
      {state === "failed" && <div>FAILED</div>}
      <div>{reply.content}</div>
      <div style={{ marginLeft: 4 }}>
        {replies.map((reply, index) => (
          <Reply
            key={reply?.index || reply?.cid}
            reply={reply}
            updatedReply={updatedReplies[index]}
          />
        ))}
      </div>
    </div>
  );
};

const comment = useComment({ commentCid });
const { replies, updatedReplies, hasMore, loadMore } = useReplies({
  ...useRepliesOptions,
  comment,
});
const repliesComponents = replies.map((reply, index) => (
  <Reply key={reply?.index || reply?.cid} reply={reply} updatedReply={updatedReplies[index]} />
));
```

#### Format short CIDs and addresses

```jsx
import { useShortAddress, useShortCid } from "@bitsocial/bitsocial-react-hooks";

const shortParentCid = useShortCid(comment.parentCid);
const shortAddress = useShortAddress(address);
```

#### useBufferedFeeds with concurrency

```jsx
const useBufferedFeedsWithConcurrency = ({feedOptions}) => {

  const communities = useCommunities()

  return useBufferedFeeds({feedsOptions})
}

const feedOptions = [
  {communities: [{name: 'news.eth'}, {name: 'crypto.eth'}], sortType: 'new'},
  {communities: [{name: 'memes.eth'}], sortType: 'topWeek'},
  {communities: [{publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}, {publicKey: '12D3KooW...'}], sortType: 'hot'},
  ...
]

useBufferedFeedsWithConcurrency({feedOptions})
```
