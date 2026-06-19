#!/usr/bin/env bash
set -euo pipefail

REPO="${BUDDY_RELEASE_REPO:-prashantbhudwal/buddy-releases}"
DEST_DIR="${BUDDY_DOWNLOAD_DIR:-$HOME/Downloads/buddy-release}"
QUARANTINE_ATTR="com.apple.quarantine"
BUDDY_APP_PATH="/Applications/Buddy.app"
LATEST_RELEASE_DOWNLOAD_BASE_URL="https://github.com/${REPO}/releases/latest/download"
DOWNLOAD_RETRIES="${BUDDY_DOWNLOAD_RETRIES:-3}"

case "$(uname -m)" in
  arm64)
    ARCH="arm64"
    ;;
  x86_64)
    ARCH="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

ASSET_BASENAME="buddy-electron-mac-${ARCH}"
DMG_NAME="${ASSET_BASENAME}.dmg"
ZIP_NAME="${ASSET_BASENAME}.zip"

mkdir -p "${DEST_DIR}"

case "${DOWNLOAD_RETRIES}" in
  "" | *[!0-9]* | 0)
    echo "BUDDY_DOWNLOAD_RETRIES must be a positive integer, got: ${DOWNLOAD_RETRIES}" >&2
    exit 1
    ;;
esac

ASSET_NAME=""
ASSET_URL=""
TAG="latest"

download_candidate_asset() {
  local candidate_name="$1"
  local candidate_url="${LATEST_RELEASE_DOWNLOAD_BASE_URL}/${candidate_name}"
  local candidate_output="${DEST_DIR}/${candidate_name}"
  local attempt=1
  local delay_seconds=2

  echo "Downloading ${candidate_name} from latest release..."
  while (( attempt <= DOWNLOAD_RETRIES )); do
    if curl -fL --connect-timeout 20 --progress-bar "${candidate_url}" -o "${candidate_output}"; then
      ASSET_NAME="${candidate_name}"
      ASSET_URL="${candidate_url}"
      OUTPUT_PATH="${candidate_output}"
      return 0
    fi

    rm -f "${candidate_output}"
    if (( attempt == DOWNLOAD_RETRIES )); then
      return 1
    fi

    echo "Download attempt ${attempt}/${DOWNLOAD_RETRIES} failed. Retrying in ${delay_seconds}s..."
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

if download_candidate_asset "${DMG_NAME}"; then
  :
elif download_candidate_asset "${ZIP_NAME}"; then
  :
else
  echo "Latest release does not contain ${DMG_NAME} or ${ZIP_NAME}" >&2
  exit 1
fi

resolve_release_tag_from_asset_url "${ASSET_URL}"

echo "Removing quarantine flag from ${ASSET_NAME}..."
/usr/bin/xattr -d "${QUARANTINE_ATTR}" "${OUTPUT_PATH}" 2>/dev/null || true

echo "Saved to ${OUTPUT_PATH}"
echo "Opening ${OUTPUT_PATH}..."
/usr/bin/open "${OUTPUT_PATH}"

cat <<EOF

Opened the latest Buddy release package.

Removed ${QUARANTINE_ATTR} from the downloaded package.
If macOS still blocks Buddy after install, run:
  xattr -rd ${QUARANTINE_ATTR} "${BUDDY_APP_PATH}"
Release: ${TAG}
Asset: ${ASSET_NAME}
Path: ${OUTPUT_PATH}
EOF
