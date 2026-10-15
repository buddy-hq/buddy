#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./script/install-release.sh [--channel prod|beta] [tag]

Examples:
  ./script/install-release.sh
  ./script/install-release.sh v0.0.5
  ./script/install-release.sh --channel beta v0.1.0
  BUDDY_INSTALL_RELEASE_KIND=preview ./script/install-release.sh

Environment overrides:
  BUDDY_RELEASE_REPO   GitHub repo, default: prashantbhudwal/buddy-releases
  BUDDY_INSTALL_DIR    Install directory, default: /Applications
  BUDDY_APP_NAME       App bundle name, default: Buddy
  BUDDY_INSTALL_RELEASE_KIND stable or preview, default: stable
EOF
}

CHANNEL="prod"
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      CHANNEL="${2:-}"
      if [[ $# -lt 2 ]]; then echo "--channel requires prod or beta" >&2; exit 1; fi
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --*) echo "Unknown argument: $1" >&2; exit 1 ;;
    *)
      if [[ -n "$TAG" ]]; then echo "Only one release tag is allowed" >&2; exit 1; fi
      TAG="$1"
      shift
      ;;
  esac
done
case "$CHANNEL" in
  prod)
    EXPECTED_REPO="prashantbhudwal/buddy-releases"
    EXPECTED_APP_NAME="Buddy"
    EXPECTED_APP_ID="ai.buddy.desktop"
    ;;
  beta)
    EXPECTED_REPO="prashantbhudwal/buddy-beta-releases"
    EXPECTED_APP_NAME="Buddy Beta"
    EXPECTED_APP_ID="ai.buddy.desktop.beta"
    ;;
  *) echo "--channel must be prod or beta" >&2; exit 1 ;;
esac
REPO="${BUDDY_RELEASE_REPO:-$EXPECTED_REPO}"
APP_NAME="${BUDDY_APP_NAME:-$EXPECTED_APP_NAME}"
if [[ "$CHANNEL" == "beta" && ( "$REPO" != "$EXPECTED_REPO" || "$APP_NAME" != "$EXPECTED_APP_NAME" ) ]]; then
  echo "Release repository and app name must match $CHANNEL ($EXPECTED_REPO, $EXPECTED_APP_NAME)." >&2
  exit 1
fi
if [[ "$CHANNEL" == "beta" && -n "${GH_REPO:-}" && "$GH_REPO" != "$EXPECTED_REPO" ]]; then
  echo "GH_REPO conflicts with $CHANNEL ($EXPECTED_REPO)." >&2
  exit 1
fi
INSTALL_DIR="${BUDDY_INSTALL_DIR:-/Applications}"
RELEASE_KIND="${BUDDY_INSTALL_RELEASE_KIND:-stable}"
ARCH="$(uname -m)"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required." >&2
  exit 1
fi

if ! command -v hdiutil >/dev/null 2>&1; then
  echo "This installer only supports macOS." >&2
  exit 1
fi

if [[ "$CHANNEL" == "beta" && "$RELEASE_KIND" != "stable" ]]; then
  echo "Beta installs published non-prerelease releases; Preview is only available for prod." >&2
  exit 1
fi

case "$RELEASE_KIND" in
  stable | preview)
    ;;
  *)
    echo "BUDDY_INSTALL_RELEASE_KIND must be stable or preview, got: $RELEASE_KIND" >&2
    exit 1
    ;;
esac

case "$ARCH" in
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
    echo "Unsupported macOS architecture: $ARCH" >&2
    exit 1
    ;;
esac

if [[ -z "$TAG" ]]; then
  RELEASE_LABEL="stable"
  if [[ "$RELEASE_KIND" == "preview" ]]; then
    RELEASE_LABEL="Preview prerelease"
    TAG="$(
      gh api "repos/$REPO/releases" \
        --jq "map(select(.draft == false and .prerelease == true))[0].tag_name"
    )"
  else
    if ! TAG="$(
      gh api "repos/$REPO/releases/latest" \
        --jq ".tag_name"
    )"; then
      TAG=""
    fi
  fi
fi

if [[ -z "$TAG" || "$TAG" == "null" ]]; then
  echo "Could not resolve the latest ${RELEASE_LABEL:-release} tag for $REPO." >&2
  exit 1
fi

RELEASE_STATE="$(
  gh release view "$TAG" \
    --repo "$REPO" \
    --json isDraft,isPrerelease \
    --jq '[.isDraft, .isPrerelease] | @tsv'
)"
read -r IS_DRAFT IS_PRERELEASE <<<"$RELEASE_STATE"

if [[ "$IS_DRAFT" != "false" ]]; then
  echo "Release $REPO@$TAG is still a draft." >&2
  exit 1
fi

if [[ "$RELEASE_KIND" == "preview" && "$IS_PRERELEASE" != "true" ]]; then
  echo "Release $REPO@$TAG is not a Preview prerelease." >&2
  exit 1
fi

if [[ "$RELEASE_KIND" == "stable" && "$IS_PRERELEASE" != "false" ]]; then
  echo "Release $REPO@$TAG is not a stable release." >&2
  exit 1
fi

ASSET_CANDIDATES=(
  "buddy-v${TAG#v}-macos-${RELEASE_ARCH_FRIENDLY}.dmg"
  "buddy-electron-mac-${RELEASE_ARCH_ELECTRON}.dmg"
  "buddy-electron-darwin-${RELEASE_ARCH_LEGACY}.dmg"
  "buddy-desktop-darwin-${RELEASE_ARCH_LEGACY}.dmg"
)
TMP_DIR="$(mktemp -d)"
MOUNT_DIR="$TMP_DIR/mount"
EXTRACT_DIR="$TMP_DIR/extracted"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"

cleanup() {
  if mount | grep -q "$MOUNT_DIR"; then
    hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$MOUNT_DIR"

ASSET=""
ASSET_PATH=""
for candidate in "${ASSET_CANDIDATES[@]}"; do
  if gh release download "$TAG" --repo "$REPO" --pattern "$candidate" --dir "$TMP_DIR" >/dev/null 2>&1; then
    ASSET="$candidate"
    ASSET_PATH="$TMP_DIR/$candidate"
    break
  fi
done

if [[ -z "$ASSET" ]]; then
  MANIFEST_NAME="latest-macos-${RELEASE_ARCH_ELECTRON}.json"
  MANIFEST_PATH="$TMP_DIR/$MANIFEST_NAME"
  if gh release download "$TAG" --repo "$REPO" --pattern "$MANIFEST_NAME" --dir "$TMP_DIR" >/dev/null 2>&1; then
    PINNED_ARCHIVE_URL="$(
      sed -nE 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]+\.zip)".*/\1/p' "$MANIFEST_PATH" |
        head -1
    )"

    if [[ -n "$PINNED_ARCHIVE_URL" ]]; then
      ASSET="$(basename "${PINNED_ARCHIVE_URL%%\?*}")"
      ASSET_PATH="$TMP_DIR/$ASSET"
      if [[ "$PINNED_ARCHIVE_URL" == http://* || "$PINNED_ARCHIVE_URL" == https://* ]]; then
        curl -fL --show-error --silent "$PINNED_ARCHIVE_URL" -o "$ASSET_PATH"
      elif ! gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --dir "$TMP_DIR" >/dev/null 2>&1; then
        ASSET=""
        ASSET_PATH=""
      fi
    fi
  fi
fi

if [[ -z "$ASSET" ]]; then
  echo "Could not find or resolve a supported macOS installer asset in $TAG." >&2
  echo "Tried: ${ASSET_CANDIDATES[*]} and latest-macos-${RELEASE_ARCH_ELECTRON}.json" >&2
  exit 1
fi

echo "Downloading $TAG ($ASSET) from $REPO..."
echo "Using asset: $ASSET"

case "$ASSET" in
  *.dmg)
    echo "Mounting DMG..."
    hdiutil attach "$ASSET_PATH" -nobrowse -mountpoint "$MOUNT_DIR" >/dev/null
    SOURCE_APP_PATH="$MOUNT_DIR/$APP_NAME.app"
    ;;
  *.zip)
    echo "Extracting ZIP..."
    mkdir -p "$EXTRACT_DIR"
    ditto -x -k "$ASSET_PATH" "$EXTRACT_DIR"
    SOURCE_APP_PATH="$EXTRACT_DIR/$APP_NAME.app"
    ;;
  *)
    echo "Unsupported macOS installer asset: $ASSET" >&2
    exit 1
    ;;
esac

if [[ ! -d "$SOURCE_APP_PATH" ]]; then
  echo "Downloaded installer does not contain $APP_NAME.app." >&2
  exit 1
fi

DOWNLOADED_APP_ID="$(plutil -extract CFBundleIdentifier raw -o - "$SOURCE_APP_PATH/Contents/Info.plist")"
if [[ "$DOWNLOADED_APP_ID" != "$EXPECTED_APP_ID" ]]; then
  echo "Downloaded bundle id $DOWNLOADED_APP_ID does not match $EXPECTED_APP_ID; refusing replacement." >&2
  exit 1
fi

echo "Installing $APP_NAME.app to $INSTALL_DIR..."
rm -rf "$APP_PATH"
ditto "$SOURCE_APP_PATH" "$APP_PATH"

echo "Clearing quarantine..."
xattr -dr com.apple.quarantine "$APP_PATH" || true

echo "Ensuring bundled executables are runnable..."
chmod +x "$APP_PATH/Contents/MacOS/$APP_NAME" || true

INSTALLED_VERSION="$(defaults read "$APP_PATH/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"

echo "Installed $APP_NAME ${INSTALLED_VERSION:-$TAG} at $APP_PATH"
echo "Launch with: open -a \"$APP_PATH\""
