import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useReaderRecentLocations } from "../src/components/readers/ui/use-reader-recent-locations"
import type { ReaderRecentLocation } from "../src/components/readers/ui/reader-location-popover"
import type { ReaderRelocation } from "../src/components/readers/reader-types"

/** Comfortably past the hook's settle delay. */
const SETTLE_WAIT_MS = 800

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
})

function pdfRelocation(pageIndex: number, yRatio: number): ReaderRelocation {
  return {
    anchor: { kind: "pdf-position", pageIndex, xRatio: 0, yRatio },
    pageLabel: String(pageIndex + 1),
    locationLabel: `Page ${pageIndex + 1}`,
  }
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS))
  })
}

/** Renders the hook and reports every value it has produced. */
function mountHook(): {
  render: (input: { sourceKey: string; relocation: ReaderRelocation | null }) => Promise<void>
  latest: () => readonly ReaderRecentLocation[]
  renderCount: () => number
} {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)

  let latest: readonly ReaderRecentLocation[] = []
  let renderCount = 0

  function Probe(props: { sourceKey: string; relocation: ReaderRelocation | null }) {
    latest = useReaderRecentLocations(props)
    renderCount += 1
    return null
  }

  return {
    render: async (input) => {
      await act(async () => {
        root?.render(<Probe sourceKey={input.sourceKey} relocation={input.relocation} />)
      })
    },
    latest: () => latest,
    renderCount: () => renderCount,
  }
}

describe("useReaderRecentLocations", () => {
  test("records only positions the reader settled on", async () => {
    const hook = mountHook()

    // A scroll: one relocation per animation frame, none of them a stop.
    for (let frame = 0; frame < 12; frame += 1) {
      await hook.render({ sourceKey: "book-a", relocation: pdfRelocation(0, frame / 100) })
    }
    expect(hook.latest()).toEqual([])

    const rendersBeforeSettle = hook.renderCount()
    await settle()

    expect(hook.latest().map((entry) => entry.position)).toEqual(["Page 1"])
    // The whole scroll costs exactly one extra render, not one per frame.
    expect(hook.renderCount()).toBe(rendersBeforeSettle + 1)
  })

  test("drops anchors belonging to a document that was replaced", async () => {
    const hook = mountHook()

    await hook.render({ sourceKey: "book-a", relocation: pdfRelocation(4, 0.5) })
    await settle()
    expect(hook.latest()).toHaveLength(1)

    // A replacement document clears its relocation before the new one arrives.
    await hook.render({ sourceKey: "book-b", relocation: null })
    expect(hook.latest()).toEqual([])

    await hook.render({ sourceKey: "book-b", relocation: pdfRelocation(1, 0.2) })
    await settle()
    expect(hook.latest().map((entry) => entry.position)).toEqual(["Page 2"])
  })
})
