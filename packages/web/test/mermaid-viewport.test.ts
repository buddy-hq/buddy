import { describe, expect, test } from "bun:test"
import { mermaidConstants } from "../src/components/chat/tools/render/mermaid/constants"
import { resolveMermaidAutoZoom } from "../src/components/chat/tools/render/mermaid/use-mermaid-viewport"

describe("mermaid viewport auto zoom", () => {
  test("keeps compact diagrams at width-fit zoom in responsive mode", () => {
    const zoom = resolveMermaidAutoZoom({
      defaultZoomMode: "responsive",
      svgBounds: {
        width: 180,
        height: 420,
      },
      viewportSize: {
        width: 320,
        height: 512,
      },
      canvasPadding: mermaidConstants.viewport.INLINE_CANVAS_PADDING,
      responsiveAutoZoomStrategy: {
        minimumRenderedHeight: mermaidConstants.viewport.INLINE_AUTO_MIN_RENDERED_HEIGHT,
        maxViewportWidths: mermaidConstants.viewport.INLINE_AUTO_MAX_VIEWPORT_WIDTHS,
      },
    })

    expect(zoom).toBe(1)
  })

  test("increases auto zoom for very wide shallow diagrams to preserve readable height", () => {
    const zoom = resolveMermaidAutoZoom({
      defaultZoomMode: "responsive",
      svgBounds: {
        width: 1200,
        height: 100,
      },
      viewportSize: {
        width: 960,
        height: 512,
      },
      canvasPadding: mermaidConstants.viewport.INLINE_CANVAS_PADDING,
      responsiveAutoZoomStrategy: {
        minimumRenderedHeight: mermaidConstants.viewport.INLINE_AUTO_MIN_RENDERED_HEIGHT,
        maxViewportWidths: mermaidConstants.viewport.INLINE_AUTO_MAX_VIEWPORT_WIDTHS,
      },
    })

    expect(zoom).toBeGreaterThan(0.75)
    expect(zoom).toBe(2.4)
  })

  test("caps wide-diagram auto zoom by the maximum overflow width budget", () => {
    const zoom = resolveMermaidAutoZoom({
      defaultZoomMode: "responsive",
      svgBounds: {
        width: 3000,
        height: 100,
      },
      viewportSize: {
        width: 960,
        height: 512,
      },
      canvasPadding: mermaidConstants.viewport.INLINE_CANVAS_PADDING,
      responsiveAutoZoomStrategy: {
        minimumRenderedHeight: mermaidConstants.viewport.INLINE_AUTO_MIN_RENDERED_HEIGHT,
        maxViewportWidths: mermaidConstants.viewport.INLINE_AUTO_MAX_VIEWPORT_WIDTHS,
      },
    })

    expect(zoom).toBe(1.52)
  })
})
