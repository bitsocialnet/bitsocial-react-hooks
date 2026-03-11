#!/bin/bash
# stop hook: Run build and tests when agent finishes
# This is informational - always exits 0

# Consume stdin (required for hooks)
cat > /dev/null

# Change to project directory
cd "$(dirname "$0")/../.." || exit 0

DIST_STATUS_BEFORE=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
  git ls-files --error-unmatch dist >/dev/null 2>&1; then
  # Only clean up dist when verification started from a clean baseline.
  DIST_STATUS_BEFORE="$(git status --porcelain=v1 --ignored=matching --untracked-files=all -- dist 2>/dev/null || true)"
fi

restore_dist_worktree() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return
  fi

  if ! git ls-files --error-unmatch dist >/dev/null 2>&1; then
    return
  fi

  if [ -n "$DIST_STATUS_BEFORE" ]; then
    return
  fi

  local dist_status_after=""
  dist_status_after="$(git status --porcelain=v1 --ignored=matching --untracked-files=all -- dist 2>/dev/null || true)"
  if [ -z "$dist_status_after" ]; then
    return
  fi

  echo "=== git restore --worktree dist ==="
  git restore --worktree -- dist 2>&1 || true
  git clean -fdX -- dist 2>&1 || true
  echo ""
}

echo "Running build and tests..."
echo ""

# Run build (catches compilation errors)
echo "=== yarn build ==="
yarn build 2>&1 || true
echo ""

# Run tests
echo "=== yarn test ==="
yarn test 2>&1 || true
echo ""

restore_dist_worktree

echo "Verification complete."
exit 0
