import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatLeftSidebarDirectoryList } from "../src/components/layout/chat-left-sidebar/directory-list"
import type { SessionInfo } from "../src/state/chat-types"

describe("Chat sidebar chat menu", () => {
  let container: HTMLDivElement
  let root: Root
  const writeText = mock(async () => {})

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    writeText.mockClear()
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(navigator, "clipboard")
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("copies a chat's ID from its right-click menu", async () => {
    const directory = "/tmp/copy-chat-id"
    const session = {
      id: "ses_copy_me",
      title: "Building an LLM from scratch",
      time: { created: 1, updated: 1 },
    } satisfies SessionInfo
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ChatLeftSidebarDirectoryList
              directoryGroups={[{ directory, sessions: [session] }]}
              currentDirectory={directory}
              sessionsByDirectory={{ [directory]: [session] }}
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

    const row = container.querySelector<HTMLElement>(
      `[data-action="left-sidebar-thread-select"][data-session-id="${session.id}"]`,
    )
    expect(row).not.toBeNull()
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const copyItem = document.querySelector<HTMLElement>(
      '[data-action="left-sidebar-thread-copy-id"]',
    )
    expect(copyItem?.textContent).toContain("Copy chat ID")

    await act(async () => {
      copyItem?.click()
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith("ses_copy_me")
  })
})
