import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  useChatJumpShortcuts,
  useShortcutCommand,
} from "../src/lib/use-shortcut-command"

function dispatchMenuCommand(id: string): void {
  window.dispatchEvent(new CustomEvent("buddy:menu-command", { detail: { id } }))
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

  test("handles forwarded commands and ignores unavailable chat positions", async () => {
    let newChatCount = 0
    const openedIndexes: number[] = []

    function Probe() {
      useShortcutCommand("chat.new", () => {
        newChatCount += 1
      })
      useChatJumpShortcuts((index) => {
        openedIndexes.push(index)
      }, { count: 3 })
      return null
    }

    await act(async () => root.render(<Probe />))
    act(() => {
      dispatchMenuCommand("chat.new")
      dispatchMenuCommand("chat.jump.3")
      dispatchMenuCommand("chat.jump.4")
    })

    expect(newChatCount).toBe(1)
    expect(openedIndexes).toEqual([2])
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
})
