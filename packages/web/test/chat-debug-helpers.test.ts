import { describe, expect, test } from "bun:test"
import { buildSessionTrace } from "../src/lib/directory-chat/chat-debug-helpers"
import {
  createAssistantMessageInfo,
  createDirectoryChatState,
  createMessageWithParts,
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
})
