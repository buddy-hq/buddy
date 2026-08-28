import { describe, expect, test } from "bun:test"
import {
  DEFAULT_WHITEBOARD_PANEL_PLACEMENT,
  toggleWhiteboardPanelPlacement,
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
