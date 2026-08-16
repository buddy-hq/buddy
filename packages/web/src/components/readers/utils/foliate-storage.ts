import { z } from "zod"
import {
  BOOK_STATE_STORAGE_KEY_PREFIX,
  DEFAULT_FONT_SCALE_REM,
  DEFAULT_GAP_PERCENT,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_MARGIN_PX,
  DEFAULT_MAX_BLOCK_SIZE_PX,
  DEFAULT_MAX_INLINE_SIZE_PX,
  GLOBAL_PREFERENCES_STORAGE_KEY,
  FONT_PUBLISHER,
  FONT_SANS,
  FONT_SERIF,
  FLOW_PAGINATED,
  FLOW_SCROLLED,
} from "../foliate-reader-constants"
import type {
  FoliateReaderFlow,
  FoliateReaderPreferences,
  FoliateReaderSource,
  FoliateReaderThemeId,
  ReaderAnnotation,
  ReaderBookmark,
} from "../foliate-reader-types"
import type { FoliateBook } from "foliate-js/view.js"
import { clamp, getSourceName } from "./foliate-helpers"
import {
  FoliateMetadataValueSchema,
  formatContributor,
  formatMetadataValue,
} from "./foliate-formatters"
import {
  hasStoredReaderDocumentRecord,
  loadReaderPreferences,
  loadStoredReaderDocumentState,
  migrateLegacyEpubReaderBookState,
  readerDocumentStateToLegacyEpubBookState,
  saveReaderDocumentState,
  saveReaderPreferences,
} from "../reader-storage"
import { isPdfReaderSource, type ReaderSource } from "../reader-types"

export type FoliateBookState = {
  lastLocation?: string
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
}

export type FoliateBookPersistenceTarget = {
  bookKey: string
  readerSource?: ReaderSource
}

const FoliateReaderThemeIdSchema = z.enum(["paper", "sepia", "night", "mist", "graphite"])
const FoliateReaderFlowSchema = z.union([z.literal(FLOW_PAGINATED), z.literal(FLOW_SCROLLED)])
const FoliateReaderFontPresetSchema = z.union([
  z.literal(FONT_PUBLISHER),
  z.literal(FONT_SERIF),
  z.literal(FONT_SANS),
])

const FoliatePreferencesSchema = z.object({
  themeId: FoliateReaderThemeIdSchema.optional(),
  flow: FoliateReaderFlowSchema.optional(),
  fontPreset: FoliateReaderFontPresetSchema.optional(),
  fontScaleRem: z.number().optional(),
  lineHeight: z.number().optional(),
  marginPx: z.number().optional(),
  gapPercent: z.number().optional(),
  maxInlineSizePx: z.number().optional(),
  maxBlockSizePx: z.number().optional(),
  justify: z.boolean().optional(),
  hyphenate: z.boolean().optional(),
})

const FoliateBookmarkSchema = z.object({
  value: z.string(),
  label: z.string(),
  created: z.string(),
})

const FoliateAnnotationSchema = z.object({
  value: z.string(),
  color: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  style: z.string().optional(),
  label: z.string().optional(),
  index: z.number().optional(),
})

const FoliateBookStateSchema = z.object({
  lastLocation: z.string().optional(),
  bookmarks: z.array(FoliateBookmarkSchema).optional(),
  annotations: z.array(FoliateAnnotationSchema).optional(),
})

function parseStoredJson<T>(raw: string | null, schema: z.ZodType<T>): T | undefined {
  if (!raw) return undefined
  try {
    const result = schema.safeParse(JSON.parse(raw))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

export function safeReadStorage(key: string) {
  try {
    return globalThis.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeWriteStorage(key: string, value: string) {
  try {
    globalThis.localStorage.setItem(key, value)
  } catch {}
}

export function loadGlobalPreferences(
  defaultTheme: FoliateReaderThemeId,
  defaultFlow: FoliateReaderFlow,
): FoliateReaderPreferences {
  const parsed = parseStoredJson(safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY), FoliatePreferencesSchema)
  const legacyThemeId = parsed?.themeId ?? defaultTheme
  const readerPreferences = loadReaderPreferences(legacyThemeId)
  return {
    themeId: readerPreferences.themeId,
    flow: parsed?.flow ?? defaultFlow,
    fontPreset: parsed?.fontPreset ?? FONT_SERIF,
    fontScaleRem:
      parsed?.fontScaleRem === undefined
        ? DEFAULT_FONT_SCALE_REM
        : clamp(parsed.fontScaleRem, 0.85, 1.4),
    lineHeight:
      parsed?.lineHeight === undefined ? DEFAULT_LINE_HEIGHT : clamp(parsed.lineHeight, 1.2, 2),
    marginPx: parsed?.marginPx === undefined ? DEFAULT_MARGIN_PX : clamp(parsed.marginPx, 16, 120),
    gapPercent:
      parsed?.gapPercent === undefined ? DEFAULT_GAP_PERCENT : clamp(parsed.gapPercent, 0, 18),
    maxInlineSizePx:
      parsed?.maxInlineSizePx === undefined
        ? DEFAULT_MAX_INLINE_SIZE_PX
        : clamp(parsed.maxInlineSizePx, 520, 1100),
    maxBlockSizePx:
      parsed?.maxBlockSizePx === undefined
        ? DEFAULT_MAX_BLOCK_SIZE_PX
        : clamp(parsed.maxBlockSizePx, 900, 2200),
    justify: parsed?.justify !== false,
    hyphenate: parsed?.hyphenate !== false,
    reduceMotion: readerPreferences.reduceMotion,
    autohideCursor: readerPreferences.autohideCursor,
  }
}

export function saveGlobalPreferences(preferences: FoliateReaderPreferences) {
  safeWriteStorage(GLOBAL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  const readerPreferences = loadReaderPreferences(preferences.themeId)
  saveReaderPreferences({
    ...readerPreferences,
    themeId: preferences.themeId,
    reduceMotion: preferences.reduceMotion,
    autohideCursor: preferences.autohideCursor,
  })
}

export function loadBookState(bookKey: string): FoliateBookState {
  const parsed = parseStoredJson(safeReadStorage(bookKey), FoliateBookStateSchema)
  return {
    lastLocation: parsed?.lastLocation,
    bookmarks: parsed?.bookmarks ?? [],
    annotations: parsed?.annotations ?? [],
  }
}

export function saveBookState(bookKey: string, state: FoliateBookState) {
  safeWriteStorage(bookKey, JSON.stringify(state))
}

export function loadMirroredEpubBookState(
  bookKey: string,
  source: ReaderSource,
): ReturnType<typeof loadBookState> {
  if (isPdfReaderSource(source)) return loadBookState(bookKey)
  if (!source.contentFingerprint) return loadBookState(bookKey)

  const hadStoredMirror = hasStoredReaderDocumentRecord(source.sourceId)
  const storedState = loadStoredReaderDocumentState(source)
  if (storedState) {
    const mirroredState = readerDocumentStateToLegacyEpubBookState(storedState)
    saveBookState(bookKey, mirroredState)
    return mirroredState
  }

  if (hadStoredMirror) {
    const resetState: FoliateBookState = {
      bookmarks: [],
      annotations: [],
    }
    saveBookState(bookKey, resetState)
    saveReaderDocumentState(source, migrateLegacyEpubReaderBookState(source, resetState))
    return resetState
  }

  const legacyState = loadBookState(bookKey)
  const migratedState = migrateLegacyEpubReaderBookState(source, legacyState)
  saveReaderDocumentState(source, migratedState)
  return readerDocumentStateToLegacyEpubBookState(migratedState)
}

export function saveMirroredEpubBookState(
  bookKey: string,
  source: ReaderSource,
  state: FoliateBookState,
): void {
  saveBookState(bookKey, state)
  if (isPdfReaderSource(source) || !source.contentFingerprint) return
  saveReaderDocumentState(source, migrateLegacyEpubReaderBookState(source, state))
}

export function saveFoliateBookPersistenceTarget(
  target: FoliateBookPersistenceTarget,
  state: FoliateBookState,
): void {
  if (target.readerSource) {
    saveMirroredEpubBookState(target.bookKey, target.readerSource, state)
    return
  }
  saveBookState(target.bookKey, state)
}

export function normalizeStorageSegment(value: string | undefined) {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildBookPersistenceKey(
  source: FoliateReaderSource,
  book: FoliateBook,
  suffix?: string,
): string {
  const identifierParsed = FoliateMetadataValueSchema.safeParse(book.metadata?.identifier)
  const titleParsed = FoliateMetadataValueSchema.safeParse(book.metadata?.title)
  const authorParsed = FoliateMetadataValueSchema.safeParse(book.metadata?.author)
  const contributorParsed = FoliateMetadataValueSchema.safeParse(book.metadata?.contributor)
  const identifier = identifierParsed.success ? formatMetadataValue(identifierParsed.data) : undefined
  const title = titleParsed.success ? formatMetadataValue(titleParsed.data) : undefined
  const author = authorParsed.success
    ? formatContributor(authorParsed.data)
    : contributorParsed.success
      ? formatContributor(contributorParsed.data)
      : undefined
  const sourceName = getSourceName(source)
  const pieces = [identifier, title, author, sourceName, suffix]
    .map(normalizeStorageSegment)
    .filter(Boolean)
  return `${BOOK_STATE_STORAGE_KEY_PREFIX}${pieces.join("__") || "unknown"}`
}
