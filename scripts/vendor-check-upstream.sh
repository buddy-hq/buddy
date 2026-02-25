#!/usr/bin/env bash
set -euo pipefail

REMOTE="opencode-upstream"
BRANCH="dev"
PREFIX="vendor/opencode"

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Remote '$REMOTE' not found." >&2
  echo "Run: git remote add $REMOTE https://github.com/anomalyco/opencode.git" >&2
  exit 2
fi

git fetch "$REMOTE" "$BRANCH" >/dev/null

if ! git rev-parse --verify "HEAD:$PREFIX" >/dev/null 2>&1; then
  echo "Missing mirror at '$PREFIX'. Run: bun run vendor:sync" >&2
  exit 2
fi

local_tree="$(git rev-parse "HEAD:$PREFIX")"
upstream_tree="$(git rev-parse "$REMOTE/$BRANCH^{tree}")"

if [[ "$local_tree" == "$upstream_tree" ]]; then
  echo "vendor/opencode is up to date with $REMOTE/$BRANCH"
  exit 0
fi

echo "vendor/opencode is behind $REMOTE/$BRANCH"
echo "Run: bun run vendor:sync"
exit 1
