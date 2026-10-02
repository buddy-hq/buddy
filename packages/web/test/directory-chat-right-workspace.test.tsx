import { afterEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  DirectoryChatRightWorkspace,
  DirectoryChatRightWorkspaceContent,
  resolveRightWorkspaceFilesPresentation,
} from "../src/components/directory-chat/directory-chat-right-workspace"
import { resolveRightWorkspaceOpenOutcome } from "../src/components/directory-chat/right-workspace-open"
import { BenchContent } from "../src/components/directory-chat/directory-chat-bench-page-layout"
import {
  DirectoryWorkspaceProvider,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import { encodeDirectory } from "../src/lib/directory-token"
import { BENCH_LAYOUT_PROFILE_READING } from "../src/lib/bench-navigation"
import { resolveWorkspacePresentation } from "../src/lib/directory-chat/workspace-presentation"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"
import { useHostedBrowserStore } from "../src/state/hosted-browser-store"
import { skillsCatalogQueryKeys } from "../src/state/skills-catalog-query"
import { workspaceChatKeyForSession } from "../src/lib/workspace-chat-key"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"
import {
  WORKSPACE_DESTINATION_RESTORE,
  workspacePresentationSlotForChat,
} from "../src/state/directory-workspace-store"
import { useStore } from "zustand"
import { notesQueryKeys } from "../src/features/notes/queries"
import type { NotesLibrary } from "../src/features/notes/api"
import {
  PlatformProvider,
  createBrowserPlatform,
  setRuntimePlatform,
  type Platform,
} from "../src/context/platform"
import { useUiPreferences } from "../src/state/ui-preferences"

const TEST_DIRECTORY = "/repo"
const TEST_RESOURCE_ID = "resource-1"
const TEST_NOTE_ID = "01M0TK829PD2067YDMZ1Y8RCBF"
const TEST_NOTE_STORAGE_DIRECTORY = "/home/Notes"
const FLUSH_DELAY_MS = 0
const CHAT_A_KEY = workspaceChatKeyForSession(undefined)
const CHAT_B_KEY = workspaceChatKeyForSession("session-b")

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, FLUSH_DELAY_MS)
  })
}

function withQueryClient(content: ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {content}
    </QueryClientProvider>
  )
}

function RightWorkspaceHarness(props: { sessionID?: string; suppressDrawerMotion?: boolean }) {
  const workspace = useDirectoryWorkspace()
  const location = useLocation()
  const slot = useStore(workspace.store, (state) =>
    workspacePresentationSlotForChat(state.slots, state.activeChatKey),
  )
  const presentation = resolveWorkspacePresentation({
    projection: workspace.projection,
    hydrated: true,
    layoutProfile: BENCH_LAYOUT_PROFILE_READING,
    viewport: { widthPx: 1_440, heightPx: 900, safeTopPx: 0 },
    requestedWorkspaceWidthPx: 720,
    requestedBenchWidthPx: 720,
    leftSidebarPreferredOpen: true,
    leftSidebarWidthPx: 280,
  })

  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="bench-visibility">{workspace.projection.bench.visibility}</span>
      <span data-testid="drawer">{workspace.projection.drawer ?? "none"}</span>
      <button
        type="button"
        data-testid="open-empty"
        onClick={() => void workspace.controller.execute({ type: "open-empty" })}
      >
        New tab
      </button>
      <button
        type="button"
        data-testid="prepare-chat-change"
        onClick={() => {
          void workspace.controller.execute({
            type: "prepare-chat-change",
            outgoingChatKey: CHAT_A_KEY,
            destinationChatKey: CHAT_B_KEY,
            destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
          })
        }}
      >
        Prepare session change
      </button>
      <button
        type="button"
        data-testid="restore-chat-a"
        onClick={() => {
          void workspace.controller.execute({
            type: "restore-chat",
            chatKey: CHAT_A_KEY,
          })
        }}
      >
        Restore chat A
      </button>
      <DirectoryChatRightWorkspace
        directory={TEST_DIRECTORY}
        sessionID={props.sessionID}
        sessions={[]}
        workspaceWidth={720}
        suppressDrawerMotion={props.suppressDrawerMotion}
        onCreateCreation={() => undefined}
        onNewBoard={async () => undefined}
        onNewNote={async () => undefined}
        onOpenThread={async () => true}
        onOpenResource={() => undefined}
        tabs={[]}
        activeTabKey={null}
        onActivateTab={() => undefined}
        onCloseTab={() => undefined}
        onCloseOtherTabs={() => undefined}
        onCloseTabsToRight={() => undefined}
        onCloseAllTabs={() => undefined}
        onNewTab={() => undefined}
        emptyTabIDs={slot.emptyTabIDs}
        activeEmptyTabID={slot.activeEmptyTabID ?? null}
        bench={<div data-testid="bench-target">Reader target</div>}
        presentation={presentation}
      />
    </div>
  )
}

function ChatRouteMarker() {
  return (
    <>
      <span data-testid="chat-route">Chat route</span>
      <RightWorkspaceHarness />
    </>
  )
}

function createTestRouter(options?: {
  sessionID?: string
  suppressDrawerMotion?: boolean
  obsidianConnected?: boolean
}) {
  const sessionID = options === undefined ? "session-1" : options.sessionID
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(workspaceObjectsQueryKeys.all(TEST_DIRECTORY), {
    objects: [],
    loadErrors: [],
  })
  queryClient.setQueryData(workspaceObjectsQueryKeys.kind(TEST_DIRECTORY, "whiteboard"), {
    objects: [],
    loadErrors: [],
  })
  queryClient.setQueryData(processedResourcesQueryKey(TEST_DIRECTORY), [])
  queryClient.setQueryData(skillsCatalogQueryKeys.catalog(TEST_DIRECTORY), {
    directory: TEST_DIRECTORY,
    managedRoot: "/skills",
    externalVendorRootsEnabled: true,
    installed: [],
    library: [],
  })
  queryClient.setQueryData(obsidianVaultQueryKeys.profile(TEST_DIRECTORY), {
    detected: options?.obsidianConnected === true,
    connected: options?.obsidianConnected === true,
    configDirectories: options?.obsidianConnected === true ? [".obsidian"] : [],
  })
  queryClient.setQueryData(notesQueryKeys.library(TEST_DIRECTORY), {
    directory: "/home/Notes",
    activeNotebookID: "notebook-1",
    notes: [],
  })
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const directoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory",
    component: () => (
      <QueryClientProvider client={queryClient}>
        <DirectoryWorkspaceProvider directory={TEST_DIRECTORY}>
          <Outlet />
        </DirectoryWorkspaceProvider>
      </QueryClientProvider>
    ),
  })
  const chatRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "chat",
    component: ChatRouteMarker,
  })
  const objectRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "objects/$kind/$objectID",
    component: () => (
      <RightWorkspaceHarness
        sessionID={sessionID}
        suppressDrawerMotion={options?.suppressDrawerMotion}
      />
    ),
  })
  const routeTree = rootRoute.addChildren([directoryRoute.addChildren([chatRoute, objectRoute])])
  return createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [
        `/${encodeDirectory(TEST_DIRECTORY)}/objects/resource/${TEST_RESOURCE_ID}?view=reader`,
      ],
    }),
  })
}

describe("DirectoryChatRightWorkspace", () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(async () => {
    if (root && container) {
      await act(async () => {
        root?.unmount()
        await flushEffects()
      })
      container.remove()
    }
    root = undefined
    container = undefined
    localStorage.clear()
    useUiPreferences.setState({ collapsedWorkspaceLists: {} })
    useHostedBrowserStore.getState().reset()
    setRuntimePlatform(createBrowserPlatform())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("toggles the Resources list beside the retained reader from its rail chip", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const sourcesButton = container.querySelector<HTMLButtonElement>('button[aria-label="Sources"]')
    expect(sourcesButton).not.toBeNull()
    expect(sourcesButton?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
    expect(container.querySelector('aside[aria-label="Resources"]')).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Hide resources"]')?.getAttribute("aria-expanded"),
    ).toBe("true")

    await act(async () => {
      sourcesButton?.click()
      await flushEffects()
    })

    expect(
      container.querySelector('[aria-label="Show resources"]')?.getAttribute("aria-expanded"),
    ).toBe("false")
    expect(sourcesButton?.getAttribute("aria-pressed")).toBe("false")
    expect(useUiPreferences.getState().collapsedWorkspaceLists).toEqual({ sources: true })
    expect(container.querySelector('[data-testid="chat-route"]')).toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="pathname"]')?.textContent).toBe(
      `/${encodeDirectory(TEST_DIRECTORY)}/objects/resource/${TEST_RESOURCE_ID}`,
    )
    expect(container.querySelector('[data-testid="bench-visibility"]')?.textContent).toBe("visible")
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("none")
    expect(container.querySelector('[data-component="right-workspace-selector-drawer"]')).toBeNull()

    await act(async () => {
      sourcesButton?.click()
      await flushEffects()
    })

    expect(
      container.querySelector('[aria-label="Hide resources"]')?.getAttribute("aria-expanded"),
    ).toBe("true")
    expect(sourcesButton?.getAttribute("aria-pressed")).toBe("true")
    expect(useUiPreferences.getState().collapsedWorkspaceLists).toEqual({})

    const hideList = container.querySelector<HTMLButtonElement>('[aria-label="Hide resources"]')
    await act(async () => {
      hideList?.click()
      await flushEffects()
    })
    expect(sourcesButton?.getAttribute("aria-pressed")).toBe("false")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })

  test("keeps a hidden list hidden when the sidebar is opened again", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const hideList = container.querySelector<HTMLButtonElement>('[aria-label="Hide resources"]')
    expect(hideList?.getAttribute("aria-expanded")).toBe("true")
    await act(async () => {
      hideList?.click()
      await flushEffects()
    })
    expect(container.querySelector('[aria-label="Show resources"]')).not.toBeNull()

    // Leaving and returning (a restart, or a trip to Settings) rebuilds the sidebar from scratch.
    await act(async () => {
      root?.unmount()
      await flushEffects()
    })
    container.remove()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    expect(container.querySelector('[aria-label="Hide resources"]')).toBeNull()
    expect(
      container.querySelector('[aria-label="Show resources"]')?.getAttribute("aria-expanded"),
    ).toBe("false")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
    expect(useUiPreferences.getState().collapsedWorkspaceLists).toEqual({ sources: true })
  })

  test("renders the accepted notebook-scoped rail in order", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const labels = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-component="right-workspace-rail"] button',
      ),
      (button) => button.getAttribute("aria-label"),
    )
    expect(labels).toEqual([
      "Sources",
      "Practice",
      "Creations",
      "Boards",
      "Files",
      "Notes",
      "Skills",
      "Notebook Instructions",
    ])
  })

  test("opens Notes as the central note library drawer", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[aria-label="Notes"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("notes")
    expect(container.textContent).toContain("No notes in this notebook")
    expect(container.textContent).toContain("Show all notes")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })

  test("uses the Obsidian rail mark for a connected vault", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter({ obsidianConnected: true })} />)
      await flushEffects()
    })

    const filesButton = container.querySelector<HTMLButtonElement>('[aria-label="Files"]')
    expect(
      filesButton?.querySelector('[data-component="right-workspace-obsidian-icon"]'),
    ).not.toBeNull()
  })

  test("uses the notebook name for every explorer and the Obsidian variant only when connected", () => {
    expect(
      resolveRightWorkspaceFilesPresentation({
        directory: "/Users/prashant/Notes",
        obsidianConnected: false,
      }),
    ).toEqual({ title: "Notes", variant: "default" })
    expect(
      resolveRightWorkspaceFilesPresentation({
        directory: "C:\\Users\\prashant\\Vault",
        obsidianConnected: true,
      }),
    ).toEqual({ title: "Vault", variant: "obsidian" })
  })

  test("provides the empty search page without a search rail button", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="open-empty"]')?.click()
      await flushEffects()
    })
    expect(container.querySelector('[aria-label="Search"]')).toBeNull()
    expect(container.querySelector('[data-component="bench-empty-state"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Search this notebook"]')).not.toBeNull()
    expect(container.querySelector('[data-component="bench-tabs"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="New tab"]')).not.toBeNull()
    expect(
      container.querySelector('[data-component="bench-tab"][data-empty="true"]'),
    ).not.toBeNull()
  })

  test("opens Skills as a real right-workspace drawer", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const skillsButton = container.querySelector<HTMLButtonElement>('[aria-label="Skills"]')
    await act(async () => {
      skillsButton?.click()
      await flushEffects()
    })

    expect(skillsButton?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[data-component="right-workspace-drawer"]')).not.toBeNull()
    expect(container.textContent).toContain("No skills yet")
  })

  test("restores a chat's last drawer without replaying entrance motion", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter({ suppressDrawerMotion: true })} />)
      await flushEffects()
    })

    const skillsButton = container.querySelector<HTMLButtonElement>('[aria-label="Skills"]')
    await act(async () => {
      skillsButton?.click()
      await flushEffects()
    })

    const mountedDrawer = container.querySelector(
      '[data-component="right-workspace-selector-drawer"]',
    )
    expect(mountedDrawer).not.toBeNull()
    expect(mountedDrawer?.className).not.toContain("animate-in")

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="prepare-chat-change"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("none")
    expect(mountedDrawer?.isConnected).toBeFalse()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="restore-chat-a"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("skills")
    const restoredDrawer = container.querySelector(
      '[data-component="right-workspace-selector-drawer"]',
    )
    expect(restoredDrawer).not.toBeNull()
    expect(restoredDrawer).not.toBe(mountedDrawer)
    expect(restoredDrawer?.className).not.toContain("animate-in")
  })

  test("opens Boards from the non-creating peek state", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const boardsButton = container.querySelector<HTMLButtonElement>('[aria-label="Boards"]')
    await act(async () => {
      boardsButton?.click()
      await flushEffects()
    })

    expect(
      container
        .querySelector('[data-component="right-workspace-drawer"]')
        ?.getAttribute("aria-label"),
    ).toBe("Boards")
    expect(container.textContent).toContain("No boards yet")
  })

  test("shows the create board empty state without an active chat", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter({})} />)
      await flushEffects()
    })

    const boardsButton = container.querySelector<HTMLButtonElement>('[aria-label="Boards"]')
    await act(async () => {
      boardsButton?.click()
      await flushEffects()
    })

    expect(
      container
        .querySelector('[data-component="right-workspace-drawer"]')
        ?.getAttribute("aria-label"),
    ).toBe("Boards")
    expect(container.textContent).toContain("No boards yet")
    expect(container.querySelector('button[aria-label="Create board"]')).not.toBeNull()
    expect(container.textContent).not.toContain("Start a chat first")
  })

  test("keeps unsuccessful open outcomes distinct from drawer-closing success", () => {
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "failed",
      }),
    ).toBe("failed")
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "inactive",
      }),
    ).toBe("failed")
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "superseded",
      }),
    ).toBe("failed")
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "blocked",
      }),
    ).toBe("blocked")
  })

  test("fills a targetless workspace with the selector instead of rendering an overlay", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        withQueryClient(
          <DirectoryChatRightWorkspaceContent
            hasBenchTarget={false}
            bench={<div data-testid="bench-target">Reader target</div>}
            selectorContent={<div data-testid="selector-content">Explorer</div>}
            selectorDrawerWidth={360}
          />,
        ),
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="right-workspace-selector-content"]')).not.toBe(
      null,
    )
    expect(container.querySelector('[data-component="right-workspace-selector-drawer"]')).toBeNull()
    // The Bench container stays mounted and hidden rather than unmounting. Removing it here would
    // destroy every kept-alive surface on each chat transition, because the projection reports a
    // closed Bench mid-switch.
    const benchContainer = container.querySelector(
      '[data-component="right-workspace-bench-target"]',
    )
    expect(benchContainer?.getAttribute("data-bench-visible")).toBe("false")
    expect(benchContainer?.className).toContain("hidden")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })

  test("renders the search landing when the Bench has no tab or drawer", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        withQueryClient(
          <DirectoryChatRightWorkspaceContent
            hasBenchTarget={false}
            selectorContent={null}
            emptyContent={<div data-testid="search-landing">Search landing</div>}
            selectorDrawerWidth={0}
          />,
        ),
      )
    })

    expect(container.querySelector('[data-testid="search-landing"]')).not.toBeNull()
    expect(
      container.querySelector('[data-component="right-workspace-selector-content"]'),
    ).toBeNull()
  })

  test("overlays a selector when Bench has a retained target", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        withQueryClient(
          <DirectoryChatRightWorkspaceContent
            hasBenchTarget
            bench={<div data-testid="bench-target">Reader target</div>}
            selectorContent={<div data-testid="selector-content">Explorer</div>}
            selectorDrawerWidth={360}
          />,
        ),
      )
      await flushEffects()
    })

    expect(
      container.querySelector('[data-component="right-workspace-selector-content"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-component="right-workspace-selector-drawer"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })

  test("keeps one view-transition owner around the composed Bench surface", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        withQueryClient(
          <BenchContent bordered={false}>
            <DirectoryChatRightWorkspaceContent
              hasBenchTarget
              bench={<div data-testid="bench-target">Reader target</div>}
              selectorContent={null}
              selectorDrawerWidth={0}
            />
          </BenchContent>,
        ),
      )
      await flushEffects()
    })

    expect(
      container.querySelectorAll('[class*="view-transition-name:buddy-bench-surface"]'),
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-component="right-workspace-bench-target"]'),
    ).not.toBeNull()
  })

  describe("note header path", () => {
    const OPENED_NOTE_PATH = "Chat notes/QA checkpoint test.md"

    function createNoteHeaderHarness() {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const actionPaths: string[] = []
      const platform = {
        ...createBrowserPlatform(),
        listFileApplications: async (path: string) => {
          actionPaths.push(path)
          return { applications: [], defaultApplication: null }
        },
      } satisfies Platform

      return {
        actionPaths,
        async publishLibrary(notes: { id: string; relativePath: string }[]) {
          await act(async () => {
            queryClient.setQueryData<NotesLibrary>(notesQueryKeys.library(TEST_DIRECTORY), {
              directory: TEST_NOTE_STORAGE_DIRECTORY,
              activeNotebookID: "notebook-1",
              notes: notes.map((note) => ({
                kind: "buddy",
                id: note.id,
                type: "buddy-note",
                title: "Note",
                relativePath: note.relativePath,
                notebook: "Notebook",
                notebookID: "notebook-1",
                notebookAvailable: true,
                updatedAt: 1,
              })),
            })
            await flushEffects()
          })
        },
        async render(noteID: string | undefined) {
          await act(async () => {
            root?.render(
              <PlatformProvider value={platform}>
                <QueryClientProvider client={queryClient}>
                  <DirectoryChatRightWorkspaceContent
                    hasBenchTarget
                    bench={<div data-testid="bench-target">Note</div>}
                    selectorContent={null}
                    selectorDrawerWidth={0}
                    fileView={{
                      directory: TEST_DIRECTORY,
                      kind: "note",
                      path: OPENED_NOTE_PATH,
                      noteID,
                      active: true,
                      showEmpty: false,
                      drawer: null,
                      treeOpen: false,
                      onTreeOpenChange: () => undefined,
                    }}
                  />
                </QueryClientProvider>
              </PlatformProvider>,
            )
            await flushEffects()
          })
        },
      }
    }

    function currentFileName() {
      return container
        ?.querySelector('nav[aria-label="Note path"] [aria-current="page"]')
        ?.textContent?.trim()
    }

    test("follows a note's renamed file by id while its target keeps the opened path", async () => {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
      container = document.createElement("div")
      document.body.appendChild(container)
      root = createRoot(container)
      const harness = createNoteHeaderHarness()
      await harness.publishLibrary([{ id: TEST_NOTE_ID, relativePath: OPENED_NOTE_PATH }])

      await harness.render(TEST_NOTE_ID)
      expect(currentFileName()).toBe("QA checkpoint test.md")
      expect(harness.actionPaths.at(-1)).toBe(`${TEST_NOTE_STORAGE_DIRECTORY}/${OPENED_NOTE_PATH}`)

      await harness.publishLibrary([
        { id: TEST_NOTE_ID, relativePath: "Chat notes/QA renamed chat alpha.md" },
      ])
      expect(currentFileName()).toBe("QA renamed chat alpha.md")
      expect(harness.actionPaths.at(-1)).toBe(
        `${TEST_NOTE_STORAGE_DIRECTORY}/Chat notes/QA renamed chat alpha.md`,
      )

      await harness.publishLibrary([
        { id: TEST_NOTE_ID, relativePath: "Chat notes/QA manual note two.md" },
      ])
      expect(currentFileName()).toBe("QA manual note two.md")
      expect(container.querySelector('nav[aria-label="Note path"]')?.textContent).not.toContain(
        "QA checkpoint test",
      )
      expect(harness.actionPaths.at(-1)).toBe(
        `${TEST_NOTE_STORAGE_DIRECTORY}/Chat notes/QA manual note two.md`,
      )
    })

    test("keeps the target path for a note without an id or missing from the library", async () => {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
      container = document.createElement("div")
      document.body.appendChild(container)
      root = createRoot(container)
      const harness = createNoteHeaderHarness()
      await harness.publishLibrary([{ id: "other-note", relativePath: "Chat notes/Other note.md" }])

      await harness.render(undefined)
      expect(currentFileName()).toBe("QA checkpoint test.md")

      await harness.render(TEST_NOTE_ID)
      expect(currentFileName()).toBe("QA checkpoint test.md")
      expect(harness.actionPaths.at(-1)).toBe(`${TEST_NOTE_STORAGE_DIRECTORY}/${OPENED_NOTE_PATH}`)
    })
  })
})
