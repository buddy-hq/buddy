import { afterEach, beforeEach, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { z } from "zod"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { PromptAccessMode } from "../src/components/prompt/components/prompt-access-mode-select"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import {
  chatAccessQueryKeys,
  chatAccessQueryOptions,
} from "../src/lib/directory-chat/chat-access-query"
import { useChatAccessMode } from "../src/lib/directory-chat/use-chat-access-mode"
import { useChatAccessModeStore } from "../src/state/chat-access-mode-store"
import { useChatStore } from "../src/state/chat-store"
import { installTestFetch, restoreTestFetch, seedDirectoryChatState } from "./test-utils"

type AccessState = ReturnType<typeof useChatAccessMode>
type AccessInput = Parameters<typeof useChatAccessMode>[0]

const DIRECTORY = "/access-mode-notebook"
const serverConnection = getServerConnection()
const originalFetch = globalThis.fetch
let queryClient: QueryClient
let container: HTMLDivElement
let root: Root
let current: AccessState | undefined
let handler: (request: Request) => Promise<Response>
let requests: string[]

function Probe(props: { input: AccessInput }) {
  current = useChatAccessMode(props.input)
  return null
}

function state(): AccessState {
  if (!current) throw new Error("Expected the chat access hook to render")
  return current
}

async function waitForState(matches: (value: AccessState) => boolean): Promise<void> {
  const deadline = Date.now() + 2_000
  while (true) {
    if (current && matches(current)) return
    if (Date.now() >= deadline) {
      throw new Error(`Chat access state did not settle: ${JSON.stringify(current)}`)
    }
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(input: AccessInput) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe input={input} />
      </QueryClientProvider>,
    )
  })
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  current = undefined
  requests = []
  handler = async () => Response.json({ mode: "default" })
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  useChatStore.getState().resetRuntimeState()
  installTestFetch(async (input, init) => {
    const request = new Request(input, init)
    requests.push(`${request.method} ${new URL(request.url).pathname}`)
    return handler(request)
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  useChatAccessModeStore.setState({ lastModeByDirectory: {} })
  useChatStore.getState().resetRuntimeState()
  restoreTestFetch(originalFetch)
  setRuntimeServerConnection(serverConnection)
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
})

test("drafts use the notebook's remembered mode and expose the selector's translated options", async () => {
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "full")
  await render({ directory: DIRECTORY })
  expect(state().mode).toBe("full")
  expect(state().showSelector).toBe(true)
  expect(state().isChild).toBe(false)
  expect(state().options).toEqual([
    {
      mode: "supervised",
      label: "Supervised",
      description: "Asks before commands, file changes and web access.",
    },
    {
      mode: "default",
      label: "Default",
      description: "Works freely in this notebook and asks before going outside it.",
    },
    {
      mode: "full",
      label: "Full access",
      description:
        "Never asks. Buddy can read and change any file and run any command on this computer.",
    },
  ])

  await act(async () => state().onModeChange("supervised"))
  expect(state().mode).toBe("supervised")
  await render({ directory: "/another-notebook" })
  expect(state().mode).toBe("default")
  await render({ directory: DIRECTORY })
  expect(state().mode).toBe("supervised")
  expect(requests).toEqual([])
})

test("an existing chat reads its own mode and remembers a change only after PUT succeeds", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let mode: PromptAccessMode = "supervised"
  let submitted: unknown
  handler = async (request) => {
    if (request.method === "PUT") {
      submitted = await request.json()
      entered.resolve()
      await release.promise
      mode = "full"
    }
    return Response.json({ mode })
  }
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => value.mode === "supervised")
  expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBeUndefined()

  try {
    await act(async () => {
      state().onModeChange("full")
      await entered.promise
    })
    expect(state().mode).toBe("supervised")
    expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBeUndefined()
    expect(submitted).toEqual({ mode: "full" })
    release.resolve()
    await waitForState((value) => value.mode === "full" && !value.isPending)
    expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBe("full")
    expect(requests).toEqual([
      "GET /api/session/root/access",
      "PUT /api/session/root/access",
      "GET /api/session/root/access",
    ])

    mode = "default"
    await render({ directory: DIRECTORY, sessionID: "another-root" })
    await waitForState((value) => !value.isPending)
    expect(state().mode).toBe("default")
    expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBe("full")
  } finally {
    release.resolve()
  }
})

test("a failed change preserves the chat and notebook modes and exposes the request error", async () => {
  handler = async (request) =>
    request.method === "PUT"
      ? Response.json(
          { error: "Mode update failed", code: "chat_access.unreadable" },
          { status: 500 },
        )
      : Response.json({ mode: "supervised" })
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "default")
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => value.mode === "supervised")

  await act(async () => state().onModeChange("full"))
  await waitForState((value) => value.error !== null)

  expect(state().mode).toBe("supervised")
  expect(state().error?.message).toBe("Mode update failed")
  expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBe("default")
  expect(useChatStore.getState().directories[DIRECTORY]?.error?.message).toBe("Mode update failed")
})

test("a child reads its inherited mode and cannot change or remember a mode", async () => {
  seedDirectoryChatState(DIRECTORY, {
    sessions: [{ id: "child", parentID: "root", title: "Child", time: { created: 1, updated: 1 } }],
  })
  handler = async () => Response.json({ mode: "full" })
  await render({ directory: DIRECTORY, sessionID: "child" })
  await waitForState((value) => value.mode === "full")

  expect(state().isChild).toBe(true)
  expect(state().showSelector).toBe(false)
  await act(async () => state().onModeChange("default"))
  expect(state().mode).toBe("full")
  expect(requests).toEqual(["GET /api/session/child/access"])
  expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBeUndefined()
})

test("in-flight and queued changes stay with their original chat when the hook navigates", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const otherEntered = Promise.withResolvers<void>()
  const otherRelease = Promise.withResolvers<void>()
  const modes = new Map<string, PromptAccessMode>()
  const changes: string[] = []
  handler = async (request) => {
    const sessionID = new URL(request.url).pathname.split("/")[3]
    if (!sessionID) throw new Error("Expected a session access request")
    if (request.method === "PUT") {
      const { mode } = z
        .object({ mode: z.enum(["supervised", "default", "full"]) })
        .parse(await request.json())
      changes.push(`${sessionID}:${mode}`)
      if (sessionID === "root" && mode === "full") {
        entered.resolve()
        await release.promise
      }
      if (sessionID === "other-root") {
        otherEntered.resolve()
        await otherRelease.promise
      }
      modes.set(sessionID, mode)
    }
    return Response.json({ mode: modes.get(sessionID) ?? "default" })
  }
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => !value.isPending)
  try {
    await act(async () => {
      state().onModeChange("full")
      await entered.promise
    })
    const firstChange = queryClient.getMutationCache().getAll()[0]
    if (!firstChange) throw new Error("Expected the first access change")
    await act(async () => state().onModeChange("supervised"))
    await waitForState(() =>
      queryClient
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.isPaused),
    )
    await render({ directory: "/other", sessionID: "other-root" })
    await act(async () => {
      state().onModeChange("full")
      await otherEntered.promise
    })
    release.resolve()
    await waitForState(() => firstChange.state.status === "success")
    otherRelease.resolve()
    await waitForState((value) => value.mode === "full" && !value.isPending)
    await render({ directory: DIRECTORY, sessionID: "root" })
    await waitForState((value) => !value.isPending)
    expect(state().mode).toBe("supervised")
    expect(changes).toEqual(["root:full", "other-root:full", "root:supervised"])
    expect(useChatAccessModeStore.getState().lastModeByDirectory).toEqual({
      [DIRECTORY]: "supervised",
      "/other": "full",
    })
  } finally {
    release.resolve()
    otherRelease.resolve()
  }
})

test("returning to a chat while its access change is still running keeps the change pending", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let rootMode: PromptAccessMode = "default"
  handler = async (request) => {
    if (new URL(request.url).pathname !== "/api/session/root/access") {
      return Response.json({ mode: "default" })
    }
    if (request.method === "PUT") {
      entered.resolve()
      await release.promise
      rootMode = "full"
    }
    return Response.json({ mode: rootMode })
  }
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => !value.isPending)
  try {
    await act(async () => {
      state().onModeChange("full")
      await entered.promise
    })
    await render({ directory: "/other", sessionID: "other-root" })
    await waitForState((value) => !value.isPending)
    await render({ directory: DIRECTORY, sessionID: "root" })
    await waitForState(
      () =>
        queryClient.getQueryState(chatAccessQueryKeys.session(DIRECTORY, "root"))?.fetchStatus ===
        "idle",
    )
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
    expect(state().mode).toBe("default")
    expect(state().isPending).toBe(true)

    release.resolve()
    await waitForState((value) => value.mode === "full" && !value.isPending)
  } finally {
    release.resolve()
  }
})

test("reads started during a PUT cannot overwrite the reconciled root and child modes", async () => {
  const putEntered = Promise.withResolvers<void>()
  const releasePut = Promise.withResolvers<void>()
  const readEntered = Promise.withResolvers<Request>()
  const releaseRead = Promise.withResolvers<void>()
  const readDelivered = Promise.withResolvers<void>()
  let mode: PromptAccessMode = "default"
  let holdRead = false
  handler = async (request) => {
    if (request.method === "PUT") {
      putEntered.resolve()
      await releasePut.promise
      mode = "full"
      return Response.json({ mode })
    }
    const snapshot = mode
    if (holdRead) {
      holdRead = false
      readEntered.resolve(request)
      await releaseRead.promise
      readDelivered.resolve()
    }
    return Response.json({ mode: snapshot })
  }
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => !value.isPending)
  await queryClient.fetchQuery(chatAccessQueryOptions(DIRECTORY, "child"))
  try {
    await act(async () => {
      state().onModeChange("full")
      await putEntered.promise
    })
    holdRead = true
    const interveningRead = queryClient.refetchQueries({
      queryKey: chatAccessQueryKeys.session(DIRECTORY, "root"),
    })
    const request = await readEntered.promise
    releasePut.resolve()
    await waitForState((value) => value.mode === "full" && !value.isPending)
    expect(request.signal.aborted).toBe(true)
    expect(
      queryClient.getQueryData<{ mode: PromptAccessMode }>(
        chatAccessQueryKeys.session(DIRECTORY, "child"),
      ),
    ).toEqual({ mode: "full" })

    await act(async () => {
      releaseRead.resolve()
      await readDelivered.promise
      await interveningRead
    })

    expect(state().mode).toBe("full")
    expect(state().isPending).toBe(false)
    expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBe("full")
  } finally {
    releasePut.resolve()
    releaseRead.resolve()
  }
})

test("a PUT that applies Full then returns 500 stays unconfirmed until the server read succeeds", async () => {
  const readEntered = Promise.withResolvers<void>()
  const releaseRead = Promise.withResolvers<void>()
  let mode: PromptAccessMode = "default"
  handler = async (request) => {
    if (request.method === "PUT") {
      mode = "full"
      return Response.json({ error: "Reply lost after applying mode" }, { status: 500 })
    }
    if (mode === "full") {
      readEntered.resolve()
      await releaseRead.promise
    }
    return Response.json({ mode })
  }
  useChatAccessModeStore.getState().setLastMode(DIRECTORY, "supervised")
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => !value.isPending)
  try {
    await act(async () => {
      state().onModeChange("full")
      await readEntered.promise
    })
    await waitForState((value) => value.isPending)
    expect(state().isPending).toBe(true)
    expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBe("supervised")

    releaseRead.resolve()
    await waitForState((value) => value.mode === "full" && !value.isPending)

    expect(state().error?.message).toBe("Reply lost after applying mode")
    expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBe("supervised")
  } finally {
    releaseRead.resolve()
  }
})

test("a failed reconciliation read leaves the mode unconfirmed until a later successful read", async () => {
  let applied = false
  let readFails = true
  handler = async (request) => {
    if (request.method === "PUT") {
      applied = true
      return Response.json({ error: "Mode response lost" }, { status: 500 })
    }
    if (applied && readFails) {
      return Response.json({ error: "Access read failed" }, { status: 500 })
    }
    return Response.json({ mode: applied ? "full" : "default" })
  }
  await render({ directory: DIRECTORY, sessionID: "root" })
  await waitForState((value) => !value.isPending)

  await act(async () => state().onModeChange("full"))
  await waitForState((value) => value.error?.message === "Mode response lost")
  expect(state().isPending).toBe(true)
  expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBeUndefined()

  readFails = false
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: chatAccessQueryKeys.directory(DIRECTORY) })
  })
  await waitForState((value) => value.mode === "full" && !value.isPending)
  expect(useChatAccessModeStore.getState().lastModeByDirectory[DIRECTORY]).toBeUndefined()
})
