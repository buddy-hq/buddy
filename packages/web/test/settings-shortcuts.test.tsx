import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ShortcutsSettings } from "../src/components/settings/settings-shortcuts"
import { createBrowserPlatform, PlatformProvider, type Platform } from "../src/context/platform"

function desktopPlatform(os: "macos" | "windows" | "linux"): Platform {
  return {
    platform: "desktop",
    os,
    openLink: () => undefined,
    restart: async () => undefined,
    back: () => undefined,
    forward: () => undefined,
    notify: async () => undefined,
    inAppBrowser: {
      webPreferences: "",
      onMessage: () => () => undefined,
      onFavicon: () => () => undefined,
      onAudio: () => () => undefined,
      onShortcut: () => () => undefined,
      setAppearance: async () => ({ _tag: "done" as const }),
      clearProfileData: async () => ({ _tag: "done" as const }),
      checkSafariFullDiskAccess: async () => false,
      listImportSources: async () => [],
      importCookies: async () => ({ _tag: "failed" as const, reason: "readFailed" as const }),
      openFullDiskAccessSettings: async () => undefined,
    },
  }
}

describe("shortcuts settings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderFor(os: "macos" | "windows" | "linux") {
    await act(async () => {
      root.render(
        <PlatformProvider value={desktopPlatform(os)}>
          <ShortcutsSettings />
        </PlatformProvider>,
      )
    })
  }

  test("lists each shortcut group and collapses numbered chat jumps into one row", async () => {
    await renderFor("macos")

    expect(container.textContent).toContain("Chats")
    expect(container.textContent).toContain("Composer")
    expect(container.textContent).toContain("Navigation")
    expect(container.textContent).toContain("Bench")
    expect(container.textContent?.match(/Jump to chat 1–9/gu)).toHaveLength(1)

    const accessibleShortcuts = [...container.querySelectorAll('[role="group"]')].map((group) =>
      group.getAttribute("aria-label"),
    )
    expect(accessibleShortcuts).toEqual([
      "New chat: Cmd+N",
      "Previous chat: Cmd+Shift+Left Bracket",
      "Next chat: Cmd+Shift+Right Bracket",
      "Jump to chat 1–9: Cmd+1 through Cmd+9",
      "Toggle Note mode: Cmd+Shift+Enter",
      "Focus chat input: Cmd+L",
      "Search notebook: Cmd+Shift+F",
      "Toggle sidebar: Cmd+B",
      "Toggle Bench: Cmd+Option+B",
      "New tab: Cmd+T",
    ])
    expect([...container.querySelectorAll("kbd")].map((key) => key.textContent)).toContain("1")
    expect([...container.querySelectorAll("kbd")].map((key) => key.textContent)).toContain("9")
  })

  test("uses the operating system's primary modifier", async () => {
    await renderFor("windows")

    const accessibleShortcuts = [...container.querySelectorAll('[role="group"]')].map((group) =>
      group.getAttribute("aria-label"),
    )
    expect(accessibleShortcuts).toContain("New chat: Ctrl+N")
    expect(accessibleShortcuts).toContain("Previous chat: Ctrl+Shift+Left Bracket")
    expect(accessibleShortcuts).toContain("Search notebook: Ctrl+Shift+F")
    expect(accessibleShortcuts).toContain("Toggle Note mode: Ctrl+Shift+Enter")
    expect(accessibleShortcuts).toContain("Toggle Bench: Ctrl+Alt+B")
    expect(container.textContent?.includes("⌘")).toBe(false)
  })

  test("uses Control shortcuts on Linux", async () => {
    await renderFor("linux")

    const accessibleShortcuts = [...container.querySelectorAll('[role="group"]')].map((group) =>
      group.getAttribute("aria-label"),
    )
    expect(accessibleShortcuts).toContain("New chat: Ctrl+N")
    expect(accessibleShortcuts).toContain("Jump to chat 1–9: Ctrl+1 through Ctrl+9")
    expect(container.textContent?.includes("⌘")).toBe(false)
  })

  test("explains browser limitations and omits the desktop-only new-tab command", async () => {
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <ShortcutsSettings />
        </PlatformProvider>,
      )
    })

    expect(container.textContent).toContain("Some may be handled by your browser")
    expect(container.textContent).not.toContain("New tab")
    expect(container.querySelector('[data-shortcut-commands="browser.newTab"]')).toBeNull()
  })
})
