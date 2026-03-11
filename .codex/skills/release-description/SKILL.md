---
name: release-description
description: Generate a release description by analyzing commit titles since the last git tag. Use when the user asks to prepare release notes, update changelog, or describe what's in a new version.
---

# Release Description

Generate a release summary by analyzing commits since the last tag.

## Steps

### 1. Find the latest release tag

```bash
git tag --sort=-creatordate | head -1
```

### 2. List commit titles since that tag

```bash
git log --oneline <tag>..HEAD
```

If there are no commits since the tag, stop — nothing to update.

### 3. Analyze the commits

Categorize by Conventional Commits prefix:

| Prefix | Category |
|--------|----------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `perf:` | Performance improvements |
| `refactor:` | Refactors / internal changes |
| `chore:`, `docs:`, `ci:` | Maintenance (mention only if significant) |
| No prefix | Read the title to infer category |

### 4. Write the summary

Compose a concise release description. Rules:

- **Start with** "This version..." or "This release..."
- **Be concise** — a few sentences, not a full changelog
- **Highlight the most impactful changes** — lead with the biggest features or fixes
- **Group similar changes** — e.g. "several bug fixes" instead of listing each one
- **Use plain language** — this is user-facing, not developer-facing

### 5. Report

Display the release description to the user for review.
