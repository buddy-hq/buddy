const RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX = 240
const RIGHT_WORKSPACE_DEFAULT_MAX_WIDTH_PX = 520
const RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX = 180
const RIGHT_WORKSPACE_DEFAULT_WIDTH_PX = 448
const RIGHT_WORKSPACE_RAIL_WIDTH_PX = 44
// Right-workspace drawers are compact notebook-scoped lists. They share one predictable width and
// clamp to the available workspace beside the fixed rail.
const RIGHT_WORKSPACE_DRAWER_WIDTH_PX = 404

export {
  RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX,
  RIGHT_WORKSPACE_DEFAULT_MAX_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
  RIGHT_WORKSPACE_DRAWER_WIDTH_PX,
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
}

export function resolveRightWorkspaceSelectorDrawerWidth(input: {
  selector: "search" | "sources" | "practice" | "creations" | "boards" | "files" | "skills"
  workspaceWidthPx: number
}) {
  const contentWidth = Math.max(0, input.workspaceWidthPx - RIGHT_WORKSPACE_RAIL_WIDTH_PX)
  return Math.min(RIGHT_WORKSPACE_DRAWER_WIDTH_PX, contentWidth)
}

export function resolveRightWorkspaceWidth(widthPx: number) {
  return Math.min(
    RIGHT_WORKSPACE_DEFAULT_MAX_WIDTH_PX,
    Math.max(RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX, widthPx),
  )
}
