---
title: Your first feed
description: Add a Bitsocial feed to a React app, with accounts, pagination, and useful loading states already connected.
group: Start building
order: 1
---

Start with a feed. Bring your own components and styling; the hooks connect them to Bitsocial communities and their posts.

## Install in your React app

From an existing React application's directory, run:

```sh
yarn add @bitsocial/bitsocial-react-hooks
```

The package supports React 16.8 and later. Use Node.js 22 or later for your development environment. A browser-rendered React app, such as a Vite app, is a straightforward place to begin.

You do not need to add a provider or create an account manually. The library loads the browser's saved accounts and creates a default local account if none exist.

## Pick a community

Get a real community name or public key from the community you want to display. A name is passed as `{ name: communityName }`; a public key is passed as `{ publicKey: communityPublicKey }`.

The component below accepts the name as a prop, so you can connect it to a route, a community picker, or your app's configuration. It does not assume a particular community is online.

## Render the feed

Save this as `Feed.jsx` in your app:

```jsx
import {
  useAccount,
  useFeed,
} from "@bitsocial/bitsocial-react-hooks";

export default function Feed({ communityName = "" }) {
  const name = communityName.trim();
  const account = useAccount();
  const { feed, hasMore, loadMore, error } = useFeed({
    communities: name ? [{ name }] : [],
    postsPerPage: 20,
  });

  if (!name) {
    return <p>Choose a community to see its posts.</p>;
  }

  return (
    <section aria-label={`Posts from ${name}`}>
      {error && <p role="alert">{error.message}</p>}

      {!account && <p role="status">Opening your local account…</p>}

      {account && feed.length === 0 && (
        <p role="status">
          {hasMore ? "Waiting for posts…" : "No posts to show."}
        </p>
      )}

      {feed.map((post) => (
        <article key={post.cid}>
          <h2>{post.title || "Untitled post"}</h2>
          <p>{post.content}</p>
          <small>
            {post.author?.displayName ||
              post.author?.shortAddress ||
              "Anonymous"}
          </small>
        </article>
      ))}

      {account && feed.length > 0 && hasMore && (
        <button type="button" onClick={() => void loadMore()}>
          Load more
        </button>
      )}
    </section>
  );
}
```

Render `<Feed communityName={yourCommunityName} />` from your app, using the real name you chose. For a public key, change the `communities` entry to `{ publicKey: yourCommunityPublicKey }`.

The hook starts loading when the local account is ready. Omitting `sortType` lets it use the community's preloaded sort. Content renders as it arrives, and `loadMore()` requests the next page.

## Make loading feel right

An empty array can mean that data has not arrived yet. It does not, by itself, mean the community has no posts. Keep already loaded posts visible while more arrive, show available errors, and treat `hasMore` as a pagination signal.

Do not wait for `useFeed().state === "succeeded"` before displaying content: the feed's current state is tied to whether it has more pages. Likewise, awaiting `loadMore()` does not mean the network has finished loading that page.

## Using a framework with server rendering?

The package accesses browser APIs, including `window`, when imported. Keep the import and the component that uses it out of server execution. Use your framework's client-only loading mechanism with server rendering disabled for that component; a client-component directive alone may still allow server prerendering.

Browser storage holds the local account and cache. Treat account backup and recovery as part of your app's account experience before encouraging people to rely on it.

## Build the next piece

- [Understand accounts, shared state, and publishing](concepts.md).
- [Explore feed options](../../docs/reference.md#feeds-hooks) for sorting, filtering, and preloading.
- [Read a post and its comments](../../docs/reference.md#comments-hooks).
- [Add publishing](../../docs/reference.md#create-a-post-or-comment-using-hooks) with a challenge and cancellation flow.
- [Give your coding assistant the docs](ai.md).
