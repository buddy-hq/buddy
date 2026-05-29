import type { MessageInfo, MessagePart, MessageWithParts } from "@/state/chat-types"

import { VIRTUAL_CHAT_TURN_ESTIMATE_PX } from "@/components/virtualization/virtualization-defaults"

import { parseToolState } from "../tools/parse-tool-state"
import { parseToolUiMetadata } from "../tools/parse-tool-ui-metadata"
import { resolveToolRenderer } from "../tools/registry"
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
    if (renderer.hidden || !renderer.inline) return false

    if (tool === "question") {
      return state.status !== "running"
    }

    return true
  }

  if (isChatTextPart(part)) return part.text.trim().length > 0
  return true
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

    // Check if it's a render_mermaid tool call
    if (isChatToolPart(part) && part.tool === "render_mermaid") {
      flushContext(i - 1)

      // Collect all consecutive render_mermaid tool calls
      const mermaidParts: MessagePart[] = [part]
      let j = i + 1
      while (j < visibleParts.length) {
        const nextPart = visibleParts[j]
        if (nextPart && isChatToolPart(nextPart) && nextPart.tool === "render_mermaid") {
          mermaidParts.push(nextPart)
          j++
        } else {
          break
        }
      }

      if (mermaidParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:render_mermaid:${part.id}`,
          tool: "render_mermaid",
          parts: mermaidParts,
        })
        i = j
        continue
      }
    }

    // Check if it's a render_figure tool call
    if (isChatToolPart(part) && part.tool === "render_figure") {
      flushContext(i - 1)

      // Collect all consecutive render_figure tool calls
      const figureParts: MessagePart[] = [part]
      let j = i + 1
      while (j < visibleParts.length) {
        const nextPart = visibleParts[j]
        if (nextPart && isChatToolPart(nextPart) && nextPart.tool === "render_figure") {
          figureParts.push(nextPart)
          j++
        } else {
          break
        }
      }

      if (figureParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:render_figure:${part.id}`,
          tool: "render_figure",
          parts: figureParts,
        })
        i = j
        continue
      }
    }

    // Check if it's a render_freeform_figure tool call
    if (isChatToolPart(part) && part.tool === "render_freeform_figure") {
      flushContext(i - 1)

      // Collect all consecutive render_freeform_figure tool calls
      const freeformParts: MessagePart[] = [part]
      let j = i + 1
      while (j < visibleParts.length) {
        const nextPart = visibleParts[j]
        if (nextPart && isChatToolPart(nextPart) && nextPart.tool === "render_freeform_figure") {
          freeformParts.push(nextPart)
          j++
        } else {
          break
        }
      }

      if (freeformParts.length > 1) {
        items.push({
          type: "grouped-parts",
          key: `grouped-parts:render_freeform_figure:${part.id}`,
          tool: "render_freeform_figure",
          parts: freeformParts,
        })
        i = j
        continue
      }
    }

    const partIsAbstractable =
      (isChatToolPart(part) &&
        !resolveToolRenderer(part.tool, parseToolUiMetadata(parseToolState(part).metadata))
          .inline) ||
      isChatReasoningPart(part)

    if (partIsAbstractable) {
      if (contextStart < 0) contextStart = i
      i++
      continue
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

function messageTextLength(message: MessageWithParts | undefined): number {
  if (!message) return 0

  return message.parts.reduce((total, part) => {
    if (!("text" in part) || typeof part.text !== "string") return total
    return total + part.text.length
  }, 0)
}

export function estimateTurnHeight(turn: ChatTurn): number {
  const userPartCount = turn.user?.parts.length ?? 0
  const assistantPartCount = turn.assistants.reduce(
    (count, message) => count + message.parts.length,
    0,
  )
  const assistantMessageCount = turn.assistants.length
  const userTextLength = messageTextLength(turn.user)
  const assistantTextLength = turn.assistants.reduce(
    (total, message) => total + messageTextLength(message),
    0,
  )
  const combinedTextLength = userTextLength + assistantTextLength

  return Math.max(
    VIRTUAL_CHAT_TURN_ESTIMATE_PX,
    180 +
      userPartCount * 36 +
      assistantPartCount * 40 +
      assistantMessageCount * 48 +
      Math.ceil(combinedTextLength / 220) * 28,
  )
}

export function chatTranscriptEqual(
  prevProps: ChatTranscriptProps,
  nextProps: ChatTranscriptProps,
): boolean {
  return (
    prevProps.directory === nextProps.directory &&
    prevProps.scrollViewportRef === nextProps.scrollViewportRef &&
    prevProps.userScrolled === nextProps.userScrolled &&
    prevProps.onAssistantTextFinalRender === nextProps.onAssistantTextFinalRender &&
    prevProps.onOpenSession === nextProps.onOpenSession &&
    prevProps.onOpenResource === nextProps.onOpenResource &&
    prevProps.onForkMessage === nextProps.onForkMessage &&
    prevProps.onRevertMessage === nextProps.onRevertMessage
  )
}
