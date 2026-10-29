import { parseToolState, readToolSummaryKind } from "@/components/chat/tools/parse-tool-state"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"

const FILE_EDIT_TOOL_KINDS = new Set(["edit-file", "write-file", "change-files"])

export type MarkdownBenchAgentEditActivity = {
  running: boolean
  completedKey: string | undefined
}

function normalizePathForCompare(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "")
}

function filePathMatchesTarget(candidate: string | undefined, targetPath: string) {
  if (!candidate) return false
  const normalizedCandidate = normalizePathForCompare(candidate)
  const normalizedTarget = normalizePathForCompare(targetPath)
  return (
    normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`)
  )
}

export function toolMetadataTargetsPath(part: MessagePart, targetPath: string): boolean {
  if (part.type !== "tool") return false
  const kind = readToolSummaryKind(part)
  if (!kind || !FILE_EDIT_TOOL_KINDS.has(kind)) return false

  const state = parseToolState(part)
  const changedFileMatches = (state.fileChanges ?? []).some(
    (file) => filePathMatchesTarget(file.relativePath, targetPath) || filePathMatchesTarget(file.path, targetPath),
  )
  if (kind === "change-files") return changedFileMatches
  return (
    filePathMatchesTarget(state.summary?.subject, targetPath) ||
    changedFileMatches ||
    filePathMatchesTarget(state.title, targetPath)
  )
}

export function markdownBenchAgentEditActivity(
  messages: readonly MessageWithParts[],
  targetPath: string,
): MarkdownBenchAgentEditActivity {
  let running = false
  let completedKey: string | undefined

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || !toolMetadataTargetsPath(part, targetPath)) continue
      const state = parseToolState(part)
      if (state.status === "pending" || state.status === "running") {
        running = true
        continue
      }
      if (state.status === "completed") {
        completedKey = `${part.id}:${state.end ?? "completed"}`
      }
    }
  }

  return { running, completedKey }
}
