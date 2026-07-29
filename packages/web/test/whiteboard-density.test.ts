import { describe, expect, test } from "bun:test"
import {
  resolveWhiteboardDensity,
  WHITEBOARD_COMPACT_DENSITY_CSS,
  WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX,
} from "../src/components/whiteboard/whiteboard-density"

describe("resolveWhiteboardDensity", () => {
  test("compacts a board narrower than the stock chrome needs", () => {
    expect(resolveWhiteboardDensity(WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX - 1)).toBe("compact")
  })

  test("treats the threshold itself as compact", () => {
    expect(resolveWhiteboardDensity(WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX)).toBe("compact")
  })

  test("leaves a wide board comfortable", () => {
    expect(resolveWhiteboardDensity(WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX + 1)).toBe("comfortable")
  })

  test("stays comfortable while the board is unmeasured", () => {
    // A first-frame or detached node reads 0; compacting there would flash the chrome.
    expect(resolveWhiteboardDensity(0)).toBe("comfortable")
    expect(resolveWhiteboardDensity(Number.NaN)).toBe("comfortable")
  })
})

describe("WHITEBOARD_COMPACT_DENSITY_CSS", () => {
  test("scopes every rule to the compact whiteboard root", () => {
    const selectors = WHITEBOARD_COMPACT_DENSITY_CSS.replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .slice(0, -1)
      .map((block) => block.split("}").at(-1)?.trim() ?? "")
      .filter((selector) => selector.length > 0)

    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector).toStartWith('[data-component="whiteboard-canvas"][data-density="compact"]')
    }
  })

  test("never constrains the style panel width", () => {
    // Excalidraw sizes the panel's rows to fill its stock 12.5rem. Narrowing it wraps the swatches,
    // font family, font size, layers, and actions onto extra lines, so the panel grows taller and
    // reads as cramped — the opposite of the goal. Scale is the only lever.
    expect(WHITEBOARD_COMPACT_DENSITY_CSS).not.toMatch(/width:/)
  })
})
