const RIGHT_SIDEBAR_DEFAULT_MIN_WIDTH = 240
const RIGHT_SIDEBAR_DEFAULT_MAX_WIDTH = 520
const RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX = 180
const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 480
const RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH = 720
const RIGHT_SIDEBAR_EDITOR_MAX_WIDTH = 1080
const RIGHT_SIDEBAR_FILES_MIN_WIDTH = 560
const RIGHT_SIDEBAR_FILES_DEFAULT_WIDTH = 820
const RIGHT_SIDEBAR_FILES_MAX_WIDTH = 1200
const RIGHT_WORKSPACE_DEFAULT_WIDTH_PX = 380
const RIGHT_WORKSPACE_RAIL_WIDTH_PX = 44
// Right-workspace selectors are overlays, not layout columns. Explorer is a compact tree, so it
// should stay narrow; Library carries tabs and richer cards, so it gets a wider default while still
// clamping to the workspace it floats over.
const RIGHT_WORKSPACE_EXPLORER_DRAWER_WIDTH_PX = 360
const RIGHT_WORKSPACE_LIBRARY_DRAWER_WIDTH_PX = 560

export {
  RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX,
  RIGHT_SIDEBAR_DEFAULT_MAX_WIDTH,
  RIGHT_SIDEBAR_DEFAULT_MIN_WIDTH,
  RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_EDITOR_MAX_WIDTH,
  RIGHT_SIDEBAR_EDITOR_MIN_WIDTH,
  RIGHT_SIDEBAR_FILES_DEFAULT_WIDTH,
  RIGHT_SIDEBAR_FILES_MAX_WIDTH,
  RIGHT_SIDEBAR_FILES_MIN_WIDTH,
  RIGHT_WORKSPACE_EXPLORER_DRAWER_WIDTH_PX,
  RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
  RIGHT_WORKSPACE_LIBRARY_DRAWER_WIDTH_PX,
  RIGHT_WORKSPACE_RAIL_WIDTH_PX,
}

export function getRightSidebarDefaultWidth(tab: "editor" | "files") {
  return tab === "files" ? RIGHT_SIDEBAR_FILES_DEFAULT_WIDTH : RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH
}

export function getRightSidebarMaxWidth(tab: string) {
  if (tab === "files") return RIGHT_SIDEBAR_FILES_MAX_WIDTH
  if (tab === "editor") return RIGHT_SIDEBAR_EDITOR_MAX_WIDTH
  return RIGHT_SIDEBAR_DEFAULT_MAX_WIDTH
}

export function getRightSidebarMinWidth(tab: string) {
  if (tab === "files") return RIGHT_SIDEBAR_FILES_MIN_WIDTH
  if (tab === "editor") return RIGHT_SIDEBAR_EDITOR_MIN_WIDTH
  return RIGHT_SIDEBAR_DEFAULT_MIN_WIDTH
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
    RIGHT_SIDEBAR_DEFAULT_MAX_WIDTH,
    Math.max(RIGHT_SIDEBAR_DEFAULT_MIN_WIDTH, widthPx),
  )
}
