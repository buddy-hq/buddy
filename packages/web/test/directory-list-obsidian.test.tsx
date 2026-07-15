import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatLeftSidebarDirectoryList } from "../src/components/layout/chat-left-sidebar/directory-list"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"

describe("Chat sidebar Obsidian vault icon", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("uses the Obsidian logo for a compatible open notebook", async () => {
    const directory = "/tmp/obsidian-vault"
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(obsidianVaultQueryKeys.profile(directory), {
      compatible: true,
      configDirectories: [".obsidian"],
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ChatLeftSidebarDirectoryList
              directoryGroups={[{ directory, sessions: [] }]}
              currentDirectory={directory}
              sessionsByDirectory={{}}
              sessionStatusByDirectory={{}}
              pinnedByDirectory={{}}
              unreadByDirectory={{}}
              organizeMode="project"
              expandedDirectories={{}}
              collapsedDirectories={{}}
              dragOverPosition="after"
              onToggleCollapsedDirectory={() => {}}
              onToggleExpandedDirectory={() => {}}
              onSelectSession={() => {}}
              onTogglePin={() => {}}
              onToggleUnread={() => {}}
              onRequestArchive={() => {}}
              onRequestRename={() => {}}
              onLabelPointerDown={() => {}}
              onSectionRef={() => () => {}}
              onNewSession={() => {}}
              onOpenNotebookSettings={() => {}}
              onCloseDirectory={() => {}}
            />
          </TooltipProvider>
        </QueryClientProvider>,
      )
    })

    const icon = container.querySelector<HTMLImageElement>(
      '[data-component="left-sidebar-obsidian-vault-icon"]',
    )
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute("src")).toContain("obsidian-icon.svg")
  })
})
