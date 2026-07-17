import { describe, expect, test } from "bun:test"

import {
  resolveRedoTargetMessageID,
  resolveUndoTargetMessageID,
} from "../src/state/session-revert"
import type { MessageWithParts } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"

const sessionID = "ses_revert"

function message(id: string, role: "user" | "assistant"): MessageWithParts {
  const info =
    role === "user"
      ? createUserMessageInfo({ id, sessionID })
      : createAssistantMessageInfo({ id, sessionID })
  return createMessageWithParts(info, [])
}

describe("session revert targets", () => {
  test("loads older transcript pages until it finds the previous visible user message", async () => {
    const pages = [
      {
        messages: [message("msg_005_user", "user"), message("msg_006_assistant", "assistant")],
        complete: false,
        cursor: "msg_005_user",
      },
      {
        messages: [
          message("msg_001_user", "user"),
          message("msg_002_assistant", "assistant"),
          message("msg_003_user", "user"),
          message("msg_004_assistant", "assistant"),
          message("msg_005_user", "user"),
          message("msg_006_assistant", "assistant"),
        ],
        complete: true,
        cursor: undefined,
      },
    ]
    let pageIndex = 0

    const target = await resolveUndoTargetMessageID({
      revertMessageID: "msg_005_user",
      readTranscript: () => {
        const page = pages[pageIndex]
        if (!page) throw new Error("Expected a transcript page")
        return page
      },
      loadOlder: async () => {
        pageIndex += 1
      },
    })

    expect(target).toBe("msg_003_user")
    expect(pageIndex).toBe(1)
  })

  test("does not paginate when an explicit undo boundary is supplied", async () => {
    let loadCount = 0
    const target = await resolveUndoTargetMessageID({
      explicitMessageID: "msg_selected_user",
      revertMessageID: undefined,
      readTranscript: () => ({ messages: [], complete: false, cursor: "msg_cursor" }),
      loadOlder: async () => {
        loadCount += 1
      },
    })

    expect(target).toBe("msg_selected_user")
    expect(loadCount).toBe(0)
  })

  test("redo loads back to the revert window before choosing the next user boundary", async () => {
    const pages = [
      {
        messages: [message("msg_005_user", "user"), message("msg_006_assistant", "assistant")],
        complete: false,
        cursor: "msg_005_user",
      },
      {
        messages: [
          message("msg_001_user", "user"),
          message("msg_002_assistant", "assistant"),
          message("msg_003_user", "user"),
          message("msg_004_assistant", "assistant"),
          message("msg_005_user", "user"),
          message("msg_006_assistant", "assistant"),
        ],
        complete: true,
        cursor: undefined,
      },
    ]
    let pageIndex = 0

    const target = await resolveRedoTargetMessageID({
      revertMessageID: "msg_003_user",
      readTranscript: () => {
        const page = pages[pageIndex]
        if (!page) throw new Error("Expected a transcript page")
        return page
      },
      loadOlder: async () => {
        pageIndex += 1
      },
    })

    expect(target).toBe("msg_005_user")
    expect(pageIndex).toBe(1)
  })

  test("redo unreverts after the last reverted user message", async () => {
    const messages = [
      message("msg_001_user", "user"),
      message("msg_002_assistant", "assistant"),
      message("msg_003_user", "user"),
      message("msg_004_assistant", "assistant"),
    ]

    expect(
      await resolveRedoTargetMessageID({
        revertMessageID: "msg_003_user",
        readTranscript: () => ({ messages, complete: true, cursor: undefined }),
        loadOlder: async () => undefined,
      }),
    ).toBeUndefined()
  })
})
