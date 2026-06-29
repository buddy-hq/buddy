import { formatMessageError, isMessageAbortError } from "./utils/error"
import { reasoningHeading } from "./utils/markdown"
import { buildTurns, groupAssistantParts } from "./utils/message-utils"
import { isChatReasoningPart, isChatTextPart } from "./utils/part-guards"
import type { AssistantRenderItem, ChatTurn } from "./types"
import type { MessagePart, MessageWithParts, SessionStatusInfo } from "@/state/chat-types"
import { isSessionStatusRetry } from "@/state/session-status"

export type TimelineAssistantItem =
  | {
      type: "abstracted"
      key: string
      partIDs: string[]
      previousPartID: string | undefined
    }
  | {
      type: "part"
      key: string
      partID: string
      previousPartID: string | undefined
    }
  | {
      type: "grouped-parts"
      key: string
      tool: string
      partIDs: string[]
      previousPartID: string | undefined
    }

export type TimelineRow =
  | {
      type: "turn-gap"
      key: string
      userMessageID: string
    }
  | {
      type: "user"
      key: string
      userMessageID: string
      partIDs: string[]
      anchor: boolean
    }
  | {
      type: "turn-divider"
      key: string
      userMessageID: string
      label: "compaction" | "interrupted"
    }
  | {
      type: "assistant"
      key: string
      userMessageID: string
      item: TimelineAssistantItem
      assistantMessageIDs: string[]
      assistantCopyPartID: string | undefined
      assistantAborted: boolean
      turnDurationMs: number | undefined
      active: boolean
      itemActive: boolean
      previousAssistantPart: boolean
      lastAssistantTextID: string | undefined
    }
  | {
      type: "thinking"
      key: string
      userMessageID: string
      reasoningPartID: string | undefined
      reasoningHeading?: string
      previousAssistantPart: boolean
    }
  | {
      type: "retry"
      key: string
      userMessageID: string
      status: Extract<SessionStatusInfo, { type: "retry" }>
    }
  | {
      type: "error"
      key: string
      userMessageID: string
      text: string
      errorName: string | undefined
    }

type ProjectTimelineRowsInput = {
  messages: MessageWithParts[]
  isBusy: boolean
  sessionID: string | undefined
  directory: string | undefined
  activeSessionStatus: SessionStatusInfo
  showReasoningSummaries: boolean
}

const ASSISTANT_ABORT_FINISH_REASONS = new Set(["aborted", "cancelled", "interrupted"])

function isAssistantAbortFinish(finish: string | null | undefined): boolean {
  return typeof finish === "string" && ASSISTANT_ABORT_FINISH_REASONS.has(finish)
}

function assistantPartIDs(item: AssistantRenderItem) {
  switch (item.type) {
    case "abstracted":
    case "grouped-parts":
      return item.parts.map((part) => part.id)
    case "part":
      return [item.part.id]
  }
}

function assistantItemHasReasoning(item: AssistantRenderItem) {
  switch (item.type) {
    case "abstracted":
    case "grouped-parts":
      return item.parts.some(isChatReasoningPart)
    case "part":
      return isChatReasoningPart(item.part)
  }
}

function convertAssistantItem(
  item: AssistantRenderItem,
  previousPartID: string | undefined,
): TimelineAssistantItem {
  switch (item.type) {
    case "abstracted":
      return {
        type: item.type,
        key: item.key,
        partIDs: assistantPartIDs(item),
        previousPartID,
      }
    case "grouped-parts":
      return {
        type: item.type,
        key: item.key,
        tool: item.tool,
        partIDs: assistantPartIDs(item),
        previousPartID,
      }
    case "part":
      return {
        type: item.type,
        key: item.key,
        partID: item.part.id,
        previousPartID,
      }
  }
}

function lastPartID(item: AssistantRenderItem) {
  switch (item.type) {
    case "abstracted":
    case "grouped-parts":
      return item.parts.at(-1)?.id
    case "part":
      return item.part.id
  }
}

function turnUserMessageID(turn: ChatTurn, fallback: string) {
  return turn.user?.info.id ?? turn.assistants[0]?.info.id ?? fallback
}

function turnHasCompaction(turn: ChatTurn) {
  return (turn.user?.parts ?? []).some((part) => part.type === "compaction")
}

function turnHasOptimisticUserInput(turn: ChatTurn) {
  return (turn.user?.parts ?? []).some((part) => part.optimistic === true)
}

function assistantAborted(messages: MessageWithParts[]) {
  return messages.some(
    (message) =>
      message.info.role === "assistant" &&
      (isAssistantAbortFinish(message.info.finish) || isMessageAbortError(message.info.error)),
  )
}

function assistantError(messages: MessageWithParts[]) {
  return messages
    .map((message) =>
      message.info.role === "assistant" ? (message.info.error ?? undefined) : undefined,
    )
    .findLast((error) => !!error && !isMessageAbortError(error))
}

function lastTextPartID(parts: MessagePart[]) {
  return parts.findLast((part) => isChatTextPart(part) && part.text.trim().length > 0)?.id
}

function turnDurationMs(turn: ChatTurn) {
  const completed = turn.assistants.reduce<number | undefined>((max, message) => {
    const value = message.info.time?.completed
    if (typeof value !== "number") return max
    if (typeof max !== "number") return value
    return Math.max(max, value)
  }, undefined)
  const started = turn.user?.info.time?.created ?? turn.assistants[0]?.info.time?.created
  if (typeof started !== "number" || typeof completed !== "number") return undefined
  if (completed < started) return undefined
  return completed - started
}

function currentReasoningPart(parts: MessagePart[]) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (!part || !isChatReasoningPart(part)) continue
    const heading = reasoningHeading(part.text)
    if (heading) return { id: part.id, heading }
  }
  return undefined
}

export function timelineRowKey(row: TimelineRow) {
  return row.key
}

export function projectTimelineRows(input: ProjectTimelineRowsInput): TimelineRow[] {
  const turns = buildTurns(input.messages)

  if (turns.length === 0 && input.isBusy) {
    const key = input.sessionID ?? input.directory ?? "active"
    return [
      {
        type: "thinking",
        key: `thinking:busy:${key}`,
        userMessageID: key,
        reasoningPartID: undefined,
        previousAssistantPart: false,
      },
    ]
  }

  const rows: TimelineRow[] = []

  turns.forEach((turn, turnIndex) => {
    const isLastTurn = turnIndex === turns.length - 1
    const pendingOptimisticInput =
      isLastTurn && turnHasOptimisticUserInput(turn) && turn.assistants.length === 0
    const active = isLastTurn && (input.isBusy || pendingOptimisticInput)
    const userMessageID = turnUserMessageID(turn, `turn-${turnIndex}`)
    const assistantParts = turn.assistants.flatMap((message) => message.parts)
    const assistantItems = groupAssistantParts(assistantParts, true)
    const hasReasoningSummaryRow = assistantItems.some(assistantItemHasReasoning)
    const textPartID = lastTextPartID(assistantParts)
    const aborted = assistantAborted(turn.assistants)
    const error = assistantError(turn.assistants)
    const errorText = formatMessageError(error)
    const compaction = turnHasCompaction(turn)
    const showThinking =
      active &&
      !errorText &&
      !hasReasoningSummaryRow &&
      (input.showReasoningSummaries ? assistantItems.length === 0 : true)

    if (turnIndex > 0) {
      rows.push({
        type: "turn-gap",
        key: `turn-gap:${userMessageID}`,
        userMessageID,
      })
    }

    if (turn.user) {
      rows.push({
        type: "user",
        key: `user:${turn.user.info.id}`,
        userMessageID: turn.user.info.id,
        partIDs: turn.user.parts.map((part) => part.id),
        anchor: true,
      })
    }

    if (compaction) {
      rows.push({
        type: "turn-divider",
        key: `turn-divider:${userMessageID}:compaction`,
        userMessageID,
        label: "compaction",
      })
    }

    let previousPartID: string | undefined
    assistantItems.forEach((item, itemIndex) => {
      const converted = convertAssistantItem(item, previousPartID)
      rows.push({
        type: "assistant",
        key: `assistant:${userMessageID}:${item.key}`,
        userMessageID,
        item: converted,
        assistantMessageIDs: turn.assistants.map((message) => message.info.id),
        assistantCopyPartID: active ? undefined : textPartID,
        assistantAborted: aborted,
        turnDurationMs: turnDurationMs(turn),
        active,
        itemActive: active && !showThinking && itemIndex === assistantItems.length - 1,
        previousAssistantPart: itemIndex > 0,
        lastAssistantTextID: textPartID,
      })
      previousPartID = lastPartID(item) ?? previousPartID
    })

    if (showThinking) {
      const reasoning = input.showReasoningSummaries
        ? undefined
        : currentReasoningPart(assistantParts)
      rows.push({
        type: "thinking",
        key: `thinking:${userMessageID}`,
        userMessageID,
        reasoningPartID: reasoning?.id,
        previousAssistantPart: assistantItems.length > 0,
        ...(reasoning?.heading ? { reasoningHeading: reasoning.heading } : {}),
      })
    }

    if (aborted) {
      rows.push({
        type: "turn-divider",
        key: `turn-divider:${userMessageID}:interrupted`,
        userMessageID,
        label: "interrupted",
      })
    }

    if (isLastTurn && isSessionStatusRetry(input.activeSessionStatus)) {
      rows.push({
        type: "retry",
        key: `retry:${userMessageID}`,
        userMessageID,
        status: input.activeSessionStatus,
      })
    }

    const errorName =
      error && typeof error.name === "string" && error.name !== "UnknownError"
        ? error.name
        : undefined

    if (errorText && !aborted && !input.isBusy) {
      rows.push({
        type: "error",
        key: `error:${userMessageID}`,
        userMessageID,
        text: errorText,
        errorName,
      })
    }
  })

  return rows
}

function assistantItemsEqual(left: TimelineAssistantItem, right: TimelineAssistantItem) {
  if (left.type !== right.type) return false
  if (left.key !== right.key) return false
  if (left.previousPartID !== right.previousPartID) return false
  if (left.type === "part" && right.type === "part") {
    return left.partID === right.partID
  }
  if (left.type === "grouped-parts" && right.type === "grouped-parts") {
    return left.tool === right.tool && stringArraysEqual(left.partIDs, right.partIDs)
  }
  if (left.type === "abstracted" && right.type === "abstracted") {
    return stringArraysEqual(left.partIDs, right.partIDs)
  }
  return false
}

function stringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function timelineRowsEqual(left: TimelineRow, right: TimelineRow) {
  if (left.type !== right.type) return false
  if (left.key !== right.key) return false

  switch (left.type) {
    case "turn-gap":
      return right.type === "turn-gap" && left.userMessageID === right.userMessageID
    case "user":
      return (
        right.type === "user" &&
        left.userMessageID === right.userMessageID &&
        stringArraysEqual(left.partIDs, right.partIDs) &&
        left.anchor === right.anchor
      )
    case "turn-divider":
      return (
        right.type === "turn-divider" &&
        left.userMessageID === right.userMessageID &&
        left.label === right.label
      )
    case "assistant":
      return (
        right.type === "assistant" &&
        left.userMessageID === right.userMessageID &&
        assistantItemsEqual(left.item, right.item) &&
        stringArraysEqual(left.assistantMessageIDs, right.assistantMessageIDs) &&
        left.assistantCopyPartID === right.assistantCopyPartID &&
        left.assistantAborted === right.assistantAborted &&
        left.turnDurationMs === right.turnDurationMs &&
        left.active === right.active &&
        left.itemActive === right.itemActive &&
        left.previousAssistantPart === right.previousAssistantPart &&
        left.lastAssistantTextID === right.lastAssistantTextID
      )
    case "thinking":
      return (
        right.type === "thinking" &&
        left.userMessageID === right.userMessageID &&
        left.reasoningPartID === right.reasoningPartID &&
        left.reasoningHeading === right.reasoningHeading &&
        left.previousAssistantPart === right.previousAssistantPart
      )
    case "retry":
      return (
        right.type === "retry" &&
        left.userMessageID === right.userMessageID &&
        left.status === right.status
      )
    case "error":
      return (
        right.type === "error" &&
        left.userMessageID === right.userMessageID &&
        left.text === right.text &&
        left.errorName === right.errorName
      )
  }
}

export function reuseTimelineRows(previous: TimelineRow[] | undefined, rows: TimelineRow[]) {
  if (!previous?.length) return rows
  const byKey = new Map<string, TimelineRow>()
  for (const row of previous) {
    byKey.set(timelineRowKey(row), row)
  }
  const next = rows.map((row) => {
    const existing = byKey.get(timelineRowKey(row))
    return existing && timelineRowsEqual(existing, row) ? existing : row
  })
  if (previous.length === next.length && previous.every((row, index) => row === next[index])) {
    return previous
  }
  return next
}
