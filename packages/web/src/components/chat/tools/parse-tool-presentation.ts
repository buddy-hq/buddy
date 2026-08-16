import {
  decodeToolPresentationSnapshot,
  type ToolPresentationSnapshot,
} from "@buddy/opencode-adapter/tool-presentation"

import type { MessagePart } from "@/state/chat-types"

import { parseTJsonObject } from "./types"

export function parseToolPresentationMetadata<TValue>(
  metadata: TValue,
): ToolPresentationSnapshot | undefined {
  const record = parseTJsonObject(metadata)
  if (!record) return undefined
  const buddy = parseTJsonObject(record.buddy)
  if (!buddy) return undefined
  return decodeToolPresentationSnapshot(buddy.presentation)
}

export function parseToolPresentation(part: MessagePart): ToolPresentationSnapshot | undefined {
  return part.type === "tool" ? parseToolPresentationMetadata(part.metadata) : undefined
}
