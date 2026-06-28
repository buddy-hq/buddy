import { beforeEach, describe, expect, test } from "bun:test"
import { buildSessionTrace } from "../src/lib/directory-chat/chat-debug-helpers"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import {
  createAssistantMessageInfo,
  createDirectoryChatState,
  createMessageWithParts,
  createUserMessageInfo,
  seedTranscriptMessages,
} from "./test-utils"

describe("chat debug helpers", () => {
  beforeEach(() => {
    resetTranscriptRepositoryForTests()
  })

  test("buildSessionTrace includes the latest active directory snapshot", () => {
    const directory = "/repo"
    const firstMessages = [
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
    ]
    const secondMessages = [
      ...firstMessages,
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
    ]
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
    })

    seedTranscriptMessages(directory, firstMessages)
    const firstTrace = JSON.parse(
      buildSessionTrace({
        directory,
        directoryState: firstState,
        sessionID: "session_1",
        streamStatus: "connected",
      }),
    ) as Record<string, unknown>
    seedTranscriptMessages(directory, secondMessages)
    const secondTrace = JSON.parse(
      buildSessionTrace({
        directory,
        directoryState: firstState,
        sessionID: "session_1",
        streamStatus: "connected",
      }),
    ) as Record<string, unknown>

    const firstDirectoryState = firstTrace.directoryState as Record<string, unknown>
    const secondDirectoryState = secondTrace.directoryState as Record<string, unknown>
    const firstTraceMessages = firstDirectoryState.messages as Array<Record<string, unknown>>
    const secondTraceMessages = secondDirectoryState.messages as Array<Record<string, unknown>>

    expect(firstTraceMessages).toHaveLength(1)
    expect(secondTraceMessages).toHaveLength(2)
    expect(JSON.stringify(firstTrace)).not.toContain("second turn")
    expect(JSON.stringify(secondTrace)).toContain("second turn")
  })

  test("buildSessionTrace includes reasoning text", () => {
    const messages = [
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
    ]
    const state = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "Debug trace",
    })
    seedTranscriptMessages("/repo", messages)

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
    const messages = [
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
    ]
    const state = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "Image trace",
    })
    seedTranscriptMessages("/repo", messages)

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
    const messages = [
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
    ]
    const state = createDirectoryChatState({
      sessionID: "session_1",
      sessionTitle: "SVG trace",
    })
    seedTranscriptMessages("/repo", messages)

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
