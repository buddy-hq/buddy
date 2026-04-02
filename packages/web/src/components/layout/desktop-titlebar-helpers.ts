const TITLEBAR_INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [contenteditable='true'], [contenteditable='']"

export type RightSidebarTogglePlacement = "leading" | "trailing"

export function isTitlebarInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return target.closest(TITLEBAR_INTERACTIVE_SELECTOR) !== null
}

export function isTitlebarSystemControlTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return target.closest("[data-tauri-decorum-tb]") !== null
}

export function resolveRightSidebarTogglePlacement(
  isWindows: boolean,
): RightSidebarTogglePlacement {
  return isWindows ? "leading" : "trailing"
}
