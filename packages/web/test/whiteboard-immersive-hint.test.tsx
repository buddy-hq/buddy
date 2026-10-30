import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { UI_PREFERENCES_STORAGE_KEY, useUiPreferences } from "../src/state/ui-preferences"
import {
  useHighlightWhiteboardImmersive,
  visibleWhiteboardImmersiveHint,
  type THighlightWhiteboardImmersiveInput,
} from "../src/state/whiteboard-immersive-hint"
import { parsePersistedStoreState } from "./parse-test-values"

const INBOX = "/Users/me/Inbox"
const PHYSICS = "/Users/me/Physics"
const HISTORY = "/Users/me/History"
const MUSIC = "/Users/me/Music"

const FILE_TARGET = {
  type: "workspace-file",
  root: "notebook",
  path: "notes.md",
  viewer: "markdown",
} satisfies BenchTarget

function whiteboard(objectID: string): BenchTarget {
  return {
    type: "object",
    ref: {
      kind: "whiteboard",
      objectID,
      revisionID: null,
      itemID: null,
    },
    viewID: "current",
  }
}

function HighlightProbe(props: THighlightWhiteboardImmersiveInput) {
  const highlight = useHighlightWhiteboardImmersive(props)
  return <div data-highlight={highlight ? "true" : "false"} />
}

let root: Root | undefined
let container: HTMLDivElement | undefined

function hintDirectories(): string[] {
  return useUiPreferences.getState().whiteboardImmersiveHintDirectories
}

function highlightValue(): string | null {
  return container?.querySelector("[data-highlight]")?.getAttribute("data-highlight") ?? null
}

async function show(input: THighlightWhiteboardImmersiveInput) {
  await act(async () => {
    root?.render(<HighlightProbe key={input.directory} {...input} />)
  })
}

beforeEach(async () => {
  localStorage.clear()
  await useUiPreferences.persist.rehydrate()
  useUiPreferences.setState({
    whiteboardImmersiveHintDirectories: [],
    activeWhiteboardImmersiveHint: null,
  })
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
      await Promise.resolve()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

describe("whiteboard immersive hint", () => {
  test("does not highlight unless a whiteboard is the docked Bench target", async () => {
    await show({ directory: INBOX, target: FILE_TARGET, benchDocked: true })
    expect(highlightValue()).toBe("false")

    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: false })
    expect(highlightValue()).toBe("false")
    expect(hintDirectories()).toEqual([])
  })

  test("highlights the first whiteboard in three notebooks, including Inbox, and not a fourth", async () => {
    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("true")
    expect(hintDirectories()).toEqual([INBOX])

    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("true")
    expect(hintDirectories()).toEqual([INBOX])

    await show({ directory: INBOX, target: FILE_TARGET, benchDocked: true })
    expect(highlightValue()).toBe("false")

    await show({ directory: INBOX, target: whiteboard("board-2"), benchDocked: true })
    expect(highlightValue()).toBe("false")
    expect(hintDirectories()).toEqual([INBOX])

    await show({ directory: PHYSICS, target: whiteboard("board-3"), benchDocked: true })
    expect(highlightValue()).toBe("true")

    await show({ directory: HISTORY, target: whiteboard("board-4"), benchDocked: true })
    expect(highlightValue()).toBe("true")
    expect(hintDirectories()).toEqual([INBOX, PHYSICS, HISTORY])

    await show({ directory: MUSIC, target: whiteboard("board-5"), benchDocked: true })
    expect(highlightValue()).toBe("false")
    expect(hintDirectories()).toEqual([INBOX, PHYSICS, HISTORY])
  })

  test("stops highlighting when immersive is entered and does not show it again", async () => {
    await show({ directory: PHYSICS, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("true")

    await show({ directory: PHYSICS, target: whiteboard("board-1"), benchDocked: false })
    expect(highlightValue()).toBe("false")

    await show({ directory: PHYSICS, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("false")
    expect(hintDirectories()).toEqual([PHYSICS])
  })

  test("remembers the notebooks that showed the hint and leaves older preferences intact", async () => {
    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("true")

    const saved = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)
    const parsed = parsePersistedStoreState(saved)
    expect(parsed).toMatchObject({ whiteboardImmersiveHintDirectories: [INBOX] })
    expect(parsed?.activeWhiteboardImmersiveHint).toBeUndefined()
    expect(parsed?.beginWhiteboardImmersiveHint).toBeUndefined()

    await act(async () => {
      root?.unmount()
    })
    root = undefined
    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toBeNull()

    useUiPreferences.setState({
      whiteboardImmersiveHintDirectories: [],
    })
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, saved ?? "")
    await useUiPreferences.persist.rehydrate()

    expect(hintDirectories()).toEqual([INBOX])
    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toBeNull()

    if (!container) throw new Error("Expected a hint container")
    root = createRoot(container)
    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("false")
  })

  test("does not spend the hint when a preview covers an immersive whiteboard", async () => {
    await show(
      visibleWhiteboardImmersiveHint({
        directory: INBOX,
        target: whiteboard("board-1"),
        layoutMode: BENCH_CHAT_LAYOUT_DOCKED,
        workspaceHydrated: true,
        transientBenchActive: true,
        immersiveControlMounted: true,
      }),
    )
    expect(highlightValue()).toBe("false")
    expect(hintDirectories()).toEqual([])
    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toBeNull()

    await show(
      visibleWhiteboardImmersiveHint({
        directory: INBOX,
        target: whiteboard("board-1"),
        layoutMode: BENCH_CHAT_LAYOUT_FLOATING,
        workspaceHydrated: true,
        transientBenchActive: false,
        immersiveControlMounted: false,
      }),
    )
    expect(hintDirectories()).toEqual([])

    await show(
      visibleWhiteboardImmersiveHint({
        directory: INBOX,
        target: whiteboard("board-1"),
        layoutMode: BENCH_CHAT_LAYOUT_DOCKED,
        workspaceHydrated: true,
        transientBenchActive: false,
        immersiveControlMounted: false,
      }),
    )
    expect(hintDirectories()).toEqual([])

    await show(
      visibleWhiteboardImmersiveHint({
        directory: INBOX,
        target: whiteboard("board-1"),
        layoutMode: BENCH_CHAT_LAYOUT_DOCKED,
        workspaceHydrated: false,
        transientBenchActive: false,
        immersiveControlMounted: true,
      }),
    )
    expect(hintDirectories()).toEqual([])

    await show(
      visibleWhiteboardImmersiveHint({
        directory: INBOX,
        target: whiteboard("board-2"),
        layoutMode: BENCH_CHAT_LAYOUT_DOCKED,
        workspaceHydrated: true,
        transientBenchActive: false,
        immersiveControlMounted: true,
      }),
    )
    expect(highlightValue()).toBe("true")
    expect(hintDirectories()).toEqual([INBOX])
  })

  test("ends the hint when the workspace unmounts and does not show it on return", async () => {
    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("true")
    expect(hintDirectories()).toEqual([INBOX])
    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toEqual({
      directory: INBOX,
      objectID: "board-1",
    })

    await act(async () => {
      root?.unmount()
      await Promise.resolve()
    })
    root = undefined

    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toBeNull()
    expect(hintDirectories()).toEqual([INBOX])

    if (!container) throw new Error("Expected a hint container")
    root = createRoot(container)
    await show({ directory: INBOX, target: whiteboard("board-1"), benchDocked: true })
    expect(highlightValue()).toBe("false")
    expect(hintDirectories()).toEqual([INBOX])
    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toBeNull()
  })

  test("keeps the active hint through StrictMode effect replay", async () => {
    await act(async () => {
      root?.render(
        <StrictMode>
          <HighlightProbe directory={INBOX} target={whiteboard("board-1")} benchDocked />
        </StrictMode>,
      )
    })
    expect(highlightValue()).toBe("true")
    expect(hintDirectories()).toEqual([INBOX])
    expect(useUiPreferences.getState().activeWhiteboardImmersiveHint).toEqual({
      directory: INBOX,
      objectID: "board-1",
    })
  })
})
