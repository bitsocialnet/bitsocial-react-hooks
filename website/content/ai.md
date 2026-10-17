---
title: Build with AI
description: Give your coding assistant focused documentation, a clear starting prompt, and the current public API.
group: Start building
order: 3
---

Give your coding assistant the same starting point you would give another developer: the package name, a small feature to build, and the relevant documentation.

## Choose the right amount of context

- [llms.txt](../../llms.txt) is the compact entry point to the documentation.
- [llms-full.txt](../../llms-full.txt) contains the expanded documentation for assistants that need more context.
- [Quickstart as Markdown](quickstart.md?raw=1) gives an assistant the first-feed example without the website interface.
- [Core concepts as Markdown](concepts.md?raw=1) explains accounts, loading, and publication behavior.
- [This page as Markdown](ai.md?raw=1) keeps the starting prompt easy to reuse.

Start with the compact index and the page for the feature you need. Use the full file when your tool cannot follow documentation links, or when the work spans several parts of the package.

These files are documentation context. The installed package's exports, types, source, and tests remain the authority for what that version supports.

## A starting prompt

Copy this into your coding assistant and supply your app and community details:

```text
Help me add a Bitsocial feed to my existing React app using
@bitsocial/bitsocial-react-hooks.

Read the docs site's /llms.txt, /docs/quickstart.md, and
/docs/concepts.md first. Ask me for the docs site's base URL
if it is not already available in this conversation.

Inspect the app and installed package version before editing.
Use a real community identifier that I supply, or leave a clearly
labeled configuration value for it. Do not invent a live community.

Build a browser-rendered feed with useFeed, pagination, and useful
loading, empty, and error feedback. Keep loaded posts visible while
more data arrives. Reuse my app's components and styling.

No provider setup is required. Account initialization is automatic
and asynchronous. Prevent server evaluation of browser-only imports
if this app uses server rendering.

Verify the affected behavior and report what was checked. Keep the
scope to this feature; do not publish content or deploy the app.
```

For a new app, change the first sentence to describe what you want to make: a discussion forum, a reading app, a community browser, or another interface. Keep the first milestone small enough to run and inspect.

## Give it a useful next task

Once the feed works, ask for one complete interaction at a time:

- Open a post and load its replies using the [comment hooks](../../docs/reference.md#comments-hooks).
- Add a community picker and pagination using the [feed hooks](../../docs/reference.md#feeds-hooks).
- Add a post form with challenge handling, pending feedback, and cancellation using the [publishing recipe](../../docs/reference.md#create-a-post-or-comment-using-hooks).

For publishing tasks, explicitly ask the assistant to distinguish “attempt started” from “accepted by the community.” Awaiting `publishComment()` is not publication confirmation.

## Keep examples aligned with the package

If an assistant suggests a provider, a `communityAddresses` feed option, or waiting for `useFeed().state === "succeeded"` before rendering any posts, have it check the current documentation and source.

The public package name is `@bitsocial/bitsocial-react-hooks`. Reading hooks use community identifier objects such as `{ name }` or `{ publicKey }`. Hook options and result fields can change between versions, so resolve disagreements against the version your app actually uses.

The docs and website source live with the [open-source library](https://github.com/bitsocialnet/bitsocial-react-hooks). Documentation improvements can travel with the code they describe.
