import type { PdfReaderMode } from "../reader-types"

export const PDF_PAGE_TURN_PREVIOUS = -1 as const
export const PDF_PAGE_TURN_NEXT = 1 as const

const PDF_SCROLL_BOUNDARY_EPSILON_PX = 2

type ResolvePdfWheelPageTurnInput = {
  isPageMode: boolean
  deltaX: number
  deltaY: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export function resolvePdfWheelPageTurn(
  input: ResolvePdfWheelPageTurnInput,
): typeof PDF_PAGE_TURN_PREVIOUS | typeof PDF_PAGE_TURN_NEXT | undefined {
  if (
    !input.isPageMode ||
    !Number.isFinite(input.deltaX) ||
    !Number.isFinite(input.deltaY) ||
    Math.abs(input.deltaY) <= Math.abs(input.deltaX)
  ) {
    return undefined
  }

  if (input.deltaY < 0 && input.scrollTop <= PDF_SCROLL_BOUNDARY_EPSILON_PX) {
    return PDF_PAGE_TURN_PREVIOUS
  }
  if (
    input.deltaY > 0 &&
    input.scrollHeight - input.clientHeight - input.scrollTop <= PDF_SCROLL_BOUNDARY_EPSILON_PX
  ) {
    return PDF_PAGE_TURN_NEXT
  }

  return undefined
}

export function pdfModeAfterViewerScaleChange(
  mode: PdfReaderMode,
  scale: number,
  presetValue: string | undefined,
): PdfReaderMode {
  if (presetValue !== undefined) return mode
  return { ...mode, scaleMode: "custom", scale }
}

export function shouldShowPdfPageTurnControls(
  mode: PdfReaderMode,
  hasLayoutFallback: boolean,
): boolean {
  return mode.layout !== "continuous" || hasLayoutFallback
}
