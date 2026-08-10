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
import { WINDOWS_CHAT_TITLEBAR_RIGHT_CONTROLS_INSET_PX } from "../src/components/layout/desktop-titlebar"
import { createBrowserPlatform, PlatformProvider, type Platform } from "../src/context/platform"

const TEST_DESKTOP_PLATFORM = {
  ...createBrowserPlatform(),
  platform: "desktop",
  os: "macos",
} satisfies Platform
const TEST_WINDOWS_PLATFORM = {
  ...createBrowserPlatform(),
  platform: "desktop",
  os: "windows",
} satisfies Platform

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function LayoutMotionHarness(props: { platform?: Platform }) {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true)

  return (
    <PlatformProvider value={props.platform ?? TEST_DESKTOP_PLATFORM}>
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
        rightWorkspaceDisplayWidth={448}
        rightWorkspaceTitlebar={<div data-testid="right-workspace-titlebar">Bench tabs</div>}
        onRightWorkspaceToggle={() => undefined}
      />
    </PlatformProvider>
  )
}

function createTestRouter(platform?: Platform) {
  const rootRoute = createRootRoute({
    component: () => <LayoutMotionHarness platform={platform} />,
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
      container?.querySelector<HTMLElement>('[data-component="desktop-titlebar-chat-left-spacer"]')

    expect(readShell()?.getAttribute("data-layout-motion")).toBe("instant")
    expect(readShell()?.classList.contains("transition-none")).toBeTrue()
    expect(readTitlebarSpacer()?.classList.contains("transition-none")).toBeTrue()
    expect(readShell()?.style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 448px")
    expect(container.querySelector('[data-testid="right-workspace-titlebar"]')).not.toBeNull()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-action="project-chat-layout"]')?.click()
      await flushEffects()
    })

    expect(readShell()?.getAttribute("data-layout-motion")).toBe("instant")
    expect(readShell()?.classList.contains("transition-none")).toBeTrue()
    expect(readTitlebarSpacer()?.classList.contains("transition-none")).toBeTrue()
    expect(readShell()?.style.gridTemplateColumns).toBe("0px minmax(0, 1fr) 448px")

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

  test("keeps tabs clear of Windows caption controls", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter(TEST_WINDOWS_PLATFORM)} />)
      await flushEffects()
    })

    const rightTitlebar = container.querySelector<HTMLElement>(
      '[data-component="directory-chat-right-workspace-titlebar"]',
    )
    expect(rightTitlebar?.style.paddingRight).toBe(
      `${WINDOWS_CHAT_TITLEBAR_RIGHT_CONTROLS_INSET_PX}px`,
    )
  })
})
