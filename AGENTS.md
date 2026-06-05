# AGENTS.md

## Purpose

This file defines the always-on rules for AI agents working on bitsocial-react-hooks.
Use this as the default policy. Load linked playbooks only when their trigger condition applies.

## Surprise Handling

The role of this file is to reduce recurring agent mistakes and confusion points in this repository.
If you encounter something surprising or ambiguous while working, alert the developer immediately.
After confirmation, add a concise entry to `docs/agent-playbooks/known-surprises.md` so future agents avoid the same issue.
Only record items that are repo-specific, likely to recur, and have a concrete mitigation.

## Project Overview

bitsocial-react-hooks (`@bitsocial/bitsocial-react-hooks`) is a React hooks library for the Bitsocial protocol. It provides React hooks and Zustand stores for interacting with decentralized communities — fetching comments, feeds, author data, publishing, account management, and more.

This repository is its own project under the bitsocialnet org. Use `pkc`, `community`, and `pkc-js` naming consistently in code, tests, docs, and file names.

## Instruction Priority

- **MUST** rules are mandatory.
- **SHOULD** rules are strong defaults unless task context requires a different choice.
- If guidance conflicts, prefer: user request > MUST > SHOULD > playbooks.

## Agent Operating Principles

- Before editing, state important assumptions when the task is ambiguous. Ask instead of silently choosing between materially different interpretations.
- Prefer the smallest implementation that solves the requested problem. Do not add speculative abstractions, configurability, or features.
- Keep diffs surgical. Do not refactor, reformat, rename, or "improve" adjacent code unless it is necessary for the task.
- Clean up only artifacts created by the current change, such as newly unused imports or dead helper code.
- For non-trivial work, define success criteria and verify them with the narrowest reliable checks before marking the task complete.

## LLM Knowledge Base Policy

Use compiled context for orientation, not as source of truth.

Source of truth:

- Code, tests, package manifests, docs, and runtime/live evidence when relevant.

Compiled context:

- `AGENTS.md`, directory-specific `AGENTS.md` files, `CLAUDE.md`, and repo-managed `.codex/`, `.cursor/`, and `.claude/` workflow files.
- `docs/agent-playbooks/**`, `docs/agent-runs/**`, `docs/agent-playbooks/known-surprises.md`, and tracked `llms.txt` / `llms-full.txt` files when present.

Agents may use compiled context to navigate quickly, but must verify against source files before making behavioral claims or edits. External code graph, RAG, MCP, or wiki tools are optional local accelerators unless the developer explicitly asks to make one part of the committed workflow.
For very large non-source artifacts such as CI logs, debug traces, generated JSON, or massive tool output, contributors may optionally use `chopratejas/headroom` or a similar local compression tool as a navigation aid, but agents must verify conclusions against the original uncompressed artifact before editing code or making final claims.

## Task Router (Read First)

| Situation | Required action |
|---|---|
| Hook or store logic changed (`src/hooks/`, `src/stores/`) | Follow architecture rules below; run `yarn build` |
| `package.json` changed | Run `yarn install` to keep `yarn.lock` in sync |
| Bug report in a specific file/line | Start with git history scan from `docs/agent-playbooks/bug-investigation.md` before editing |
| Public API changed (`src/index.ts`, `src/types.ts`) | Ensure backward compatibility; update README if signatures changed |
| User-facing behavior/feature added or changed | Update `README.md` usage/docs in the same task before marking work complete |
| Public docs or AI context changed (`README.md`, `docs/**/*.md`, `AGENTS.md`, or `scripts/generate-llms-files.mjs`) | Run `yarn llms:generate`; inspect and commit any resulting changes to `llms*.txt` so LLM indexes stay current |
| Tests added or changed (`src/**/*.test.ts`, `test/`) | Run `yarn test` to verify |
| New reviewable feature/fix/docs/chore started while on `master` | Create a short-lived `feature/*`, `fix/*`, `docs/*`, or `chore/*` branch from `master` before editing; use a separate worktree only for parallel tasks |
| New unrelated task started while another task branch is already checked out or being worked on by another agent | Create a separate worktree from `master`, create a new short-lived task branch there, and keep each agent on its own worktree/branch/PR |
| User wants a tracked issue/PR for work already done | Use the `make-closed-issue` skill to create the issue, push the task branch, and open a PR that closes it on merge |
| Open PR needs feedback triage or merge readiness check | Use the `review-and-merge-pr` skill to inspect CI/reviewer feedback, fix valid findings, and merge only after verification |
| Repo AI workflow files changed (`.codex/**`, `.cursor/**`, `.claude/**`) | Keep the Codex, Cursor, and Claude copies aligned when they represent the same workflow; update `AGENTS.md` if the default agent policy changes |
| GitHub operation needed | Use `gh` CLI, not GitHub MCP |
| User asks for commit/issue phrasing | Use `docs/agent-playbooks/commit-issue-format.md` |
| Repo AI workflow files changed (`.codex/**`, `.cursor/**`, `.claude/**`) | Keep the Codex, Cursor, and Claude copies aligned when they represent the same workflow |
| Surprising/ambiguous repo behavior encountered | Alert developer and, once confirmed, document in `docs/agent-playbooks/known-surprises.md` |

## Stack

- TypeScript
- React (peer dependency, >=16.8)
- Zustand 4 for state management
- Vitest for unit tests
- Playwright for e2e tests
- Prettier for formatting
- Node 22 LTS via `nvm`
- Corepack-managed Yarn 4

## Project Structure

```text
src/
├── hooks/         # React hooks (accounts, actions, authors, comments, feeds, replies, states, rpc)
├── stores/        # Zustand stores (accounts, authors-comments, comments, feeds, replies, replies-pages, communities, communities-pages)
├── lib/           # Utilities (chain, debug-utils, localforage-lru, protocol client mock/integration, utils, validator)
├── index.ts       # Public API exports
└── types.ts       # Type definitions
```

## Core MUST Rules

### Package and Dependency Rules

- Use Node 22 via `.nvmrc` and Corepack-managed Yarn 4, never npm/pnpm/bun or a global Yarn v1 install.
- Pin exact dependency versions (`package@x.y.z`), never `^` or `~`.
- Keep lockfile synchronized when dependency manifests change.

### Architecture Rules

- Zustand stores in `src/stores/` are the backbone of state management. Hooks in `src/hooks/` are thin wrappers that select from these stores.
- Do not introduce `useEffect` for data fetching in hooks. Data flows through store subscriptions and event listeners.
- Derive state during render when possible — avoid syncing derived state with effects.
- Keep hooks focused and composable. Each hook should do one thing.
- The public API surface is `src/index.ts`. Every exported hook/function must be re-exported there.

### Code Organization Rules

- Keep files focused; split large stores or hooks when they exceed ~300 lines.
- Shared utilities go in `src/lib/`. Hook-specific helpers stay co-located in the hook's directory.
- Type definitions that cross module boundaries go in `src/types.ts`.
- Add comments for complex/non-obvious code; skip obvious comments.

### Git Workflow Rules

- Keep `master` reviewable. Do not treat `master` as a scratch branch.
- If the user asks for a reviewable feature/fix/docs/chore and the current branch is `master`, create a short-lived task branch before making code changes unless the user explicitly asks to work directly on `master`.
- Name short-lived branches by intent: `feature/*`, `fix/*`, `docs/*`, `chore/*`.
- Open PRs from task branches into `master` so review bots and humans can inspect the actual change before merge.
- Never open draft PRs. PRs created by agents must be ready for review unless the user explicitly asks not to open a PR yet.
- Prefer short-lived task branches over a long-lived `develop` branch unless the user explicitly asks for a staging-branch workflow.
- Use worktrees only when parallel tasks need isolated checkouts. One active task branch per worktree.
- If a new task is unrelated to the currently checked out branch, do not stack it on that branch. Create a new worktree from `master` and create a separate short-lived task branch there.
- Always give a new worktree a descriptive name that reflects the task (e.g. `fix-login-redirect`, not `wt1`, `tmp`, `feature`, or a numbered slug), so it can be identified at a glance in a long list of worktrees.
- Treat branch and worktree as different things: the branch is the change set; the worktree is the checkout where that branch is worked on.
- For parallel unrelated tasks, give each task its own branch from `master`, its own worktree, and its own PR into `master`.
- After a reviewed branch is merged, prefer deleting it to keep branch drift and merge conflicts low.

### Documentation Rules

- Keep `README.md` current for all user-facing features, behavior changes, and new workflows.
- Do not mark a feature task complete until corresponding README usage/docs are updated.

### Naming and Branding Rules

- Prefer `pkc`, `community`, and `pkc-js` naming in new or renamed code.
- Do not introduce or preserve older protocol naming in code, tests, docs, or migrations unless the user explicitly asks for a compatibility bridge.
- Package name and import path is `@bitsocial/bitsocial-react-hooks`. Use this in README examples and docs.

### Bug Investigation Rules

- For bug reports tied to a specific file/line, check relevant git history before any fix.
- Minimum sequence: `git log --oneline` or `git blame` first, then scoped `git show` for relevant commits.
- Full workflow: `docs/agent-playbooks/bug-investigation.md`.

### Verification Rules

- Never mark work complete without verification.
- Run `nvm install && nvm use`, then `corepack enable` once per machine before using the commands below.
- After code changes, run: `yarn build`.
- After test changes, run: `yarn test`.
- Do not commit local `dist/` rebuild output. `dist/` is CI-managed in this repo; if verification dirties tracked files there, run `git restore --worktree -- dist` before committing.
- Maintain mandatory 100% test coverage for hooks and stores (`src/hooks/`, `src/stores/`); every feature or bug fix in these areas must include/adjust tests to keep coverage at 100%, verified via coverage run + `node scripts/verify-hooks-stores-coverage.mjs`.
- Before committing, run: `yarn prettier` to format.
- If verification fails, fix and re-run until passing.

### Tooling Constraints

- Use `gh` CLI for GitHub work (issues, PRs, actions, search).
- Do not use GitHub MCP.
- Do not use browser MCP servers.
- Never paste raw logs, command output, or absolute local filesystem paths into GitHub comments, PR bodies, or issue bodies.
- When sending any GitHub comment/body via `gh`, use `--body-file` with a single-quoted heredoc or a literal file. Do not inline shell-interpolated strings that contain backticks, command substitutions, or captured command output.
- If many MCP tools are present in context, warn user and suggest disabling unused MCPs.

### AI Tooling Rules

- Treat `.codex/`, `.cursor/`, and `.claude/` as repo-managed contributor tooling, not private scratch space.
- Keep equivalent workflow files aligned across all toolchains when their directories contain the same skill, hook, or agent.
- Agent model mapping in this repo is toolchain-specific: use `gpt-5.4` for `.codex`, `composer-2` for `.cursor`, and `sonnet` for `.claude`.
- Never use `composer-2` in `.claude/` files.
- Never use `gpt-5.3-codex` or `gpt-5.3-codex-spark` in `.codex/` files; use `gpt-5.4` instead.
- When changing shared agent behavior, update the relevant files in `.codex/skills/`, `.cursor/skills/`, `.claude/skills/`, `.codex/agents/`, `.cursor/agents/`, `.claude/agents/`, `.codex/hooks/`, `.cursor/hooks/`, `.claude/hooks/`, and their `hooks.json` or config entry points as needed.
- If `AGENTS.md` references a skill, agent, or hook, prefer a tracked file under `.codex/`, `.cursor/`, or `.claude/` rather than an untracked local-only instruction.
- When adding or changing repo-managed skills, agents, or hooks, commit the matching `.codex/`, `.cursor/`, and `.claude/` files in the same task so the workflow change is reviewable.
- Review `.codex/hooks.json`, `.cursor/hooks.json`, and `.claude/hooks.json` before changing agent orchestration or hook behavior, because they are the entry points contributors will actually load.
- When a diff adds new `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, or `memo(...)` usage under `src/`, treat the repo hook reminder as mandatory and reconsider the change with `you-might-not-need-an-effect` and `vercel-react-best-practices` before finishing.

### Security and Boundaries

- Never commit secrets or API keys.
- Never push to a remote unless the user explicitly asks.

## Core SHOULD Rules

- Keep context lean: delegate heavy/verbose tasks to subprocesses when available.
- For complex work, parallelize independent checks.
- Use `yarn knip` as an advisory manifest-hygiene check when changing dependencies or adding/removing imports. It is not a required verification gate.
- When proposing or implementing meaningful code changes, include both:
  - a Conventional Commit title suggestion
  - a short GitHub issue suggestion
  Use the format playbook: `docs/agent-playbooks/commit-issue-format.md`.
- When stuck on a bug, search the web for recent fixes/workarounds.
- After user corrections, identify root cause and apply the lesson in subsequent steps.
- When changing hooks or stores, consider whether existing tests cover the change. If not, add a test.

## Common Commands

```bash
yarn install
yarn build                # TypeScript compilation
yarn knip                 # Advisory dependency/binary manifest audit
yarn knip:full            # Exploratory full unused files/exports scan (non-blocking)
yarn test                 # Vitest unit tests
vitest run --config config/vitest.config.js --coverage.enabled --coverage.provider=istanbul --coverage.reporter=text --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage
node scripts/verify-hooks-stores-coverage.mjs # Enforce 100% lines/branches/functions/statements for src/hooks and src/stores
yarn test:e2e:mock        # E2E tests with mock backend
yarn test:e2e:chrome      # E2E tests in Chrome
yarn prettier             # Format all source files
```

## Playbooks (Load On Demand)

Use these only when relevant to the active task:

- Hooks setup and scripts: `docs/agent-playbooks/hooks-setup.md`
- Commit/issue output format: `docs/agent-playbooks/commit-issue-format.md`
- Skills/tools setup and MCP rationale: `docs/agent-playbooks/skills-and-tools.md`
- Bug investigation workflow: `docs/agent-playbooks/bug-investigation.md`
- Known surprises log: `docs/agent-playbooks/known-surprises.md`
