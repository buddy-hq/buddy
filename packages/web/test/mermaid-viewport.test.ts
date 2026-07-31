import { describe, expect, test } from "bun:test"
import { createElement, createRef } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { mermaidConstants } from "../src/components/media/renderers/mermaid/constants"
import { MermaidInlineView } from "../src/components/media/renderers/mermaid/mermaid-inline-view"
import {
  resolveMermaidInitialZoomState,
  resolveMermaidAutoZoom,
  resolveMermaidCanvasMetrics,
  resolveMermaidCenteredScroll,
  type MermaidViewportController,
} from "../src/components/media/renderers/mermaid/use-mermaid-viewport"

describe("mermaid viewport auto zoom", () => {
  test("starts Bench diagrams at the default 100 percent zoom instead of auto", () => {
    expect(resolveMermaidInitialZoomState("bench")).toEqual({
      zoom: mermaidConstants.zoom.DEFAULT,
      isAutoZoom: false,
    })
    expect(resolveMermaidInitialZoomState(undefined)).toEqual({
      zoom: mermaidConstants.zoom.DEFAULT,
      isAutoZoom: true,
    })
  })

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

  test("centers diagrams inside a pannable bench canvas instead of pinning them left", () => {
    const metrics = resolveMermaidCanvasMetrics({
      renderedWidth: 300,
      renderedHeight: 600,
      viewportSize: { width: 1_200, height: 900 },
      canvasPadding: 32,
      panOverscan: 512,
    })

    expect(metrics).toEqual({
      canvasWidth: 2_224,
      canvasHeight: 1_924,
      contentOffsetX: 930,
      contentOffsetY: 630,
      contentWidth: 364,
      contentHeight: 664,
    })
    expect(
      resolveMermaidCenteredScroll({
        metrics,
        viewportSize: { width: 1_200, height: 900 },
      }),
    ).toEqual({ left: 512, top: 512 })
  })

  test("keeps short Bench diagrams taller than their vertical canvas padding", () => {
    const canvasPadding = 80
    const renderedWidth = 600.25
    const renderedHeight = 103.2
    const metrics = resolveMermaidCanvasMetrics({
      renderedWidth,
      renderedHeight,
      viewportSize: { width: 1_248, height: 900 },
      canvasPadding,
      panOverscan: 256,
    })
    const viewport = {
      viewportRef: createRef<HTMLDivElement>(),
      svgHostRef: createRef<HTMLDivElement>(),
      svgBounds: { width: renderedWidth, height: renderedHeight },
      renderedWidth,
      renderedHeight,
      svgHostWidth: metrics.contentWidth,
      svgHostHeight: metrics.contentHeight,
      canvasWidth: metrics.canvasWidth,
      canvasHeight: metrics.canvasHeight,
      contentOffsetX: metrics.contentOffsetX,
      contentOffsetY: metrics.contentOffsetY,
      canvasPadding,
      zoom: mermaidConstants.zoom.DEFAULT,
      zoomLabel: "100%",
      isAutoZoom: false,
      isInitialized: true,
      isDragging: false,
      canZoomIn: true,
      canZoomOut: true,
      handlePointerDown: () => {},
      zoomIn: () => {},
      zoomOut: () => {},
      resetZoom: () => {},
    } satisfies MermaidViewportController

    const markup = renderToStaticMarkup(
      createElement(MermaidInlineView, {
        ariaLabel: "A short agent loop",
        viewport,
      }),
    )

    expect(metrics.contentHeight).toBe(263.2)
    expect(markup).toContain("width:760.25px")
    expect(markup).toContain("height:263.2px")
    expect(markup).toContain("padding:80px")
  })
})
