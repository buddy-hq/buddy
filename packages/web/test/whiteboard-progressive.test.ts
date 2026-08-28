import { describe, expect, test } from "bun:test"
import {
  buildProgressiveWhiteboardElements,
  buildProgressiveWhiteboardPreview,
  buildProgressiveWhiteboardPreviewFromMessages,
  countCompletedWhiteboardCreate,
  decodePartialElementsArgument,
  hasActiveWhiteboardCreate,
  hasLatestFailedWhiteboardCreate,
  hasUnfetchedCompletedWhiteboardCreate,
  hasWhiteboardCreate,
  parsePartialElements,
  readLatestActiveWhiteboardCreate,
  readLatestActiveWhiteboardCreateKey,
  readLatestStreamingWhiteboardRaw,
  resolveStickyProgressiveWhiteboardPreview,
  type ProgressiveWhiteboardPreview,
} from "../src/components/whiteboard/whiteboard-progressive"
import type { AssistantMessageInfo, MessageWithParts } from "../src/state/chat-types"

function createAssistantMessage(
  parts: MessageWithParts["parts"],
  info: Partial<AssistantMessageInfo> = {},
): MessageWithParts {
  return {
    info: {
      id: "message-1",
      sessionID: "session-1",
      role: "assistant",
      parentID: "message-0",
      time: { created: 1 },
      mode: "buddy",
      agent: "buddy",
      modelID: "model-1",
      providerID: "provider-1",
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      ...info,
    },
    parts,
  }
}

describe("whiteboard progressive drawing", () => {
  test("exposes an active whiteboard before its object reference streams", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          callID: "call-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "pending",
            input: {},
            raw: '{"elements":"[',
            metadata: { objectID: "reserved-object" },
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(readLatestActiveWhiteboardCreate(messages)).toEqual({
      toolKey: "message-1:part-1",
      sessionID: "session-1",
      phase: "authorized",
      requestKind: "unknown",
      objectID: "reserved-object",
    })
  })

  test("keeps an unapproved new-board stream transient", () => {
    const raw = JSON.stringify({
      objectAction: "create",
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "streamed", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          callID: "call-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "running",
            input: { objectAction: "create" },
            raw,
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(readLatestActiveWhiteboardCreate(messages)).toEqual({
      toolKey: "message-1:part-1",
      sessionID: "session-1",
      phase: "awaiting-permission",
      requestKind: "new",
    })
    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        baseElements: [],
      })?.elements.map((element) => element.id),
    ).toEqual(["streamed"])
    expect(hasActiveWhiteboardCreate(messages)).toBeTrue()
    expect(hasActiveWhiteboardCreate(messages, "reserved-object")).toBeFalse()
  })

  test("distinguishes an existing-board update from a new-board preview", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          callID: "call-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "running",
            input: { objectID: "existing-object" },
            raw: '{"objectID":"existing-object"}',
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(readLatestActiveWhiteboardCreate(messages)).toEqual({
      toolKey: "message-1:part-1",
      sessionID: "session-1",
      phase: "awaiting-permission",
      requestKind: "existing",
    })
  })

  test("keeps an authorized existing-board update out of the new-board preview", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          callID: "call-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "running",
            input: { objectID: "existing-object" },
            raw: '{"objectID":"existing-object"}',
            metadata: { objectID: "existing-object" },
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(readLatestActiveWhiteboardCreate(messages)).toEqual({
      toolKey: "message-1:part-1",
      sessionID: "session-1",
      phase: "authorized",
      requestKind: "existing",
      objectID: "existing-object",
    })
  })

  test("composes an existing-board stream over the fetched board", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          callID: "call-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "running",
            input: { objectID: "existing-object" },
            raw: JSON.stringify({
              objectID: "existing-object",
              boardAction: "continue_current_board",
              elements: JSON.stringify([{ type: "rectangle", id: "streamed-node", x: 160, y: 0 }]),
            }),
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        objectID: "existing-object",
        baseElements: [{ type: "rectangle", id: "persisted-node", x: 0, y: 0 }],
      })?.elements.map((element) => element.id),
    ).toEqual(["persisted-node", "streamed-node"])
  })

  test("exposes the object only after authorized metadata arrives", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          callID: "call-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "running",
            input: { objectID: null },
            raw: '{"objectID":null}',
            metadata: { objectID: "authorized-object" },
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(readLatestActiveWhiteboardCreate(messages)).toEqual({
      toolKey: "message-1:part-1",
      sessionID: "session-1",
      phase: "authorized",
      requestKind: "new",
      objectID: "authorized-object",
    })
  })

  test("decodes escaped elements from partial outer tool arguments", () => {
    const raw =
      '{"elements":"[{\\"type\\":\\"text\\",\\"id\\":\\"label\\",\\"x\\":0,\\"y\\":0,\\"text\\":\\"phase \\\\u2192 change\\"}'
    expect(decodePartialElementsArgument(raw)).toBe(
      '[{"type":"text","id":"label","x":0,"y":0,"text":"phase \\u2192 change"}',
    )
  })

  test("parses complete inner objects from an incomplete array", () => {
    expect(
      parsePartialElements('[{"type":"cameraUpdate"},{"type":"rectangle","id":"node"}'),
    ).toEqual([{ type: "cameraUpdate" }, { type: "rectangle", id: "node" }])
  })

  test("renders the first complete streamed element without waiting for another delta", () => {
    const raw = JSON.stringify({
      boardAction: "destructively_replace_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [],
      }),
    ).toEqual([{ type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("continues the current board when boardAction requests continuation", () => {
    const raw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "delete", ids: "old-arrow" },
        { type: "rectangle", id: "new-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
      ]),
    })
    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [
          { type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 },
          { type: "arrow", id: "old-arrow", x: 120, y: 30, width: 100, height: 0 },
        ],
      }),
    ).toEqual([
      { type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 },
      { type: "rectangle", id: "new-node", x: 0, y: 0, width: 120, height: 60 },
      { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
    ])
  })

  test("does not preview invalid legacy continuation handles as current-board edits", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "stale-scene" },
        { type: "translate", ids: "existing", dx: 100, dy: 0 },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([{ type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("continues the current board when boardAction is absent", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([
      { type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 },
      { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
      { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
    ])
  })

  test("replaces the current board only when boardAction requests replacement", () => {
    const raw = JSON.stringify({
      boardAction: "destructively_replace_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([
      { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
      { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
    ])
  })

  test("supports replace_current_board transcripts", () => {
    const raw = JSON.stringify({
      boardAction: "replace_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "historical-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([
      { type: "rectangle", id: "historical-node", x: 0, y: 0, width: 120, height: 60 },
      { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
    ])
  })

  test("keeps the current board for conflicting boardAction and legacy controls", () => {
    const raw = JSON.stringify({
      boardAction: "destructively_replace_current_board",
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "current" },
        { type: "rectangle", id: "replacement", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("does not replace a visible board with an empty partial explicit replacement preview", () => {
    const raw =
      '{"boardAction":"destructively_replace_current_board","elements":"[{\\"type\\":\\"cameraUpdate\\",\\"x\\":0,\\"y\\":0,\\"width\\":800,\\"height\\":600},{\\"type\\":\\"rectangle\\",\\"id\\":\\"incomplete\\"'

    expect(
      buildProgressiveWhiteboardPreview({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toBeUndefined()
  })

  test("keeps camera updates in the progressive preview signature", () => {
    const raw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "cameraUpdate", x: 10, y: 20, width: 800, height: 600 },
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardPreview({
        raw,
        baseElements: [],
      }),
    ).toEqual({
      elements: [
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 80, text: "ready" },
      ],
      viewport: { x: 10, y: 20, width: 800, height: 600 },
      signature:
        '10:20:800:600|{"type":"rectangle","id":"first-node","x":0,"y":0,"width":120,"height":60}|{"type":"text","id":"final-label","x":0,"y":80,"text":"ready"}',
    })
  })

  test("applies complete streaming translate controls immediately", () => {
    const raw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([{ type: "translate", ids: "node", dx: 100, dy: 50 }]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [
          {
            type: "rectangle",
            id: "node",
            x: 0,
            y: 0,
            width: 120,
            height: 80,
            label: { text: "Node" },
          },
          {
            type: "text",
            id: "node-bound-text",
            containerId: "node",
            x: 20,
            y: 20,
            text: "Node",
          },
        ],
      }),
    ).toEqual([
      {
        type: "rectangle",
        id: "node",
        x: 100,
        y: 50,
        width: 120,
        height: 80,
        label: { text: "Node" },
      },
      {
        type: "text",
        id: "node-bound-text",
        containerId: "node",
        x: 120,
        y: 70,
        text: "Node",
      },
    ])
  })

  test("ignores stale active whiteboard tools after the assistant turn has already ended", () => {
    const messages = [
      createAssistantMessage(
        [
          {
            id: "part-1",
            sessionID: "session-1",
            messageID: "message-1",
            type: "tool",
            tool: "whiteboard_create_view",
            state: {
              status: "running",
              raw: '{"elements":"["}',
            },
          },
        ],
        {
          finish: "aborted",
          time: { created: 1, completed: 2 },
        },
      ),
    ]

    expect(hasActiveWhiteboardCreate(messages)).toBe(false)
    expect(readLatestActiveWhiteboardCreateKey(messages)).toBeUndefined()
    expect(readLatestStreamingWhiteboardRaw(messages)).toBeUndefined()
  })

  test("folds completed same-turn edits into the next streaming update", () => {
    const firstElements = JSON.stringify([
      { type: "rectangle", id: "first", x: 0, y: 0, width: 120, height: 60 },
    ])
    const secondRaw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "second", x: 160, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 90, text: "ready" },
      ]),
    })

    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "completed",
            input: { boardAction: "continue_current_board", elements: firstElements },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              boardID: "01J00000000000000000000001",
            },
          },
        },
        {
          id: "part-2",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: { status: "running", input: {}, raw: secondRaw },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        baseBoardID: "01H00000000000000000000000",
        baseElements: [{ type: "rectangle", id: "previous", x: 0, y: 0, width: 120, height: 60 }],
      })?.elements.map((element) => element.id),
    ).toEqual(["previous", "first", "second", "final-label"])
  })

  test("does not replay stale completed tools over the fetched current board", () => {
    const oldElements = JSON.stringify([
      { type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 },
    ])
    const streamingRaw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "new", x: 160, y: 0, width: 120, height: 60 },
        { type: "text", id: "final-label", x: 0, y: 90, text: "ready" },
      ]),
    })

    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "completed",
            input: { boardAction: "continue_current_board", elements: oldElements },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              boardID: "01H00000000000000000000001",
            },
          },
        },
        {
          id: "part-2",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: { status: "running", input: {}, raw: streamingRaw },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        baseBoardID: "01H00000000000000000000002",
        baseElements: [
          { type: "rectangle", id: "learner-edit", x: 0, y: 0, width: 120, height: 60 },
        ],
      })?.elements.map((element) => element.id),
    ).toEqual(["learner-edit", "new", "final-label"])
  })

  test("tracks completed whiteboard writes that are not fetched yet", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "completed",
            input: { elements: "[]" },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              boardID: "01J00000000000000000000001",
            },
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        baseBoardID: "01H00000000000000000000000",
      }),
    ).toBeTrue()
    expect(
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        baseBoardID: "01J00000000000000000000001",
      }),
    ).toBeFalse()
    expect(hasUnfetchedCompletedWhiteboardCreate({ messages })).toBeTrue()
  })

  test("clears sticky progressive previews after stopped streams without durable writes", () => {
    const current: ProgressiveWhiteboardPreview = {
      elements: [{ type: "rectangle", id: "ghost", x: 0, y: 0, width: 120, height: 60 }],
      signature: "ghost:rectangle:0:0:120:60:",
    }
    const computed: ProgressiveWhiteboardPreview = {
      elements: [{ type: "rectangle", id: "next", x: 0, y: 0, width: 120, height: 60 }],
      signature: "next:rectangle:0:0:120:60:",
    }

    expect(
      resolveStickyProgressiveWhiteboardPreview({
        current,
        computed: undefined,
        retainWithoutComputed: false,
      }),
    ).toBeUndefined()
    expect(
      resolveStickyProgressiveWhiteboardPreview({
        current,
        computed: undefined,
        retainWithoutComputed: true,
      }),
    ).toBe(current)
    expect(
      resolveStickyProgressiveWhiteboardPreview({
        current,
        computed,
        retainWithoutComputed: false,
      }),
    ).toBe(computed)
  })

  test("detects active create-view tools and latest streaming raw input", () => {
    const messages = [
      createAssistantMessage([
        {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: { status: "pending", input: {}, raw: "" },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(hasActiveWhiteboardCreate(messages)).toBeTrue()
    expect(hasWhiteboardCreate(messages)).toBeTrue()
    expect(countCompletedWhiteboardCreate(messages)).toBe(0)
    expect(readLatestStreamingWhiteboardRaw(messages)).toBe("")
    expect(
      hasActiveWhiteboardCreate([
        createAssistantMessage([
          {
            ...messages[0].parts[0],
            state: {
              status: "completed",
              input: {},
              output: "",
              title: "",
              time: { start: 1, end: 2 },
            },
          },
        ]),
      ]),
    ).toBeFalse()
  })

  test("detects when the latest whiteboard attempt failed", () => {
    const failed = {
      id: "part-failed",
      sessionID: "session-1",
      messageID: "message-1",
      type: "tool",
      tool: "whiteboard_create_view",
      state: {
        status: "error",
        input: {},
        error: "Invalid JSON",
        time: { start: 1, end: 2 },
      },
    } satisfies MessageWithParts["parts"][number]
    const pending = {
      ...failed,
      id: "part-pending",
      state: { status: "pending", input: {}, raw: "" },
    } satisfies MessageWithParts["parts"][number]

    expect(hasLatestFailedWhiteboardCreate([createAssistantMessage([failed])])).toBeTrue()
    expect(hasLatestFailedWhiteboardCreate([createAssistantMessage([failed, pending])])).toBeFalse()
  })

  test("isolates progressive state and activity by whiteboard object id", () => {
    const boardAElements = JSON.stringify([{ type: "text", id: "board-a", text: "A" }])
    const boardBRaw = JSON.stringify({
      objectID: "board-b",
      boardAction: "continue_current_board",
      elements: JSON.stringify([{ type: "text", id: "board-b", text: "B" }]),
    })
    const messages = [
      createAssistantMessage([
        {
          id: "part-a",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "completed",
            input: {
              objectID: "board-a",
              boardAction: "continue_current_board",
              elements: boardAElements,
            },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: { objectID: "board-a", boardID: "01J00000000000000000000001" },
          },
        },
        {
          id: "part-b",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: { status: "running", input: {}, raw: boardBRaw },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        objectID: "board-a",
        baseElements: [],
      })?.elements.map((element) => element.id),
    ).toEqual(["board-a"])
    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        toolKey: "message-1:part-b",
        baseElements: [],
      })?.elements.map((element) => element.id),
    ).toEqual(["board-b"])
    expect(hasActiveWhiteboardCreate(messages, "board-a")).toBeFalse()
    expect(hasActiveWhiteboardCreate(messages, "board-b")).toBeTrue()
    expect(countCompletedWhiteboardCreate(messages, "board-a")).toBe(1)
    expect(countCompletedWhiteboardCreate(messages, "board-b")).toBe(0)
    expect(readLatestActiveWhiteboardCreate(messages)).toEqual({
      toolKey: "message-1:part-b",
      sessionID: "session-1",
      phase: "awaiting-permission",
      requestKind: "existing",
    })
  })
})
