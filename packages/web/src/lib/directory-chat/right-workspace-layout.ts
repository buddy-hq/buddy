const RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX = 240
const RIGHT_WORKSPACE_DEFAULT_MAX_WIDTH_PX = 520
const RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX = 180
const RIGHT_WORKSPACE_DEFAULT_WIDTH_PX = 380
const RIGHT_WORKSPACE_RAIL_WIDTH_PX = 44
// Right-workspace selectors are overlays, not layout columns. Explorer is a compact tree, so it
// should stay narrow; Library carries tabs and richer cards, so it gets a wider default while still
// clamping to the workspace it floats over.
const RIGHT_WORKSPACE_EXPLORER_DRAWER_WIDTH_PX = 360
const RIGHT_WORKSPACE_LIBRARY_DRAWER_WIDTH_PX = 560

export {
  RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX,
  RIGHT_WORKSPACE_DEFAULT_MAX_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX,
  RIGHT_WORKSPACE_EXPLORER_DRAWER_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
  RIGHT_WORKSPACE_LIBRARY_DRAWER_WIDTH_PX,
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
}

export function resolveRightWorkspaceSelectorDrawerWidth(input: {
  selector: "explorer" | "library"
  workspaceWidthPx: number
}) {
  const preferredWidth =
    input.selector === "library"
      ? RIGHT_WORKSPACE_LIBRARY_DRAWER_WIDTH_PX
      : RIGHT_WORKSPACE_EXPLORER_DRAWER_WIDTH_PX
  const contentWidth = Math.max(0, input.workspaceWidthPx - RIGHT_WORKSPACE_RAIL_WIDTH_PX)
  return Math.min(preferredWidth, contentWidth)
}

export function resolveRightWorkspaceWidth(widthPx: number) {
  return Math.min(
    RIGHT_WORKSPACE_DEFAULT_MAX_WIDTH_PX,
    Math.max(RIGHT_WORKSPACE_DEFAULT_MIN_WIDTH_PX, widthPx),
  )
}
