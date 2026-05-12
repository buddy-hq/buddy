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
    if (renderer.hidden || renderer.summary) return false

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

  visibleParts.forEach((part, index) => {
    const partIsAbstractable =
      (isChatToolPart(part) &&
        Boolean(
          resolveToolRenderer(part.tool, parseToolUiMetadata(parseToolState(part).metadata))
            .summary,
        )) ||
      isChatReasoningPart(part)
    if (partIsAbstractable) {
      if (contextStart < 0) contextStart = index
      return
    }

    flushContext(index - 1)
    items.push({
      type: "part",
      key: `part:${part.id}`,
      part,
    })
  })

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

export function estimateTurnHeight(turn: ChatTurn): number {
  const userPartCount = turn.user?.parts.length ?? 0
  const assistantPartCount = turn.assistants.reduce(
    (count, message) => count + message.parts.length,
    0,
  )
  const assistantMessageCount = turn.assistants.length

  return Math.max(
    VIRTUAL_CHAT_TURN_ESTIMATE_PX,
    180 + userPartCount * 36 + assistantPartCount * 40 + assistantMessageCount * 48,
  )
}

export function chatTranscriptEqual(
  prevProps: ChatTranscriptProps,
  nextProps: ChatTranscriptProps,
): boolean {
  return (
    prevProps.directory === nextProps.directory &&
    prevProps.scrollViewportRef === nextProps.scrollViewportRef &&
    prevProps.onAssistantTextFinalRender === nextProps.onAssistantTextFinalRender &&
    prevProps.onOpenSession === nextProps.onOpenSession &&
    prevProps.onForkMessage === nextProps.onForkMessage &&
    prevProps.onRevertMessage === nextProps.onRevertMessage
  )
}
