import { afterEach, expect, setSystemTime, spyOn, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { z } from "zod"
import { TooltipProvider } from "@buddy/ui"
import type { V1ImportReport } from "@/state/v1-import-query"
import { createRoot } from "react-dom/client"
import { DirectoryWorkspaceProvider } from "@/components/directory-chat/directory-workspace-context"
import { DirectoryNotebookRouteProvider } from "@/components/directory-chat/directory-notebook-route-context"
import { DirectoryWorkspaceRoot } from "@/components/directory-chat/directory-workspace-root"
import { createBrowserPlatform, PlatformProvider, setRuntimePlatform } from "@/context/platform"
import { setRuntimeServerConnection } from "@/context/server"
import { decodeDirectory, encodeDirectory } from "@/lib/directory-token"
import {
  readActiveChatTransitionID,
  resetActiveChatTransitionStateForTests,
} from "@/lib/active-chat-transition-state"
import { useChatStore } from "@/state/chat-store"
import { useHostedBrowserStore } from "@/state/hosted-browser-store"
import { useUiPreferences } from "@/state/ui-preferences"
import { parseFiniteNumber, parseStringValue, parseWithSchema } from "@/state/parse-external"
import {
  createProviderInfo,
  createProviderModelInfo,
  createUserMessageInfo,
  installTestFetch,
  restoreTestFetch,
  seedDirectoryChatState,
} from "./test-utils"
import { Route as ChatEntryRoute } from "@/routes/chat"
import { seedSkillPresentations } from "./query-test-utils"

const originalFetch = globalThis.fetch
const originalSetTimeout = globalThis.setTimeout
const originalTransition = Object.getOwnPropertyDescriptor(document, "startViewTransition")
const originalChatState = useChatStore.getState()
const originalPreferences = useUiPreferences.getState()

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)

afterEach(() => {
  restoreTestFetch(originalFetch)
  resetActiveChatTransitionStateForTests()
  useChatStore.setState(originalChatState, true)
  useUiPreferences.setState(originalPreferences, true)
  useHostedBrowserStore.setState({ slotsByDirectory: {} })
  setSystemTime()
  if (originalTransition) Object.defineProperty(document, "startViewTransition", originalTransition)
  else Reflect.deleteProperty(document, "startViewTransition")
})

function element<T extends Element>(selector: string, type: { new (...args: never[]): T }): T {
  const found = document.querySelector(selector)
  if (!(found instanceof type)) throw new Error(`Missing ${selector}`)
  return found
}

async function until(check: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (check()) return
    await act(async () => {
      await new Promise<void>((resolve) => originalSetTimeout(resolve, 0))
    })
  }
  throw new Error(`Did not reach ${description}`)
}

for (const directories of [
  { label: "Unix", source: "/creation/source", destination: "/creation/new-notebook", entry: false },
  { label: "Windows", source: "C:/creation/source", destination: "C:/creation/new-notebook", entry: false },
  { label: "No open notebook", source: "/creation/source", destination: "/creation/new-notebook", entry: true },
]) {
  for (const hydrationDelay of [0, 3_000]) {
    test(`${directories.label}: creation keeps the dialog until hydration (${hydrationDelay}ms) and commits one transition`, async () => {
      const { source, destination } = directories
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      let hydrationRequested = false
      const hydration = Promise.withResolvers<void>()
      const createStarted = Promise.withResolvers<void>()
      const created = Promise.withResolvers<Response>()
      let deferHydration = false
      const session = {
        id: "creation-source-session",
        directory: source,
        title: "Source chat",
        time: { created: 1, updated: 1 },
      }
      const messages = [{ info: createUserMessageInfo({ id: "creation-message", sessionID: session.id }), parts: [] }]
      const model = createProviderModelInfo({ id: "test-model", providerID: "test" })
      const provider = createProviderInfo({ id: "test", connected: true, models: [model] })
      const importReport = { upgrade: { state: "idle" }, import: null, importRan: false, skipped: [], content: [] } satisfies V1ImportReport
      setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
      const transport = installTestFetch(async (input) => {
        const request = input instanceof Request ? input : new Request(input)
        const pathname = new URL(request.url).pathname
        const directory = request.headers.get("x-buddy-directory")
        if (pathname === "/api/open-projects/create") {
          createStarted.resolve()
          return created.promise
        }
        if (pathname === "/api/runtime/v1-import") {
          if (!deferHydration) return Response.json(importReport)
          hydrationRequested = true
          await hydration.promise
          return Response.json(importReport)
        }
        if (pathname === "/api/session") return Response.json(directory === destination ? [] : [session])
        if (pathname === `/api/session/${session.id}`) return Response.json(session)
        if (pathname === `/api/session/${session.id}/message`) return Response.json(messages)
        if (pathname === "/api/session/status") return Response.json({})
        if (pathname === "/api/provider") return Response.json({ all: [], connected: [], default: {} })
        if (pathname === "/api/config") return Response.json({ default_agent: "buddy", model: "test/test-model" })
        if (pathname === "/api/global/experimental-features") return Response.json({ features: [] })
        if (pathname === "/api/global/config") return Response.json({})
        if (pathname === "/api/objects/resource") return Response.json({ resources: [] })
        if (pathname === "/api/objects") return Response.json({ objects: [] })
        if (pathname.startsWith("/api/notes/session/")) return Response.json({ note: null })
        if (pathname === "/api/find/notebook-file-index") return Response.json({ files: [] })
        if (pathname === "/api/provider/auth") return Response.json({})
        if (pathname.endsWith("/access")) return Response.json({ mode: "default" })
        if (pathname === "/api/mcp") return Response.json({})
        if (pathname === "/api/reference") return Response.json({ data: [] })
        if (pathname === "/api/event") {
          return new Response(new ReadableStream({
            start(controller) {
              request.signal.addEventListener("abort", () => controller.close(), { once: true })
            },
          }), { headers: { "content-type": "text/event-stream" } })
        }
        return Response.json([])
      })
      const storage = new Map<string, string>()
      const platform = {
        ...createBrowserPlatform(),
        fetch: transport,
        storage: () => ({
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => { storage.set(key, value) },
          removeItem: (key: string) => { storage.delete(key) },
        }),
      }
      setRuntimePlatform(platform)
      useChatStore.setState({
        openProjects: directories.entry ? [] : [source],
        activeDirectory: directories.entry ? undefined : source,
        directories: {},
        lastSessionByDirectory: {},
      })
      useUiPreferences.setState({ leftSidebarOpen: true })
      if (!directories.entry) seedDirectoryChatState(source, {
        sessionID: session.id, sessions: [session], providers: [provider],
        providerDefault: { test: model.id }, isReady: true, messages,
      })
      seedSkillPresentations(queryClient, source)
      seedSkillPresentations(queryClient, destination)
      const rootRoute = createRootRoute()
      const route = createRoute({
        getParentRoute: () => rootRoute,
        path: "$directory/chat",
        component: () => {
          const params = route.useParams()
          return (
            <DirectoryWorkspaceProvider key={params.directory} directory={decodeDirectory(params.directory)}>
              <DirectoryNotebookRouteProvider directoryToken={params.directory}>
                <DirectoryWorkspaceRoot />
              </DirectoryNotebookRouteProvider>
            </DirectoryWorkspaceProvider>
          )
        },
      })
      const entryRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "chat",
        component: ChatEntryRoute.options.component,
      })
      const sourcePath = directories.entry ? "/chat" : `/${encodeDirectory(source)}/chat`
      const router = createRouter({
        routeTree: rootRoute.addChildren([route, entryRoute]),
        history: createMemoryHistory({ initialEntries: [sourcePath] }),
      })
      const container = document.createElement("div")
      document.body.appendChild(container)
      const root = createRoot(container)
      const pendingUpdates: Array<() => Promise<void>> = []
      const observedHydrating: Element[] = []
      const observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node.matches('[data-component="directory-workspace-hydrating"]')) observedHydrating.push(node)
          observedHydrating.push(...node.querySelectorAll('[data-component="directory-workspace-hydrating"]'))
        }
      })
      const delayedTimers: Array<{ callback: () => void; delay: number; timer: number | ReturnType<typeof setTimeout> }> = []
      let clock: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">> | undefined
      try {
        await router.load()
        await act(async () => {
          root.render(
            <PlatformProvider value={platform}>
              <QueryClientProvider client={queryClient}><TooltipProvider><RouterProvider router={router} /></TooltipProvider></QueryClientProvider>
            </PlatformProvider>,
          )
        })
        const createSelector = directories.entry
          ? '[data-action="entry-create-notebook"]'
          : '[data-action="left-sidebar-new-notebook"]'
        await until(() => Boolean(container.querySelector(createSelector)), "source screen")
        await act(async () => { element(createSelector, HTMLElement).click() })
        await until(() => Boolean(document.querySelector('[data-action="left-sidebar-create-notebook-input"]')), "create dialog")
        const input = element('[data-action="left-sidebar-create-notebook-input"]', HTMLInputElement)
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "New notebook")
          input.dispatchEvent(new Event("input", { bubbles: true }))
          input.dispatchEvent(new Event("change", { bubbles: true }))
        })
        const dialog = element('[data-component="left-sidebar-create-notebook-dialog"]', HTMLElement)
        const confirm = element('[data-action="left-sidebar-create-notebook-confirm"]', HTMLButtonElement)
        expect(confirm.disabled).toBe(false)
        if (!directories.entry) {
          expect(useChatStore.getState().directories[source]?.sessionID).toBe(session.id)
        }
        const before = readActiveChatTransitionID()
        Reflect.set(document, "startViewTransition", (update: () => Promise<void>) => ({
          finished: new Promise<void>((resolve, reject) => {
            pendingUpdates.push(async () => {
              await update().then(resolve, reject)
            })
          }),
        }))
        observer.observe(container, { childList: true, subtree: true })
        if (hydrationDelay > 0) {
          clock = spyOn(globalThis, "setTimeout").mockImplementation(
            new Proxy(originalSetTimeout, {
              apply(target, _thisArg, args) {
                const callback = parseWithSchema(
                  z.function({ input: z.array(z.unknown()), output: z.unknown() }),
                  args[0],
                )
                const delay = parseFiniteNumber(args[1])
                if (!callback) {
                  const handler = parseStringValue(args[0])
                  if (handler === undefined) throw new Error("Invalid timer callback")
                  return target(handler, delay, ...args.slice(2))
                }
                const timer = target(callback, delay, ...args.slice(2))
                if (callback && delay && delay >= 1_000) {
                  delayedTimers.push({ callback: () => callback(...args.slice(2)), delay, timer })
                }
                return timer
              },
            }),
          )
        }
        deferHydration = true
        await act(async () => { confirm.click(); await createStarted.promise })
        await act(async () => { created.resolve(Response.json({ directory: destination })) })
        await until(() => pendingUpdates.length > 0 || hydrationRequested, "creation hydration or transition")
        for (let turn = 0; turn < 3 && pendingUpdates.length > 0; turn += 1) {
          await act(async () => {
            for (const update of pendingUpdates.splice(0)) void update()
            await new Promise<void>((resolve) => originalSetTimeout(resolve, 0))
          })
        }
        if (hydrationDelay > 0) {
          setSystemTime(new Date(Date.now() + hydrationDelay))
          await act(async () => {
            for (const timer of delayedTimers.splice(0)) {
              if (timer.delay > hydrationDelay) continue
              clearTimeout(timer.timer)
              timer.callback()
            }
          })
        }
        expect(router.state.location.pathname).toBe(sourcePath)
        expect(useChatStore.getState().activeDirectory).toBe(directories.entry ? undefined : source)
        expect(dialog.isConnected).toBe(true)
        expect(element('[data-component="left-sidebar-create-notebook-dialog"]', HTMLElement)).toBe(dialog)
        expect(confirm.disabled).toBe(true)
        expect(observedHydrating).toEqual([])
        await act(async () => { hydration.resolve() })
        await until(() => pendingUpdates.length > 0, "native creation update")
        for (let turn = 0; turn < 3 && pendingUpdates.length > 0; turn += 1) {
          const updates = pendingUpdates.splice(0)
          let finished = false
          const updating = Promise.all(updates.map((update) => update())).then(() => { finished = true })
          await until(() => finished, "native destination layout")
          await updating
        }
        await until(() => router.state.location.pathname === `/${encodeDirectory(destination)}/chat`, "new notebook route")
        expect(useChatStore.getState().activeDirectory).toBe(destination)
        expect(useChatStore.getState().directories[destination]).toMatchObject({ isReady: true, isDraft: true })
        expect(readActiveChatTransitionID() - before).toBe(1)
        expect(container.querySelector('[data-component="chat-empty-state-board"]')).not.toBeNull()
        expect(container.querySelector('[data-component="directory-workspace-hydrating"]')).toBeNull()
        expect(observedHydrating).toEqual([])
        expect(dialog.isConnected).toBe(false)
      } finally {
        observer.disconnect()
        clock?.mockRestore()
        hydration.resolve()
        created.resolve(Response.json({ directory: destination }))
        Reflect.deleteProperty(document, "startViewTransition")
        await act(async () => {
          await Promise.all(pendingUpdates.splice(0).map((update) => update()))
        })
        await act(async () => { root.unmount() })
        queryClient.clear()
        container.remove()
      }
    })
  }
}
