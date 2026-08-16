import type { PdfPoint, PdfQuad } from "@buddy/reader-contract"

export type RectCoordinates = {
  left: number
  top: number
  right: number
  bottom: number
}

export type PdfCropBoxOrigin = {
  x: number
  y: number
}

export type PdfCropBox = {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}

export type PdfViewportGeometry = {
  width: number
  height: number
  convertToPdfPoint: (x: number, y: number) => unknown
  convertToViewportPoint: (x: number, y: number) => unknown
}

export type PdfPageViewGeometry = {
  div: HTMLDivElement
  textLayerDiv: HTMLDivElement
  viewport: PdfViewportGeometry
  cropBox: PdfCropBox
  cropBoxOrigin: PdfCropBoxOrigin
}

/** The slice of the viewer session that selection and overlay rendering need. */
export type PdfPageGeometryProvider = {
  getPageGeometry: (pageIndex: number) => PdfPageViewGeometry | undefined
  getPageLabel?: (pageIndex: number) => string
  getTocLabel?: (pageIndex: number) => string | undefined
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function readCoordinatePair(value: unknown): PdfPoint | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined
  const x = value[0]
  const y = value[1]
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return undefined
  return { x, y }
}

function readCropBox(value: unknown): PdfCropBox | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined
  const xMin = value[0]
  const yMin = value[1]
  const xMax = value[2]
  const yMax = value[3]
  if (
    !isFiniteNumber(xMin) ||
    !isFiniteNumber(yMin) ||
    !isFiniteNumber(xMax) ||
    !isFiniteNumber(yMax) ||
    xMax <= xMin ||
    yMax <= yMin
  ) {
    return undefined
  }
  return { xMin, yMin, xMax, yMax }
}

function hasCoordinateConverter(
  value: Record<string, unknown>,
  key: "convertToPdfPoint" | "convertToViewportPoint",
): boolean {
  return typeof value[key] === "function"
}

export function readPdfPageViewGeometry(value: unknown): PdfPageViewGeometry | undefined {
  if (!isObjectRecord(value)) return undefined
  const div = value.div
  const textLayer = value.textLayer
  const viewport = value.viewport
  const pdfPage = value.pdfPage
  if (!(div instanceof HTMLDivElement)) return undefined
  if (!isObjectRecord(textLayer) || !(textLayer.div instanceof HTMLDivElement)) return undefined
  if (!isObjectRecord(viewport) || !isObjectRecord(pdfPage)) return undefined
  if (!isFiniteNumber(viewport.width) || !isFiniteNumber(viewport.height)) return undefined
  if (!hasCoordinateConverter(viewport, "convertToPdfPoint")) return undefined
  if (!hasCoordinateConverter(viewport, "convertToViewportPoint")) return undefined
  const cropBox = readCropBox(pdfPage.view)
  if (!cropBox) return undefined
  const cropBoxOrigin = { x: cropBox.xMin, y: cropBox.yMin }

  return {
    div,
    textLayerDiv: textLayer.div,
    cropBox,
    cropBoxOrigin,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      convertToPdfPoint: (x, y) => {
        const converter = viewport.convertToPdfPoint
        return typeof converter === "function" ? converter.call(viewport, x, y) : undefined
      },
      convertToViewportPoint: (x, y) => {
        const converter = viewport.convertToViewportPoint
        return typeof converter === "function" ? converter.call(viewport, x, y) : undefined
      },
    },
  }
}

function clippedRect(rect: RectCoordinates, bounds: RectCoordinates): RectCoordinates | undefined {
  const left = Math.max(rect.left, bounds.left)
  const top = Math.max(rect.top, bounds.top)
  const right = Math.min(rect.right, bounds.right)
  const bottom = Math.min(rect.bottom, bounds.bottom)
  if (right <= left || bottom <= top) return undefined
  return { left, top, right, bottom }
}

function cropRelativePoint(point: PdfPoint, cropBoxOrigin: PdfCropBoxOrigin): PdfPoint {
  return {
    x: point.x - cropBoxOrigin.x,
    y: point.y - cropBoxOrigin.y,
  }
}

function absolutePdfPoint(point: PdfPoint, cropBoxOrigin: PdfCropBoxOrigin): PdfPoint {
  return {
    x: point.x + cropBoxOrigin.x,
    y: point.y + cropBoxOrigin.y,
  }
}

export function pdfQuadFromClientRect(
  rect: RectCoordinates,
  textLayerBounds: RectCoordinates,
  viewport: PdfViewportGeometry,
  cropBoxOrigin: PdfCropBoxOrigin,
): PdfQuad | undefined {
  const clipped = clippedRect(rect, textLayerBounds)
  if (!clipped) return undefined

  const toPdfPoint = (x: number, y: number) => {
    const point = readCoordinatePair(
      viewport.convertToPdfPoint(x - textLayerBounds.left, y - textLayerBounds.top),
    )
    return point ? cropRelativePoint(point, cropBoxOrigin) : undefined
  }
  const topLeft = toPdfPoint(clipped.left, clipped.top)
  const topRight = toPdfPoint(clipped.right, clipped.top)
  const bottomRight = toPdfPoint(clipped.right, clipped.bottom)
  const bottomLeft = toPdfPoint(clipped.left, clipped.bottom)
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return undefined
  return { topLeft, topRight, bottomRight, bottomLeft }
}

export function viewportBoundsFromPdfQuad(
  quad: PdfQuad,
  viewport: PdfViewportGeometry,
  cropBoxOrigin: PdfCropBoxOrigin,
): { left: number; top: number; width: number; height: number } | undefined {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((point) => {
    const absolutePoint = absolutePdfPoint(point, cropBoxOrigin)
    return readCoordinatePair(viewport.convertToViewportPoint(absolutePoint.x, absolutePoint.y))
  })
  if (points.some((point) => point === undefined)) return undefined
  const resolvedPoints = points.filter((point) => point !== undefined)
  const xValues = resolvedPoints.map((point) => point.x)
  const yValues = resolvedPoints.map((point) => point.y)
  const left = Math.min(...xValues)
  const right = Math.max(...xValues)
  const top = Math.min(...yValues)
  const bottom = Math.max(...yValues)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function boundedRatio(value: number, start: number, size: number): number {
  if (size <= 0) return 0
  return Math.max(0, Math.min(1, (value - start) / size))
}

export function pdfPageOffsetRatios(input: {
  textLayerBounds: RectCoordinates
  viewportLeft: number
  viewportTop: number
}) {
  const width = input.textLayerBounds.right - input.textLayerBounds.left
  const height = input.textLayerBounds.bottom - input.textLayerBounds.top
  return {
    xRatio: boundedRatio(input.viewportLeft, input.textLayerBounds.left, width),
    yRatio: boundedRatio(input.viewportTop, input.textLayerBounds.top, height),
  }
}

export function pdfPageOffsetRatio(input: {
  pageBounds: RectCoordinates
  viewportTop: number
}): number {
  return pdfPageOffsetRatios({
    textLayerBounds: input.pageBounds,
    viewportLeft: input.pageBounds.left,
    viewportTop: input.viewportTop,
  }).yRatio
}
