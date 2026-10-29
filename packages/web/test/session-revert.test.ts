import { describe, expect, test } from "bun:test"

import { findLatestTodoSnapshot } from "../src/components/chat/tools/todo-state"
import { resolveRevertedUserMessageCount } from "../src/components/directory-chat/directory-chat-main-pane"
import {
  createBeforeRevertFilter,
  resolveRedoTargetMessageID,
  resolveUndoTargetMessageID,
} from "../src/state/session-revert"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
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

function chronologicalMessage(input: {
  id: string
  role: "user" | "assistant"
  created: number
  order: string
  parts?: MessagePart[]
}): MessageWithParts {
  const fields = { id: input.id, sessionID, order: input.order, time: { created: input.created } }
  const info =
    input.role === "user" ? createUserMessageInfo(fields) : createAssistantMessageInfo(fields)
  return createMessageWithParts(info, input.parts)
}

function todoPart(messageID: string, text: string): MessagePart {
  return {
    id: `prt_${messageID}`,
    sessionID,
    messageID,
    type: "tool",
    tool: "todowrite",
    callID: `call_${messageID}`,
    state: {
      status: "completed",
      input: {},
      metadata: {},
      summary: { kind: "update-plan" },
      todos: [{ text, status: "pending" }],
      attachments: [],
      output: "[]",
      title: "1 todos",
      time: { start: 1, end: 2 },
    },
  }
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

  test("follows message chronology, not ID order, across every revert surface", async () => {
    const messages = [
      chronologicalMessage({ id: "msg_z", role: "user", created: 100, order: "0001" }),
      chronologicalMessage({
        id: "msg_y",
        role: "assistant",
        created: 100,
        order: "0002",
        parts: [todoPart("msg_y", "Visible plan")],
      }),
      chronologicalMessage({ id: "msg_m", role: "user", created: 200, order: "0003" }),
      chronologicalMessage({
        id: "msg_l",
        role: "assistant",
        created: 201,
        order: "0004",
        parts: [todoPart("msg_l", "Reverted plan")],
      }),
      chronologicalMessage({ id: "msg_c", role: "user", created: 300, order: "0005" }),
      chronologicalMessage({ id: "msg_b", role: "assistant", created: 301, order: "0006" }),
    ]
    const revert = { messages, revertMessageID: "msg_m", transcriptComplete: true }
    const transcript = {
      readTranscript: () => ({ messages, complete: true, cursor: undefined }),
      loadOlder: async () => undefined,
    }

    expect(messages.filter(createBeforeRevertFilter(revert)).map((entry) => entry.info.id)).toEqual(
      ["msg_z", "msg_y"],
    )
    expect(resolveRevertedUserMessageCount(revert)).toBe(2)
    expect(findLatestTodoSnapshot(revert)?.todos.map((todo) => todo.content)).toEqual([
      "Visible plan",
    ])
    expect(await resolveUndoTargetMessageID({ revertMessageID: "msg_m", ...transcript })).toBe(
      "msg_z",
    )
    expect(await resolveRedoTargetMessageID({ revertMessageID: "msg_m", ...transcript })).toBe(
      "msg_c",
    )
  })

  test("a complete transcript without the revert boundary hides nothing and redo unreverts", async () => {
    const messages = [message("msg_001_user", "user"), message("msg_002_assistant", "assistant")]
    const revert = { messages, revertMessageID: "msg_000_gone", transcriptComplete: true }

    expect(messages.filter(createBeforeRevertFilter(revert))).toEqual(messages)
    expect(resolveRevertedUserMessageCount(revert)).toBe(0)
    expect(
      await resolveRedoTargetMessageID({
        revertMessageID: "msg_000_gone",
        readTranscript: () => ({ messages, complete: true, cursor: undefined }),
        loadOlder: async () => undefined,
      }),
    ).toBeUndefined()
  })
})
