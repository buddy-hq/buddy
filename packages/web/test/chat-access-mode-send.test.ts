import { afterEach, beforeEach, expect, test } from "bun:test"
import { z } from "zod"
import { createJSONStorage } from "zustand/middleware"
import type { PromptAccessMode } from "../src/components/prompt/components/prompt-access-mode-select"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { loadSessions, sendCommand, sendPrompt } from "../src/state/chat-actions"
import { useChatAccessModeStore } from "../src/state/chat-access-mode-store"
import { useChatStore } from "../src/state/chat-store"
import { useModelSelectionStore } from "../src/state/model-selection-store"
import { appQueryClient } from "../src/state/query-client"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import type { SessionInfo } from "../src/state/chat-types"
import { installTestFetch, restoreTestFetch, seedDirectoryChatState } from "./test-utils"

const DIRECTORY = "/access-mode-send-notebook"
const accessBodySchema = z.object({ mode: z.enum(["supervised", "default", "full"]) })
const originalFetch = globalThis.fetch
const serverConnection = getServerConnection()
const originalStorage = useChatAccessModeStore.persist.getOptions().storage
let sessions: SessionInfo[]
let modes: Map<string, PromptAccessMode>
let operations: string[]
let executions: Array<{ sessionID: string; mode: PromptAccessMode }>
let failAccessUpdate: boolean
let waitForAccessUpdate: (() => Promise<void>) | undefined

beforeEach(() => {
  sessions = []
  modes = new Map()
  operations = []
  executions = []
  failAccessUpdate = false
  waitForAccessUpdate = undefined
  useChatStore.getState().resetRuntimeState()
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  seedDirectoryChatState(DIRECTORY, { isReady: true })
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  installTestFetch(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === "/api/session" && request.method === "POST") {
      const session = {
        id: `ses_${sessions.length + 1}`,
        title: "New chat",
        directory: DIRECTORY,
        time: { created: 1, updated: 1 },
      }
      sessions.push(session)
      modes.set(session.id, "default")
      operations.push(`create ${session.id}`)
      return Response.json(session)
    }
    if (path === "/api/session") return Response.json(sessions)
    const match = /^\/api\/session\/([^/]+)\/(access|prompt_async|command)$/u.exec(path)
    const sessionID = match?.[1]
    const operation = match?.[2]
    if (!sessionID) throw new Error(`Unexpected request: ${request.method} ${path}`)
    if (operation === "access") {
      const { mode } = accessBodySchema.parse(await request.json())
      operations.push(`access ${sessionID} ${mode}`)
      await waitForAccessUpdate?.()
      if (failAccessUpdate) {
        return Response.json({ error: "Mode update failed" }, { status: 500 })
      }
      modes.set(sessionID, mode)
      return Response.json({ mode })
    }
    executions.push({ sessionID, mode: modes.get(sessionID) ?? "default" })
    operations.push(`${operation} ${sessionID}`)
    if (operation === "command") {
      return Response.json(sessions.find((session) => session.id === sessionID))
    }
    return new Response(null, { status: 204 })
  })
})

afterEach(async () => {
  await loadSessions(DIRECTORY)
  useChatStore.getState().resetRuntimeState()
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  useModelSelectionStore.setState(useModelSelectionStore.getInitialState())
  resetTranscriptRepositoryForTests()
  appQueryClient.clear()
  restoreTestFetch(originalFetch)
  setRuntimeServerConnection(serverConnection)
})

for (const mode of ["supervised", "full", "default"] as const) {
  test(`a new chat starts its first prompt with the remembered ${mode} mode`, async () => {
    useChatAccessModeStore.getState().setLastMode(DIRECTORY, mode)

    const sessionID = await sendPrompt(DIRECTORY, "Hello", { optimistic: false })

    expect(sessionID).toBe("ses_1")
    expect(executions).toEqual([{ sessionID: "ses_1", mode }])
    expect(operations).toEqual(
      mode === "default"
        ? ["create ses_1", "prompt_async ses_1"]
        : ["create ses_1", `access ses_1 ${mode}`, "prompt_async ses_1"],
    )
  })
}

test("sending to an existing chat preserves its mode even when the notebook remembers Full", async () => {
  const session = { id: "existing", title: "Existing", time: { created: 1, updated: 1 } }
  sessions.push(session)
  modes.set(session.id, "supervised")
  seedDirectoryChatState(DIRECTORY, { sessionID: session.id, sessions: [session], isReady: true })
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "full")

  await sendPrompt(DIRECTORY, "Hello", { optimistic: false })

  expect(executions).toEqual([{ sessionID: "existing", mode: "supervised" }])
  expect(operations).toEqual(["prompt_async existing"])
})

test("a failed access update prevents the first prompt and a retry applies the remembered mode", async () => {
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "supervised")
  failAccessUpdate = true

  await expect(sendPrompt(DIRECTORY, "Hello", { optimistic: false })).rejects.toThrow(
    "Mode update failed",
  )

  expect(executions).toEqual([])
  expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBeUndefined()
  expect(useChatStore.getState().directories[DIRECTORY]?.error?.message).toBe("Mode update failed")
  failAccessUpdate = false
  await sendPrompt(DIRECTORY, "Try again", { optimistic: false })
  expect(executions).toEqual([{ sessionID: "ses_2", mode: "supervised" }])
})

test("overlapping first sends both wait for the new chat's remembered mode", async () => {
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "full")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  waitForAccessUpdate = () => {
    entered.resolve()
    return release.promise
  }
  const first = sendPrompt(DIRECTORY, "One", { optimistic: false })
  const second = sendPrompt(DIRECTORY, "Two", { optimistic: false })
  try {
    await entered.promise
    expect(executions).toEqual([])
    expect(useChatStore.getState().directories[DIRECTORY]?.sessionID).toBeUndefined()
    release.resolve()
    await Promise.all([first, second])
    expect(executions).toEqual([
      { sessionID: "ses_1", mode: "full" },
      { sessionID: "ses_1", mode: "full" },
    ])
    expect(operations).toEqual([
      "create ses_1",
      "access ses_1 full",
      "prompt_async ses_1",
      "prompt_async ses_1",
    ])
  } finally {
    release.resolve()
    await Promise.allSettled([first, second])
  }
})

test("a slash command used as the first send also gets the remembered mode", async () => {
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "supervised")

  await sendCommand(DIRECTORY, "review", "notes")

  expect(executions).toEqual([{ sessionID: "ses_1", mode: "supervised" }])
  expect(operations).toEqual(["create ses_1", "access ses_1 supervised", "command ses_1"])
})

test("a rejected storage read blocks the first send before session creation, and the next send reads again", async () => {
  let reads = 0
  let readFails = true
  useChatAccessModeStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: async () => {
        reads += 1
        if (readFails) throw new Error("Storage read failed")
        return JSON.stringify({
          version: 1,
          state: { lastModeByDirectory: { [DIRECTORY]: "supervised" } },
        })
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    })),
  })
  try {
    await useChatAccessModeStore.persist.rehydrate()
    expect(useChatAccessModeStore.persist.hasHydrated()).toBe(false)

    await expect(sendPrompt(DIRECTORY, "Hello", { optimistic: false })).rejects.toThrow(
      "The notebook's access mode could not be loaded. Try sending again.",
    )

    expect(sessions).toEqual([])
    expect(executions).toEqual([])
    expect(operations).toEqual([])
    expect(reads).toBe(2)
    expect(useChatStore.getState().directories[DIRECTORY]?.error?.message).toBe(
      "The notebook's access mode could not be loaded. Try sending again.",
    )

    readFails = false
    await sendPrompt(DIRECTORY, "Try again", { optimistic: false })

    expect(reads).toBe(3)
    expect(executions).toEqual([{ sessionID: "ses_1", mode: "supervised" }])
    expect(operations).toEqual(["create ses_1", "access ses_1 supervised", "prompt_async ses_1"])
  } finally {
    useChatAccessModeStore.persist.setOptions({ storage: originalStorage })
    await useChatAccessModeStore.persist.rehydrate()
  }
})

test("the first send shares a held hydration and waits for both notebook choices to be saved", async () => {
  const earlyDirectory = "/early-access-mode-notebook"
  let saved: string | null = JSON.stringify({
    version: 1,
    state: { lastModeByDirectory: { [earlyDirectory]: "full", [DIRECTORY]: "supervised" } },
  })
  const snapshot = saved
  const loaded = Promise.withResolvers<string | null>()
  const writeEntered = Promise.withResolvers<void>()
  const releaseWrite = Promise.withResolvers<void>()
  let reads = 0
  let holdWrite = false
  useChatAccessModeStore.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: async () => {
        reads += 1
        return reads === 1 ? loaded.promise : saved
      },
      setItem: async (_key, value) => {
        if (holdWrite) {
          writeEntered.resolve()
          await releaseWrite.promise
        }
        saved = value
      },
      removeItem: () => undefined,
    })),
  })
  const hydration = useChatAccessModeStore.persist.rehydrate()
  useChatAccessModeStore.getState().setLastMode(earlyDirectory, "supervised")
  const sending = sendPrompt(DIRECTORY, "Hello", { optimistic: false })
  try {
    expect(reads).toBe(1)
    expect(operations).toEqual([])
    holdWrite = true
    loaded.resolve(snapshot)
    await writeEntered.promise
    expect(operations).toEqual([])
    releaseWrite.resolve()
    await hydration
    await sending

    expect(executions).toEqual([{ sessionID: "ses_1", mode: "supervised" }])
    expect(operations).toEqual(["create ses_1", "access ses_1 supervised", "prompt_async ses_1"])
    if (!saved) throw new Error("Expected both notebook choices to be saved")
    expect(JSON.parse(saved)).toEqual({
      version: 1,
      state: {
        lastModeByDirectory: { [earlyDirectory]: "supervised", [DIRECTORY]: "supervised" },
      },
    })

    const persisted = saved
    holdWrite = false
    useChatAccessModeStore.setState({ lastModeByDirectory: {} })
    saved = persisted
    await useChatAccessModeStore.persist.rehydrate()
    expect(useChatAccessModeStore.getState().lastModeByDirectory).toEqual({
      [earlyDirectory]: "supervised",
      [DIRECTORY]: "supervised",
    })
  } finally {
    holdWrite = false
    loaded.resolve(snapshot)
    releaseWrite.resolve()
    await Promise.allSettled([hydration, sending])
    useChatAccessModeStore.persist.setOptions({ storage: originalStorage })
    await useChatAccessModeStore.persist.rehydrate()
  }
})
