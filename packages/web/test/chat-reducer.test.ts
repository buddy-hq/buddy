import { describe, expect, test } from "bun:test"
import {
  appendPartDelta,
  inferBusyFromMessages,
  upsertMessage,
  upsertPart,
} from "../src/state/chat-reducer"
import type { MessageWithParts } from "../src/state/chat-types"
import { createAssistantMessageInfo, createMessageWithParts } from "./test-utils"

function makeMessages(): MessageWithParts[] {
  return [
    createMessageWithParts(
      createAssistantMessageInfo({
        id: "message_1",
        sessionID: "session_1",
      }),
    ),
  ]
}

describe("chat reducer", () => {
  test("upsertMessage inserts new messages by id", () => {
    const next = upsertMessage(
      [
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "message_2",
            sessionID: "session_1",
          }),
        ),
      ],
      createAssistantMessageInfo({
        id: "message_1",
        sessionID: "session_1",
      }),
    )

    expect(next.map((message) => message.info.id)).toEqual(["message_1", "message_2"])
  })

  test("upsertPart inserts new parts by id", () => {
    const current = upsertPart(makeMessages(), {
      id: "part_2",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      text: "world",
    })
    const next = upsertPart(current, {
      id: "part_1",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      text: "hello",
    })
    expect(next[0]?.parts.map((part) => part.id)).toEqual(["part_1", "part_2"])
  })

  test("upsertPart replaces matching optimistic text with the server text part", () => {
    const current = upsertPart(makeMessages(), {
      id: "prt_0196_test_optimistic",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      optimistic: true,
      text: "hello",
    })
    const next = upsertPart(current, {
      id: "prt_0196_test_server",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      text: "hello",
    })

    expect(next[0]?.parts.map((part) => part.id)).toEqual(["prt_0196_test_server"])
  })

  test("upsertPart keeps optimistic non-text parts when a different server part arrives", () => {
    const current = upsertPart(makeMessages(), {
      id: "prt_0196_test_file_optimistic",
      sessionID: "session_1",
      messageID: "message_1",
      type: "file",
      optimistic: true,
      mime: "text/plain",
      url: "data:text/plain;base64,aGVsbG8=",
      filename: "hello.txt",
    })
    const next = upsertPart(current, {
      id: "prt_0196_test_file_server",
      sessionID: "session_1",
      messageID: "message_1",
      type: "file",
      mime: "text/plain",
      url: "data:text/plain;base64,d29ybGQ=",
      filename: "world.txt",
    })

    expect(next[0]?.parts.map((part) => part.id)).toEqual([
      "prt_0196_test_file_optimistic",
      "prt_0196_test_file_server",
    ])
  })

  test("appendPartDelta appends delta to string fields", () => {
    const withPart = upsertPart(makeMessages(), {
      id: "part_1",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      text: "hello",
    })
    const next = appendPartDelta(withPart, {
      messageID: "message_1",
      partID: "part_1",
      field: "text",
      delta: " world",
    })
    const textPart = next[0]?.parts[0]
    expect(textPart?.type).toBe("text")
    if (textPart?.type === "text") {
      expect(textPart.text).toBe("hello world")
    }
  })

  test("appendPartDelta appends nested pending tool raw input", () => {
    const withPart = upsertPart(makeMessages(), {
      id: "part_1",
      sessionID: "session_1",
      messageID: "message_1",
      type: "tool",
      tool: "whiteboard_create_view",
      state: {
        status: "pending",
        raw: '{"elements":"[',
      },
    })
    const next = appendPartDelta(withPart, {
      messageID: "message_1",
      partID: "part_1",
      field: "state.raw",
      delta: '{\\"type\\":\\"rectangle\\"}',
    })
    expect(next[0]?.parts[0]?.state).toEqual({
      status: "pending",
      raw: '{"elements":"[{\\"type\\":\\"rectangle\\"}',
    })
  })

  test("inferBusyFromMessages checks assistant finish state", () => {
    expect(
      inferBusyFromMessages([
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "message_1",
            sessionID: "session_1",
          }),
        ),
      ]),
    ).toBe(true)

    expect(
      inferBusyFromMessages([
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "message_1",
            sessionID: "session_1",
            finish: "stop",
          }),
        ),
      ]),
    ).toBe(false)
  })
})
