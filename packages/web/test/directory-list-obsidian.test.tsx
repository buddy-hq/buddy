import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
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

  test("uses the Obsidian logo only for a connected vault", async () => {
    const directory = "/tmp/obsidian-vault"
    const onDisconnectObsidianVault = mock(() => {})
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(obsidianVaultQueryKeys.profile(directory), {
      detected: true,
      connected: true,
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
              onRequestDelete={() => {}}
              onRequestRename={() => {}}
              onLabelPointerDown={() => {}}
              onSectionRef={() => () => {}}
              onNewSession={() => {}}
              onOpenNotebookSettings={() => {}}
              onDisconnectObsidianVault={onDisconnectObsidianVault}
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

    const directoryTrigger = container.querySelector<HTMLElement>(
      '[data-action="left-sidebar-directory-toggle"]',
    )
    await act(async () => {
      directoryTrigger?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const disconnectItem = document.querySelector<HTMLElement>(
      '[data-action="left-sidebar-directory-disconnect-obsidian"]',
    )
    expect(disconnectItem?.textContent).toContain("Disconnect Obsidian")

    await act(async () => {
      disconnectItem?.click()
    })
    expect(onDisconnectObsidianVault).toHaveBeenCalledTimes(1)

    await act(async () => {
      queryClient.setQueryData(obsidianVaultQueryKeys.profile(directory), {
        detected: true,
        connected: false,
        configDirectories: [".obsidian"],
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(
      container.querySelector('[data-component="left-sidebar-obsidian-vault-icon"]'),
    ).toBeNull()
  })
})
