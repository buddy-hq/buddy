#!/usr/bin/env bash
set -euo pipefail

readonly APP_ID="ai.buddy.desktop.dev"
readonly APP_NAME="Buddy Dev"
readonly MACOS_NAME="Darwin"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DESKTOP_PACKAGE_JSON="${REPO_ROOT}/packages/desktop-electron/package.json"
readonly DESKTOP_DIST_DIRECTORY="${REPO_ROOT}/packages/desktop-electron/dist"
readonly INSTALL_DIRECTORY="${BUDDY_DEV_INSTALL_DIR:-/Applications}"
readonly INSTALLED_APP_PATH="${INSTALL_DIRECTORY}/${APP_NAME}.app"
readonly USER_LIBRARY_DIRECTORY="${HOME}/Library"
readonly TEMPORARY_DIRECTORY_PREFIX="buddy-dev-reinstall"
readonly QUARANTINE_ATTRIBUTE="com.apple.quarantine"

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

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command is unavailable: $1"
    exit 1
  fi
}

resolve_architecture_label() {
  case "$(uname -m)" in
    arm64)
      printf "%s\n" "apple-silicon"
      ;;
    x86_64)
      printf "%s\n" "intel"
      ;;
    *)
      fail "Unsupported macOS architecture: $(uname -m)"
      exit 1
      ;;
  esac
}

read_desktop_version() {
  if [[ -n "${BUDDY_VERSION:-}" ]]; then
    printf "%s\n" "${BUDDY_VERSION#v}"
    return
  fi

  bun --eval '
    const packageJsonPath = process.argv.at(-1)
    if (!packageJsonPath) {
      process.exit(1)
    }
    const packageJson = await Bun.file(packageJsonPath).json()
    console.log(packageJson.version)
  ' "${DESKTOP_PACKAGE_JSON}"
}

is_dev_app_running() {
  pgrep -f "${INSTALLED_APP_PATH}" >/dev/null 2>&1
}

stop_dev_app() {
  if ! is_dev_app_running; then
    ok "Buddy Dev is not running"
    return
  fi

  info "Quitting Buddy Dev"
  osascript -e "tell application id \"${APP_ID}\" to quit" >/dev/null 2>&1 || true

  for _ in {1..10}; do
    if ! is_dev_app_running; then
      ok "Buddy Dev quit"
      return
    fi
    sleep 1
  done

  pkill -TERM -f "${INSTALLED_APP_PATH}" >/dev/null 2>&1 || true
  for _ in {1..5}; do
    if ! is_dev_app_running; then
      ok "Buddy Dev quit"
      return
    fi
    sleep 1
  done

  pkill -KILL -f "${INSTALLED_APP_PATH}" >/dev/null 2>&1 || true
  if is_dev_app_running; then
    fail "Could not stop Buddy Dev"
    exit 1
  fi

  ok "Buddy Dev quit"
}

remove_dev_paths() {
  local dev_paths=(
    "${INSTALLED_APP_PATH}"
    "${USER_LIBRARY_DIRECTORY}/Application Support/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/Caches/${APP_ID}"
    "${USER_LIBRARY_DIRECTORY}/Caches/${APP_NAME}"
    "${USER_LIBRARY_DIRECTORY}/Logs/${APP_NAME}"
    "${USER_LIBRARY_DIRECTORY}/Preferences/${APP_ID}.plist"
    "${USER_LIBRARY_DIRECTORY}/Saved Application State/${APP_ID}.savedState"
  )
  local path

  for path in "${dev_paths[@]}"; do
    if [[ ! -e "${path}" ]]; then
      continue
    fi

    rm -rf "${path}"
    ok "Removed ${path}"
  done
}

install_dev_app() {
  (
    local version="$1"
    local architecture_label="$2"
    local artifact_path="${DESKTOP_DIST_DIRECTORY}/buddy-v${version}-macos-${architecture_label}.dmg"
    local temporary_directory
    local mount_directory
    local source_app_path
    local mounted=false

    if [[ ! -f "${artifact_path}" ]]; then
      fail "Buddy Dev installer not found at ${artifact_path}"
      exit 1
    fi

    temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/${TEMPORARY_DIRECTORY_PREFIX}.XXXXXX")"
    mount_directory="${temporary_directory}/mount"
    source_app_path="${mount_directory}/${APP_NAME}.app"
    mkdir -p "${mount_directory}"

    cleanup_installation() {
      if [[ "${mounted}" == true ]]; then
        hdiutil detach "${mount_directory}" >/dev/null 2>&1 || true
      fi
      rm -rf "${temporary_directory}"
    }
    trap cleanup_installation EXIT

    info "Mounting ${artifact_path##*/}"
    hdiutil attach "${artifact_path}" -nobrowse -mountpoint "${mount_directory}" >/dev/null
    mounted=true

    if [[ ! -d "${source_app_path}" ]]; then
      fail "Installer does not contain ${APP_NAME}.app"
      exit 1
    fi

    info "Installing ${APP_NAME}.app"
    mkdir -p "${INSTALL_DIRECTORY}"
    ditto "${source_app_path}" "${INSTALLED_APP_PATH}"
    xattr -dr "${QUARANTINE_ATTRIBUTE}" "${INSTALLED_APP_PATH}" >/dev/null 2>&1 || true
    chmod +x "${INSTALLED_APP_PATH}/Contents/MacOS/${APP_NAME}" || true

    hdiutil detach "${mount_directory}" >/dev/null
    mounted=false
    rm -rf "${temporary_directory}"
    trap - EXIT
  )
}

main() {
  local desktop_version
  local architecture_label

  if [[ "$(uname -s)" != "${MACOS_NAME}" ]]; then
    fail "This command only supports macOS"
    exit 1
  fi

  require_command bun
  require_command ditto
  require_command hdiutil
  require_command open
  require_command osascript
  require_command pgrep
  require_command pkill

  printf "\n%s  Buddy Dev reset%s\n" "${BOLD}" "${RESET}"
  printf "  macOS development install\n\n"

  stop_dev_app
  remove_dev_paths

  info "Building the current Buddy Dev installable"
  (
    cd "${REPO_ROOT}"
    BUDDY_CHANNEL=dev bun run build:installable:electron
  )

  desktop_version="$(read_desktop_version)"
  architecture_label="$(resolve_architecture_label)"
  install_dev_app "${desktop_version}" "${architecture_label}"

  info "Opening ${APP_NAME}"
  open "${INSTALLED_APP_PATH}"
  ok "Buddy Dev reset complete"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
