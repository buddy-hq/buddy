#!/bin/bash
set -euo pipefail

PID="$1"
ARCHIVE_PATH="$2"
APP_PATH="$3"
APP_NAME="$4"
LOG_PATH="$5"
RESULT_PATH="${6:-}"
TMP_DIR=""

log() {
  local message="$1"
  mkdir -p "$(dirname "$LOG_PATH")"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" >> "$LOG_PATH"
}

write_result() {
  local status="$1"
  local exit_code="${2:-}"

  if [[ -z "$RESULT_PATH" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "$RESULT_PATH")"
  if [[ -n "$exit_code" ]]; then
    printf '{"status":"%s","exitCode":%d}\n' "$status" "$exit_code" > "$RESULT_PATH"
    return
  fi

  printf '{"status":"%s"}\n' "$status" > "$RESULT_PATH"
}

relaunch_existing_app_after_failure() {
  if [[ ! -d "$APP_PATH" ]]; then
    log "not relaunching after install failure because app bundle is missing"
    return
  fi

  if /usr/bin/codesign --verify --deep --strict "$APP_PATH" >> "$LOG_PATH" 2>&1; then
    log "relaunching existing app after install failure"
    open "$APP_PATH" || true
    return
  fi

  log "not relaunching after install failure because app bundle verification failed"
}

record_exit_result() {
  local exit_code=$?
  trap - EXIT

  if [[ -n "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR" || true
  fi

  if [[ "$exit_code" -eq 0 ]]; then
    write_result "succeeded" "$exit_code" || true
    exit "$exit_code"
  fi

  log "installer failed with exit code $exit_code"
  write_result "failed" "$exit_code" || true
  relaunch_existing_app_after_failure
  exit "$exit_code"
}

wait_for_app_exit() {
  while kill -0 "$PID" >/dev/null 2>&1; do
    sleep 1
  done
}

install_without_privileges() {
  local source_app="$1"

  if ! /bin/rm -rf "$APP_PATH" >> "$LOG_PATH" 2>&1; then
    log "failed to remove existing app without privileges"
    return 1
  fi

  if ! /usr/bin/ditto "$source_app" "$APP_PATH" >> "$LOG_PATH" 2>&1; then
    log "failed to copy update without privileges"
    return 1
  fi

  clear_quarantine_attribute "$APP_PATH"
}

install_with_privileges() {
  local source_app="$1"
  /usr/bin/osascript <<'OSA' "$source_app" "$APP_PATH"
on run argv
  set sourcePath to item 1 of argv
  set targetPath to item 2 of argv
  set removeCommand to "/bin/rm -rf " & quoted form of targetPath
  set copyCommand to "/usr/bin/ditto " & quoted form of sourcePath & " " & quoted form of targetPath
  set quarantineCommand to "(/usr/bin/xattr -dr com.apple.quarantine " & quoted form of targetPath & " || true)"
  do shell script removeCommand & " && " & copyCommand & " && " & quarantineCommand with administrator privileges
end run
OSA
}

clear_quarantine_attribute() {
  local target_path="$1"

  if /usr/bin/xattr -dr com.apple.quarantine "$target_path" >> "$LOG_PATH" 2>&1; then
    return 0
  fi

  log "failed to clear quarantine attribute on $target_path; continuing"
  return 0
}

read_team_identifier() {
  local app_path="$1"
  /usr/bin/codesign -dv "$app_path" 2>&1 | /usr/bin/awk -F= '/^TeamIdentifier=/{print $2; exit}'
}

verify_app_signature() {
  local source_app="$1"

  log "verifying extracted app signature"
  /usr/bin/codesign --verify --deep --strict "$source_app" >> "$LOG_PATH" 2>&1
  assess_app_gatekeeper "$source_app"

  local expected_team_id
  expected_team_id="$(read_team_identifier "$APP_PATH" || true)"
  if [[ -z "$expected_team_id" ]]; then
    log "installed app has no TeamIdentifier; skipping team match"
    return
  fi

  local source_team_id
  source_team_id="$(read_team_identifier "$source_app" || true)"
  if [[ "$source_team_id" != "$expected_team_id" ]]; then
    log "extracted app TeamIdentifier mismatch: expected $expected_team_id, got ${source_team_id:-none}"
    exit 1
  fi
}

assess_app_gatekeeper() {
  local source_app="$1"

  log "checking extracted app Gatekeeper assessment"
  if /usr/sbin/spctl --assess --type execute "$source_app" >> "$LOG_PATH" 2>&1; then
    return
  fi

  log "Gatekeeper assessment did not accept extracted app; continuing because macOS releases are not notarized yet"
}

main() {
  trap record_exit_result EXIT
  write_result "running" || true

  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/buddy-update.XXXXXX")"
  local unpacked_dir="$TMP_DIR/unpacked"

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

  verify_app_signature "$source_app"

  log "installing update to $APP_PATH"
  if ! install_without_privileges "$source_app"; then
    log "normal install failed, requesting administrator privileges"
    install_with_privileges "$source_app"
  fi

  log "relaunching $APP_NAME"
  open "$APP_PATH"
}

main
