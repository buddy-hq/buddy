import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatLeftSidebar } from "../src/components/layout/chat-left-sidebar"
import { mergeDirectoryOrder } from "../src/components/layout/chat-left-sidebar/use-directory-reordering"
import type { SessionInfo } from "../src/state/chat-types"
import { experimentalFeaturesQueryKeys } from "../src/state/experimental-features-query"
import { globalConfigQueryKeys } from "../src/state/global-config-query"
import { useGetStartedFlowStore } from "../src/state/get-started-flow-store"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"
import { UI_PREFERENCES_STORAGE_KEY, useUiPreferences } from "../src/state/ui-preferences"
import { parsePersistedStoreState } from "./parse-test-values"

const NOTEBOOK_A = "/tmp/pinned-notebooks/a"
const NOTEBOOK_B = "/tmp/pinned-notebooks/b"
const NOTEBOOK_C = "/tmp/pinned-notebooks/c"
const DIRECTORIES = [NOTEBOOK_A, NOTEBOOK_B, NOTEBOOK_C]

function chat(id: string, updated: number): SessionInfo {
  return { id, title: `Chat ${id}`, time: { created: updated, updated } }
}

const SESSIONS_BY_DIRECTORY = {
  [NOTEBOOK_A]: [chat("a1", 1)],
  [NOTEBOOK_B]: [chat("b1", 2)],
  [NOTEBOOK_C]: [chat("c1", 3)],
} satisfies Record<string, SessionInfo[]>

describe("mergeDirectoryOrder", () => {
  test("reorders a shown subset inside the slots it held", () => {
    expect(mergeDirectoryOrder(["a", "pinned", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "pinned",
      "a",
      "b",
    ])
  })

  test("ignores directories the full order does not know", () => {
    expect(mergeDirectoryOrder(["a", "b"], ["b", "gone", "a"])).toEqual(["b", "a"])
  })
})

describe("pinned notebook preferences", () => {
  beforeEach(() => {
    localStorage.clear()
    useUiPreferences.setState({ pinnedDirectories: [] })
  })

  test("pins notebooks in order, unpins them, and saves the choice", () => {
    const state = useUiPreferences.getState()

    state.togglePinnedDirectory(NOTEBOOK_B)
    state.togglePinnedDirectory(NOTEBOOK_A)
    expect(useUiPreferences.getState().pinnedDirectories).toEqual([NOTEBOOK_B, NOTEBOOK_A])

    state.togglePinnedDirectory(NOTEBOOK_B)
    expect(useUiPreferences.getState().pinnedDirectories).toEqual([NOTEBOOK_A])
    expect(
      parsePersistedStoreState(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)),
    ).toMatchObject({ pinnedDirectories: [NOTEBOOK_A] })
  })

  test("keeps one entry per notebook when the order is replaced", () => {
    useUiPreferences.getState().setPinnedDirectories([NOTEBOOK_C, NOTEBOOK_A, NOTEBOOK_C])
    expect(useUiPreferences.getState().pinnedDirectories).toEqual([NOTEBOOK_C, NOTEBOOK_A])
  })

  test("rehydrates the saved notebook pin order", async () => {
    useUiPreferences.getState().setPinnedDirectories([NOTEBOOK_C, NOTEBOOK_A])
    const persisted = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)
    expect(persisted).not.toBeNull()

    useUiPreferences.setState({ pinnedDirectories: [] })
    if (persisted) localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, persisted)
    await useUiPreferences.persist.rehydrate()

    expect(useUiPreferences.getState().pinnedDirectories).toEqual([NOTEBOOK_C, NOTEBOOK_A])
  })
})

describe("Chat left sidebar pinned notebooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    localStorage.clear()
    useGetStartedFlowStore.getState().setEnabled(false)
    useUiPreferences.setState({ collapsedChatSidebarDirectories: {}, pinnedDirectories: [] })

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    queryClient.setQueryData(globalConfigQueryKeys.bundle(), {})
    queryClient.setQueryData(experimentalFeaturesQueryKeys.all(), { features: [] })
    for (const directory of DIRECTORIES) {
      queryClient.setQueryData(obsidianVaultQueryKeys.profile(directory), {
        detected: false,
        connected: false,
        configDirectories: [],
      })
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderSidebar(directories = DIRECTORIES) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ChatLeftSidebar
              directories={directories}
              currentDirectory={NOTEBOOK_A}
              sessionsByDirectory={SESSIONS_BY_DIRECTORY}
              sessionStatusByDirectory={{}}
              pinnedByDirectory={{}}
              unreadByDirectory={{}}
              onOpenDirectory={() => {}}
              onNewSession={() => {}}
              onSelectSession={async () => true}
              onTogglePin={() => {}}
              onToggleUnread={() => {}}
              onArchiveSession={async () => {}}
              onDeleteSession={async () => true}
              onRenameSession={async () => {}}
              onReorderDirectories={() => {}}
              onCloseDirectory={() => {}}
              onOpenSettings={() => {}}
              onOpenMcpSettings={() => {}}
            />
          </TooltipProvider>
        </QueryClientProvider>,
      )
    })
  }

  function notebookToggles(selector: string) {
    return [
      ...container.querySelectorAll<HTMLElement>(
        `${selector} [data-action="left-sidebar-directory-toggle"]`,
      ),
    ].map((toggle) => toggle.dataset.directory)
  }

  async function openNotebookMenu(directory: string) {
    const toggle = container.querySelector<HTMLElement>(
      `[data-action="left-sidebar-directory-toggle"][data-directory="${directory}"]`,
    )
    expect(toggle).not.toBeNull()
    await act(async () => {
      toggle?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const item = document.querySelector<HTMLElement>(
      `[data-action="left-sidebar-directory-pin"][data-directory="${directory}"]`,
    )
    expect(item).not.toBeNull()
    return item
  }

  test("moves a pinned notebook into Pinned, above Recents", async () => {
    useUiPreferences.setState({ pinnedDirectories: [NOTEBOOK_C, NOTEBOOK_B] })
    await renderSidebar()

    const pinned = container.querySelector('[data-component="left-sidebar-pinned-list"]')
    const recents = container.querySelector('[data-component="left-sidebar-recents-list"]')
    expect(pinned).not.toBeNull()
    expect(recents).not.toBeNull()
    expect(
      (pinned?.compareDocumentPosition(recents ?? container) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    expect(notebookToggles('[data-component="left-sidebar-pinned-list"]')).toEqual([
      NOTEBOOK_C,
      NOTEBOOK_B,
    ])
    expect(
      notebookToggles('[data-component="left-sidebar-directory-list"]:not([data-pinned])'),
    ).toEqual([NOTEBOOK_A])
  })

  test("leaves out pinned notebooks that are not open", async () => {
    useUiPreferences.setState({ pinnedDirectories: ["/tmp/pinned-notebooks/closed"] })
    await renderSidebar()

    expect(container.querySelector('[data-component="left-sidebar-pinned-list"]')).toBeNull()
  })

  test("restores a closed notebook to its saved pinned position when it reopens", async () => {
    useUiPreferences.setState({ pinnedDirectories: [NOTEBOOK_C, NOTEBOOK_B] })
    await renderSidebar([NOTEBOOK_A, NOTEBOOK_B])

    expect(notebookToggles('[data-component="left-sidebar-pinned-list"]')).toEqual([NOTEBOOK_B])
    expect(useUiPreferences.getState().pinnedDirectories).toEqual([NOTEBOOK_C, NOTEBOOK_B])

    await renderSidebar()

    expect(notebookToggles('[data-component="left-sidebar-pinned-list"]')).toEqual([
      NOTEBOOK_C,
      NOTEBOOK_B,
    ])
  })

  test("pins and unpins a notebook from its menu", async () => {
    await renderSidebar()

    const pinItem = await openNotebookMenu(NOTEBOOK_B)
    expect(pinItem?.textContent).toContain("Pin notebook")
    await act(async () => {
      pinItem?.click()
    })
    expect(useUiPreferences.getState().pinnedDirectories).toEqual([NOTEBOOK_B])
    expect(notebookToggles('[data-component="left-sidebar-pinned-list"]')).toEqual([NOTEBOOK_B])

    const unpinItem = await openNotebookMenu(NOTEBOOK_B)
    expect(unpinItem?.textContent).toContain("Unpin notebook")
    await act(async () => {
      unpinItem?.click()
    })
    expect(useUiPreferences.getState().pinnedDirectories).toEqual([])
    expect(container.querySelector('[data-component="left-sidebar-pinned-list"]')).toBeNull()
  })
})
