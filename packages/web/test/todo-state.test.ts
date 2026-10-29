import { describe, expect, test } from "bun:test"

import { findLatestTodoSnapshot, todoProgress } from "../src/components/chat/tools/todo-state"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"

describe("todo state", () => {
  test("summarizes pending, active, and settled todo states", () => {
    expect(todoProgress([])).toEqual({ completedCount: 0, totalCount: 0, state: "pending" })
    expect(
      todoProgress([
        { key: "one", content: "First", status: "completed" },
        { key: "two", content: "Second", status: "in_progress" },
      ]),
    ).toEqual({ completedCount: 1, totalCount: 2, state: "in_progress" })
    expect(
      todoProgress([
        { key: "one", content: "First", status: "completed" },
        { key: "two", content: "Second", status: "cancelled" },
      ]),
    ).toEqual({ completedCount: 1, totalCount: 2, state: "completed" })
  })

  test("selects the latest successful todo update on the visible transcript branch", () => {
    const sessionID = "ses_todo_state"
    const firstMessage = createMessageWithParts(
      createAssistantMessageInfo({ id: "msg_a", sessionID }),
      [
        {
          id: "prt_a",
          sessionID,
          messageID: "msg_a",
          type: "tool",
          tool: "todowrite",
          callID: "call_a",
          state: {
            status: "completed",
            input: {},
            metadata: {},
            summary: { kind: "update-plan" },
            todos: [{ text: "First task", status: "completed" }],
            attachments: [],
            output: "[]",
            title: "0 todos",
            time: { start: 1, end: 2 },
          },
        },
      ],
    )
    const revertedMessage = createMessageWithParts(
      createAssistantMessageInfo({ id: "msg_b", sessionID }),
      [
        {
          id: "prt_b",
          sessionID,
          messageID: "msg_b",
          type: "tool",
          tool: "todowrite",
          callID: "call_b",
          state: {
            status: "completed",
            input: {},
            metadata: {},
            summary: { kind: "update-plan" },
            todos: [{ text: "Future task", status: "pending" }],
            attachments: [],
            output: "[]",
            title: "1 todos",
            time: { start: 3, end: 4 },
          },
        },
      ],
    )

    expect(
      findLatestTodoSnapshot({
        messages: [firstMessage, revertedMessage],
        revertMessageID: "msg_b",
        transcriptComplete: true,
      }),
    ).toEqual({
      revision: "prt_a",
      todos: [{ key: "0:First task", content: "First task", status: "completed" }],
      isCurrentTurn: true,
    })
  })

  test("treats an empty successful update as an explicit list clear", () => {
    const sessionID = "ses_todo_clear"
    const message = createMessageWithParts(
      createAssistantMessageInfo({ id: "msg_clear", sessionID }),
      [
        {
          id: "prt_clear",
          sessionID,
          messageID: "msg_clear",
          type: "tool",
          tool: "todowrite",
          callID: "call_clear",
          state: {
            status: "completed",
            input: {},
            metadata: {},
            summary: { kind: "update-plan" },
            todos: [],
            attachments: [],
            output: "[]",
            title: "0 todos",
            time: { start: 1, end: 2 },
          },
        },
      ],
    )

    expect(findLatestTodoSnapshot({ messages: [message], transcriptComplete: true })).toEqual({
      revision: "prt_clear",
      todos: [],
      isCurrentTurn: true,
    })
  })

  test("does not treat an older turn's list as a fresh auto-open request", () => {
    const sessionID = "ses_todo_older_turn"
    const todoMessage = createMessageWithParts(
      createAssistantMessageInfo({ id: "msg_a_todo", sessionID }),
      [
        {
          id: "prt_older_todo",
          sessionID,
          messageID: "msg_a_todo",
          type: "tool",
          tool: "todowrite",
          callID: "call_older_todo",
          state: {
            status: "running",
            input: {},
            summary: { kind: "update-plan" },
            todos: [{ text: "Older task", status: "pending" }],
            time: { start: 1 },
          },
        },
      ],
    )
    const nextUserMessage = createMessageWithParts(
      createUserMessageInfo({ id: "msg_b_user", sessionID }),
      [
        {
          id: "prt_next_user",
          sessionID,
          messageID: "msg_b_user",
          type: "text",
          text: "Continue",
        },
      ],
    )

    expect(
      findLatestTodoSnapshot({ messages: [todoMessage, nextUserMessage], transcriptComplete: true })
        ?.isCurrentTurn,
    ).toBe(false)
  })
})
