# Versioning and v1 readiness

Choose release versions from compatibility changes, and track the work needed for a stable public API here. Agents must read this playbook before recommending a version, changing the package version, or preparing a release.

This is the shared release policy and readiness tracker for `@bitsocial/bitsocial-react-hooks`. Source, tests, package manifests, and verified published artifacts establish current behavior; the dated findings below are a starting point to recheck. Explicit user instructions take precedence. A version recommendation or checklist does not authorize a commit, push, tag, merge, or publication; carry existing authorization through the requested work without adding approval steps.

## Why these milestones

The README redesign and developer website did not require a retroactive `0.2.0` release. The website is outside the published library code, and documentation work alone does not change the API's compatibility. Leave existing releases intact.

The plan is to keep compatible maintenance releases available on `0.1.x`, use `0.2.0` for a meaningful library milestone or an intentional compatibility boundary, and target `1.0.0` once the documented public API is ready to be maintained compatibly throughout `1.x`. Treat `0.2.0` as a useful opportunity to settle type and import contracts, not a mandatory intermediate release or an automatic next version.

There is no deadline or numeric limit forcing an exit from `0.1.x`. However, the project should move toward an explicit stable contract rather than remain there by habit. V1 does not require every planned feature, zero bugs, 100% coverage, or dependencies that have themselves reached v1. It does require confidence in the behavior and compatibility guarantees this package exposes.

## Choosing the number

[SemVer](https://semver.org/) leaves `0.y.z` APIs unstable. The pre-v1 rules below are this repository's more conservative policy, not a claim that SemVer requires identical rules before and after v1. In particular, preserve compatibility within a `0.y.x` line: npm's [caret ranges](https://github.com/npm/node-semver#caret-ranges-123-025-004) accept later `0.1.x` for `^0.1.58`, but exclude `0.2.0`.

| Release contents | While on `0.y.z` (`y >= 1`) | From `1.0.0` onward |
|---|---|---|
| Only website, docs, tests, or agent workflow changes; no API/support-policy change or distributable correction needed | Usually no package release; no minor bump required | Usually no package release |
| Backward-compatible fixes, performance improvements, or dependency/packaging maintenance | Patch: `0.y.(z+1)` | Patch: `x.y.(z+1)` |
| Small backward-compatible API addition | Patch is allowed under this pre-v1 policy; describe the addition | Minor: `x.(y+1).0` |
| Substantial compatible library feature milestone | Minor: `0.(y+1).0`, with a clear user-facing reason | Minor: `x.(y+1).0` |
| Public API marked deprecated, including through docs or JSDoc | Minor: `0.(y+1).0`, to announce the migration | Minor: `x.(y+1).0`; removing it later follows the breaking-change rule |
| Intentional break to supported usage, including types, imports, or environment requirements | Minor: `0.(y+1).0`, with migration guidance | Major: `(x+1).0.0`, with migration guidance |
| Stable API commitment with readiness criteria satisfied | `1.0.0`; earlier `0.x` milestones need not all be visited | Continue the stable rules above |

If a documentation-only correction must be redistributed in the package, a patch can be appropriate. A maintenance label does not make a change compatible: inspect dependency effects, exports, argument validation, return values, state/error semantics, TypeScript consumers, and supported React/Node versions. Tightening types or raising a minimum supported version can require a migration even when runtime code barely changes. Fixing behavior outside the intended contract can be a patch; explain the distinction using the affected supported usage. Do not choose the number from commit prefixes alone.

Use the highest required bump across the whole release. Mixed fixes and breaking changes require the breaking-change boundary. A named milestone never excuses incomplete verification of its contents. For a release candidate, use a prerelease such as `1.0.0-rc.1` only within an authorized prerelease workflow; it is not a stable release or a way to bypass readiness.

### Before recommending or preparing a release

1. Establish the target checkout/commit, intended release line, and actual published baseline. Read `package.json`, reachable tags, GitHub releases, and npm registry metadata when available. Resolve manifest/tag/registry disagreements; do not assume the local manifest or newest tag is the latest published package. If remote evidence is unavailable, state that the recommendation is provisional.
2. Inspect the complete diff since that published baseline, including API/types, dependencies, exports, supported environments, and relevant consumer usage. Check current source and verification for any readiness item the changes affect. A docs task does not require re-running the whole runtime audit.
3. Recommend an exact version and give the compatibility reason, affected usage/migration, verification status, and relevant unresolved readiness items. Do not silently replace a version explicitly chosen by the user; explain a conflicting recommendation before proceeding with that number.
4. When implementing authorized release preparation or readiness work, update the affected tracker rows and evidence below. For an assessment-only request, report proposed status changes without editing. Follow [verification](verification.md) for checks, the existing CI release workflow for publication, and [release-description](../../.agents/skills/release-description/SKILL.md) for release wording. Keep version policy in this document rather than copying it into those files.

A recommendation can be brief: **"Recommend 0.1.59 from published 0.1.58: compatible cancellation fix; no migration. Verification: [checks/evidence]. V1-02 is complete at [commit]; the remaining v1 items stay open."** This is an example, not the current next-version decision.

Open v1 work does not automatically block a compatible `0.1.x` fix. Judge the safety and verification of that release's actual scope. Never mark work complete merely because a version number was incremented.

## Readiness tracker

Initial assessment: **2026-10-26**, source revision [`5d0cfd80`](https://github.com/bitsocialnet/bitsocial-react-hooks/commit/5d0cfd8087db673e428266a943668559fb97f1eb), package **0.1.58**. Source recheck for this document: **2026-10-27**, local baseline [`773f1465`](https://github.com/bitsocialnet/bitsocial-react-hooks/commit/773f14652a11e5d6eb11ff3c44a6c5ffa192f56a). The recheck did not repeat the runtime reproductions or full test suite. Recheck the target release revision before relying on these statuses.

The initial review found a substantial implemented API and existing browser/protocol tests. Three runtime defects were reproduced with real React and mocked dependencies in memory; the test-helper timeout and inaccurate consumer types were also demonstrated in isolated probes. [CI for the assessment revision](https://github.com/bitsocialnet/bitsocial-react-hooks/actions/runs/40105816879) reported 1,328 passing unit tests and passing Chromium/Firefox suites, but V1-01 limits what those green results establish. The actual amount of remaining stabilization work must be reassessed after assertions reliably fail.

Statuses: **Open** means acceptance criteria remain unmet; **In progress** requires a linked implementation; **Complete** requires merged implementation and relevant passing verification on an identified revision. Record locally verified but unmerged work as In progress. If a finding is disproved or the scope deliberately changes, record the decision and evidence instead of silently deleting the row.

| ID | Status | Work and evidence at the source recheck | Completion criteria |
|---|---|---|---|
| V1-01 | Open | **Reliable behavior assertions.** `createWaitFor` in [test-utils](../../src/lib/test-utils.ts) warns and resolves on timeout. Some [comment tests](../../src/hooks/comments.test.ts) rely on its predicate as their only assertion; the successful CI run includes timeout warnings. | Separate explicit best-effort polling from waits used as assertions. Prove unmet conditions fail; audit callers, rerun the suite, and resolve or explicitly investigate the failures it exposes. Do not infer correctness from coverage alone. |
| V1-02 | Open | **Cancellation retains publication ownership.** [usePublishComment](../../src/hooks/actions/actions.ts) retains a numeric index; [deleteComment](../../src/stores/accounts/accounts-actions.ts) resolves the active account when no name is supplied. Publishing as A, switching to B, then abandoning can delete B's local history entry while leaving A pending. This does not delete a network post. | Bind cancellation to the originating account and publication identity. Regression tests must cover changing the active account or explicit account name while publishing, including cancellation before the pending index arrives. Verify the related cancellation flows preserve ownership. |
| V1-03 | Open | **Changing hook inputs takes effect.** [useBlock](../../src/hooks/actions/actions.ts) omits `cid` from its result memo dependencies, so a rerender can leave actions targeting the old CID. [useCommunity](../../src/hooks/communities.ts) omits `onlyIfCached` from its loading effect dependencies. | Regression tests must show A-to-B CID changes target B and cache-only-to-network transitions start loading. Review callback dependencies in these affected flows without blanket hook refactoring. |
| V1-04 | Open | **Accurate public types.** [types.ts](../../src/types.ts) promises a `UseAccountResult` where [useAccount](../../src/hooks/accounts/accounts.ts) can return `undefined`, and required account-comment fields where the empty result has none. Core domain and publishing types use unrestricted `any`. | Match runtime absence/loading states and type the documented core fields/inputs. Add positive and negative consumer compilation checks; keep intentional protocol extensibility explicit. Decide and document any consumer migration caused by tighter declarations. Exhaustive typing of every extension is not required. |
| V1-05 | Open | **Deliberate supported exports.** [package.json](../../package.json) exports all `dist/*`; [src/index.ts](../../src/index.ts) exports a testing reset helper and all types. The assessment found 5chan consuming six stores and several helpers through `src/lib/bitsocial-internals/`. | Declare the supported root API and intentional subpaths, plus any experimental/internal exclusions. Preserve or migrate real consumer imports before narrowing exports. Verify the chosen surface from an external package consumer; do not simply remove the wildcard. |
| V1-06 | Open | **Matching documentation and action contracts.** The [API reference](../reference.md) gives `createAccount` an account object instead of an optional name, and describes `exportAccount` as synchronous with a required name; [implementation](../../src/stores/accounts/accounts-actions.ts) is asynchronous and defaults to the active account. | Reconcile maintained signatures/examples with implementation and types. State whether each action rejects or reports errors through results/callbacks, and what awaiting it guarantees. Preserve the documented distinctions between loading, pagination exhaustion, publishing, and acceptance. |
| V1-07 | Open | **Verified supported environments.** [package.json](../../package.json) and [README](../../README.md) promise React 16.8+, while [CI](../../.github/workflows/CI.yml) exercises pinned React 19.1 on Node 22. No external TypeScript consumer compatibility fixture was found in the assessment. | Define supported React/Node and TypeScript consumer versions; verify the claimed range with representative compatibility tests or deliberately narrow it before v1. Test the packed package by name, exports/declarations, supported module resolution, main browser flows, and representative StrictMode mount/unmount behavior. Missing matrix coverage is not proof of incompatibility. |

### Updating progress

- Update the relevant row in the same scoped change that advances it. Add an evidence entry below with the date, ID, implementation commit/PR, checks and their revision, and remaining limits. Link the actual evidence rather than writing only "done" or a percentage.
- Before a release recommendation, recheck relevant rows against the release contents. Completed work must be included in the target release; a fix on another branch is not shipped progress. Reopen an item only when new evidence warrants it.
- Keep historical evidence dated. A green check for an older revision is not a current verification result, and the absence of new reports does not establish completion. Regenerate `llms*.txt` after changing this document.
- Keep this tracker focused on release readiness. Ordinary feature requests belong in the existing issue backlog; link them when relevant rather than duplicating every issue here.

| Date | IDs | Progress/evidence | Remaining limits |
|---|---|---|---|
| 2026-10-27 | V1-01–V1-07 | Recorded the 2026-10-26 assessment and rechecked the listed source contracts at `773f1465`. | All acceptance criteria remain open. No runtime fixes, new compatibility guarantees, version bump, or release were made by this documentation change. |
| 2026-10-31 | V1-04, V1-07 | 0.1.63 adds explicit gallery attachment types to the existing comment/publishing API and upgrades pkc-js to 0.0.132. Its Node requirement raises the supported floor to 22.19; the manifest, local runtime pin and publishing runtime now match. The explicitly requested 0.1.63 version is retained as an exception to the support-policy minor-bump rule above. | Verified locally on Node 22.23.4: 1,350 unit tests passed (six skipped), including gallery publishing/history, cached reads and real-pkc signing/schema validation; build, lint (warnings only) and Knip passed. Broader core-type and environment-matrix criteria remain open. |

## Milestone exit criteria

**0.2.0:** a justified feature milestone or compatibility boundary, with affected behavior verified and any migration explained. Use it to settle the planned type/export contracts when that work is ready. It may ship before every v1 item is complete, provided its own contents are ready; routine compatible fixes can continue as patches meanwhile.

**1.0.0:** the readiness items above are complete or have an explicitly justified scope decision, the documented public contract is agreed, and verification covers the actual release candidate and consumers. The team commits to compatible fixes/features throughout `1.x`, with intentional supported-API breaks reserved for a new major version.

SSR support, every feature request, complete elimination of `any`, and 100% coverage are not automatic prerequisites. [Client-only loading is already documented](../../website/content/quickstart.md#using-a-framework-with-server-rendering). V1 can retain it. The goal is a precise, tested promise that the package can maintain.
