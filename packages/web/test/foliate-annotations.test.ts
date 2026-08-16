import { afterEach, describe, expect, test } from "bun:test"
import type { FoliateNavigationTarget, FoliateResolvedNavigation } from "foliate-js/view.js"
import type { Overlayer } from "foliate-js/overlayer.js"
import {
  removeFoliateAnnotation,
  renderFoliateAnnotation,
  revealFoliateAnnotation,
} from "../src/components/readers/utils/foliate-annotations"

function createOverlayer() {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const entries = new Map<string, SVGElement>()
  const overlayer: Overlayer = {
    element,
    add(key, range, draw, options) {
      const node = draw(range.getClientRects(), options)
      element.append(node)
      entries.set(key, node)
    },
    remove(key) {
      entries.get(key)?.remove()
      entries.delete(key)
    },
    redraw() {},
    hitTest() {
      return [undefined, undefined]
    },
  }
  return { element, overlayer }
}

function createMalformedSpineView(renderedIndex = 3) {
  const doc = document.implementation.createHTMLDocument("Chapter")
  const paragraph = doc.createElement("p")
  paragraph.textContent = "THE FOUNTAINHEAD"
  doc.body.append(paragraph)
  const range = doc.createRange()
  range.selectNodeContents(paragraph)
  const { element, overlayer } = createOverlayer()
  const navigationTargets: Array<FoliateNavigationTarget | FoliateResolvedNavigation> = []
  const sections = [
    { id: "EPUB/nav.xhtml", cfi: "epubcfi(/6/4)", load: () => "nav" },
    { id: "EPUB/notice.html", cfi: "epubcfi(/6/6)", load: () => "notice" },
    { id: "EPUB/page_1.html", cfi: "epubcfi(/6/8)", load: () => "page 1" },
    { id: "EPUB/page_3.html", cfi: "epubcfi(/6/10)", load: () => "page 3" },
    { id: "EPUB/page_4.html", cfi: "epubcfi(/6/12)", load: () => "page 4" },
  ]
  const view = {
    book: { sections },
    renderer: {
      getContents: () => [{ index: renderedIndex, doc, overlayer }],
      async goTo(target: FoliateNavigationTarget | FoliateResolvedNavigation) {
        navigationTargets.push(target)
      },
    },
    // A missing manifest item remains in Foliate's package spine, so its native
    // CFI resolver is one renderer index ahead of the filtered sections array.
    resolveNavigation: () => ({ index: 4, anchor: () => range }),
    getProgressOf: (index: number) => ({ tocItem: { label: `Section ${index}` } }),
  }
  return { element, navigationTargets, overlayer, range, view }
}

const annotation = {
  value: "epubcfi(/6/10!/4/2,/1:0,/1:18)",
  text: "THE FOUNTAINHEAD",
  style: "highlight",
  color: "#fb7185",
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("Foliate annotation rendering", () => {
  test("paints on the canonical filtered section when Foliate resolves the next index", async () => {
    const { element, view } = createMalformedSpineView()

    await expect(renderFoliateAnnotation(view, annotation)).resolves.toEqual({
      index: 3,
      label: "Section 3",
    })
    expect(element.children).toHaveLength(1)
    expect(element.querySelector("g")?.getAttribute("fill")).toBe("#fb7185")
  })

  test("paints when CFI navigation labels the canonical document with the native spine index", async () => {
    const { element, view } = createMalformedSpineView(4)

    await expect(renderFoliateAnnotation(view, annotation, 4)).resolves.toEqual({
      index: 3,
      label: "Section 3",
    })
    expect(element.children).toHaveLength(1)
    expect(element.querySelector("g")?.getAttribute("fill")).toBe("#fb7185")
  })

  test("removes the canonical annotation by its persisted CFI", async () => {
    const { element, view } = createMalformedSpineView()
    await renderFoliateAnnotation(view, annotation)

    await removeFoliateAnnotation(view, annotation)

    expect(element.children).toHaveLength(0)
  })

  test("reveals the canonical section while preserving the CFI range anchor", async () => {
    const { navigationTargets, range, view } = createMalformedSpineView()

    await expect(revealFoliateAnnotation(view, annotation)).resolves.toBe(range)
    expect(navigationTargets).toEqual([
      {
        index: 3,
        anchor: expect.any(Function),
      },
    ])
  })
})
