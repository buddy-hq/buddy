import { isMessageAbortError } from "./utils/error"
import type {
  ToolCollectionToken,
  ToolLayoutRole,
  ToolRendererToken,
} from "@buddy/opencode-adapter/tool-presentation"
import { buildTurns, groupAssistantParts } from "./utils/message-utils"
import { isChatReasoningPart, isChatTextPart, isChatToolPart } from "./utils/part-guards"
import { visibleUserTextLength } from "./utils/user-message-text"
import {
  projectUserMessageStackedContent,
  userMessageStackedContentCount,
} from "./utils/user-message-stacked-content"
import { parseToolState } from "./tools/parse-tool-state"
import { parseToolPresentation } from "./tools/parse-tool-presentation"
import type { AssistantRenderItem, ChatTurn } from "./types"
import type { MessagePart, MessageWithParts, SessionStatusInfo } from "@/state/chat-types"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import { isSessionStatusRetry } from "@/state/session-status"
import {
  buildAssistantErrorModel,
  buildRetryStateModel,
  type AssistantErrorModel,
  type RetryStateModel,
} from "@/state/chat-error-model"

export type TimelineAssistantItem =
  | {
      type: "part"
      key: string
      partID: string
      renderer: ToolRendererToken | undefined
      layoutRole: ToolLayoutRole
      imageAttachmentCount: number
      /** Rendered characters of a text or reasoning part; 0 for tool parts. */
      textLength: number
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
      /** Characters the bubble renders. Hidden and synthetic text is excluded. */
      textLength: number
      /** Top-level attachment/chip/selection rows stacked above the prose bubble. */
      stackedContentCount: number
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
      /**
       * The part that owns the turn's copy/fork actions. Ownership stays stable
       * while active; the footer itself mounts only once actions are enabled.
       */
      assistantActionPartID: string | undefined
      /** Whether those actions are interactive yet. Flips at the terminal transition. */
      assistantActionsEnabled: boolean
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
    }
  | {
      type: "activity"
      key: string
      userMessageID: string
      partIDs: string[]
      assistantMessageIDs: string[]
      /**
       * The part that owns the turn's copy/fork actions. Ownership stays stable
       * while active; the footer itself mounts only once actions are enabled.
       */
      assistantActionPartID: string | undefined
      /** Whether those actions are interactive yet. Flips at the terminal transition. */
      assistantActionsEnabled: boolean
      assistantAborted: boolean
      turnDurationMs: number | undefined
      active: boolean
      current: boolean
      initial: boolean
      /**
       * An empty tail row waiting on a post-answer pause rather than showing
       * anything. It must not reach the transcript until the pause is real —
       * see `withRevealedEndOfTurnTail`.
       */
      endOfTurnDeadZone: boolean
      previousLayoutRole: ToolLayoutRole | undefined
    }
  | {
      type: "retry"
      key: string
      userMessageID: string
      status: Extract<SessionStatusInfo, { type: "retry" }>
      model: RetryStateModel
    }
  | {
      type: "caveat"
      key: string
      userMessageID: string
      model: AssistantErrorModel
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

function assistantPartTextLength(part: MessagePart) {
  if (!isChatTextPart(part) && !isChatReasoningPart(part)) return 0
  return part.text.length
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
        textLength: assistantPartTextLength(item.part),
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

function turnHasVisibleUserRow(turn: ChatTurn) {
  return (turn.user?.parts ?? []).some((part) => part.type !== "compaction")
}

function turnHasOptimisticUserInput(turn: ChatTurn) {
  return (turn.user?.parts ?? []).some((part) => part.optimistic === true)
}

function turnHasRunningAssistant(turn: ChatTurn) {
  return turn.assistants.some((message) => !isTerminalAssistantMessageInfo(message.info))
}

function activeTurnIndex(turns: ChatTurn[], isBusy: boolean) {
  if (turns.length === 0) return -1

  if (isBusy) {
    // A user-only steer follows the currently streaming assistant, so the
    // latest assistant-bearing turn remains active. Older non-terminal records
    // must not win after a newer assistant turn has already superseded them.
    const latestAssistantTurnIndex = turns.findLastIndex((turn) => turn.assistants.length > 0)
    const latestAssistantTurn = turns[latestAssistantTurnIndex]
    if (latestAssistantTurn && turnHasRunningAssistant(latestAssistantTurn)) {
      return latestAssistantTurnIndex
    }
    return turns.length - 1
  }

  const lastTurnIndex = turns.length - 1
  const lastTurn = turns[lastTurnIndex]
  return lastTurn && turnHasOptimisticUserInput(lastTurn) && lastTurn.assistants.length === 0
    ? lastTurnIndex
    : -1
}

function assistantAborted(messages: MessageWithParts[]) {
  return messages.some(
    (message) =>
      message.info.role === "assistant" &&
      (isAssistantAbortFinish(message.info.finish) || isMessageAbortError(message.info.error)),
  )
}

function assistantError(messages: MessageWithParts[]) {
  const latestAssistant = messages.findLast((message) => message.info.role === "assistant")
  const error = latestAssistant?.info.role === "assistant" ? latestAssistant.info.error : undefined
  return error && !isMessageAbortError(error) ? error : undefined
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

/**
 * The key of the trailing row when it is an empty tail waiting only on a
 * post-answer pause, otherwise undefined. Drive `useDelayedFlag` from this — as
 * both its condition *and* its reset key — then feed the result back through
 * `withRevealedEndOfTurnTail`.
 *
 * The key matters because a completed output can replace one pending tail with
 * another without the "is pending" boolean ever going false. Keyed only on the
 * boolean, the successor would inherit the elapsed delay and reveal early.
 */
export function pendingEndOfTurnTailKey(rows: TimelineRow[]): string | undefined {
  const last = rows.at(-1)
  return last?.type === "activity" && last.endOfTurnDeadZone ? last.key : undefined
}

/**
 * Withhold the end-of-turn tail row until the pause it represents is real.
 *
 * Reserving that row's ~40px up front and dropping it when the turn ends moves
 * the whole viewport twice on every single turn: once when the row is inserted
 * and once when the shrinking spacer makes the browser clamp `scrollTop`. Since
 * the row is not shown during that window anyway, not creating it is free.
 */
export function withRevealedEndOfTurnTail(rows: TimelineRow[], revealed: boolean): TimelineRow[] {
  if (revealed || pendingEndOfTurnTailKey(rows) === undefined) return rows
  return rows.slice(0, -1)
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
        assistantActionPartID: undefined,
        assistantActionsEnabled: false,
        assistantAborted: false,
        turnDurationMs: undefined,
        active: true,
        current: true,
        initial: true,
        endOfTurnDeadZone: false,
        previousLayoutRole: undefined,
      },
    ]
  }

  const rows: TimelineRow[] = []
  const activeIndex = activeTurnIndex(turns, input.isBusy)

  turns.forEach((turn, turnIndex) => {
    const isLastTurn = turnIndex === turns.length - 1
    const active = turnIndex === activeIndex
    const userMessageID = turnUserMessageID(turn, `turn-${turnIndex}`)
    const assistantParts = turn.assistants.flatMap((message) => message.parts)
    const assistantItems = groupAssistantParts(assistantParts, true)
    const textPartID = lastTextPartID(assistantParts)
    const aborted = assistantAborted(turn.assistants)
    const error = assistantError(turn.assistants)
    const hasVisibleText = assistantParts.some(
      (part) => isChatTextPart(part) && part.text.trim().length > 0,
    )
    const compaction = turnHasCompaction(turn)
    const lastAssistantItem = assistantItems.at(-1)
    const needsTailActivity = Boolean(
      active &&
      !error &&
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

    if (turn.user && turnHasVisibleUserRow(turn)) {
      const stackedContent = projectUserMessageStackedContent(turn.user.parts)
      rows.push({
        type: "user",
        key: `user:${turn.user.info.id}`,
        userMessageID: turn.user.info.id,
        partIDs: turn.user.parts.map((part) => part.id),
        textLength: visibleUserTextLength(turn.user.parts),
        stackedContentCount: userMessageStackedContentCount(stackedContent),
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
          assistantActionPartID: textPartID,
          assistantActionsEnabled: !active,
          assistantAborted: aborted,
          turnDurationMs: turnDurationMs(turn),
          active,
          current: active && isLastItem && !needsTailActivity,
          initial: item.key === "activity:0",
          endOfTurnDeadZone: false,
          previousLayoutRole,
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
        assistantActionPartID: textPartID,
        assistantActionsEnabled: !active,
        forkExclusiveMessageID,
        assistantAborted: aborted,
        turnDurationMs: turnDurationMs(turn),
        active,
        itemActive:
          active && isLastItem && !needsTailActivity && assistantItemIsVisiblyActive(item),
        layoutRole: item.layoutRole,
        previousLayoutRole,
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
        assistantActionPartID: undefined,
        assistantActionsEnabled: false,
        assistantAborted: aborted,
        turnDurationMs: turnDurationMs(turn),
        active: true,
        current: true,
        initial: boundaryOrdinal === 0,
        // The start-of-turn "Thinking" placeholder is exempt: it must appear
        // immediately so a submit feels acknowledged.
        endOfTurnDeadZone: boundaryOrdinal > 0,
        previousLayoutRole,
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
      const model = buildRetryStateModel(input.activeSessionStatus)
      if (model.stage !== "quiet") {
        rows.push({
          type: "retry",
          key: `retry:${userMessageID}`,
          userMessageID,
          status: input.activeSessionStatus,
          model,
        })
      }
    }

    if (error && !aborted && !input.isBusy) {
      const model = buildAssistantErrorModel(error, { hasVisibleText })
      if (model.disposition === "caveat") {
        rows.push({
          type: "caveat",
          key: `caveat:${userMessageID}`,
          userMessageID,
          model,
        })
      }
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
      left.imageAttachmentCount === right.imageAttachmentCount &&
      left.textLength === right.textLength
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

function assistantErrorModelsEqual(left: AssistantErrorModel, right: AssistantErrorModel) {
  return (
    left.category === right.category &&
    left.disposition === right.disposition &&
    left.details.name === right.details.name &&
    left.details.message === right.details.message &&
    left.details.providerID === right.details.providerID &&
    left.details.statusCode === right.details.statusCode &&
    left.details.isRetryable === right.details.isRetryable &&
    left.details.responseBody === right.details.responseBody &&
    left.details.providerError?.type === right.details.providerError?.type &&
    left.details.providerError?.code === right.details.providerError?.code &&
    left.details.providerError?.message === right.details.providerError?.message
  )
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
        left.stackedContentCount === right.stackedContentCount &&
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
        left.assistantActionPartID === right.assistantActionPartID &&
        left.assistantActionsEnabled === right.assistantActionsEnabled &&
        left.forkExclusiveMessageID === right.forkExclusiveMessageID &&
        left.assistantAborted === right.assistantAborted &&
        left.turnDurationMs === right.turnDurationMs &&
        left.active === right.active &&
        left.itemActive === right.itemActive &&
        left.layoutRole === right.layoutRole &&
        left.previousLayoutRole === right.previousLayoutRole
      )
    case "activity":
      return (
        right.type === "activity" &&
        left.userMessageID === right.userMessageID &&
        stringArraysEqual(left.partIDs, right.partIDs) &&
        stringArraysEqual(left.assistantMessageIDs, right.assistantMessageIDs) &&
        left.assistantActionPartID === right.assistantActionPartID &&
        left.assistantActionsEnabled === right.assistantActionsEnabled &&
        left.assistantAborted === right.assistantAborted &&
        left.turnDurationMs === right.turnDurationMs &&
        left.active === right.active &&
        left.current === right.current &&
        left.initial === right.initial &&
        left.endOfTurnDeadZone === right.endOfTurnDeadZone &&
        left.previousLayoutRole === right.previousLayoutRole
      )
    case "retry":
      return (
        right.type === "retry" &&
        left.userMessageID === right.userMessageID &&
        left.status === right.status
      )
    case "caveat":
      return (
        right.type === "caveat" &&
        left.userMessageID === right.userMessageID &&
        assistantErrorModelsEqual(left.model, right.model)
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
