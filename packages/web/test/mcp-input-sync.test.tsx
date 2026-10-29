import { expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { PlatformProvider, createBrowserPlatform } from "../src/context/platform"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { useChatSync } from "../src/lib/directory-chat/use-chat-sync"
import { useChatStore } from "../src/state/chat-store"
import { McpInputNotice } from "../src/components/directory-chat/mcp-input-notice"
import {
  applyTranscriptPartUpdated,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import type { ToolPart } from "@buddy/transcript-contract/message"
import type { GlobalEvent } from "../src/state/chat-types"
import {
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
  createAssistantMessageInfo,
  createMessageWithParts,
} from "./test-utils"

function noop() {}

test("consumes app-wide MCP input before directory routing, dedupes, settles and survives a second notebook stream and its reconnect", async () => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  const initialState = useChatStore.getState()
  const originalFetch = globalThis.fetch
  const connection = getServerConnection()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  let opened = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
  let processed = Promise.withResolvers<void>()
  const transport = installTestFetch(async (input) => {
    const request = input instanceof Request ? input : new Request(input)
    if (new URL(request.url).pathname !== "/api/event") return Response.json([])
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          opened.resolve(controller)
          request.signal.addEventListener(
            "abort",
            () => {
              try {
                controller.close()
              } catch {}
            },
            { once: true },
          )
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )
  })
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  function acknowledge() {
    processed.resolve()
  }
  function Sync({ directory = "/" }: { directory?: string }) {
    useChatSync({
      decodedDirectory: directory,
      hasRegisteredProject: true,
      applySessionUpdated: noop,
      applySessionStatus: noop,
      applyMessageUpdated: noop,
      applyMessageRemoved: noop,
      applyPartUpdated: noop,
      applyPartRemoved: noop,
      applyPartDelta: noop,
      applyPermissionAsked: noop,
      applyPermissionReplied: noop,
      applyQuestionAsked: noop,
      applyQuestionResolved: acknowledge,
      clearDirectoryError: noop,
      setStreamStatus: initialState.setStreamStatus,
      refreshSlashCommands: noop,
      refreshMcpStatus: noop,
    })
    return null
  }
  function send(
    stream: ReadableStreamDefaultController<Uint8Array>,
    events: GlobalEvent[],
  ): Promise<void> {
    processed = Promise.withResolvers<void>()
    stream.enqueue(
      new TextEncoder().encode(
        [
          ...events,
          {
            directory: "/",
            payload: { type: "question.rejected", properties: { requestID: "frm_marker" } },
          },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      ),
    )
    return processed.promise
  }
  const part: ToolPart = {
    type: "tool",
    id: "part_mcp",
    sessionID: "ses_mcp",
    messageID: "msg_mcp",
    callID: "call_mcp",
    tool: "Docs_search",
    state: { status: "running", input: {}, metadata: {}, time: { start: 1 } },
  }
  const message = createMessageWithParts(
    createAssistantMessageInfo({ id: "msg_mcp", sessionID: "ses_mcp" }),
    [part],
  )
  const platform = { ...createBrowserPlatform(), fetch: transport }
  function render(second = false) {
    root.render(
      <PlatformProvider value={platform}>
        <QueryClientProvider client={queryClient}>
          <Sync key="first" />
          <McpInputNotice sessionID="ses_mcp" isRunning onStop={noop} />
          {second ? <Sync key="second" directory="/second" /> : null}
        </QueryClientProvider>
      </PlatformProvider>,
    )
  }
  const properties = {
    requestID: "frm_mcp",
    server: "Docs",
    toolPrefix: "Docs",
    message: "Confirm",
  }
  try {
    useChatStore.setState({ openProjects: ["/", "/second"], pendingMcpInputRequests: {} })
    seedDirectoryChatState("/", {
      sessionID: "ses_mcp",
      sessionStatusByID: { ses_mcp: { type: "busy" } },
      messages: [message],
    })
    await act(async () => {
      render()
    })
    const stream = await opened.promise
    await act(async () => {
      await send(stream, [
        { payload: { type: "mcp.input.requested", properties } },
        { directory: "/another-notebook", payload: { type: "mcp.input.requested", properties } },
      ])
    })
    expect(useChatStore.getState().pendingMcpInputRequests).toMatchObject({ frm_mcp: properties })
    expect(
      useChatStore.persist.getOptions().partialize?.(useChatStore.getState()),
    ).not.toHaveProperty("pendingMcpInputRequests")
    await act(async () => {
      await send(stream, [
        {
          directory: "global",
          payload: { type: "mcp.input.settled", properties: { requestID: properties.requestID } },
        },
      ])
    })
    expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
    await act(async () => {
      await send(stream, [
        {
          directory: "/another-notebook",
          payload: {
            type: "mcp.input.requested",
            properties: { ...properties, requestID: "frm_next" },
          },
        },
      ])
    })
    expect(useChatStore.getState().pendingMcpInputRequests).toHaveProperty("frm_next")
    opened = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
    await act(async () => {
      render(true)
    })
    const secondStream = await opened.promise
    expect(useChatStore.getState().pendingMcpInputRequests).toHaveProperty("frm_next")
    expect(container.querySelectorAll('[role="alert"]').length).toBe(1)
    opened = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
    await act(async () => {
      secondStream.close()
      await opened.promise
    })
    expect(useChatStore.getState().pendingMcpInputRequests).toHaveProperty("frm_next")
    await act(async () =>
      applyTranscriptPartUpdated("/", {
        ...part,
        state: {
          status: "completed",
          input: {},
          output: "Done",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      }),
    )
    expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(connection)
    useChatStore.getState().clearMcpInputRequests()
    useChatStore.setState(initialState)
    resetTranscriptRepositoryForTests()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  }
})
