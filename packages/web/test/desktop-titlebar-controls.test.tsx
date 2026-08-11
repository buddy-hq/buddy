import { afterEach, describe, expect, test } from "bun:test"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DesktopTitlebar } from "../src/components/layout/desktop-titlebar"
import { createBrowserPlatform, PlatformProvider, type Platform } from "../src/context/platform"

const TEST_DESKTOP_PLATFORM = {
  ...createBrowserPlatform(),
  platform: "desktop",
  os: "macos",
} satisfies Platform

function TitlebarProbe(props: {
  leftSidebarOpen: boolean
  showThreadBrowser: boolean
  onNewSession: () => void
}) {
  return (
    <DesktopTitlebar
      placement="chat"
      variant="chat"
      leftSidebarOpen={props.leftSidebarOpen}
      showThreadBrowser={props.showThreadBrowser}
      sessions={[]}
      onNewSession={props.onNewSession}
      onSelectSession={() => undefined}
    />
  )
}

function TitlebarRouterProvider(props: {
  leftSidebarOpen: boolean
  showThreadBrowser: boolean
  onNewSession: () => void
}) {
  const rootRoute = createRootRoute({
    component: () => (
      <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
        <TitlebarProbe {...props} />
      </PlatformProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/repo/chat"] }),
  })

  return <RouterProvider router={router} />
}

describe("desktop titlebar new chat control", () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(async () => {
    if (!root || !container) return
    await act(async () => {
      root?.unmount()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("uses the contextual thread browser as the only new-chat control when the sidebar is collapsed", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    let newSessionCount = 0

    await act(async () => {
      root?.render(
        <TitlebarRouterProvider
          leftSidebarOpen={false}
          showThreadBrowser
          onNewSession={() => {
            newSessionCount += 1
          }}
        />,
      )
    })

    const newChatControls = container.querySelectorAll<HTMLButtonElement>('[aria-label="New chat"]')
    expect(newChatControls).toHaveLength(1)
    expect(container.querySelector('[data-action="chat-new-session"]')).toBeNull()

    const newChatControl = newChatControls.item(0)
    expect(newChatControl.className).toContain("[-webkit-app-region:no-drag]")
    newChatControl.focus()
    expect(document.activeElement).toBe(newChatControl)

    await act(async () => {
      newChatControl.click()
    })
    expect(newSessionCount).toBe(1)
  })

  test("keeps the fixed titlebar fallback when the collapsed sidebar has no thread browser", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <TitlebarRouterProvider
          leftSidebarOpen={false}
          showThreadBrowser={false}
          onNewSession={() => undefined}
        />,
      )
    })

    expect(container.querySelectorAll('[aria-label="New chat"]')).toHaveLength(1)
    expect(container.querySelector('[data-action="chat-new-session"]')).not.toBeNull()
  })
})
