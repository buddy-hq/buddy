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
import { DirectoryWorkspaceProvider } from "../src/components/directory-chat/directory-workspace-context"
import { PromptComposer } from "../src/components/prompt/prompt-composer"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { getServerConnection, setRuntimeServerConnection } from "../src/context/server"
import { useDirectoryChatPageController } from "../src/lib/directory-chat/use-directory-chat-page-controller"
import { encodeDirectory } from "../src/lib/directory-token"
import { FOLLOWUP_BEHAVIOR_STEER, useChatSettings } from "../src/state/chat-settings"
import { useChatStore } from "../src/state/chat-store"
import { createTextPromptDraft, getPromptDraft, getPromptScopeKey, usePromptStore } from "../src/state/prompt-store"
import { resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import { seedSkillPresentations } from "./query-test-utils"
import {
  createProviderInfo,
  createProviderModelInfo,
  createUserMessageInfo,
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
} from "./test-utils"

const DIRECTORY = "/steering-notebook"
const SESSION_ID = "ses_steering"
const TEXT = "Use the simpler example instead"
const DIRECTORY_TOKEN = encodeDirectory(DIRECTORY)

function SteeringComposer() {
  const controller = useDirectoryChatPageController({ directoryToken: DIRECTORY_TOKEN })
  if (controller.status !== "ready") return <span>{controller.status}</span>
  const props = controller.mainPaneProps.promptComposerProps
  return (
    <div data-busy={String(props.isBusy)}>
      <PromptComposer {...props} selectorMode="native" />
    </div>
  )
}

test("restores a steering message in the composer when the prompt route returns 500", async () => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  const chatState = useChatStore.getState()
  const promptState = usePromptStore.getState()
  const followupBehavior = useChatSettings.getState().followupBehavior
  const originalFetch = globalThis.fetch
  const serverConnection = getServerConnection()
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const promptKey = getPromptScopeKey(DIRECTORY, SESSION_ID)
  const requested = Promise.withResolvers<Request>()
  const response = Promise.withResolvers<Response>()
  const session = { id: SESSION_ID, title: "Steering", directory: DIRECTORY, time: { created: 1, updated: 1 } }
  const model = createProviderModelInfo({ id: "test-model", providerID: "test" })
  const provider = createProviderInfo({ id: "test", connected: true, models: [model] })
  const messages = [{ info: createUserMessageInfo({ id: "msg_original", sessionID: SESSION_ID }), parts: [] }]
  let failed = false
  let unsubscribe: (() => void) | undefined
  const transport = installTestFetch(async (input) => {
    const request = input instanceof Request ? input : new Request(input)
    const pathname = new URL(request.url).pathname
    if (pathname === `/api/session/${SESSION_ID}/prompt_async`) {
      requested.resolve(request)
      return response.promise
    }
    if (pathname === "/api/event") {
      return new Response(new ReadableStream({
        start(controller) {
          request.signal.addEventListener("abort", () => controller.close(), { once: true })
        },
      }), { headers: { "content-type": "text/event-stream" } })
    }
    if (pathname === "/api/session") return Response.json([session])
    if (pathname === `/api/session/${SESSION_ID}`) return Response.json(session)
    if (pathname === `/api/session/${SESSION_ID}/message`) return Response.json(messages)
    if (pathname === "/api/session/status") return Response.json(failed ? {} : { [SESSION_ID]: { type: "busy" } })
    if (pathname === "/api/provider") return Response.json({ providers: [provider], default: { test: model.id } })
    if (pathname === "/api/config") return Response.json({ default_agent: "buddy", model: "test/test-model" })
    if (pathname === "/api/mcp") return Response.json({})
    if (pathname === "/api/reference") return Response.json({ data: [] })
    return Response.json([])
  })
  const platform = { ...createBrowserPlatform(), fetch: transport }
  const rootRoute = createRootRoute()
  const chatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory/chat",
    component: () => (
      <DirectoryWorkspaceProvider directory={DIRECTORY}>
        <SteeringComposer />
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
      sessionStatusByID: { [SESSION_ID]: { type: "busy" } },
      providers: [provider],
      providerDefault: { test: model.id },
      isReady: true,
      messages,
    })
    useChatSettings.getState().setFollowupBehavior(FOLLOWUP_BEHAVIOR_STEER)
    usePromptStore.getState().replaceDraft(promptKey, createTextPromptDraft(TEXT))
    seedSkillPresentations(queryClient, DIRECTORY)
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

    const editor = () => container.querySelector('[data-component="prompt-editor"]')?.textContent
    expect(container.querySelector("[data-busy]")?.getAttribute("data-busy")).toBe("true")
    expect(editor()).toBe(TEXT)
    const form = container.querySelector("#prompt-composer-form")
    if (!form) throw new Error("Missing steering composer form")
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await requested.promise
    })
    expect(await (await requested.promise).json()).toMatchObject({ content: TEXT })
    expect(editor()).toBe("")
    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe("")

    const restored = Promise.withResolvers<void>()
    unsubscribe = usePromptStore.subscribe((state) => {
      if (getPromptDraft(state, promptKey).value === TEXT) restored.resolve()
    })
    await act(async () => {
      failed = true
      response.resolve(Response.json({ error: "Earlier turn failed before delivery" }, { status: 500 }))
      await restored.promise
    })

    expect(getPromptDraft(usePromptStore.getState(), promptKey).value).toBe(TEXT)
    expect(editor()).toBe(TEXT)
  } finally {
    unsubscribe?.()
    response.resolve(new Response(null, { status: 204 }))
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    restoreTestFetch(originalFetch)
    setRuntimeServerConnection(serverConnection)
    useChatStore.setState(chatState)
    usePromptStore.setState(promptState)
    useChatSettings.getState().setFollowupBehavior(followupBehavior)
    resetTranscriptRepositoryForTests()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  }
})
