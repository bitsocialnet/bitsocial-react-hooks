# Contributing to Bitsocial React Hooks

`@bitsocial/bitsocial-react-hooks` is the React hooks and Zustand store package that Bitsocial clients such as [5chan](https://github.com/bitsocialnet/5chan) use to read and publish communities, feeds, comments, profiles, and accounts. Every change ships to the apps built on it, so keeping those apps working is the main constraint on what gets merged.

Before you start, read:

- [README.md](README.md#contribute) for setup, and [docs/testing.md](docs/testing.md) for running tests.
- [AGENTS.md](AGENTS.md) for code conventions. It is written for coding agents, but the rules apply to everyone.
- [Versioning and v1 readiness](docs/agent-playbooks/versioning.md) for the compatibility policy and the work needed before 1.0.

## Where to help

- **The [issue backlog](https://github.com/bitsocialnet/bitsocial-react-hooks/issues).** Issues labeled `question` need a decision before code; discuss on the issue first. For anything larger than a small fix, say on the issue that you are working on it so effort is not duplicated.
- **The [v1 readiness tracker](docs/agent-playbooks/versioning.md#readiness-tracker).** Items V1-01 to V1-07 cover test reliability, cancellation, hook inputs, public types, exports, documentation, and supported environments. Each lists its completion criteria, and most have no matching issue. A pull request that advances one updates its row and adds a dated evidence entry, as the tracker describes.

## Settled decisions

These are maintainer decisions, not open questions:

- **Compatibility within `0.1.x`.** Apps depend on `^0.1.x`, so changes must not break supported usage: exports, types, arguments, return values, loading and error states, or supported React and Node versions. A deliberate break needs a minor-version boundary and migration notes; propose it on an issue before writing it.
- **Stores own protocol state; hooks are thin wrappers.** Fetching, caching, request deduplication, and subscriptions live in `src/stores/`. Hooks in `src/hooks/` select from stores and expose their actions. Pull requests that add fetching effects to hooks will be asked to move that logic into a store.
- **Protocol behavior belongs in [pkc-js](https://github.com/pkcprotocol/pkc-js).** Signing, validation, networking, and challenges are fixed there. This package wraps pkc-js for React.
- **No interface.** The package stays UI-agnostic; components and styling belong in client apps.
- **Current naming.** Use `pkc`, `community`, and `pkc-js`. Older protocol names appear only in compatibility bridges.

## Pull requests

- Branch from `master` and keep each pull request to one topic.
- Use [Conventional Commits](docs/agent-playbooks/commit-issue-format.md) for titles, with `perf` rather than `fix` for performance work.
- Add or update tests for changed hook and store behavior, then run the checks in [verification.md](docs/agent-playbooks/verification.md) for what you changed. CI runs lint, type-check, unit tests, the build, and browser tests.
- When public behavior changes, update the [README](README.md) and [API reference](docs/reference.md) to match. After documentation changes, run `corepack yarn llms:generate` and include the regenerated `llms*.txt`.
- Pin new dependencies to exact versions with the repository's Yarn 4 through Corepack, and commit the updated `yarn.lock`.
- Leave the package version, `CHANGELOG.md`, `dist/`, and `badges/` alone. Maintainers choose versions, and the release workflow generates the rest.
