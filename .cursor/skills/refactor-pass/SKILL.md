---
name: refactor-pass
description: Perform a refactor pass focused on simplicity after recent changes. Use when the user asks for a refactor/cleanup pass, simplification, dead-code removal, or says "refactor pass".
---

# Refactor Pass

## Workflow

1. **Review recent changes** — identify simplification opportunities:
   - `git diff` for unstaged changes
   - `git diff --cached` for staged changes
   - `git log --oneline -5` for recent commits if no uncommitted changes

2. **Apply refactors** (in priority order):
   - Remove dead code and unreachable paths
   - Straighten convoluted logic flows
   - Remove excessive parameters or intermediary variables
   - Remove premature optimization (unnecessary memoization, etc.)
   - Extract duplicated logic into shared utilities in `src/lib/`

3. **Verify** — run build:
   ```bash
   yarn build && yarn test
   ```

4. **Optional suggestions** — identify abstractions or reusable patterns only if they clearly improve clarity. Keep suggestions brief; don't refactor speculatively.

## Project-Specific Patterns to Enforce

When refactoring, watch for these anti-patterns from AGENTS.md:

| Anti-pattern | Refactor to |
|---|---|
| `useEffect` syncing derived state | Calculate during render |
| Duplicated logic across hooks | Shared utility in `src/lib/` |
| Inline types for cross-module data | Move to `src/types.ts` |
| `as any` type casts | Fix the underlying type |
| Overly complex store actions | Split into smaller, focused actions |

## Rules

- Don't change behavior — refactors must be semantically equivalent
- Don't introduce new dependencies
- Format edited files with `yarn prettier` after changes
- If the build/tests fail after refactoring, fix before finishing
- Do not rename `plebbit`/`subplebbit` terms
