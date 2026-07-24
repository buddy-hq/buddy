import { afterEach, describe, expect, test } from "bun:test"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DirectoryChatShell } from "../src/components/directory-chat/directory-chat-shell"
import {
  createBrowserPlatform,
  PlatformProvider,
  type Platform,
} from "../src/context/platform"

const TEST_DESKTOP_PLATFORM = {
  ...createBrowserPlatform(),
  platform: "desktop",
  os: "macos",
} satisfies Platform

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function LayoutMotionHarness() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)

  return (
    <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
      <button
        type="button"
        data-action="project-chat-layout"
        onClick={() => {
          setLeftSidebarOpen(false)
        }}
      >
        Project chat layout
      </button>
      <button
        type="button"
        data-action="toggle-current-chat-layout"
        onClick={() => {
          setLeftSidebarOpen((open) => !open)
        }}
      >
        Toggle current chat layout
      </button>
      <DirectoryChatShell
        leftSidebar={<div>Left sidebar</div>}
        contentLayout={<div>Chat and right workspace</div>}
        leftSidebarOpen={leftSidebarOpen}
        leftSidebarDisplayWidth={280}
        leftSidebarWidth={280}
        leftSidebarMinWidth={220}
        leftSidebarMaxWidth={420}
        onLeftSidebarResize={() => undefined}
        onLeftSidebarCollapse={() => undefined}
        rightWorkspaceOpen
        onRightWorkspaceToggle={() => undefined}
      />
    </PlatformProvider>
  )
}

function createTestRouter() {
  const rootRoute = createRootRoute({
    component: LayoutMotionHarness,
  })
  return createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
}

describe("directory chat layout motion", () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
        await flushEffects()
      })
    }
    container?.remove()
    root = undefined
    container = undefined
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps transcript-affecting sidebar geometry instant", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const readShell = () =>
      container?.querySelector<HTMLElement>('[data-component="directory-chat-shell"]')
    const readTitlebarSpacer = () =>
      container?.querySelector<HTMLElement>(
        '[data-component="desktop-titlebar-chat-left-spacer"]',
      )

    expect(readShell()?.getAttribute("data-layout-motion")).toBe("instant")
    expect(readShell()?.classList.contains("transition-none")).toBeTrue()
    expect(readTitlebarSpacer()?.classList.contains("transition-none")).toBeTrue()

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-action="project-chat-layout"]')
        ?.click()
      await flushEffects()
    })

    expect(readShell()?.getAttribute("data-layout-motion")).toBe("instant")
    expect(readShell()?.classList.contains("transition-none")).toBeTrue()
    expect(readTitlebarSpacer()?.classList.contains("transition-none")).toBeTrue()

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-action="toggle-current-chat-layout"]')
        ?.click()
      await flushEffects()
    })

    expect(readShell()?.getAttribute("data-layout-motion")).toBe("instant")
    expect(readShell()?.classList.contains("transition-none")).toBeTrue()
    expect(readTitlebarSpacer()?.classList.contains("transition-none")).toBeTrue()
  })
})
