import { expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { z } from "zod"
import { DirectoryWorkspaceProvider } from "../src/components/directory-chat/directory-workspace-context"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import {
  useDirectoryChatPageController,
  type DirectoryChatPageControllerState,
} from "../src/lib/directory-chat/use-directory-chat-page-controller"
import { encodeDirectory } from "../src/lib/directory-token"
import { parseStringValue, parseWithSchema } from "../src/state/parse-external"
import { useChatStore } from "../src/state/chat-store"
import {
  getModelSelectionScopeKey,
  useModelSelectionStore,
} from "../src/state/model-selection-store"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import {
  createProviderInfo,
  createProviderModelInfo,
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
} from "./test-utils"

const DIRECTORY = "/fast-mode-notebook"
const SESSION_ID = "ses_fast_mode"
const DIRECTORY_TOKEN = encodeDirectory(DIRECTORY)
const PROMPT = "Ship the notes"

const promptRequestSchema = z.object({
  content: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
  modelRuntime: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  variant: z.string().optional(),
})

type TPromptRequestBody = z.infer<typeof promptRequestSchema>

const postedPromptSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value)
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid json" })
      return z.NEVER
    }
  })
  .pipe(promptRequestSchema)

function readPostedPrompt(text: string | undefined): TPromptRequestBody | undefined {
  return parseWithSchema(postedPromptSchema, text)
}

async function requestText(input: RequestInfo | URL, init?: RequestInit) {
  const fromInit = parseStringValue(init?.body)
  if (fromInit !== undefined) return fromInit
  if (input instanceof Request) return input.clone().text()
  return undefined
}

function requestPath(input: RequestInfo | URL) {
  const url = input instanceof URL ? input.toString() : input instanceof Request ? input.url : input
  return new URL(url, "http://buddy.test").pathname
}

type TFastModeCase = {
  readonly modelKey: string
  readonly fast: boolean | undefined
  readonly variant: string | undefined
  readonly switchToModelKey?: string
}

function Probe(props: { onController: (controller: DirectoryChatPageControllerState) => void }) {
  const controller = useDirectoryChatPageController({ directoryToken: DIRECTORY_TOKEN })
  props.onController(controller)
  return <span data-status={controller.status} />
}

async function submitFastModePrompt(input: TFastModeCase) {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  const chatState = useChatStore.getState()
  const selectionState = useModelSelectionStore.getState()
  const originalFetch = globalThis.fetch
  const serverConnection = getServerConnection()
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const requested = Promise.withResolvers<TPromptRequestBody>()
  const session = {
    id: SESSION_ID,
    title: "Fast",
    directory: DIRECTORY,
    time: { created: 1, updated: 1 },
  }
  const base = createProviderModelInfo({
    id: "gpt-5.5",
    providerID: "openai",
    variants: input.variant ? [input.variant] : [],
  })
  const fast = createProviderModelInfo({
    id: "gpt-5.5-fast",
    providerID: "openai",
    variants: input.variant ? [input.variant] : [],
  })
  const switchModels = input.switchToModelKey
    ? [
        createProviderModelInfo({ id: "gpt-5.4", providerID: "openai", variants: [] }),
        createProviderModelInfo({ id: "gpt-5.4-fast", providerID: "openai", variants: [] }),
      ]
    : []
  const provider = createProviderInfo({
    id: "openai",
    connected: true,
    models: [base, fast, ...switchModels],
  })
  const scopeKey = getModelSelectionScopeKey(DIRECTORY, SESSION_ID)
  let controller: DirectoryChatPageControllerState | undefined
  const transport = installTestFetch(async (requestInput, init) => {
    const path = requestPath(requestInput)
    if (path === `/api/session/${SESSION_ID}/prompt_async`) {
      const body = readPostedPrompt(await requestText(requestInput, init))
      if (body) requested.resolve(body)
      return new Response(null, { status: 204 })
    }
    if (path === "/api/event") {
      return new Response(
        new ReadableStream({
          start(stream) {
            const request = requestInput instanceof Request ? requestInput : undefined
            request?.signal.addEventListener("abort", () => stream.close(), { once: true })
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    }
    if (path === "/api/reference") return Response.json({ data: [] })
    if (path === "/api/svg-rendering/browser-requests") return Response.json([])
    return Response.json({})
  })
  const platform = { ...createBrowserPlatform(), fetch: transport }
  const rootRoute = createRootRoute()
  const chatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory/chat",
    component: () => (
      <DirectoryWorkspaceProvider directory={DIRECTORY}>
        <Probe onController={(value) => (controller = value)} />
      </DirectoryWorkspaceProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([chatRoute]),
    history: createMemoryHistory({ initialEntries: [`/${DIRECTORY_TOKEN}/chat`] }),
  })

  try {
    useChatStore.setState({ openProjects: [DIRECTORY], directories: {} })
    seedDirectoryChatState(DIRECTORY, {
      sessionID: SESSION_ID,
      sessions: [session],
      providers: [provider],
      providerDefault: { openai: "gpt-5.5" },
      isReady: true,
    })
    useModelSelectionStore.getState().setSelectedModel(scopeKey, input.modelKey)
    if (input.fast === undefined) {
      useModelSelectionStore.getState().setSelectedFast(scopeKey, null)
    } else {
      useModelSelectionStore.getState().setSelectedFast(scopeKey, input.fast)
    }
    if (input.variant) {
      useModelSelectionStore.getState().setSelectedVariant(scopeKey, input.variant)
    }
    await router.load()
    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    if (controller?.status !== "ready") {
      throw new Error(`Controller was ${controller?.status ?? "missing"}`)
    }
    const switchToModelKey = input.switchToModelKey
    if (switchToModelKey) {
      const current = controller
      await act(async () => {
        current.mainPaneProps.promptComposerProps.onModelChange(switchToModelKey)
      })
    }
    const ready = controller
    if (ready?.status !== "ready") throw new Error("Controller was not ready after the switch")
    await act(async () => {
      ready.mainPaneProps.promptComposerProps.onSubmit({
        value: PROMPT,
        parts: [],
        attachments: [],
        cursor: 0,
      })
      await requested.promise
    })
    return {
      body: await requested.promise,
      modelOptionKeys: ready.mainPaneProps.promptComposerProps.modelOptions.map(
        (option) => option.key,
      ),
      selectedModel: ready.mainPaneProps.promptComposerProps.selectedModel,
      fastMode: ready.mainPaneProps.promptComposerProps.fastMode,
    }
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(serverConnection)
    useChatStore.setState(chatState)
    useModelSelectionStore.setState(selectionState)
    resetTranscriptRepositoryForTests()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  }
}

test("submitting with fast on posts the OpenAI sibling and hides that row", async () => {
  const submitted = await submitFastModePrompt({
    modelKey: "openai/gpt-5.5",
    fast: true,
    variant: "high",
  })

  expect(submitted.modelOptionKeys).toEqual(["openai/gpt-5.5"])
  expect(submitted.selectedModel).toBe("openai/gpt-5.5")
  expect(submitted.fastMode).toBeDefined()
  expect(submitted.fastMode?.enabled).toBe(true)
  expect(submitted.body).toMatchObject({
    content: PROMPT,
    model: { providerID: "openai", modelID: "gpt-5.5-fast" },
    modelRuntime: { providerID: "openai", modelID: "gpt-5.5-fast" },
    variant: "high",
  })
})

test("submitting with fast off posts the OpenAI base model", async () => {
  const submitted = await submitFastModePrompt({
    modelKey: "openai/gpt-5.5",
    fast: false,
    variant: "high",
  })

  expect(submitted.fastMode).toBeDefined()
  expect(submitted.fastMode?.enabled).toBe(false)
  expect(submitted.body).toMatchObject({
    content: PROMPT,
    model: { providerID: "openai", modelID: "gpt-5.5" },
    modelRuntime: { providerID: "openai", modelID: "gpt-5.5" },
    variant: "high",
  })
})

test("a stored OpenAI fast catalog id still posts the sibling", async () => {
  const submitted = await submitFastModePrompt({
    modelKey: "openai/gpt-5.5-fast",
    fast: undefined,
    variant: undefined,
  })

  expect(submitted.modelOptionKeys).toEqual(["openai/gpt-5.5"])
  expect(submitted.selectedModel).toBe("openai/gpt-5.5")
  expect(submitted.fastMode?.enabled).toBe(true)
  expect(submitted.body.model).toEqual({ providerID: "openai", modelID: "gpt-5.5-fast" })
})

test("switching models keeps Fast inferred from a stored fast catalog id", async () => {
  const submitted = await submitFastModePrompt({
    modelKey: "openai/gpt-5.5-fast",
    fast: undefined,
    variant: undefined,
    switchToModelKey: "openai/gpt-5.4",
  })

  expect(submitted.selectedModel).toBe("openai/gpt-5.4")
  expect(submitted.fastMode?.enabled).toBe(true)
  expect(submitted.body.model).toEqual({ providerID: "openai", modelID: "gpt-5.4-fast" })
})
