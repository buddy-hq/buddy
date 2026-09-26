import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  PlatformProvider,
  createBrowserPlatform,
  type InAppBrowserPlatform,
} from "../src/context/platform"
import { HostedBrowserHost } from "../src/components/bench/surfaces/browser/hosted-browser-host"
import { BrowserSurfaceSlot } from "../src/components/bench/surfaces/browser/browser-surface-slot"
import { upsertBenchTab } from "../src/lib/bench-tabs"
import { BENCH_CHAT_LAYOUT_DOCKED } from "../src/lib/bench-targets"
import { WORKSPACE_CHAT_DRAFT_KEY, workspaceChatKeyForSession } from "../src/lib/workspace-chat-key"
import { useChatStore } from "../src/state/chat-store"
import { hostedBrowserKey, useHostedBrowserStore } from "../src/state/hosted-browser-store"
import { useInAppBrowserSettingsStore } from "../src/state/in-app-browser-settings-store"
import {
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_DRAWER_SOURCES,
  createExpandedWorkspaceState,
  defaultWorkspacePresentationSlot,
  type WorkspacePresentationSlot,
} from "../src/state/directory-workspace-store"

const browser: InAppBrowserPlatform = {
  webPreferences: "",
  onMessage: () => () => undefined,
  onFavicon: () => () => undefined,
  onAudio: () => () => undefined,
  onShortcut: () => () => undefined,
  onNewTab: () => () => undefined,
  onCitation: () => () => undefined,
  captureCitation: async () => ({ _tag: "failed", reason: "no-selection" }),
  markCitation: async () => ({ _tag: "not-found" }),
  unmarkCitation: async () => ({ _tag: "done" }),
  revealCitation: async () => ({ _tag: "not-found" }),
  setAppearance: async () => ({ _tag: "done" }),
  clearProfileData: async () => ({ _tag: "done" }),
  checkSafariFullDiskAccess: async () => false,
  listImportSources: async () => [],
  importCookies: async () => ({
    _tag: "imported",
    imported: 0,
    skipped: 0,
    skippedDomains: [],
  }),
  openFullDiskAccessSettings: async () => undefined,
}

const directory = "/hosted-browser-test"
const otherDirectory = "/other-hosted-browser-test"
const target = {
  type: "browser",
  tabID: "browser-one",
  url: "https://example.com/",
} as const
const sessionTarget = { ...target, tabID: "browser-session" } as const

function browserSlot(slotTarget: typeof target | typeof sessionTarget): WorkspacePresentationSlot {
  return {
    route: { status: BENCH_ROUTE_STATUS_OPEN, target: slotTarget, mode: BENCH_CHAT_LAYOUT_DOCKED },
    tabs: upsertBenchTab([], slotTarget).tabs,
    docked: createExpandedWorkspaceState(null),
    lastDrawer: WORKSPACE_DRAWER_SOURCES,
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

describe("HostedBrowserHost", () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    container?.remove()
    useHostedBrowserStore.getState().reset()
    useChatStore.getState().closeProject(directory)
    useChatStore.getState().closeProject(otherDirectory)
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps the same webview mounted while its notebook slot unmounts and returns", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    await useInAppBrowserSettingsStore.persist.rehydrate()
    useChatStore.getState().ensureOpenProject(directory)
    useChatStore.getState().ensureOpenProject(otherDirectory)
    const tabs = upsertBenchTab([], target).tabs
    useHostedBrowserStore.getState().rememberDirectory(directory, {
      [WORKSPACE_CHAT_DRAFT_KEY]: {
        route: { status: BENCH_ROUTE_STATUS_OPEN, target, mode: BENCH_CHAT_LAYOUT_DOCKED },
        tabs,
        docked: createExpandedWorkspaceState(null),
        lastDrawer: WORKSPACE_DRAWER_SOURCES,
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const platform = { ...createBrowserPlatform(), os: "macos" as const, inAppBrowser: browser }
    const render = (showNotebook: boolean, showDrawer = false) => (
      <PlatformProvider value={platform}>
        <HostedBrowserHost />
        {showNotebook ? (
          <div>
            <div data-component="right-workspace-bench-target">
              <BrowserSurfaceSlot directory={directory} tabID={target.tabID} visible />
            </div>
            {showDrawer ? <aside data-component="right-workspace-selector-drawer" /> : null}
          </div>
        ) : (
          <span>Settings</span>
        )}
      </PlatformProvider>
    )

    await act(async () => root?.render(render(true)))
    const webview = container.querySelector("webview")
    const firstSlot = container.querySelector<HTMLElement>("[data-browser-surface-slot]")
    expect(webview).not.toBeNull()
    if (!firstSlot) throw new Error("Expected Browser surface slot")
    firstSlot.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 80, y: 100, width: 640, height: 480 })
    await act(async () => window.dispatchEvent(new Event("resize")))
    const hostedPage = container.querySelector<HTMLElement>("[data-hosted-browser-tab-id]")
    expect(hostedPage?.getAttribute("data-keep-webview-paintable")).toBe("true")
    expect(hostedPage?.style.left).toBe("80px")
    expect(hostedPage?.style.top).toBe("100px")
    expect(hostedPage?.hasAttribute("aria-hidden")).toBeFalse()
    expect(hostedPage?.hasAttribute("inert")).toBeFalse()
    const pageKey = hostedBrowserKey(directory, target.tabID)
    await act(async () => {
      useHostedBrowserStore.getState().pagesByKey[pageKey]?.controls.setAppearance("dark")
    })

    await act(async () => root?.render(render(true, true)))
    const drawer = container.querySelector<HTMLElement>(
      '[data-component="right-workspace-selector-drawer"]',
    )
    if (!drawer) throw new Error("Expected Bench drawer")
    drawer.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 520, y: 100, width: 200, height: 480 })
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(hostedPage?.style.clipPath).toBe("inset(0 200px 0 0)")

    drawer.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 540, y: 100, width: 200, height: 480 })
    await act(async () => {
      await nextAnimationFrame()
    })
    expect(hostedPage?.style.clipPath).toBe("inset(0 180px 0 0)")

    await act(async () => root?.render(render(false)))
    expect(container.querySelector("webview")).toBe(webview)
    expect(hostedPage?.style.left).toBe("-100000px")
    expect(hostedPage?.style.visibility).toBe("")
    expect(hostedPage?.getAttribute("aria-hidden")).toBe("true")
    expect(hostedPage?.hasAttribute("inert")).toBeTrue()
    expect(useHostedBrowserStore.getState().pagesByKey[pageKey]?.controls.appearance).toBe("dark")

    await act(async () => root?.render(render(true)))
    expect(container.querySelector("webview")).toBe(webview)
    const returnedSlot = container.querySelector<HTMLElement>("[data-browser-surface-slot]")
    if (!returnedSlot) throw new Error("Expected returned Browser surface slot")
    returnedSlot.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 80, y: 100, width: 640, height: 480 })
    await act(async () => window.dispatchEvent(new Event("resize")))
    expect(hostedPage?.style.left).toBe("80px")
    expect(hostedPage?.style.clipPath).toBe("")
    expect(useHostedBrowserStore.getState().pagesByKey[pageKey]?.controls.appearance).toBe("dark")

    const otherTarget = {
      type: "browser",
      tabID: "browser-two",
      url: "https://example.org/",
    } as const
    await act(async () => {
      useHostedBrowserStore.getState().rememberDirectory(otherDirectory, {
        [WORKSPACE_CHAT_DRAFT_KEY]: {
          route: {
            status: BENCH_ROUTE_STATUS_OPEN,
            target: otherTarget,
            mode: BENCH_CHAT_LAYOUT_DOCKED,
          },
          tabs: upsertBenchTab([], otherTarget).tabs,
          docked: createExpandedWorkspaceState(null),
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
        },
      })
    })
    const otherWebview = container.querySelector('[data-browser-tab-id="browser-two"]')
    expect(otherWebview).not.toBeNull()

    await act(async () => {
      useHostedBrowserStore.getState().rememberDirectory(directory, {
        [WORKSPACE_CHAT_DRAFT_KEY]: {
          route: { status: BENCH_ROUTE_STATUS_OPEN, target, mode: BENCH_CHAT_LAYOUT_DOCKED },
          tabs: upsertBenchTab([], target).tabs,
          docked: createExpandedWorkspaceState(null),
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
        },
      })
    })
    expect(container.querySelector('[data-browser-tab-id="browser-one"]')).toBe(webview)
    expect(container.querySelector('[data-browser-tab-id="browser-two"]')).toBe(otherWebview)
  })

  test("renders pages only while their notebook is open, however it was reopened", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    await useInAppBrowserSettingsStore.persist.rehydrate()
    const slots = { [WORKSPACE_CHAT_DRAFT_KEY]: browserSlot(target) }
    useChatStore.getState().ensureOpenProject(directory)
    useHostedBrowserStore.getState().rememberDirectory(directory, slots)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const platform = { ...createBrowserPlatform(), os: "windows" as const, inAppBrowser: browser }
    await act(async () =>
      root?.render(
        <PlatformProvider value={platform}>
          <HostedBrowserHost />
        </PlatformProvider>,
      ),
    )
    const hostedPage = container.querySelector<HTMLElement>("[data-hosted-browser-tab-id]")
    expect(container.querySelector("webview")).not.toBeNull()
    expect(hostedPage?.hasAttribute("data-keep-webview-paintable")).toBeFalse()
    expect(hostedPage?.style.visibility).toBe("hidden")

    await act(async () => {
      useChatStore.getState().closeProject(directory)
      useHostedBrowserStore.getState().forgetDirectory(directory)
      useHostedBrowserStore.getState().rememberDirectory(directory, slots)
    })
    expect(container.querySelector("webview")).toBeNull()

    await act(async () => useChatStore.getState().ensureOpenProject(directory))
    expect(container.querySelector('[data-browser-tab-id="browser-one"]')).not.toBeNull()
  })

  test("drops browser pages of deleted chats and replaced slots", () => {
    const store = useHostedBrowserStore.getState()
    store.rememberDirectory(directory, {
      [workspaceChatKeyForSession("chat-s")]: browserSlot(sessionTarget),
      [WORKSPACE_CHAT_DRAFT_KEY]: browserSlot(target),
    })
    const sessionKey = hostedBrowserKey(directory, sessionTarget.tabID)
    const draftKey = hostedBrowserKey(directory, target.tabID)

    store.removeSessionTargets(directory, ["chat-s"])
    expect(useHostedBrowserStore.getState().targetsByKey[sessionKey]).toBeUndefined()
    expect(useHostedBrowserStore.getState().targetsByKey[draftKey]).toBeDefined()

    store.replaceSlot(directory, WORKSPACE_CHAT_DRAFT_KEY, defaultWorkspacePresentationSlot())
    expect(useHostedBrowserStore.getState().targetsByKey[draftKey]).toBeUndefined()

    store.replaceSlot(otherDirectory, WORKSPACE_CHAT_DRAFT_KEY, defaultWorkspacePresentationSlot())
    expect(useHostedBrowserStore.getState().slotsByDirectory[otherDirectory]).toBeUndefined()
  })

  test("invalidates cached Notes tabs while retaining browser tabs", () => {
    const notesTarget = {
      type: "workspace-file",
      root: "notes",
      path: "old-note.md",
      viewer: "markdown",
    } as const
    const tabs = upsertBenchTab(upsertBenchTab([], notesTarget).tabs, target).tabs
    useHostedBrowserStore.getState().rememberDirectory(directory, {
      [WORKSPACE_CHAT_DRAFT_KEY]: {
        route: { status: BENCH_ROUTE_STATUS_OPEN, target, mode: BENCH_CHAT_LAYOUT_DOCKED },
        tabs,
        docked: createExpandedWorkspaceState(null),
        lastDrawer: WORKSPACE_DRAWER_SOURCES,
      },
    })

    useHostedBrowserStore.getState().invalidateNotesTargets()
    const remaining =
      useHostedBrowserStore.getState().slotsByDirectory[directory]?.[WORKSPACE_CHAT_DRAFT_KEY]?.tabs
    expect(remaining?.map((tab) => tab.target)).toEqual([target])
  })
})
