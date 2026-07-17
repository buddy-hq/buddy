import type { MessageInfo, MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"

import { parseToolState } from "../tools/parse-tool-state"
import { parseToolUiMetadata } from "../tools/parse-tool-ui-metadata"
import { resolveToolRenderer } from "../tools/registry"
import {
  isIngestFullTextScopedReadingFallback,
  isLegacyIngestFullTextScopedReadingError,
  readIngestFullTextMetadata,
} from "../tools/full-text-metadata"
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

  const tool = part.tool
  const state = parseToolState(part)
  const renderer = resolveToolRenderer(tool, parseToolUiMetadata(state.metadata))
  if (renderer.hidden) return false

  if (isSilentIngestFullTextFallback(tool, state)) return false

  if (tool === "question") {
    return state.status !== "running"
  }

  return true
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (part.type === "compaction") return false
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (isChatReasoningPart(part)) return false
  if (part.type === "patch") return false
  if (isChatToolPart(part)) {
    const tool = part.tool
    const state = parseToolState(part)
    const renderer = resolveToolRenderer(tool, parseToolUiMetadata(state.metadata))
    if (renderer.hidden || !toolRendererUsesInlinePresentation(renderer, state)) return false
    if (isSilentIngestFullTextFallback(tool, state)) return false

    if (tool === "question") {
      return state.status !== "running"
    }

    return true
  }

  if (isChatTextPart(part)) return part.text.trim().length > 0
  return true
}

function isSilentIngestFullTextFallback(tool: string, state: ReturnType<typeof parseToolState>) {
  if (tool !== "ingest_full_text") return false
  if (
    state.status === "completed" &&
    isIngestFullTextScopedReadingFallback(readIngestFullTextMetadata(state))
  ) {
    return true
  }
  return state.status === "error" && isLegacyIngestFullTextScopedReadingError(state.error)
}

function isToolPartNamed(part: MessagePart, tool: string): boolean {
  return isChatToolPart(part) && part.tool === tool
}

function toolRendererUsesInlinePresentation(
  renderer: ReturnType<typeof resolveToolRenderer>,
  state: ReturnType<typeof parseToolState>,
): boolean {
  if (!renderer.inline) return false
  return state.status !== "error" || renderer.renderInlineErrorCard === true
}

function toolPartUsesInlinePresentation(part: MessagePart): boolean {
  if (!isChatToolPart(part)) return false

  const state = parseToolState(part)
  const renderer = resolveToolRenderer(part.tool, parseToolUiMetadata(state.metadata))
  return toolRendererUsesInlinePresentation(renderer, state)
}

function collectConsecutiveToolParts(
  parts: MessagePart[],
  startIndex: number,
  tool: string,
): { parts: MessagePart[]; nextIndex: number } {
  const groupedParts: MessagePart[] = []
  let nextIndex = startIndex

  while (nextIndex < parts.length) {
    const part = parts[nextIndex]
    if (!part || !isToolPartNamed(part, tool) || !toolPartUsesInlinePresentation(part)) {
      break
    }
    groupedParts.push(part)
    nextIndex += 1
  }

  return { parts: groupedParts, nextIndex }
}

export function groupAssistantParts(
  parts: MessagePart[],
  showReasoningSummaries: boolean,
): AssistantRenderItem[] {
  const visibleParts = parts.filter((part) => assistantPartRenderable(part, showReasoningSummaries))

  const items: AssistantRenderItem[] = []
  let contextStart = -1

  const flushContext = (endIndex: number) => {
    if (contextStart < 0 || endIndex < contextStart) return
    const contextParts = visibleParts.slice(contextStart, endIndex + 1)
    if (contextParts.length === 0) {
      contextStart = -1
      return
    }
    items.push({
      type: "abstracted",
      key: `abstracted:${contextParts[0]?.id ?? endIndex}`,
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
      if (contextStart < 0) contextStart = i
      i++
      continue
    }

    if (isToolPartNamed(part, "render_mermaid")) {
      flushContext(i - 1)

      const { parts: mermaidParts, nextIndex } = collectConsecutiveToolParts(
        visibleParts,
        i,
        "render_mermaid",
      )

      if (mermaidParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:render_mermaid:${part.id}`,
          tool: "render_mermaid",
          parts: mermaidParts,
        })
        i = nextIndex
        continue
      }
    }

    if (isToolPartNamed(part, "render_figure")) {
      flushContext(i - 1)

      const { parts: figureParts, nextIndex } = collectConsecutiveToolParts(
        visibleParts,
        i,
        "render_figure",
      )

      if (figureParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:render_figure:${part.id}`,
          tool: "render_figure",
          parts: figureParts,
        })
        i = nextIndex
        continue
      }
    }

    if (isToolPartNamed(part, "render_freeform_figure")) {
      flushContext(i - 1)

      const { parts: freeformParts, nextIndex } = collectConsecutiveToolParts(
        visibleParts,
        i,
        "render_freeform_figure",
      )

      if (freeformParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:render_freeform_figure:${part.id}`,
          tool: "render_freeform_figure",
          parts: freeformParts,
        })
        i = nextIndex
        continue
      }
    }

    if (isToolPartNamed(part, "ingest_full_text")) {
      flushContext(i - 1)

      const { parts: fullTextParts, nextIndex } = collectConsecutiveToolParts(
        visibleParts,
        i,
        "ingest_full_text",
      )

      if (fullTextParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:ingest_full_text:${part.id}`,
          tool: "ingest_full_text",
          parts: fullTextParts,
        })
        i = nextIndex
        continue
      }
    }

    flushContext(i - 1)
    items.push({
      type: "part",
      key: `part:${part.id}`,
      part,
    })
    i++
  }

  flushContext(visibleParts.length - 1)

  return items
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
    prevProps.scrollViewportRef === nextProps.scrollViewportRef &&
    prevProps.onOpenSession === nextProps.onOpenSession &&
    prevProps.onOpenResource === nextProps.onOpenResource &&
    prevProps.onForkMessage === nextProps.onForkMessage &&
    prevProps.onRevertMessage === nextProps.onRevertMessage
  )
}
