# Known Surprises

This file tracks repository-specific confusion points that caused agent mistakes.

## Entry Criteria

Add an entry only if all are true:

- It is specific to this repository (not generic advice).
- It is likely to recur for future agents.
- It has a concrete mitigation that can be followed.

If uncertain, ask the developer before adding an entry.

## Entry Template

```md
### [Short title]

- **Date:** YYYY-MM-DD
- **Observed by:** agent name or contributor
- **Context:** where/when it happened
- **What was surprising:** concrete unexpected behavior
- **Impact:** what went wrong or could go wrong
- **Mitigation:** exact step future agents should take
- **Status:** confirmed | superseded
```

## Entries

### GitHub Projects are not used for repository workflow

- **Date:** 2026-07-23
- **Observed by:** Codex
- **Context:** finalizing a merged pull request with the `review-and-merge-pr` skill
- **What was surprising:** the skill still referenced an organization project and project item even though this repository no longer uses GitHub Projects.
- **Impact:** agents can waste time querying a nonexistent project or report a successful merge as incomplete.
- **Mitigation:** keep pull-request review and merge workflows independent of GitHub issues and Projects; only create or manage an issue when the user explicitly requests one.
- **Status:** confirmed

### Agent model names are toolchain-specific

- **Date:** 2026-04-08
- **Observed by:** Codex
- **Context:** reviewing repo-managed agent manifests under `.codex/`, `.cursor/`, and `.claude/`
- **What was surprising:** provider/model names are not interchangeable across toolchains in this repo. `composer-2` is valid for Cursor, but not for Claude. Codex agents should use `gpt-5.4`, not `gpt-5.3-codex` or `gpt-5.3-codex-spark`.
- **Impact:** agents can silently pick unsupported or poor-performing models and break contributor workflows.
- **Mitigation:** keep the repo model mapping explicit when editing agent manifests: `.codex` → `gpt-5.4`, `.cursor` → `composer-2`, `.claude` → `sonnet`.
- **Status:** confirmed

### Browser test screenshots are generated under `test/**/__screenshots__/`

- **Date:** 2026-03-04
- **Observed by:** Codex
- **Context:** reviewing unexpected untracked PNG files after browser test runs
- **What was surprising:** Vitest browser tests can generate screenshot artifacts under `test/browser-pkc-js-mock/__screenshots__/`, but the repo did not ignore them.
- **Impact:** agents may mistake generated screenshots for intended source files or leave noisy untracked changes behind.
- **Mitigation:** treat `test/**/__screenshots__/` as generated output and keep it gitignored.
- **Status:** confirmed

### updatedAt-only page comment indexing can drop pending comments

- **Date:** 2026-03-05
- **Observed by:** agent
- **Context:** replies-pages and communities-pages stores; indexing comments by `updatedAt` only
- **What was surprising:** indexing page comments solely by `updatedAt` can drop pending comments that have not yet received an `updatedAt` value.
- **Impact:** pending comments may be omitted from page results or overwritten.
- **Mitigation:** use missing-or-fresher logic with timestamp fallback when merging/indexing page comments.
- **Status:** confirmed

### Vitest `root: "src/"` causes coverage output under `src/coverage/`

- **Date:** 2026-03-06
- **Observed by:** agent
- **Context:** `config/vitest.config.js` sets `root: "src/"`; coverage reports use `--coverage.reportsDirectory=./coverage`
- **What was surprising:** With `root: "src/"`, Vitest resolves `./coverage` relative to the root, so coverage files land in `src/coverage/` instead of repo-root `coverage/`.
- **Impact:** Verifier and triage scripts that expect `coverage/` at repo root fail with "missing summary" until path resolution supports both locations.
- **Mitigation:** `scripts/verify-hooks-stores-coverage.mjs` checks both `coverage/coverage-summary.json` and `src/coverage/coverage-summary.json`, preferring repo-root when both exist. Triage helper supports both paths for `coverage-final.json`.
- **Status:** confirmed

### GitHub comments must never include raw local verification output or absolute paths

- **Date:** 2026-03-16
- **Observed by:** Codex
- **Context:** posting PR review updates with `gh pr comment` during `review-and-merge-pr`; reconfirmed on PR #49 on 2026-04-14
- **What was surprising:** shell command substitution from backticks in a comment body can inject raw local command output, including absolute filesystem paths like the contributor's workspace path.
- **Impact:** agents can leak local directory names and dump noisy verification logs into public GitHub comments.
- **Mitigation:** when using `gh` to create comments/issues/PR bodies in this repo, always pass content via a single-quoted heredoc or body file and summarize verification results instead of pasting raw command output or absolute local paths.
- **Status:** confirmed
