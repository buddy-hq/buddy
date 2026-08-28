import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { PdfTextAnchor } from "@buddy/reader-contract"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FoliateReader } from "../src/components/readers/foliate-reader"
import { ReaderNavigationTree } from "../src/components/readers/ui/reader-navigation-tree"
import { ReaderProgressScrubber } from "../src/components/readers/ui/reader-progress-scrubber"
import { ReaderSearchPanel } from "../src/components/readers/ui/reader-search-panel"
import { ReaderSelectionToolbar } from "../src/components/readers/ui/reader-selection-toolbar"

async function flushEffects(): Promise<void> {
  await Promise.resolve()
}

function requireElement<TElement extends Element>(element: TElement | null): TElement {
  if (!element) throw new Error("Expected element to exist")
  return element
}

function setRangeInputValue(input: HTMLInputElement, value: number): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!valueSetter) throw new Error("Expected the range input value setter to exist")
  valueSetter.call(input, String(value))
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("shared reader UI", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    document.body.replaceChildren()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("navigates nested outlines by opaque reader IDs and marks the active location", async () => {
    const onSelect = mock(() => undefined)

    await act(async () => {
      root.render(
        <ReaderNavigationTree
          items={[
            {
              id: "pdf-outline:chapter-one",
              label: "Chapter one",
              subitems: [
                {
                  id: "pdf-outline:chapter-one:section-a",
                  label: "Section A",
                  description: "Page 2",
                  subitems: [],
                },
              ],
            },
          ]}
          activeItemId="pdf-outline:chapter-one:section-a"
          onSelect={onSelect}
        />,
      )
      await flushEffects()
    })

    const active = requireElement(
      container.querySelector<HTMLButtonElement>('[aria-current="location"]'),
    )
    expect(active.textContent).toContain("Section A")
    expect(active.textContent).toContain("Page 2")

    await act(async () => {
      active.click()
      await flushEffects()
    })
    expect(onSelect).toHaveBeenCalledWith("pdf-outline:chapter-one:section-a")
  })

  test("routes the engine-neutral selection actions without losing selected text", async () => {
    const onCopyText = mock(() => undefined)
    const onHighlight = mock(() => undefined)
    const onOpenAnnotationDialog = mock(() => undefined)
    const onSearch = mock(() => undefined)
    const selectedText = "Selection spanning PDF text layers"

    await act(async () => {
      root.render(
        <ReaderSelectionToolbar
          anchorRoot={null}
          selectionAction={{ text: selectedText, x: 24, y: 32 }}
          onCopyText={onCopyText}
          onHighlight={onHighlight}
          onOpenAnnotationDialog={onOpenAnnotationDialog}
          onSearch={onSearch}
        />,
      )
      await flushEffects()
    })

    const labels = ["Amber", "Add note", "Copy", "Search for this"]
    for (const label of labels) {
      const button = requireElement(
        container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`),
      )
      await act(async () => {
        button.click()
        await flushEffects()
      })
    }

    expect(onCopyText).toHaveBeenCalledWith(selectedText)
    expect(onHighlight).toHaveBeenCalledTimes(1)
    expect(onOpenAnnotationDialog).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith(selectedText)
    expect(container.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "Selection actions",
    )
  })

  test("shows PDF page labels beside search excerpts and opens the exact result", async () => {
    const onShowResult = mock(() => undefined)
    const inputRef = createRef<HTMLInputElement>()
    const anchor: PdfTextAnchor = {
      kind: "pdf-text",
      segments: [
        {
          pageIndex: 1,
          quads: [
            {
              topLeft: { x: 10, y: 20 },
              topRight: { x: 40, y: 20 },
              bottomRight: { x: 40, y: 30 },
              bottomLeft: { x: 10, y: 30 },
            },
          ],
        },
      ],
      quote: { exact: "search match" },
    }

    await act(async () => {
      root.render(
        <ReaderSearchPanel
          search={{
            query: "search",
            scope: "document",
            matchCase: false,
            matchWholeWords: false,
            matchDiacritics: false,
            running: false,
            progress: 1,
            activeResultId: "result-1",
            rows: [
              {
                id: "result-1",
                kind: "result",
                result: {
                  id: "result-1",
                  label: "Page Sheet 7",
                  anchor,
                  excerpt: { pre: "before ", match: "search", post: " after" },
                },
              },
            ],
          }}
          onQueryChange={() => undefined}
          onRunSearch={() => undefined}
          onCycleResults={() => undefined}
          onScopeChange={() => undefined}
          onMatchCaseChange={() => undefined}
          onMatchWholeWordsChange={() => undefined}
          onMatchDiacriticsChange={() => undefined}
          onShowResult={onShowResult}
          inputRef={inputRef}
          viewportRef={createRef<HTMLDivElement>()}
          ready
        />,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("Page Sheet 7")
    expect(inputRef.current).toBe(
      container.querySelector<HTMLInputElement>('input[aria-label="Search this document"]'),
    )
    const result = requireElement(
      container.querySelector<HTMLButtonElement>('button[aria-current="true"]'),
    )
    await act(async () => {
      result.click()
      await flushEffects()
    })
    expect(onShowResult).toHaveBeenCalledWith(anchor)
  })

  test("keeps EPUB controls on app theme tokens while scoping publication appearance", async () => {
    await act(async () => {
      root.render(<FoliateReader source={null} defaultTheme="night" />)
      await flushEffects()
    })

    const reader = requireElement(
      container.querySelector<HTMLElement>('[data-component="foliate-reader"]'),
    )
    expect(reader.dataset.readerTheme).toBe("night")
    expect(reader.dataset.appearance).toBe("dark")
    expect(reader.hasAttribute("data-theme")).toBe(false)
    expect(reader.classList.contains("bg-surface-base")).toBe(true)
    expect(reader.classList.contains("text-text-base")).toBe(true)
  })

  test("shares accessible pointer and keyboard progress commits across reader engines", async () => {
    const onPreview = mock((_value: number) => undefined)
    const onCommit = mock((_value: number) => undefined)
    const onCancel = mock(() => undefined)

    await act(async () => {
      root.render(
        <ReaderProgressScrubber
          value={25}
          max={100}
          onPreview={onPreview}
          onCommit={onCommit}
          onCancel={onCancel}
        />,
      )
      await flushEffects()
    })

    const scrubber = requireElement(
      container.querySelector<HTMLInputElement>('input[type="range"]'),
    )
    expect(scrubber.getAttribute("aria-label")).toBe("Reading progress")
    expect(scrubber.getAttribute("aria-valuetext")).toBe("25%")

    await act(async () => {
      setRangeInputValue(scrubber, 40)
      scrubber.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }))
      scrubber.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))

      setRangeInputValue(scrubber, 70)
      scrubber.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))

      setRangeInputValue(scrubber, 80)
      scrubber.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }))
      scrubber.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      await flushEffects()
    })

    expect(onPreview).toHaveBeenCalledWith(40)
    expect(onPreview).toHaveBeenCalledWith(70)
    expect(onPreview).toHaveBeenCalledWith(80)
    expect(onCommit.mock.calls).toEqual([[40], [70]])
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
