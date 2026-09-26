import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { Citation } from "@buddy/citation-contract"
import {
  requestCitationNavigation,
  type CitationNavigationHandler,
} from "../src/lib/citations/navigation"
import { useCitationNavigationHandler } from "../src/lib/citations/use-citation-navigation-handler"

const citation: Citation = {
  schemaVersion: 1,
  id: "external-quote",
  excerpt: "Quote this",
  source: {
    kind: "document",
    path: "/outside/notes.md",
    selector: { version: 1, start: 0, end: 10, prefix: "", suffix: "" },
  },
}

function Probe(props: { handler: CitationNavigationHandler }) {
  useCitationNavigationHandler(props.handler)
  return null
}

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("useCitationNavigationHandler", () => {
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

  test("runs an in-flight citation once when the handler changes mid-open", async () => {
    const calls: string[] = []
    let finishOpen: ((result: boolean) => void) | undefined
    const opening: CitationNavigationHandler = (request) => {
      calls.push(`first:${request.id}`)
      return new Promise((resolve) => {
        finishOpen = resolve
      })
    }
    const later: CitationNavigationHandler = (request) => {
      calls.push(`later:${request.id}`)
      return true
    }

    await act(async () => {
      root.render(<Probe handler={opening} />)
      await flushEffects()
    })
    let navigation: Promise<boolean> | undefined
    await act(async () => {
      navigation = requestCitationNavigation(citation)
      await flushEffects()
    })
    await act(async () => {
      root.render(<Probe handler={later} />)
      await flushEffects()
    })
    expect(calls).toEqual(["first:external-quote"])

    await act(async () => {
      finishOpen?.(true)
      await flushEffects()
    })
    expect(await navigation).toBe(true)

    await act(async () => {
      await requestCitationNavigation({ ...citation, id: "next-quote" })
      await flushEffects()
    })
    expect(calls).toEqual(["first:external-quote", "later:next-quote"])
  })
})
