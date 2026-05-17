const TITLEBAR_INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, option, [role='button'], [role='menuitem'], [data-titlebar-no-drag], [contenteditable='true'], [contenteditable='']"

export function isTitlebarInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return target.closest(TITLEBAR_INTERACTIVE_SELECTOR) !== null
}
