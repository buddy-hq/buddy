import { afterEach, describe, expect, test } from "bun:test"
import { jsonSchema, streamText, tool } from "ai"
import type { LanguageModel } from "ai"
import { MessageID, PartID, SessionID } from "../src/id"
import type { MessageV2 } from "../src/message"
import {
  consumeCallbackDeltaReceiptForTest,
  resetPendingWhiteboardToolPartsForTest,
  takeQueuedCallbackPartDeltasForTest,
  trackPendingWhiteboardToolPart,
  withWhiteboardToolInputDeltaForwarding,
} from "../src/tool-input-delta-live"

const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view" as const
const TEST_TOOL_CALL_ID = "call_whiteboard_callback_delta"
const TEST_USAGE = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 2,
    text: 0,
    reasoning: 0,
  },
}

function streamingToolInputModel(inputDeltas: string[]): Exclude<LanguageModel, string> {
  return {
    specificationVersion: "v3",
    provider: "whiteboard-delta-test",
    modelId: "whiteboard-delta-test",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("This test model only supports streaming")
    },
    async doStream() {
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "stream-start",
              warnings: [],
            })
            controller.enqueue({
              type: "tool-input-start",
              id: TEST_TOOL_CALL_ID,
              toolName: WHITEBOARD_CREATE_VIEW_TOOL_ID,
            })
            for (const delta of inputDeltas) {
              controller.enqueue({
                type: "tool-input-delta",
                id: TEST_TOOL_CALL_ID,
                delta,
              })
            }
            controller.enqueue({
              type: "tool-input-end",
              id: TEST_TOOL_CALL_ID,
            })
            controller.enqueue({
              type: "finish",
              finishReason: {
                unified: "tool-calls",
                raw: "tool-calls",
              },
              usage: TEST_USAGE,
            })
            controller.close()
          },
        }),
      }
    },
  }
}

function pendingWhiteboardToolPart(): MessageV2.ToolPart {
  return {
    id: PartID.ascending(),
    sessionID: SessionID.make("ses_whiteboard_callback_delta"),
    messageID: MessageID.ascending(),
    type: "tool",
    tool: WHITEBOARD_CREATE_VIEW_TOOL_ID,
    callID: TEST_TOOL_CALL_ID,
    state: {
      status: "pending",
      input: {},
      raw: "",
    },
  }
}

afterEach(() => {
  resetPendingWhiteboardToolPartsForTest()
})

describe("whiteboard AI SDK input delta forwarding", () => {
  test("forwards the earliest tool callback and deduplicates its normalized stream event", async () => {
    const part = pendingWhiteboardToolPart()
    const forwarded: unknown[] = []
    const originalCallbackDeltas: string[] = []
    const raw = '{"boardAction":"continue_current_board","elements":"['
    trackPendingWhiteboardToolPart(part)

    const tools = withWhiteboardToolInputDeltaForwarding({
      sessionID: part.sessionID,
      tools: {
        [WHITEBOARD_CREATE_VIEW_TOOL_ID]: tool({
          description: "Whiteboard test tool",
          inputSchema: jsonSchema({
            type: "object",
            properties: {},
          }),
          onInputDelta(options) {
            originalCallbackDeltas.push(options.inputTextDelta)
          },
        }),
      },
      async forwardPartDelta(delta) {
        forwarded.push(delta)
      },
    })

    await tools[WHITEBOARD_CREATE_VIEW_TOOL_ID]?.onInputDelta?.({
      abortSignal: new AbortController().signal,
      inputTextDelta: raw,
      messages: [],
      toolCallId: part.callID,
    })

    expect(originalCallbackDeltas).toEqual([raw])
    expect(forwarded).toEqual([
      {
        sessionID: part.sessionID,
        messageID: part.messageID,
        partID: part.id,
        field: "state.raw",
        delta: raw,
      },
    ])
    expect(
      consumeCallbackDeltaReceiptForTest({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: raw,
        },
      }),
    ).toBe(true)
    expect(
      consumeCallbackDeltaReceiptForTest({
        sessionID: part.sessionID,
        event: {
          type: "tool-input-delta",
          id: part.callID,
          name: WHITEBOARD_CREATE_VIEW_TOOL_ID,
          text: raw,
        },
      }),
    ).toBe(false)
  })

  test("queues callback deltas until the pending tool part is available", async () => {
    const part = pendingWhiteboardToolPart()
    const forwarded: unknown[] = []
    const raw = '{"boardAction":"continue_current_board","elements":['
    const tools = withWhiteboardToolInputDeltaForwarding({
      sessionID: part.sessionID,
      tools: {
        [WHITEBOARD_CREATE_VIEW_TOOL_ID]: tool({
          description: "Whiteboard test tool",
          inputSchema: jsonSchema({
            type: "object",
            properties: {},
          }),
        }),
      },
      async forwardPartDelta(delta) {
        forwarded.push(delta)
      },
    })

    await tools[WHITEBOARD_CREATE_VIEW_TOOL_ID]?.onInputDelta?.({
      abortSignal: new AbortController().signal,
      inputTextDelta: raw,
      messages: [],
      toolCallId: part.callID,
    })

    expect(forwarded).toEqual([])

    trackPendingWhiteboardToolPart(part)
    expect(takeQueuedCallbackPartDeltasForTest(part)).toEqual([
      {
        sessionID: part.sessionID,
        messageID: part.messageID,
        partID: part.id,
        field: "state.raw",
        delta: raw,
      },
    ])
    expect(takeQueuedCallbackPartDeltasForTest(part)).toEqual([])
  })

  test("forwards each callback before AI SDK exposes the corresponding full-stream event", async () => {
    const part = pendingWhiteboardToolPart()
    const inputDeltas = [
      '{"boardAction":"continue_current_board","elements":"[',
      '{\\"type\\":\\"rectangle\\",\\"id\\":\\"first\\"}',
    ]
    const forwarded: unknown[] = []
    trackPendingWhiteboardToolPart(part)

    const tools = withWhiteboardToolInputDeltaForwarding({
      sessionID: part.sessionID,
      tools: {
        [WHITEBOARD_CREATE_VIEW_TOOL_ID]: tool({
          description: "Whiteboard test tool",
          inputSchema: jsonSchema({
            type: "object",
            properties: {},
          }),
        }),
      },
      async forwardPartDelta(delta) {
        forwarded.push(delta)
      },
    })
    const result = streamText({
      model: streamingToolInputModel(inputDeltas),
      messages: [{ role: "user", content: "Draw the first rectangle" }],
      tools,
    })

    const normalizedDeltas: string[] = []
    for await (const event of result.fullStream) {
      if (event.type !== "tool-input-delta") continue
      normalizedDeltas.push(event.delta)
      expect(forwarded.slice(0, normalizedDeltas.length)).toEqual(
        normalizedDeltas.map((delta) => ({
          sessionID: part.sessionID,
          messageID: part.messageID,
          partID: part.id,
          field: "state.raw",
          delta,
        })),
      )
    }

    expect(normalizedDeltas).toEqual(inputDeltas)
    expect(forwarded).toEqual(
      inputDeltas.map((delta) => ({
        sessionID: part.sessionID,
        messageID: part.messageID,
        partID: part.id,
        field: "state.raw",
        delta,
      })),
    )
  })
})
