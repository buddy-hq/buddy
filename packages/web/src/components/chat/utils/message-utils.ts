import type { MessageInfo, MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"
import type { ToolCollectionToken } from "@buddy/opencode-adapter/tool-presentation"
import type { ToolLayoutRole } from "@buddy/opencode-adapter/tool-presentation"

import { parseToolPresentation } from "../tools/parse-tool-presentation"
import { isChatReasoningPart, isChatTextPart, isChatToolPart } from "./part-guards"
import type { AssistantRenderItem, ChatTranscriptProps, ChatTurn } from "../types"

export function modelLabel(info: MessageInfo): string {
  if ("modelID" in info && info.modelID) {
    return info.modelID
  }
  if ("model" in info && info.model?.modelID) {
    return info.model.modelID
  }
  return ""
}

function messageProviderID(info: MessageInfo): string | undefined {
  if ("providerID" in info && typeof info.providerID === "string") {
    return info.providerID
  }
  if ("model" in info && info.model?.providerID) {
    return info.model.providerID
  }
  return undefined
}

/**
 * Prefer the catalog display name over the raw model id/slug.
 * Provider models are an array (not a map) — lookup must use find by id.
 */
export function resolveModelDisplayName(
  info: MessageInfo,
  providers: ReadonlyArray<ProviderInfo> | undefined,
): string {
  const slug = modelLabel(info)
  const providerID = messageProviderID(info)
  if (!providerID || !slug || !providers || providers.length === 0) {
    return slug
  }

  const provider = providers.find((entry) => entry.id === providerID)
  const model = provider?.models.find((entry) => entry.id === slug)
  const name = model?.name?.trim()
  return name && name.length > 0 ? name : slug
}

export function assistantPartRenderable(
  part: MessagePart,
  showReasoningSummaries: boolean,
): boolean {
  if (isChatTextPart(part)) return part.text.trim().length > 0
  if (isChatReasoningPart(part)) return showReasoningSummaries && part.text.trim().length > 0
  if (part.type === "compaction") return false
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (part.type === "patch") return false
  if (!isChatToolPart(part)) return true

  const presentation = parseToolPresentation(part)
  return Boolean(
    presentation &&
      presentation.archetype !== "silent" &&
      presentation.outcome.type !== "silent",
  )
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (part.type === "compaction") return false
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (isChatReasoningPart(part)) return false
  if (part.type === "patch") return false
  if (isChatToolPart(part)) {
    return toolPartUsesInlinePresentation(part)
  }

  if (isChatTextPart(part)) return part.text.trim().length > 0
  return true
}

function toolPartUsesInlinePresentation(part: MessagePart): boolean {
  if (!isChatToolPart(part)) return false

  const presentation = parseToolPresentation(part)
  if (
    !presentation ||
    presentation.archetype === "silent" ||
    presentation.archetype === "activity" ||
    presentation.outcome.type === "silent"
  ) {
    return false
  }

  return presentation.phase !== "error"
}

function collectConsecutiveToolParts(
  parts: MessagePart[],
  startIndex: number,
  collection: ToolCollectionToken,
): { parts: MessagePart[]; nextIndex: number } {
  const groupedParts: MessagePart[] = []
  let nextIndex = startIndex

  while (nextIndex < parts.length) {
    const part = parts[nextIndex]
    if (!part || !toolPartUsesInlinePresentation(part)) {
      break
    }
    const presentation = parseToolPresentation(part)
    if (presentation?.archetype !== "inline-output" || presentation.collection !== collection)
      break
    groupedParts.push(part)
    nextIndex += 1
  }

  return { parts: groupedParts, nextIndex }
}

function toolPartCollection(part: MessagePart): ToolCollectionToken | undefined {
  if (!isChatToolPart(part) || !toolPartUsesInlinePresentation(part)) return undefined
  const presentation = parseToolPresentation(part)
  return presentation?.archetype === "inline-output" ? presentation.collection : undefined
}

export function groupAssistantParts(
  parts: MessagePart[],
  showReasoningSummaries: boolean,
): AssistantRenderItem[] {
  const visibleParts = parts.filter((part) => assistantPartRenderable(part, showReasoningSummaries))

  const items: AssistantRenderItem[] = []
  let contextStart = -1
  let contextBoundaryOrdinal = 0
  let visibleBoundaryOrdinal = 0

  const flushContext = (endIndex: number) => {
    if (contextStart < 0 || endIndex < contextStart) return
    const contextParts = visibleParts.slice(contextStart, endIndex + 1)
    if (contextParts.length === 0) {
      contextStart = -1
      return
    }
    items.push({
      type: "abstracted",
      key: `activity:${contextBoundaryOrdinal}`,
      layoutRole: "activity",
      parts: contextParts,
    })
    contextStart = -1
  }

  let i = 0
  while (i < visibleParts.length) {
    const part = visibleParts[i]
    if (!part) {
      i++
      continue
    }

    const partIsAbstractable =
      isChatReasoningPart(part) || (isChatToolPart(part) && !toolPartUsesInlinePresentation(part))

    if (partIsAbstractable) {
      if (contextStart < 0) {
        contextStart = i
        contextBoundaryOrdinal = visibleBoundaryOrdinal
      }
      i++
      continue
    }

    const collection = toolPartCollection(part)

    if (collection) {
      flushContext(i - 1)

      const { parts: groupedParts, nextIndex } = collectConsecutiveToolParts(
        visibleParts,
        i,
        collection,
      )

      if (groupedParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:${collection}:${part.id}`,
          collection,
          layoutRole: toolPartLayoutRole(part),
          parts: groupedParts,
        })
        visibleBoundaryOrdinal += 1
        i = nextIndex
        continue
      }
    }

    flushContext(i - 1)
    items.push({
      type: "part",
      key: `part:${part.id}`,
      layoutRole: partLayoutRole(part),
      part,
    })
    visibleBoundaryOrdinal += 1
    i++
  }

  flushContext(visibleParts.length - 1)

  return items
}

function toolPartLayoutRole(
  part: MessagePart,
): "compact-output" | "card-output" | "media-output" {
  const presentation = parseToolPresentation(part)
  if (presentation?.archetype === "inline-output") {
    return presentation.layoutRole
  }
  return "card-output"
}

function partLayoutRole(part: MessagePart): ToolLayoutRole {
  if (isChatReasoningPart(part)) return "activity"
  if (isChatTextPart(part)) return "prose"
  if (!isChatToolPart(part)) return "prose"
  const presentation = parseToolPresentation(part)
  return presentation?.archetype === "silent" ? "activity" : (presentation?.layoutRole ?? "activity")
}

export function buildTurns(messages: MessageWithParts[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let current: ChatTurn | undefined

  for (const message of messages) {
    if (message.info.role === "user") {
      current = {
        key: `turn:${message.info.id}`,
        user: message,
        assistants: [],
      }
      turns.push(current)
      continue
    }

    if (!current || !current.user) {
      current = {
        key: `turn:assistant:${message.info.id}`,
        assistants: [message],
      }
      turns.push(current)
      continue
    }

    current.assistants.push(message)
  }

  return turns
}

export function chatTranscriptEqual(
  prevProps: ChatTranscriptProps,
  nextProps: ChatTranscriptProps,
): boolean {
  return (
    prevProps.directory === nextProps.directory &&
    prevProps.canEditImages === nextProps.canEditImages &&
    prevProps.scrollViewportRef === nextProps.scrollViewportRef &&
    prevProps.onOpenSession === nextProps.onOpenSession &&
    prevProps.onOpenResource === nextProps.onOpenResource &&
    prevProps.onForkMessage === nextProps.onForkMessage &&
    prevProps.onRevertMessage === nextProps.onRevertMessage
  )
}
