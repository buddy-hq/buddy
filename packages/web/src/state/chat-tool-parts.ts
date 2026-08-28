import type { AssistantMessageInfo, MessagePart, MessageWithParts, TRecord } from "./chat-types"
import { isRecord, parseFiniteNumber } from "./chat-types"
import {
  decodeToolPresentationSnapshot,
  interruptToolPresentationSnapshot,
} from "@buddy/opencode-adapter/tool-presentation"
import {
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
  TOOL_STATE_RUNNING_STATUS,
} from "./chat-stream-event-buffer"

const ASSISTANT_ROLE = "assistant"
const TEXT_PART_TYPE = "text"
const REASONING_PART_TYPE = "reasoning"
const TOOL_ABORTED_ERROR = "Tool execution aborted"
const TOOL_INTERRUPTED_ERROR = "Tool execution interrupted"

function readPartTime(part: MessagePart): TRecord | undefined {
  return isRecord(part.time) ? part.time : undefined
}

function reconcileInterruptedPartMetadata(part: MessagePart): TRecord | undefined {
  if (!isRecord(part.metadata)) return undefined

  const buddy = isRecord(part.metadata.buddy) ? part.metadata.buddy : undefined
  const presentation = decodeToolPresentationSnapshot(buddy?.presentation)
  if (!buddy || !presentation) return undefined

  return {
    ...part.metadata,
    buddy: {
      ...buddy,
      presentation: interruptToolPresentationSnapshot(presentation),
    },
  }
}

export function isTerminalAssistantMessageInfo(
  info: MessageWithParts["info"],
): info is AssistantMessageInfo {
  if (info.role !== ASSISTANT_ROLE) return false
  if (info.error) return true
  if (parseFiniteNumber(info.time.completed) !== undefined) return true
  return info.finish != null && info.finish.length > 0
}

function toolPartInterruptionError(info: AssistantMessageInfo) {
  return info.finish === "aborted" ? TOOL_ABORTED_ERROR : TOOL_INTERRUPTED_ERROR
}

function reconcileTerminalTimedPart(part: MessagePart, terminalAt: number): MessagePart {
  if (part.type !== TEXT_PART_TYPE && part.type !== REASONING_PART_TYPE) return part

  const time = readPartTime(part)
  if (parseFiniteNumber(time?.end) !== undefined) return part

  const start = parseFiniteNumber(time?.start) ?? terminalAt
  const end = Math.max(start, terminalAt)

  return {
    ...part,
    time: {
      ...time,
      start,
      end,
    },
  }
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
  const start = parseFiniteNumber(time?.start) ?? terminalAt
  const partMetadata = reconcileInterruptedPartMetadata(part)

  return Object.assign({}, part, partMetadata ? { metadata: partMetadata } : undefined, {
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
  })
}

function reconcileTerminalAssistantPart(
  part: MessagePart,
  info: AssistantMessageInfo,
  terminalAt: number,
): MessagePart {
  const timedPart = reconcileTerminalTimedPart(part, terminalAt)
  return reconcileInterruptedToolPart(timedPart, info, terminalAt)
}

export function reconcileTerminalAssistantParts(messages: MessageWithParts[]) {
  let changed = false

  const nextMessages = messages.map((message) => {
    if (!isTerminalAssistantMessageInfo(message.info)) {
      return message
    }

    const assistantInfo = message.info
    const terminalAt = parseFiniteNumber(assistantInfo.time.completed) ?? Date.now()
    let partsChanged = false
    const nextParts = message.parts.map((part) => {
      const nextPart = reconcileTerminalAssistantPart(part, assistantInfo, terminalAt)
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
