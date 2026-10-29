import { afterEach, beforeEach, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast, TooltipProvider } from "@buddy/ui"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatLeftSidebarDirectoryList } from "../src/components/layout/chat-left-sidebar/directory-list"
import { useDirectoryGroups } from "../src/components/layout/chat-left-sidebar/use-directory-groups"
import { preloadProjectSessions } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import type { SessionInfo } from "../src/state/chat-types"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"
import { installTestFetch, restoreTestFetch } from "./test-utils"

const DIRECTORY = "/notebooks/heron"
const SESSION = {
  id: "ses_heron",
  title: "Heron notebook chat",
  time: { created: 1, updated: 1 },
} satisfies SessionInfo

function NotebookSidebar({ initiallyCollapsed = false }: { initiallyCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const directory = useChatStore((state) => state.directories[DIRECTORY])
  const sessionsByDirectory = { [DIRECTORY]: directory?.sessions ?? [] }
  const directoryGroups = useDirectoryGroups({
    directories: [DIRECTORY],
    sessionsByDirectory,
    pinnedByDirectory: {},
    unreadByDirectory: {},
    sessionStatusByDirectory: {},
    currentDirectory: DIRECTORY,
    activeSessionID: directory?.sessionID,
    organizeMode: "project",
    showMode: "relevant",
    sortMode: "updated",
  })

  return (
    <ChatLeftSidebarDirectoryList
      directoryGroups={directoryGroups}
      currentDirectory={DIRECTORY}
      sessionsByDirectory={sessionsByDirectory}
      sessionStatusByDirectory={{}}
      pinnedByDirectory={{}}
      unreadByDirectory={{}}
      organizeMode="project"
      expandedDirectories={{}}
      collapsedDirectories={collapsed ? { [DIRECTORY]: true } : {}}
      dragOverPosition="after"
      onToggleCollapsedDirectory={(_directory, open) => setCollapsed(!open)}
      onToggleExpandedDirectory={() => {}}
      onSelectSession={() => {}}
      onTogglePin={() => {}}
      onTogglePinDirectory={() => {}}
      onToggleUnread={() => {}}
      onRequestArchive={() => {}}
      onRequestDelete={() => {}}
      onRequestRename={() => {}}
      onLabelPointerDown={() => {}}
      onSectionRef={() => () => {}}
      onNewSession={() => {}}
      onOpenNotebookSettings={() => {}}
      onDisconnectObsidianVault={() => {}}
      onCloseDirectory={() => {}}
    />
  )
}

let container: HTMLDivElement
let root: Root
let queryClient: QueryClient
let originalFetch: typeof fetch

async function renderSidebar(initiallyCollapsed = false): Promise<void> {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <NotebookSidebar initiallyCollapsed={initiallyCollapsed} />
        </TooltipProvider>
      </QueryClientProvider>,
    )
  })
}

async function toggleNotebook(): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(
    '[data-action="left-sidebar-directory-toggle"]',
  )
  if (!button) throw new Error("Notebook toggle is missing")
  await act(async () => button.click())
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  originalFetch = globalThis.fetch
  useChatStore.setState({ directories: {} })
  installTestFetch(async () =>
    Response.json(
      { error: "The notebook folder is unavailable", code: "notebook.missing" },
      { status: 404 },
    ),
  )
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(obsidianVaultQueryKeys.profile(DIRECTORY), {
    detected: false,
    connected: false,
    configDirectories: [],
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  restoreTestFetch(originalFetch)
  useChatStore.setState({ directories: {} })
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

test("keeps a missing notebook visible and opens its folder-missing notice", async () => {
  await preloadProjectSessions([DIRECTORY])
  await renderSidebar()

  expect(container.textContent).toContain("Folder not found")
  expect(container.textContent).not.toContain("No chats")
  const missingFolderButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Folder not found",
  )
  expect(missingFolderButton).toBeDefined()
  const previousNotices = toast.getHistory().length

  await act(async () => missingFolderButton?.click())

  expect(toast.getHistory().slice(previousNotices)).toContainEqual(
    expect.objectContaining({
      type: "warning",
      title: 'Couldn\'t find the "heron" folder',
      description: expect.stringContaining(DIRECTORY),
      action: expect.objectContaining({ label: "Close notebook" }),
    }),
  )
})

test("keeps Folder not found when a notebook re-check fails with a transient 503", async () => {
  await preloadProjectSessions([DIRECTORY])
  const missingError = useChatStore.getState().directories[DIRECTORY]?.error
  await renderSidebar(true)
  installTestFetch(async () => Response.json({ error: "Service unavailable" }, { status: 503 }))

  await toggleNotebook()

  expect(container.textContent).toContain("Folder not found")
  expect(container.textContent).not.toContain("No chats")
  expect(useChatStore.getState().directories[DIRECTORY]?.error).toEqual(missingError)
})

test("shows a notebook's chats after a successful folder re-check", async () => {
  await preloadProjectSessions([DIRECTORY])
  await renderSidebar(true)
  installTestFetch(async () => Response.json([SESSION]))

  await toggleNotebook()

  expect(container.textContent).toContain(SESSION.title)
  expect(container.textContent).not.toContain("Folder not found")
  expect(container.textContent).not.toContain("No chats")
  expect(useChatStore.getState().directories[DIRECTORY]?.error).toBeUndefined()
})

test("expanding a notebook that is not missing makes no session request", async () => {
  useChatStore.getState().setSessions(DIRECTORY, [SESSION])
  const sessionRequests: string[] = []
  installTestFetch(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname.endsWith("/session")) sessionRequests.push(url.href)
    return Response.json([SESSION])
  })
  await renderSidebar(true)

  await toggleNotebook()

  expect(container.textContent).toContain(SESSION.title)
  expect(sessionRequests).toEqual([])
})
