import { describe, expect, test } from "bun:test"
import {
  resolveBenchCenteredScroll,
  resolveBenchFitZoom,
  resolveBenchZoomableCanvasMetrics,
} from "../src/components/bench/bench-viewer-shell"

describe("bench viewer math", () => {
  test("fits zoomable content to the bench viewport with padding", () => {
    const zoom = resolveBenchFitZoom({
      viewportSize: { width: 1_200, height: 900 },
      contentSize: { width: 1_000, height: 500 },
      canvasPadding: 32,
    })

    expect(zoom).toBe(1.136)
  })

  test("keeps zoomable content centered inside a larger pannable canvas", () => {
    const metrics = resolveBenchZoomableCanvasMetrics({
      viewportSize: { width: 1_000, height: 800 },
      contentSize: { width: 400, height: 300 },
      zoom: 2,
      canvasPadding: 32,
      panOverscan: 512,
    })

    expect(metrics).toEqual({
      canvasWidth: 2_024,
      canvasHeight: 1_824,
      contentOffsetX: 612,
      contentOffsetY: 612,
      renderedWidth: 800,
      renderedHeight: 600,
    })
    expect(
      resolveBenchCenteredScroll({
        viewportSize: { width: 1_000, height: 800 },
        metrics,
      }),
    ).toEqual({ left: 512, top: 512 })
  })
})
