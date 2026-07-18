import type { ToolRendererToken } from "@buddy/opencode-adapter/tool-presentation"

export function rendererDefaultOpen(
  renderer: ToolRendererToken | undefined,
  shellToolDefaultOpen: boolean,
  editToolDefaultOpen: boolean,
): boolean | undefined {
  if (renderer === "bash") return shellToolDefaultOpen
  if (renderer === "edit" || renderer === "apply-patch") return editToolDefaultOpen
  return undefined
}
