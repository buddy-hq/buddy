import { afterEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DirectoryWorkspaceContext } from "@/components/directory-chat/directory-workspace-context-value"
import { createBrowserPlatform, PlatformProvider } from "@/context/platform"
import { setRuntimeServerConnection } from "@/context/server"
import { withFetchPreconnect } from "@/lib/fetch-transport"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_WORKSPACE_ROOT_NOTEBOOK,
  BENCH_WORKSPACE_ROOT_NOTES,
  type BenchTabTarget,
} from "@/lib/bench-navigation"
import { allowBenchLeave } from "@/lib/bench-leave-guard"
import { benchTabKey } from "@/lib/bench-tabs"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
} from "@/lib/directory-workspace-controller"
import { DirectoryWorkspaceLifecycleService } from "@/lib/directory-workspace-lifecycle"
import {
  useWorkspaceFileOpen,
  type WorkspaceFileActionInput,
  type WorkspaceResourceOpener,
} from "@/lib/use-workspace-file-open"
import { WORKSPACE_CHAT_DRAFT_KEY, workspaceChatKeyForSession } from "@/lib/workspace-chat-key"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  BENCH_ROUTE_STATUS_OPEN,
  DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  WORKSPACE_HYDRATION_READY,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  type BenchRouteSnapshot,
  type DirectoryWorkspaceStore,
  type WorkspacePresentationSlot,
} from "@/state/directory-workspace-store"
import type { ResourceReadingTarget } from "@/state/resources-query"
import {
  consumeWorkspaceFileLargeOpenApproval,
  grantWorkspaceFileLargeOpenApproval,
  revokeWorkspaceFileLargeOpenApproval,
  useWorkspaceFileOpenDialogStore,
} from "@/state/workspace-file-open-dialog-store"

const DIRECTORY = "/repo/notebook"
const BOOK_PATH = "books/This Is Marketing - Seth Godin.epub"
const BOOK_OBJECT_ID = "res_marketing"
const OTHER_PATH = "books/other.epub"
const OTHER_OBJECT_ID = "res_other"
const BOOK_BYTES = 2_400_000
const LARGE_OPEN_PROMPT_ATTEMPTS = 20
const originalFetch = globalThis.fetch

const bookFileTarget = {
  type: "workspace-file",
  root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
  path: BOOK_PATH,
  viewer: "file",
} satisfies BenchTabTarget

const bookObjectTarget = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: BOOK_OBJECT_ID,
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTabTarget

const otherFileTarget = {
  type: "workspace-file",
  root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
  path: "notes/worksheet.md",
  viewer: "markdown",
} satisfies BenchTabTarget

const notesFileTarget = {
  type: "workspace-file",
  root: BENCH_WORKSPACE_ROOT_NOTES,
  path: BOOK_PATH,
  viewer: "file",
} satisfies BenchTabTarget

function largeEpubInput(path: string, objectID?: string): WorkspaceFileActionInput {
  return Object.assign(
    {
      path,
      absolutePath: `${DIRECTORY}/${path.replace(/^\/+/, "")}`,
      available: true,
      canOpenInBuddy: true,
      canOpenDefaultApp: true,
      canReveal: true,
      mimeType: "application/epub+zip",
      sizeBytes: BOOK_BYTES,
    },
    objectID ? { objectID } : undefined,
  )
}

function workspaceRoute(targets: readonly BenchTabTarget[]): BenchRouteSnapshot {
  const active = targets[0]
  if (!active) return { status: BENCH_ROUTE_STATUS_CLOSED }
  return {
    status: BENCH_ROUTE_STATUS_OPEN,
    target: active,
    mode: BENCH_CHAT_LAYOUT_DOCKED,
  }
}

const OTHER_CHAT_KEY = workspaceChatKeyForSession("chat-a")

function slotFor(
  targets: readonly BenchTabTarget[],
  docked: ReturnType<typeof createExpandedWorkspaceState>,
): WorkspacePresentationSlot {
  return {
    route: workspaceRoute(targets),
    tabs: targets.map((target) => ({ key: benchTabKey(target), target })),
    docked,
    lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  }
}

function mountWorkspace(
  targets: readonly BenchTabTarget[],
  parkedTargets: readonly BenchTabTarget[] = [],
) {
  const route = workspaceRoute(targets)
  const docked = createExpandedWorkspaceState(null)
  const store: DirectoryWorkspaceStore = createDirectoryWorkspaceStore({
    directory: DIRECTORY,
    initialState: {
      activeChatKey: WORKSPACE_CHAT_DRAFT_KEY,
      hydration: { status: WORKSPACE_HYDRATION_READY },
      docked,
      lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
      slots: {
        [WORKSPACE_CHAT_DRAFT_KEY]: slotFor(targets, docked),
        ...(parkedTargets.length > 0
          ? { [OTHER_CHAT_KEY]: slotFor(parkedTargets, docked) }
          : undefined),
      },
    },
  })
  const blocker = new DirectoryWorkspaceBlocker({
    directory: DIRECTORY,
    getCurrentRoute: () => route,
    guardLeave: () => allowBenchLeave(),
  })
  const controller = new DirectoryWorkspaceController({
    directory: DIRECTORY,
    store,
    getRoute: () => route,
    navigate: async () => ({ pathname: "/", search: {} }),
    blocker,
  })
  const projection = effectiveWorkspaceProjection(
    route,
    { docked, lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER },
    null,
  )
  const lifecycle = new DirectoryWorkspaceLifecycleService({
    directory: DIRECTORY,
    getProjection: () => projection,
    getTabs: () => store.getState().slots[WORKSPACE_CHAT_DRAFT_KEY]?.tabs ?? [],
    getHydrationStatus: () => store.getState().hydration.status,
    getRouteFallbackContext: () => null,
  })
  return {
    value: {
      directory: DIRECTORY,
      store,
      controller,
      blocker,
      lifecycle,
      route,
      projection,
    },
    async dispose() {
      controller.dispose()
      await lifecycle.dispose()
    },
  }
}

async function readLargeOpenPrompt(pending: Promise<boolean>) {
  void pending.catch(() => undefined)
  for (let attempt = 0; attempt < LARGE_OPEN_PROMPT_ATTEMPTS; attempt += 1) {
    const request = useWorkspaceFileOpenDialogStore.getState().request
    if (request) return request
    await act(async () => {
      await Promise.resolve()
    })
  }
  return useWorkspaceFileOpenDialogStore.getState().request
}

function installResourceCatalog() {
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  globalThis.fetch = withFetchPreconnect(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://buddy.test")
    if (url.pathname !== "/api/objects/resource") {
      throw new Error(`Unexpected request: ${url.pathname}`)
    }
    return Response.json({
      resources: [
        {
          objectID: BOOK_OBJECT_ID,
          alias: "marketing.epub",
          format: "epub",
          status: "ready",
          sourceRelpath: BOOK_PATH,
          readerPath: BOOK_PATH,
        },
      ],
    })
  }, originalFetch)
}

describe("large EPUB open approval", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let disposeWorkspace: (() => Promise<void>) | undefined

  afterEach(async () => {
    const request = useWorkspaceFileOpenDialogStore.getState().request
    if (request) useWorkspaceFileOpenDialogStore.getState().resolveRequest("cancel")
    revokeWorkspaceFileLargeOpenApproval(DIRECTORY, BOOK_PATH)
    revokeWorkspaceFileLargeOpenApproval(DIRECTORY, `/${BOOK_PATH}`)
    revokeWorkspaceFileLargeOpenApproval(DIRECTORY, OTHER_PATH)
    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    await disposeWorkspace?.()
    disposeWorkspace = undefined
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderOpener(
    targets: readonly BenchTabTarget[],
    parkedTargets: readonly BenchTabTarget[] = [],
  ) {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const workspace = mountWorkspace(targets, parkedTargets)
    disposeWorkspace = workspace.dispose
    const opens: ResourceReadingTarget[] = []
    let opener: ReturnType<typeof useWorkspaceFileOpen> | undefined
    const onOpenResource: WorkspaceResourceOpener = (_directory, resource) => {
      opens.push(resource)
    }
    function Probe() {
      opener = useWorkspaceFileOpen(DIRECTORY, onOpenResource)
      return null
    }
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <DirectoryWorkspaceContext.Provider value={workspace.value}>
              <Probe />
            </DirectoryWorkspaceContext.Provider>
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    if (!opener) throw new Error("workspace file opener did not mount")
    const api = opener
    return { api, opens, store: workspace.value.store }
  }

  test("asks before opening a large EPUB that is not on the Bench", async () => {
    const { api, opens } = await renderOpener([])
    const pending = api.executePrimary(largeEpubInput(BOOK_PATH, BOOK_OBJECT_ID))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt?.path).toBe(BOOK_PATH)
    expect(prompt?.sizeBytes).toBe(BOOK_BYTES)
    expect(opens).toEqual([])
    await act(async () => {
      useWorkspaceFileOpenDialogStore.getState().resolveRequest("cancel")
      await pending
    })
  })

  test("does not ask when that EPUB is already open as a Bench file", async () => {
    const { api, opens } = await renderOpener([bookFileTarget])
    const pending = api.executePrimary(largeEpubInput(`/${BOOK_PATH}`, "res_unused"))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt).toBeUndefined()
    await pending
    expect(opens.map((resource) => resource.path)).toEqual([`/${BOOK_PATH}`])
  })

  test("does not ask when the EPUB is open through Sources in another chat", async () => {
    installResourceCatalog()
    const { api, opens, store } = await renderOpener([], [bookObjectTarget])
    expect(store.getState().activeChatKey).toBe(WORKSPACE_CHAT_DRAFT_KEY)
    expect(store.getState().slots[WORKSPACE_CHAT_DRAFT_KEY]?.tabs).toEqual([])
    expect(store.getState().slots[OTHER_CHAT_KEY]?.tabs.map((tab) => tab.target)).toEqual([
      bookObjectTarget,
    ])
    const pending = api.executePrimary(largeEpubInput(BOOK_PATH))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt).toBeUndefined()
    await pending
    expect(opens).toEqual([
      {
        path: BOOK_PATH,
        name: "This Is Marketing - Seth Godin.epub",
        objectID: BOOK_OBJECT_ID,
        status: "ready",
      },
    ])
  })

  test("does not ask when the open reader is the processed resource for the inline link", async () => {
    installResourceCatalog()
    const { api, opens } = await renderOpener([bookObjectTarget])
    const pending = api.executePrimary(largeEpubInput(BOOK_PATH))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt).toBeUndefined()
    await pending
    expect(opens).toEqual([
      {
        path: BOOK_PATH,
        name: "This Is Marketing - Seth Godin.epub",
        objectID: BOOK_OBJECT_ID,
        status: "ready",
      },
    ])
  })

  test("does not ask when the EPUB is open behind another Bench tab", async () => {
    const { api, opens } = await renderOpener([otherFileTarget, bookFileTarget])
    const pending = api.executePrimary(largeEpubInput(BOOK_PATH, BOOK_OBJECT_ID))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt).toBeUndefined()
    await pending
    expect(opens.map((resource) => resource.objectID)).toEqual([BOOK_OBJECT_ID])
  })

  test("still asks when only a Notes file shares the path", async () => {
    const { api, opens } = await renderOpener([notesFileTarget])
    const pending = api.executePrimary(largeEpubInput(BOOK_PATH, BOOK_OBJECT_ID))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt?.path).toBe(BOOK_PATH)
    expect(opens).toEqual([])
    await act(async () => {
      useWorkspaceFileOpenDialogStore.getState().resolveRequest("cancel")
      await pending
    })
  })

  test("does not ask again after the EPUB was approved earlier in this session", async () => {
    grantWorkspaceFileLargeOpenApproval(DIRECTORY, BOOK_PATH)
    expect(consumeWorkspaceFileLargeOpenApproval(DIRECTORY, BOOK_PATH)).toBe(true)
    const { api, opens } = await renderOpener([])
    const pending = api.executePrimary(largeEpubInput(BOOK_PATH, BOOK_OBJECT_ID))
    const prompt = await readLargeOpenPrompt(pending)
    expect(prompt).toBeUndefined()
    await pending
    expect(opens).toHaveLength(1)

    const other = api.executePrimary(largeEpubInput(OTHER_PATH, OTHER_OBJECT_ID))
    const otherPrompt = await readLargeOpenPrompt(other)
    expect(otherPrompt?.path).toBe(OTHER_PATH)
    expect(opens).toHaveLength(1)
    await act(async () => {
      useWorkspaceFileOpenDialogStore.getState().resolveRequest("cancel")
      await other
    })
  })
})
