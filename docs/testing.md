# Testing

Use Node 22 from `.nvmrc` and the Corepack-managed Yarn version in `package.json`. Install dependencies with `corepack yarn install` when setting up the checkout or changing the manifest. Choose affected checks using [verification.md](agent-playbooks/verification.md).

## Unit tests

Unit tests use Vitest with jsdom, are located beside source files, and load the mock protocol client through `config/vitest.config.js` and `config/vitest.setup.js`.

```bash
corepack yarn exec vitest run --config config/vitest.config.js --maxWorkers=2
```

Append a test path/name filter for a focused run. `DEBUG=bitsocial-react-hooks:*` enables library logs; select a narrower namespace when possible. `yarn test:coverage` uses the configured single worker, and `node scripts/coverage-triage.mjs` reports hook/store gaps. Coverage is advisory.

## Browser tests

The browser suite uses Vitest's Playwright provider in `config/vitest-e2e.config.js`, with one worker. Browser tests import `dist/`, so run `yarn build` after relevant source changes before testing. Do not commit local `dist/` rebuilds; preserve preexisting edits when cleaning up task-owned output.

| Command | Test selection |
|---|---|
| `yarn test:e2e:mock` | Mock protocol client, `test/browser-pkc-js-mock/` |
| `yarn test:e2e:mock-content` | Mock content client, `test/browser-pkc-js-mock-content/` |
| `yarn test:e2e:chrome` | Real protocol e2e, `test/browser-e2e/`, Chromium |
| `yarn test:e2e:firefox` | Real protocol e2e, Firefox |

`yarn test:e2e` runs mock then real Chromium suites. The browser is visible locally unless `HEADLESS=1` or `CI` is set. `CHROME_BIN` and `FIREFOX_BIN` can specify installed browser executables; `FIREFOX=1` chooses Firefox. Run engines sequentially and retain the single-worker cap.

Real protocol tests require the local test infrastructure. Inspect `test/test-server/config.js` for ports, then run `yarn test:server` in a task-owned session and wait with `yarn test:server:wait-on`. The server starts local Kubo and protocol RPC services; do not start a duplicate or terminate an unrelated service. Record the server and child process ownership and clean up only those task-owned processes on every exit path.

Use these explicit commands for local agent runs. The legacy `scripts/build-and-test-e2e.sh` uses broad process-name cleanup and is unsuitable for a shared contributor machine. A successful mock run does not establish real protocol behavior.

## AI workflow fixtures

`yarn ai-workflow:check` validates native app files and shared source parity. `yarn ai-workflow:test` exercises the generators and edit-hook parser in temporary directories with fake formatter commands, without launching browsers or building the library.
