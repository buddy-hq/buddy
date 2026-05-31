import { describe, expect, test } from "bun:test"
import {
  buildProgressiveWhiteboardElements,
  buildProgressiveWhiteboardPreview,
  buildProgressiveWhiteboardPreviewFromMessages,
  countCompletedWhiteboardCreate,
  decodePartialElementsArgument,
  hasActiveWhiteboardCreate,
  hasUnfetchedCompletedWhiteboardCreate,
  hasWhiteboardCreate,
  parsePartialElements,
  readLatestStreamingWhiteboardRestoreSceneID,
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

  test("applies restore and delete while withholding the newest partial item", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
        { type: "delete", ids: "old-arrow" },
        { type: "rectangle", id: "new-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
      ]),
    })
    expect(
      buildProgressiveWhiteboardElements({
        raw,
        activeSceneID: "scene-1",
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

  test("applies complete streaming delete controls immediately with id fallback", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
        { type: "delete", id: "old-arrow" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        activeSceneID: "scene-1",
        baseElements: [
          { type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 },
          { type: "arrow", id: "old-arrow", x: 120, y: 30, width: 100, height: 0 },
        ],
      }),
    ).toEqual([{ type: "rectangle", id: "existing", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("renders fresh-scene elements before the first durable revision exists", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 },
        { type: "text", id: "still-buffered", x: 0, y: 80, text: "wait" },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        baseElements: [],
      }),
    ).toEqual([{ type: "rectangle", id: "first-node", x: 0, y: 0, width: 120, height: 60 }])
  })

  test("keeps camera updates in the progressive preview signature", () => {
    const raw = JSON.stringify({
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

  test("applies complete streaming update and translate controls immediately", () => {
    const raw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
        { type: "layoutCleanup", strategy: "spread_zone" },
        { type: "update", id: "node", x: 10, width: 160, label: { text: "Updated" } },
        { type: "translate", ids: "node", dx: 100, dy: 50 },
      ]),
    })

    expect(
      buildProgressiveWhiteboardElements({
        raw,
        activeSceneID: "scene-1",
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
        x: 110,
        y: 50,
        width: 160,
        height: 80,
        label: { text: "Updated" },
      },
      {
        type: "text",
        id: "node-bound-text",
        containerId: "node",
        x: 130,
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
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
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
            input: { elements: firstElements },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              sceneID: "scene-1",
              revisionID: "01J00000000000000000000001",
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
        activeSceneID: "previous-scene",
        baseRevisionID: "01H00000000000000000000000",
        baseElements: [{ type: "rectangle", id: "previous", x: 0, y: 0, width: 120, height: 60 }],
      })?.elements.map((element) => element.id),
    ).toEqual(["first", "second"])
  })

  test("folds multiple completed same-turn edits before the newest streaming update", () => {
    const firstElements = JSON.stringify([
      { type: "rectangle", id: "first", x: 0, y: 0, width: 120, height: 60 },
    ])
    const secondElements = JSON.stringify([
      { type: "restoreCheckpoint", id: "scene-1" },
      { type: "rectangle", id: "second", x: 160, y: 0, width: 120, height: 60 },
    ])
    const thirdRaw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
        { type: "rectangle", id: "third", x: 320, y: 0, width: 120, height: 60 },
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
            input: { elements: firstElements },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              sceneID: "scene-1",
              revisionID: "01J00000000000000000000001",
            },
          },
        },
        {
          id: "part-2",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: {
            status: "completed",
            input: { elements: secondElements },
            output: "",
            title: "",
            time: { start: 3, end: 4 },
            metadata: {
              sceneID: "scene-1",
              revisionID: "01J00000000000000000000002",
            },
          },
        },
        {
          id: "part-3",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          tool: "whiteboard_create_view",
          state: { status: "pending", input: {}, raw: thirdRaw },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        activeSceneID: "previous-scene",
        baseRevisionID: "01H00000000000000000000000",
        baseElements: [{ type: "rectangle", id: "previous", x: 0, y: 0, width: 120, height: 60 }],
      })?.elements.map((element) => element.id),
    ).toEqual(["first", "second", "third"])
  })

  test("does not replay stale completed tools over the latest fetched scene", () => {
    const oldElements = JSON.stringify([
      { type: "rectangle", id: "old", x: 0, y: 0, width: 120, height: 60 },
    ])
    const streamingRaw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
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
            input: { elements: oldElements },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              sceneID: "scene-1",
              revisionID: "01H00000000000000000000001",
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
        activeSceneID: "scene-1",
        baseRevisionID: "01H00000000000000000000002",
        baseElements: [
          { type: "rectangle", id: "learner-edit", x: 0, y: 0, width: 120, height: 60 },
        ],
      })?.elements.map((element) => element.id),
    ).toEqual(["learner-edit", "new"])
  })

  test("does not replay completed writes that the backend rejected", () => {
    const rejectedElements = JSON.stringify([
      { type: "rectangle", id: "rejected", x: 0, y: 0, width: 120, height: 60 },
    ])
    const streamingRaw = JSON.stringify({
      elements: JSON.stringify([
        { type: "restoreCheckpoint", id: "scene-1" },
        { type: "rectangle", id: "next", x: 160, y: 0, width: 120, height: 60 },
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
            input: { elements: rejectedElements },
            output: "",
            title: "",
            time: { start: 1, end: 2 },
            metadata: {
              saved: false,
              sceneID: "scene-1",
              revisionID: "01J00000000000000000000001",
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
        activeSceneID: "scene-1",
        baseRevisionID: "01H00000000000000000000000",
        baseElements: [{ type: "rectangle", id: "base", x: 0, y: 0, width: 120, height: 60 }],
      })?.elements.map((element) => element.id),
    ).toEqual(["base", "next"])
  })

  test("tracks completed whiteboard writes that are not fetched into the durable head yet", () => {
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
              sceneID: "scene-1",
              revisionID: "01J00000000000000000000001",
            },
          },
        },
      ]),
    ] satisfies MessageWithParts[]

    expect(
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        baseRevisionID: "01H00000000000000000000000",
      }),
    ).toBeTrue()
    expect(
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        baseRevisionID: "01J00000000000000000000001",
      }),
    ).toBeFalse()
    expect(hasUnfetchedCompletedWhiteboardCreate({ messages })).toBeTrue()
    expect(
      hasUnfetchedCompletedWhiteboardCreate({
        messages: [
          createAssistantMessage([
            {
              id: "part-1",
              sessionID: "session-1",
              messageID: "message-1",
              type: "tool",
              tool: "whiteboard_create_view",
              state: { status: "error", input: {}, error: "failed" },
            },
          ]),
        ],
        baseRevisionID: "01H00000000000000000000000",
      }),
    ).toBeFalse()
    expect(
      hasUnfetchedCompletedWhiteboardCreate({
        messages: [
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
                  saved: false,
                  revisionID: "01J00000000000000000000002",
                },
              },
            },
          ]),
        ],
        baseRevisionID: "01H00000000000000000000000",
      }),
    ).toBeFalse()
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
    expect(
      resolveStickyProgressiveWhiteboardPreview({
        current,
        computed: current,
        retainWithoutComputed: false,
      }),
    ).toBe(current)
  })

  test("requests the whiteboard route while a create-view tool is active", () => {
    const messages = [
      {
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
        parts: [
          {
            id: "part-1",
            sessionID: "session-1",
            messageID: "message-1",
            type: "tool",
            tool: "whiteboard_create_view",
            state: { status: "pending", input: {}, raw: "" },
          },
        ],
      },
    ] satisfies MessageWithParts[]

    expect(hasActiveWhiteboardCreate(messages)).toBeTrue()
    expect(hasWhiteboardCreate(messages)).toBeTrue()
    expect(countCompletedWhiteboardCreate(messages)).toBe(0)
    expect(readLatestStreamingWhiteboardRaw(messages)).toBe("")
    expect(
      hasActiveWhiteboardCreate([
        {
          ...messages[0],
          parts: [
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
          ],
        },
      ]),
    ).toBeFalse()
    expect(
      readLatestStreamingWhiteboardRaw([
        {
          ...messages[0],
          parts: [
            {
              ...messages[0].parts[0],
              state: { status: "running", input: {}, raw: "partial" },
            },
          ],
        },
      ]),
    ).toBe("partial")
    expect(
      readLatestStreamingWhiteboardRestoreSceneID([
        {
          ...messages[0],
          parts: [
            {
              ...messages[0].parts[0],
              state: {
                status: "running",
                input: {},
                raw: JSON.stringify({
                  elements: JSON.stringify([{ type: "restoreCheckpoint", id: "scene-1" }]),
                }),
              },
            },
          ],
        },
      ]),
    ).toBe("scene-1")
  })
})
