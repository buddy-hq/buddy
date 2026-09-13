import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  ThreadStatusIndicator,
  threadStatusLabel,
  type ThreadStatus,
} from "../src/components/layout/chat-left-sidebar/thread-helpers"

// Strips class attributes so two glyphs compare by shape alone, not colour or motion.
function unstyledGlyphMarkup(indicator: HTMLElement | null) {
  const svg = indicator?.querySelector("svg")
  if (!svg) return null
  const clone = svg.cloneNode(true)
  if (!(clone instanceof Element)) return null
  for (const element of [clone, ...clone.querySelectorAll("*")]) element.removeAttribute("class")
  return clone.outerHTML
}

describe("ThreadStatusIndicator", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderStatus(status: ThreadStatus) {
    await act(async () => {
      root.render(<ThreadStatusIndicator status={status} />)
    })
    return container.querySelector<HTMLElement>("[role='img']")
  }

  test("renders nothing for idle threads", async () => {
    expect(await renderStatus("idle")).toBeNull()
  })

  test("labels each active status for assistive technology", async () => {
    for (const status of ["unread", "working", "retrying"] as const) {
      const indicator = await renderStatus(status)
      expect(indicator?.getAttribute("aria-label")).toBe(threadStatusLabel(status))
    }
  })

  test("distinguishes active statuses by shape", async () => {
    const unread = await renderStatus("unread")
    expect(unread?.querySelector("svg")).toBeNull()

    const working = unstyledGlyphMarkup(await renderStatus("working"))
    const retrying = unstyledGlyphMarkup(await renderStatus("retrying"))
    expect(working).not.toBeNull()
    expect(retrying).not.toBeNull()
    expect(working).not.toBe(retrying)
  })
})
