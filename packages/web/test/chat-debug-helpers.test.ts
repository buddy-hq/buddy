import { describe, expect, test } from "bun:test"
import { buildSessionTrace } from "../src/lib/directory-chat/chat-debug-helpers"
import {
  createAssistantMessageInfo,
  createDirectoryChatState,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"

describe("chat debug helpers", () => {
  test("buildSessionTrace includes the latest active directory snapshot", () => {
    const firstState = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "World War 2",
      sessions: [
        {
          id: "session_1",
          title: "World War 2",
          time: { created: 1, updated: 2 },
          parentID: undefined,
          revert: undefined,
        },
      ],
      sessionStatusByID: {
        session_1: {
          type: "busy",
        },
      },
      isBusy: true,
      isReady: true,
      messages: [
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "message_1",
            sessionID: "session_1",
            finish: "stop",
          }),
          [
            {
              id: "part_1",
              sessionID: "session_1",
              messageID: "message_1",
              type: "text",
              text: "first turn",
            },
          ],
        ),
      ],
    })

    const secondState = {
      ...firstState,
      messages: [
        ...firstState.messages,
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "message_2",
            sessionID: "session_1",
            finish: "stop",
          }),
          [
            {
              id: "part_2",
              sessionID: "session_1",
              messageID: "message_2",
              type: "text",
              text: "second turn",
            },
          ],
        ),
      ],
    }

    const firstTrace = JSON.parse(
      buildSessionTrace({
        directory: "/repo",
        directoryState: firstState,
        sessionID: "session_1",
        streamStatus: "connected",
      }),
    ) as Record<string, unknown>
    const secondTrace = JSON.parse(
      buildSessionTrace({
        directory: "/repo",
        directoryState: secondState,
        sessionID: "session_1",
        streamStatus: "connected",
      }),
    ) as Record<string, unknown>

    const firstDirectoryState = firstTrace.directoryState as Record<string, unknown>
    const secondDirectoryState = secondTrace.directoryState as Record<string, unknown>
    const firstMessages = firstDirectoryState.messages as Array<Record<string, unknown>>
    const secondMessages = secondDirectoryState.messages as Array<Record<string, unknown>>

    expect(firstMessages).toHaveLength(1)
    expect(secondMessages).toHaveLength(2)
    expect(JSON.stringify(firstTrace)).not.toContain("second turn")
    expect(JSON.stringify(secondTrace)).toContain("second turn")
  })

  test("buildSessionTrace includes reasoning text", () => {
    const state = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "Debug trace",
      messages: [
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "message_1",
            sessionID: "session_1",
            finish: "stop",
          }),
          [
            {
              id: "part_1",
              sessionID: "session_1",
              messageID: "message_1",
              type: "reasoning",
              text: "reasoning should stay visible in copied traces",
              time: {
                start: 1,
                end: 2,
              },
            },
          ],
        ),
      ],
    })

    const trace = buildSessionTrace({
      directory: "/repo",
      directoryState: state,
      sessionID: "session_1",
      streamStatus: "connected",
    })

    expect(trace).toContain('"type": "reasoning"')
    expect(trace).toContain("reasoning should stay visible in copied traces")
  })

  test("buildSessionTrace omits uploaded image data urls", () => {
    const state = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "Image trace",
      messages: [
        createMessageWithParts(createUserMessageInfo({ id: "message_1", sessionID: "session_1" }), [
          {
            id: "part_1",
            sessionID: "session_1",
            messageID: "message_1",
            type: "file",
            mime: "image/png",
            filename: "diagram.png",
            url: "data:image/png;base64,raw-image-bytes-should-not-be-in-trace",
          },
        ]),
      ],
    })

    const trace = buildSessionTrace({
      directory: "/repo",
      directoryState: state,
      sessionID: "session_1",
      streamStatus: "connected",
    })

    expect(trace).toContain('"type": "file"')
    expect(trace).toContain('"mime": "image/png"')
    expect(trace).toContain('"filename": "diagram.png"')
    expect(trace).not.toContain("data:image/png")
    expect(trace).not.toContain("raw-image-bytes-should-not-be-in-trace")
  })

  test("buildSessionTrace redacts text-expanded uploaded images", () => {
    const state = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "SVG trace",
      messages: [
        createMessageWithParts(createUserMessageInfo({ id: "message_1", sessionID: "session_1" }), [
          {
            id: "part_1",
            sessionID: "session_1",
            messageID: "message_1",
            type: "text",
            text: "Attached file (diagram.svg):\n<svg><text>raw image text should not leak</text></svg>",
          },
          {
            id: "part_2",
            sessionID: "session_1",
            messageID: "message_1",
            type: "text",
            text: "Attached file (notes.txt):\nregular text should remain visible",
          },
        ]),
      ],
    })

    const trace = buildSessionTrace({
      directory: "/repo",
      directoryState: state,
      sessionID: "session_1",
      streamStatus: "connected",
    })

    expect(trace).toContain("Attached image (diagram.svg) omitted from trace.")
    expect(trace).not.toContain("<svg>")
    expect(trace).not.toContain("raw image text should not leak")
    expect(trace).toContain("regular text should remain visible")
  })
})
