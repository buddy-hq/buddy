#!/usr/bin/env bash
set -euo pipefail

# -- Colors -------------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[32m'
  CYAN=$'\033[36m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  MAGENTA=$'\033[35m'
  RESET=$'\033[0m'
else
  BOLD="" DIM="" GREEN="" CYAN="" YELLOW="" RED="" MAGENTA="" RESET=""
fi

info()  { printf "%s  %s%s\n" "${CYAN}" "$1" "${RESET}"; }
ok()    { printf "%s  [ok]%s %s\n" "${GREEN}" "${RESET}" "$1"; }
warn()  { printf "%s  [warn]%s %s\n" "${YELLOW}" "${RESET}" "$1"; }
fail()  { printf "%s  [error]%s %s\n" "${RED}" "${RESET}" "$1" >&2; }
progress() { printf "%s  [..]%s %s\n" "${MAGENTA}" "${RESET}" "$1"; }

# -- Banner -------------------------------------------------------------------
printf "\n%s  Buddy installer%s\n" "${BOLD}" "${RESET}"
printf "%s  macOS%s\n\n" "${DIM}" "${RESET}"

# -- Config -------------------------------------------------------------------
REPO="${BUDDY_RELEASE_REPO:-prashantbhudwal/buddy-releases}"
DEST_DIR="${BUDDY_DOWNLOAD_DIR:-$HOME/Downloads/buddy-release}"
QUARANTINE_ATTR="com.apple.quarantine"
LATEST_RELEASE_DOWNLOAD_BASE_URL="https://github.com/${REPO}/releases/latest/download"
DOWNLOAD_RETRIES="${BUDDY_DOWNLOAD_RETRIES:-3}"

case "$(uname -m)" in
  arm64)
    ARCH="arm64"
    ARCH_LABEL="apple-silicon"
    ;;
  x86_64)
    ARCH="x64"
    ARCH_LABEL="intel"
    ;;
  *)
    fail "Unsupported architecture: $(uname -m)"
    exit 1
    ;;
esac

mkdir -p "${DEST_DIR}"

case "${DOWNLOAD_RETRIES}" in
  "" | *[!0-9]* | 0)
    fail "BUDDY_DOWNLOAD_RETRIES must be a positive integer, got: ${DOWNLOAD_RETRIES}"
    exit 1
    ;;
esac

ASSET_NAME=""
ASSET_URL=""
TAG="latest"
SPINNER_PID=""

cleanup_spinner() {
  if [[ -n "${SPINNER_PID}" ]]; then
    kill "${SPINNER_PID}" 2>/dev/null || true
    wait "${SPINNER_PID}" 2>/dev/null || true
    SPINNER_PID=""
    printf "\r\033[K"
  fi
}

trap cleanup_spinner EXIT

resolve_latest_release_tag() {
  local api_url="https://api.github.com/repos/${REPO}/releases/latest"
  local tag

  tag="$(
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "${api_url}" |
      sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' |
      head -1
  )"

  if [[ -z "${tag}" ]]; then
    fail "Could not resolve latest Buddy release tag from ${api_url}"
    exit 1
  fi

  TAG="${tag}"
}

version_from_tag() {
  printf '%s\n' "${TAG#v}"
}

candidate_asset_size() {
  local candidate_name="$1"
  local candidate_url="${LATEST_RELEASE_DOWNLOAD_BASE_URL}/${candidate_name}"

  curl -fsSLI "${candidate_url}" 2>/dev/null |
    awk 'BEGIN { IGNORECASE = 1 } /^content-length:/ { print $2 }' |
    tr -d '\r' |
    tail -1
}

format_megabytes() {
  local bytes="$1"
  awk -v bytes="${bytes}" 'BEGIN { printf "%.1f MB", bytes / 1048576 }'
}

start_download_spinner() {
  local output_path="$1"
  local expected_bytes="$2"
  local bar_width=24
  local downloaded_bytes
  local percent
  local filled
  local empty
  local bar
  local downloaded_text
  local expected_text

  while true; do
    if [[ -f "${output_path}" ]]; then
      downloaded_bytes="$(wc -c <"${output_path}" 2>/dev/null | tr -d '[:space:]')"
    else
      downloaded_bytes="0"
    fi

    if [[ -z "${downloaded_bytes}" ]]; then
      downloaded_bytes="0"
    fi
    percent=$((downloaded_bytes * 100 / expected_bytes))
    if (( percent > 100 )); then
      percent=100
    fi
    filled=$((percent * bar_width / 100))
    empty=$((bar_width - filled))
    bar="$(printf '%*s' "${filled}" '' | tr ' ' '#')"
    bar="${bar}$(printf '%*s' "${empty}" '' | tr ' ' '-')"
    downloaded_text="$(format_megabytes "${downloaded_bytes}")"
    expected_text="$(format_megabytes "${expected_bytes}")"

    printf "\r%s  [%s]%s %3d%%  %s / %s" \
      "${MAGENTA}" "${bar}" "${RESET}" "${percent}" "${downloaded_text}" "${expected_text}"
    sleep 0.25
  done
}

download_candidate_asset() {
  local candidate_name="$1"
  local candidate_url="${LATEST_RELEASE_DOWNLOAD_BASE_URL}/${candidate_name}"
  local candidate_output="${DEST_DIR}/${candidate_name}"
  local attempt=1
  local delay_seconds=2
  local expected_bytes

  expected_bytes="$(candidate_asset_size "${candidate_name}")"
  if [[ -z "${expected_bytes}" || "${expected_bytes}" == "0" ]]; then
    return 1
  fi

  while (( attempt <= DOWNLOAD_RETRIES )); do
    start_download_spinner "${candidate_output}" "${expected_bytes}" &
    SPINNER_PID="$!"
    if curl -fL --show-error --silent --connect-timeout 20 "${candidate_url}" -o "${candidate_output}"; then
      cleanup_spinner
      ASSET_NAME="${candidate_name}"
      ASSET_URL="${candidate_url}"
      OUTPUT_PATH="${candidate_output}"
      return 0
    fi
    cleanup_spinner

    rm -f "${candidate_output}"
    if (( attempt == DOWNLOAD_RETRIES )); then
      return 1
    fi

    warn "Attempt ${attempt}/${DOWNLOAD_RETRIES} failed, retrying in ${delay_seconds}s..."
    sleep "${delay_seconds}"
    attempt=$((attempt + 1))
    delay_seconds=$((delay_seconds * 2))
  done

  return 1
}

resolve_release_tag_from_asset_url() {
  local asset_url="$1"
  local final_url
  local resolved_tag

  final_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${asset_url}" || true)"
  resolved_tag="$(printf '%s\n' "${final_url}" | sed -nE 's|.*/releases/download/([^/]+)/.*|\1|p')"

  if [[ -n "${resolved_tag}" ]]; then
    TAG="${resolved_tag}"
  fi
}

resolve_latest_release_tag
ok "Latest release ${TAG}"

VERSION="$(version_from_tag)"
CURRENT_ASSET_BASENAME="buddy-v${VERSION}-macos-${ARCH_LABEL}"
LEGACY_ASSET_BASENAME="buddy-electron-mac-${ARCH}"
CANDIDATE_ASSETS=(
  "${CURRENT_ASSET_BASENAME}.dmg"
  "${CURRENT_ASSET_BASENAME}.zip"
  "${LEGACY_ASSET_BASENAME}.dmg"
  "${LEGACY_ASSET_BASENAME}.zip"
)

progress "Downloading Buddy for ${ARCH_LABEL}. This can take a minute."
if download_candidate_asset "${CANDIDATE_ASSETS[0]}"; then
  ok "Downloaded ${ASSET_NAME}"
elif download_candidate_asset "${CANDIDATE_ASSETS[1]}"; then
  ok "Downloaded ${ASSET_NAME}"
elif download_candidate_asset "${CANDIDATE_ASSETS[2]}"; then
  ok "Downloaded ${ASSET_NAME}"
elif download_candidate_asset "${CANDIDATE_ASSETS[3]}"; then
  ok "Downloaded ${ASSET_NAME}"
else
  fail "Latest release ${TAG} does not contain a supported macOS asset for ${ARCH}"
  exit 1
fi

resolve_release_tag_from_asset_url "${ASSET_URL}"

# -- Quarantine ---------------------------------------------------------------
/usr/bin/xattr -d "${QUARANTINE_ATTR}" "${OUTPUT_PATH}" 2>/dev/null || true
ok "Prepared installer"

# -- Launch -------------------------------------------------------------------
/usr/bin/open "${OUTPUT_PATH}"
ok "Installer opened"

# -- Summary ------------------------------------------------------------------
printf "\n%s  Next step%s\n" "${BOLD}" "${RESET}"
printf "  Drag Buddy into Applications in the window that opened.\n"
printf "%s  Download: %s%s\n\n" "${DIM}" "${OUTPUT_PATH}" "${RESET}"
