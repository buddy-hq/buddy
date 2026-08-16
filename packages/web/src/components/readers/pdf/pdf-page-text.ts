import { z } from "zod"
import type {
  PdfPoint,
  PdfPositionAnchor,
  PdfQuad,
  PdfTextAnchor,
  PdfTextQuote,
} from "@buddy/reader-contract"
import type { PdfCropBox } from "./pdf-geometry"

const PDF_PASSAGE_MAX_LENGTH = 1_200
const PDF_PASSAGE_LEADING_CONTEXT_LENGTH = 200
const PDF_TEXT_TRANSFORM_LENGTH = 6
const PDF_TEXT_HORIZONTAL_FLOW = "horizontal"
const PDF_TEXT_VERTICAL_FLOW = "vertical"
const PDF_TEXT_DIRECTION_LTR = "ltr"
const PDF_TEXT_DIRECTION_RTL = "rtl"
const PDF_TEXT_DIRECTION_TTB = "ttb"

type PdfTextFlow = typeof PDF_TEXT_HORIZONTAL_FLOW | typeof PDF_TEXT_VERTICAL_FLOW
type PdfTextDirection =
  | typeof PDF_TEXT_DIRECTION_LTR
  | typeof PDF_TEXT_DIRECTION_RTL
  | typeof PDF_TEXT_DIRECTION_TTB

type PdfTextItemGeometry = {
  direction: PdfTextDirection
  flow: PdfTextFlow
  quad: PdfQuad
}

export type PdfPageTextSpan = {
  startOffset: number
  endOffset: number
  quad: PdfQuad
  flow: PdfTextFlow
  direction: PdfTextDirection
}

export type PdfPageText = {
  text: string
  spans: PdfPageTextSpan[]
  cropBox: PdfCropBox
}

const PdfTextTransformSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])

export const PdfTextContentItemSchema = z.object({
  str: z.string(),
  dir: z.string().optional(),
  transform: z.array(z.number().finite()).min(PDF_TEXT_TRANSFORM_LENGTH),
  width: z.number().finite(),
  height: z.number().finite(),
  hasEOL: z.boolean().optional(),
})

export const PdfPageTextContentSchema = z.object({
  items: z.array(PdfTextContentItemSchema),
})

export const PdfJsTextContentHostSchema = z.object({
  items: z.array(PdfTextContentItemSchema.catch(undefined)),
})

export type TPdfTextContentItem = z.infer<typeof PdfTextContentItemSchema>
export type TPdfPageTextContent = z.infer<typeof PdfPageTextContentSchema>

type PdfTextContentItem = {
  text: string
  direction: string
  transform: readonly [number, number, number, number, number, number]
  width: number
  height: number
  hasEndOfLine: boolean
}

function readTextContentItem(value: TPdfTextContentItem): PdfTextContentItem | undefined {
  const transform = PdfTextTransformSchema.safeParse(value.transform.slice(0, PDF_TEXT_TRANSFORM_LENGTH))
  if (!transform.success || value.width < 0 || value.height < 0) return undefined
  return {
    text: value.str,
    direction: value.dir ?? "ltr",
    transform: transform.data,
    width: value.width,
    height: value.height,
    hasEndOfLine: value.hasEOL === true,
  }
}

function vectorLength(x: number, y: number): number {
  return Math.hypot(x, y)
}

function scaledVector(x: number, y: number, length: number): PdfPoint {
  const magnitude = vectorLength(x, y)
  if (magnitude > 0) return { x: (x / magnitude) * length, y: (y / magnitude) * length }
  return { x: length, y: 0 }
}

function addPoints(...points: PdfPoint[]): PdfPoint {
  return points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
}

function cropRelativePoint(point: PdfPoint, cropBox: PdfCropBox): PdfPoint {
  return { x: point.x - cropBox.xMin, y: point.y - cropBox.yMin }
}

function textItemQuad(
  item: PdfTextContentItem,
  cropBox: PdfCropBox,
): PdfTextItemGeometry {
  const [a, b, c, d, e, f] = item.transform
  const origin = { x: e, y: f }
  if (item.direction === "ttb") {
    const advance = scaledVector(c, d, item.height)
    const cross = scaledVector(a, b, item.width)
    return {
      flow: PDF_TEXT_VERTICAL_FLOW,
      direction: PDF_TEXT_DIRECTION_TTB,
      quad: {
        topLeft: cropRelativePoint(addPoints(origin, advance), cropBox),
        topRight: cropRelativePoint(addPoints(origin, advance, cross), cropBox),
        bottomRight: cropRelativePoint(addPoints(origin, cross), cropBox),
        bottomLeft: cropRelativePoint(origin, cropBox),
      },
    }
  }

  const advance = scaledVector(a, b, item.width)
  const ascent =
    vectorLength(c, d) > 0
      ? scaledVector(c, d, item.height)
      : scaledVector(-advance.y, advance.x, item.height)
  return {
    flow: PDF_TEXT_HORIZONTAL_FLOW,
    direction:
      item.direction === PDF_TEXT_DIRECTION_RTL ? PDF_TEXT_DIRECTION_RTL : PDF_TEXT_DIRECTION_LTR,
    quad: {
      topLeft: cropRelativePoint(addPoints(origin, ascent), cropBox),
      topRight: cropRelativePoint(addPoints(origin, ascent, advance), cropBox),
      bottomRight: cropRelativePoint(addPoints(origin, advance), cropBox),
      bottomLeft: cropRelativePoint(origin, cropBox),
    },
  }
}

export function readPdfPageText(value: TPdfPageTextContent, cropBox: PdfCropBox): PdfPageText {
  const parts: string[] = []
  const spans: PdfPageTextSpan[] = []
  let offset = 0
  for (const valueItem of value.items) {
    const item = readTextContentItem(valueItem)
    if (!item) continue
    const startOffset = offset
    parts.push(item.text)
    offset += item.text.length
    if (item.text.length > 0) {
      const geometry = textItemQuad(item, cropBox)
      spans.push({
        startOffset,
        endOffset: offset,
        quad: geometry.quad,
        flow: geometry.flow,
        direction: geometry.direction,
      })
    }
    if (item.hasEndOfLine) {
      parts.push("\n")
      offset += 1
    }
  }
  return { text: parts.join(""), spans, cropBox }
}

function interpolatePoint(start: PdfPoint, end: PdfPoint, ratio: number): PdfPoint {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  }
}

function slicedSpanQuad(
  span: PdfPageTextSpan,
  startOffset: number,
  endOffset: number,
): PdfQuad | undefined {
  const spanLength = span.endOffset - span.startOffset
  if (spanLength <= 0) return undefined
  const startRatio = Math.max(0, (startOffset - span.startOffset) / spanLength)
  const endRatio = Math.min(1, (endOffset - span.startOffset) / spanLength)
  if (endRatio <= startRatio) return undefined

  if (span.flow === PDF_TEXT_VERTICAL_FLOW) {
    return {
      topLeft: interpolatePoint(span.quad.topLeft, span.quad.bottomLeft, startRatio),
      topRight: interpolatePoint(span.quad.topRight, span.quad.bottomRight, startRatio),
      bottomRight: interpolatePoint(span.quad.topRight, span.quad.bottomRight, endRatio),
      bottomLeft: interpolatePoint(span.quad.topLeft, span.quad.bottomLeft, endRatio),
    }
  }
  if (span.direction === PDF_TEXT_DIRECTION_RTL) {
    const visualStartRatio = 1 - endRatio
    const visualEndRatio = 1 - startRatio
    return {
      topLeft: interpolatePoint(span.quad.topLeft, span.quad.topRight, visualStartRatio),
      topRight: interpolatePoint(span.quad.topLeft, span.quad.topRight, visualEndRatio),
      bottomRight: interpolatePoint(span.quad.bottomLeft, span.quad.bottomRight, visualEndRatio),
      bottomLeft: interpolatePoint(span.quad.bottomLeft, span.quad.bottomRight, visualStartRatio),
    }
  }
  return {
    topLeft: interpolatePoint(span.quad.topLeft, span.quad.topRight, startRatio),
    topRight: interpolatePoint(span.quad.topLeft, span.quad.topRight, endRatio),
    bottomRight: interpolatePoint(span.quad.bottomLeft, span.quad.bottomRight, endRatio),
    bottomLeft: interpolatePoint(span.quad.bottomLeft, span.quad.bottomRight, startRatio),
  }
}

export function pdfTextAnchorFromOffsets(input: {
  pageIndex: number
  pageText: PdfPageText
  startOffset: number
  endOffset: number
  quote: PdfTextQuote
}): PdfTextAnchor | undefined {
  if (
    input.startOffset < 0 ||
    input.endOffset <= input.startOffset ||
    input.endOffset > input.pageText.text.length
  ) {
    return undefined
  }
  const quads = input.pageText.spans.flatMap((span) => {
    if (span.endOffset <= input.startOffset || span.startOffset >= input.endOffset) return []
    const quad = slicedSpanQuad(
      span,
      Math.max(span.startOffset, input.startOffset),
      Math.min(span.endOffset, input.endOffset),
    )
    return quad ? [quad] : []
  })
  if (quads.length === 0) return undefined
  return {
    kind: "pdf-text",
    segments: [
      {
        pageIndex: input.pageIndex,
        quads,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
      },
    ],
    quote: input.quote,
  }
}

function quoteMatchOffsets(
  text: string,
  quote: PdfTextQuote,
):
  | {
      startOffset: number
      endOffset: number
    }
  | undefined {
  let bestStart = -1
  let bestScore = -1
  let candidateStart = text.indexOf(quote.exact)
  while (candidateStart >= 0) {
    const candidateEnd = candidateStart + quote.exact.length
    let score = 0
    if (quote.prefix && text.slice(0, candidateStart).endsWith(quote.prefix)) score += 1
    if (quote.suffix && text.slice(candidateEnd).startsWith(quote.suffix)) score += 1
    if (score > bestScore) {
      bestStart = candidateStart
      bestScore = score
    }
    candidateStart = text.indexOf(quote.exact, candidateStart + 1)
  }
  return bestStart < 0
    ? undefined
    : { startOffset: bestStart, endOffset: bestStart + quote.exact.length }
}

export function repairPdfTextAnchor(
  anchor: PdfTextAnchor,
  pages: ReadonlyMap<number, PdfPageText>,
): PdfTextAnchor {
  const repairedSegments = anchor.segments.map((segment) => {
    if (segment.quads.length > 0) return segment
    const pageText = pages.get(segment.pageIndex)
    if (!pageText) return segment
    const storedOffsets =
      segment.startOffset !== undefined && segment.endOffset !== undefined
        ? { startOffset: segment.startOffset, endOffset: segment.endOffset }
        : undefined
    const offsets = storedOffsets ?? quoteMatchOffsets(pageText.text, anchor.quote)
    if (!offsets) return segment
    const repaired = pdfTextAnchorFromOffsets({
      pageIndex: segment.pageIndex,
      pageText,
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
      quote: anchor.quote,
    })
    return repaired?.segments[0] ?? segment
  })
  return { ...anchor, segments: repairedSegments }
}

function spanPositionRatios(
  span: PdfPageTextSpan,
  cropBox: PdfCropBox,
) {
  const points = [
    span.quad.topLeft,
    span.quad.topRight,
    span.quad.bottomRight,
    span.quad.bottomLeft,
  ]
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const pageWidth = cropBox.xMax - cropBox.xMin
  const pageHeight = cropBox.yMax - cropBox.yMin
  return {
    xRatio: pageWidth <= 0 ? 0 : Math.max(0, Math.min(1, centerX / pageWidth)),
    yRatio: pageHeight <= 0 ? 0 : Math.max(0, Math.min(1, 1 - centerY / pageHeight)),
  }
}

function normalizePassage(value: string): string | undefined {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim()
  return normalized || undefined
}

export function pdfCurrentPassageText(
  pageText: PdfPageText,
  position: Pick<PdfPositionAnchor, "xRatio" | "yRatio">,
): string | undefined {
  if (!pageText.text) return undefined
  const targetX = Math.max(0, Math.min(1, position.xRatio))
  const targetY = Math.max(0, Math.min(1, position.yRatio))
  const nearestSpan = pageText.spans.reduce<PdfPageTextSpan | undefined>((nearest, span) => {
    if (!nearest) return span
    const nearestPosition = spanPositionRatios(nearest, pageText.cropBox)
    const candidatePosition = spanPositionRatios(span, pageText.cropBox)
    const nearestDistance = Math.hypot(
      nearestPosition.xRatio - targetX,
      nearestPosition.yRatio - targetY,
    )
    const candidateDistance = Math.hypot(
      candidatePosition.xRatio - targetX,
      candidatePosition.yRatio - targetY,
    )
    return candidateDistance < nearestDistance ? span : nearest
  }, undefined)
  const centerOffset = nearestSpan?.startOffset ?? 0
  const startOffset = Math.max(0, centerOffset - PDF_PASSAGE_LEADING_CONTEXT_LENGTH)
  return normalizePassage(pageText.text.slice(startOffset, startOffset + PDF_PASSAGE_MAX_LENGTH))
}
