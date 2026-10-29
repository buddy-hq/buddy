import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { SessionInfo } from "../src/state/chat-types"
import type { V1ImportReport } from "../src/state/v1-import-query"

const DIRECTORY = "/workspace/restore-imported-session"
const A: SessionInfo = { id: "A", title: "Chat A", time: { created: 1, updated: 1 } }
const B: SessionInfo = { id: "B", title: "Chat B", time: { created: 2, updated: 2 } }
let listedSessions: SessionInfo[] = []

function response<T>(data: T) {
  return { data, error: undefined, response: new Response(null, { status: 200 }) }
}

function importReport(status: "running" | "completed"): V1ImportReport {
  return {
    upgrade: { state: "ready" },
    import:
      status === "running" ? { status, progress: { label: "Migrating sessions" } } : { status },
    importRan: true,
    skipped: [],
    content: [],
  }
}

const buddyClient = await import("../src/lib/buddy-client")
mock.module("@/lib/buddy-client", () => ({
  ...buddyClient,
  getBuddyClient: () => ({
    session: {
      list: async () => response(listedSessions),
      messages: async () => response([]),
      status: async () => response({}),
      delete: async () => response(true),
      get: async () => ({
        data: undefined,
        error: { message: "Session not found" },
        response: new Response(null, { status: 404 }),
      }),
    },
    permission: { list: async () => response([]) },
    provider: {
      auth: async () => response({}),
      list: async () => response({ all: [], connected: [], default: {} }),
      openai: { modelAvailability: { get: async () => response({ status: "error" }) } },
    },
    mcp: { status: async () => response({}) },
  }),
}))

const [
  { deleteSession, ensureDirectorySession, loadSessions, selectSession, startNewSessionDraft },
  { useChatStore },
  { resetTranscriptRepositoryForTests },
  { appQueryClient },
  { v1ImportQueryKeys },
] = await Promise.all([
  import("../src/state/chat-actions"),
  import("../src/state/chat-store"),
  import("../src/state/transcript-repository"),
  import("../src/state/query-client"),
  import("../src/state/v1-import-query"),
])

function selections() {
  return {
    active: mock<(directory: string, sessionID: string) => void>(() => undefined),
    inactive: mock<(directory: string, sessionID: string) => void>(() => undefined),
  }
}

describe("restoring the last open chat after import", () => {
  beforeEach(() => {
    startNewSessionDraft(DIRECTORY)
    localStorage.clear()
    resetTranscriptRepositoryForTests()
    appQueryClient.clear()
    listedSessions = [B]
    useChatStore.setState({
      directories: {},
      lastSessionByDirectory: { [DIRECTORY]: "A" },
      openProjects: [DIRECTORY],
      activeDirectory: DIRECTORY,
    })
    appQueryClient.setQueryData(v1ImportQueryKeys.all(), importReport("running"))
  })

  afterEach(() => {
    startNewSessionDraft(DIRECTORY)
    useChatStore.setState({
      directories: {},
      lastSessionByDirectory: {},
      openProjects: [],
      activeDirectory: undefined,
    })
    resetTranscriptRepositoryForTests()
    appQueryClient.clear()
    localStorage.clear()
  })

  test.each([
    { activeDirectory: `${DIRECTORY}/`, target: "active" as const },
    { activeDirectory: "/workspace/another-notebook", target: "inactive" as const },
  ])(
    "preserves A and restores it once through the $target selection path",
    async ({ activeDirectory, target }) => {
      useChatStore.setState({ activeDirectory })
      await ensureDirectorySession(DIRECTORY)

      expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBe("B")
      expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")

      await loadSessions(DIRECTORY)
      expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")

      const { restoreAwaitedImportedSession } = await import("../src/lib/restore-imported-session")
      const select = selections()
      await restoreAwaitedImportedSession(DIRECTORY, [B], select)
      expect(select.active.mock.calls).toEqual([])
      expect(select.inactive.mock.calls).toEqual([])

      await restoreAwaitedImportedSession(DIRECTORY, [B, A], select)
      expect(select[target].mock.calls).toEqual([[DIRECTORY, "A"]])
      expect(select[target === "active" ? "inactive" : "active"].mock.calls).toEqual([])

      await restoreAwaitedImportedSession(DIRECTORY, [B, A], select)
      expect(select[target].mock.calls).toEqual([[DIRECTORY, "A"]])
      expect(useChatStore.getState().activeDirectory).toBe(activeDirectory)
    },
  )

  test("keeps the learner's explicit chat choice", async () => {
    await ensureDirectorySession(DIRECTORY)
    await expect(selectSession(DIRECTORY, "B")).resolves.toMatchObject({ outcome: "requested" })
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("B")

    const { restoreAwaitedImportedSession } = await import("../src/lib/restore-imported-session")
    const select = selections()
    await restoreAwaitedImportedSession(DIRECTORY, [B, A], select)
    expect(select.active.mock.calls).toEqual([])
    expect(select.inactive.mock.calls).toEqual([])
  })

  test("deleting a chat cancels the pending switch", async () => {
    await ensureDirectorySession(DIRECTORY)
    listedSessions = []
    await deleteSession({ directory: DIRECTORY, sessionID: "B" })

    const { restoreAwaitedImportedSession } = await import("../src/lib/restore-imported-session")
    const select = selections()
    await restoreAwaitedImportedSession(DIRECTORY, [A], select)
    expect(select.active.mock.calls).toEqual([])
    expect(select.inactive.mock.calls).toEqual([])
  })

  test("saves B when the import is already completed", async () => {
    appQueryClient.setQueryData(v1ImportQueryKeys.all(), importReport("completed"))
    await ensureDirectorySession(DIRECTORY)

    expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBe("B")
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("B")

    const { restoreAwaitedImportedSession } = await import("../src/lib/restore-imported-session")
    const select = selections()
    await restoreAwaitedImportedSession(DIRECTORY, [B, A], select)
    expect(select.active.mock.calls).toEqual([])
    expect(select.inactive.mock.calls).toEqual([])
  })

  test("keeps A through an empty import list and restores it from the draft", async () => {
    listedSessions = []
    await ensureDirectorySession(DIRECTORY)

    expect(useChatStore.getState().directories[DIRECTORY]).toMatchObject({
      isDraft: true,
      sessionID: undefined,
    })
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")
    await loadSessions(DIRECTORY)
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")

    const { restoreAwaitedImportedSession } = await import("../src/lib/restore-imported-session")
    const select = selections()
    await restoreAwaitedImportedSession(DIRECTORY, [A], select)
    expect(select.active.mock.calls).toEqual([[DIRECTORY, "A"]])
    expect(select.inactive.mock.calls).toEqual([])
  })

  test("keepLastSession preserves A while retaining normal list selection", () => {
    const store = useChatStore.getState()
    store.setSessions(DIRECTORY, [B], { keepLastSession: true })
    expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBe("B")
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")

    store.setSessions(DIRECTORY, [])
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBeUndefined()
  })

  test("keepLastSession preserves A when the list is empty", () => {
    useChatStore.getState().setSessions(DIRECTORY, [], { keepLastSession: true })
    expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBeUndefined()
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")
  })

  test("setSessions without options saves the selected chat", () => {
    useChatStore.getState().setSessions(DIRECTORY, [B])
    expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBe("B")
    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("B")
  })

  test("setLastSessionID changes only the saved ID", () => {
    const store = useChatStore.getState()
    store.setSessions(DIRECTORY, [B])
    const directories = useChatStore.getState().directories
    store.setLastSessionID(DIRECTORY, "A")

    expect(useChatStore.getState().lastSessionByDirectory[DIRECTORY]).toBe("A")
    expect(useChatStore.getState().directories).toBe(directories)
  })
})
