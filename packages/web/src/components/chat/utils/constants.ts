import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"

export {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
}

const ABSTRACTABLE_TOOLS = new Set([
  "read",
  "list",
  "glob",
  "grep",
  "bash",
  "websearch",
  "codesearch",
  "webfetch",
  "learner_snapshot_read",
  "pedagogy_resource_ingest_full_text",
  "skill",
])

const CHAT_SCROLL_ANCHOR_THRESHOLD_PX = 96

export { ABSTRACTABLE_TOOLS, CHAT_SCROLL_ANCHOR_THRESHOLD_PX }

export function toolDefaultOpen(
  tool: string,
  shellToolDefaultOpen: boolean,
  editToolDefaultOpen: boolean,
): boolean | undefined {
  if (tool === "bash") return shellToolDefaultOpen
  if (tool === "edit" || tool === "write" || tool === "apply_patch") return editToolDefaultOpen
  return undefined
}
