import { afterEach, describe, expect, test } from "bun:test"
import {
  captureRenderedTextSelection,
  resolveRenderedTextRange,
} from "@/lib/citations/rendered-text"
import { CITATION_HIGHLIGHT_NAME, revealCitationRange } from "@/lib/citations/highlight"

afterEach(() => {
  document.body.replaceChildren()
  window.getSelection()?.removeAllRanges()
})

function requireTextNode(element: Element | null): Text {
  const node = element?.firstChild
  if (!(node instanceof Text)) {
    throw new Error("expected fixture text node")
  }
  return node
}

describe("citation rendered text", () => {
  test("reveals a range through its owner document highlight registry", () => {
    const iframe = document.createElement("iframe")
    document.body.append(iframe)
    const citationDocument = iframe.contentDocument
    const citationWindow = iframe.contentWindow
    if (!citationDocument || !citationWindow) throw new Error("expected iframe document")
    const paragraph = citationDocument.createElement("p")
    paragraph.textContent = "A cited passage"
    paragraph.scrollIntoView = () => undefined
    citationDocument.body.append(paragraph)
    const range = citationDocument.createRange()
    range.selectNodeContents(paragraph)
    const registry = new Map<string, unknown>()
    class TestHighlight {
      constructor(readonly target: Range) {}
    }
    Object.defineProperty(citationWindow, "CSS", {
      configurable: true,
      value: { highlights: registry },
    })
    Object.defineProperty(citationWindow, "Highlight", {
      configurable: true,
      value: TestHighlight,
    })

    revealCitationRange(range)

    expect(registry.get(CITATION_HIGHLIGHT_NAME)).toMatchObject({ target: range })
  })

  test("captures and resolves a selection inside a contenteditable source root", () => {
    const root = document.createElement("div")
    root.contentEditable = "true"
    root.innerHTML = "<p>Alpha <strong>selected</strong> text.</p>"
    document.body.append(root)

    const start = requireTextNode(root.querySelector("strong"))
    const trailingText = root.querySelector("p")?.lastChild
    if (!trailingText || trailingText.nodeType !== trailingText.TEXT_NODE) {
      throw new Error("expected trailing fixture text")
    }
    const range = document.createRange()
    range.setStart(start, 0)
    range.setEnd(trailingText, 5)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    const captured = captureRenderedTextSelection(root, selection)
    expect(captured?.excerpt).toBe("selected text")
    if (!captured) throw new Error("expected contenteditable selection to be captured")

    root.innerHTML = "<p>New intro. Alpha <strong>selected</strong> text.</p>"
    const resolved = resolveRenderedTextRange(root, captured.excerpt, captured.selector)
    expect(resolved?.toString()).toBe("selected text")
  })
})
