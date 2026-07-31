import { describe, expect, test } from "bun:test"
import {
  DEFAULT_WHITEBOARD_PANEL_PLACEMENT,
  toggleWhiteboardPanelPlacement,
  WHITEBOARD_PANEL_PLACEMENT_CSS,
} from "../src/components/whiteboard/whiteboard-panel-placement"

describe("toggleWhiteboardPanelPlacement", () => {
  test("round-trips between the two placements", () => {
    expect(toggleWhiteboardPanelPlacement("left")).toBe("bottom")
    expect(toggleWhiteboardPanelPlacement("bottom")).toBe("left")
  })

  test("defaults to Excalidraw's own left column", () => {
    expect(DEFAULT_WHITEBOARD_PANEL_PLACEMENT).toBe("left")
  })
})

describe("WHITEBOARD_PANEL_PLACEMENT_CSS", () => {
  test("only ever applies under the bottom placement", () => {
    // Left placement must remain stock Excalidraw, untouched by anything in this stylesheet.
    const selectors = WHITEBOARD_PANEL_PLACEMENT_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .slice(0, -1)
      .map((block) => block.split("}").at(-1)?.trim() ?? "")
      .filter((selector) => selector.length > 0)

    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector).toStartWith(
        '[data-component="whiteboard-canvas"][data-panel-placement="bottom"]',
      )
    }
  })

  test("keeps every stock section rather than hiding any", () => {
    // Parity is the reason for laying the panel out instead of rebuilding it: hiding a section
    // here would silently drop options that the left placement still offers.
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).not.toMatch(/display:\s*none/)
  })

  test("wraps the sections into bands rather than one long strip", () => {
    // A fixed band count overflows the board and clips the sections that fall off the end.
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/flex-flow:\s*row wrap/)
  })

  test("gives the swatch row an explicit gap", () => {
    // Excalidraw spreads swatches with space-between, which collapses to zero once the section
    // shrinks to its content — that is what made the colours touch.
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/\.color-picker__top-picks\s*\{[^}]*gap:/)
  })

  test("puts each section on its own surface so the caption groups with its controls", () => {
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/\.panelColumn > \*\s*\{[^}]*background-color:/)
  })

  test("aligns controls across a band, not the section boxes", () => {
    // Excalidraw's vertical text-align row has no caption; top-aligning the boxes would leave
    // captioned sections' buttons sitting a caption lower than their neighbours'.
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/align-items:\s*stretch/)
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(
      /\.panelColumn > \*\s*\{[^}]*justify-content:\s*flex-end/,
    )
  })

  test("sizes the dock to its content and caps its height", () => {
    // Edge-to-edge and unbounded height are the two failure modes this layout exists to avoid.
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/width:\s*max-content/)
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/max-height:/)
  })

  test("clears the zoom and undo cluster Excalidraw parks at the bottom", () => {
    expect(WHITEBOARD_PANEL_PLACEMENT_CSS).toMatch(/bottom:\s*calc\([^)]*--lg-button-size/)
  })
})
