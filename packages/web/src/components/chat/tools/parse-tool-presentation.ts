import {
  decodeToolPresentationSnapshot,
  type ToolPresentationSnapshot,
} from "@buddy/opencode-adapter/tool-presentation"

import type { MessagePart } from "@/state/chat-types"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseToolPresentationMetadata(
  metadata: unknown,
): ToolPresentationSnapshot | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.buddy)) return undefined
  return decodeToolPresentationSnapshot(metadata.buddy.presentation)
}

export function parseToolPresentation(part: MessagePart): ToolPresentationSnapshot | undefined {
  return part.type === "tool" ? parseToolPresentationMetadata(part.metadata) : undefined
}
