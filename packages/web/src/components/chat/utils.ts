import type { MessageInfo, MessagePart, MessageWithParts } from "@/state/chat-types"
import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"

import {
  titleCase,
  formatDuration,
  reasoningHeading,
  formatMessageError,
  isMessageAbortError,
} from "./shared/utils"
import { parseToolState } from "./tools/parse-tool-state"
import { HIDDEN_TOOLS } from "./tools/registry"
import type { AssistantRenderItem, ChatTranscriptProps, ChatTurn, TurnRendererProps } from "./types"

export {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"

export {
  titleCase,
  formatDuration,
  reasoningHeading,
  formatMessageError,
  isMessageAbortError,
} from "./shared/utils"

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
  if (part.type === "text") return String(part.text ?? "").trim().length > 0
  if (part.type === "reasoning")
    return showReasoningSummaries && String(part.text ?? "").trim().length > 0
  if (part.type === "compaction") return true
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (part.type !== "tool") return true

  const tool = String(part.tool ?? "")
  if (HIDDEN_TOOLS.has(tool)) return false

  if (tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }

  return true
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (part.type === "reasoning") return false
  if (part.type === "tool") {
    const tool = String(part.tool ?? "")
    if (HIDDEN_TOOLS.has(tool)) return false
    if (ABSTRACTABLE_TOOLS.has(tool)) return false

    if (tool === "question") {
      const state = parseToolState(part)
      return !(state.status === "pending" || state.status === "running")
    }

    return true
  }

  if (part.type === "text") return String(part.text ?? "").trim().length > 0
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
      (part.type === "tool" && ABSTRACTABLE_TOOLS.has(String(part.tool ?? ""))) ||
      part.type === "reasoning"
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

export function toolDefaultOpen(
  tool: string,
  shellToolDefaultOpen: boolean,
  editToolDefaultOpen: boolean,
): boolean | undefined {
  if (tool === "bash") return shellToolDefaultOpen
  if (tool === "edit" || tool === "write" || tool === "apply_patch") return editToolDefaultOpen
  return undefined
}

export function chatTranscriptEqual(
  prevProps: ChatTranscriptProps,
  nextProps: ChatTranscriptProps,
): boolean {
  return (
    prevProps.messages === nextProps.messages &&
    prevProps.directory === nextProps.directory &&
    prevProps.providers === nextProps.providers &&
    prevProps.isBusy === nextProps.isBusy &&
    prevProps.scrollViewportRef === nextProps.scrollViewportRef &&
    prevProps.onAssistantTextFinalRender === nextProps.onAssistantTextFinalRender &&
    prevProps.onOpenSession === nextProps.onOpenSession &&
    prevProps.onForkMessage === nextProps.onForkMessage &&
    prevProps.onRevertMessage === nextProps.onRevertMessage &&
    prevProps.showReasoningSummaries === nextProps.showReasoningSummaries &&
    prevProps.shellToolDefaultOpen === nextProps.shellToolDefaultOpen &&
    prevProps.editToolDefaultOpen === nextProps.editToolDefaultOpen
  )
}

export function turnRendererEqual(
  prevProps: TurnRendererProps,
  nextProps: TurnRendererProps,
): boolean {
  if (prevProps.turnIndex !== nextProps.turnIndex) return false
  if (prevProps.totalTurns !== nextProps.totalTurns) return false
  if (prevProps.isBusy !== nextProps.isBusy) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onAssistantTextFinalRender !== nextProps.onAssistantTextFinalRender) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.onForkMessage !== nextProps.onForkMessage) return false
  if (prevProps.onRevertMessage !== nextProps.onRevertMessage) return false
  if (prevProps.providers !== nextProps.providers) return false
  if (prevProps.showReasoningSummaries !== nextProps.showReasoningSummaries) return false
  if (prevProps.shellToolDefaultOpen !== nextProps.shellToolDefaultOpen) return false
  if (prevProps.editToolDefaultOpen !== nextProps.editToolDefaultOpen) return false

  const prevTurn = prevProps.turn
  const nextTurn = nextProps.turn

  if (prevTurn.key !== nextTurn.key) return false
  if (prevTurn.user !== nextTurn.user) return false
  if (prevTurn.assistants.length !== nextTurn.assistants.length) return false

  for (let index = 0; index < prevTurn.assistants.length; index += 1) {
    if (prevTurn.assistants[index] !== nextTurn.assistants[index]) return false
  }

  return true
}
