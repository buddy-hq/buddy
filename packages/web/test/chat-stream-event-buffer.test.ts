import { describe, expect, test } from "bun:test"
import {
  bufferChatStreamEvents,
  MESSAGE_PART_DELTA_EVENT_TYPE,
  MESSAGE_PART_UPDATED_EVENT_TYPE,
  STREAMING_PART_RAW_FIELD,
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
  TOOL_STATE_RUNNING_STATUS,
} from "../src/state/chat-stream-event-buffer"
import type { GlobalEvent } from "../src/state/chat-types"

const DIRECTORY = "/repo"
const SESSION_ID = "session_1"
const MESSAGE_ID = "message_1"
const PART_ID = "part_1"
const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view"

function messagePartUpdated(part: Record<string, unknown>): GlobalEvent {
  return {
    directory: DIRECTORY,
    payload: {
      type: MESSAGE_PART_UPDATED_EVENT_TYPE,
      properties: {
        part: {
          id: PART_ID,
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          ...part,
        },
      },
    },
  }
}

function messagePartDelta(input: { field: string; delta: string }): GlobalEvent {
  return {
    directory: DIRECTORY,
    payload: {
      type: MESSAGE_PART_DELTA_EVENT_TYPE,
      properties: {
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        partID: PART_ID,
        field: input.field,
        delta: input.delta,
      },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function eventProperties(event: GlobalEvent | undefined) {
  const payload = event?.payload
  return payload && "properties" in payload ? payload.properties : undefined
}

function eventPart(event: GlobalEvent | undefined) {
  const part = eventProperties(event)?.part
  return isRecord(part) ? part : undefined
}

function eventPartState(event: GlobalEvent | undefined) {
  const state = eventPart(event)?.state
  return isRecord(state) ? state : undefined
}

describe("chat stream event buffer", () => {
  test("drops stale text deltas when a later full part update is in the same frame", () => {
    const events = bufferChatStreamEvents([
      messagePartUpdated({
        type: "text",
        text: "hel",
      }),
      messagePartDelta({
        field: "text",
        delta: "lo",
      }),
      messagePartUpdated({
        type: "text",
        text: "hello",
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_UPDATED_EVENT_TYPE])
    expect(eventPart(events[0])?.text).toBe("hello")
  })

  test("drops stale text deltas even when the earlier part snapshot already flushed", () => {
    const events = bufferChatStreamEvents([
      messagePartDelta({
        field: "text",
        delta: " world",
      }),
      messagePartUpdated({
        type: "text",
        text: "hello world",
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_UPDATED_EVENT_TYPE])
    expect(eventPart(events[0])?.text).toBe("hello world")
  })

  test("merges raw tool deltas into a later active tool snapshot when the raw base is known", () => {
    const events = bufferChatStreamEvents([
      messagePartUpdated({
        type: TOOL_PART_TYPE,
        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        state: {
          status: TOOL_STATE_PENDING_STATUS,
          input: {},
          raw: '{"elements":"[',
        },
      }),
      messagePartDelta({
        field: STREAMING_PART_RAW_FIELD,
        delta: '{\\"type\\":\\"rectangle\\"}',
      }),
      messagePartUpdated({
        type: TOOL_PART_TYPE,
        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        state: {
          status: TOOL_STATE_RUNNING_STATUS,
          input: {},
          time: { start: 1 },
        },
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_UPDATED_EVENT_TYPE])
    expect(eventPartState(events[0])?.raw).toBe(
      '{"elements":"[{\\"type\\":\\"rectangle\\"}',
    )
  })

  test("does not duplicate raw deltas already present in a later snapshot", () => {
    const events = bufferChatStreamEvents([
      messagePartUpdated({
        type: TOOL_PART_TYPE,
        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        state: {
          status: TOOL_STATE_PENDING_STATUS,
          input: {},
          raw: "",
        },
      }),
      messagePartDelta({
        field: STREAMING_PART_RAW_FIELD,
        delta: "abc",
      }),
      messagePartUpdated({
        type: TOOL_PART_TYPE,
        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        state: {
          status: TOOL_STATE_PENDING_STATUS,
          input: {},
          raw: "abc",
        },
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_UPDATED_EVENT_TYPE])
    expect(eventPartState(events[0])?.raw).toBe("abc")
  })

  test("keeps raw deltas when a later update cannot safely absorb them", () => {
    const events = bufferChatStreamEvents([
      messagePartDelta({
        field: STREAMING_PART_RAW_FIELD,
        delta: "next",
      }),
      messagePartUpdated({
        type: TOOL_PART_TYPE,
        tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        state: {
          status: TOOL_STATE_RUNNING_STATUS,
          input: {},
          time: { start: 1 },
        },
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([
      MESSAGE_PART_DELTA_EVENT_TYPE,
      MESSAGE_PART_UPDATED_EVENT_TYPE,
    ])
  })
})
