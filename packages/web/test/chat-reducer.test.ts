import { describe, expect, test } from "bun:test"
import { inferBusyFromMessages, upsertMessagePart } from "../src/state/chat-reducer"
import {
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
  TOOL_STATE_RUNNING_STATUS,
} from "../src/state/chat-stream-event-buffer"
import type { MessagePart } from "../src/state/chat-types"
import { createAssistantMessageInfo, createMessageWithParts } from "./test-utils"

const SESSION_ID = "session_1"
const MESSAGE_ID = "message_1"
const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view"

function textPart(id: string, text: string): MessagePart {
  return {
    id,
    sessionID: SESSION_ID,
    messageID: MESSAGE_ID,
    type: "text",
    text,
  }
}

describe("chat reducer", () => {
  test("inserts keyed parts in server order", () => {
    const second = textPart("part_2", "world")
    const first = textPart("part_1", "hello")

    expect(upsertMessagePart(upsertMessagePart([], second), first).map((part) => part.id)).toEqual([
      "part_1",
      "part_2",
    ])
  })

  test("replaces the matching optimistic text with the server part", () => {
    const optimistic = {
      ...textPart("prt_0196_test_optimistic", "hello"),
      optimistic: true,
    }
    const server = textPart("prt_0196_test_server", "hello")

    expect(upsertMessagePart([optimistic], server).map((part) => part.id)).toEqual([
      "prt_0196_test_server",
    ])
  })

  test("replaces an optimistic v2 reference alias with its server directory-file part", () => {
    const optimistic: MessagePart = {
      id: "prt_0196_reference_optimistic",
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "opencode-reference",
      name: "docs",
      path: "/reference-cache/docs",
      optimistic: true,
    }
    const server: MessagePart = {
      id: "prt_0196_reference_server",
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "file",
      mime: "application/x-directory",
      filename: "docs",
      url: "file:///reference-cache/docs",
    }

    expect(upsertMessagePart([optimistic], server)).toEqual([server])
  })

  test("preserves distinct optimistic selection context parts", () => {
    const firstSelection: MessagePart = {
      id: "prt_0196_test_selection_a",
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: "selection-context",
      source: "markdown",
      optimistic: true,
      text: "same excerpt",
      selectionKey: "selection-a",
      path: "notes/a.md",
      version: "version-a",
    }
    const secondSelection: MessagePart = {
      ...firstSelection,
      id: "prt_0196_test_selection_b",
      selectionKey: "selection-b",
      path: "notes/b.md",
      version: "version-b",
    }
    const server: MessagePart = {
      ...textPart("prt_0196_test_selection_server", "same excerpt"),
      metadata: {
        buddyPromptPart: {
          type: "selection-context",
          source: "markdown",
          text: "same excerpt",
          selectionKey: "selection-a",
          path: "notes/a.md",
          version: "version-a",
        },
      },
    }

    expect(
      upsertMessagePart(upsertMessagePart([firstSelection], secondSelection), server).map(
        (part) => part.id,
      ),
    ).toEqual(["prt_0196_test_selection_b", "prt_0196_test_selection_server"])
  })

  test("keeps accumulated tool input when a newer active snapshot omits raw state", () => {
    const current: MessagePart = {
      id: "part_1",
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: TOOL_PART_TYPE,
      tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
      state: {
        status: TOOL_STATE_PENDING_STATUS,
        input: {},
        raw: '{"elements":[{"type":"rectangle"}',
      },
    }
    const incoming: MessagePart = {
      ...current,
      state: {
        status: TOOL_STATE_RUNNING_STATUS,
        input: {},
        time: { start: 1 },
      },
    }

    expect(upsertMessagePart([current], incoming)[0]?.state).toEqual({
      status: TOOL_STATE_RUNNING_STATUS,
      input: {},
      raw: '{"elements":[{"type":"rectangle"}',
      time: { start: 1 },
    })
  })

  test("infers busy state from the latest assistant completion", () => {
    expect(
      inferBusyFromMessages([
        createMessageWithParts(
          createAssistantMessageInfo({
            id: MESSAGE_ID,
            sessionID: SESSION_ID,
          }),
        ),
      ]),
    ).toBe(true)
    expect(
      inferBusyFromMessages([
        createMessageWithParts(
          createAssistantMessageInfo({
            id: MESSAGE_ID,
            sessionID: SESSION_ID,
            time: { created: 1, completed: 2 },
          }),
        ),
      ]),
    ).toBe(false)
  })
})
