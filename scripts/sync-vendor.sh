#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────
# sync-vendor.sh
#
# Syncs all vendored OpenCode packages from upstream.
#
# Usage:
#   ./scripts/sync-vendor.sh              # sync from local_opencode remote
#   ./scripts/sync-vendor.sh --upstream   # sync from GitHub upstream remote
#   ./scripts/sync-vendor.sh --dry-run    # show what would change, don't apply
#
# Prerequisites:
#   - Clean working tree (commit or stash changes first)
#   - Remotes configured:
#     local_opencode → /Users/prashantbhudwal/Code/opencode
#     upstream       → https://github.com/anomalyco/opencode.git
# ──────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default remote and branch
REMOTE="local_opencode"
BRANCH="main"
DRY_RUN=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --upstream)
      REMOTE="upstream"
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    --branch=*)
      BRANCH="${arg#--branch=}"
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--upstream] [--dry-run] [--branch=<branch>]"
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

# ── Preflight checks ──────────────────────────────────

echo "🔍 Preflight checks..."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Working tree has uncommitted changes."
  echo "   Commit or stash your changes first, then re-run."
  exit 1
fi

if ! git remote get-url "$REMOTE" &>/dev/null; then
  echo "❌ Remote '$REMOTE' not found."
  echo "   Available remotes:"
  git remote -v
  exit 1
fi

echo "✅ Clean tree, remote '$REMOTE' found."

# ── Fetch latest from remote ──────────────────────────

echo ""
echo "📡 Fetching from $REMOTE..."
git fetch "$REMOTE"

# ── Package mapping ───────────────────────────────────
# vendor dir → upstream package path (inside the OpenCode monorepo)

declare -A PACKAGES=(
  ["vendor/opencode-core"]="packages/opencode"
  ["vendor/opencode-util"]="packages/util"
  ["vendor/opencode-plugin"]="packages/plugin"
  ["vendor/opencode-sdk"]="packages/sdk"
  ["vendor/opencode-script"]="packages/script"
)

# ── Show current vs upstream versions ─────────────────

echo ""
echo "📊 Version comparison:"
echo "   ┌──────────────────────┬─────────┬──────────┐"
echo "   │ Package              │ Vendor  │ Upstream │"
echo "   ├──────────────────────┼─────────┼──────────┤"

for vendor_dir in "${!PACKAGES[@]}"; do
  upstream_path="${PACKAGES[$vendor_dir]}"
  vendor_version=$(grep '"version"' "$vendor_dir/package.json" 2>/dev/null | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
  upstream_version=$(git show "$REMOTE/$BRANCH:$upstream_path/package.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*: *"\(.*\)".*/\1/' || echo "???")
  printf "   │ %-20s │ %-7s │ %-8s │\n" "$(basename "$vendor_dir")" "$vendor_version" "$upstream_version"
done

echo "   └──────────────────────┴─────────┴──────────┘"

if $DRY_RUN; then
  echo ""
  echo "🔎 Dry run — nothing will be changed."
  exit 0
fi

# ── Sync opencode-core via git subtree ────────────────

echo ""
echo "🔄 [1/5] Syncing vendor/opencode-core (git subtree pull)..."
git subtree pull \
  --prefix vendor/opencode-core \
  "$REMOTE" "$BRANCH:packages/opencode" \
  --squash \
  --message="chore: sync vendor/opencode-core from $REMOTE"

echo "   ✅ opencode-core synced."

# ── Sync helper packages via rsync from git show ──────
# These packages weren't added via subtree, so we extract
# from the fetched remote and overwrite.

sync_helper_package() {
  local vendor_dir="$1"
  local upstream_path="$2"
  local pkg_name
  pkg_name="$(basename "$vendor_dir")"

  echo ""
  echo "🔄 Syncing $vendor_dir (rsync from $REMOTE/$BRANCH)..."

  # Create a temp dir, export the upstream package into it
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf '$tmp_dir'" RETURN

  git archive "$REMOTE/$BRANCH" -- "$upstream_path/" | tar -x -C "$tmp_dir"

  # rsync from extracted to vendor dir
  rsync -a --delete "$tmp_dir/$upstream_path/" "$vendor_dir/"

  git add "$vendor_dir"

  local changes
  changes=$(git diff --cached --stat -- "$vendor_dir" | tail -1)
  if [ -z "$changes" ]; then
    echo "   ⏭️  $pkg_name: already up to date."
    git reset HEAD -- "$vendor_dir" &>/dev/null || true
  else
    git commit -m "chore: sync $vendor_dir from $REMOTE" -- "$vendor_dir"
    echo "   ✅ $pkg_name synced: $changes"
  fi

  rm -rf "$tmp_dir"
  trap - RETURN
}

echo ""
echo "🔄 [2/5] Syncing vendor/opencode-util..."
sync_helper_package "vendor/opencode-util" "packages/util"

echo "🔄 [3/5] Syncing vendor/opencode-plugin..."
sync_helper_package "vendor/opencode-plugin" "packages/plugin"

echo "🔄 [4/5] Syncing vendor/opencode-sdk..."
sync_helper_package "vendor/opencode-sdk" "packages/sdk"

echo "🔄 [5/5] Syncing vendor/opencode-script..."
sync_helper_package "vendor/opencode-script" "packages/script"

# ── Post-sync checks ─────────────────────────────────

echo ""
echo "🏗️  Post-sync: installing dependencies..."
bun install

echo ""
echo "🔍 Post-sync: checking migrations..."
new_migrations=$(git diff HEAD~5 --name-only -- vendor/opencode-core/migration/ 2>/dev/null | head -10)
if [ -n "$new_migrations" ]; then
  echo "   ⚠️  New migrations detected:"
  echo "$new_migrations" | sed 's/^/      /'
  echo "   Review these before running the app!"
else
  echo "   ✅ No new migrations."
fi

echo ""
echo "🔍 Post-sync: running typecheck..."
bun run typecheck || {
  echo ""
  echo "   ❌ Typecheck failed. Review the changes and fix before committing."
  exit 1
}

echo ""
echo "🔍 Post-sync: running tests..."
cd packages/buddy && bun test --preload ./test/preload.ts test && cd "$REPO_ROOT" || {
  echo ""
  echo "   ❌ Tests failed. Review the changes and fix before committing."
  exit 1
}

echo ""
echo "🔍 Post-sync: regenerating SDK..."
cd packages/sdk && bun run generate && cd "$REPO_ROOT"
sdk_diff=$(git diff --stat -- packages/sdk/src/gen/ | tail -1)
if [ -n "$sdk_diff" ]; then
  echo "   ⚠️  SDK types changed: $sdk_diff"
  echo "   Review the SDK diff and run web typecheck."
  git add packages/sdk/src/gen/
  git commit -m "chore: regenerate SDK after vendor sync" -- packages/sdk/src/gen/
else
  echo "   ✅ SDK types unchanged."
fi

echo ""
echo "════════════════════════════════════════════════"
echo "  ✅ Vendor sync complete!"
echo ""
echo "  Next steps:"
echo "    1. Review: git log --oneline -n 10"
echo "    2. Test:   bun run dev (smoke test)"
echo "    3. Push:   git push origin"
echo "════════════════════════════════════════════════"
