import { formatMessageError, isMessageAbortError } from "./utils/error"
import type {
  ToolCollectionToken,
  ToolLayoutRole,
  ToolRendererToken,
} from "@buddy/opencode-adapter/tool-presentation"
import { buildTurns, groupAssistantParts } from "./utils/message-utils"
import { isChatReasoningPart, isChatTextPart, isChatToolPart } from "./utils/part-guards"
import { parseToolState } from "./tools/parse-tool-state"
import { parseToolPresentation } from "./tools/parse-tool-presentation"
import type { AssistantRenderItem, ChatTurn } from "./types"
import type { MessagePart, MessageWithParts, SessionStatusInfo } from "@/state/chat-types"
import { isSessionStatusRetry } from "@/state/session-status"

export type TimelineAssistantItem =
  | {
      type: "part"
      key: string
      partID: string
      renderer: ToolRendererToken | undefined
      layoutRole: ToolLayoutRole
      imageAttachmentCount: number
      previousPartID: string | undefined
    }
  | {
      type: "grouped-parts"
      key: string
      collection: ToolCollectionToken
      layoutRole: "compact-output" | "card-output" | "media-output"
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
      textLength: number
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
      /**
       * Vendor fork boundary: keep messages with id < this. The next turn's user
       * message includes this response; undefined clones the full session.
       */
      forkExclusiveMessageID: string | undefined
      assistantAborted: boolean
      turnDurationMs: number | undefined
      active: boolean
      itemActive: boolean
      layoutRole: ToolLayoutRole
      previousLayoutRole: ToolLayoutRole | undefined
      previousAssistantPart: boolean
      lastAssistantTextID: string | undefined
    }
  | {
      type: "activity"
      key: string
      userMessageID: string
      partIDs: string[]
      assistantMessageIDs: string[]
      assistantCopyPartID: string | undefined
      assistantAborted: boolean
      turnDurationMs: number | undefined
      active: boolean
      current: boolean
      initial: boolean
      previousLayoutRole: ToolLayoutRole | undefined
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
  /** Exclusive boundary after the final visible message, such as a session revert point. */
  forkExclusiveEndMessageID?: string
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

function assistantPartIDs(item: AssistantRenderItem): string[] {
  switch (item.type) {
    case "abstracted":
    case "grouped-parts":
      return item.parts.map((part) => part.id)
    case "part":
      return [item.part.id]
  }
}

function messagePartsTextLength(parts: MessagePart[]) {
  return parts.reduce((total, part) => {
    if (!isChatTextPart(part)) return total
    return total + part.text.length
  }, 0)
}

function imageAttachmentCount(part: MessagePart) {
  if (!isChatToolPart(part)) return 0
  return parseToolState(part).attachments.filter((attachment) =>
    attachment.mime.startsWith("image/"),
  ).length
}

function visibleToolRenderer(part: MessagePart): ToolRendererToken | undefined {
  const presentation = parseToolPresentation(part)
  return presentation?.archetype === "silent" ? undefined : presentation?.renderer
}

function convertAssistantItem(
  item: Exclude<AssistantRenderItem, { type: "abstracted" }>,
  previousPartID: string | undefined,
): TimelineAssistantItem {
  switch (item.type) {
    case "grouped-parts":
      return {
        type: item.type,
        key: item.key,
        collection: item.collection,
        layoutRole: item.layoutRole,
        partIDs: assistantPartIDs(item),
        previousPartID,
      }
    case "part":
      return {
        type: item.type,
        key: item.key,
        partID: item.part.id,
        renderer: isChatToolPart(item.part) ? visibleToolRenderer(item.part) : undefined,
        layoutRole: item.layoutRole,
        imageAttachmentCount: imageAttachmentCount(item.part),
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

function partIsVisiblyActive(part: MessagePart): boolean {
  if (isChatToolPart(part)) {
    return parseToolPresentation(part)?.outcome.type === "active"
  }
  if (isChatTextPart(part) || isChatReasoningPart(part)) {
    return typeof part.time?.end !== "number"
  }
  return false
}

function assistantItemIsVisiblyActive(item: AssistantRenderItem): boolean {
  switch (item.type) {
    case "abstracted":
      return false
    case "part":
      return partIsVisiblyActive(item.part)
    case "grouped-parts":
      return item.parts.some(partIsVisiblyActive)
  }
}

export function timelineRowKey(row: TimelineRow) {
  return row.key
}

export function latestLiveTimelineRowIndex(rows: readonly TimelineRow[]): number {
  return rows.findLastIndex(
    (row) =>
      (row.type === "activity" && row.active && row.current) ||
      (row.type === "assistant" && row.itemActive),
  )
}

export function projectTimelineRows(input: ProjectTimelineRowsInput): TimelineRow[] {
  const turns = buildTurns(input.messages)

  if (turns.length === 0 && input.isBusy) {
    const key = input.sessionID ?? input.directory ?? "active"
    return [
      {
        type: "activity",
        key: `activity:${key}:0`,
        userMessageID: key,
        partIDs: [],
        assistantMessageIDs: [],
        assistantCopyPartID: undefined,
        assistantAborted: false,
        turnDurationMs: undefined,
        active: true,
        current: true,
        initial: true,
        previousLayoutRole: undefined,
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
    const textPartID = lastTextPartID(assistantParts)
    const aborted = assistantAborted(turn.assistants)
    const error = assistantError(turn.assistants)
    const errorText = formatMessageError(error)
    const compaction = turnHasCompaction(turn)
    const lastAssistantItem = assistantItems.at(-1)
    const needsTailActivity = Boolean(
      active &&
        !errorText &&
        (!lastAssistantItem ||
          (lastAssistantItem.type !== "abstracted" &&
            !assistantItemIsVisiblyActive(lastAssistantItem))),
    )

    // Interrupted turns already end with a MessageDivider that owns inter-turn
    // spacing. Stacking turn-gap only below that divider made vertical rhythm
    // look uneven (tight above, loose below).
    if (turnIndex > 0) {
      const previousTurn = turns[turnIndex - 1]
      const previousAborted = assistantAborted(previousTurn.assistants)
      if (!previousAborted) {
        rows.push({
          type: "turn-gap",
          key: `turn-gap:${userMessageID}`,
          userMessageID,
        })
      }
    }

    if (turn.user) {
      rows.push({
        type: "user",
        key: `user:${turn.user.info.id}`,
        userMessageID: turn.user.info.id,
        partIDs: turn.user.parts.map((part) => part.id),
        textLength: messagePartsTextLength(turn.user.parts),
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
    let previousLayoutRole: ToolLayoutRole | undefined
    const nextTurnUser = turns[turnIndex + 1]?.user
    const forkExclusiveMessageID = nextTurnUser?.info.id ?? input.forkExclusiveEndMessageID

    assistantItems.forEach((item, itemIndex) => {
      const isLastItem = itemIndex === assistantItems.length - 1
      if (item.type === "abstracted") {
        rows.push({
          type: "activity",
          key: `activity:${userMessageID}:${item.key.slice("activity:".length)}`,
          userMessageID,
          partIDs: assistantPartIDs(item),
          assistantMessageIDs: turn.assistants.map((message) => message.info.id),
          assistantCopyPartID: active ? undefined : textPartID,
          assistantAborted: aborted,
          turnDurationMs: turnDurationMs(turn),
          active,
          current: active && isLastItem && !needsTailActivity,
          initial: item.key === "activity:0",
          previousLayoutRole,
          previousAssistantPart: itemIndex > 0,
        })
        previousPartID = lastPartID(item) ?? previousPartID
        previousLayoutRole = "activity"
        return
      }

      const converted = convertAssistantItem(item, previousPartID)
      rows.push({
        type: "assistant",
        key: `assistant:${userMessageID}:${item.key}`,
        userMessageID,
        item: converted,
        assistantMessageIDs: turn.assistants.map((message) => message.info.id),
        assistantCopyPartID: active ? undefined : textPartID,
        forkExclusiveMessageID,
        assistantAborted: aborted,
        turnDurationMs: turnDurationMs(turn),
        active,
        itemActive:
          active && isLastItem && !needsTailActivity && assistantItemIsVisiblyActive(item),
        layoutRole: item.layoutRole,
        previousLayoutRole,
        previousAssistantPart: itemIndex > 0,
        lastAssistantTextID: textPartID,
      })
      previousPartID = lastPartID(item) ?? previousPartID
      previousLayoutRole = item.layoutRole
    })

    if (needsTailActivity) {
      const boundaryOrdinal = assistantItems.filter((item) => item.type !== "abstracted").length
      rows.push({
        type: "activity",
        key: `activity:${userMessageID}:${boundaryOrdinal}`,
        userMessageID,
        partIDs: [],
        assistantMessageIDs: turn.assistants.map((message) => message.info.id),
        assistantCopyPartID: undefined,
        assistantAborted: aborted,
        turnDurationMs: turnDurationMs(turn),
        active: true,
        current: true,
        initial: boundaryOrdinal === 0,
        previousLayoutRole,
        previousAssistantPart: assistantItems.length > 0,
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
    return (
      left.partID === right.partID &&
      left.renderer === right.renderer &&
      left.layoutRole === right.layoutRole &&
      left.imageAttachmentCount === right.imageAttachmentCount
    )
  }
  if (left.type === "grouped-parts" && right.type === "grouped-parts") {
    return (
      left.collection === right.collection &&
      left.layoutRole === right.layoutRole &&
      stringArraysEqual(left.partIDs, right.partIDs)
    )
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
        left.textLength === right.textLength &&
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
        left.forkExclusiveMessageID === right.forkExclusiveMessageID &&
        left.assistantAborted === right.assistantAborted &&
        left.turnDurationMs === right.turnDurationMs &&
        left.active === right.active &&
        left.itemActive === right.itemActive &&
        left.layoutRole === right.layoutRole &&
        left.previousLayoutRole === right.previousLayoutRole &&
        left.previousAssistantPart === right.previousAssistantPart &&
        left.lastAssistantTextID === right.lastAssistantTextID
      )
    case "activity":
      return (
        right.type === "activity" &&
        left.userMessageID === right.userMessageID &&
        stringArraysEqual(left.partIDs, right.partIDs) &&
        stringArraysEqual(left.assistantMessageIDs, right.assistantMessageIDs) &&
        left.assistantCopyPartID === right.assistantCopyPartID &&
        left.assistantAborted === right.assistantAborted &&
        left.turnDurationMs === right.turnDurationMs &&
        left.active === right.active &&
        left.current === right.current &&
        left.initial === right.initial &&
        left.previousLayoutRole === right.previousLayoutRole &&
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
