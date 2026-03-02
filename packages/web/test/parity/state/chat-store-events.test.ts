import { beforeEach, describe, expect, test } from "bun:test"
import { useChatStore } from "../../../src/state/chat-store"
import type { MessageInfo, PermissionRequest, SessionInfo } from "../../../src/state/chat-types"

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
  id,
  sessionID,
  role: "user",
  time: { created: Date.now() },
})

const assistantMessage = (id: string, sessionID: string, finish?: string): MessageInfo => ({
  id,
  sessionID,
  role: "assistant",
  time: { created: Date.now() },
  finish,
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
  test("tracks transient entry errors for route handoff", () => {
    const store = useChatStore.getState()

    store.setEntryError("Directory is outside allowed roots")
    expect(useChatStore.getState().entryError).toBe("Directory is outside allowed roots")

    store.setEntryError(undefined)
    expect(useChatStore.getState().entryError).toBeUndefined()
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
    store.setMessages(directory, "session_1", [{ info: assistantMessage("message_1", "session_1"), parts: [] }])
    store.applySessionStatus(directory, "session_1", "busy")
    store.applySessionStatus(directory, "session_2", "idle")
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

  test("ignores message updates from inactive sessions", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2), session("session_2", 1)])
    store.setActiveSession(directory, "session_1")

    store.applyMessageUpdated(directory, userMessage("message_other", "session_2"))
    expect(useChatStore.getState().directories[directory]?.messages).toEqual([])

    store.applyMessageUpdated(directory, assistantMessage("message_active", "session_1"))
    const next = useChatStore.getState().directories[directory]
    expect(next?.messages.map((message) => message.info.id)).toEqual(["message_active"])
    expect(next?.isBusy).toBe(true)

    store.applyMessageUpdated(directory, assistantMessage("message_active", "session_1", "stop"))
    expect(useChatStore.getState().directories[directory]?.isBusy).toBe(false)
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
    expect(next?.pendingPermissions.find((item) => item.id === "perm_2")?.permission).toBe("write-updated")

    store.applyPermissionReplied(directory, "perm_2")
    next = useChatStore.getState().directories[directory]
    expect(next?.pendingPermissions.map((item) => item.id)).toEqual(["perm_1"])
  })
})
