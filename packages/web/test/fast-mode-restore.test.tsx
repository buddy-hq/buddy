import { expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { useChatSync } from "../src/lib/directory-chat/use-chat-sync"
import { loadProviderCatalog, restoreObservedUserModelSelection } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import type { GlobalEvent } from "../src/state/chat-types"
import {
  getModelSelectionScopeKey,
  getSelectedFastKey,
  MODEL_SELECTION_STORAGE_KEY,
  useModelSelectionStore,
} from "../src/state/model-selection-store"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import {
  createMessageWithParts,
  createProviderInfo,
  createProviderModelInfo,
  createUserMessageInfo,
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
} from "./test-utils"

const DIRECTORY = "/fast-mode-restore"
const SESSION_ID = "ses_fast_restore"

function resetSelection() {
  localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY)
  useModelSelectionStore.setState({
    selectionSourceByKey: {},
    restoredSelectionCreatedAtByKey: {},
    selectedAgentByKey: {},
    selectedModelByKey: {},
    selectedVariantByKey: {},
    selectedFastByKey: {},
    recentModelKeys: [],
  })
}

function openAIModels() {
  return [
    createProviderModelInfo({ id: "gpt-5.5", providerID: "openai" }),
    createProviderModelInfo({ id: "gpt-5.5-fast", providerID: "openai" }),
  ]
}

function rawOpenAIModel(id: string) {
  return {
    id,
    providerID: "openai",
    api: { id: "openai", url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" },
    name: id,
    family: "gpt",
    free: false,
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: true },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200_000, output: 16_384 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-01-01",
    variants: {},
    enabled: true,
  }
}

test("cold load sets fast from the message once the catalog arrives", async () => {
  const originalFetch = globalThis.fetch
  const connection = getServerConnection()
  resetSelection()
  resetTranscriptRepositoryForTests()
  useChatStore.setState({ directories: {}, openProjects: [DIRECTORY] })
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  const scopeKey = getModelSelectionScopeKey(DIRECTORY, SESSION_ID)
  seedDirectoryChatState(DIRECTORY, {
    sessionID: SESSION_ID,
    sessions: [{ id: SESSION_ID, title: "Fast", time: { created: 1, updated: 1 } }],
    isReady: true,
    messages: [
      createMessageWithParts(
        createUserMessageInfo({
          id: "msg_base",
          sessionID: SESSION_ID,
          model: { providerID: "openai", modelID: "gpt-5.5" },
          time: { created: 20 },
        }),
        [],
      ),
    ],
  })
  useModelSelectionStore.setState({
    selectionSourceByKey: { [scopeKey]: "restored" },
    restoredSelectionCreatedAtByKey: { [scopeKey]: 1 },
    selectedFastByKey: { [scopeKey]: true },
    selectedModelByKey: { [scopeKey]: "openai/gpt-5.5-fast" },
  })
  installTestFetch(async (input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input
    const path = new URL(url, "http://buddy.test").pathname
    if (path === "/api/provider") {
      return Response.json({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            source: "custom",
            env: [],
            options: {},
            models: {
              "gpt-5.5": rawOpenAIModel("gpt-5.5"),
              "gpt-5.5-fast": rawOpenAIModel("gpt-5.5-fast"),
            },
          },
        ],
        connected: ["openai"],
        default: { openai: "gpt-5.5" },
      })
    }
    if (path === "/api/provider/auth") return Response.json({})
    if (path === "/api/provider/openai/models") return Response.json({ status: "error" })
    return Response.json({})
  })

  try {
    restoreObservedUserModelSelection({
      directory: DIRECTORY,
      sessionID: SESSION_ID,
      agent: "buddy",
      providerID: "openai",
      modelID: "gpt-5.5",
      variant: null,
      messageCreatedAt: 20,
    })
    expect(getSelectedFastKey(useModelSelectionStore.getState(), scopeKey)).toBe(true)

    await loadProviderCatalog(DIRECTORY)

    const state = useModelSelectionStore.getState()
    expect(getSelectedFastKey(state, scopeKey)).toBe(false)
    expect(state.selectedModelByKey[scopeKey]).toBe("openai/gpt-5.5")
  } finally {
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(connection)
    resetSelection()
    useChatStore.setState({ directories: {}, openProjects: [] })
    resetTranscriptRepositoryForTests()
  }
})

test("a local fast choice survives catalog reconciliation", async () => {
  const originalFetch = globalThis.fetch
  const connection = getServerConnection()
  resetSelection()
  resetTranscriptRepositoryForTests()
  useChatStore.setState({ directories: {}, openProjects: [DIRECTORY] })
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  const scopeKey = getModelSelectionScopeKey(DIRECTORY, SESSION_ID)
  seedDirectoryChatState(DIRECTORY, {
    sessionID: SESSION_ID,
    sessions: [{ id: SESSION_ID, title: "Fast", time: { created: 1, updated: 1 } }],
    isReady: true,
    messages: [
      createMessageWithParts(
        createUserMessageInfo({
          id: "msg_base",
          sessionID: SESSION_ID,
          model: { providerID: "openai", modelID: "gpt-5.5" },
          time: { created: 20 },
        }),
        [],
      ),
    ],
  })
  useModelSelectionStore.getState().setSelectedModel(scopeKey, "openai/gpt-5.5")
  useModelSelectionStore.getState().setSelectedFast(scopeKey, true)
  installTestFetch(async (input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input
    const path = new URL(url, "http://buddy.test").pathname
    if (path === "/api/provider") {
      return Response.json({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            source: "custom",
            env: [],
            options: {},
            models: {
              "gpt-5.5": rawOpenAIModel("gpt-5.5"),
              "gpt-5.5-fast": rawOpenAIModel("gpt-5.5-fast"),
            },
          },
        ],
        connected: ["openai"],
        default: { openai: "gpt-5.5" },
      })
    }
    if (path === "/api/provider/auth") return Response.json({})
    if (path === "/api/provider/openai/models") return Response.json({ status: "error" })
    return Response.json({})
  })

  try {
    await loadProviderCatalog(DIRECTORY)
    expect(getSelectedFastKey(useModelSelectionStore.getState(), scopeKey)).toBe(true)
  } finally {
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(connection)
    resetSelection()
    useChatStore.setState({ directories: {}, openProjects: [] })
    resetTranscriptRepositoryForTests()
  }
})

test("a live base-model message clears a restored fast flag", async () => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  const originalFetch = globalThis.fetch
  const connection = getServerConnection()
  resetSelection()
  resetTranscriptRepositoryForTests()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const scopeKey = getModelSelectionScopeKey(DIRECTORY, SESSION_ID)
  let opened = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>()
  let processed = Promise.withResolvers<void>()
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
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
              } catch {
                return undefined
              }
            },
            { once: true },
          )
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )
  })
  const platform = { ...createBrowserPlatform(), fetch: transport }
  seedDirectoryChatState(DIRECTORY, {
    sessionID: SESSION_ID,
    providers: [createProviderInfo({ id: "openai", connected: true, models: openAIModels() })],
    isReady: true,
  })
  useModelSelectionStore.setState({
    selectionSourceByKey: { [scopeKey]: "restored" },
    restoredSelectionCreatedAtByKey: { [scopeKey]: 10 },
    selectedFastByKey: { [scopeKey]: true },
    selectedModelByKey: { [scopeKey]: "openai/gpt-5.5-fast" },
  })

  function Sync() {
    useChatSync({
      decodedDirectory: DIRECTORY,
      hasRegisteredProject: true,
      applySessionUpdated: () => undefined,
      applySessionStatus: () => undefined,
      applyMessageUpdated: () => undefined,
      applyMessageRemoved: () => undefined,
      applyPartUpdated: () => undefined,
      applyPartRemoved: () => undefined,
      applyPartDelta: () => undefined,
      applyPermissionAsked: () => undefined,
      applyPermissionReplied: () => undefined,
      applyQuestionAsked: () => undefined,
      applyQuestionResolved: () => processed.resolve(),
      clearDirectoryError: () => undefined,
      setStreamStatus: () => undefined,
      refreshSlashCommands: () => undefined,
      refreshMcpStatus: () => undefined,
    })
    return null
  }

  function send(events: GlobalEvent[]) {
    processed = Promise.withResolvers<void>()
    const stream = opened.promise
    return stream.then((controller) => {
      controller.enqueue(
        new TextEncoder().encode(
          [
            ...events,
            {
              directory: DIRECTORY,
              payload: { type: "question.rejected", properties: { requestID: "frm_marker" } },
            },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(""),
        ),
      )
      return processed.promise
    })
  }

  try {
    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <QueryClientProvider client={queryClient}>
            <Sync />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    await act(async () => {
      await send([
        {
          directory: DIRECTORY,
          payload: {
            type: "message.updated",
            properties: {
              info: createUserMessageInfo({
                id: "msg_live_base",
                sessionID: SESSION_ID,
                model: { providerID: "openai", modelID: "gpt-5.5" },
                time: { created: 40 },
              }),
            },
          },
        },
      ])
    })

    const state = useModelSelectionStore.getState()
    expect(getSelectedFastKey(state, scopeKey)).toBe(false)
    expect(state.selectedModelByKey[scopeKey]).toBe("openai/gpt-5.5")
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(connection)
    resetSelection()
    useChatStore.setState({ directories: {}, openProjects: [] })
    resetTranscriptRepositoryForTests()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  }
})
