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

function TitlebarProbe(props: TTitlebarRouterProps) {
  return (
    <DesktopTitlebar
      placement="chat"
      variant="chat"
      chatTitle="A chat in progress"
      isTurnActive={props.isTurnActive}
      leftSidebarOpen={props.leftSidebarOpen}
      leftSidebarOverlayOpen={props.leftSidebarOverlayOpen}
      showThreadBrowser={props.showThreadBrowser}
      sessions={[]}
      onNewSession={props.onNewSession}
      onSelectSession={() => undefined}
    />
  )
}

function TitlebarRouterRoute() {
  const props = titlebarRouterProps
  if (!props) return null
  return (
    <PlatformProvider value={props.platform ?? TEST_DESKTOP_PLATFORM}>
      <TitlebarProbe {...props} />
    </PlatformProvider>
  )
}

type TTitlebarRouterProps = {
  leftSidebarOpen: boolean
  leftSidebarOverlayOpen?: boolean
  isTurnActive?: boolean
  showThreadBrowser: boolean
  platform?: Platform
  onNewSession: () => void
}

let titlebarRouterProps: TTitlebarRouterProps | undefined

function TitlebarRouterProvider(props: TTitlebarRouterProps) {
  titlebarRouterProps = props
  const rootRoute = createRootRoute({
    component: TitlebarRouterRoute,
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

  test.each([
    { os: "macos", showThreadBrowser: false },
    { os: "macos", showThreadBrowser: true },
    { os: "windows", showThreadBrowser: false },
    { os: "windows", showThreadBrowser: true },
  ] as const)(
    "shows title progress only while the sidebar is hidden ($os, thread browser: $showThreadBrowser)",
    async ({ os, showThreadBrowser }) => {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
      container = document.createElement("div")
      document.body.appendChild(container)
      root = createRoot(container)

      for (const state of [
        {
          leftSidebarOpen: false,
          leftSidebarOverlayOpen: false,
          isTurnActive: true,
          active: "true",
        },
        {
          leftSidebarOpen: true,
          leftSidebarOverlayOpen: false,
          isTurnActive: true,
          active: "false",
        },
        {
          leftSidebarOpen: false,
          leftSidebarOverlayOpen: true,
          isTurnActive: true,
          active: "false",
        },
        {
          leftSidebarOpen: false,
          leftSidebarOverlayOpen: false,
          isTurnActive: true,
          active: "true",
        },
        {
          leftSidebarOpen: false,
          leftSidebarOverlayOpen: false,
          isTurnActive: false,
          active: "false",
        },
      ]) {
        await act(async () => {
          root?.render(
            <TitlebarRouterProvider
              {...state}
              showThreadBrowser={showThreadBrowser}
              platform={{ ...TEST_DESKTOP_PLATFORM, os }}
              onNewSession={() => undefined}
            />,
          )
        })

        const title = container.querySelector('[aria-label="A chat in progress"]')
        expect(title).not.toBeNull()
        expect(title?.getAttribute("data-active")).toBe(state.active)
      }
    },
  )
})
