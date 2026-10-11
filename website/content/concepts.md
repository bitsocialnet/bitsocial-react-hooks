---
title: How the hooks fit together
description: The small set of concepts behind feeds, local accounts, shared state, and publishing to Bitsocial.
group: Start building
order: 2
---

Your app owns the interface. The hooks connect it to shared protocol state: communities, posts, replies, authors, accounts, and the actions people take.

## Hooks read shared stores

The library uses Zustand stores underneath its React hooks. Components select the data they need; stores handle protocol requests, cached data, and subscriptions. There is no provider component to wrap around your app.

```jsx
const community = useCommunity({
  community: { name: communityName },
});

const { feed } = useFeed({
  communities: [{ name: communityName }],
});
```

Use these hooks wherever the data belongs in your component tree. Shared stores let components reuse fetched data and existing requests. You do not need a separate fetching effect that copies the same content into your own state.

Feed options such as the account, communities, sort, and filter identify a feed. Different options can intentionally produce different feeds. A custom filter needs a stable `key` that describes its behavior so its cached results can be identified correctly.

## A local account starts automatically

The account store restores accounts from browser storage when the library loads. If there are none, it creates a default account and signer. This happens asynchronously, so `useAccount()` can initially return `undefined`.

```jsx
const account = useAccount();

return (
  <p>
    {account
      ? `Posting as ${account.author?.shortAddress}`
      : "Opening your local account…"}
  </p>
);
```

Hooks use the active account by default. Where an options argument accepts `accountName`, pass `{ accountName }` to select another one. An account also carries local preferences and history, such as subscriptions, saved comments, and pending publications.

An account is stored in the browser, not recovered through an email login. Include export, import, and clear explanations of local storage in an app intended for everyday use.

## Communities have identifiers

Reading hooks accept a community identifier object: `{ name }`, `{ publicKey }`, or both. A feed accepts an array of these objects so it can combine several communities.

Posts and replies are comments in the protocol. A published comment has a content identifier, or CID. Read it with `useComment({ commentCid })`; pass the resulting comment to `useReplies({ comment })` to load its replies.

```jsx
const comment = useComment({ commentCid });
const { replies, hasMore, loadMore } = useReplies({
  comment,
  repliesPerPage: 20,
});
```

`useComment` follows updates by default. Replies can be nested or flat. Use the same replies options throughout a nested thread where possible to reuse the same loading path.

## Data arrives progressively

Cached content, a comment's original content, and later updates can become available at different times. Render what you have and show loading or error feedback alongside it. Avoid hiding useful content every time a request is in progress.

For feeds and replies, `hasMore` drives pagination. Their `state` fields are not a promise that every network operation is idle. In particular, a feed with visible posts can still have the state `fetching-ipns` while more pages are available.

Use `loadMore()` to request more items and `reset()` to rebuild a feed. The return of a pagination call is not a signal that all requested items have arrived. Let the hook's data drive rendering.

## Publishing is a conversation with a community

`usePublishComment` creates posts and replies. Supply a `communityAddress` and content; add a `title` for a post or `parentCid` for a reply. The selected account supplies the signing identity.

```jsx
const publication = usePublishComment({
  communityAddress,
  title,
  content,
});

// Call from a submit handler.
await publication.publishComment();
```

That awaited call starts the publication flow. It does **not** confirm that the community has accepted the post.

1. A pending local comment becomes available through the result's `index`.
2. A community may send a `challenge` message. Your interface presents its `challenges` and collects answers.
3. Call `publishChallengeAnswers(answers)` with an array of strings in challenge order.
4. Observe `challengeVerification.challengeSuccess`, errors, and the pending comment's eventual `cid` to show the outcome.

Use `useAccountComment({ commentIndex: index })` to display the pending comment. Check `index !== undefined`, because zero is a valid index. If the person cancels the flow, call `abandonPublish()` to cancel the pending attempt and remove its local pending comment.

Some failed challenge answers trigger another challenge attempt. Terminal community rejections do not. Build feedback and cancellation into the form rather than assuming every failure should be retried by your app.

For replies, `accountComments: { newerThan: Infinity }` can keep local pending replies visible while canonical replies propagate. Pending comments may not have a CID yet; use their local index as a fallback key.

## Choose where to go next

- [Feed hooks](../../docs/reference.md#feeds-hooks) cover pagination and feed configuration.
- [Comment hooks](../../docs/reference.md#comments-hooks) cover individual content and its updates.
- [Action hooks](../../docs/reference.md#actions-hooks) cover publishing, votes, subscriptions, and moderation.
- [The publishing recipe](../../docs/reference.md#create-a-post-or-comment-using-hooks) shows the challenge flow in more detail.
