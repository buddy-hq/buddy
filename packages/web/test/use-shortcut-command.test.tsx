import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { useBenchTabShortcuts, useShortcutCommand } from "../src/lib/use-shortcut-command"
import { useClaimCloseTabShortcut, useCloseWindowShortcut } from "../src/lib/close-tab-shortcut"
import { PlatformProvider, createBrowserPlatform, type Platform } from "../src/context/platform"

function dispatchMenuCommand(id: string): void {
  window.dispatchEvent(new CustomEvent("buddy:menu-command", { detail: { id } }))
}

/** A Bench that claims Mod+W while a tab is showing, inside an app with the window fallback. */
function CloseTabApp(props: { tabShowing: boolean; onCloseTab: () => void }) {
  useCloseWindowShortcut()
  useShortcutCommand("bench.closeTab", props.onCloseTab, { enabled: props.tabShowing })
  useClaimCloseTabShortcut(props.tabShowing)
  return null
}

describe("shortcut command hooks", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("handles forwarded commands and ignores unavailable tab positions", async () => {
    let newChatCount = 0
    const openedIndexes: number[] = []

    function Probe() {
      useShortcutCommand("chat.new", () => {
        newChatCount += 1
      })
      useBenchTabShortcuts(
        (index) => {
          openedIndexes.push(index)
        },
        { count: 3 },
      )
      return null
    }

    await act(async () => root.render(<Probe />))
    act(() => {
      dispatchMenuCommand("chat.new")
      dispatchMenuCommand("bench.tab.3")
      dispatchMenuCommand("bench.tab.4")
      dispatchMenuCommand("bench.tab.last")
    })

    expect(newChatCount).toBe(1)
    expect(openedIndexes).toEqual([2, 2])
  })

  test("Mod+W closes the window on macOS only while nothing claims it for a tab", async () => {
    let windowCloses = 0
    let tabCloses = 0
    const platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      os: "macos",
      closeWindow: () => {
        windowCloses += 1
      },
    } satisfies Platform

    const onCloseTab = () => {
      tabCloses += 1
    }

    await act(async () =>
      root.render(
        <PlatformProvider value={platform}>
          <CloseTabApp tabShowing onCloseTab={onCloseTab} />
        </PlatformProvider>,
      ),
    )
    act(() => dispatchMenuCommand("bench.closeTab"))
    expect({ tabCloses, windowCloses }).toEqual({ tabCloses: 1, windowCloses: 0 })

    await act(async () =>
      root.render(
        <PlatformProvider value={platform}>
          <CloseTabApp tabShowing={false} onCloseTab={onCloseTab} />
        </PlatformProvider>,
      ),
    )
    act(() => dispatchMenuCommand("bench.closeTab"))
    expect({ tabCloses, windowCloses }).toEqual({ tabCloses: 1, windowCloses: 1 })

    // Windows and Linux keep the key for the page.
    await act(async () =>
      root.render(
        <PlatformProvider value={{ ...platform, os: "windows" }}>
          <CloseTabApp tabShowing={false} onCloseTab={onCloseTab} />
        </PlatformProvider>,
      ),
    )
    act(() => dispatchMenuCommand("bench.closeTab"))
    expect(windowCloses).toBe(1)
  })

  test("reports synchronous throws and rejected promises", async () => {
    const syncFailure = new Error("sync failure")
    const asyncFailure = new Error("async failure")
    const errors: Error[] = []

    function Probe() {
      useShortcutCommand(
        "chat.new",
        () => {
          throw syncFailure
        },
        { onError: (error) => errors.push(error) },
      )
      useShortcutCommand("composer.focus", () => Promise.reject(asyncFailure), {
        onError: (error) => errors.push(error),
      })
      return null
    }

    await act(async () => root.render(<Probe />))
    await act(async () => {
      dispatchMenuCommand("chat.new")
      dispatchMenuCommand("composer.focus")
      await Promise.resolve()
    })

    expect(errors).toEqual([syncFailure, asyncFailure])
  })

  test("reserves Quick open while dialog focus prevents other navigation shortcuts", async () => {
    let fileCommands = 0
    let chatCommands = 0
    function Probe() {
      useShortcutCommand("file.quickOpen", () => {
        fileCommands += 1
      })
      useShortcutCommand("chat.new", () => {
        chatCommands += 1
      })
      return (
        <div role="dialog">
          <input aria-label="Picker" />
        </div>
      )
    }
    await act(async () =>
      root.render(
        <HotkeysProvider defaultOptions={{ hotkey: { platform: "mac" } }}>
          <Probe />
        </HotkeysProvider>,
      ),
    )
    const input = container.querySelector("input")
    if (!input) throw new Error("Expected the dialog input")
    const print = new KeyboardEvent("keydown", {
      key: "p",
      code: "KeyP",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    const newChat = new KeyboardEvent("keydown", {
      key: "n",
      code: "KeyN",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      input.focus()
      input.dispatchEvent(print)
      input.dispatchEvent(newChat)
    })
    expect(print.defaultPrevented).toBe(true)
    expect(fileCommands).toBe(1)
    expect(chatCommands).toBe(0)
  })
})
