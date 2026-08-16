import { describe, expect, test } from "bun:test"

import {
  pendingEndOfTurnTailKey,
  latestLiveTimelineRowIndex,
  projectTimelineRows,
  reuseTimelineRows,
  withRevealedEndOfTurnTail,
  type TimelineRow,
} from "../src/components/chat/chat-timeline-rows"
import { IDLE_SESSION_STATUS } from "../src/state/session-status"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import {
  BUDDY_PROMPT_PART_METADATA_KEY,
  TEXT_FILE_ATTACHMENT_PART_TYPE,
} from "../src/components/prompt/prompt-types"
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
    Object.assign(
      {
        id: `${id}_part`,
        sessionID: "ses_rows",
        messageID: id,
        type: "text" as const,
        text: "Prompt",
      },
      input.optimistic ? { optimistic: true as const } : undefined,
    ),
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
    inlinePresentation(
      Object.assign(
        {
          phase: input.phase,
          action: input.phase === "running" ? "Generating" : "Generated",
          renderer: "image-generation" as const,
          layoutRole: "media-output" as const,
          icon: "image" as const,
        },
        input.collection === undefined ? undefined : { collection: input.collection },
      ),
    ),
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

function assistantRow(
  rows: TimelineRow[],
): Extract<TimelineRow, { type: "assistant" }> | undefined {
  return rows.find(
    (row): row is Extract<TimelineRow, { type: "assistant" }> => row.type === "assistant",
  )
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

  test("keeps the running assistant active when a steer appends a user turn", () => {
    const firstUserMessageID = "msg_user_before_steer"
    const assistantMessageID = "msg_assistant_before_steer"
    const steerMessageID = "msg_user_steer"
    const runningText: MessagePart = {
      id: "text_before_steer",
      sessionID: "ses_rows",
      messageID: assistantMessageID,
      type: "text",
      text: "Streaming response",
      time: { start: 1 },
    }
    const rows = rowsFor(
      [
        userMessage({ id: firstUserMessageID }),
        assistantMessage(assistantMessageID, [runningText]),
        userMessage({ id: steerMessageID }),
      ],
      true,
    )

    const assistant = rows.find(
      (row): row is Extract<TimelineRow, { type: "assistant" }> => row.type === "assistant",
    )
    const assistantIndex = rows.findIndex((row) => row.type === "assistant")
    const activities = rows.filter((row) => row.type === "activity")

    expect(assistant).toMatchObject({
      userMessageID: firstUserMessageID,
      active: true,
      itemActive: true,
    })
    expect(activities).toHaveLength(0)
    expect(latestLiveTimelineRowIndex(rows)).toBe(assistantIndex)
  })

  test("transfers busy activity to a steer after the prior assistant becomes terminal", () => {
    const firstUserMessageID = "msg_user_before_completed_steer"
    const assistantMessageID = "msg_assistant_before_completed_steer"
    const steerMessageID = "msg_user_completed_steer"
    const completedAssistant = createMessageWithParts(
      createAssistantMessageInfo({
        id: assistantMessageID,
        sessionID: "ses_rows",
        finish: "stop",
      }),
      [textPart("completed-before-steer")],
    )
    const rows = rowsFor(
      [
        userMessage({ id: firstUserMessageID }),
        completedAssistant,
        userMessage({ id: steerMessageID }),
      ],
      true,
    )

    const assistant = rows.find(
      (row): row is Extract<TimelineRow, { type: "assistant" }> => row.type === "assistant",
    )
    const activity = rows.find(
      (row): row is Extract<TimelineRow, { type: "activity" }> => row.type === "activity",
    )

    expect(assistant?.active).toBe(false)
    expect(activity).toMatchObject({
      userMessageID: steerMessageID,
      active: true,
      current: true,
    })
  })

  test("keeps one active assistant across multiple steering messages", () => {
    const assistantMessageID = "msg_assistant_before_multiple_steers"
    const rows = rowsFor(
      [
        userMessage({ id: "msg_user_before_multiple_steers" }),
        assistantMessage(assistantMessageID, [
          {
            id: "reasoning_before_multiple_steers",
            sessionID: "ses_rows",
            messageID: assistantMessageID,
            type: "reasoning",
            text: "Still streaming",
            time: { start: 1 },
          },
        ]),
        userMessage({ id: "msg_user_steer_one" }),
        userMessage({ id: "msg_user_steer_two" }),
      ],
      true,
    )

    const activeRows = rows.filter(
      (row) =>
        (row.type === "assistant" && row.itemActive) ||
        (row.type === "activity" && row.active && row.current),
    )

    expect(activeRows).toHaveLength(1)
    expect(activeRows[0]).toMatchObject({
      type: "activity",
      userMessageID: "msg_user_before_multiple_steers",
    })
  })

  test("ignores an old non-terminal assistant after a newer assistant turn supersedes it", () => {
    const staleAssistantMessageID = "msg_assistant_stale"
    const completedAssistantMessageID = "msg_assistant_newer_completed"
    const currentUserMessageID = "msg_user_after_newer_completed"
    const completedAssistant = createMessageWithParts(
      createAssistantMessageInfo({
        id: completedAssistantMessageID,
        sessionID: "ses_rows",
        finish: "stop",
      }),
      [textPart("newer-completed")],
    )
    const rows = rowsFor(
      [
        userMessage({ id: "msg_user_before_stale" }),
        assistantMessage(staleAssistantMessageID, [textPart("stale")]),
        userMessage({ id: "msg_user_before_newer_completed" }),
        completedAssistant,
        userMessage({ id: currentUserMessageID }),
      ],
      true,
    )

    const activeRows = rows.filter(
      (row) =>
        (row.type === "assistant" && row.itemActive) ||
        (row.type === "activity" && row.active && row.current),
    )

    expect(activeRows).toHaveLength(1)
    expect(activeRows[0]).toMatchObject({
      type: "activity",
      userMessageID: currentUserMessageID,
    })
  })

  test("keeps action ownership stable through the terminal transition", () => {
    const assistantMessageID = "msg_assistant_reserved_actions"
    const streaming = rowsFor(
      [userMessage(), assistantMessage(assistantMessageID, [textPart("streaming-text")])],
      true,
    )
    const settled = rowsFor(
      [userMessage(), assistantMessage(assistantMessageID, [textPart("streaming-text")])],
      false,
    )

    // Ownership is stable; the footer mounts only once enablement flips.
    expect(assistantRow(streaming)?.assistantActionPartID).toBe("streaming-text")
    expect(assistantRow(settled)?.assistantActionPartID).toBe("streaming-text")
    expect(assistantRow(streaming)?.assistantActionsEnabled).toBe(false)
    expect(assistantRow(settled)?.assistantActionsEnabled).toBe(true)
  })

  test("withholds the end-of-turn tail row until its pause is real", () => {
    const assistantMessageID = "msg_assistant_end_of_turn_tail"
    const rows = rowsFor(
      [
        userMessage(),
        assistantMessage(assistantMessageID, [
          {
            id: "finished-text",
            sessionID: "ses_rows",
            messageID: assistantMessageID,
            type: "text",
            text: "Finished answering",
            time: { start: 1, end: 2 },
          },
        ]),
      ],
      true,
    )

    expect(pendingEndOfTurnTailKey(rows)).toBe(rows.at(-1)?.key)
    expect(rows.at(-1)).toMatchObject({ type: "activity", endOfTurnDeadZone: true })

    const withheld = withRevealedEndOfTurnTail(rows, false)
    expect(withheld).toHaveLength(rows.length - 1)
    expect(withheld.at(-1)?.type).not.toBe("activity")
    expect(withRevealedEndOfTurnTail(rows, true)).toBe(rows)
  })

  test("gives each pending end-of-turn tail its own identity", () => {
    // A completed output can replace one pending tail with another without the
    // "is pending" boolean ever going false. The reveal delay is keyed on this
    // value, so the successor must not be able to inherit the predecessor's
    // elapsed time.
    const assistantMessageID = "msg_assistant_successive_tails"
    const finishedText = (id: string, text: string): MessagePart => ({
      id,
      sessionID: "ses_rows",
      messageID: assistantMessageID,
      type: "text",
      text,
      time: { start: 1, end: 2 },
    })

    const first = rowsFor(
      [userMessage(), assistantMessage(assistantMessageID, [finishedText("text-one", "One")])],
      true,
    )
    const second = rowsFor(
      [
        userMessage(),
        assistantMessage(assistantMessageID, [
          finishedText("text-one", "One"),
          finishedText("text-two", "Two"),
        ]),
      ],
      true,
    )

    const firstKey = pendingEndOfTurnTailKey(first)
    const secondKey = pendingEndOfTurnTailKey(second)

    expect(firstKey).not.toBeUndefined()
    expect(secondKey).not.toBeUndefined()
    expect(secondKey).not.toBe(firstKey)
  })

  test("never withholds the start-of-turn thinking placeholder", () => {
    const rows = rowsFor([userMessage()], true)

    // Submit acknowledgement must paint immediately; it is not a dead zone.
    expect(rows.at(-1)).toMatchObject({ type: "activity", initial: true, endOfTurnDeadZone: false })
    expect(pendingEndOfTurnTailKey(rows)).toBeUndefined()
    expect(withRevealedEndOfTurnTail(rows, false)).toBe(rows)
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

  // The bubble renders only the parts `isVisibleUserTextPart` accepts. Counting
  // the rest inflated the estimate by a line on every send — and by thirteen on
  // the first message of a session, which carries the largest synthetic context.
  test("counts only the text the user bubble renders", () => {
    const withSyntheticContext = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user", sessionID: "ses_rows" }),
      [
        {
          id: "msg_user_part",
          sessionID: "ses_rows",
          messageID: "msg_user",
          type: "text",
          text: "hi",
        },
        {
          id: "msg_user_context",
          sessionID: "ses_rows",
          messageID: "msg_user",
          type: "text",
          text: "x".repeat(840),
          synthetic: true,
        },
      ],
    )
    const userRow = rowsFor([withSyntheticContext]).find(
      (row): row is Extract<TimelineRow, { type: "user" }> => row.type === "user",
    )

    expect(userRow?.textLength).toBe(2)
    expect(userRow?.stackedContentCount).toBe(0)
  })

  test("counts metadata-backed attachment chips as one rendered stack row", () => {
    const withAttachmentChips = createMessageWithParts(
      createUserMessageInfo({ id: "msg_user", sessionID: "ses_rows" }),
      [
        {
          id: "msg_user_text",
          sessionID: "ses_rows",
          messageID: "msg_user",
          type: "text",
          text: "Summarize these",
        },
        ...["notes-a.txt", "notes-b.txt"].map((filename, index) => ({
          id: `msg_user_attachment_${index}`,
          sessionID: "ses_rows",
          messageID: "msg_user",
          type: "text" as const,
          text: "",
          metadata: {
            [BUDDY_PROMPT_PART_METADATA_KEY]: {
              type: TEXT_FILE_ATTACHMENT_PART_TYPE,
              filename,
              mime: "text/plain",
            },
          },
        })),
      ],
    )
    const userRow = rowsFor([withAttachmentChips]).find(
      (row): row is Extract<TimelineRow, { type: "user" }> => row.type === "user",
    )

    expect(userRow?.stackedContentCount).toBe(1)
  })

  // An assistant text row is appended the moment the part exists, which is
  // before its first delta arrives. Carrying the length lets the estimate say
  // "empty" instead of guessing a whole turn's worth of height.
  test("carries the rendered text length on assistant part rows", () => {
    const streaming: MessagePart = {
      id: "prt_stream",
      sessionID: "ses_rows",
      messageID: "msg_assistant",
      type: "text",
      text: "Hi there",
      time: { start: 1 },
    }
    const rows = rowsFor([userMessage(), assistantMessage("msg_assistant", [streaming])], true)
    const assistantRow = rows.find(
      (row): row is Extract<TimelineRow, { type: "assistant" }> => row.type === "assistant",
    )

    expect(assistantRow?.item.type).toBe("part")
    if (assistantRow?.item.type !== "part") throw new Error("Expected a part row")
    expect(assistantRow.item.textLength).toBe("Hi there".length)
  })
})
