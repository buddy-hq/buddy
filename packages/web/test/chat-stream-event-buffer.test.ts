import { describe, expect, test } from "bun:test"
import {
  bufferChatStreamEvents,
  createChatStreamEventBuffer,
  MESSAGE_PART_DELTA_EVENT_TYPE,
  MESSAGE_PART_UPDATED_EVENT_TYPE,
  STREAMING_PART_RAW_FIELD,
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
} from "../src/state/chat-stream-event-buffer"
import type { TJsonObject } from "../src/components/chat/tools/types"
import type { GlobalEvent } from "../src/state/chat-types"
import { parseBuddyConfigObject } from "./parse-test-values"

const DIRECTORY = "/repo"
const SESSION_ID = "session_1"
const MESSAGE_ID = "message_1"
const PART_ID = "part_1"
const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view"

function messagePartUpdated(part: TJsonObject): GlobalEvent {
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

function eventProperties(event: GlobalEvent | undefined) {
  const payload = event?.payload
  return payload && "properties" in payload ? payload.properties : undefined
}

function eventPart(event: GlobalEvent | undefined) {
  const part = eventProperties(event)?.part
  return parseBuddyConfigObject(part)
}

function eventPartState(event: GlobalEvent | undefined) {
  return parseBuddyConfigObject(eventPart(event)?.state)
}

describe("chat stream event buffer", () => {
  test("compacts superseded text deltas into the latest full part snapshot", () => {
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

  test("drops leading text deltas superseded by a later snapshot", () => {
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

  test("coalesces adjacent compatible text deltas", () => {
    const events = bufferChatStreamEvents([
      messagePartDelta({
        field: "text",
        delta: "hel",
      }),
      messagePartDelta({
        field: "text",
        delta: "lo",
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_DELTA_EVENT_TYPE])
    expect(eventProperties(events[0])?.delta).toBe("hello")
  })

  test("coalesces adjacent compatible full part snapshots", () => {
    const events = bufferChatStreamEvents([
      messagePartUpdated({
        type: "text",
        text: "hel",
      }),
      messagePartUpdated({
        type: "text",
        text: "hello",
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([MESSAGE_PART_UPDATED_EVENT_TYPE])
    expect(eventPart(events[0])?.text).toBe("hello")
  })

  test("does not coalesce across ordering barriers", () => {
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
          status: TOOL_STATE_PENDING_STATUS,
          input: {},
          time: { start: 1 },
        },
      }),
    ])

    expect(events.map((event) => event.payload.type)).toEqual([
      MESSAGE_PART_UPDATED_EVENT_TYPE,
      MESSAGE_PART_DELTA_EVENT_TYPE,
      MESSAGE_PART_UPDATED_EVENT_TYPE,
    ])
    expect(eventPartState(events[0])?.raw).toBe('{"elements":"[')
    expect(eventProperties(events[1])?.delta).toBe('{\\"type\\":\\"rectangle\\"}')
    expect(eventPartState(events[2])?.raw).toBeUndefined()
  })

  test("clears queued events without emitting them", () => {
    const buffer = createChatStreamEventBuffer()
    buffer.enqueue(
      messagePartUpdated({
        type: "text",
        text: "stale",
      }),
    )

    expect(buffer.size()).toBe(1)
    expect(buffer.clear()).toBe(1)
    expect(buffer.size()).toBe(0)
    expect(buffer.drain()).toEqual([])
  })

  test("discards matching events while preserving unrelated queued events", () => {
    const buffer = createChatStreamEventBuffer()
    const targetEvent = messagePartUpdated({
      type: "text",
      text: "stale target",
    })
    const unrelatedEvent: GlobalEvent = {
      directory: DIRECTORY,
      payload: {
        type: "workspace.file.updated",
        properties: { path: "notes.md" },
      },
    }
    buffer.enqueue(targetEvent)
    buffer.enqueue(unrelatedEvent)

    expect(buffer.discardWhere((event) => event === targetEvent)).toBe(1)
    expect(buffer.size()).toBe(1)
    expect(buffer.drain()).toEqual([unrelatedEvent])
  })
})
