import { z } from "zod"
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
  FLOW_SCROLLED,
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

export type ReaderStateRepository = {
  loadPreferences: (defaultTheme: ReaderThemeId) => ReaderPreferences
  savePreferences: (preferences: ReaderPreferences) => void
  loadDocument: (source: ReaderSource, persistenceSuffix?: string) => ReaderDocumentState
  saveDocument: (source: ReaderSource, state: ReaderDocumentState) => void
}

const ReaderThemeIdSchema = z.enum(["paper", "sepia", "night", "mist", "graphite"])
const PdfReaderLayoutSchema = z.enum(["continuous", "single-page", "two-up"])
const PdfReaderScaleModeSchema = z.enum(["fit-width", "fit-page", "custom"])
const PdfReaderRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
])
const ReaderAnnotationStyleSchema = z.enum(["highlight", "underline", "squiggly", "strikethrough"])
const ReaderAnnotationColorIdSchema = z.enum(["amber", "mint", "sky", "rose"])
const FoliateFlowSchema = z.union([z.literal(FLOW_PAGINATED), z.literal(FLOW_SCROLLED)])

const PdfReaderModeSchema = z
  .object({
    layout: PdfReaderLayoutSchema,
    scaleMode: PdfReaderScaleModeSchema,
    rotation: PdfReaderRotationSchema,
    scale: z.number().finite().min(MIN_PDF_CUSTOM_SCALE).max(MAX_PDF_CUSTOM_SCALE).optional(),
  })
  .refine((mode) => mode.scaleMode !== "custom" || mode.scale !== undefined)

const StoredPreferencesSchema = z.object({
  themeId: ReaderThemeIdSchema.optional(),
  reduceMotion: z.boolean().optional(),
  autohideCursor: z.boolean().optional(),
  pdfMode: PdfReaderModeSchema.optional(),
})

// Loose on purpose. saveReaderPreferences reads this record, merges three fields over it, and
// writes it back to the shared foliate key, which also holds marginPx, fontScaleRem, lineHeight,
// gapPercent, maxInlineSizePx, maxBlockSizePx, justify and hyphenate. A non-loose z.object strips
// undeclared keys, so the write-back would delete those eight preferences from storage. Origin
// spread the whole raw record (`isObjectRecord(legacyValue) ? legacyValue : {}`).
const LegacyPreferencesSchema = z.looseObject({
  themeId: ReaderThemeIdSchema.optional().catch(undefined),
  reduceMotion: z.boolean().optional().catch(undefined),
  autohideCursor: z.boolean().optional().catch(undefined),
  flow: FoliateFlowSchema.optional().catch(undefined),
})

const StoredBookmarkSchema = z.object({
  id: z.string().max(MAX_READER_LABEL_LENGTH),
  anchor: z.unknown(),
  label: z.string().max(MAX_READER_LABEL_LENGTH),
  created: z.string().max(MAX_READER_LABEL_LENGTH),
})

const StoredAnnotationSchema = z.object({
  id: z.string().max(MAX_READER_LABEL_LENGTH),
  anchor: z.unknown(),
  text: z.string().max(MAX_READER_NOTE_LENGTH),
  note: z.string().max(MAX_READER_NOTE_LENGTH),
  style: ReaderAnnotationStyleSchema,
  color: ReaderAnnotationColorIdSchema,
  created: z.string().max(MAX_READER_LABEL_LENGTH),
  modified: z.string().max(MAX_READER_LABEL_LENGTH),
})

const ReaderDocumentIdentitySchema = z.object({
  sourceId: z.string(),
  format: z.enum(["epub", "pdf"]),
  contentFingerprint: z.string().max(MAX_READER_LABEL_LENGTH).optional(),
})

// `version` and `identity` are the envelope and must hold. Everything else is read
// independently so one stale sibling — a bookmark missing `created`, a pdfMode whose
// custom scaleMode lost its scale — cannot discard the saved reading position.
// Items are validated per entry below by readReaderBookmark / readReaderAnnotation.
const StoredDocumentStateSchema = z.object({
  version: z.literal(READER_STATE_VERSION),
  identity: ReaderDocumentIdentitySchema,
  lastLocation: z.unknown().optional(),
  bookmarks: z
    .array(StoredBookmarkSchema.optional().catch(undefined))
    .max(MAX_READER_BOOKMARKS)
    .optional()
    .catch(undefined),
  annotations: z
    .array(StoredAnnotationSchema.optional().catch(undefined))
    .max(MAX_READER_ANNOTATIONS)
    .optional()
    .catch(undefined),
  pdfMode: PdfReaderModeSchema.optional().catch(undefined),
})

const LegacyPdfRecordSchema = z.object({
  value: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
})

const LegacyPdfBookStateSchema = z.object({
  lastLocation: z.string().optional(),
  bookmarks: z.array(LegacyPdfRecordSchema).optional(),
  annotations: z.array(LegacyPdfRecordSchema).optional(),
})

type TStoredBookmark = z.infer<typeof StoredBookmarkSchema>
type TStoredAnnotation = z.infer<typeof StoredAnnotationSchema>
type TLegacyPreferences = z.infer<typeof LegacyPreferencesSchema>
type TLegacyPdfRecord = z.infer<typeof LegacyPdfRecordSchema>

function parseStoredJson<T>(raw: string | null, schema: z.ZodType<T>): T | undefined {
  if (!raw) return undefined
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function safeReadStorage(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWriteStorage(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value)
  } catch {
    // Reader state is best-effort when local storage is unavailable or full.
  }
}

function readPdfReaderMode(
  value: z.infer<typeof PdfReaderModeSchema> | undefined,
): PdfReaderMode | undefined {
  return value
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
  const value = parseStoredJson(
    safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY),
    LegacyPreferencesSchema,
  )
  if (!value) return defaults
  return {
    themeId: value.themeId ?? defaults.themeId,
    reduceMotion: value.reduceMotion === true,
    autohideCursor: value.autohideCursor === true,
    pdfMode: defaults.pdfMode,
  }
}

export function loadReaderPreferences(defaultTheme: ReaderThemeId): ReaderPreferences {
  const legacy = readLegacyPreferences(defaultTheme)
  const value = parseStoredJson(
    safeReadStorage(READER_PREFERENCES_STORAGE_KEY),
    StoredPreferencesSchema,
  )
  if (!value) return legacy
  return {
    themeId: value.themeId ?? legacy.themeId,
    reduceMotion: value.reduceMotion ?? legacy.reduceMotion,
    autohideCursor: value.autohideCursor ?? legacy.autohideCursor,
    pdfMode: readPdfReaderMode(value.pdfMode) ?? legacy.pdfMode,
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences): void {
  safeWriteStorage(READER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))

  const legacyValue =
    parseStoredJson(safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY), LegacyPreferencesSchema) ??
    ({} satisfies TLegacyPreferences)
  safeWriteStorage(
    GLOBAL_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      ...legacyValue,
      themeId: preferences.themeId,
      reduceMotion: preferences.reduceMotion,
      autohideCursor: preferences.autohideCursor,
      flow: legacyValue.flow ?? FLOW_PAGINATED,
    }),
  )
}

function readReaderAnnotation(value: TStoredAnnotation): ReaderAnnotation | undefined {
  const anchor = readReaderTextAnchor(value.anchor)
  if (!anchor) return undefined
  return {
    id: value.id,
    anchor,
    text: value.text,
    note: value.note,
    style: value.style,
    color: value.color,
    created: value.created,
    modified: value.modified,
  }
}

function readReaderBookmark(value: TStoredBookmark): ReaderBookmark | undefined {
  const anchor = readReaderPositionAnchor(value.anchor)
  if (!anchor) return undefined
  return {
    id: value.id,
    anchor,
    label: value.label,
    created: value.created,
  }
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

function legacyPdfPageIndex(value: string): number | undefined {
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

function legacyRecordPageIndex(value: TLegacyPdfRecord): number | undefined {
  const cfiPageIndex = value.value === undefined ? undefined : legacyPdfPageIndex(value.value)
  if (cfiPageIndex !== undefined) return cfiPageIndex
  return value.index
}

function legacyAnnotationStyle(value: string | undefined): ReaderAnnotationStyle {
  const parsed = ReaderAnnotationStyleSchema.safeParse(value)
  return parsed.success ? parsed.data : "highlight"
}

function legacyAnnotationColor(value: string | undefined): ReaderAnnotationColorId {
  const parsed = ReaderAnnotationColorIdSchema.safeParse(value)
  if (parsed.success) return parsed.data
  if (value === ANNOTATION_COLORS.amber.value) return "amber"
  if (value === ANNOTATION_COLORS.mint.value) return "mint"
  if (value === ANNOTATION_COLORS.sky.value) return "sky"
  if (value === ANNOTATION_COLORS.rose.value) return "rose"
  return DEFAULT_ANNOTATION_COLOR_ID
}

function legacyString(value: string | undefined, maximumLength: number, fallback = ""): string {
  return value === undefined ? fallback : value.slice(0, maximumLength)
}

function readLegacyEpubBookmark(value: LegacyEpubReaderBookmark): ReaderBookmark | undefined {
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

function readLegacyEpubAnnotation(value: LegacyEpubReaderAnnotation): ReaderAnnotation | undefined {
  const sectionIndex = value.index
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
  legacyState: LegacyEpubReaderBookState,
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

function readLegacyPdfBookmark(
  value: TLegacyPdfRecord,
  legacyIndex: number,
): ReaderBookmark | undefined {
  if (value.value === undefined) return undefined
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
  value: TLegacyPdfRecord,
  legacyIndex: number,
): ReaderAnnotation | undefined {
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
  const sourceSegment = legacyStorageSegment(legacySourceName(source))
  const suffixSegment = legacyStorageSegment(persistenceSuffix)
  if (!sourceSegment) return undefined
  const matches: string[] = []
  try {
    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index)
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
  const value = parseStoredJson(safeReadStorage(legacyKey), LegacyPdfBookStateSchema)
  if (!value) return undefined
  const bookmarks = (value.bookmarks ?? [])
    .slice(0, MAX_READER_BOOKMARKS)
    .map(readLegacyPdfBookmark)
    .filter((bookmark) => bookmark !== undefined)
  const annotations = (value.annotations ?? [])
    .slice(0, MAX_READER_ANNOTATIONS)
    .map(readLegacyPdfAnnotation)
    .filter((annotation) => annotation !== undefined)
  const lastPageIndex =
    value.lastLocation === undefined ? undefined : legacyPdfPageIndex(value.lastLocation)
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
  const value = parseStoredJson(
    safeReadStorage(readerDocumentStorageKey(source.sourceId)),
    StoredDocumentStateSchema,
  )
  if (!value) return undefined
  const identity = value.identity
  if (identity.sourceId !== source.sourceId) return undefined
  const format = identity.format
  if (format !== empty.identity.format) return undefined
  if (source.contentFingerprint && identity.contentFingerprint !== source.contentFingerprint) {
    return undefined
  }
  const bookmarks = (value.bookmarks ?? []).slice(0, MAX_READER_BOOKMARKS).flatMap((entry) => {
    if (entry === undefined) return []
    const bookmark = readReaderBookmark(entry)
    return bookmark && positionAnchorMatchesFormat(bookmark.anchor, format) ? [bookmark] : []
  })
  const annotations = (value.annotations ?? [])
    .slice(0, MAX_READER_ANNOTATIONS)
    .flatMap((entry) => {
      if (entry === undefined) return []
      const annotation = readReaderAnnotation(entry)
      return annotation && textAnchorMatchesFormat(annotation.anchor, format) ? [annotation] : []
    })
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
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}_${uuid}`
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
