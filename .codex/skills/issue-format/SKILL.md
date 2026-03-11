---
name: issue-format
description: Formats GitHub issue suggestions with a short title and informal problem description. Use when proposing GitHub issues for bugs, features, or improvements discovered during work.
---

# Issue Format

## Template

```
> **GitHub issue:**
> - **Title:** `short issue title here`
> - **Description:** 2-3 sentences describing the problem as if unresolved.
```

## Rules

1. Title is as short as possible, wrapped in backticks
2. Description describes the **problem**, not the solution
3. Write as if the issue hasn't been fixed yet
4. Use backticks for code references in the description
5. Keep it informal and concise — 2-3 sentences max

## Example

```
> **GitHub issue:**
> - **Title:** `useReplies returns stale data after reset`
> - **Description:** When calling `reset()` on `useReplies`, subsequent `loadMore` calls return previously cached replies instead of fetching fresh data. This causes the UI to show outdated replies after a user manually refreshes a thread.
```
