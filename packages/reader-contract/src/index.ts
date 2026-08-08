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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function readAllowedExternalLink(
  value: unknown,
  allowedProtocols: readonly string[],
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    const url = new URL(value)
    return allowedProtocols.includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export function readReaderExternalLink(value: unknown): string | undefined {
  return readAllowedExternalLink(value, READER_EXTERNAL_LINK_PROTOCOLS)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isFiniteNumber(value) && value >= 0
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  return isNonNegativeInteger(value) ? value : null
}

function readOptionalBoundedString(
  value: unknown,
  maximumLength: number,
): string | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.length > maximumLength) return null
  return value
}

function readPdfPoint(value: unknown): PdfPoint | undefined {
  if (!isObjectRecord(value)) return undefined
  const x = value.x
  const y = value.y
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return undefined
  if (
    Math.abs(x) > MAX_PDF_COORDINATE_ABSOLUTE_VALUE ||
    Math.abs(y) > MAX_PDF_COORDINATE_ABSOLUTE_VALUE
  ) {
    return undefined
  }
  return { x, y }
}

function readPdfQuad(value: unknown): PdfQuad | undefined {
  if (!isObjectRecord(value)) return undefined
  const topLeft = readPdfPoint(value.topLeft)
  const topRight = readPdfPoint(value.topRight)
  const bottomRight = readPdfPoint(value.bottomRight)
  const bottomLeft = readPdfPoint(value.bottomLeft)
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return undefined
  return { topLeft, topRight, bottomRight, bottomLeft }
}

function readPdfTextSegment(value: unknown): PdfTextSegment | undefined {
  if (!isObjectRecord(value)) return undefined
  if (!isNonNegativeInteger(value.pageIndex)) return undefined
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

  return {
    pageIndex: value.pageIndex,
    quads: quads.filter((quad) => quad !== undefined),
    ...(startOffset !== undefined ? { startOffset } : {}),
    ...(endOffset !== undefined ? { endOffset } : {}),
  }
}

function readPdfTextQuote(value: unknown): PdfTextQuote | undefined {
  if (!isObjectRecord(value)) return undefined
  if (
    typeof value.exact !== "string" ||
    value.exact.length === 0 ||
    value.exact.length > MAX_PDF_QUOTE_LENGTH
  ) {
    return undefined
  }
  const prefix = readOptionalBoundedString(value.prefix, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  const suffix = readOptionalBoundedString(value.suffix, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  if (prefix === null || suffix === null) return undefined
  return {
    exact: value.exact,
    ...(prefix !== undefined ? { prefix } : {}),
    ...(suffix !== undefined ? { suffix } : {}),
  }
}

export function readReaderPositionAnchor(value: unknown): ReaderPositionAnchor | undefined {
  if (!isObjectRecord(value)) return undefined
  if (value.kind === READER_ANCHOR_KIND_CFI_POSITION) {
    if (
      typeof value.cfi !== "string" ||
      value.cfi.length === 0 ||
      value.cfi.length > MAX_CFI_LENGTH
    ) {
      return undefined
    }
    const sectionIndex = readOptionalNonNegativeInteger(value.sectionIndex)
    if (sectionIndex === null) return undefined
    return {
      kind: READER_ANCHOR_KIND_CFI_POSITION,
      cfi: value.cfi,
      ...(sectionIndex !== undefined ? { sectionIndex } : {}),
    }
  }
  if (value.kind !== READER_ANCHOR_KIND_PDF_POSITION) return undefined
  if (!isNonNegativeInteger(value.pageIndex)) return undefined
  if (!isFiniteNumber(value.xRatio) || value.xRatio < 0 || value.xRatio > 1) return undefined
  if (!isFiniteNumber(value.yRatio) || value.yRatio < 0 || value.yRatio > 1) return undefined
  return {
    kind: READER_ANCHOR_KIND_PDF_POSITION,
    pageIndex: value.pageIndex,
    xRatio: value.xRatio,
    yRatio: value.yRatio,
  }
}

export function readReaderTextAnchor(value: unknown): ReaderTextAnchor | undefined {
  if (!isObjectRecord(value)) return undefined
  if (value.kind === READER_ANCHOR_KIND_CFI_TEXT) {
    if (
      typeof value.cfi !== "string" ||
      value.cfi.length === 0 ||
      value.cfi.length > MAX_CFI_LENGTH
    ) {
      return undefined
    }
    const sectionIndex = readOptionalNonNegativeInteger(value.sectionIndex)
    if (sectionIndex === null) return undefined
    return {
      kind: READER_ANCHOR_KIND_CFI_TEXT,
      cfi: value.cfi,
      ...(sectionIndex !== undefined ? { sectionIndex } : {}),
    }
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

export function readReaderLocation(value: unknown): ReaderLocation | undefined {
  if (!isObjectRecord(value)) return undefined
  const anchor = readReaderPositionAnchor(value.anchor)
  if (!anchor) return undefined
  const fraction = value.fraction
  if (
    fraction !== undefined &&
    (!isFiniteNumber(fraction) || fraction < 0 || fraction > 1)
  ) {
    return undefined
  }
  const tocLabel = readOptionalBoundedString(value.tocLabel, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  const pageLabel = readOptionalBoundedString(value.pageLabel, MAX_PDF_QUOTE_CONTEXT_LENGTH)
  const locationLabel = readOptionalBoundedString(
    value.locationLabel,
    MAX_PDF_QUOTE_CONTEXT_LENGTH,
  )
  if (tocLabel === null || pageLabel === null || locationLabel === null) return undefined
  return {
    anchor,
    ...(fraction !== undefined ? { fraction } : {}),
    ...(tocLabel !== undefined ? { tocLabel } : {}),
    ...(pageLabel !== undefined ? { pageLabel } : {}),
    ...(locationLabel !== undefined ? { locationLabel } : {}),
  }
}

export function legacyCfiPositionAnchor(
  cfi: string,
  sectionIndex?: number,
): CfiPositionAnchor {
  return {
    kind: READER_ANCHOR_KIND_CFI_POSITION,
    cfi,
    ...(sectionIndex !== undefined ? { sectionIndex } : {}),
  }
}

export function legacyCfiTextAnchor(cfi: string, sectionIndex?: number): CfiTextAnchor {
  return {
    kind: READER_ANCHOR_KIND_CFI_TEXT,
    cfi,
    ...(sectionIndex !== undefined ? { sectionIndex } : {}),
  }
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
  return anchor.kind === READER_ANCHOR_KIND_CFI_POSITION
    ? anchor.sectionIndex
    : anchor.pageIndex
}

export function formatReaderPositionAnchor(
  anchor: ReaderPositionAnchor,
  pageLabel?: string,
): string {
  if (anchor.kind === READER_ANCHOR_KIND_CFI_POSITION) return `CFI ${anchor.cfi}`
  const label = pageLabel?.trim() || String(anchor.pageIndex + 1)
  return `Page ${label}, ${Math.round(anchor.xRatio * 100)}% across, ${Math.round(anchor.yRatio * 100)}% down`
}
