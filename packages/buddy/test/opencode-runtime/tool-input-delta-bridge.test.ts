import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, PartID, SessionID } from "@buddy/opencode-adapter/id"
import {
  maxPendingWhiteboardToolPartsForTest,
  pendingWhiteboardToolPartCountForTest,
  resetPendingWhiteboardToolPartsForTest,
  toPendingWhiteboardToolPartDelta,
  trackPendingWhiteboardToolPart,
} from "@buddy/opencode-adapter/tool-input-delta-live"
import type { MessageV2 } from "@buddy/opencode-adapter/message"

const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view" as const

afterEach(() => {
  resetPendingWhiteboardToolPartsForTest()
})

function pendingWhiteboardToolPart(): MessageV2.ToolPart {
  return {
    id: PartID.ascending(),
    sessionID: SessionID.make("ses_whiteboard_delta"),
    messageID: MessageID.ascending(),
    type: "tool",
    tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
    callID: "call_whiteboard_delta",
    state: {
      status: "pending",
      input: {},
      raw: "",
    },
  }
}

describe("whiteboard tool-input delta bridge", () => {
  test("translates the upstream normalized whiteboard delta into the pending nested raw field", () => {
    const part = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(part)

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: '{"elements":"[',
        },
      }),
    ).toEqual({
      sessionID: part.sessionID,
      messageID: part.messageID,
      partID: part.id,
      field: "state.raw",
      delta: '{"elements":"[',
    })
  })

  test("ignores other tools and stops forwarding after the whiteboard tool leaves pending state", () => {
    const part = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(part)

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: "render_mermaid",
          text: "ignored",
        },
      }),
    ).toBeUndefined()

    trackPendingWhiteboardToolPart({
      ...part,
      state: {
        status: "running",
        input: {},
        time: { start: Date.now() },
      },
    })

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: "ignored",
        },
      }),
    ).toBeUndefined()
  })

  test("ignores malformed upstream events", () => {
    const part = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(part)

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
        },
      }),
    ).toBeUndefined()
  })

  test("does not evict pending whiteboard deltas from other sessions", () => {
    const retainedPart = pendingWhiteboardToolPart()
    trackPendingWhiteboardToolPart(retainedPart)

    for (let index = 0; index < 257; index += 1) {
      trackPendingWhiteboardToolPart({
        ...pendingWhiteboardToolPart(),
        id: PartID.ascending(),
        sessionID: SessionID.make("ses_other_whiteboard_delta"),
        callID: `call_other_whiteboard_delta_${index}`,
      })
    }

    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: retainedPart.sessionID,
        event: {
          type: "tool-input-delta",
          id: retainedPart.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: '{"elements":"[',
        },
      }),
    ).toEqual({
      sessionID: retainedPart.sessionID,
      messageID: retainedPart.messageID,
      partID: retainedPart.id,
      field: "state.raw",
      delta: '{"elements":"[',
    })
  })

  test("keeps a total bound for pending whiteboard deltas across idle sessions", () => {
    const maxPendingParts = maxPendingWhiteboardToolPartsForTest()
    let latestPart = pendingWhiteboardToolPart()

    for (let index = 0; index <= maxPendingParts; index += 1) {
      latestPart = {
        ...pendingWhiteboardToolPart(),
        id: PartID.ascending(),
        sessionID: SessionID.make(`ses_global_whiteboard_delta_${index}`),
        callID: `call_global_whiteboard_delta_${index}`,
      }
      trackPendingWhiteboardToolPart(latestPart)
    }

    expect(pendingWhiteboardToolPartCountForTest()).toBe(maxPendingParts)
    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: SessionID.make("ses_global_whiteboard_delta_0"),
        event: {
          type: "tool-input-delta",
          id: "call_global_whiteboard_delta_0",
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: "evicted",
        },
      }),
    ).toBeUndefined()
    expect(
      toPendingWhiteboardToolPartDelta({
        sessionID: latestPart.sessionID,
        event: {
          type: "tool-input-delta",
          id: latestPart.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: '{"elements":"[',
        },
      }),
    ).toEqual({
      sessionID: latestPart.sessionID,
      messageID: latestPart.messageID,
      partID: latestPart.id,
      field: "state.raw",
      delta: '{"elements":"[',
    })
  })
})
