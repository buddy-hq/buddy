import { beforeEach, describe, expect, test } from "bun:test"
import { useChatStore } from "../../../src/state/chat-store"
import type { MessageInfo, PermissionRequest, SessionInfo } from "../../../src/state/chat-types"
import { BUSY_SESSION_STATUS, IDLE_SESSION_STATUS } from "../../../src/state/session-status"
import { createAssistantMessageInfo, createUserMessageInfo } from "../../test-utils"

const directory = "/tmp/parity"

const session = (id: string, updated: number): SessionInfo => ({
  id,
  title: id,
  time: {
    created: updated - 1,
    updated,
  },
})

const userMessage = (id: string, sessionID: string): MessageInfo => ({
  ...createUserMessageInfo({
    id,
    sessionID,
    time: { created: Date.now() },
  }),
})

const assistantMessage = (id: string, sessionID: string, finish?: string): MessageInfo => ({
  ...createAssistantMessageInfo({
    id,
    sessionID,
    time: { created: Date.now() },
    finish,
  }),
})

const permissionRequest = (id: string, sessionID: string, permission = id): PermissionRequest => ({
  id,
  sessionID,
  permission,
  patterns: ["*"],
  metadata: {},
  always: [],
})

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

describe("chat-store parity events", () => {
  test("persists only route/session handoff state, not openProjects", () => {
    const store = useChatStore.getState()

    store.setOpenProjects(["/tmp/alpha", "/tmp/beta"])
    store.setActiveDirectory("/tmp/beta")
    store.setActiveSession(directory, "session_1")

    const persistedRaw = localStorage.getItem("buddy.chat.v4")
    expect(persistedRaw).not.toBeNull()

    const persisted = JSON.parse(persistedRaw ?? "{}") as {
      state?: {
        openProjects?: unknown
        activeDirectory?: unknown
        lastSessionByDirectory?: unknown
      }
    }

    expect(persisted.state?.openProjects).toBeUndefined()
    expect(persisted.state?.activeDirectory).toBe("/tmp/beta")
    expect(persisted.state?.lastSessionByDirectory).toEqual({
      "/tmp/parity": "session_1",
    })
  })

  test("does not persist current passage text from active reading state", () => {
    const store = useChatStore.getState()

    store.setActiveReadingResource(directory, {
      resourceID: "resource_1",
      name: "Book",
      path: "books/book.epub",
      currentPassageText: "This should stay in live state only.",
    })

    const persistedRaw = localStorage.getItem("buddy.chat.v4")
    expect(persistedRaw).not.toBeNull()

    const persisted = JSON.parse(persistedRaw ?? "{}") as {
      state?: {
        activeReadingResourceByDirectory?: Record<string, Record<string, unknown>>
      }
    }

    expect(
      useChatStore.getState().activeReadingResourceByDirectory[directory]?.currentPassageText,
    ).toBe("This should stay in live state only.")
    expect(
      persisted.state?.activeReadingResourceByDirectory?.[directory]?.currentPassageText,
    ).toBeUndefined()
  })

  test("defers persisted active directory until backend open-projects are loaded", async () => {
    localStorage.setItem(
      "buddy.chat.v4",
      JSON.stringify({
        state: {
          activeDirectory: "/tmp/beta",
        },
        version: 0,
      }),
    )

    await useChatStore.persist.rehydrate()

    let next = useChatStore.getState()
    expect(next.activeDirectory).toBeUndefined()
    expect(next.pendingActiveDirectory).toBe("/tmp/beta")

    next.setOpenProjects(["/tmp/alpha", "/tmp/beta"])
    next = useChatStore.getState()
    expect(next.activeDirectory).toBe("/tmp/beta")
    expect(next.pendingActiveDirectory).toBeUndefined()
  })

  test("falls back to backend project order when persisted active directory is stale", async () => {
    localStorage.setItem(
      "buddy.chat.v4",
      JSON.stringify({
        state: {
          activeDirectory: "/tmp/missing",
        },
        version: 0,
      }),
    )

    await useChatStore.persist.rehydrate()
    useChatStore.getState().setOpenProjects(["/tmp/alpha", "/tmp/beta"])

    const next = useChatStore.getState()
    expect(next.activeDirectory).toBe("/tmp/alpha")
    expect(next.pendingActiveDirectory).toBeUndefined()
  })

  test("tracks transient entry errors for route handoff", () => {
    const store = useChatStore.getState()

    store.setEntryError("Directory is outside allowed roots")
    expect(useChatStore.getState().entryError).toBe("Directory is outside allowed roots")

    store.setEntryError(undefined)
    expect(useChatStore.getState().entryError).toBeUndefined()
  })

  test("clears selected session loading state after load failure", () => {
    const store = useChatStore.getState()

    store.setSessions(directory, [session("session_1", 1), session("session_2", 2)])
    store.setActiveSession(directory, "session_1")

    expect(useChatStore.getState().directories[directory]?.loadingSessionID).toBe("session_1")

    store.clearLoadingSession(directory, "session_2")
    expect(useChatStore.getState().directories[directory]?.loadingSessionID).toBe("session_1")

    store.clearLoadingSession(directory, "session_1")
    expect(useChatStore.getState().directories[directory]?.loadingSessionID).toBeUndefined()
  })

  test("clears volatile runtime state while keeping persisted handoff data", () => {
    const store = useChatStore.getState()

    store.setOpenProjects(["/tmp/alpha", "/tmp/beta"])
    store.setActiveDirectory("/tmp/beta")
    store.setSelectedModel("/tmp/beta", "openai/gpt-5.4-mini")
    store.setSessions(directory, [session("session_1", 2)])
    store.setActiveSession(directory, "session_1")
    store.setMessages(directory, "session_1", [
      { info: assistantMessage("message_1", "session_1"), parts: [] },
    ])
    store.setEntryError("stale backend")
    store.setStreamStatus("connected")

    store.resetRuntimeState()

    const next = useChatStore.getState()
    expect(next.openProjects).toEqual([])
    expect(next.activeDirectory).toBeUndefined()
    expect(next.pendingActiveDirectory).toBeUndefined()
    expect(next.entryError).toBeUndefined()
    expect(next.directories).toEqual({})
    expect(next.streamStatus).toBe("idle")
    expect(next.lastSessionByDirectory).toEqual({
      "/tmp/parity": "session_1",
    })
    expect(next.selectedModelByDirectory).toEqual({
      "/tmp/beta": "openai/gpt-5.4-mini",
    })
  })

  test("ignores closeProject for directories that are not tracked", () => {
    const store = useChatStore.getState()
    const before = useChatStore.getState()

    store.closeProject("/tmp/missing")

    const after = useChatStore.getState()
    expect(after).toBe(before)
    expect(after.openProjects).toBe(before.openProjects)
    expect(after.directories).toBe(before.directories)
    expect(after.lastSessionByDirectory).toBe(before.lastSessionByDirectory)
  })

  test("archives active session and resets transcript to next session", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 1), session("session_2", 2)])
    store.setActiveSession(directory, "session_1")
    store.setMessages(directory, "session_1", [
      { info: assistantMessage("message_1", "session_1"), parts: [] },
    ])
    store.applySessionStatus(directory, "session_1", BUSY_SESSION_STATUS)
    store.applySessionStatus(directory, "session_2", IDLE_SESSION_STATUS)
    store.setPendingPermissions(directory, [
      permissionRequest("perm_1", "session_1"),
      permissionRequest("perm_2", "session_2"),
    ])

    store.applySessionUpdated(directory, {
      ...session("session_1", 1),
      time: {
        created: 0,
        updated: 1,
        archived: 3,
      },
    })

    const next = useChatStore.getState().directories[directory]
    expect(next?.sessionID).toBe("session_2")
    expect(next?.messages).toEqual([])
    expect(next?.pendingPermissions.map((item) => item.id)).toEqual(["perm_2"])
    expect(next?.sessionStatusByID["session_1"]).toBeUndefined()
    expect(next?.isBusy).toBe(false)
  })

  test("caches message updates from inactive sessions without changing the visible transcript", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2), session("session_2", 1)])
    store.setActiveSession(directory, "session_1")

    store.applyMessageUpdated(directory, userMessage("message_other", "session_2"))
    let next = useChatStore.getState().directories[directory]
    expect(next?.messages).toEqual([])
    expect(next?.messagesBySessionID?.session_2.map((message) => message.info.id)).toEqual([
      "message_other",
    ])

    store.applyMessageUpdated(directory, assistantMessage("message_active", "session_1"))
    next = useChatStore.getState().directories[directory]
    expect(next?.messages.map((message) => message.info.id)).toEqual(["message_active"])
    expect(next?.messagesBySessionID?.session_2.map((message) => message.info.id)).toEqual([
      "message_other",
    ])
    expect(next?.isBusy).toBe(true)

    store.setActiveSession(directory, "session_2")
    next = useChatStore.getState().directories[directory]
    expect(next?.messages.map((message) => message.info.id)).toEqual(["message_other"])
    expect(next?.isBusy).toBe(false)

    store.setActiveSession(directory, "session_1")

    store.applySessionStatus(directory, "session_1", BUSY_SESSION_STATUS)
    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(true)

    store.applyMessageUpdated(directory, assistantMessage("message_active", "session_1", "stop"))
    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(true)

    store.applySessionStatus(directory, "session_1", IDLE_SESSION_STATUS)
    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(false)
  })

  test("marks uncached session switches as loading until transcript arrives", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2), session("session_2", 1)])
    store.setSessionInfo(directory, session("session_1", 2))

    let next = useChatStore.getState().directories[directory]
    expect(next?.loadingSessionID).toBe("session_1")

    store.setMessages(directory, "session_1", [{ info: userMessage("message_1", "session_1"), parts: [] }])
    next = useChatStore.getState().directories[directory]
    expect(next?.loadingSessionID).toBeUndefined()

    store.setSessionInfo(directory, session("session_2", 1))
    next = useChatStore.getState().directories[directory]
    expect(next?.loadingSessionID).toBe("session_2")

    store.setMessages(directory, "session_2", [])
    next = useChatStore.getState().directories[directory]
    expect(next?.loadingSessionID).toBeUndefined()
  })

  test("keeps live messages when a stale transcript snapshot lands during a run", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2)])
    store.setActiveSession(directory, "session_1")
    store.setMessages(directory, "session_1", [
      { info: userMessage("message_1", "session_1"), parts: [] },
      { info: assistantMessage("message_2", "session_1", "stop"), parts: [] },
    ])
    store.applySessionStatus(directory, "session_1", BUSY_SESSION_STATUS)
    store.applyMessageUpdated(directory, userMessage("message_3", "session_1"))

    store.setMessages(directory, "session_1", [
      { info: userMessage("message_1", "session_1"), parts: [] },
      { info: assistantMessage("message_2", "session_1", "stop"), parts: [] },
    ])

    let next = useChatStore.getState().directories[directory]
    expect(next?.messages.map((message) => message.info.id)).toEqual([
      "message_1",
      "message_2",
      "message_3",
    ])
    expect(next?.isBusy).toBe(true)

    store.applySessionStatus(directory, "session_1", IDLE_SESSION_STATUS)
    store.setMessages(directory, "session_1", [
      { info: userMessage("message_1", "session_1"), parts: [] },
      { info: assistantMessage("message_2", "session_1", "stop"), parts: [] },
    ])

    next = useChatStore.getState().directories[directory]
    expect(next?.messages.map((message) => message.info.id)).toEqual(["message_1", "message_2"])
    expect(next?.isBusy).toBe(false)
  })

  test("keeps live parts when a stale transcript snapshot lands during a run", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2)])
    store.setActiveSession(directory, "session_1")
    store.setMessages(directory, "session_1", [
      {
        info: assistantMessage("message_1", "session_1"),
        parts: [
          {
            id: "part_1",
            sessionID: "session_1",
            messageID: "message_1",
            type: "text",
            text: "hello",
          },
        ],
      },
    ])
    store.applySessionStatus(directory, "session_1", BUSY_SESSION_STATUS)
    store.applyPartDelta(directory, {
      sessionID: "session_1",
      messageID: "message_1",
      partID: "part_1",
      field: "text",
      delta: " there",
    })

    store.setMessages(directory, "session_1", [
      {
        info: assistantMessage("message_1", "session_1"),
        parts: [
          {
            id: "part_1",
            sessionID: "session_1",
            messageID: "message_1",
            type: "text",
            text: "hello",
          },
        ],
      },
    ])

    const next = useChatStore.getState().directories[directory]
    expect(next?.messages[0]?.parts[0]?.text).toBe("hello there")
    expect(next?.isBusy).toBe(true)
  })

  test("keeps a live active session when a stale session list omits it", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 1)])
    store.setActiveSession(directory, "session_2")
    store.applySessionStatus(directory, "session_2", BUSY_SESSION_STATUS)
    store.applyMessageUpdated(directory, userMessage("message_2", "session_2"))

    store.setSessions(directory, [session("session_1", 3)])

    const next = useChatStore.getState().directories[directory]
    expect(next?.sessionID).toBe("session_2")
    expect(next?.messages.map((message) => message.info.id)).toEqual(["message_2"])
    expect(next?.isBusy).toBe(true)
    expect(useChatStore.getState().lastSessionByDirectory[directory]).toBe("session_2")
  })

  test("drops an idle missing active session when session list no longer includes it", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 1)])
    store.setActiveSession(directory, "session_2")
    store.applyMessageUpdated(directory, userMessage("message_2", "session_2"))

    store.setSessions(directory, [session("session_1", 3)])

    const next = useChatStore.getState().directories[directory]
    expect(next?.sessionID).toBe("session_1")
    expect(next?.messages).toEqual([])
  })

  test("buffers part updates until the parent message arrives", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 1)])
    store.setActiveSession(directory, "session_1")
    store.applyPartUpdated(directory, {
      id: "part_1",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      text: "hello",
    })

    store.applyMessageUpdated(directory, assistantMessage("message_1", "session_1"))

    const next = useChatStore.getState().directories[directory]
    expect(next?.messages.map((message) => message.parts.map((part) => part.text))).toEqual([
      ["hello"],
    ])
  })

  test("applies buffered part deltas once the parent message appears", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 1)])
    store.setActiveSession(directory, "session_1")
    store.applyPartUpdated(directory, {
      id: "part_1",
      sessionID: "session_1",
      messageID: "message_1",
      type: "text",
      text: "hel",
    })
    store.applyPartDelta(directory, {
      sessionID: "session_1",
      messageID: "message_1",
      partID: "part_1",
      field: "text",
      delta: "lo",
    })

    store.applyMessageUpdated(directory, assistantMessage("message_1", "session_1"))

    const next = useChatStore.getState().directories[directory]
    expect(next?.messages[0]?.parts[0]?.text).toBe("hello")
  })

  test("preserves vendor retry metadata and keeps the session active", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2)])
    store.setActiveSession(directory, "session_1")

    store.applySessionStatus(directory, "session_1", {
      type: "retry",
      attempt: 2,
      message: "Rate Limited",
      next: 1_234,
    })

    const next = useChatStore.getState().directories[directory]
    expect(next?.sessionStatusByID["session_1"]).toEqual({
      type: "retry",
      attempt: 2,
      message: "Rate Limited",
      next: 1_234,
    })
    expect(next?.isBusy).toBe(true)
  })

  test("tracks permission request lifecycle with upsert semantics", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 1)])
    store.setActiveSession(directory, "session_1")

    store.applyPermissionAsked(directory, permissionRequest("perm_1", "session_1", "read"))
    store.applyPermissionAsked(directory, permissionRequest("perm_2", "session_1", "write"))
    store.applyPermissionAsked(directory, permissionRequest("perm_2", "session_1", "write-updated"))

    let next = useChatStore.getState().directories[directory]
    expect(next?.pendingPermissions.map((item) => item.id)).toEqual(["perm_1", "perm_2"])
    expect(next?.pendingPermissions.find((item) => item.id === "perm_2")?.permission).toBe(
      "write-updated",
    )

    store.applyPermissionReplied(directory, "perm_2")
    next = useChatStore.getState().directories[directory]
    expect(next?.pendingPermissions.map((item) => item.id)).toEqual(["perm_1"])
  })
})
