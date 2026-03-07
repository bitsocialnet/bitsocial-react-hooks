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

bitsocial-react-hooks (`@bitsocialhq/bitsocial-react-hooks`) is a React hooks library for the Bitsocial protocol. It provides React hooks and Zustand stores for interacting with decentralized communities — fetching comments, feeds, author data, publishing, account management, and more.

This repo is a temporary fork of [plebbit/plebbit-react-hooks](https://github.com/plebbit/plebbit-react-hooks) under the bitsocialhq org for AI-aided development. Changes made here will be merged upstream when the original maintainer is ready. The codebase still uses "plebbit" naming (e.g. `subplebbit`, `plebbit-js`) — do not rename these yet; rebranding depends on the upstream `plebbit-js` dependency rebranding first.

## Instruction Priority

- **MUST** rules are mandatory.
- **SHOULD** rules are strong defaults unless task context requires a different choice.
- If guidance conflicts, prefer: user request > MUST > SHOULD > playbooks.

## Task Router (Read First)

| Situation | Required action |
|---|---|
| Hook or store logic changed (`src/hooks/`, `src/stores/`) | Follow architecture rules below; run `yarn build` |
| `package.json` changed | Run `yarn install` to keep `yarn.lock` in sync |
| Bug report in a specific file/line | Start with git history scan from `docs/agent-playbooks/bug-investigation.md` before editing |
| Public API changed (`src/index.ts`, `src/types.ts`) | Ensure backward compatibility; update README if signatures changed |
| User-facing behavior/feature added or changed | Update `README.md` usage/docs in the same task before marking work complete |
| Tests added or changed (`src/**/*.test.ts`, `test/`) | Run `yarn test` to verify |
| GitHub operation needed | Use `gh` CLI, not GitHub MCP |
| User asks for commit/issue phrasing | Use `docs/agent-playbooks/commit-issue-format.md` |
| Surprising/ambiguous repo behavior encountered | Alert developer and, once confirmed, document in `docs/agent-playbooks/known-surprises.md` |

## Stack

- TypeScript
- React (peer dependency, >=16.8)
- Zustand 4 for state management
- Vitest for unit tests
- Playwright for e2e tests
- Prettier for formatting
- yarn

## Project Structure

```text
src/
├── hooks/         # React hooks (accounts, actions, authors, comments, feeds, replies, states, plebbit-rpc)
├── stores/        # Zustand stores (accounts, authors-comments, comments, feeds, replies, replies-pages, subplebbits, subplebbits-pages)
├── lib/           # Utilities (chain, debug-utils, localforage-lru, plebbit-js mock/integration, utils, validator)
├── index.ts       # Public API exports
└── types.ts       # Type definitions
```

## Core MUST Rules

### Package and Dependency Rules

- Use `yarn`, never `npm`.
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

### Documentation Rules

- Keep `README.md` current for all user-facing features, behavior changes, and new workflows.
- Do not mark a feature task complete until corresponding README usage/docs are updated.

### Naming and Branding Rules

- Do **not** rename `plebbit`, `subplebbit`, or related terms in source code yet. The upstream dependency `plebbit-js` has not rebranded, and this repo must stay compatible.
- Package name and import path is `@bitsocialhq/bitsocial-react-hooks`. Use this in README examples and docs.
- The future rebrand: `plebbit` → `pkc`, `subplebbit` → `community`. But not yet.

### Bug Investigation Rules

- For bug reports tied to a specific file/line, check relevant git history before any fix.
- Minimum sequence: `git log --oneline` or `git blame` first, then scoped `git show` for relevant commits.
- Full workflow: `docs/agent-playbooks/bug-investigation.md`.

### Verification Rules

- Never mark work complete without verification.
- After code changes, run: `yarn build`.
- After test changes, run: `yarn test`.
- Maintain mandatory 100% test coverage for hooks and stores (`src/hooks/`, `src/stores/`); every feature or bug fix in these areas must include/adjust tests to keep coverage at 100%, verified via coverage run + `node scripts/verify-hooks-stores-coverage.mjs`.
- Before committing, run: `yarn prettier` to format.
- If verification fails, fix and re-run until passing.

### Tooling Constraints

- Use `gh` CLI for GitHub work (issues, PRs, actions, search).
- Do not use GitHub MCP.
- Do not use browser MCP servers.
- If many MCP tools are present in context, warn user and suggest disabling unused MCPs.

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
