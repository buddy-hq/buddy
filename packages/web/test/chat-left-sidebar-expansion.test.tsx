import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatLeftSidebar } from "../src/components/layout/chat-left-sidebar"
import { experimentalFeaturesQueryKeys } from "../src/state/experimental-features-query"
import { globalConfigQueryKeys } from "../src/state/global-config-query"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"
import { useUiPreferences } from "../src/state/ui-preferences"

const NOTEBOOK_A_DIRECTORY = "/tmp/notebook-a"
const NOTEBOOK_B_DIRECTORY = "/tmp/notebook-b"

describe("Chat left sidebar notebook expansion", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    localStorage.clear()
    useUiPreferences.setState({ collapsedChatSidebarDirectories: {} })

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    queryClient.setQueryData(globalConfigQueryKeys.bundle(), {})
    queryClient.setQueryData(experimentalFeaturesQueryKeys.all(), { features: [] })
    for (const directory of [NOTEBOOK_A_DIRECTORY, NOTEBOOK_B_DIRECTORY]) {
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

  test("preserves expansion state when cross-notebook navigation remounts the sidebar", async () => {
    const renderSidebar = async (currentDirectory: string) => {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <ChatLeftSidebar
                key={currentDirectory}
                directories={[NOTEBOOK_A_DIRECTORY, NOTEBOOK_B_DIRECTORY]}
                currentDirectory={currentDirectory}
                sessionsByDirectory={{}}
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

    const getToggle = (directory: string) => {
      const toggle = container.querySelector<HTMLButtonElement>(
        `[data-action="left-sidebar-directory-toggle"][data-directory="${directory}"]`,
      )
      expect(toggle).not.toBeNull()
      return toggle
    }

    await renderSidebar(NOTEBOOK_A_DIRECTORY)
    expect(getToggle(NOTEBOOK_A_DIRECTORY)?.getAttribute("aria-expanded")).toBe("true")
    expect(getToggle(NOTEBOOK_B_DIRECTORY)?.getAttribute("aria-expanded")).toBe("true")

    await renderSidebar(NOTEBOOK_B_DIRECTORY)
    expect(getToggle(NOTEBOOK_A_DIRECTORY)?.getAttribute("aria-expanded")).toBe("true")
    expect(getToggle(NOTEBOOK_B_DIRECTORY)?.getAttribute("aria-expanded")).toBe("true")

    await act(async () => {
      getToggle(NOTEBOOK_A_DIRECTORY)?.click()
    })
    expect(getToggle(NOTEBOOK_A_DIRECTORY)?.getAttribute("aria-expanded")).toBe("false")

    await renderSidebar(NOTEBOOK_A_DIRECTORY)
    expect(getToggle(NOTEBOOK_A_DIRECTORY)?.getAttribute("aria-expanded")).toBe("false")
    expect(getToggle(NOTEBOOK_B_DIRECTORY)?.getAttribute("aria-expanded")).toBe("true")
  })
})
