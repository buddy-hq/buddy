import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { InAppBrowserShortcutModifierMessage } from "@buddy/browser-contract"
import { BenchTabs } from "../src/components/bench/bench-tabs"
import { PlatformProvider, type InAppBrowserPlatform, type Platform } from "../src/context/platform"
import { upsertBenchTab, type BenchTab } from "../src/lib/bench-tabs"
import type { BenchTabTarget, BenchTarget } from "../src/lib/bench-navigation"
import { BENCH_TAB_SHORTCUT_HINT_DELAY_MS, shortcutDisplayPlatform } from "../src/lib/shortcuts"
import { useInAppBrowserTabsStore } from "../src/state/in-app-browser-tabs-store"

const MARKDOWN_TARGET = {
  type: "workspace-file",
  root: "notebook",
  path: "docs/first.md",
  viewer: "markdown",
} satisfies BenchTarget
const IMAGE_TARGET = {
  type: "workspace-file",
  root: "notebook",
  path: "assets/second.png",
  viewer: "file",
} satisfies BenchTarget
const CLOSE_GROUP = ["Close", "Close others", "Close to the right", "Close all"]

const writeText = mock(async (_text: string) => undefined)
let root: Root
let container: HTMLDivElement

function tabsFor(targets: readonly BenchTabTarget[]): readonly BenchTab[] {
  return targets.reduce<readonly BenchTab[]>(
    (tabs, target) => upsertBenchTab(tabs, target).tabs,
    [],
  )
}

async function renderTabs(
  tabs: readonly BenchTab[],
  options: { shortcutHints?: boolean; platform?: Platform } = {},
) {
  const strip = (
    <QueryClientProvider client={new QueryClient()}>
      <BenchTabs
        shortcutHints={options.shortcutHints}
        directory="/workspace"
        tabs={tabs}
        activeTabKey={tabs[0]?.key ?? null}
        onActivate={() => undefined}
        onClose={() => undefined}
        onCloseOthers={() => undefined}
        onCloseToRight={() => undefined}
        onCloseAll={() => undefined}
        onNewTab={() => undefined}
      />
    </QueryClientProvider>
  )
  await act(async () => {
    root.render(
      options.platform ? (
        <PlatformProvider value={options.platform}>{strip}</PlatformProvider>
      ) : (
        strip
      ),
    )
  })
}

/** A desktop platform whose Browser page reports the shortcut modifier through `send`. */
function desktopPlatformWithBrowserModifier() {
  let listener: ((message: InAppBrowserShortcutModifierMessage) => void) | undefined
  const inAppBrowser: InAppBrowserPlatform = {
    webPreferences: "",
    onMessage: () => () => undefined,
    onFavicon: () => () => undefined,
    onAudio: () => () => undefined,
    onShortcut: () => () => undefined,
    onShortcutModifier: (callback) => {
      listener = callback
      return () => undefined
    },
    onNewTab: () => () => undefined,
    onCitation: () => () => undefined,
    captureCitation: async () => ({ _tag: "failed" as const, reason: "no-selection" as const }),
    markCitation: async () => ({ _tag: "not-found" as const }),
    unmarkCitation: async () => ({ _tag: "done" as const }),
    revealCitation: async () => ({ _tag: "not-found" as const }),
    setAppearance: async () => ({ _tag: "done" }),
    clearProfileData: async () => ({ _tag: "done" }),
    checkSafariFullDiskAccess: async () => false,
    listImportSources: async () => [],
    importCookies: async () => ({ _tag: "imported", imported: 0, skipped: 0, skippedDomains: [] }),
    openFullDiskAccessSettings: async () => undefined,
  }
  return {
    platform: {
      platform: "desktop",
      os: "macos",
      openLink: () => undefined,
      restart: async () => undefined,
      back: () => undefined,
      forward: () => undefined,
      notify: async () => undefined,
      inAppBrowser,
    } satisfies Platform,
    send: (message: InAppBrowserShortcutModifierMessage) => listener?.(message),
  }
}

async function openTabMenu(tabKey: string) {
  const tab = container.querySelector<HTMLElement>(`[data-tab-key="${tabKey}"]`)
  if (!tab) throw new Error(`Expected a tab keyed ${tabKey}`)
  await act(async () => {
    tab.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 4, clientY: 4 }),
    )
  })
}

function menuGroups(): string[][] {
  return Array.from(document.querySelectorAll('[role="menu"] [role="group"]')).map((group) =>
    Array.from(group.querySelectorAll('[role="menuitem"]')).map(
      (item) => item.textContent?.trim() ?? "",
    ),
  )
}

async function selectMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!item) throw new Error(`Expected a menu item labelled ${label}`)
  await act(async () => {
    item.click()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function press(init: KeyboardEventInit, type: "keydown" | "keyup" = "keydown") {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true }))
  })
}

async function waitOutHoldDelay() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, BENCH_TAB_SHORTCUT_HINT_DELAY_MS + 50))
  })
}

describe("Bench tab actions", () => {
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
    useInAppBrowserTabsStore.setState({ byTabID: {} })
  })

  test("groups the copy actions above the close group and copies a file's absolute path", async () => {
    const tabs = tabsFor([MARKDOWN_TARGET, IMAGE_TARGET])
    await renderTabs(tabs)
    await openTabMenu(tabs[0]?.key ?? "")

    expect(menuGroups()).toEqual([["Copy path", "Copy contents"], CLOSE_GROUP])
    expect(document.querySelectorAll('[role="menu"] [role="separator"]')).toHaveLength(1)

    await selectMenuItem("Copy path")
    expect(writeText.mock.calls).toEqual([["/workspace/docs/first.md"]])
  })

  test("leaves Copy contents off a tab whose file is not text", async () => {
    const tabs = tabsFor([MARKDOWN_TARGET, IMAGE_TARGET])
    await renderTabs(tabs)
    await openTabMenu(tabs[1]?.key ?? "")

    expect(menuGroups()).toEqual([["Copy path"], CLOSE_GROUP])
  })

  test("copies the address a web tab is on now, not the one it opened with", async () => {
    const target = {
      type: "browser",
      tabID: "browser/redirected",
      url: "https://gmail.com/",
    } satisfies BenchTarget
    useInAppBrowserTabsStore.getState().setTab(target.tabID, {
      url: "https://mail.google.com/mail/u/0/",
      title: "Inbox",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      favicon: null,
      error: null,
    })
    const tabs = tabsFor([target])
    await renderTabs(tabs)
    await openTabMenu(tabs[0]?.key ?? "")

    expect(menuGroups()).toEqual([["Copy address"], ["Mute tab"], CLOSE_GROUP])

    await selectMenuItem("Copy address")
    expect(writeText.mock.calls).toEqual([["https://mail.google.com/mail/u/0/"]])
  })

  test("copies a chat tab's ID", async () => {
    const tabs = tabsFor([{ type: "session", sessionID: "ses_child" }])
    await renderTabs(tabs)
    await openTabMenu(tabs[0]?.key ?? "")

    expect(menuGroups()).toEqual([["Copy chat ID"], CLOSE_GROUP])

    await selectMenuItem("Copy chat ID")
    expect(writeText.mock.calls).toEqual([["ses_child"]])
  })

  test("keeps a tab with nothing to copy to its close group", async () => {
    const tabs = tabsFor([
      {
        type: "object",
        ref: { kind: "whiteboard", objectID: "board-1", revisionID: null, itemID: null },
        viewID: "board",
      },
    ])
    await renderTabs(tabs)
    await openTabMenu(tabs[0]?.key ?? "")

    expect(menuGroups()).toEqual([CLOSE_GROUP])
    expect(document.querySelectorAll('[role="menu"] [role="separator"]')).toHaveLength(0)
  })

  test("shows each tab's key once the shortcut modifier is held alone, never mid-chord", async () => {
    const usesCommand = shortcutDisplayPlatform(undefined) === "mac"
    const modifier = usesCommand
      ? { key: "Meta", metaKey: true }
      : { key: "Control", ctrlKey: true }
    const shortcutLabels = () =>
      Array.from(container.querySelectorAll('[data-component="bench-tab-shortcut"]')).map(
        (hint) => hint.textContent,
      )
    const tabs = tabsFor([MARKDOWN_TARGET, IMAGE_TARGET])
    await renderTabs(tabs)

    await press(modifier)
    expect(shortcutLabels()).toEqual([])
    await waitOutHoldDelay()
    expect(shortcutLabels()).toEqual(usesCommand ? ["⌘1", "⌘2"] : ["Ctrl+1", "Ctrl+2"])

    // A chord such as Cmd+C hides the keys until the modifier is let go.
    await press({ ...modifier, key: "c" })
    expect(shortcutLabels()).toEqual([])
    await press({ ...modifier, key: "c" }, "keyup")
    await press(modifier)
    await waitOutHoldDelay()
    expect(shortcutLabels()).toEqual([])

    await press({ key: modifier.key }, "keyup")
    await press(modifier)
    await waitOutHoldDelay()
    expect(shortcutLabels()).toHaveLength(2)
    await press({ key: modifier.key }, "keyup")
    expect(shortcutLabels()).toEqual([])

    // While the tab keys are off, holding the modifier shows nothing.
    await renderTabs(tabs, { shortcutHints: false })
    await press(modifier)
    await waitOutHoldDelay()
    expect(shortcutLabels()).toEqual([])
  })

  test("shows the tab keys while Cmd is held over a focused Browser page", async () => {
    const browser = desktopPlatformWithBrowserModifier()
    const shortcutLabels = () =>
      Array.from(container.querySelectorAll('[data-component="bench-tab-shortcut"]')).map(
        (hint) => hint.textContent,
      )
    await renderTabs(tabsFor([MARKDOWN_TARGET, IMAGE_TARGET]), { platform: browser.platform })

    await act(async () => browser.send({ webContentsID: 7, state: "pressed" }))
    await waitOutHoldDelay()
    expect(shortcutLabels()).toEqual(["⌘1", "⌘2"])

    await act(async () => browser.send({ webContentsID: 7, state: "interrupted" }))
    expect(shortcutLabels()).toEqual([])
    await act(async () => browser.send({ webContentsID: 7, state: "pressed" }))
    await waitOutHoldDelay()
    expect(shortcutLabels()).toEqual([])

    await act(async () => browser.send({ webContentsID: 7, state: "released" }))
    await act(async () => browser.send({ webContentsID: 7, state: "pressed" }))
    await waitOutHoldDelay()
    expect(shortcutLabels()).toHaveLength(2)
  })
})
