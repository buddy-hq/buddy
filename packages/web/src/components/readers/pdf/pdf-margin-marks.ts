import type { ReaderMarginMark, ReaderMarginMarkPosition } from "../reader-types"
import { surfaceSlotPosition } from "../utils/use-margin-mark-positions"
import { viewportBoundsFromPdfQuad, type PdfPageGeometryProvider } from "./pdf-geometry"

const PDF_MARGIN_INSET_PX = 16

function measurePdfMarginMark(input: {
  mark: ReaderMarginMark
  session: PdfPageGeometryProvider
  surface: DOMRect
  viewport: DOMRect
}): ReaderMarginMarkPosition | undefined {
  const { mark } = input
  if (mark.anchor.kind !== "pdf-text") return undefined
  for (const segment of mark.anchor.segments) {
    const geometry = input.session.getPageGeometry(segment.pageIndex)
    if (!geometry) continue
    const text = geometry.textLayerDiv.getBoundingClientRect()
    const page = geometry.div.getBoundingClientRect()
    for (const quad of segment.quads) {
      const bounds = viewportBoundsFromPdfQuad(quad, geometry.viewport, geometry.cropBoxOrigin)
      if (!bounds || bounds.height <= 0) continue
      const top = text.top + bounds.top
      if (top + bounds.height <= input.viewport.top || top >= input.viewport.bottom) continue
      const position = surfaceSlotPosition({
        id: mark.id,
        surface: input.surface,
        line: { top, height: bounds.height },
        x: Math.min(page.right, input.viewport.right) - PDF_MARGIN_INSET_PX,
      })
      if (position) return position
    }
  }
  return undefined
}

export function measurePdfMarginMarks(input: {
  marks: readonly ReaderMarginMark[]
  session: PdfPageGeometryProvider
  surface: HTMLElement
  viewport: HTMLElement
}): readonly ReaderMarginMarkPosition[] {
  const surface = input.surface.getBoundingClientRect()
  const viewport = input.viewport.getBoundingClientRect()
  return input.marks
    .map((mark) => measurePdfMarginMark({ mark, session: input.session, surface, viewport }))
    .filter((position) => position !== undefined)
}
