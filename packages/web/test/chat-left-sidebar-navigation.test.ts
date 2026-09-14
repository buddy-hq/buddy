import { describe, expect, test } from "bun:test"
import {
  stepSidebarChat,
  type SidebarChat,
} from "../src/components/layout/chat-left-sidebar/chat-navigation"

const NOTEBOOK_A = "/notebooks/a"
const NOTEBOOK_B = "/notebooks/b"

function row(directory: string, sessionID: string, visible = true): SidebarChat {
  return { directory, sessionID, visible }
}

// Pinned section first, then notebook A (a3 behind "show more"), then notebook B.
const CHATS = [
  row(NOTEBOOK_B, "pinned-subagent"),
  row(NOTEBOOK_A, "a1"),
  row(NOTEBOOK_A, "a2"),
  row(NOTEBOOK_A, "a3", false),
  row(NOTEBOOK_B, "b1"),
]

function step(input: {
  directory: string
  active?: string
  root?: string
  step: 1 | -1
}): string | undefined {
  return stepSidebarChat({
    chats: CHATS,
    directory: input.directory,
    activeSessionID: input.active,
    activeRootSessionID: input.root ?? input.active,
    step: input.step,
  })?.sessionID
}

describe("sidebar chat stepping", () => {
  test("moves to the neighbouring row", () => {
    expect(step({ directory: NOTEBOOK_A, active: "a1", step: 1 })).toBe("a2")
    expect(step({ directory: NOTEBOOK_A, active: "a1", step: -1 })).toBe("pinned-subagent")
  })

  test("steps over rows hidden behind show more", () => {
    expect(step({ directory: NOTEBOOK_A, active: "a2", step: 1 })).toBe("b1")
  })

  test("from a hidden open chat, moves to the nearest shown row in that direction", () => {
    expect(step({ directory: NOTEBOOK_A, active: "a3", step: 1 })).toBe("b1")
    expect(step({ directory: NOTEBOOK_A, active: "a3", step: -1 })).toBe("a2")
  })

  test("finds a pinned subagent chat by its own row", () => {
    expect(
      step({ directory: NOTEBOOK_B, active: "pinned-subagent", root: "parent", step: 1 }),
    ).toBe("a1")
  })

  test("finds an unpinned subagent chat through its root row", () => {
    expect(step({ directory: NOTEBOOK_A, active: "subagent", root: "a2", step: 1 })).toBe("b1")
  })

  test("matches the open chat only within its own notebook", () => {
    expect(step({ directory: NOTEBOOK_B, active: "a1", step: 1 })).toBe("pinned-subagent")
  })

  test("with no open chat in the list, starts from the nearest end", () => {
    expect(step({ directory: NOTEBOOK_A, step: 1 })).toBe("pinned-subagent")
    expect(step({ directory: NOTEBOOK_A, step: -1 })).toBe("b1")
  })

  test("stops at the ends of the list", () => {
    expect(step({ directory: NOTEBOOK_B, active: "b1", step: 1 })).toBeUndefined()
    expect(step({ directory: NOTEBOOK_B, active: "pinned-subagent", step: -1 })).toBeUndefined()
  })
})
