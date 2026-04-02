#!/bin/bash
set -euo pipefail

PID="$1"
ARCHIVE_PATH="$2"
APP_PATH="$3"
APP_NAME="$4"
LOG_PATH="$5"

log() {
  local message="$1"
  mkdir -p "$(dirname "$LOG_PATH")"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" >> "$LOG_PATH"
}

wait_for_app_exit() {
  while kill -0 "$PID" >/dev/null 2>&1; do
    sleep 1
  done
}

install_without_privileges() {
  local source_app="$1"
  rm -rf "$APP_PATH"
  /usr/bin/ditto "$source_app" "$APP_PATH"
  /usr/bin/xattr -dr com.apple.quarantine "$APP_PATH" || true
}

install_with_privileges() {
  local source_app="$1"
  /usr/bin/osascript <<'OSA' "$source_app" "$APP_PATH"
on run argv
  set sourcePath to item 1 of argv
  set targetPath to item 2 of argv
  do shell script "/bin/rm -rf " & quoted form of targetPath & " && /usr/bin/ditto " & quoted form of sourcePath & " " & quoted form of targetPath & " && /usr/bin/xattr -dr com.apple.quarantine " & quoted form of targetPath & " || true" with administrator privileges
end run
OSA
}

main() {
  local tmp_dir
  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/buddy-update.XXXXXX")"
  local unpacked_dir="$tmp_dir/unpacked"

  trap 'rm -rf "$tmp_dir"' EXIT

  log "waiting for app process $PID to exit"
  wait_for_app_exit

  mkdir -p "$unpacked_dir"
  log "unpacking archive $ARCHIVE_PATH"
  /usr/bin/ditto -x -k "$ARCHIVE_PATH" "$unpacked_dir"

  local source_app
  source_app="$(find "$unpacked_dir" -maxdepth 1 -type d -name "*.app" | head -n 1)"
  if [[ -z "$source_app" ]]; then
    log "failed to find app bundle in archive"
    exit 1
  fi

  log "installing update to $APP_PATH"
  if ! install_without_privileges "$source_app"; then
    log "normal install failed, requesting administrator privileges"
    install_with_privileges "$source_app"
  fi

  log "relaunching $APP_NAME"
  open "$APP_PATH"
}

main
