import type { AssistantMessageInfo, MessagePart, MessageWithParts } from "./chat-types"
import {
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
  TOOL_STATE_RUNNING_STATUS,
} from "./chat-stream-event-buffer"

const TOOL_ABORTED_ERROR = "Tool execution aborted"
const TOOL_INTERRUPTED_ERROR = "Tool execution interrupted"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isTerminalAssistantMessageInfo(
  info: MessageWithParts["info"],
): info is AssistantMessageInfo {
  if (info.role !== "assistant") return false
  if (info.error) return true
  if (typeof info.time.completed === "number") return true
  return typeof info.finish === "string" && info.finish.length > 0
}

function toolPartInterruptionError(info: AssistantMessageInfo) {
  return info.finish === "aborted" ? TOOL_ABORTED_ERROR : TOOL_INTERRUPTED_ERROR
}

function reconcileInterruptedToolPart(
  part: MessagePart,
  info: AssistantMessageInfo,
  terminalAt: number,
): MessagePart {
  if (part.type !== TOOL_PART_TYPE) return part
  if (!isRecord(part.state)) return part
  if (
    part.state.status !== TOOL_STATE_PENDING_STATUS &&
    part.state.status !== TOOL_STATE_RUNNING_STATUS
  ) {
    return part
  }

  const time = isRecord(part.state.time) ? part.state.time : undefined
  const metadata = isRecord(part.state.metadata) ? part.state.metadata : undefined
  const start = typeof time?.start === "number" ? time.start : terminalAt

  return {
    ...part,
    state: {
      ...part.state,
      status: "error",
      error: toolPartInterruptionError(info),
      metadata: {
        ...metadata,
        interrupted: true,
      },
      time: {
        ...time,
        start,
        end: terminalAt,
      },
    },
  }
}

export function reconcileTerminalAssistantToolParts(messages: MessageWithParts[]) {
  let changed = false

  const nextMessages = messages.map((message) => {
    if (!isTerminalAssistantMessageInfo(message.info)) {
      return message
    }

    const assistantInfo = message.info
    const terminalAt =
      typeof assistantInfo.time.completed === "number" ? assistantInfo.time.completed : Date.now()
    let partsChanged = false
    const nextParts = message.parts.map((part) => {
      const nextPart = reconcileInterruptedToolPart(part, assistantInfo, terminalAt)
      if (nextPart !== part) {
        partsChanged = true
      }
      return nextPart
    })

    if (!partsChanged) {
      return message
    }

    changed = true
    return {
      ...message,
      parts: nextParts,
    }
  })

  return changed ? nextMessages : messages
}

export { isTerminalAssistantMessageInfo }
