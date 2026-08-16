import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { setRuntimeServerConnection } from "../src/context/server"
import { deleteSession } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import { BUSY_SESSION_STATUS } from "../src/state/session-status"
import type { SessionInfo } from "../src/state/chat-types"

const DIRECTORY = "/workspace/delete-session-test"
const DELETED_SESSION_ID = "session-deleted"

function session(id: string, updated: number, parentID?: string): SessionInfo {
  return Object.assign(
    {
      id,
      title: id,
      time: {
        created: updated,
        updated,
      },
    },
    parentID === undefined ? undefined : { parentID },
  )
}

describe("deleteSession", () => {
  beforeEach(() => {
    localStorage.clear()
    useChatStore.setState({
      openProjects: [],
      activeDirectory: undefined,
      pendingActiveDirectory: undefined,
      entryError: undefined,
      lastSessionByDirectory: {},
      selectedModelByDirectory: {},
      activeReadingResourceByDirectory: {},
      lastOpenedReadingResourceByDirectory: {},
      directories: {},
      streamStatus: "idle",
    })
  })

  afterEach(() => {
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
  })

  test("treats an already-missing session as deleted", async () => {
    const store = useChatStore.getState()
    store.ensureOpenProject(DIRECTORY)
    store.setSessions(DIRECTORY, [session(DELETED_SESSION_ID, 1)])
    store.applySessionStatus(DIRECTORY, DELETED_SESSION_ID, BUSY_SESSION_STATUS)

    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      { preconnect: () => undefined },
    )

    try {
      await expect(
        deleteSession({
          directory: DIRECTORY,
          sessionID: DELETED_SESSION_ID,
        }),
      ).resolves.toBeTrue()

      expect(useChatStore.getState().directories[DIRECTORY]).toMatchObject({
        isBusy: false,
        isDraft: true,
        sessionID: undefined,
        sessions: [],
        sessionStatusByID: {},
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("preserves local session state when the notebook directory is missing", async () => {
    const store = useChatStore.getState()
    store.ensureOpenProject(DIRECTORY)
    store.setSessions(DIRECTORY, [session(DELETED_SESSION_ID, 1)])
    store.setActiveSession(DIRECTORY, DELETED_SESSION_ID)

    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ error: `Directory not found: ${DIRECTORY}` }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      { preconnect: () => undefined },
    )

    try {
      await expect(
        deleteSession({
          directory: DIRECTORY,
          sessionID: DELETED_SESSION_ID,
        }),
      ).rejects.toThrow(`Directory not found: ${DIRECTORY}`)

      expect(useChatStore.getState().directories[DIRECTORY]).toMatchObject({
        isDraft: false,
        sessionID: DELETED_SESSION_ID,
        sessions: [{ id: DELETED_SESSION_ID }],
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  test("removes a deleted active family and selects the next session while busy", async () => {
    const root = session("session-root", 3)
    const child = session("session-child", 2, root.id)
    const successor = session("session-successor", 1)
    const store = useChatStore.getState()
    store.ensureOpenProject(DIRECTORY)
    store.setSessions(DIRECTORY, [root, child, successor])
    store.setActiveSession(DIRECTORY, child.id)
    store.applySessionStatus(DIRECTORY, child.id, BUSY_SESSION_STATUS)

    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const previousFetch = globalThis.fetch
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify(true), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      { preconnect: () => undefined },
    )

    try {
      await expect(
        deleteSession({
          directory: DIRECTORY,
          sessionID: root.id,
        }),
      ).resolves.toBeTrue()

      expect(useChatStore.getState()).toMatchObject({
        lastSessionByDirectory: {
          [DIRECTORY]: successor.id,
        },
        directories: {
          [DIRECTORY]: {
            isBusy: false,
            isDraft: false,
            sessionID: successor.id,
            sessions: [successor],
            sessionStatusByID: {
              [successor.id]: { type: "idle" },
            },
          },
        },
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
