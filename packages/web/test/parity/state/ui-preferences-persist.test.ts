import { beforeEach, describe, expect, test } from "bun:test"
import { createScopedCache } from "../../../src/lib/scoped-cache"
import { UI_PREFERENCES_STORAGE_KEY, useUiPreferences } from "../../../src/state/ui-preferences"

function resetUiPreferences() {
  useUiPreferences.setState({
    pinnedByDirectory: {},
    unreadByDirectory: {},
    leftSidebarOpen: true,
    leftSidebarWidth: 344,
    rightSidebarOpen: false,
    rightSidebarWidth: 344,
    rightSidebarTab: "curriculum",
  })
}

beforeEach(() => {
  localStorage.clear()
  resetUiPreferences()
})

describe("ui preference persistence parity", () => {
  test("persists selected ui preferences and excludes actions", () => {
    const state = useUiPreferences.getState()

    state.togglePinned("/repo", "session_1")
    state.markUnread("/repo", "session_1")
    state.setLeftSidebarOpen(false)
    state.setLeftSidebarWidth(280)
    state.setRightSidebarOpen(true)
    state.setRightSidebarWidth(420)
    state.setRightSidebarTab("settings")
    state.setRightSidebarTab("resources")

    const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)
    expect(raw).toBeTruthy()

    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> }
    expect(parsed.state).toMatchObject({
      pinnedByDirectory: { "/repo": ["session_1"] },
      unreadByDirectory: { "/repo": { session_1: true } },
      leftSidebarOpen: false,
      leftSidebarWidth: 280,
      rightSidebarOpen: true,
      rightSidebarWidth: 420,
      rightSidebarTab: "resources",
    })
    expect(parsed.state.togglePinned).toBeUndefined()
    expect(parsed.state.setRightSidebarOpen).toBeUndefined()
  })

  test("clears pinned and unread state for archived session", () => {
    const state = useUiPreferences.getState()

    state.togglePinned("/repo", "session_1")
    state.markUnread("/repo", "session_1")
    state.markUnread("/repo", "session_2")
    state.clearDirectorySessionState("/repo", "session_1")

    const next = useUiPreferences.getState()
    expect(next.pinnedByDirectory["/repo"]).toEqual([])
    expect(next.unreadByDirectory["/repo"]).toEqual({ session_2: true })
  })
})

describe("createScopedCache", () => {
  test("evicts least-recently-used entry when max is reached", () => {
    const disposed: string[] = []
    const cache = createScopedCache((key) => ({ key }), {
      maxEntries: 2,
      dispose: (value) => disposed.push(value.key),
    })

    const a = cache.get("a")
    const b = cache.get("b")
    expect(a.key).toBe("a")
    expect(b.key).toBe("b")

    cache.get("a")
    const c = cache.get("c")

    expect(c.key).toBe("c")
    expect(cache.peek("a")?.key).toBe("a")
    expect(cache.peek("b")).toBeUndefined()
    expect(cache.peek("c")?.key).toBe("c")
    expect(disposed).toEqual(["b"])
  })

  test("disposes entries on delete and clear", () => {
    const disposed: string[] = []
    const cache = createScopedCache((key) => ({ key }), {
      dispose: (value) => disposed.push(value.key),
    })

    cache.get("a")
    cache.get("b")

    const removed = cache.delete("a")
    expect(removed?.key).toBe("a")
    expect(cache.peek("a")).toBeUndefined()

    cache.clear()
    expect(cache.peek("b")).toBeUndefined()
    expect(disposed).toEqual(["a", "b"])
  })

  test("expires stale entries with ttl and recreates on get", () => {
    let clock = 0
    let count = 0
    const disposed: string[] = []
    const cache = createScopedCache((key) => ({ key, count: ++count }), {
      ttlMs: 10,
      now: () => clock,
      dispose: (value) => disposed.push(`${value.key}:${value.count}`),
    })

    const first = cache.get("a")
    expect(first.count).toBe(1)

    clock = 9
    expect(cache.peek("a")?.count).toBe(1)

    clock = 11
    expect(cache.peek("a")).toBeUndefined()
    expect(disposed).toEqual(["a:1"])

    const second = cache.get("a")
    expect(second.count).toBe(2)
    expect(disposed).toEqual(["a:1"])
  })
})
