import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ReaderAnnotationPopover } from "../src/components/readers/ui/reader-annotation-popover"
import {
  ReaderFloatingOverlay,
  READER_FLOATING_OVERLAY_Z_INDEX,
} from "../src/components/readers/ui/reader-floating-overlay"
import { ReaderSelectionToolbar } from "../src/components/readers/ui/reader-selection-toolbar"

async function flushEffects() {
  await Promise.resolve()
}

function requireElement<TElement extends Element>(element: TElement | null): TElement {
  if (!element) {
    throw new Error("Expected element to exist")
  }

  return element
}

describe("reader floating overlays", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  test("portals reader action overlays into the reader stacking context", async () => {
    const anchorRoot = document.createElement("div")
    Object.defineProperty(anchorRoot, "getBoundingClientRect", {
      value: () => ({
        bottom: 580,
        height: 500,
        left: 48,
        right: 768,
        top: 80,
        width: 720,
        x: 48,
        y: 80,
        toJSON: () => ({}),
      }),
    })
    document.body.appendChild(anchorRoot)

    await act(async () => {
      root.render(
        <div>
          <ReaderSelectionToolbar
            anchorRoot={anchorRoot}
            selectionAction={{
              text: "Heading 1",
              x: 72,
              y: 120,
            }}
            onCopyText={() => undefined}
            onHighlight={() => undefined}
            onOpenAnnotationDialog={() => undefined}
            onSearch={() => undefined}
            onClose={() => undefined}
          />
          <ReaderAnnotationPopover
            anchorRoot={anchorRoot}
            popover={{ annotationId: "annotation-1", x: 90, y: 150 }}
            annotations={[
              {
                id: "annotation-1",
                anchor: { kind: "cfi-text", cfi: "epubcfi(/6/4)" },
                text: "Selected text",
                note: "",
                style: "highlight",
                color: "sky",
                created: "2026-07-13T00:00:00.000Z",
                modified: "2026-07-13T00:00:00.000Z",
              },
            ]}
            onEditAnnotation={() => undefined}
            onDeleteAnnotation={() => undefined}
          />
        </div>,
      )
      await flushEffects()
    })

    const selectionToolbar = requireElement(
      document.body.querySelector<HTMLElement>('[data-component="reader-selection-toolbar"]'),
    )
    const annotationPopover = requireElement(
      document.body.querySelector<HTMLElement>('[data-component="reader-annotation-popover"]'),
    )

    expect(anchorRoot.contains(selectionToolbar)).toBe(true)
    expect(anchorRoot.contains(annotationPopover)).toBe(true)
    expect(selectionToolbar.style.position).toBe("absolute")
    expect(selectionToolbar.style.left).toBe("72px")
    expect(selectionToolbar.style.top).toBe("120px")
    expect(selectionToolbar.style.zIndex).toBe(String(READER_FLOATING_OVERLAY_Z_INDEX))
    expect(annotationPopover.style.position).toBe("absolute")
    expect(annotationPopover.style.left).toBe("90px")
    expect(annotationPopover.style.top).toBe("150px")
    expect(annotationPopover.style.zIndex).toBe(String(READER_FLOATING_OVERLAY_Z_INDEX))
    expect(requireElement(document.body.querySelector('[aria-label="Copy"]'))).not.toBeNull()
    expect(requireElement(document.body.querySelector('[aria-label="Amber"]'))).not.toBeNull()
    expect(requireElement(document.body.querySelector('[aria-label="Delete"]'))).not.toBeNull()
  })

  test("falls back to local absolute positioning before the reader surface is available", async () => {
    await act(async () => {
      root.render(
        <ReaderFloatingOverlay
          anchorRoot={null}
          dataComponent="foliate-floating-overlay-probe"
          className="probe"
          x={24}
          y={32}
        >
          Probe
        </ReaderFloatingOverlay>,
      )
      await flushEffects()
    })

    const probe = requireElement(
      container.querySelector<HTMLElement>('[data-component="foliate-floating-overlay-probe"]'),
    )
    expect(probe.style.position).toBe("absolute")
    expect(probe.style.left).toBe("24px")
    expect(probe.style.top).toBe("32px")
  })

  test("keeps the selection pill compact and clear of its text anchor", async () => {
    await act(async () => {
      root.render(
        <ReaderSelectionToolbar
          anchorRoot={null}
          selectionAction={{ text: "Selected text", x: 72, y: 120 }}
          onCopyText={() => undefined}
          onHighlight={() => undefined}
          onOpenAnnotationDialog={() => undefined}
          onSearch={() => undefined}
        />,
      )
      await flushEffects()
    })

    const overlay = requireElement(
      container.querySelector<HTMLElement>('[data-component="reader-selection-toolbar"]'),
    )
    const toolbar = requireElement(overlay.querySelector<HTMLElement>('[role="toolbar"]'))
    const action = requireElement(
      toolbar.querySelector<HTMLButtonElement>('[aria-label="Add note"]'),
    )
    expect(overlay.classList.contains("pb-4")).toBe(true)
    expect(toolbar.classList.contains("py-1.5")).toBe(true)
    expect(action.classList.contains("size-8")).toBe(true)
  })

  test("commits the color dot as a highlight action", async () => {
    const highlightedColors: string[] = []
    await act(async () => {
      root.render(
        <ReaderSelectionToolbar
          anchorRoot={null}
          selectionAction={{ text: "Selected text", x: 72, y: 120 }}
          onCopyText={() => undefined}
          onHighlight={(color) => highlightedColors.push(color)}
          onOpenAnnotationDialog={() => undefined}
          onSearch={() => undefined}
        />,
      )
      await flushEffects()
    })

    const rose = requireElement(container.querySelector<HTMLButtonElement>('[aria-label="Rose"]'))
    const amber = requireElement(container.querySelector<HTMLButtonElement>('[aria-label="Amber"]'))
    expect(amber.hasAttribute("aria-pressed")).toBe(false)
    expect(amber.classList.contains("ring-2")).toBe(false)
    await act(async () => {
      rose.click()
      await flushEffects()
    })
    expect(highlightedColors).toEqual(["rose"])
  })

  test("keeps a wide selection menu inside the reader while preserving its anchor", async () => {
    const anchorRoot = document.createElement("div")
    Object.defineProperty(anchorRoot, "getBoundingClientRect", {
      value: () => ({
        bottom: 580,
        height: 500,
        left: 48,
        right: 768,
        top: 80,
        width: 720,
        x: 48,
        y: 80,
        toJSON: () => ({}),
      }),
    })
    document.body.appendChild(anchorRoot)
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.component === "reader-selection-toolbar") {
          return {
            bottom: 180,
            height: 60,
            left: 700,
            right: 900,
            top: 120,
            width: 200,
            x: 700,
            y: 120,
            toJSON: () => ({}),
          }
        }
        return originalGetBoundingClientRect.call(this)
      },
    })

    try {
      await act(async () => {
        root.render(
          <ReaderSelectionToolbar
            anchorRoot={anchorRoot}
            selectionAction={{ text: "Heading 1", x: 752, y: 120 }}
            onCopyText={() => undefined}
            onHighlight={() => undefined}
            onOpenAnnotationDialog={() => undefined}
            onSearch={() => undefined}
            onClose={() => undefined}
          />,
        )
        await flushEffects()
      })

      const selectionToolbar = requireElement(
        document.body.querySelector<HTMLElement>('[data-component="reader-selection-toolbar"]'),
      )
      expect(selectionToolbar.style.marginLeft).toBe("-140px")
      expect(
        selectionToolbar.style.getPropertyValue("--reader-floating-overlay-anchor-offset-x"),
      ).toBe("140px")
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      })
    }
  })
})
