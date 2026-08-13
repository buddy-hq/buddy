import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatLeftSidebarDirectoryList } from "../src/components/layout/chat-left-sidebar/directory-list"
import type { SessionInfo } from "../src/state/chat-types"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"

describe("Chat sidebar directory list", () => {
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

  test("shows five quick chats before offering to show more", async () => {
    const directory = "/tmp/inbox"
    const sessions = Array.from(
      { length: 6 },
      (_, index) =>
        ({
          id: `quick-chat-${index + 1}`,
          title: `Quick Chat ${index + 1}`,
          time: { created: index, updated: index },
        }) satisfies SessionInfo,
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ChatLeftSidebarDirectoryList
              directoryGroups={[{ directory, sessions }]}
              currentDirectory={directory}
              sessionsByDirectory={{ [directory]: sessions }}
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
              onDisconnectObsidianVault={() => {}}
              onCloseDirectory={() => {}}
            />
          </TooltipProvider>
        </QueryClientProvider>,
      )
    })

    expect(container.querySelectorAll('[data-action="left-sidebar-thread-select"]')).toHaveLength(5)
    expect(container.textContent).toContain("Show more")
    expect(container.textContent).not.toContain("Quick Chat 6")
  })

  test("only expands subagents for the active chat", async () => {
    const directory = "/tmp/subagent-ownership"
    const chatA = {
      id: "chat-a",
      title: "Chat A",
      time: { created: 1, updated: 1 },
    } satisfies SessionInfo
    const chatAChild = {
      id: "chat-a-child",
      parentID: chatA.id,
      title: "Chat A subagent",
      time: { created: 2, updated: 2 },
    } satisfies SessionInfo
    const chatB = {
      id: "chat-b",
      title: "Chat B",
      time: { created: 3, updated: 3 },
    } satisfies SessionInfo
    const chatBChild = {
      id: "chat-b-child",
      parentID: chatB.id,
      title: "Chat B subagent",
      time: { created: 4, updated: 4 },
    } satisfies SessionInfo
    const rootSessions = [chatA, chatB]
    const allSessions = [chatA, chatAChild, chatB, chatBChild]
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    async function render(activeSessionID: string) {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <ChatLeftSidebarDirectoryList
                directoryGroups={[{ directory, sessions: rootSessions }]}
                currentDirectory={directory}
                activeSessionID={activeSessionID}
                sessionsByDirectory={{ [directory]: allSessions }}
                sessionStatusByDirectory={{}}
                pinnedByDirectory={{}}
                unreadByDirectory={{}}
                organizeMode="project"
                expandedDirectories={{ [directory]: true }}
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
                onDisconnectObsidianVault={() => {}}
                onCloseDirectory={() => {}}
              />
            </TooltipProvider>
          </QueryClientProvider>,
        )
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      })
    }

    await render(chatA.id)
    const chatAChildRow = container.querySelector<HTMLButtonElement>(
      `[data-session-id="${chatAChild.id}"]`,
    )
    expect(chatAChildRow).not.toBeNull()
    expect(chatAChildRow?.closest("[aria-hidden=true]")).toBeNull()
    expect(container.querySelector(`[data-session-id="${chatBChild.id}"]`)).toBeNull()

    await render(chatB.id)
    const chatBChildRow = container.querySelector<HTMLButtonElement>(
      `[data-session-id="${chatBChild.id}"]`,
    )
    expect(chatBChildRow).not.toBeNull()
    expect(chatBChildRow?.closest("[aria-hidden=true]")).toBeNull()
    expect(chatAChildRow?.closest("[aria-hidden=true]")).not.toBeNull()
  })
})
