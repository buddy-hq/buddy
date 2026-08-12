/**
 * Sizing for the left sidebar, shared by the chat shell and the settings shell — both render the
 * same directory/thread list, so one rule governs both.
 */

/** Narrow enough to leave the conversation the width it needs; wide enough for a nested thread. */
const LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 288
const LEFT_SIDEBAR_MIN_WIDTH_PX = 220
/** The conversation beside the sidebar never gives up more than this. */
const LEFT_SIDEBAR_CONTENT_MIN_WIDTH_PX = 640
/** The ceiling never drops below this, however small the window gets. */
const LEFT_SIDEBAR_MAX_WIDTH_FLOOR_PX = 360

export {
  LEFT_SIDEBAR_CONTENT_MIN_WIDTH_PX,
  LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  LEFT_SIDEBAR_MAX_WIDTH_FLOOR_PX,
  LEFT_SIDEBAR_MIN_WIDTH_PX,
}

/**
 * The ceiling follows the window rather than a fixed cap: a cap tuned for a laptop leaves the drag
 * handle with nowhere to go on a large display.
 */
export function resolveLeftSidebarMaxWidth(viewportWidthPx: number) {
  return Math.max(
    LEFT_SIDEBAR_MAX_WIDTH_FLOOR_PX,
    Math.floor(viewportWidthPx) - LEFT_SIDEBAR_CONTENT_MIN_WIDTH_PX,
  )
}

/**
 * Width to draw at. A stored width outlives the window it was chosen in, so it is clamped on read
 * rather than trusted.
 */
export function resolveLeftSidebarWidth(input: { widthPx: number; viewportWidthPx: number }) {
  const maxWidthPx = resolveLeftSidebarMaxWidth(input.viewportWidthPx)
  return Math.min(maxWidthPx, Math.max(LEFT_SIDEBAR_MIN_WIDTH_PX, input.widthPx))
}
