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
import { formatContributor, formatMetadataValue } from "./foliate-formatters"
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

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return isObjectRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function safeReadStorage(key: string) {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeWriteStorage(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

function isFoliateReaderThemeId(value: string): value is FoliateReaderThemeId {
  return (
    value === "paper" ||
    value === "sepia" ||
    value === "night" ||
    value === "mist" ||
    value === "graphite"
  )
}

function isFoliateReaderFlow(value: unknown): value is FoliateReaderFlow {
  return value === FLOW_PAGINATED || value === FLOW_SCROLLED
}

function isFoliateReaderFontPreset(
  value: unknown,
): value is FoliateReaderPreferences["fontPreset"] {
  return value === FONT_PUBLISHER || value === FONT_SERIF || value === FONT_SANS
}

export function isReaderBookmark(value: unknown): value is ReaderBookmark {
  return (
    isObjectRecord(value) &&
    "value" in value &&
    "label" in value &&
    "created" in value &&
    typeof value.value === "string" &&
    typeof value.label === "string" &&
    typeof value.created === "string"
  )
}

export function isReaderAnnotation(value: unknown): value is ReaderAnnotation {
  return isObjectRecord(value) && "value" in value && typeof value.value === "string"
}

export function loadGlobalPreferences(
  defaultTheme: FoliateReaderThemeId,
  defaultFlow: FoliateReaderFlow,
): FoliateReaderPreferences {
  const parsed = parseJsonObject(safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY))
  const flow = parsed?.flow
  const fontPreset = parsed?.fontPreset
  const legacyThemeId =
    typeof parsed?.themeId === "string" && isFoliateReaderThemeId(parsed.themeId)
      ? parsed.themeId
      : defaultTheme
  const readerPreferences = loadReaderPreferences(legacyThemeId)
  return {
    themeId: readerPreferences.themeId,
    flow: isFoliateReaderFlow(flow) ? flow : defaultFlow,
    fontPreset: isFoliateReaderFontPreset(fontPreset) ? fontPreset : FONT_SERIF,
    fontScaleRem:
      typeof parsed?.fontScaleRem === "number"
        ? clamp(parsed.fontScaleRem, 0.85, 1.4)
        : DEFAULT_FONT_SCALE_REM,
    lineHeight:
      typeof parsed?.lineHeight === "number"
        ? clamp(parsed.lineHeight, 1.2, 2)
        : DEFAULT_LINE_HEIGHT,
    marginPx:
      typeof parsed?.marginPx === "number" ? clamp(parsed.marginPx, 16, 120) : DEFAULT_MARGIN_PX,
    gapPercent:
      typeof parsed?.gapPercent === "number"
        ? clamp(parsed.gapPercent, 0, 18)
        : DEFAULT_GAP_PERCENT,
    maxInlineSizePx:
      typeof parsed?.maxInlineSizePx === "number"
        ? clamp(parsed.maxInlineSizePx, 520, 1100)
        : DEFAULT_MAX_INLINE_SIZE_PX,
    maxBlockSizePx:
      typeof parsed?.maxBlockSizePx === "number"
        ? clamp(parsed.maxBlockSizePx, 900, 2200)
        : DEFAULT_MAX_BLOCK_SIZE_PX,
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
  const parsed = parseJsonObject(safeReadStorage(bookKey))
  const bookmarks = Array.isArray(parsed?.bookmarks)
    ? parsed.bookmarks.filter(isReaderBookmark)
    : []
  const annotations = Array.isArray(parsed?.annotations)
    ? parsed.annotations.filter(isReaderAnnotation)
    : []
  const lastLocation = typeof parsed?.lastLocation === "string" ? parsed.lastLocation : undefined
  return {
    lastLocation,
    bookmarks,
    annotations,
  }
}

export function saveBookState(
  bookKey: string,
  state: FoliateBookState,
) {
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
  const identifier = formatMetadataValue(book.metadata?.identifier)
  const title = formatMetadataValue(book.metadata?.title)
  const author =
    formatContributor(book.metadata?.author) ?? formatContributor(book.metadata?.contributor)
  const sourceName = getSourceName(source)
  const pieces = [identifier, title, author, sourceName, suffix]
    .map(normalizeStorageSegment)
    .filter(Boolean)
  return `${BOOK_STATE_STORAGE_KEY_PREFIX}${pieces.join("__") || "unknown"}`
}
