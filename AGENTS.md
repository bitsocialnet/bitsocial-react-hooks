# AGENTS.md

## Purpose and priority

Shared instructions for agents working on `@bitsocial/bitsocial-react-hooks`. Explicit user instructions take precedence over repository workflow guidance. Read linked playbooks only when relevant to the task. Use judgment for routine choices and continue authorized work; ask only when missing information materially changes the outcome or an action lacks authorization.

## Product and source of truth

This package provides React hooks and Zustand stores for the Bitsocial protocol: communities, comments, feeds, authors, publishing, and accounts. Code, tests, package manifests, source docs, and runtime evidence establish behavior. AI instructions, playbooks, and generated `llms*.txt` are orientation; verify their technical claims against source before editing.

Use `pkc`, `community`, and `pkc-js` naming consistently. The package/import name is `@bitsocial/bitsocial-react-hooks`. Preserve public compatibility contracts; do not introduce older protocol naming in new code unless a compatibility bridge is requested.

For an unexpected repository-specific issue, tell the contributor and continue independent work. After confirmation, record only recurring issues with a concrete mitigation in [known-surprises.md](docs/agent-playbooks/known-surprises.md).

## Working principles

- Define completion for non-trivial work. Continue through implementation, relevant verification, and fixes until the requested outcome is complete; stop at the user's requested boundary.
- Understand the flow before editing. Prefer removing unnecessary work, reusing repository code or platform facilities, then installed dependencies before adding new code.
- Keep diffs scoped. Preserve unrelated edits; do not reformat, rename, or refactor adjacent code without a task-related reason.
- Preserve correctness, validation, error handling, public contracts, and useful tests while simplifying.
- For a bug tied to a file or line, inspect `git log`/`git blame`, then relevant `git show`, before fixing it. See [bug-investigation.md](docs/agent-playbooks/bug-investigation.md).
- Establish bugs through reproduction or conclusive source/runtime evidence. Use existing tests/logs before adding instrumentation; remove task-owned instrumentation after verification. Report specific missing evidence instead of guessing.

## Task router

| Task | Guidance/check |
|---|---|
| Hook/store or public API changes | Preserve the architecture below; add or adjust affected behavior tests and run `yarn build` |
| Other code or automation changes | Select affected checks using [verification.md](docs/agent-playbooks/verification.md) |
| Public exports/types or documented behavior changed | Check compatibility and update the affected README usage/API documentation |
| Tests changed | Run affected tests with the configured two-worker command below; broaden for shared behavior or unresolved risk |
| `package.json` changed | Run `corepack yarn install` to synchronize `yarn.lock` |
| Dependencies/imports changed | Run advisory `yarn knip`; address relevant new findings |
| AI workflow files changed | Edit shared sources; run `yarn ai-workflow:sync`, `yarn ai-workflow:check`, and `yarn ai-workflow:test` |
| Public docs or AI context changed | Run `yarn llms:generate`; include resulting `llms*.txt` changes |
| PR feedback or readiness | Use `review-and-merge-pr` within the user's requested scope |
| Commit/issue wording requested | Use [commit-issue-format.md](docs/agent-playbooks/commit-issue-format.md) |

## Code and architecture

- Use Node 22 via `.nvmrc` and Corepack-managed Yarn 4. Pin exact dependency versions and synchronize the lockfile; never use global Yarn 1 or another package manager for project changes.
- The stack is TypeScript, React (peer `>=16.8`), Zustand 4, Vitest, Playwright, oxlint, and oxfmt. Verify installed versions before using newer APIs; the development React version does not narrow the package's peer support.
- Zustand stores in `src/stores/` own shared protocol state. Hooks in `src/hooks/` are focused wrappers selecting from stores and exposing their actions.
- Keep protocol fetching in the existing store/subscription/event flow, rather than introducing fetching effects in hook wrappers. Preserve effects that manage external subscriptions and cleanup; derive values during render when appropriate instead of mirroring derived state.
- Preserve request deduplication, cache behavior, loading/error contracts, and subscription lifecycle when changing data flow.
- Re-export public hooks/functions from `src/index.ts`. Put cross-module types in `src/types.ts`, shared utilities in `src/lib/`, and hook-specific helpers beside their hook.
- Split files when responsibilities become difficult to follow, not at an arbitrary line count. Add comments for non-obvious constraints or logic.
- Keep README usage and API examples current for the behavior changed by the task. A small wording correction does not require a full README rewrite.

## Git and ownership

- Keep `master` releasable. Start new changes on short-lived `codex/feature/*`, `codex/fix/*`, `codex/docs/*`, or `codex/chore/*` branches unless the user requests otherwise.
- For an unrelated task while another branch is active, create a separate descriptive worktree from `master`. Related delegated slices may share a checkout with non-overlapping file ownership. Never switch branches underneath another agent.
- Stage only task-owned changes, using a selective index patch for mixed files. Preserve unrelated edits and staging.
- Never commit secrets or local `dist/` rebuild output. `dist/` is CI-managed; restore only task-owned generated changes after verification, preserving any preexisting edits.
- Commit, push, publish, or merge only when authorized. Permission persists through the necessary steps; a review request does not itself authorize publication.
- Use `gh` for GitHub operations. When a PR is requested, target `master` and make it ready for review. Do not create PRs or issues merely as a finishing ritual.
- After an authorized merge, clean up only the verified merged task branch/worktree, preserving later or unrelated work. Never run Git cleanup from lifecycle hooks.
- For multiline GitHub bodies, write exact text to a file and pass `--body-file`. Do not paste raw logs or local absolute paths into public comments.

## Verification and resource ownership

- Verify affected behavior with the narrowest reliable checks; add meaningful tests for hook/store features and testable bugs. Do not add tests that merely repeat a reversible wording change.
- Run applicable checks once for the final state. Repeat or broaden only after relevant edits, failures, or unresolved concerns. Preserve explicit user, CI, and release requirements.
- Before heavy work, inspect existing processes. Stop only stale processes owned by this task; never stop a process of unclear ownership.
- Serialize dependency installs, builds, full tests/coverage, and browser work across the task. One agent owns heavy verification.
- Use `corepack yarn exec vitest run --config config/vitest.config.js --maxWorkers=2 [paths]` for agent-run unit tests. Coverage/e2e configs use one worker; do not increase it or use watch mode.
- Reuse a compatible test server in the same worktree when safe. Record and clean up servers/processes you start on every exit path. Never start a server for documentation-only work.
- Coverage and Knip are advisory. `scripts/coverage-triage.mjs` identifies relevant coverage gaps; the strict opt-in `verify-hooks-stores-coverage.mjs` is not a new repository-wide gate.
- Review the final task-owned diff. Use `code-quality-review` for non-trivial changes or an explicit review request; apply high-confidence findings within existing authorization.

## Skills and delegation

- Shared skills live in `.agents/skills/`; shared role prompts in `.agents/roles/`. The latter is our generator's source format, not native discovery. Commit generated `.claude/skills/` and native `.codex/agents/*.toml`, `.cursor/agents/*.md`, and `.claude/agents/*.md` alongside sources. See [skills-and-tools.md](docs/agent-playbooks/skills-and-tools.md).
- Leave model and reasoning choices out of committed skills and custom agents in all apps. Runtime invocation, user defaults, and parent inheritance determine selection according to the app; do not invent a `latest` alias.
- Keep app-specific hook and permission schemas explicit; identical text alone does not prove equivalent runtime behavior.
- Delegate substantial independent work when it improves speed, context isolation, or review. Small or coupled tasks can stay local. Use built-in workers/explorers where available; the custom reviewer reports evidence without edits.
- Give children scope, acceptance criteria, context, file ownership, and the evidence to return. They share the checkout and must preserve other edits. Omit the parent's verdict when requesting independent review.
- Parallelize read-heavy work and non-overlapping edits, with at most four active children by default. Children do not each run full builds; browser work remains serialized.
- Apply relevant React guidance to state, effect, subscription, or performance changes. Use `you-might-not-need-an-effect` when an effect's purpose is unclear. Do not apply client-app or Next.js examples blindly to this library.
- Prefer existing tools and local CLIs. Use version-specific external documentation when needed; do not search/install skills just because an ordinary task mentions their domain. Keep tool catalogs relevant, without blanket warnings about MCP.

## Commands and playbooks

Common commands: `yarn build`, `yarn type-check`, `yarn lint`, `yarn knip`, `yarn ai-workflow:sync`, `yarn ai-workflow:check`, `yarn ai-workflow:test`, `yarn llms:generate`.

For unit, coverage, or browser verification, read [verification.md](docs/agent-playbooks/verification.md). Other details: [hooks](docs/agent-playbooks/hooks-setup.md), [skills/tools](docs/agent-playbooks/skills-and-tools.md), [bug investigation](docs/agent-playbooks/bug-investigation.md), [known surprises](docs/agent-playbooks/known-surprises.md).
