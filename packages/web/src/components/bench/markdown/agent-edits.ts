import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import { isRecord, readNonEmptyString, readString } from "@/components/chat/tools/types"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"

const FILE_EDIT_TOOL_NAMES = new Set(["edit", "write", "apply_patch"])

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
  const toolName = readString(part.tool)
  if (part.type !== "tool" || !toolName) return false
  if (!FILE_EDIT_TOOL_NAMES.has(toolName)) return false

  const state = parseToolState(part)
  if (toolName === "apply_patch") {
    const files = state.metadata.files
    if (!Array.isArray(files)) return false
    return files.some((file) => {
      if (!isRecord(file)) return false
      return (
        filePathMatchesTarget(readNonEmptyString(file.relativePath), targetPath) ||
        filePathMatchesTarget(readNonEmptyString(file.filePath), targetPath)
      )
    })
  }

  const filediff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  return (
    filePathMatchesTarget(readString(state.input.filePath), targetPath) ||
    filePathMatchesTarget(readString(filediff?.file), targetPath) ||
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
