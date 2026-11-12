#!/usr/bin/env bash
# exits with the status of the first failing step, normally the e2e tests
set -euo pipefail

# run from the repo root whatever the caller's cwd, like yarn scripts do
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# build and bundle
yarn
yarn build

# start the test server and stop only that process on every exit path,
# its SIGTERM handler also stops the ipfs daemons it started
rm -rf .pkc/
node test/test-server &
test_server_pid=$!
stop_test_server() {
  kill "$test_server_pid" 2>/dev/null || true
  wait "$test_server_pid" 2>/dev/null || true
}
trap stop_test_server EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# wait until test server is ready
yarn test:server:wait-on

# tests
CHROME_BIN=$(which chrome || which chromium || which chromium-browser) yarn test:e2e
