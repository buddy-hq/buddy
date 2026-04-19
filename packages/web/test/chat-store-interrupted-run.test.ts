import { beforeEach, describe, expect, test } from "bun:test"
import { useChatStore } from "../src/state/chat-store"
import type { QuestionRequest, SessionInfo } from "../src/state/chat-types"
import { BUSY_SESSION_STATUS, IDLE_SESSION_STATUS } from "../src/state/session-status"
import { createAssistantMessageInfo } from "./test-utils"

const directory = "/tmp/interrupted-run"

function session(id: string, updated: number): SessionInfo {
  return {
    id,
    title: id,
    time: {
      created: updated - 1,
      updated,
    },
  }
}

function resetStore() {
  useChatStore.setState({
    openProjects: [],
    activeDirectory: undefined,
    pendingActiveDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

describe("chat-store interrupted runs", () => {
  test("preserves pending questions across session switches", () => {
    const store = useChatStore.getState()
    const pendingQuestions: QuestionRequest[] = [
      {
        id: "question_1",
        sessionID: "session_1",
        questions: [],
      },
      {
        id: "question_2",
        sessionID: "session_2",
        questions: [],
      },
    ]

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2), session("session_2", 3)])
    store.setPendingQuestions(directory, pendingQuestions)

    store.setActiveSession(directory, "session_1")
    store.setActiveSession(directory, "session_2")
    store.startSessionDraft(directory)

    expect(useChatStore.getState().directories[directory]?.pendingQuestions).toEqual(
      pendingQuestions,
    )
  })

  test("clears stale busy state when the backend returns to idle after an interrupted run", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2)])
    store.setActiveSession(directory, "session_1")
    store.setMessages(directory, "session_1", [
      {
        info: createAssistantMessageInfo({
          id: "message_1",
          sessionID: "session_1",
          time: { created: 1 },
        }),
        parts: [],
      },
    ])
    store.applySessionStatus(directory, "session_1", BUSY_SESSION_STATUS)

    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(true)
    expect(
      useChatStore.getState().directories[directory]?.messages[0]?.info.time.completed,
    ).toBeUndefined()

    store.applySessionStatus(directory, "session_1", IDLE_SESSION_STATUS)

    const next = useChatStore.getState().directories[directory]
    expect(next?.isBusy).toBe(false)
    expect(next?.messages[0]?.info.time.completed).toEqual(expect.any(Number))
  })

  test("does not keep the session busy when the assistant message is already marked interrupted", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2)])
    store.setActiveSession(directory, "session_1")
    store.setMessages(directory, "session_1", [
      {
        info: createAssistantMessageInfo({
          id: "message_1",
          sessionID: "session_1",
          time: { created: 1 },
          finish: "interrupted",
        }),
        parts: [],
      },
    ])
    store.applySessionStatus(directory, "session_1", IDLE_SESSION_STATUS)

    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(false)
  })
})
