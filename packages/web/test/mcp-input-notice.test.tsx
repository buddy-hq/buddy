import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ToolPart } from "@buddy/transcript-contract/message"
import { McpInputNotice } from "../src/components/directory-chat/mcp-input-notice"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { DirectoryChatMainPane } from "../src/components/directory-chat/directory-chat-main-pane"
import { DirectoryWorkspaceProvider } from "../src/components/directory-chat/directory-workspace-context"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { useDirectoryChatPageController } from "../src/lib/directory-chat/use-directory-chat-page-controller"
import { encodeDirectory } from "../src/lib/directory-token"
import { usePromptStore } from "../src/state/prompt-store"
import { seedSkillPresentations } from "./query-test-utils"
import { useChatStore } from "../src/state/chat-store"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createProviderInfo,
  createProviderModelInfo,
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
} from "./test-utils"

const DIRECTORY = "/mcp-notebook"
const SESSION = "ses_mcp"
const request = {
  requestID: "frm_input",
  server: "Docs Server",
  message: "Confirm account access",
  toolPrefix: "Docs_Server",
}
const initialStore = useChatStore.getState()
let container: HTMLDivElement
let root: Root

function message(
  tool = "Docs_Server_search",
  status: "running" | "completed" = "running",
  toolCalls: ToolPart["state"]["metadata"] = {},
) {
  const part: ToolPart = {
    id: "part_mcp",
    sessionID: SESSION,
    messageID: "msg_mcp",
    type: "tool",
    callID: "call_mcp",
    tool,
    state:
      status === "running"
        ? { status, input: {}, metadata: toolCalls, time: { start: 1 } }
        : { status, input: {}, output: "Done", metadata: toolCalls, time: { start: 1, end: 2 } },
  }
  return createMessageWithParts(createAssistantMessageInfo({ id: "msg_mcp", sessionID: SESSION }), [
    part,
  ])
}

function seedNotice(input = message()) {
  useChatStore.getState().ensureOpenProject(DIRECTORY)
  seedDirectoryChatState(DIRECTORY, {
    sessionID: SESSION,
    sessions: [{ id: SESSION, title: "MCP", time: { created: 1, updated: 1 } }],
    sessionStatusByID: { [SESSION]: { type: "busy" } },
    isBusy: true,
    messages: [input],
  })
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  useChatStore.getState().clearMcpInputRequests()
  seedNotice()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useChatStore.getState().clearMcpInputRequests()
  useChatStore.setState(initialStore)
  resetTranscriptRepositoryForTests()
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

test("shows matching direct calls in the pane and Stop aborts only that chat", async () => {
  const originalFetch = globalThis.fetch
  const connection = getServerConnection()
  const promptState = usePromptStore.getState()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const aborted: string[] = []
  const stopped = Promise.withResolvers<void>()
  const noticed = Promise.withResolvers<void>()
  let didAbort = false
  const session = {
    id: SESSION,
    title: "MCP",
    directory: DIRECTORY,
    time: { created: 1, updated: 1 },
  }
  const model = createProviderModelInfo({ id: "test-model", providerID: "test" })
  const provider = createProviderInfo({ id: "test", connected: true, models: [model] })
  const messages = [message()]
  const storage = new Map<string, string>()
  const persistenceStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
  }
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  const transport = installTestFetch(async (input) => {
    const http = input instanceof Request ? input : new Request(input)
    const pathname = new URL(http.url).pathname
    if (pathname.endsWith("/abort")) {
      expect(http.method).toBe("POST")
      expect(http.headers.get("x-buddy-directory")).toBe(DIRECTORY)
      aborted.push(pathname)
      didAbort = true
      return Response.json(true)
    }
    if (pathname === "/api/event") {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ directory: "/unrelated", payload: { type: "mcp.input.requested", properties: request } })}\n\n`,
              ),
            )
            http.signal.addEventListener("abort", () => controller.close(), { once: true })
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    }
    if (pathname === "/api/session") return Response.json([session])
    if (pathname === `/api/session/${SESSION}`) return Response.json(session)
    if (pathname === `/api/session/${SESSION}/message`)
      return Response.json(didAbort ? [] : messages)
    if (pathname === "/api/session/status")
      return Response.json(didAbort ? {} : { [SESSION]: { type: "busy" } })
    if (pathname === "/api/provider")
      return Response.json({ providers: [provider], default: { test: model.id } })
    if (pathname === "/api/config")
      return Response.json({ default_agent: "buddy", model: "test/test-model" })
    if (pathname === "/api/mcp") return Response.json({})
    if (pathname === "/api/reference") return Response.json({ data: [] })
    return Response.json([])
  })
  function Pane() {
    const controller = useDirectoryChatPageController({
      directoryToken: encodeDirectory(DIRECTORY),
    })
    return controller.status === "ready" ? (
      <DirectoryChatMainPane {...controller.mainPaneProps} />
    ) : (
      <span>{controller.status}</span>
    )
  }
  const rootRoute = createRootRoute()
  const chatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory/chat",
    component: () => (
      <DirectoryWorkspaceProvider directory={DIRECTORY} persistenceStorage={persistenceStorage}>
        <Pane />
      </DirectoryWorkspaceProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([chatRoute]),
    history: createMemoryHistory({ initialEntries: [`/${encodeDirectory(DIRECTORY)}/chat`] }),
  })
  const unsubscribe = useChatStore.subscribe((state) => {
    if (state.pendingMcpInputRequests[request.requestID]) noticed.resolve()
    if (didAbort && !state.directories[DIRECTORY]?.isBusy) stopped.resolve()
  })
  try {
    useChatStore.setState({ openProjects: [DIRECTORY], directories: {} })
    seedDirectoryChatState(DIRECTORY, {
      sessionID: SESSION,
      sessions: [session],
      sessionStatusByID: { [SESSION]: { type: "busy" } },
      isBusy: true,
      isReady: true,
      providers: [provider],
      providerDefault: { test: model.id },
      messages,
    })
    seedDirectoryChatState("/unrelated", { sessionID: "ses_other", isBusy: true })
    seedSkillPresentations(queryClient, DIRECTORY)
    await router.load()
    await act(async () => {
      root.render(
        <PlatformProvider value={{ ...createBrowserPlatform(), fetch: transport }}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    await act(async () => {
      await noticed.promise
    })
    const notice = Array.from(container.querySelectorAll('[role="alert"]')).find((alert) =>
      alert.textContent?.includes("may be waiting for your input"),
    )
    if (!notice) throw new Error("Missing MCP input notice in chat pane")
    expect(notice.textContent).toContain(
      "Docs Server may be waiting for your input, which Buddy can't show yet.",
    )
    expect(notice.querySelector("strong")?.textContent).toBe("Docs Server")
    expect(notice.querySelector("blockquote")?.textContent).toContain(request.message)
    const buttons = notice.querySelectorAll("button")
    expect(buttons.length).toBe(1)
    expect(buttons[0]?.textContent).toBe("Stop")
    await act(async () => {
      buttons[0]?.click()
      await stopped.promise
    })
    expect(aborted).toEqual([`/api/session/${SESSION}/abort`])
    expect(useChatStore.getState().directories["/unrelated"]?.isBusy).toBe(true)
    expect(container.textContent).not.toContain("may be waiting for your input")
  } finally {
    unsubscribe()
    await act(async () => root.unmount())
    queryClient.clear()
    usePromptStore.setState(promptState)
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(connection)
  }
})

test.each([
  {
    name: "Code Mode running row",
    tool: "execute",
    status: "running" as const,
    rows: [{ tool: "Docs_Server.search", status: "running" }],
    matches: true,
  },
  {
    name: "another server",
    tool: "Other_search",
    status: "running" as const,
    rows: [],
    matches: false,
  },
  {
    name: "prefix without direct separator",
    tool: "Docs_Server2_search",
    status: "running" as const,
    rows: [],
    matches: false,
  },
  {
    name: "completed direct call",
    tool: "Docs_Server_search",
    status: "completed" as const,
    rows: [],
    matches: false,
  },
  {
    name: "completed Code Mode row",
    tool: "execute",
    status: "running" as const,
    rows: [{ tool: "Docs_Server.search", status: "completed" }],
    matches: false,
  },
  {
    name: "Code Mode prefix without dot",
    tool: "execute",
    status: "running" as const,
    rows: [{ tool: "Docs_Server2.search", status: "running" }],
    matches: false,
  },
  {
    name: "completed execute with stale running row",
    tool: "execute",
    status: "completed" as const,
    rows: [{ tool: "Docs_Server.search", status: "running" }],
    matches: false,
  },
  {
    name: "nested metadata on another tool",
    tool: "Other_search",
    status: "running" as const,
    rows: [{ tool: "Docs_Server.search", status: "running" }],
    matches: false,
  },
])("matches only live calls: $name", async ({ tool, status, rows, matches }) => {
  seedNotice(message(tool, status, { toolCalls: rows }))
  useChatStore.getState().applyMcpInputRequested(request)
  await act(async () => {
    root.render(<McpInputNotice sessionID={SESSION} isRunning onStop={() => {}} />)
  })
  expect(container.querySelector('[role="alert"]') !== null).toBe(matches)
})

test("does not attribute another chat's running call to this chat", async () => {
  useChatStore.getState().applyMcpInputRequested(request)
  await act(async () => {
    root.render(<McpInputNotice sessionID="ses_other" isRunning onStop={() => {}} />)
  })
  expect(container.textContent).toBe("")
})

test("dedupes notebook broadcasts and removes notices on settlement and turn end", async () => {
  const store = useChatStore.getState()
  store.applyMcpInputRequested(request)
  const pending = useChatStore.getState().pendingMcpInputRequests
  store.applyMcpInputRequested({ ...request })
  expect(useChatStore.getState().pendingMcpInputRequests).toBe(pending)
  await act(async () =>
    root.render(<McpInputNotice sessionID={SESSION} isRunning onStop={() => {}} />),
  )
  expect(container.querySelectorAll('[role="alert"]').length).toBe(1)
  await act(async () => store.applyMcpInputSettled(request.requestID))
  expect(container.textContent).toBe("")
  await act(async () => store.applyMcpInputRequested(request))
  expect(container.textContent).toBe("")
  await act(async () => store.applyMcpInputRequested({ ...request, requestID: "frm_next" }))
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  await act(async () => store.applySessionStatus(DIRECTORY, SESSION, { type: "idle" }))
  await act(async () =>
    root.render(<McpInputNotice sessionID={SESSION} isRunning={false} onStop={() => {}} />),
  )
  expect(container.textContent).toBe("")
  expect(Object.keys(useChatStore.getState().pendingMcpInputRequests)).toEqual([])
})

test("renders server text safely and omits an absent message", async () => {
  useChatStore.getState().applyMcpInputRequested({
    requestID: "frm_plain",
    server: "<img src=x>",
    toolPrefix: "Docs_Server",
  })
  await act(async () =>
    root.render(<McpInputNotice sessionID={SESSION} isRunning onStop={() => {}} />),
  )
  expect(container.querySelector("strong")?.textContent).toBe("<img src=x>")
  expect(container.querySelector("img")).toBeNull()
  expect(container.querySelector("blockquote")).toBeNull()
})
