import { beforeEach, describe, expect, test } from "bun:test"
import { buildSessionTrace, formatSessionTraceSummary, saveSessionTraceToFile } from "../src/lib/directory-chat/chat-debug-helpers"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import { parseBuddyConfigObject, parseJsonObjectText } from "./parse-test-values"
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
    const firstTrace = parseJsonObjectText(
      buildSessionTrace({
        directory,
        directoryState: firstState,
        sessionID: "session_1",
        streamStatus: "connected",
      }),
    )
    seedTranscriptMessages(directory, secondMessages)
    const secondTrace = parseJsonObjectText(
      buildSessionTrace({
        directory,
        directoryState: firstState,
        sessionID: "session_1",
        streamStatus: "connected",
      }),
    )
    if (firstTrace === undefined || secondTrace === undefined) {
      throw new Error("Expected session traces to parse.")
    }

    const firstDirectoryState = parseBuddyConfigObject(firstTrace.directoryState)
    const secondDirectoryState = parseBuddyConfigObject(secondTrace.directoryState)
    const firstTraceMessages = firstDirectoryState?.messages
    const secondTraceMessages = secondDirectoryState?.messages

    expect(Array.isArray(firstTraceMessages) ? firstTraceMessages : []).toHaveLength(1)
    expect(Array.isArray(secondTraceMessages) ? secondTraceMessages : []).toHaveLength(2)
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

  test("formatSessionTraceSummary formats comprehensive trace metadata", () => {
    const summary = formatSessionTraceSummary({
      sessionID: "session_123",
      sessionTitle: "Quantum Mechanics",
      directory: "/Users/dev/Code/buddy",
      databasePath: "/Users/dev/.local/share/opencode/opencode-local.db",
      worktree: "/Users/dev/Code/buddy",
      branch: "feat-tracing",
      devServer: "http://localhost:1420",
      devInstanceName: "buddy-dev",
      relativeFilePath: ".traces/session-session_123-2026-09-24.log",
      filePath: "/Users/dev/Code/buddy/.traces/session-session_123-2026-09-24.log",
      capturedAt: "2026-09-24T12:00:00.000Z",
      streamStatus: "idle",
      messageCount: 8,
      tokenCount: 1500,
      byteCount: 6000,
    })

    expect(summary).toContain("Session: Quantum Mechanics (session_123)")
    expect(summary).toContain("Session DB: /Users/dev/.local/share/opencode/opencode-local.db")
    expect(summary).toContain("Directory: /Users/dev/Code/buddy")
    expect(summary).toContain("Worktree: /Users/dev/Code/buddy (branch: feat-tracing)")
    expect(summary).toContain("Dev Server: http://localhost:1420 (buddy-dev)")
    expect(summary).toContain("Saved Trace File: .traces/session-session_123-2026-09-24.log")
    expect(summary).toContain("Full Path: /Users/dev/Code/buddy/.traces/session-session_123-2026-09-24.log")
    expect(summary).toContain("Captured At: 2026-09-24T12:00:00.000Z")
    expect(summary).toContain("Trace Info: Status: idle | 8 messages | ~1,500 tokens | 6,000 bytes")
  })

  test("saveSessionTraceToFile posts to dev endpoint and returns save result", async () => {
    const originalFetch = globalThis.fetch
    try {
      let requestedUrl = ""
      let requestedBody = ""
      // SAFETY: Mock fetch handler for testing saveSessionTraceToFile.
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(url)
        requestedBody = init?.body ? String(init.body) : ""
        return new Response(
          JSON.stringify({
            success: true,
            filePath: "/repo/.traces/session-test.log",
            relativeFilePath: ".traces/session-test.log",
            worktree: "/repo",
            worktreeName: "repo",
            branch: "main",
            devServer: "http://localhost:1420",
            devInstanceName: "buddy",
            databasePath: "/repo/.local/share/opencode/opencode-local.db",
            sessionID: "session_123",
            sessionTitle: "Test Chat",
            directory: "/repo",
            byteCount: 100,
            tokenCount: 25,
            messageCount: 1,
            streamStatus: "idle",
            savedAt: "2026-09-24T12:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }) as any

      const result = await saveSessionTraceToFile({
        trace: "{}",
        sessionID: "session_123",
        sessionTitle: "Test Chat",
        directory: "/repo",
        devServer: "http://localhost:1420",
      })

      expect(requestedUrl).toBe("/api/dev/session-trace")
      expect(requestedBody).toContain("session_123")
      expect(result.success).toBe(true)
      expect(result.relativeFilePath).toBe(".traces/session-test.log")
      expect(result.worktree).toBe("/repo")
      expect(result.branch).toBe("main")
      expect(result.databasePath).toBe("/repo/.local/share/opencode/opencode-local.db")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

})
