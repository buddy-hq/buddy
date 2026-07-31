#!/usr/bin/env bash
set -euo pipefail

readonly DEFAULT_RELEASE_REPOSITORY="prashantbhudwal/buddy-releases"
readonly RELEASE_COUNT=3
readonly GITHUB_API_VERSION="2022-11-28"
readonly INSTALLER_ASSET_PATTERN='^buddy-v[0-9]+\.[0-9]+\.[0-9]+-macos-(apple-silicon|intel)\.dmg$|^buddy-v[0-9]+\.[0-9]+\.[0-9]+-windows-x64\.exe$'

release_repository="${BUDDY_RELEASE_REPO:-${DEFAULT_RELEASE_REPOSITORY}}"
include_all_assets=false

usage() {
  cat <<'EOF'
Usage: bash scripts/release-download-count.sh [--all-assets] [--release-repo OWNER/REPOSITORY]

Shows GitHub's lifetime download counts for installer assets from the three most
recently published Buddy releases. By default, this includes the macOS DMGs and
Windows EXE selected by the Buddy install scripts.

Options:
  --all-assets                    Include every release asset, including updater metadata.
  --release-repo OWNER/REPOSITORY Override BUDDY_RELEASE_REPO for this invocation.
  --help                          Show this help text.

GitHub does not provide per-asset download counts for a selected date range.
EOF
}

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

while (($# > 0)); do
  case "$1" in
    --all-assets)
      include_all_assets=true
      ;;
    --release-repo)
      (($# >= 2)) || fail "--release-repo requires OWNER/REPOSITORY"
      release_repository="$2"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

require_command gh
require_command jq

gh auth status --hostname github.com >/dev/null 2>&1 || fail "Authenticate GitHub CLI first with: gh auth login"

releases_json="$(
  gh api \
    --paginate \
    --slurp \
    -H "X-GitHub-Api-Version: ${GITHUB_API_VERSION}" \
    "repos/${release_repository}/releases?per_page=100"
)"

asset_scope="installer assets selected by the install scripts"
if [[ "${include_all_assets}" == true ]]; then
  asset_scope="all release assets"
fi

jq -r \
  --arg asset_scope "${asset_scope}" \
  --arg installer_asset_pattern "${INSTALLER_ASSET_PATTERN}" \
  --arg repository "${release_repository}" \
  --argjson include_all_assets "${include_all_assets}" \
  --argjson release_count "${RELEASE_COUNT}" \
  '
    def selected_assets:
      [
        .assets[]
        | select($include_all_assets or (.name | test($installer_asset_pattern)))
        | { download_count, name }
      ];

    add
    | map(select(.draft | not) | select(.published_at != null))
    | sort_by(.published_at)
    | reverse
    | .[0:$release_count] as $releases
    | "GitHub download counts are lifetime totals.",
      "Repository: \($repository)",
      "Scope: \($asset_scope)",
      "",
      (
        $releases[]
        | selected_assets as $assets
        | (if .prerelease then " (prerelease)" else "" end) as $release_channel
        | "\(.tag_name) — published \(.published_at)\($release_channel)",
          (if ($assets | length) == 0 then "  No matching assets." else $assets[] | "  \(.name): \(.download_count)" end),
          "  Release total: \([$assets[].download_count] | add // 0)",
          ""
      ),
      "Combined total: \([$releases[] | selected_assets[] | .download_count] | add // 0)"
  ' <<<"${releases_json}"
