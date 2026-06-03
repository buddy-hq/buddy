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
  readLatestStreamingWhiteboardRaw,
  resolveStickyProgressiveWhiteboardPreview,
  type ProgressiveWhiteboardPreview,
} from "../src/components/whiteboard/whiteboard-progressive"
import type { MessageWithParts } from "../src/state/chat-types"

function createAssistantMessage(parts: MessageWithParts["parts"]): MessageWithParts {
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
    },
    parts,
  }
}

describe("whiteboard progressive drawing", () => {
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

  test("continues the current board when boardAction requests continuation", () => {
    const raw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "delete", ids: "old-arrow" },
        { type: "rectangle", id: "new-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
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
        baseElements: [
          { type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 },
        ],
      }),
    ).toEqual([{ type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("continues the current board for historical calls without boardAction", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
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
    ])
  })

  test("replaces the current board only when boardAction requests replacement", () => {
    const raw = JSON.stringify({
      boardAction: "destructively_replace_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([{ type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("replaces the current board for historical replace_current_board transcripts", () => {
    const raw = JSON.stringify({
      boardAction: "replace_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "historical-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [{ type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 }],
      }),
    ).toEqual([
      { type: "rectangle", id: "historical-node", x: 0, y: 0, width: 120, height: 60 },
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
    const raw = JSON.stringify({
      boardAction: "destructively_replace_current_board",
      elements: JSON.stringify([
        { type: "cameraUpdate", x: 0, y: 0, width: 800, height: 600 },
        { type: "rectangle", id: "still-buffered", x: 0, y: 0, width: 120, height: 60 },
      ]),
    })

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
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardPreview({
        raw,
        baseElements: [],
      }),
    ).toEqual({
      elements: [{ type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 }],
      viewport: { x: 10, y: 20, width: 800, height: 600 },
      signature:
        '10:20:800:600|{"type":"rectangle","id":"first-node","x":0,"y":0,"width":120,"height":60}',
    })
  })

  test("applies complete streaming translate controls immediately", () => {
    const raw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "translate", ids: "node", dx: 100, dy: 50 },
      ]),
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

  test("folds completed same-turn edits into the next streaming update", () => {
    const firstElements = JSON.stringify([
      { type: "rectangle", id: "first", x: 0, y: 0, width: 120, height: 60 },
    ])
    const secondRaw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "second", x: 160, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 90, text: "wait" },
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
    ).toEqual(["previous", "first", "second"])
  })

  test("does not replay stale completed tools over the fetched current board", () => {
    const oldElements = JSON.stringify([
      { type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 },
    ])
    const streamingRaw = JSON.stringify({
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "new", x: 160, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 90, text: "wait" },
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
    ).toEqual(["learner-edit", "new"])
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
})
