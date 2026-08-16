import {
  isJsonObject,
  parseTFiniteNumber,
  parseTNonNegativeInteger,
  parseTString,
} from "./parse-values"

export const READER_ANCHOR_KIND_CFI_POSITION = "cfi-position" as const
export const READER_ANCHOR_KIND_CFI_TEXT = "cfi-text" as const
export const READER_ANCHOR_KIND_PDF_POSITION = "pdf-position" as const
export const READER_ANCHOR_KIND_PDF_TEXT = "pdf-text" as const

const MAX_CFI_LENGTH = 16_384
export const MAX_PDF_TEXT_SEGMENTS = 64
export const MAX_PDF_QUADS_PER_SEGMENT = 1_024
export const MAX_PDF_QUOTE_LENGTH = 32_768
const MAX_PDF_QUOTE_CONTEXT_LENGTH = 1_024
const MAX_PDF_COORDINATE_ABSOLUTE_VALUE = 10_000_000
export const READER_EXTERNAL_LINK_PROTOCOLS = ["http:", "https:", "mailto:"] as const

export type CfiPositionAnchor = {
  kind: typeof READER_ANCHOR_KIND_CFI_POSITION
  cfi: string
  sectionIndex?: number
}

export type CfiTextAnchor = {
  kind: typeof READER_ANCHOR_KIND_CFI_TEXT
  cfi: string
  sectionIndex?: number
}

export type PdfPositionAnchor = {
  kind: typeof READER_ANCHOR_KIND_PDF_POSITION
  pageIndex: number
  xRatio: number
  yRatio: number
}

export type PdfPoint = {
  x: number
  y: number
}

export type PdfQuad = {
  topLeft: PdfPoint
  topRight: PdfPoint
  bottomRight: PdfPoint
  bottomLeft: PdfPoint
}

export type PdfTextSegment = {
  pageIndex: number
  quads: PdfQuad[]
  startOffset?: number
  endOffset?: number
}

export type PdfTextQuote = {
  exact: string
  prefix?: string
  suffix?: string
}

export type PdfTextAnchor = {
  kind: typeof READER_ANCHOR_KIND_PDF_TEXT
  segments: PdfTextSegment[]
  quote: PdfTextQuote
}

export type ReaderPositionAnchor = CfiPositionAnchor | PdfPositionAnchor
export type ReaderTextAnchor = CfiTextAnchor | PdfTextAnchor

export type ReaderLocation = {
  anchor: ReaderPositionAnchor
  fraction?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type ReaderRelocation = ReaderLocation & {
  currentPassageText?: string
}

export type ReaderTrailEntry = {
  label: string
  anchor: ReaderPositionAnchor
  fraction?: number
}

export function readAllowedExternalLink<TValue>(
  value: TValue,
  allowedProtocols: readonly string[],
): string | undefined {
  const href = parseTString(value)?.trim()
  if (!href) return undefined
  try {
    const url = new URL(href)
    return allowedProtocols.includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export function readReaderExternalLink<TValue>(value: TValue): string | undefined {
  return readAllowedExternalLink(value, READER_EXTERNAL_LINK_PROTOCOLS)
}

function isUnitInterval(value: number): boolean {
  return value >= 0 && value <= 1
}

function readOptionalNonNegativeInteger<TValue>(value: TValue): number | undefined | null {
  if (value === undefined) return undefined
  return parseTNonNegativeInteger(value) ?? null
}

function readOptionalBoundedString<TValue>(
  value: TValue,
  maximumLength: number,
): string | undefined | null {
  if (value === undefined) return undefined
  const text = parseTString(value)
  if (text === undefined || text.length > maximumLength) return null
  return text
}

function readPdfPoint<TValue>(value: TValue): PdfPoint | undefined {
  if (!isJsonObject(value)) return undefined
  const x = parseTFiniteNumber(value.x)
  const y = parseTFiniteNumber(value.y)
  if (x === undefined || y === undefined) return undefined
  if (
    Math.abs(x) > MAX_PDF_COORDINATE_ABSOLUTE_VALUE ||
    Math.abs(y) > MAX_PDF_COORDINATE_ABSOLUTE_VALUE
  ) {
    return undefined
  }
  return { x, y }
}

function readPdfQuad<TValue>(value: TValue): PdfQuad | undefined {
  if (!isJsonObject(value)) return undefined
  const topLeft = readPdfPoint(value.topLeft)
  const topRight = readPdfPoint(value.topRight)
  const bottomRight = readPdfPoint(value.bottomRight)
  const bottomLeft = readPdfPoint(value.bottomLeft)
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return undefined
  return { topLeft, topRight, bottomRight, bottomLeft }
}

function readPdfTextSegment<TValue>(value: TValue): PdfTextSegment | undefined {
  if (!isJsonObject(value)) return undefined
  const pageIndex = parseTNonNegativeInteger(value.pageIndex)
  if (pageIndex === undefined) return undefined
  if (!Array.isArray(value.quads) || value.quads.length > MAX_PDF_QUADS_PER_SEGMENT) {
    return undefined
  }
  const quads = value.quads.map(readPdfQuad)
  if (quads.some((quad) => quad === undefined)) return undefined
  const startOffset = readOptionalNonNegativeInteger(value.startOffset)
  const endOffset = readOptionalNonNegativeInteger(value.endOffset)
  if (startOffset === null || endOffset === null) return undefined
  if (startOffset !== undefined && endOffset !== undefined && endOffset < startOffset) {
    return undefined
  }

  return Object.assign(
    {
      pageIndex,
      quads: quads.filter((quad) => quad !== undefined),
    },
    startOffset !== undefined ? { startOffset } : undefined,
    endOffset !== undefined ? { endOffset } : undefined,
  )
}

function readPdfTextQuote<TValue>(value: TValue): PdfTextQuote | undefined {
  if (!isJsonObject(value)) return undefined
  const exact = parseTString(value.exact)
  if (exact === undefined || exact.length === 0 || exact.length > MAX_PDF_QUOTE_LENGTH) {
    return undefined
  }
  const prefix = readOptionalBoundedString(value.prefix, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  const suffix = readOptionalBoundedString(value.suffix, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  if (prefix === null || suffix === null) return undefined
  return Object.assign(
    { exact },
    prefix !== undefined ? { prefix } : undefined,
    suffix !== undefined ? { suffix } : undefined,
  )
}

export function readReaderPositionAnchor<TValue>(value: TValue): ReaderPositionAnchor | undefined {
  if (!isJsonObject(value)) return undefined
  if (value.kind === READER_ANCHOR_KIND_CFI_POSITION) {
    const cfi = parseTString(value.cfi)
    if (cfi === undefined || cfi.length === 0 || cfi.length > MAX_CFI_LENGTH) {
      return undefined
    }
    const sectionIndex = readOptionalNonNegativeInteger(value.sectionIndex)
    if (sectionIndex === null) return undefined
    return Object.assign(
      {
        kind: READER_ANCHOR_KIND_CFI_POSITION,
        cfi,
      },
      sectionIndex !== undefined ? { sectionIndex } : undefined,
    )
  }
  if (value.kind !== READER_ANCHOR_KIND_PDF_POSITION) return undefined
  const pageIndex = parseTNonNegativeInteger(value.pageIndex)
  const xRatio = parseTFiniteNumber(value.xRatio)
  const yRatio = parseTFiniteNumber(value.yRatio)
  if (pageIndex === undefined || xRatio === undefined || yRatio === undefined) return undefined
  if (!isUnitInterval(xRatio) || !isUnitInterval(yRatio)) return undefined
  return {
    kind: READER_ANCHOR_KIND_PDF_POSITION,
    pageIndex,
    xRatio,
    yRatio,
  }
}

export function readReaderTextAnchor<TValue>(value: TValue): ReaderTextAnchor | undefined {
  if (!isJsonObject(value)) return undefined
  if (value.kind === READER_ANCHOR_KIND_CFI_TEXT) {
    const cfi = parseTString(value.cfi)
    if (cfi === undefined || cfi.length === 0 || cfi.length > MAX_CFI_LENGTH) {
      return undefined
    }
    const sectionIndex = readOptionalNonNegativeInteger(value.sectionIndex)
    if (sectionIndex === null) return undefined
    return Object.assign(
      {
        kind: READER_ANCHOR_KIND_CFI_TEXT,
        cfi,
      },
      sectionIndex !== undefined ? { sectionIndex } : undefined,
    )
  }
  if (value.kind !== READER_ANCHOR_KIND_PDF_TEXT) return undefined
  if (
    !Array.isArray(value.segments) ||
    value.segments.length === 0 ||
    value.segments.length > MAX_PDF_TEXT_SEGMENTS
  ) {
    return undefined
  }
  const segments = value.segments.map(readPdfTextSegment)
  if (segments.some((segment) => segment === undefined)) return undefined
  const quote = readPdfTextQuote(value.quote)
  if (!quote) return undefined
  return {
    kind: READER_ANCHOR_KIND_PDF_TEXT,
    segments: segments.filter((segment) => segment !== undefined),
    quote,
  }
}

export function readReaderLocation<TValue>(value: TValue): ReaderLocation | undefined {
  if (!isJsonObject(value)) return undefined
  const anchor = readReaderPositionAnchor(value.anchor)
  if (!anchor) return undefined
  const fraction = value.fraction === undefined ? undefined : parseTFiniteNumber(value.fraction)
  if (value.fraction !== undefined && (fraction === undefined || !isUnitInterval(fraction))) {
    return undefined
  }
  const tocLabel = readOptionalBoundedString(value.tocLabel, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  const pageLabel = readOptionalBoundedString(value.pageLabel, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  const locationLabel = readOptionalBoundedString(value.locationLabel, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  if (tocLabel === null || pageLabel === null || locationLabel === null) return undefined
  return Object.assign(
    Object.assign(
      { anchor },
      fraction !== undefined ? { fraction } : undefined,
      tocLabel !== undefined ? { tocLabel } : undefined,
    ),
    pageLabel !== undefined ? { pageLabel } : undefined,
    locationLabel !== undefined ? { locationLabel } : undefined,
  )
}

export function legacyCfiPositionAnchor(cfi: string, sectionIndex?: number): CfiPositionAnchor {
  return Object.assign(
    {
      kind: READER_ANCHOR_KIND_CFI_POSITION,
      cfi,
    },
    sectionIndex !== undefined ? { sectionIndex } : undefined,
  )
}

export function legacyCfiTextAnchor(cfi: string, sectionIndex?: number): CfiTextAnchor {
  return Object.assign(
    {
      kind: READER_ANCHOR_KIND_CFI_TEXT,
      cfi,
    },
    sectionIndex !== undefined ? { sectionIndex } : undefined,
  )
}

export function readerPositionAnchorEquals(
  left: ReaderPositionAnchor,
  right: ReaderPositionAnchor,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === READER_ANCHOR_KIND_CFI_POSITION) {
    return (
      right.kind === READER_ANCHOR_KIND_CFI_POSITION &&
      left.cfi === right.cfi &&
      left.sectionIndex === right.sectionIndex
    )
  }
  return (
    right.kind === READER_ANCHOR_KIND_PDF_POSITION &&
    left.pageIndex === right.pageIndex &&
    left.xRatio === right.xRatio &&
    left.yRatio === right.yRatio
  )
}

export function readerTextAnchorKey(anchor: ReaderTextAnchor): string {
  if (anchor.kind === READER_ANCHOR_KIND_CFI_TEXT) {
    return `${anchor.kind}:${anchor.sectionIndex ?? ""}:${anchor.cfi}`
  }
  const segmentKey = anchor.segments
    .map((segment) => {
      const quads = segment.quads
        .map((quad) =>
          [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
            .map((point) => `${point.x},${point.y}`)
            .join(";"),
        )
        .join("|")
      return `${segment.pageIndex}:${segment.startOffset ?? ""}:${segment.endOffset ?? ""}:${quads}`
    })
    .join("/")
  return `${anchor.kind}:${segmentKey}:${anchor.quote.exact}`
}

export function readerTextAnchorEquals(left: ReaderTextAnchor, right: ReaderTextAnchor): boolean {
  return readerTextAnchorKey(left) === readerTextAnchorKey(right)
}

export function readerPositionIndex(anchor: ReaderPositionAnchor): number | undefined {
  return anchor.kind === READER_ANCHOR_KIND_CFI_POSITION ? anchor.sectionIndex : anchor.pageIndex
}

export function formatReaderPositionAnchor(
  anchor: ReaderPositionAnchor,
  pageLabel?: string,
): string {
  if (anchor.kind === READER_ANCHOR_KIND_CFI_POSITION) return `CFI ${anchor.cfi}`
  const label = pageLabel?.trim() || String(anchor.pageIndex + 1)
  return `Page ${label}, ${Math.round(anchor.xRatio * 100)}% across, ${Math.round(anchor.yRatio * 100)}% down`
}
