import { z } from "zod"
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

export type TPdfCoordinatePair = readonly [number, number]

export type TPdfCoordinateResult = TPdfCoordinatePair | PdfPoint

export type PdfViewportGeometry = {
  width: number
  height: number
  convertToPdfPoint: (x: number, y: number) => TPdfCoordinateResult | undefined
  convertToViewportPoint: (x: number, y: number) => TPdfCoordinateResult | undefined
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

const PdfCoordinatePairSchema = z.tuple([z.number().finite(), z.number().finite()])
const PdfPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})
const PdfCoordinateResultSchema = z.union([PdfCoordinatePairSchema, PdfPointSchema])
const PdfCropBoxValuesSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])
const PdfCoordinateConverterSchema = z.custom<(x: number, y: number) => TPdfCoordinateResult>(
  (value) => z.function().safeParse(value).success,
)

type TPdfJsViewport = {
  width: number
  height: number
  convertToPdfPoint: (x: number, y: number) => TPdfCoordinateResult
  convertToViewportPoint: (x: number, y: number) => TPdfCoordinateResult
}

const pdfJsViewportContractSchema = z.object({
  width: z.number().finite(),
  height: z.number().finite(),
  convertToPdfPoint: PdfCoordinateConverterSchema,
  convertToViewportPoint: PdfCoordinateConverterSchema,
})

// PDF.js viewport methods read internal state off `this` (notably `this.transform`), and a
// zod object schema rebuilds its output as a plain object — which strips that state and makes
// the converters throw on the first coordinate conversion. Validate the shape, then pass the
// original PageViewport instance through by reference.
const PdfJsViewportSchema = z.custom<TPdfJsViewport>(
  (value) => pdfJsViewportContractSchema.safeParse(value).success,
)

export const PdfJsPageViewSchema = z.object({
  div: z.instanceof(HTMLDivElement),
  textLayer: z.object({
    div: z.instanceof(HTMLDivElement),
  }),
  viewport: PdfJsViewportSchema,
  pdfPage: z.object({
    view: z.array(z.number().finite()).min(4),
  }),
})

export type TPdfJsPageView = z.infer<typeof PdfJsPageViewSchema>

export function readCoordinatePair(value: TPdfCoordinateResult | undefined): PdfPoint | undefined {
  if (value === undefined) return undefined
  const parsed = PdfCoordinateResultSchema.safeParse(value)
  if (!parsed.success) return undefined
  if (Array.isArray(parsed.data)) {
    return { x: parsed.data[0], y: parsed.data[1] }
  }
  return parsed.data
}

function readCropBox(values: readonly number[]): PdfCropBox | undefined {
  const parsed = PdfCropBoxValuesSchema.safeParse(values.slice(0, 4))
  if (!parsed.success) return undefined
  const [xMin, yMin, xMax, yMax] = parsed.data
  if (xMax <= xMin || yMax <= yMin) return undefined
  return { xMin, yMin, xMax, yMax }
}

export function readPdfPageViewGeometry(value: TPdfJsPageView): PdfPageViewGeometry | undefined {
  const cropBox = readCropBox(value.pdfPage.view)
  if (!cropBox) return undefined
  const cropBoxOrigin = { x: cropBox.xMin, y: cropBox.yMin }
  const { viewport } = value

  return {
    div: value.div,
    textLayerDiv: value.textLayer.div,
    cropBox,
    cropBoxOrigin,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      convertToPdfPoint: (x, y) => {
        const result = PdfCoordinateResultSchema.safeParse(viewport.convertToPdfPoint(x, y))
        return result.success ? result.data : undefined
      },
      convertToViewportPoint: (x, y) => {
        const result = PdfCoordinateResultSchema.safeParse(viewport.convertToViewportPoint(x, y))
        return result.success ? result.data : undefined
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
