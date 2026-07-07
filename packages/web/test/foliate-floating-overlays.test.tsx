import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FoliateAnnotationPopover } from "../src/components/readers/ui/foliate-annotation-popover"
import {
  FoliateFloatingOverlay,
  FOLIATE_FLOATING_OVERLAY_Z_INDEX,
} from "../src/components/readers/ui/foliate-floating-overlay"
import { FoliateSelectionToolbar } from "../src/components/readers/ui/foliate-selection-toolbar"

async function flushEffects() {
  await Promise.resolve()
}

function requireElement<TElement extends Element>(element: TElement | null): TElement {
  if (!element) {
    throw new Error("Expected element to exist")
  }

  return element
}

describe("Foliate floating overlays", () => {
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

  test("portals reader action overlays above adjacent chat surfaces", async () => {
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
    container.appendChild(anchorRoot)

    await act(async () => {
      root.render(
        <div>
          <FoliateSelectionToolbar
            anchorRoot={anchorRoot}
            selectionAction={{
              text: "Heading 1",
              cfi: "epubcfi(/6/2)",
              x: 72,
              y: 120,
            }}
            onCopyText={() => undefined}
            onHighlight={() => undefined}
            onOpenAnnotationDialog={() => undefined}
            onSearch={() => undefined}
            onClose={() => undefined}
          />
          <FoliateAnnotationPopover
            anchorRoot={anchorRoot}
            popover={{ value: "epubcfi(/6/4)", x: 90, y: 150 }}
            annotations={[]}
            onOpenAnnotationDialog={() => undefined}
            onDeleteAnnotation={() => undefined}
          />
        </div>,
      )
      await flushEffects()
    })

    const selectionToolbar = requireElement(
      document.body.querySelector<HTMLElement>('[data-component="foliate-selection-toolbar"]'),
    )
    const annotationPopover = requireElement(
      document.body.querySelector<HTMLElement>('[data-component="foliate-annotation-popover"]'),
    )

    expect(container.contains(selectionToolbar)).toBe(false)
    expect(container.contains(annotationPopover)).toBe(false)
    expect(selectionToolbar.style.position).toBe("fixed")
    expect(selectionToolbar.style.left).toBe("120px")
    expect(selectionToolbar.style.top).toBe("200px")
    expect(selectionToolbar.style.zIndex).toBe(String(FOLIATE_FLOATING_OVERLAY_Z_INDEX))
    expect(annotationPopover.style.position).toBe("fixed")
    expect(annotationPopover.style.left).toBe("138px")
    expect(annotationPopover.style.top).toBe("230px")
    expect(annotationPopover.style.zIndex).toBe(String(FOLIATE_FLOATING_OVERLAY_Z_INDEX))
    expect(requireElement(document.body.querySelector('[aria-label="Copy text"]'))).not.toBeNull()
    expect(document.body.textContent).toContain("Highlight")
    expect(document.body.textContent).toContain("Delete")
  })

  test("falls back to local absolute positioning before the reader surface is available", async () => {
    await act(async () => {
      root.render(
        <FoliateFloatingOverlay
          anchorRoot={null}
          dataComponent="foliate-floating-overlay-probe"
          className="probe"
          x={24}
          y={32}
        >
          Probe
        </FoliateFloatingOverlay>,
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
})
