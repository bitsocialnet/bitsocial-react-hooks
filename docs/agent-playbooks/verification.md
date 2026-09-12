# Verification

Select checks by the affected contract. Reuse evidence for an unchanged final state and preserve explicit user, CI, and release requirements.

| Change | Relevant checks |
|---|---|
| Prose/comments/formatting | Inspect diff and links; run affected generators without an application build |
| AI workflow sources or hooks | `yarn ai-workflow:sync`, `yarn ai-workflow:check`, `yarn ai-workflow:test`; regenerate `llms*.txt` when context changes |
| Isolated helper or automation | A focused invocation or test for the affected behavior; lint/type-check where the change warrants it |
| Hooks, stores, public exports/types | Affected behavior tests, `yarn build`, and relevant documentation/API compatibility review |
| Shared runtime, dependencies, build integration | Focused tests plus build; broaden unit/e2e coverage according to the modules affected |
| Browser-dependent hook behavior | Relevant mock or real-browser e2e flow; select additional engines when APIs or behavior differ across browsers |

Use Node 22 via `.nvmrc` and Corepack Yarn. Perform setup only when needed; do not reinstall the runtime or enable Corepack on every task. Run heavyweight work sequentially across parent and children, after checking process ownership.

Unit tests: `corepack yarn exec vitest run --config config/vitest.config.js --maxWorkers=2 [paths]`. Omit paths for a needed full suite. Coverage/e2e configs already cap workers at one; retain that cap. Use `yarn test:coverage` when coverage evidence helps, followed by `node scripts/coverage-triage.mjs` to inspect relevant gaps. Coverage is advisory, including preexisting gaps reported by the strict opt-in checker.

For e2e work, read [testing.md](../testing.md) and use `yarn test:e2e:mock` or `yarn test:e2e:chrome` as appropriate; Firefox uses `yarn test:e2e:firefox`. Preserve test server setup and environment requirements. Own each process/session you start, reuse a compatible same-worktree server when safe, and close task-owned resources even on failure. Never stop another task's workload or use global browser cleanup. Real protocol or network behavior needs the appropriate environment; state a specific unavailable prerequisite instead of claiming a mock proves it.

Format only task-owned source paths with installed `corepack yarn exec oxfmt --write <paths>`, then inspect the resulting diff. `yarn prettier` retains its historical name but invokes oxfmt over broad source/test/config globs; avoid it for unrelated formatting. `yarn knip` is advisory for changed dependencies/imports.

`yarn build` clears and regenerates `dist/`. Record any preexisting changes first and remove only task-owned build output after verification; never commit local distribution rebuilds or erase a contributor's edits. Fix relevant failures and rerun their checks. Report preexisting failures with enough evidence to distinguish them.

AI workflow tests use temporary directories and fake formatter invocations. They verify path containment, payload handling, native syntax, generation parity, invocation policies, and absence of model/lifecycle pins without starting browsers or installing packages. They do not prove native app discovery or model decisions. For substantial prompt changes, exercise representative tasks in disposable fixtures and check scope, selected guidance, and verification proportionality.
