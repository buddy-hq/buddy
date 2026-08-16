import {
  READER_ANCHOR_KIND_CFI_POSITION,
  READER_ANCHOR_KIND_CFI_TEXT,
  readReaderPositionAnchor,
  readReaderTextAnchor,
  type ReaderPositionAnchor,
} from "@buddy/reader-contract"
import {
  ANNOTATION_COLORS,
  BOOK_STATE_STORAGE_KEY_PREFIX,
  DEFAULT_ANNOTATION_COLOR_ID,
  FLOW_PAGINATED,
  GLOBAL_PREFERENCES_STORAGE_KEY,
} from "./foliate-reader-constants"
import {
  isPdfReaderSource,
  type PdfReaderLayout,
  type PdfReaderMode,
  type PdfReaderRotation,
  type PdfReaderScaleMode,
  type ReaderAnnotation,
  type ReaderAnnotationColorId,
  type ReaderAnnotationStyle,
  type ReaderBookmark,
  type ReaderSource,
  type ReaderThemeId,
} from "./reader-types"

export const READER_PREFERENCES_STORAGE_KEY = "buddy:reader:preferences:v2"
export const READER_DOCUMENT_STORAGE_KEY_PREFIX = "buddy:reader:document:v2:"

const READER_STATE_VERSION = 2 as const
const DEFAULT_PDF_LAYOUT: PdfReaderLayout = "continuous"
const DEFAULT_PDF_SCALE_MODE: PdfReaderScaleMode = "fit-width"
const DEFAULT_PDF_ROTATION: PdfReaderRotation = 0
const DEFAULT_PDF_CUSTOM_SCALE = 1
export const MIN_PDF_CUSTOM_SCALE = 0.25
export const MAX_PDF_CUSTOM_SCALE = 5
const MAX_READER_LABEL_LENGTH = 4_096
const MAX_READER_NOTE_LENGTH = 100_000
const MAX_READER_ANNOTATIONS = 20_000
const MAX_READER_BOOKMARKS = 20_000
const FALLBACK_ID_RANDOM_LENGTH = 10
const LEGACY_PDF_CFI_PAGE_PATTERN = /^epubcfi\(\/6\/(\d+)(?:\[[^\]]*\])?(?:!|\)|,)/
const LEGACY_PDF_ANCHOR_QUOTE = "Legacy PDF annotation"
const LEGACY_RECORD_TIMESTAMP = "1970-01-01T00:00:00.000Z"
const LEGACY_STORAGE_SEGMENT_PATTERN = /[^a-z0-9]+/g
const LEGACY_STORAGE_EDGE_PATTERN = /^-+|-+$/g
const READER_CONTENT_FINGERPRINT_ALGORITHM = "SHA-256"
const READER_CONTENT_FINGERPRINT_PREFIX = "sha256:"
const HEXADECIMAL_RADIX = 16
const HEX_BYTE_LENGTH = 2
const readerContentFingerprintPromises = new WeakMap<Blob, Promise<string | undefined>>()

export type ReaderPreferences = {
  themeId: ReaderThemeId
  reduceMotion: boolean
  autohideCursor: boolean
  pdfMode: PdfReaderMode
}

export type ReaderDocumentIdentity = {
  sourceId: string
  format: "epub" | "pdf"
  contentFingerprint?: string
}

export type ReaderDocumentState = {
  version: typeof READER_STATE_VERSION
  identity: ReaderDocumentIdentity
  lastLocation?: ReaderPositionAnchor
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
  pdfMode?: PdfReaderMode
}

export type LegacyEpubReaderBookmark = {
  value: string
  label: string
  created: string
}

export type LegacyEpubReaderAnnotation = {
  value: string
  text?: string
  note?: string
  style?: string
  color?: string
  created?: string
  modified?: string
  index?: number
}

export type LegacyEpubReaderBookState = {
  lastLocation?: string
  bookmarks: LegacyEpubReaderBookmark[]
  annotations: LegacyEpubReaderAnnotation[]
}

export type LegacyEpubReaderBookStateInput = {
  lastLocation?: unknown
  bookmarks: readonly unknown[]
  annotations: readonly unknown[]
}

export type ReaderStateRepository = {
  loadPreferences: (defaultTheme: ReaderThemeId) => ReaderPreferences
  savePreferences: (preferences: ReaderPreferences) => void
  loadDocument: (source: ReaderSource, persistenceSuffix?: string) => ReaderDocumentState
  saveDocument: (source: ReaderSource, state: ReaderDocumentState) => void
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function safeReadStorage(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWriteStorage(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Reader state is best-effort when local storage is unavailable or full.
  }
}

function parseJson(value: string | null): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function isReaderThemeId(value: unknown): value is ReaderThemeId {
  return (
    value === "paper" ||
    value === "sepia" ||
    value === "night" ||
    value === "mist" ||
    value === "graphite"
  )
}

function isPdfReaderLayout(value: unknown): value is PdfReaderLayout {
  return value === "continuous" || value === "single-page" || value === "two-up"
}

function isPdfReaderScaleMode(value: unknown): value is PdfReaderScaleMode {
  return value === "fit-width" || value === "fit-page" || value === "custom"
}

function isPdfReaderRotation(value: unknown): value is PdfReaderRotation {
  return value === 0 || value === 90 || value === 180 || value === 270
}

function readPdfReaderMode(value: unknown): PdfReaderMode | undefined {
  if (!isObjectRecord(value)) return undefined
  if (!isPdfReaderLayout(value.layout)) return undefined
  if (!isPdfReaderScaleMode(value.scaleMode)) return undefined
  if (!isPdfReaderRotation(value.rotation)) return undefined
  const scale = value.scale
  if (
    scale !== undefined &&
    (typeof scale !== "number" ||
      !Number.isFinite(scale) ||
      scale < MIN_PDF_CUSTOM_SCALE ||
      scale > MAX_PDF_CUSTOM_SCALE)
  ) {
    return undefined
  }
  if (value.scaleMode === "custom" && scale === undefined) return undefined
  return Object.assign(
    {
      layout: value.layout,
      scaleMode: value.scaleMode,
      rotation: value.rotation,
    },
    scale !== undefined ? { scale } : undefined,
  )
}

export function defaultPdfReaderMode(): PdfReaderMode {
  return {
    layout: DEFAULT_PDF_LAYOUT,
    scaleMode: DEFAULT_PDF_SCALE_MODE,
    rotation: DEFAULT_PDF_ROTATION,
  }
}

function defaultReaderPreferences(defaultTheme: ReaderThemeId): ReaderPreferences {
  return {
    themeId: defaultTheme,
    reduceMotion: false,
    autohideCursor: false,
    pdfMode: defaultPdfReaderMode(),
  }
}

function readLegacyPreferences(defaultTheme: ReaderThemeId): ReaderPreferences {
  const defaults = defaultReaderPreferences(defaultTheme)
  const value = parseJson(safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY))
  if (!isObjectRecord(value)) return defaults
  return {
    themeId: isReaderThemeId(value.themeId) ? value.themeId : defaults.themeId,
    reduceMotion: value.reduceMotion === true,
    autohideCursor: value.autohideCursor === true,
    pdfMode: defaults.pdfMode,
  }
}

export function loadReaderPreferences(defaultTheme: ReaderThemeId): ReaderPreferences {
  const legacy = readLegacyPreferences(defaultTheme)
  const value = parseJson(safeReadStorage(READER_PREFERENCES_STORAGE_KEY))
  if (!isObjectRecord(value)) return legacy
  return {
    themeId: isReaderThemeId(value.themeId) ? value.themeId : legacy.themeId,
    reduceMotion:
      typeof value.reduceMotion === "boolean" ? value.reduceMotion : legacy.reduceMotion,
    autohideCursor:
      typeof value.autohideCursor === "boolean" ? value.autohideCursor : legacy.autohideCursor,
    pdfMode: readPdfReaderMode(value.pdfMode) ?? legacy.pdfMode,
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences): void {
  safeWriteStorage(READER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))

  const legacyValue = parseJson(safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY))
  const legacyRecord = isObjectRecord(legacyValue) ? legacyValue : {}
  safeWriteStorage(
    GLOBAL_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      ...legacyRecord,
      themeId: preferences.themeId,
      reduceMotion: preferences.reduceMotion,
      autohideCursor: preferences.autohideCursor,
      flow:
        legacyRecord.flow === "paginated" || legacyRecord.flow === "scrolled"
          ? legacyRecord.flow
          : FLOW_PAGINATED,
    }),
  )
}

function isReaderAnnotationStyle(value: unknown): value is ReaderAnnotationStyle {
  return (
    value === "highlight" ||
    value === "underline" ||
    value === "squiggly" ||
    value === "strikethrough"
  )
}

function isReaderAnnotationColorId(value: unknown): value is ReaderAnnotationColorId {
  return value === "amber" || value === "mint" || value === "sky" || value === "rose"
}

function readBoundedString(value: unknown, maximumLength: number): string | undefined {
  return typeof value === "string" && value.length <= maximumLength ? value : undefined
}

function readReaderAnnotation(value: unknown): ReaderAnnotation | undefined {
  if (!isObjectRecord(value)) return undefined
  const id = readBoundedString(value.id, MAX_READER_LABEL_LENGTH)
  const anchor = readReaderTextAnchor(value.anchor)
  const text = readBoundedString(value.text, MAX_READER_NOTE_LENGTH)
  const note = readBoundedString(value.note, MAX_READER_NOTE_LENGTH)
  const created = readBoundedString(value.created, MAX_READER_LABEL_LENGTH)
  const modified = readBoundedString(value.modified, MAX_READER_LABEL_LENGTH)
  if (!id || !anchor || text === undefined || note === undefined || !created || !modified) {
    return undefined
  }
  if (!isReaderAnnotationStyle(value.style) || !isReaderAnnotationColorId(value.color)) {
    return undefined
  }
  return {
    id,
    anchor,
    text,
    note,
    style: value.style,
    color: value.color,
    created,
    modified,
  }
}

function readReaderBookmark(value: unknown): ReaderBookmark | undefined {
  if (!isObjectRecord(value)) return undefined
  const id = readBoundedString(value.id, MAX_READER_LABEL_LENGTH)
  const anchor = readReaderPositionAnchor(value.anchor)
  const label = readBoundedString(value.label, MAX_READER_LABEL_LENGTH)
  const created = readBoundedString(value.created, MAX_READER_LABEL_LENGTH)
  if (!id || !anchor || label === undefined || !created) return undefined
  return { id, anchor, label, created }
}

function legacyStorageSegment(value: string | undefined): string {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(LEGACY_STORAGE_SEGMENT_PATTERN, "-")
    .replace(LEGACY_STORAGE_EDGE_PATTERN, "")
}

function legacySourceName(source: ReaderSource): string {
  if (source.kind === "file") return source.file.name
  if (source.kind === "blob") return source.name
  if (source.name) return source.name
  try {
    const url = new URL(source.url)
    const pathSegment = url.pathname.split("/").findLast((part) => part.length > 0)
    return pathSegment ? decodeURIComponent(pathSegment) : source.sourceId
  } catch {
    return source.sourceId
  }
}

function legacyPdfPageIndex(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined
  const match = LEGACY_PDF_CFI_PAGE_PATTERN.exec(value)
  const step = match?.[1] ? Number(match[1]) : Number.NaN
  if (!Number.isSafeInteger(step) || step < 2 || step % 2 !== 0) return undefined
  return step / 2 - 1
}

function positionAnchorMatchesFormat(
  anchor: ReaderPositionAnchor,
  format: ReaderDocumentIdentity["format"],
): boolean {
  return format === "pdf" ? anchor.kind === "pdf-position" : anchor.kind === "cfi-position"
}

function textAnchorMatchesFormat(
  anchor: ReaderAnnotation["anchor"],
  format: ReaderDocumentIdentity["format"],
): boolean {
  return format === "pdf" ? anchor.kind === "pdf-text" : anchor.kind === "cfi-text"
}

function legacyRecordPageIndex(value: Record<string, unknown>): number | undefined {
  const cfiPageIndex = legacyPdfPageIndex(value.value)
  if (cfiPageIndex !== undefined) return cfiPageIndex
  return Number.isSafeInteger(value.index) && typeof value.index === "number" && value.index >= 0
    ? value.index
    : undefined
}

function legacyAnnotationStyle(value: unknown): ReaderAnnotationStyle {
  return isReaderAnnotationStyle(value) ? value : "highlight"
}

function legacyAnnotationColor(value: unknown): ReaderAnnotationColorId {
  if (isReaderAnnotationColorId(value)) return value
  if (value === ANNOTATION_COLORS.amber.value) return "amber"
  if (value === ANNOTATION_COLORS.mint.value) return "mint"
  if (value === ANNOTATION_COLORS.sky.value) return "sky"
  if (value === ANNOTATION_COLORS.rose.value) return "rose"
  return DEFAULT_ANNOTATION_COLOR_ID
}

function legacyString(value: unknown, maximumLength: number, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, maximumLength) : fallback
}

function readLegacyEpubBookmark(value: unknown): ReaderBookmark | undefined {
  if (!isObjectRecord(value)) return undefined
  const anchor = readReaderPositionAnchor({
    kind: READER_ANCHOR_KIND_CFI_POSITION,
    cfi: value.value,
  })
  if (!anchor || anchor.kind !== READER_ANCHOR_KIND_CFI_POSITION) return undefined
  return {
    id: anchor.cfi,
    anchor,
    label: legacyString(value.label, MAX_READER_LABEL_LENGTH, anchor.cfi),
    created: legacyString(value.created, MAX_READER_LABEL_LENGTH, LEGACY_RECORD_TIMESTAMP),
  }
}

function readLegacyEpubAnnotation(value: unknown): ReaderAnnotation | undefined {
  if (!isObjectRecord(value)) return undefined
  const sectionIndex =
    typeof value.index === "number" && Number.isSafeInteger(value.index) && value.index >= 0
      ? value.index
      : undefined
  const anchor = readReaderTextAnchor(
    Object.assign(
      {
        kind: READER_ANCHOR_KIND_CFI_TEXT,
        cfi: value.value,
      },
      sectionIndex !== undefined ? { sectionIndex } : undefined,
    ),
  )
  if (!anchor || anchor.kind !== READER_ANCHOR_KIND_CFI_TEXT) return undefined
  const created = legacyString(value.created, MAX_READER_LABEL_LENGTH, LEGACY_RECORD_TIMESTAMP)
  return {
    id: anchor.cfi,
    anchor,
    text: legacyString(value.text, MAX_READER_NOTE_LENGTH),
    note: legacyString(value.note, MAX_READER_NOTE_LENGTH),
    style: legacyAnnotationStyle(value.style),
    color: legacyAnnotationColor(value.color),
    created,
    modified: legacyString(value.modified, MAX_READER_LABEL_LENGTH, created),
  }
}

export function migrateLegacyEpubReaderBookState(
  source: ReaderSource,
  legacyState: LegacyEpubReaderBookStateInput,
): ReaderDocumentState {
  const lastLocation = readReaderPositionAnchor({
    kind: READER_ANCHOR_KIND_CFI_POSITION,
    cfi: legacyState.lastLocation,
  })
  return Object.assign(
    {
      version: READER_STATE_VERSION,
      identity: sourceIdentity(source),
      bookmarks: legacyState.bookmarks
        .slice(0, MAX_READER_BOOKMARKS)
        .map(readLegacyEpubBookmark)
        .filter((bookmark) => bookmark !== undefined),
      annotations: legacyState.annotations
        .slice(0, MAX_READER_ANNOTATIONS)
        .map(readLegacyEpubAnnotation)
        .filter((annotation) => annotation !== undefined),
    },
    lastLocation?.kind === READER_ANCHOR_KIND_CFI_POSITION ? { lastLocation } : undefined,
  )
}

export function readerDocumentStateToLegacyEpubBookState(
  state: ReaderDocumentState,
): LegacyEpubReaderBookState {
  const lastLocation =
    state.lastLocation?.kind === READER_ANCHOR_KIND_CFI_POSITION
      ? state.lastLocation.cfi
      : undefined
  return Object.assign(
    {
      bookmarks: state.bookmarks.flatMap((bookmark) =>
        bookmark.anchor.kind === READER_ANCHOR_KIND_CFI_POSITION
          ? [
              {
                value: bookmark.anchor.cfi,
                label: bookmark.label,
                created: bookmark.created,
              },
            ]
          : [],
      ),
      annotations: state.annotations.flatMap((annotation) =>
        annotation.anchor.kind === READER_ANCHOR_KIND_CFI_TEXT
          ? [
              Object.assign(
                {
                  value: annotation.anchor.cfi,
                  text: annotation.text,
                  note: annotation.note,
                  style: annotation.style,
                  color: ANNOTATION_COLORS[annotation.color].value,
                  created: annotation.created,
                  modified: annotation.modified,
                },
                annotation.anchor.sectionIndex !== undefined
                  ? { index: annotation.anchor.sectionIndex }
                  : undefined,
              ),
            ]
          : [],
      ),
    },
    lastLocation ? { lastLocation } : undefined,
  )
}

function readLegacyPdfBookmark(value: unknown, legacyIndex: number): ReaderBookmark | undefined {
  if (!isObjectRecord(value)) return undefined
  const pageIndex = legacyPdfPageIndex(value.value)
  if (pageIndex === undefined) return undefined
  return {
    id: `legacy_pdf_bookmark_${legacyIndex}`,
    anchor: { kind: "pdf-position", pageIndex, xRatio: 0, yRatio: 0 },
    label: legacyString(value.label, MAX_READER_LABEL_LENGTH, `Page ${pageIndex + 1}`),
    created: legacyString(value.created, MAX_READER_LABEL_LENGTH, LEGACY_RECORD_TIMESTAMP),
  }
}

function readLegacyPdfAnnotation(
  value: unknown,
  legacyIndex: number,
): ReaderAnnotation | undefined {
  if (!isObjectRecord(value)) return undefined
  const pageIndex = legacyRecordPageIndex(value)
  if (pageIndex === undefined) return undefined
  const text = legacyString(value.text, MAX_READER_NOTE_LENGTH)
  const note = legacyString(value.note, MAX_READER_NOTE_LENGTH)
  const created = legacyString(value.created, MAX_READER_LABEL_LENGTH, LEGACY_RECORD_TIMESTAMP)
  return {
    id: `legacy_pdf_annotation_${legacyIndex}`,
    anchor: {
      kind: "pdf-text",
      segments: [{ pageIndex, quads: [] }],
      quote: { exact: text || LEGACY_PDF_ANCHOR_QUOTE },
    },
    text,
    note,
    style: legacyAnnotationStyle(value.style),
    color: legacyAnnotationColor(value.color),
    created,
    modified: legacyString(value.modified, MAX_READER_LABEL_LENGTH, created),
  }
}

function findLegacyPdfStateKey(
  source: ReaderSource,
  persistenceSuffix: string | undefined,
): string | undefined {
  if (typeof window === "undefined") return undefined
  const sourceSegment = legacyStorageSegment(legacySourceName(source))
  const suffixSegment = legacyStorageSegment(persistenceSuffix)
  if (!sourceSegment) return undefined
  const matches: string[] = []
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(BOOK_STATE_STORAGE_KEY_PREFIX)) continue
      const segments = key.slice(BOOK_STATE_STORAGE_KEY_PREFIX.length).split("__")
      const sourceIndex = segments.lastIndexOf(sourceSegment)
      if (sourceIndex < 0) continue
      const expectedLastSegment = suffixSegment || sourceSegment
      if (segments.at(-1) !== expectedLastSegment) continue
      if (suffixSegment && sourceIndex >= segments.length - 1) continue
      matches.push(key)
    }
  } catch {
    return undefined
  }
  return matches.length === 1 ? matches[0] : undefined
}

function migrateLegacyPdfDocumentState(
  source: ReaderSource,
  persistenceSuffix: string | undefined,
): ReaderDocumentState | undefined {
  if (!isPdfReaderSource(source)) return undefined
  const legacyKey = findLegacyPdfStateKey(source, persistenceSuffix)
  if (!legacyKey) return undefined
  const value = parseJson(safeReadStorage(legacyKey))
  if (!isObjectRecord(value)) return undefined
  const bookmarks = Array.isArray(value.bookmarks)
    ? value.bookmarks
        .slice(0, MAX_READER_BOOKMARKS)
        .map(readLegacyPdfBookmark)
        .filter((bookmark) => bookmark !== undefined)
    : []
  const annotations = Array.isArray(value.annotations)
    ? value.annotations
        .slice(0, MAX_READER_ANNOTATIONS)
        .map(readLegacyPdfAnnotation)
        .filter((annotation) => annotation !== undefined)
    : []
  const lastPageIndex = legacyPdfPageIndex(value.lastLocation)
  const migrated: ReaderDocumentState = Object.assign(
    {
      version: READER_STATE_VERSION,
      identity: sourceIdentity(source),
      bookmarks,
      annotations,
    },
    lastPageIndex !== undefined
      ? {
          lastLocation: {
            kind: "pdf-position" as const,
            pageIndex: lastPageIndex,
            xRatio: 0,
            yRatio: 0,
          },
        }
      : undefined,
  )
  saveReaderDocumentState(source, migrated)
  return migrated
}

function sourceIdentity(source: ReaderSource): ReaderDocumentIdentity {
  return Object.assign(
    {
      sourceId: source.sourceId,
      format: isPdfReaderSource(source) ? ("pdf" as const) : ("epub" as const),
    },
    source.contentFingerprint ? { contentFingerprint: source.contentFingerprint } : undefined,
  )
}

export async function withReaderSourceContentFingerprint(
  source: ReaderSource,
): Promise<ReaderSource | undefined> {
  if (source.contentFingerprint) return source
  if (source.kind === "url" || !globalThis.crypto?.subtle) return undefined

  const blob = source.kind === "file" ? source.file : source.blob
  const existing = readerContentFingerprintPromises.get(blob)
  const fingerprintPromise = existing ?? hashReaderSourceBlob(blob)
  if (!existing) readerContentFingerprintPromises.set(blob, fingerprintPromise)
  const contentFingerprint = await fingerprintPromise
  return contentFingerprint ? { ...source, contentFingerprint } : undefined
}

async function hashReaderSourceBlob(blob: Blob): Promise<string | undefined> {
  try {
    const content = await blob.arrayBuffer()
    const digest = await globalThis.crypto.subtle.digest(
      READER_CONTENT_FINGERPRINT_ALGORITHM,
      content,
    )
    const value = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(HEXADECIMAL_RADIX).padStart(HEX_BYTE_LENGTH, "0"),
    ).join("")
    return `${READER_CONTENT_FINGERPRINT_PREFIX}${value}`
  } catch {
    return undefined
  }
}

export function readerDocumentStorageKey(sourceId: string): string {
  return `${READER_DOCUMENT_STORAGE_KEY_PREFIX}${encodeURIComponent(sourceId)}`
}

export function hasStoredReaderDocumentRecord(sourceId: string): boolean {
  return safeReadStorage(readerDocumentStorageKey(sourceId)) !== null
}

export function emptyReaderDocumentState(source: ReaderSource): ReaderDocumentState {
  return {
    version: READER_STATE_VERSION,
    identity: sourceIdentity(source),
    bookmarks: [],
    annotations: [],
  }
}

export function loadReaderDocumentState(
  source: ReaderSource,
  persistenceSuffix?: string,
): ReaderDocumentState {
  return (
    loadStoredReaderDocumentState(source) ??
    migrateLegacyPdfDocumentState(source, persistenceSuffix) ??
    emptyReaderDocumentState(source)
  )
}

export function loadStoredReaderDocumentState(
  source: ReaderSource,
): ReaderDocumentState | undefined {
  const empty = emptyReaderDocumentState(source)
  const value = parseJson(safeReadStorage(readerDocumentStorageKey(source.sourceId)))
  if (!isObjectRecord(value) || value.version !== READER_STATE_VERSION) return undefined
  const identity = value.identity
  if (!isObjectRecord(identity) || identity.sourceId !== source.sourceId) return undefined
  if (identity.format !== "pdf" && identity.format !== "epub") return undefined
  const format = identity.format
  if (format !== empty.identity.format) return undefined
  const storedFingerprint = readBoundedString(identity.contentFingerprint, MAX_READER_LABEL_LENGTH)
  if (identity.contentFingerprint !== undefined && storedFingerprint === undefined) {
    return undefined
  }
  if (source.contentFingerprint && identity.contentFingerprint !== source.contentFingerprint) {
    return undefined
  }
  const bookmarks = Array.isArray(value.bookmarks)
    ? value.bookmarks.slice(0, MAX_READER_BOOKMARKS).flatMap((entry) => {
        const bookmark = readReaderBookmark(entry)
        return bookmark && positionAnchorMatchesFormat(bookmark.anchor, format) ? [bookmark] : []
      })
    : []
  const annotations = Array.isArray(value.annotations)
    ? value.annotations.slice(0, MAX_READER_ANNOTATIONS).flatMap((entry) => {
        const annotation = readReaderAnnotation(entry)
        return annotation && textAnchorMatchesFormat(annotation.anchor, format) ? [annotation] : []
      })
    : []
  const parsedLastLocation = readReaderPositionAnchor(value.lastLocation)
  const lastLocation =
    parsedLastLocation && positionAnchorMatchesFormat(parsedLastLocation, format)
      ? parsedLastLocation
      : undefined
  const pdfMode = readPdfReaderMode(value.pdfMode)
  return Object.assign(
    {
      version: READER_STATE_VERSION,
      identity: sourceIdentity(source),
      bookmarks,
      annotations,
    },
    lastLocation ? { lastLocation } : undefined,
    pdfMode ? { pdfMode } : undefined,
  )
}

export function saveReaderDocumentState(source: ReaderSource, state: ReaderDocumentState): void {
  safeWriteStorage(
    readerDocumentStorageKey(source.sourceId),
    JSON.stringify({
      ...state,
      version: READER_STATE_VERSION,
      identity: sourceIdentity(source),
    }),
  )
}

export function createReaderRecordId(prefix: "annotation" | "bookmark" | "selection"): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`
  }
  const random = Math.random()
    .toString(36)
    .slice(2, 2 + FALLBACK_ID_RANDOM_LENGTH)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}

export function clampPdfCustomScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PDF_CUSTOM_SCALE
  return Math.max(MIN_PDF_CUSTOM_SCALE, Math.min(MAX_PDF_CUSTOM_SCALE, value))
}

export function createLocalReaderStateRepository(): ReaderStateRepository {
  return {
    loadPreferences: loadReaderPreferences,
    savePreferences: saveReaderPreferences,
    loadDocument: loadReaderDocumentState,
    saveDocument: saveReaderDocumentState,
  }
}
