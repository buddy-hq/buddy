import { describe, expect, test } from "bun:test"
import {
  PDF_PAGE_TURN_NEXT,
  PDF_PAGE_TURN_PREVIOUS,
  pdfModeAfterViewerScaleChange,
  resolvePdfWheelPageTurn,
  shouldShowPdfPageTurnControls,
} from "../src/components/readers/pdf/pdf-viewer-mode"
import type { PdfReaderMode } from "../src/components/readers/reader-types"

const FIT_WIDTH_MODE: PdfReaderMode = {
  layout: "continuous",
  scaleMode: "fit-width",
  rotation: 0,
}

describe("PDF viewer scale mode", () => {
  test("promotes direct zoom changes to a persistent custom scale", () => {
    expect(pdfModeAfterViewerScaleChange(FIT_WIDTH_MODE, 1.1, undefined)).toEqual({
      ...FIT_WIDTH_MODE,
      scaleMode: "custom",
      scale: 1.1,
    })
  })

  test("keeps the requested mode for PDF.js preset scale events", () => {
    expect(pdfModeAfterViewerScaleChange(FIT_WIDTH_MODE, 1, "page-width")).toBe(FIT_WIDTH_MODE)
  })
})

describe("PDF single-page wheel navigation", () => {
  test("turns pages when vertical wheel input continues past a page boundary", () => {
    expect(
      resolvePdfWheelPageTurn({
        isPageMode: true,
        deltaX: 0,
        deltaY: 24,
        scrollTop: 600,
        scrollHeight: 1_000,
        clientHeight: 400,
      }),
    ).toBe(PDF_PAGE_TURN_NEXT)
    expect(
      resolvePdfWheelPageTurn({
        isPageMode: true,
        deltaX: 0,
        deltaY: -24,
        scrollTop: 0,
        scrollHeight: 1_000,
        clientHeight: 400,
      }),
    ).toBe(PDF_PAGE_TURN_PREVIOUS)
  })

  test("preserves native panning inside a page and for horizontal wheel input", () => {
    expect(
      resolvePdfWheelPageTurn({
        isPageMode: true,
        deltaX: 0,
        deltaY: 24,
        scrollTop: 300,
        scrollHeight: 1_000,
        clientHeight: 400,
      }),
    ).toBeUndefined()
    expect(
      resolvePdfWheelPageTurn({
        isPageMode: true,
        deltaX: 24,
        deltaY: 8,
        scrollTop: 600,
        scrollHeight: 1_000,
        clientHeight: 400,
      }),
    ).toBeUndefined()
  })

  test("does not intercept wheel input in continuous mode", () => {
    expect(
      resolvePdfWheelPageTurn({
        isPageMode: false,
        deltaX: 0,
        deltaY: 24,
        scrollTop: 600,
        scrollHeight: 1_000,
        clientHeight: 400,
      }),
    ).toBeUndefined()
  })
})

describe("PDF page-turn controls", () => {
  test("shows page controls when PDF.js forces continuous mode into page mode", () => {
    expect(shouldShowPdfPageTurnControls(FIT_WIDTH_MODE, true)).toBe(true)
    expect(shouldShowPdfPageTurnControls(FIT_WIDTH_MODE, false)).toBe(false)
  })
})
