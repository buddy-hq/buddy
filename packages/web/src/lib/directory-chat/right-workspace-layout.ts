/** A squeeze floor for the whole workspace, rail included — not a content width. */
const RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX = 240
const RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX = 180
// The workspace holds documents, PDFs and boards, so its ceiling follows the window rather than a
// fixed pixel cap: a cap tuned for a laptop makes a page unreadably narrow on a large display. The
// chat's own minimum still applies on top of this, so the two floors cannot fight.
const RIGHT_WORKSPACE_MAX_WIDTH_VIEWPORT_FRACTION = 0.7
const RIGHT_WORKSPACE_RAIL_WIDTH_PX = 44
// Right-workspace drawers are compact notebook-scoped lists. They share one predictable width and
// clamp to the available workspace beside the fixed rail.
//
// Sized for the drawers that are mostly rows — files, search, threads — since a drawer cannot be
// resized and a row list reads no better for being wider. Cover shelves reflow to two tiles per row
// at this width, which is a count rather than a shape: they add columns again in a wider surface.
const RIGHT_WORKSPACE_DRAWER_WIDTH_PX = 320
/** `px-3` on both sides of the drawer shell. */
const RIGHT_WORKSPACE_DRAWER_PADDING_X_PX = 24
/** Space a drawer's rows and cards actually get — the basis for virtualiser height estimates. */
const RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX =
  RIGHT_WORKSPACE_DRAWER_WIDTH_PX - RIGHT_WORKSPACE_DRAWER_PADDING_X_PX
// The default workspace holds exactly one drawer beside the rail, so the two move together.
const RIGHT_WORKSPACE_DEFAULT_WIDTH_PX =
  RIGHT_WORKSPACE_DRAWER_WIDTH_PX + RIGHT_WORKSPACE_RAIL_WIDTH_PX

export {
  RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX,
  RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
  RIGHT_WORKSPACE_DRAWER_CONTENT_WIDTH_PX,
  RIGHT_WORKSPACE_DRAWER_WIDTH_PX,
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
}

/**
 * Widest the workspace may be drawn at this window size, before the chat's own floor applies.
 *
 * The fraction describes the *content* beside the rail. The rail is fixed chrome the workspace
 * carries and the content never uses, so it is added on top — folding it into the fraction would
 * quietly hand the content less room than the number says.
 */
export function resolveRightWorkspaceMaxWidth(viewportWidthPx: number) {
  const contentMaxWidthPx = Math.floor(
    Math.max(0, viewportWidthPx) * RIGHT_WORKSPACE_MAX_WIDTH_VIEWPORT_FRACTION,
  )
  return contentMaxWidthPx + RIGHT_WORKSPACE_RAIL_WIDTH_PX
}

export function resolveRightWorkspaceSelectorDrawerWidth(input: {
  selector: "search" | "sources" | "practice" | "creations" | "boards" | "files" | "skills"
  workspaceWidthPx: number
}) {
  const contentWidth = Math.max(0, input.workspaceWidthPx - RIGHT_WORKSPACE_RAIL_WIDTH_PX)
  return Math.min(RIGHT_WORKSPACE_DRAWER_WIDTH_PX, contentWidth)
}
