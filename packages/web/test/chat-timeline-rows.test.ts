import { describe, expect, test } from "bun:test"

import {
  projectTimelineRows,
  reuseTimelineRows,
  type TimelineRow,
} from "../src/components/chat/chat-timeline-rows"
import { BUSY_SESSION_STATUS, IDLE_SESSION_STATUS } from "../src/state/session-status"
import type { MessagePart, MessageWithParts, SessionStatusInfo } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"

function userMessage(id = "msg_user", input?: { optimistic?: boolean }): MessageWithParts {
  return createMessageWithParts(createUserMessageInfo({ id, sessionID: "ses_rows" }), [
    {
      id: `${id}_part`,
      sessionID: "ses_rows",
      messageID: id,
      type: "text",
      text: "Prompt",
      ...(input?.optimistic ? { optimistic: true } : {}),
    },
  ])
}

function assistantMessage(input: {
  id: string
  parts: MessagePart[]
  error?: { name: string; message: string }
}): MessageWithParts {
  return createMessageWithParts(
    createAssistantMessageInfo({
      id: input.id,
      sessionID: "ses_rows",
      ...(input.error ? { error: input.error } : {}),
    }),
    input.parts,
  )
}

function toolPart(input: { id: string; tool: string }): MessagePart {
  return {
    id: input.id,
    sessionID: "ses_rows",
    messageID: "msg_assistant",
    type: "tool",
    tool: input.tool,
    callID: `call_${input.id}`,
    state: {
      status: "completed",
      input: {},
      metadata: {},
      attachments: [],
      output: "",
      time: { start: 1, end: 2 },
    },
  }
}

function rowsFor(input: {
  messages: MessageWithParts[]
  isBusy?: boolean
  status?: SessionStatusInfo
  showReasoningSummaries?: boolean
}) {
  return projectTimelineRows({
    messages: input.messages,
    isBusy: input.isBusy ?? false,
    sessionID: "ses_rows",
    directory: "/repo",
    activeSessionStatus: input.status ?? IDLE_SESSION_STATUS,
    showReasoningSummaries: input.showReasoningSummaries ?? true,
  })
}

function isGroupedAssistantRow(row: TimelineRow): row is Extract<
  TimelineRow,
  { type: "assistant" }
> & {
  item: Extract<TimelineRow, { type: "assistant" }>["item"] & { type: "grouped-parts" }
} {
  return row.type === "assistant" && row.item.type === "grouped-parts"
}

function isAbstractedAssistantRow(row: TimelineRow): row is Extract<
  TimelineRow,
  { type: "assistant" }
> & {
  item: Extract<TimelineRow, { type: "assistant" }>["item"] & { type: "abstracted" }
} {
  return row.type === "assistant" && row.item.type === "abstracted"
}

describe("chat timeline rows", () => {
  test("projects grouped inline objects into stable semantic rows", () => {
    const messages = [
      userMessage(),
      assistantMessage({
        id: "msg_assistant",
        parts: [
          toolPart({ id: "prt_figure_1", tool: "render_figure" }),
          toolPart({ id: "prt_figure_2", tool: "render_figure" }),
        ],
      }),
    ]

    const rows = rowsFor({ messages })
    const assistantRow = rows.find(isGroupedAssistantRow)

    expect(rows.map((row) => row.type)).toEqual(["user", "assistant"])
    expect(assistantRow?.key).toBe("assistant:msg_user:grouped-parts:render_figure:prt_figure_1")
    expect(assistantRow?.item).toEqual({
      type: "grouped-parts",
      key: "grouped-parts:render_figure:prt_figure_1",
      tool: "render_figure",
      partIDs: ["prt_figure_1", "prt_figure_2"],
      previousPartID: undefined,
    })

    const nextRows = rowsFor({ messages })
    const reused = reuseTimelineRows(rows, nextRows)
    expect(reused[0]).toBe(rows[0])
    expect(reused[1]).toBe(rows[1])
  })

  test("projects active thinking, retry notices, and assistant errors", () => {
    const optimisticPendingRows = rowsFor({
      messages: [userMessage("msg_pending_user", { optimistic: true })],
    })

    expect(optimisticPendingRows.at(-1)).toEqual({
      type: "thinking",
      key: "thinking:msg_pending_user",
      userMessageID: "msg_pending_user",
      reasoningPartID: undefined,
      previousAssistantPart: false,
    })

    const activeRows = rowsFor({
      messages: [
        userMessage("msg_active_user"),
        assistantMessage({
          id: "msg_active_assistant",
          parts: [
            {
              id: "prt_reasoning",
              sessionID: "ses_rows",
              messageID: "msg_active_assistant",
              type: "reasoning",
              text: "# Planning\n\nChecking the route.",
              time: { start: 1 },
            },
          ],
        }),
      ],
      isBusy: true,
      status: BUSY_SESSION_STATUS,
      showReasoningSummaries: false,
    })

    expect(activeRows.map((row) => row.type)).toEqual(["user", "assistant"])
    const activeReasoningRow = activeRows.find(isAbstractedAssistantRow)
    expect(activeReasoningRow?.active).toBe(true)
    expect(activeReasoningRow?.item.partIDs).toEqual(["prt_reasoning"])

    const retryStatus: SessionStatusInfo = {
      type: "retry",
      attempt: 2,
      message: "Retrying",
      next: 123,
    }
    const retryRows = rowsFor({
      messages: [userMessage("msg_retry_user")],
      status: retryStatus,
    })
    expect(retryRows.at(-1)).toEqual({
      type: "retry",
      key: "retry:msg_retry_user",
      userMessageID: "msg_retry_user",
      status: retryStatus,
    })

    const errorRows = rowsFor({
      messages: [
        userMessage("msg_error_user"),
        assistantMessage({
          id: "msg_error_assistant",
          parts: [],
          error: { name: "ProviderError", message: "Nope" },
        }),
      ],
    })
    expect(errorRows.at(-1)).toEqual({
      type: "error",
      key: "error:msg_error_user",
      userMessageID: "msg_error_user",
      text: "Nope",
      errorName: "ProviderError",
    })
  })

  test("keeps active thinking visible when summaries are disabled and text is streaming", () => {
    const rows = rowsFor({
      messages: [
        userMessage("msg_active_reasoning_user"),
        assistantMessage({
          id: "msg_active_reasoning_assistant",
          parts: [
            {
              id: "prt_active_reasoning",
              sessionID: "ses_rows",
              messageID: "msg_active_reasoning_assistant",
              type: "reasoning",
              text: "# Considering context\n\nThe model thought about the user's question.",
              time: { start: 1 },
            },
            {
              id: "prt_active_text",
              sessionID: "ses_rows",
              messageID: "msg_active_reasoning_assistant",
              type: "text",
              text: "Partial response",
              time: { start: 2 },
            },
          ],
        }),
      ],
      isBusy: true,
      status: BUSY_SESSION_STATUS,
      showReasoningSummaries: false,
    })

    expect(rows.map((row) => row.type)).toEqual(["user", "assistant", "assistant"])
    const reasoningRow = rows.find(isAbstractedAssistantRow)
    expect(reasoningRow?.active).toBe(true)
    expect(reasoningRow?.item.partIDs).toEqual(["prt_active_reasoning"])
  })

  test("marks synthetic thinking after assistant content as a following assistant row", () => {
    const rows = rowsFor({
      messages: [
        userMessage("msg_active_text_user"),
        assistantMessage({
          id: "msg_active_text_assistant",
          parts: [
            {
              id: "prt_active_text_only",
              sessionID: "ses_rows",
              messageID: "msg_active_text_assistant",
              type: "text",
              text: "Partial response",
              time: { start: 1 },
            },
          ],
        }),
      ],
      isBusy: true,
      status: BUSY_SESSION_STATUS,
      showReasoningSummaries: false,
    })

    expect(rows.map((row) => row.type)).toEqual(["user", "assistant", "thinking"])
    expect(rows.at(-1)).toEqual({
      type: "thinking",
      key: "thinking:msg_active_text_user",
      userMessageID: "msg_active_text_user",
      reasoningPartID: undefined,
      previousAssistantPart: true,
    })
  })

  test("projects completed reasoning as a collapsed row when summaries are enabled", () => {
    const rows = rowsFor({
      messages: [
        userMessage("msg_completed_reasoning_user"),
        assistantMessage({
          id: "msg_completed_reasoning_assistant",
          parts: [
            {
              id: "prt_completed_reasoning",
              sessionID: "ses_rows",
              messageID: "msg_completed_reasoning_assistant",
              type: "reasoning",
              text: "The model thought about the user's question.",
            },
            {
              id: "prt_completed_text",
              sessionID: "ses_rows",
              messageID: "msg_completed_reasoning_assistant",
              type: "text",
              text: "Final response",
            },
          ],
        }),
      ],
      showReasoningSummaries: true,
    })

    expect(rows.map((row) => row.type)).toEqual(["user", "assistant", "assistant"])
    const reasoningRow = rows.find(isAbstractedAssistantRow)
    expect(reasoningRow?.item.partIDs).toEqual(["prt_completed_reasoning"])
  })

  test("keeps completed reasoning as a collapsed row when summaries are disabled", () => {
    const rows = rowsFor({
      messages: [
        userMessage("msg_completed_reasoning_disabled_user"),
        assistantMessage({
          id: "msg_completed_reasoning_disabled_assistant",
          parts: [
            {
              id: "prt_completed_reasoning_disabled",
              sessionID: "ses_rows",
              messageID: "msg_completed_reasoning_disabled_assistant",
              type: "reasoning",
              text: "The model thought about the user's question.",
            },
            {
              id: "prt_completed_text_disabled",
              sessionID: "ses_rows",
              messageID: "msg_completed_reasoning_disabled_assistant",
              type: "text",
              text: "Final response",
            },
          ],
        }),
      ],
      showReasoningSummaries: false,
    })

    expect(rows.map((row) => row.type)).toEqual(["user", "assistant", "assistant"])
    const reasoningRow = rows.find(isAbstractedAssistantRow)
    expect(reasoningRow?.active).toBe(false)
    expect(reasoningRow?.item.partIDs).toEqual(["prt_completed_reasoning_disabled"])
  })

  test("projects compaction and interruption dividers", () => {
    const compactionRows = rowsFor({
      messages: [
        createMessageWithParts(
          createUserMessageInfo({ id: "msg_compact_user", sessionID: "ses_rows" }),
          [
            {
              id: "prt_compact_text",
              sessionID: "ses_rows",
              messageID: "msg_compact_user",
              type: "text",
              text: "Compact this",
            },
            {
              id: "prt_compaction",
              sessionID: "ses_rows",
              messageID: "msg_compact_user",
              type: "compaction",
            },
          ],
        ),
      ],
    })
    expect(compactionRows).toContainEqual({
      type: "turn-divider",
      key: "turn-divider:msg_compact_user:compaction",
      userMessageID: "msg_compact_user",
      label: "compaction",
    })

    const interruptedRows = rowsFor({
      messages: [
        userMessage("msg_interrupted_user"),
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "msg_interrupted_assistant",
            sessionID: "ses_rows",
            finish: "aborted",
          }),
        ),
      ],
    })
    expect(interruptedRows).toContainEqual({
      type: "turn-divider",
      key: "turn-divider:msg_interrupted_user:interrupted",
      userMessageID: "msg_interrupted_user",
      label: "interrupted",
    })
  })
})
