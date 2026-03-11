---
name: commit
description: Commit current work by reviewing diffs, splitting into logical commits, and writing standardized messages. Use when the user says "commit", "commit this", "commit current work", or asks to create a git commit.
disable-model-invocation: true
---

# Commit Current Work

## Workflow

1. **Review all uncommitted changes**

   ```bash
   git status
   git diff
   git diff --cached
   ```

   Read every changed file's diff to understand the full scope of changes.

2. **Group changes into logical commits**

   If diffs are unrelated, split into multiple commits. Each commit should cover one logical unit of work.

   Example — two unrelated changes in the working tree:
   - Modified `src/hooks/comments.ts` (bug fix)
   - Modified `src/stores/feeds/feeds-store.ts` (new feature)

   These should be two separate commits, not one.

3. **Stage and commit each group**

   For each logical group:
   ```bash
   git add <relevant files>
   git commit -m "title here"
   ```

4. **Display the commit title to the user** wrapped in backticks (inline code).

## Commit Message Rules

- **Title format:** Conventional Commits with a **required scope**. The scope should be a short, human-readable name for the area of the codebase affected.

  | Pattern | Example |
  |---------|---------|
  | `type(scope): description` | `fix(feeds): handle empty subplebbit addresses array` |

- **Never omit the scope.** `feat: add hook` is wrong. `feat(replies): add flat mode to useReplies` is correct.
- **Keep titles short.** If more context is needed, add a commit body — but don't repeat the title.
- **Use `perf:` for performance optimizations**, not `fix:`.

## Constraints

- Only commit when instructed. Do not commit subsequent changes unless explicitly told to.
- Never push — only commit locally.
- Never amend commits that have been pushed to a remote.
