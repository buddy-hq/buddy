import { describe, expect, test } from "bun:test"
import { matchesKeyboardEvent, normalizeRegisterableHotkey } from "@tanstack/react-hotkeys"
import {
  BENCH_EDITOR_SELECTOR,
  BENCH_TAB_SHORTCUTS,
  benchTabShortcutAtPosition,
  benchTabShortcutPosition,
  formatShortcutLabel,
  SHORTCUTS,
  shouldRunShortcut,
  type ShortcutCommand,
} from "../src/lib/shortcuts"

type Platform = "mac" | "windows"

function labelAt(position: number, count: number, platform: Platform) {
  const hotkey = benchTabShortcutAtPosition(position, count)
  return hotkey ? formatShortcutLabel(hotkey, platform) : null
}

function matches(command: ShortcutCommand, init: KeyboardEventInit, platform: Platform = "mac") {
  const hotkey = normalizeRegisterableHotkey(SHORTCUTS[command], platform)
  return matchesKeyboardEvent(new KeyboardEvent("keydown", init), hotkey, platform)
}

describe("app shortcuts", () => {
  test("Cmd+N starts a new chat on macOS", () => {
    expect(matches("chat.new", { key: "n", code: "KeyN", metaKey: true })).toBe(true)
  })

  test("Ctrl+N starts a new chat on Windows", () => {
    expect(matches("chat.new", { key: "n", code: "KeyN", ctrlKey: true }, "windows")).toBe(true)
  })

  test("Ctrl+N on macOS does not match Cmd+N", () => {
    expect(matches("chat.new", { key: "n", code: "KeyN", ctrlKey: true })).toBe(false)
  })

  test("Cmd+Shift+N stays with New Window", () => {
    expect(matches("chat.new", { key: "N", code: "KeyN", metaKey: true, shiftKey: true })).toBe(
      false,
    )
  })

  test("Cmd+Shift+F opens notebook search", () => {
    expect(matches("search.open", { key: "F", code: "KeyF", metaKey: true, shiftKey: true })).toBe(
      true,
    )
  })

  test("Cmd+P opens the notebook file picker on macOS and Ctrl+P on Windows", () => {
    expect(matches("file.quickOpen", { key: "p", code: "KeyP", metaKey: true })).toBe(true)
    expect(matches("file.quickOpen", { key: "p", code: "KeyP", ctrlKey: true }, "windows")).toBe(
      true,
    )
  })

  test("Cmd+Option+B toggles the Bench although Option types another character", () => {
    expect(matches("bench.toggle", { key: "∫", code: "KeyB", metaKey: true, altKey: true })).toBe(
      true,
    )
  })

  test("Cmd+B toggles the sidebar", () => {
    expect(matches("sidebar.toggle", { key: "b", code: "KeyB", metaKey: true })).toBe(true)
  })

  test("Cmd+T opens a new empty tab on the Bench", () => {
    expect(matches("browser.newTab", { key: "t", code: "KeyT", metaKey: true })).toBe(true)
  })

  test("Cmd+L focuses the composer", () => {
    expect(matches("composer.focus", { key: "l", code: "KeyL", metaKey: true })).toBe(true)
  })

  test("Cmd+Shift+Enter toggles Note mode", () => {
    expect(
      matches("composer.note.toggle", {
        key: "Enter",
        code: "Enter",
        metaKey: true,
        shiftKey: true,
      }),
    ).toBe(true)
    expect(matches("composer.note.toggle", { key: "Enter", metaKey: true })).toBe(false)
  })

  test("Cmd+Shift+[ and ] move between chats although Shift types a brace", () => {
    const bracket = { metaKey: true, shiftKey: true }
    expect(matches("chat.previous", { key: "{", code: "BracketLeft", ...bracket })).toBe(true)
    expect(matches("chat.next", { key: "}", code: "BracketRight", ...bracket })).toBe(true)
    expect(matches("chat.next", { key: "{", code: "BracketLeft", ...bracket })).toBe(false)
  })

  test("Cmd+3 matches the third Bench tab", () => {
    const event = new KeyboardEvent("keydown", { key: "3", code: "Digit3", metaKey: true })
    const shortcut = BENCH_TAB_SHORTCUTS[2]
    const hotkey = normalizeRegisterableHotkey(shortcut.hotkey, "mac")
    expect(matchesKeyboardEvent(event, hotkey, "mac")).toBe(true)
    expect(shortcut.command).toBe("bench.tab.3")
  })

  test("Cmd+9 opens the last Bench tab and missing positions open nothing", () => {
    expect(benchTabShortcutPosition("bench.tab.last", 8, 3)).toBe(2)
    expect(benchTabShortcutPosition("bench.tab.last", 8, 12)).toBe(11)
    expect(benchTabShortcutPosition("bench.tab.last", 8, 0)).toBeNull()
    expect(benchTabShortcutPosition("bench.tab.3", 2, 3)).toBe(2)
    expect(benchTabShortcutPosition("bench.tab.4", 3, 3)).toBeNull()
  })

  test("each Bench tab is labelled with the key that opens it, per platform", () => {
    expect(labelAt(0, 3, "mac")).toBe("⌘1")
    expect(labelAt(2, 3, "windows")).toBe("Ctrl+3")
    expect(labelAt(7, 12, "mac")).toBe("⌘8")
    expect(labelAt(8, 12, "mac")).toBeNull()
    expect(labelAt(11, 12, "mac")).toBe("⌘9")
    expect(labelAt(8, 9, "windows")).toBe("Ctrl+9")
    expect(labelAt(3, 3, "mac")).toBeNull()
  })
})

describe("shortcut guard", () => {
  test("leaves a key that a focused surface already handled", () => {
    const event = new KeyboardEvent("keydown", { key: "l", metaKey: true, cancelable: true })
    event.preventDefault()
    expect(shouldRunShortcut(event)).toBe(false)
  })

  test("waits while focus is inside a dialog or popover", () => {
    for (const role of ["dialog", "alertdialog"]) {
      const host = document.createElement("div")
      host.innerHTML = `<div role="${role}"><input /></div>`
      const target = host.querySelector("input")
      expect(shouldRunShortcut({ defaultPrevented: false, target })).toBe(false)
    }
  })

  test("runs from an ordinary focused element", () => {
    const composer = document.createElement("div")
    expect(shouldRunShortcut({ defaultPrevented: false, target: composer })).toBe(true)
  })

  test("leaves the key to the markdown page, its dialogs, and the whiteboard", () => {
    const surfaces = [
      '<div data-component="markdown-bench-paper"><p></p></div>',
      '<div class="mdxeditor-popup-container"><input /></div>',
      '<div data-component="whiteboard-canvas"><textarea></textarea></div>',
    ]
    for (const markup of surfaces) {
      const host = document.createElement("div")
      host.innerHTML = markup
      const target = host.querySelector("p, input, textarea")
      expect(shouldRunShortcut({ defaultPrevented: false, target }, BENCH_EDITOR_SELECTOR)).toBe(
        false,
      )
    }
  })
})
