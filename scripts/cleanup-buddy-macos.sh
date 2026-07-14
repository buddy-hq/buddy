#!/usr/bin/env bash
set -euo pipefail

readonly APP_ID="ai.buddy.desktop"
readonly APP_NAME="${BUDDY_APP_NAME:-Buddy}"
readonly MACOS_NAME="Darwin"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly RELEASE_REPO="${BUDDY_RELEASE_REPO:-prashantbhudwal/buddy-releases}"
readonly INSTALL_DIRECTORY="${BUDDY_INSTALL_DIR:-/Applications}"
readonly INSTALLED_APP_PATH="${INSTALL_DIRECTORY}/${APP_NAME}.app"
readonly USER_LIBRARY_DIRECTORY="${HOME}/Library"
readonly USER_DATA_DIRECTORY="${USER_LIBRARY_DIRECTORY}/Application Support/${APP_ID}"
readonly BUDDY_HOME_DIRECTORY="${HOME}/.buddy"
readonly BUDDY_XDG_DATA_DIRECTORY="${HOME}/.local/share/buddy"
readonly BUDDY_XDG_CACHE_DIRECTORY="${HOME}/.cache/buddy"
readonly BUDDY_XDG_STATE_DIRECTORY="${HOME}/.local/state/buddy"
readonly BUDDY_TEMP_DIRECTORY="${TMPDIR:-/tmp}/${APP_ID}"
readonly TEMPORARY_DIRECTORY_PREFIX="buddy-production-reinstall"
readonly QUARANTINE_ATTRIBUTE="com.apple.quarantine"
readonly RELEASE_KIND_STABLE="stable"
readonly RELEASE_KIND_PREVIEW="preview"

if [[ -t 1 ]]; then
  readonly BOLD=$'\033[1m'
  readonly CYAN=$'\033[36m'
  readonly GREEN=$'\033[32m'
  readonly RED=$'\033[31m'
  readonly RESET=$'\033[0m'
else
  readonly BOLD=""
  readonly CYAN=""
  readonly GREEN=""
  readonly RED=""
  readonly RESET=""
fi

info() {
  printf "%s  %s%s\n" "${CYAN}" "$1" "${RESET}"
}

ok() {
  printf "%s  [ok]%s %s\n" "${GREEN}" "${RESET}" "$1"
}

fail() {
  printf "%s  [error]%s %s\n" "${RED}" "${RESET}" "$1" >&2
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/cleanup-buddy-macos.sh <preview|stable> [tag]

Factory-reset production Buddy on macOS, then reinstall from buddy-releases.

Arguments:
  preview   Install the latest published Preview prerelease
  stable    Install the latest stable release
  tag       Optional explicit release tag (for example v0.0.50).
            Tag must match the kind: preview tags must be prereleases;
            stable tags must not be prereleases. Validated before any
            local files are deleted.

Examples:
  bun run cleanup:mac -- preview
  bun run cleanup:mac -- stable
  bun run cleanup:mac:preview
  bun run cleanup:mac:stable
  bun run cleanup:mac -- preview v0.0.50

Environment overrides:
  BUDDY_RELEASE_REPO   GitHub repo, default: prashantbhudwal/buddy-releases
  BUDDY_INSTALL_DIR    Install directory, default: /Applications
  BUDDY_APP_NAME       App bundle name, default: Buddy

Removes production Buddy.app and its app/backend state under:
  ~/Library/Application Support/ai.buddy.desktop
  ~/.buddy
  ~/.local/share|cache|state/buddy
  related macOS caches, logs, preferences, WebKit, and temp updater state

Preserves Buddy Dev (`ai.buddy.desktop.dev`) and notebook documents under
~/Documents/Buddy. Preview and stable reinstall the same production app
identity and shared state — only the release channel differs.

Requires gh authenticated against the releases repo. The release is downloaded
and staged before Buddy is stopped or any production state is deleted.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command is unavailable: $1"
    exit 1
  fi
}

resolve_architecture() {
  case "$(uname -m)" in
    arm64)
      RELEASE_ARCH_FRIENDLY="apple-silicon"
      RELEASE_ARCH_ELECTRON="arm64"
      RELEASE_ARCH_LEGACY="aarch64"
      ;;
    x86_64)
      RELEASE_ARCH_FRIENDLY="intel"
      RELEASE_ARCH_ELECTRON="x64"
      RELEASE_ARCH_LEGACY="x64"
      ;;
    *)
      fail "Unsupported macOS architecture: $(uname -m)"
      exit 1
      ;;
  esac
}

is_prod_app_running() {
  pgrep -f "${INSTALLED_APP_PATH}" >/dev/null 2>&1 \
    || pgrep -f "/${APP_NAME}.app/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1
}

stop_prod_app() {
  info "Quitting ${APP_NAME} (bundle id ${APP_ID})"
  osascript -e "tell application id \"${APP_ID}\" to quit" >/dev/null 2>&1 || true

  if ! is_prod_app_running; then
    ok "${APP_NAME} is not running"
    return
  fi

  for _ in {1..10}; do
    if ! is_prod_app_running; then
      ok "${APP_NAME} quit"
      return
    fi
    sleep 1
  done

  pkill -TERM -f "${INSTALLED_APP_PATH}" >/dev/null 2>&1 || true
  pkill -TERM -f "/${APP_NAME}.app/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1 || true
  for _ in {1..5}; do
    if ! is_prod_app_running; then
      ok "${APP_NAME} quit"
      return
    fi
    sleep 1
  done

  pkill -KILL -f "${INSTALLED_APP_PATH}" >/dev/null 2>&1 || true
  pkill -KILL -f "/${APP_NAME}.app/Contents/MacOS/${APP_NAME}" >/dev/null 2>&1 || true
  if is_prod_app_running; then
    fail "Could not stop ${APP_NAME}"
    exit 1
  fi

  ok "${APP_NAME} quit"
}

remove_path_if_present() {
  local path="$1"

  if [[ ! -e "${path}" && ! -L "${path}" ]]; then
    return
  fi

  rm -rf -- "${path}"
  ok "Removed ${path}"
}

remove_prod_paths() {
  defaults delete "${APP_ID}" >/dev/null 2>&1 || true

  local prod_paths=(
    "${INSTALLED_APP_PATH}"
    "${USER_DATA_DIRECTORY}"
    "${USER_LIBRARY_DIRECTORY}/Application Scripts/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/Caches/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/Caches/${APP_NAME}"
    "${USER_LIBRARY_DIRECTORY}/Containers/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/Cookies/${APP_ID}.binarycookies"
    "${USER_LIBRARY_DIRECTORY}/HTTPStorages/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/HTTPStorages/${APP_ID}.binarycookies"
    "${USER_LIBRARY_DIRECTORY}/Logs/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/Logs/${APP_NAME}"
    "${USER_LIBRARY_DIRECTORY}/Preferences/${APP_ID}.plist"
    "${USER_LIBRARY_DIRECTORY}/Saved Application State/${APP_ID}.savedState"
    "${USER_LIBRARY_DIRECTORY}/WebKit/${APP_ID}"
    "${BUDDY_HOME_DIRECTORY}"
    "${BUDDY_XDG_DATA_DIRECTORY}"
    "${BUDDY_XDG_CACHE_DIRECTORY}"
    "${BUDDY_XDG_STATE_DIRECTORY}"
    "${BUDDY_TEMP_DIRECTORY}"
  )
  local path

  for path in "${prod_paths[@]}"; do
    remove_path_if_present "${path}"
  done
}

supported_asset_names() {
  local release_tag="$1"

  printf "%s\n" \
    "buddy-v${release_tag#v}-macos-${RELEASE_ARCH_FRIENDLY}.dmg" \
    "buddy-electron-mac-${RELEASE_ARCH_ELECTRON}.dmg" \
    "buddy-electron-darwin-${RELEASE_ARCH_LEGACY}.dmg" \
    "buddy-desktop-darwin-${RELEASE_ARCH_LEGACY}.dmg" \
    "latest-macos-${RELEASE_ARCH_ELECTRON}.json"
}

release_asset_names() {
  local release_tag="$1"

  gh release view "${release_tag}" \
    --repo "${RELEASE_REPO}" \
    --json assets \
    --jq '.assets[].name'
}

resolve_supported_asset_name() {
  local release_tag="$1"
  local asset_names="$2"
  local candidate

  while IFS= read -r candidate; do
    if printf "%s\n" "${asset_names}" | grep -Fxq "${candidate}"; then
      printf "%s\n" "${candidate}"
      return
    fi
  done < <(supported_asset_names "${release_tag}")

  return 1
}

resolve_release_tag() {
  local release_kind="$1"
  local release_tag="${2:-}"
  local desired_prerelease=false
  local candidate_tags
  local candidate_tag
  local asset_names

  if [[ -n "${release_tag}" ]]; then
    printf "%s\n" "${release_tag}"
    return
  fi

  if [[ "${release_kind}" == "${RELEASE_KIND_PREVIEW}" ]]; then
    desired_prerelease=true
  fi

  candidate_tags="$(
    gh api "repos/${RELEASE_REPO}/releases?per_page=100" \
      --jq ".[] | select(.draft == false and .prerelease == ${desired_prerelease}) | .tag_name"
  )"

  while IFS= read -r candidate_tag; do
    if [[ -z "${candidate_tag}" ]]; then
      continue
    fi

    asset_names="$(release_asset_names "${candidate_tag}")"
    if resolve_supported_asset_name "${candidate_tag}" "${asset_names}" >/dev/null; then
      printf "%s\n" "${candidate_tag}"
      return
    fi
  done <<<"${candidate_tags}"

  fail "Could not resolve the latest installable ${release_kind} tag for ${RELEASE_REPO}"
  exit 1
}

preflight_release() {
  local release_kind="$1"
  local release_tag="$2"
  local release_state
  local is_draft
  local is_prerelease
  local asset_names
  local supported_asset

  info "Preflight: validating ${release_kind} release ${release_tag}"

  release_state="$(
    gh release view "${release_tag}" \
      --repo "${RELEASE_REPO}" \
      --json isDraft,isPrerelease \
      --jq '[.isDraft, .isPrerelease] | @tsv'
  )"
  read -r is_draft is_prerelease <<<"${release_state}"

  if [[ "${is_draft}" != "false" ]]; then
    fail "Release ${RELEASE_REPO}@${release_tag} is still a draft"
    exit 1
  fi

  if [[ "${release_kind}" == "${RELEASE_KIND_PREVIEW}" && "${is_prerelease}" != "true" ]]; then
    fail "Release ${RELEASE_REPO}@${release_tag} is not a Preview prerelease"
    exit 1
  fi

  if [[ "${release_kind}" == "${RELEASE_KIND_STABLE}" && "${is_prerelease}" != "false" ]]; then
    fail "Release ${RELEASE_REPO}@${release_tag} is not a stable release"
    exit 1
  fi

  asset_names="$(release_asset_names "${release_tag}")"
  if ! supported_asset="$(resolve_supported_asset_name "${release_tag}" "${asset_names}")"; then
    fail "Release ${release_tag} has no supported macOS installer asset for this architecture"
    exit 1
  fi

  ok "Preflight asset present: ${supported_asset}"
  ok "Preflight passed for ${release_kind} ${release_tag}"
}

validate_app_name() {
  if [[ "${APP_NAME}" == "." || "${APP_NAME}" == ".." || "${APP_NAME}" == *"/"* ]]; then
    fail "BUDDY_APP_NAME must be a bundle name without path separators, got: ${APP_NAME}"
    exit 1
  fi
}

stage_release() {
  local release_kind="$1"
  local release_tag="$2"
  local staging_directory="$3"

  info "Downloading and staging ${APP_NAME} from ${release_kind} release ${release_tag}"
  (
    cd "${REPO_ROOT}"
    BUDDY_INSTALL_RELEASE_KIND="${release_kind}" \
      BUDDY_APP_NAME="${APP_NAME}" \
      BUDDY_INSTALL_DIR="${staging_directory}" \
      BUDDY_RELEASE_REPO="${RELEASE_REPO}" \
      bash ./script/install-release.sh "${release_tag}"
  )

  if [[ ! -d "${staging_directory}/${APP_NAME}.app" ]]; then
    fail "Downloaded installer did not stage ${APP_NAME}.app"
    exit 1
  fi

  ok "Staged ${APP_NAME}.app for installation"
}

prepare_install_directory() {
  if [[ -e "${INSTALL_DIRECTORY}" && ! -d "${INSTALL_DIRECTORY}" ]]; then
    fail "Install destination is not a directory: ${INSTALL_DIRECTORY}"
    exit 1
  fi

  mkdir -p "${INSTALL_DIRECTORY}"
  if [[ ! -w "${INSTALL_DIRECTORY}" ]]; then
    fail "Install destination is not writable: ${INSTALL_DIRECTORY}"
    exit 1
  fi

  ok "Install destination is writable: ${INSTALL_DIRECTORY}"
}

prepare_staged_app() {
  local staged_app_path="$1"
  local prepared_app_path="$2"

  info "Preparing staged ${APP_NAME}.app on the install volume"
  rm -rf -- "${prepared_app_path}"
  ditto "${staged_app_path}" "${prepared_app_path}"
  xattr -dr "${QUARANTINE_ATTRIBUTE}" "${prepared_app_path}" >/dev/null 2>&1 || true
  chmod +x "${prepared_app_path}/Contents/MacOS/${APP_NAME}" || true

  if [[ ! -d "${prepared_app_path}" ]]; then
    fail "Could not prepare ${APP_NAME}.app at ${prepared_app_path}"
    exit 1
  fi

  ok "Prepared ${APP_NAME}.app on the install volume"
}

activate_prepared_app() {
  local prepared_app_path="$1"

  info "Activating prepared ${APP_NAME}.app"
  mv "${prepared_app_path}" "${INSTALLED_APP_PATH}"
}

main() {
  local release_kind="${1:-}"
  local release_tag_input="${2:-}"
  local release_tag
  local staging_directory
  local staged_app_path
  local prepared_app_path

  if (( $# > 2 )); then
    fail "Expected at most a release kind and optional tag"
    usage
    exit 1
  fi

  if [[ "${release_kind}" == "-h" || "${release_kind}" == "--help" || -z "${release_kind}" ]]; then
    usage
    if [[ -z "${release_kind}" ]]; then
      exit 1
    fi
    exit 0
  fi

  case "${release_kind}" in
    "${RELEASE_KIND_PREVIEW}" | "${RELEASE_KIND_STABLE}")
      ;;
    *)
      fail "Release kind must be '${RELEASE_KIND_PREVIEW}' or '${RELEASE_KIND_STABLE}', got: ${release_kind}"
      usage
      exit 1
      ;;
  esac

  if [[ "$(uname -s)" != "${MACOS_NAME}" ]]; then
    fail "This command only supports macOS"
    exit 1
  fi

  require_command defaults
  require_command ditto
  require_command gh
  require_command grep
  require_command hdiutil
  require_command mktemp
  require_command open
  require_command osascript
  require_command pgrep
  require_command pkill
  require_command xattr

  validate_app_name
  resolve_architecture

  printf "\n%s  Buddy production reset%s\n" "${BOLD}" "${RESET}"
  printf "  macOS clean install (%s)\n\n" "${release_kind}"

  release_tag="$(resolve_release_tag "${release_kind}" "${release_tag_input}")"
  preflight_release "${release_kind}" "${release_tag}"

  staging_directory="$(mktemp -d "${TMPDIR:-/tmp}/${TEMPORARY_DIRECTORY_PREFIX}.XXXXXX")"
  staged_app_path="${staging_directory}/${APP_NAME}.app"
  prepared_app_path="${INSTALL_DIRECTORY}/.${APP_NAME}.clean-install.$$.app"

  cleanup_installation() {
    local exit_status=$?

    if \
      [[ -d "${prepared_app_path}" ]] \
      && [[ ! -e "${INSTALLED_APP_PATH}" ]] \
      && [[ ! -L "${INSTALLED_APP_PATH}" ]]
    then
      mv "${prepared_app_path}" "${INSTALLED_APP_PATH}" >/dev/null 2>&1 || true
    fi

    rm -rf -- "${staging_directory}" "${prepared_app_path}"
    return "${exit_status}"
  }
  trap cleanup_installation EXIT

  stage_release "${release_kind}" "${release_tag}" "${staging_directory}"
  prepare_install_directory
  prepare_staged_app "${staged_app_path}" "${prepared_app_path}"
  stop_prod_app
  remove_prod_paths
  activate_prepared_app "${prepared_app_path}"

  if [[ ! -d "${INSTALLED_APP_PATH}" ]]; then
    fail "Expected installed app at ${INSTALLED_APP_PATH}"
    exit 1
  fi

  info "Opening ${APP_NAME}"
  open "${INSTALLED_APP_PATH}"
  rm -rf -- "${staging_directory}" "${prepared_app_path}"
  trap - EXIT
  ok "Buddy ${release_kind} clean install complete (${release_tag})"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
