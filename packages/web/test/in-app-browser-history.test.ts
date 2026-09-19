import { describe, expect, test } from "bun:test"
import type { StorageValue } from "zustand/middleware"
import {
  mergeInAppBrowserHistory,
  parseInAppBrowserHistory,
  recordInAppBrowserVisit,
  removeInAppBrowserVisit,
} from "../src/lib/in-app-browser-history"
import {
  getInAppBrowserHistoryHydrationStatus,
  useInAppBrowserHistoryStore,
} from "../src/state/in-app-browser-history-store"

const NOTEBOOK = "/notebooks/biology"

describe("Browser history", () => {
  test("moves a revisited page to the top instead of duplicating it", () => {
    let history = recordInAppBrowserVisit(
      {},
      { directory: NOTEBOOK, url: "https://hibuddy.in/a", title: "A", visitedAt: 1 },
    )
    history = recordInAppBrowserVisit(history, {
      directory: NOTEBOOK,
      url: "https://hibuddy.in/b",
      title: "B",
      visitedAt: 2,
    })
    history = recordInAppBrowserVisit(history, {
      directory: NOTEBOOK,
      url: "https://hibuddy.in/a",
      title: "A again",
      visitedAt: 3,
    })

    expect(history[NOTEBOOK]).toEqual([
      { url: "https://hibuddy.in/a", title: "A again", visitedAt: 3 },
      { url: "https://hibuddy.in/b", title: "B", visitedAt: 2 },
    ])
  })

  test("never stores credentials embedded in a URL", () => {
    const history = recordInAppBrowserVisit(
      {},
      {
        directory: NOTEBOOK,
        url: "https://student:secret@hibuddy.in/login",
        title: "Login",
        visitedAt: 1,
      },
    )
    expect(history[NOTEBOOK]?.[0]?.url).toBe("https://hibuddy.in/login")
  })

  test("refreshes repeat visits and returns the same history only when the visit is unchanged", () => {
    const history = recordInAppBrowserVisit(
      {},
      { directory: NOTEBOOK, url: "https://hibuddy.in/", title: "Buddy", visitedAt: 1 },
    )
    expect(
      recordInAppBrowserVisit(history, {
        directory: NOTEBOOK,
        url: "https://hibuddy.in/",
        title: "Buddy",
        visitedAt: 1,
      }),
    ).toBe(history)
    expect(
      recordInAppBrowserVisit(history, {
        directory: NOTEBOOK,
        url: "https://hibuddy.in/",
        title: "Buddy",
        visitedAt: 2,
      }),
    ).toEqual({
      [NOTEBOOK]: [{ url: "https://hibuddy.in/", title: "Buddy", visitedAt: 2 }],
    })
    expect(
      recordInAppBrowserVisit(history, {
        directory: NOTEBOOK,
        url: "about:blank",
        title: "New tab",
        visitedAt: 3,
      }),
    ).toBe(history)
  })

  test("keeps hash-router locations in recent visits", () => {
    const history = recordInAppBrowserVisit(
      {},
      {
        directory: NOTEBOOK,
        url: "https://app.example/#/settings",
        title: "Settings",
        visitedAt: 1,
      },
    )
    expect(history[NOTEBOOK]?.[0]?.url).toBe("https://app.example/#/settings")
  })

  test("merges visits recorded while persisted history is hydrating", () => {
    const persisted = {
      [NOTEBOOK]: [{ url: "https://hibuddy.in/old", title: "Old", visitedAt: 1 }],
    }
    const current = {
      [NOTEBOOK]: [{ url: "https://hibuddy.in/current", title: "Current", visitedAt: 2 }],
    }

    expect(mergeInAppBrowserHistory(persisted, current)[NOTEBOOK]).toEqual([
      { url: "https://hibuddy.in/current", title: "Current", visitedAt: 2 },
      { url: "https://hibuddy.in/old", title: "Old", visitedAt: 1 },
    ])
  })

  test("caps entries per notebook and keeps only the most recently used notebooks", () => {
    let history = {}
    for (let index = 0; index < 55; index += 1) {
      history = recordInAppBrowserVisit(history, {
        directory: NOTEBOOK,
        url: `https://hibuddy.in/${index}`,
        title: String(index),
        visitedAt: index,
      })
    }
    for (let index = 0; index < 20; index += 1) {
      history = recordInAppBrowserVisit(history, {
        directory: `/notebooks/${index}`,
        url: "https://hibuddy.in/",
        title: "Buddy",
        visitedAt: 100 + index,
      })
    }

    const parsed = parseInAppBrowserHistory(history)
    expect(Object.keys(parsed)).toHaveLength(20)
    expect(parsed[NOTEBOOK]).toBeUndefined()
    expect(parsed["/notebooks/19"]).toHaveLength(1)
  })

  test("keeps a notebook recent when its current page is revisited", () => {
    let history = recordInAppBrowserVisit(
      {},
      { directory: NOTEBOOK, url: "https://hibuddy.in/", title: "Buddy", visitedAt: 1 },
    )
    for (let index = 0; index < 20; index += 1) {
      history = recordInAppBrowserVisit(history, {
        directory: `/notebooks/${index}`,
        url: "https://hibuddy.in/",
        title: "Buddy",
        visitedAt: 100 + index,
      })
    }
    history = recordInAppBrowserVisit(history, {
      directory: NOTEBOOK,
      url: "https://hibuddy.in/",
      title: "Buddy",
      visitedAt: 1_000,
    })

    expect(history[NOTEBOOK]?.[0]?.visitedAt).toBe(1_000)
    expect(Object.keys(history)).toHaveLength(20)
  })

  test("removes one page and drops malformed persisted entries", () => {
    const history = parseInAppBrowserHistory({
      [NOTEBOOK]: [
        { url: "https://hibuddy.in/a", title: "A", visitedAt: 2 },
        { url: "https://hibuddy.in/pinned", title: "Pinned", visitedAt: 1e20 },
        { url: "javascript:alert(1)", title: "Bad", visitedAt: 1 },
        { url: "https://hibuddy.in/b", visitedAt: 1 },
      ],
      broken: "not a list",
    })
    expect(history).toEqual({
      [NOTEBOOK]: [{ url: "https://hibuddy.in/a", title: "A", visitedAt: 2 }],
    })
    expect(
      removeInAppBrowserVisit(history, { directory: NOTEBOOK, url: "https://hibuddy.in/a" }),
    ).toEqual({ [NOTEBOOK]: [] })
  })

  test("does not overwrite persisted visits after a failed storage read", async () => {
    const persist = useInAppBrowserHistoryStore.persist
    const originalStorage = persist.getOptions().storage
    if (!originalStorage) throw new Error("Expected Browser history storage")

    const oldVisit = { url: "https://hibuddy.in/old", title: "Old", visitedAt: 1 }
    const newVisit = { url: "https://hibuddy.in/new", title: "New", visitedAt: 2 }
    let failRead = true
    let writes = 0
    let stored: StorageValue<unknown> = {
      state: { byDirectory: { [NOTEBOOK]: [oldVisit] } },
    }

    persist.setOptions({
      storage: {
        getItem: async () => {
          if (failRead) throw new Error("history unavailable")
          return stored
        },
        setItem: async (_name, value) => {
          writes += 1
          stored = value
        },
        removeItem: async () => undefined,
      },
    })

    try {
      await persist.rehydrate()
      expect(getInAppBrowserHistoryHydrationStatus()).toBe("failed")

      useInAppBrowserHistoryStore.getState().recordVisit({ directory: NOTEBOOK, ...newVisit })
      expect(writes).toBe(0)

      failRead = false
      await persist.rehydrate()
      await new Promise<void>((resolve) => queueMicrotask(resolve))

      expect(getInAppBrowserHistoryHydrationStatus()).toBe("hydrated")
      expect(useInAppBrowserHistoryStore.getState().byDirectory[NOTEBOOK]).toEqual([
        newVisit,
        oldVisit,
      ])
      expect(stored).toEqual({
        state: { byDirectory: { [NOTEBOOK]: [newVisit, oldVisit] } },
        version: 0,
      })
      expect(writes).toBe(1)
    } finally {
      persist.setOptions({ storage: originalStorage })
      await persist.rehydrate()
      await new Promise<void>((resolve) => queueMicrotask(resolve))
    }
  })
})
