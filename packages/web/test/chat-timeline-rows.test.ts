import { describe, expect, test } from "bun:test"

import {
  latestLiveTimelineRowIndex,
  projectTimelineRows,
  reuseTimelineRows,
  type TimelineRow,
} from "../src/components/chat/chat-timeline-rows"
import { IDLE_SESSION_STATUS } from "../src/state/session-status"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"
import {
  activityPresentation,
  inlinePresentation,
  presentationMetadata,
} from "./tool-presentation-fixtures"

function userMessage(input: { id?: string; optimistic?: boolean } = {}): MessageWithParts {
  const id = input.id ?? "msg_user"
  return createMessageWithParts(createUserMessageInfo({ id, sessionID: "ses_rows" }), [
    {
      id: `${id}_part`,
      sessionID: "ses_rows",
      messageID: id,
      type: "text",
      text: "Prompt",
      ...(input.optimistic ? { optimistic: true } : {}),
    },
  ])
}

function assistantMessage(id: string, parts: MessagePart[]): MessageWithParts {
  return createMessageWithParts(createAssistantMessageInfo({ id, sessionID: "ses_rows" }), parts)
}

function textPart(id: string): MessagePart {
  return {
    id,
    sessionID: "ses_rows",
    messageID: `msg_assistant_${id}`,
    type: "text",
    text: id,
    time: { start: 1, end: 2 },
  }
}

function completedActivity(id: string): MessagePart {
  return {
    id,
    sessionID: "ses_rows",
    messageID: "msg_assistant",
    type: "tool",
    tool: "read",
    callID: `call_${id}`,
    metadata: presentationMetadata(
      activityPresentation({
        phase: "completed",
        action: "Read",
        category: "read-files",
        summary: "Read files",
        icon: "read",
        renderer: "read",
      }),
    ),
    state: {
      status: "completed",
      input: {},
      output: "done",
      title: "Read",
      metadata: {},
      attachments: [],
      time: { start: 1, end: 2 },
    },
  }
}

function inlineImage(input: {
  id: string
  phase: "running" | "completed"
  collection?: "image-gallery"
}): MessagePart {
  const metadata = presentationMetadata(
    inlinePresentation({
      phase: input.phase,
      action: input.phase === "running" ? "Generating" : "Generated",
      renderer: "image-generation",
      layoutRole: "media-output",
      icon: "image",
      ...(input.collection ? { collection: input.collection } : {}),
    }),
  )
  const base = {
    id: input.id,
    sessionID: "ses_rows",
    messageID: "msg_assistant",
    type: "tool" as const,
    tool: "imagegen",
    callID: `call_${input.id}`,
    metadata,
  }
  return input.phase === "running"
    ? { ...base, state: { status: "running", input: {}, time: { start: 1 } } }
    : {
        ...base,
        state: {
          status: "completed",
          input: {},
          output: "done",
          title: "Image",
          metadata: {},
          attachments: [],
          time: { start: 1, end: 2 },
        },
      }
}

function rowsFor(messages: MessageWithParts[], isBusy = false): TimelineRow[] {
  return projectTimelineRows({
    messages,
    isBusy,
    sessionID: "ses_rows",
    directory: "/repo",
    activeSessionStatus: IDLE_SESSION_STATUS,
    showReasoningSummaries: true,
  })
}

describe("chat timeline rows", () => {
  test("keeps the optimistic ActivityRow key when reasoning populates it", () => {
    const optimisticRows = rowsFor([userMessage({ optimistic: true })])
    const reasoning: MessagePart = {
      id: "reasoning",
      sessionID: "ses_rows",
      messageID: "msg_assistant",
      type: "reasoning",
      text: "Thinking through it",
      time: { start: 1 },
    }
    const populatedRows = rowsFor(
      [userMessage(), assistantMessage("msg_assistant", [reasoning])],
      true,
    )

    expect(optimisticRows.at(-1)?.key).toBe("activity:msg_user:0")
    expect(populatedRows.at(-1)?.key).toBe("activity:msg_user:0")
    expect(populatedRows.at(-1)?.type).toBe("activity")
  })

  test("does not create an empty user row for a compaction-only boundary", () => {
    const messageID = "msg_compaction"
    const compactionMessage = createMessageWithParts(
      createUserMessageInfo({ id: messageID, sessionID: "ses_rows" }),
      [
        {
          id: "prt_compaction",
          sessionID: "ses_rows",
          messageID,
          type: "compaction",
          auto: true,
        },
      ],
    )

    const rows = rowsFor([
      compactionMessage,
      assistantMessage("msg_compaction_summary", [textPart("summary")]),
    ])

    expect(rows.map((row) => row.type)).toEqual(["turn-divider", "assistant"])
    expect(rows[0]).toMatchObject({
      type: "turn-divider",
      label: "compaction",
    })
  })

  test("adds a new tail ActivityRow after completed media while still busy", () => {
    const rows = rowsFor(
      [
        userMessage(),
        assistantMessage("msg_assistant", [inlineImage({ id: "image", phase: "completed" })]),
      ],
      true,
    )

    expect(rows.map((row) => row.type)).toEqual(["user", "assistant", "activity"])
    expect(rows.at(-1)?.key).toBe("activity:msg_user:1")
    const activity = rows.at(-1)
    expect(activity?.type === "activity" ? activity.previousLayoutRole : undefined).toBe(
      "media-output",
    )
  })

  test("does not add duplicate Panda activity while an inline loader is active", () => {
    const rows = rowsFor(
      [
        userMessage(),
        assistantMessage("msg_assistant", [inlineImage({ id: "image", phase: "running" })]),
      ],
      true,
    )
    expect(rows.map((row) => row.type)).toEqual(["user", "assistant"])
  })

  test("pins only live timeline rows outside the virtualizer range", () => {
    const settledRows = rowsFor([
      userMessage(),
      assistantMessage("msg_assistant", [completedActivity("read")]),
    ])
    const liveRows = rowsFor(
      [userMessage(), assistantMessage("msg_assistant", [completedActivity("read")])],
      true,
    )
    const liveInlineRows = rowsFor(
      [
        userMessage(),
        assistantMessage("msg_assistant", [inlineImage({ id: "image", phase: "running" })]),
      ],
      true,
    )

    expect(latestLiveTimelineRowIndex(settledRows)).toBe(-1)
    expect(latestLiveTimelineRowIndex(liveRows)).toBe(liveRows.length - 1)
    expect(latestLiveTimelineRowIndex(liveInlineRows)).toBe(liveInlineRows.length - 1)
    expect(liveRows.at(-1)).toMatchObject({
      type: "activity",
      active: true,
      current: true,
    })
    expect(liveInlineRows.at(-1)).toMatchObject({
      type: "assistant",
      itemActive: true,
    })
  })

  test("visible prose seals one activity segment and gives the next a new boundary key", () => {
    const text: MessagePart = {
      id: "text",
      sessionID: "ses_rows",
      messageID: "msg_assistant",
      type: "text",
      text: "Progress",
      time: { start: 2, end: 3 },
    }
    const rows = rowsFor(
      [
        userMessage(),
        assistantMessage("msg_assistant", [
          completedActivity("read-1"),
          text,
          completedActivity("read-2"),
        ]),
      ],
      false,
    )
    const activityKeys = rows.filter((row) => row.type === "activity").map((row) => row.key)
    expect(activityKeys).toEqual(["activity:msg_user:0", "activity:msg_user:1"])
  })

  test("groups compatible assets by the descriptor collection token", () => {
    const rows = rowsFor([
      userMessage(),
      assistantMessage("msg_assistant", [
        inlineImage({ id: "image-1", phase: "completed", collection: "image-gallery" }),
        inlineImage({ id: "image-2", phase: "completed", collection: "image-gallery" }),
      ]),
    ])
    const assistant = rows.find(
      (row): row is Extract<TimelineRow, { type: "assistant" }> => row.type === "assistant",
    )
    expect(assistant?.item).toEqual({
      type: "grouped-parts",
      key: "grouped-parts:image-gallery:image-1",
      collection: "image-gallery",
      layoutRole: "media-output",
      partIDs: ["image-1", "image-2"],
      previousPartID: undefined,
    })
  })

  test("reuses equal rows by stable domain key", () => {
    const messages = [userMessage(), assistantMessage("msg_assistant", [completedActivity("read")])]
    const first = rowsFor(messages)
    const second = rowsFor(messages)
    const reused = reuseTimelineRows(first, second)
    expect(reused.every((row, index) => row === first[index])).toBe(true)
  })

  test("uses the next user message as the prior assistant fork boundary", () => {
    const rows = rowsFor([
      userMessage({ id: "msg_user_1" }),
      assistantMessage("msg_assistant_1", [textPart("first")]),
      userMessage({ id: "msg_user_2" }),
      assistantMessage("msg_assistant_2", [textPart("second")]),
    ])
    const assistantRows = rows.filter(
      (row): row is Extract<TimelineRow, { type: "assistant" }> => row.type === "assistant",
    )
    expect(assistantRows.map((row) => row.forkExclusiveMessageID)).toEqual([
      "msg_user_2",
      undefined,
    ])
  })

  test("keeps output-length caveats inline and terminal errors out of the transcript", () => {
    const outputLengthMessage = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_assistant",
        sessionID: "ses_rows",
        error: {
          name: "MessageOutputLengthError",
          data: {},
        },
      }),
      [textPart("partial-response")],
    )

    const caveatRow = rowsFor([userMessage(), outputLengthMessage]).find(
      (row): row is Extract<TimelineRow, { type: "caveat" }> => row.type === "caveat",
    )

    expect(caveatRow?.model).toMatchObject({
      category: "output-length",
      disposition: "caveat",
      details: { name: "MessageOutputLengthError" },
    })

    const terminalMessage = createMessageWithParts(
      createAssistantMessageInfo({
        id: "msg_terminal",
        sessionID: "ses_rows",
        error: {
          name: "APIError",
          data: { statusCode: 500, message: "Internal server error" },
        },
      }),
      [],
    )
    expect(rowsFor([userMessage(), terminalMessage]).some((row) => row.type === "caveat")).toBe(
      false,
    )
  })

  test("projects only visible retry stages", () => {
    const quietRows = projectTimelineRows({
      messages: [userMessage()],
      isBusy: true,
      sessionID: "ses_rows",
      directory: "/repo",
      activeSessionStatus: {
        type: "retry",
        attempt: 2,
        message: "Provider rate limit exceeded",
        next: 1_000,
      },
      showReasoningSummaries: true,
    })
    expect(quietRows.some((row) => row.type === "retry")).toBe(false)

    const rows = projectTimelineRows({
      messages: [userMessage()],
      isBusy: true,
      sessionID: "ses_rows",
      directory: "/repo",
      activeSessionStatus: {
        type: "retry",
        attempt: 5,
        message: "Provider rate limit exceeded",
        next: 1_000,
      },
      showReasoningSummaries: true,
    })
    const retryRow = rows.find(
      (row): row is Extract<TimelineRow, { type: "retry" }> => row.type === "retry",
    )

    expect(retryRow?.model).toMatchObject({
      stage: "persistent",
      category: "rate-limit",
      attempt: 5,
    })
  })
})
