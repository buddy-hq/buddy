import { afterEach, describe, expect, test } from "bun:test"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  READER_RECENT_LOCATION_SETTLE_MS,
  scheduleReaderRecentLocation,
  useReaderRecentLocations,
  type ReaderRecentLocationScheduler,
} from "../src/components/readers/ui/use-reader-recent-locations"
import type { ReaderRecentLocation } from "../src/components/readers/ui/reader-location-popover"
import type { ReaderRelocation } from "../src/components/readers/reader-types"

const REACT_ACT_ENVIRONMENT_KEY = "IS_REACT_ACT_ENVIRONMENT"

const scheduleReaderRecentLocationWithReactAct: ReaderRecentLocationScheduler = (
  callback,
  delayMs,
) =>
  scheduleReaderRecentLocation(() => {
    act(callback)
  }, delayMs)

type ManualScheduledWork = {
  callback: () => void
  delayMs: number
  cancelled: boolean
}

type ManualScheduler = {
  schedule: ReaderRecentLocationScheduler
  tasks: ManualScheduledWork[]
  fireLatest: () => void
}

let root: Root | undefined
let container: HTMLDivElement | undefined
let previousActEnvironment: PropertyDescriptor | undefined

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
  if (previousActEnvironment) {
    Object.defineProperty(globalThis, REACT_ACT_ENVIRONMENT_KEY, previousActEnvironment)
  } else {
    Reflect.deleteProperty(globalThis, REACT_ACT_ENVIRONMENT_KEY)
  }
  previousActEnvironment = undefined
})

function pdfRelocation(pageIndex: number, yRatio: number): ReaderRelocation {
  return {
    anchor: { kind: "pdf-position", pageIndex, xRatio: 0, yRatio },
    pageLabel: String(pageIndex + 1),
    locationLabel: `Page ${pageIndex + 1}`,
  }
}

function createManualScheduler(): ManualScheduler {
  const tasks: ManualScheduledWork[] = []
  return {
    tasks,
    schedule(callback, delayMs) {
      const task: ManualScheduledWork = { callback, delayMs, cancelled: false }
      tasks.push(task)
      return () => {
        task.cancelled = true
      }
    },
    fireLatest() {
      const task = tasks.at(-1)
      if (!task || task.cancelled) return
      task.cancelled = true
      task.callback()
    },
  }
}

/** Renders the hook and reports every value it has produced. */
function mountHook(schedule?: ReaderRecentLocationScheduler) {
  previousActEnvironment ??= Object.getOwnPropertyDescriptor(globalThis, REACT_ACT_ENVIRONMENT_KEY)
  Reflect.set(globalThis, REACT_ACT_ENVIRONMENT_KEY, true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)

  let latest: readonly ReaderRecentLocation[] = []
  let renderCount = 0

  function Probe(props: { sourceKey: string; relocation: ReaderRelocation | null }) {
    const recent = useReaderRecentLocations(props, schedule)
    latest = recent
    renderCount += 1
    useEffect(() => {
      if (recent.length === 0) return
      resolveRecent?.(recent)
    }, [recent])
    return null
  }

  let resolveRecent: ((recent: readonly ReaderRecentLocation[]) => void) | undefined
  const recentReady = new Promise<readonly ReaderRecentLocation[]>((resolve) => {
    resolveRecent = resolve
  })

  return {
    render: async (input: { sourceKey: string; relocation: ReaderRelocation | null }) => {
      await act(async () => {
        root?.render(<Probe sourceKey={input.sourceKey} relocation={input.relocation} />)
      })
    },
    latest: () => latest,
    renderCount: () => renderCount,
    waitForRecent: () => recentReady,
    unmount: async () => {
      await act(async () => {
        root?.unmount()
      })
      root = undefined
    },
  }
}

describe("useReaderRecentLocations", () => {
  test("records only positions the reader settled on", async () => {
    const scheduler = createManualScheduler()
    const hook = mountHook(scheduler.schedule)

    // A scroll: one relocation per animation frame, none of them a stop.
    for (let frame = 0; frame < 12; frame += 1) {
      await hook.render({ sourceKey: "book-a", relocation: pdfRelocation(0, frame / 100) })
    }
    expect(hook.latest()).toEqual([])
    expect(scheduler.tasks.at(-1)?.delayMs).toBe(READER_RECENT_LOCATION_SETTLE_MS)
    expect(scheduler.tasks.slice(0, -1).every((task) => task.cancelled)).toBe(true)

    const rendersBeforeSettle = hook.renderCount()
    await act(async () => {
      scheduler.fireLatest()
    })

    expect(hook.latest().map((entry) => entry.position)).toEqual(["Page 1"])
    // The whole scroll costs exactly one extra render, not one per frame.
    expect(hook.renderCount()).toBe(rendersBeforeSettle + 1)
  })

  test("runs the mounted reader through the production settle scheduler", async () => {
    const hook = mountHook(scheduleReaderRecentLocationWithReactAct)
    const recentReady = hook.waitForRecent()

    await hook.render({ sourceKey: "book-a", relocation: pdfRelocation(2, 0.3) })
    const recent = await recentReady

    expect(recent.map((entry) => entry.position)).toEqual(["Page 3"])
  })

  test("drops anchors belonging to a document that was replaced", async () => {
    const scheduler = createManualScheduler()
    const hook = mountHook(scheduler.schedule)

    await hook.render({ sourceKey: "book-a", relocation: pdfRelocation(4, 0.5) })
    const pending = scheduler.tasks.at(-1)
    expect(pending?.delayMs).toBe(READER_RECENT_LOCATION_SETTLE_MS)
    await act(async () => {
      scheduler.fireLatest()
    })
    expect(hook.latest()).toHaveLength(1)

    // A replacement document clears its relocation before the new one arrives.
    await hook.render({ sourceKey: "book-b", relocation: null })
    expect(hook.latest()).toEqual([])

    await hook.render({ sourceKey: "book-b", relocation: pdfRelocation(1, 0.2) })
    await act(async () => {
      scheduler.fireLatest()
    })
    expect(hook.latest().map((entry) => entry.position)).toEqual(["Page 2"])
  })

  test("cancels a pending location when the source changes", async () => {
    const scheduler = createManualScheduler()
    const hook = mountHook(scheduler.schedule)
    const previousRelocation = pdfRelocation(4, 0.5)

    await hook.render({ sourceKey: "book-a", relocation: previousRelocation })
    const pending = scheduler.tasks.at(-1)
    await hook.render({ sourceKey: "book-b", relocation: previousRelocation })

    expect(pending?.cancelled).toBe(true)
    expect(scheduler.tasks).toHaveLength(1)
    await act(async () => {
      scheduler.fireLatest()
    })
    expect(hook.latest()).toEqual([])

    await hook.render({ sourceKey: "book-b", relocation: pdfRelocation(1, 0.2) })
    await act(async () => {
      scheduler.fireLatest()
    })
    expect(hook.latest().map((entry) => entry.position)).toEqual(["Page 2"])
  })

  test("cancels a pending location when the reader unmounts", async () => {
    const scheduler = createManualScheduler()
    const hook = mountHook(scheduler.schedule)

    await hook.render({ sourceKey: "book-a", relocation: pdfRelocation(0, 0.1) })
    const pending = scheduler.tasks.at(-1)
    await hook.unmount()

    expect(pending?.cancelled).toBe(true)
  })
})
