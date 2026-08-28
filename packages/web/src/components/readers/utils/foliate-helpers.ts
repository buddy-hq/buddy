import { z } from "zod"
import type {
  FoliateNavigationTarget,
  FoliateReaderLocation,
  FoliateReaderSource,
  ReaderAnnotation,
  ReaderAnnotationColorId,
  ReaderBookmark,
  FoliateReaderLandmark,
  FoliateReaderAnnotationStyle,
  MetadataRow,
} from "../foliate-reader-types"
import type {
  FoliateBook,
  FoliateMetadata,
  FoliateNavigationTarget as FoliateEngineNavigationTarget,
  FoliateResolvedNavigation,
  FoliateSection,
  FoliateTocItem,
  FoliateRelocationDetail,
} from "foliate-js/view.js"
import {
  ANNOTATION_COLORS,
  ANNOTATION_COLOR_IDS,
  ANNOTATION_COLOR_TOKENS,
  ANNOTATION_STYLE_HIGHLIGHT,
  ANNOTATION_STYLE_STRIKETHROUGH,
  ANNOTATION_STYLE_SQUIGGLY,
  ANNOTATION_STYLE_UNDERLINE,
  DEPENDENCY_KEY_EMPTY,
  DEPENDENCY_KEY_KIND_REFERENCE,
  DEPENDENCY_KEY_SEPARATOR,
  DEPENDENCY_REFERENCE_ID_START,
  METADATA_FIELDS,
} from "../foliate-reader-constants"
import {
  formatMetadataValue,
  FoliateMetadataValueSchema,
  toPercentLabel,
} from "./foliate-formatters"
import type { View as FoliateView } from "foliate-js/view.js"

// ============================================================
// Dependency Tracking
// ============================================================

type TDependencyHost = File | Blob | FoliateBook | { fraction: number }

const dependencyReferenceIds = new WeakMap<TDependencyHost, number>()
let nextDependencyReferenceId = DEPENDENCY_REFERENCE_ID_START

export function getDependencyReferenceId(reference: TDependencyHost): number {
  const existingId = dependencyReferenceIds.get(reference)
  if (existingId) return existingId
  const createdId = nextDependencyReferenceId
  nextDependencyReferenceId += 1
  dependencyReferenceIds.set(reference, createdId)
  return createdId
}

export function buildSourceDependencyKey(source: FoliateReaderSource | null): string {
  if (!source) return DEPENDENCY_KEY_EMPTY

  switch (source.kind) {
    case "file":
      return [
        source.kind,
        getDependencyReferenceId(source.file),
        source.file.name,
        source.file.lastModified,
      ].join(DEPENDENCY_KEY_SEPARATOR)
    case "blob":
      return [
        source.kind,
        getDependencyReferenceId(source.blob),
        source.name,
        source.blob.type,
        source.blob.size,
      ].join(DEPENDENCY_KEY_SEPARATOR)
    case "url":
      return [source.kind, source.url, source.name ?? ""].join(DEPENDENCY_KEY_SEPARATOR)
    case "book":
      return [source.kind, getDependencyReferenceId(source.book), source.name ?? ""].join(
        DEPENDENCY_KEY_SEPARATOR,
      )
  }
}

export function buildNavigationTargetDependencyKey(
  target: FoliateNavigationTarget | undefined,
): string {
  if (target === undefined || target === null) return DEPENDENCY_KEY_EMPTY

  if (target instanceof Object) {
    return [DEPENDENCY_KEY_KIND_REFERENCE, getDependencyReferenceId(target)].join(
      DEPENDENCY_KEY_SEPARATOR,
    )
  }

  const asNumber = z.number().safeParse(target)
  if (asNumber.success) {
    return ["number", String(asNumber.data)].join(DEPENDENCY_KEY_SEPARATOR)
  }

  return ["string", String(target)].join(DEPENDENCY_KEY_SEPARATOR)
}

// ============================================================
// Source Helpers
// ============================================================

export function fileNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] ?? path
}

export function getSourceName(source: FoliateReaderSource): string {
  switch (source.kind) {
    case "file":
      return source.file.name
    case "blob":
      return source.name
    case "url": {
      if (source.name) return source.name
      try {
        return fileNameFromPath(new URL(source.url, window.location.href).pathname)
      } catch {
        return source.url
      }
    }
    case "book":
      return source.name ?? "Book"
  }
}

export function getSourceFormatLabel(source: FoliateReaderSource): string {
  const name = getSourceName(source)
  if (!name) return "Book"

  const lowerName = name.toLowerCase()
  const lastDot = lowerName.lastIndexOf(".")
  if (lastDot < 0 || lastDot === lowerName.length - 1) return "Book"
  return lowerName.slice(lastDot + 1).toUpperCase()
}

export function toFoliateInput(source: FoliateReaderSource): string | Blob | File | FoliateBook {
  switch (source.kind) {
    case "file":
      return source.file
    case "blob":
      return new File([source.blob], source.name, { type: source.blob.type })
    case "url":
      return source.url
    case "book":
      return source.book
  }
}

type FoliateNavigationResolver = {
  book: FoliateBook
  resolveNavigation: (
    target: FoliateEngineNavigationTarget,
  ) => { index: number } | undefined | Promise<{ index: number } | undefined>
}

const EPUB_NAV_DOCUMENT_PATTERN = /(?:^|\/)nav\.x?html?$/i

function isNavigationSection(section: FoliateSection): boolean {
  const sectionIdResult = z.string().safeParse(section.id)
  const sectionId = sectionIdResult.success ? sectionIdResult.data.split(/[?#]/, 1)[0] : ""
  return EPUB_NAV_DOCUMENT_PATTERN.test(sectionId ?? "")
}

function canRestoreSection(section: FoliateSection | undefined): boolean {
  if (!section || section.linear === "no") return false
  return !isNavigationSection(section)
}

function findFirstRestorableSectionIndex(
  sections: FoliateSection[],
  startIndex = 0,
): number | undefined {
  for (let index = startIndex; index < sections.length; index += 1) {
    if (canRestoreSection(sections[index])) return index
  }
  return undefined
}

function getTargetSectionCfi(target: FoliateEngineNavigationTarget): string | undefined {
  const asCfi = z.string().safeParse(target)
  if (!asCfi.success || !asCfi.data.startsWith("epubcfi(")) return undefined
  const indirectionIndex = asCfi.data.indexOf("!")
  if (indirectionIndex < 0) return asCfi.data
  return `${asCfi.data.slice(0, indirectionIndex)})`
}

function getCanonicalSectionIndex(
  book: FoliateBook,
  target: FoliateEngineNavigationTarget,
): number | undefined {
  const targetSectionCfi = getTargetSectionCfi(target)
  if (!targetSectionCfi) return undefined
  const index = book.sections.findIndex((section) => section.cfi === targetSectionCfi)
  return index >= 0 ? index : undefined
}

export type FoliateCanonicalResolvedNavigation = FoliateResolvedNavigation & {
  nativeIndex: number
}

/**
 * Foliate builds EPUB CFIs from the unfiltered package spine but exposes a filtered `sections`
 * array. If a spine item references a missing manifest entry, a CFI can round-trip to the wrong
 * renderer index. Keep Foliate's anchor function, but make the exposed section CFI authoritative.
 */
export async function resolveCanonicalNavigationTarget(
  view: FoliateNavigationResolver,
  target: FoliateEngineNavigationTarget,
): Promise<FoliateCanonicalResolvedNavigation | undefined> {
  const resolved = await view.resolveNavigation(target)
  if (!resolved) return undefined
  const canonicalIndex = getCanonicalSectionIndex(view.book, target)
  return {
    ...resolved,
    index: canonicalIndex ?? resolved.index,
    nativeIndex: resolved.index,
  }
}

/**
 * Some generated EPUBs incorrectly place an empty nav.xhtml in the linear spine. A persisted CFI
 * into that document is technically resolvable, so Foliate restores it as a blank reading page.
 * Preserve valid targets, but move malformed navigation-only targets to the next readable section.
 */
export async function resolveRestorableNavigationTarget(
  view: FoliateNavigationResolver,
  target: FoliateEngineNavigationTarget | undefined,
): Promise<FoliateEngineNavigationTarget | undefined> {
  if (target === undefined) {
    return findFirstRestorableSectionIndex(view.book.sections)
  }

  let resolved
  try {
    resolved = await resolveCanonicalNavigationTarget(view, target)
  } catch {
    return target
  }
  if (!resolved) return target

  const sectionIndex = resolved.index
  if (canRestoreSection(view.book.sections[sectionIndex])) {
    // A numeric target is intentional here. Passing the original CFI back into Foliate would
    // resolve it through the unfiltered package spine again and reopen the adjacent section.
    return resolved.nativeIndex === sectionIndex ? target : sectionIndex
  }

  return findFirstRestorableSectionIndex(view.book.sections, sectionIndex + 1) ?? target
}

// ============================================================
// Metadata Helpers
// ============================================================

export function buildMetadataRows(metadata?: FoliateMetadata): MetadataRow[] {
  if (!metadata) return []

  const rows: MetadataRow[] = []
  for (const field of METADATA_FIELDS) {
    const parsed = FoliateMetadataValueSchema.safeParse(metadata[field.key])
    if (!parsed.success) continue
    const value = formatMetadataValue(parsed.data)
    if (!value) continue
    rows.push({
      key: String(field.key),
      label: field.label,
      value,
    })
  }
  return rows
}

export function flattenTocItems(
  items: FoliateTocItem[],
  depth = 0,
): Array<{ href: string; label: string; depth: number }> {
  const flattened: Array<{ href: string; label: string; depth: number }> = []
  for (const item of items) {
    flattened.push({ href: item.href, label: item.label, depth })
    if (item.subitems && item.subitems.length > 0) {
      flattened.push(...flattenTocItems(item.subitems, depth + 1))
    }
  }
  return flattened
}

export function formatLandmarkType(type: string | undefined): string | undefined {
  if (!type) return undefined
  const segment = type.split(":").at(-1)
  if (!segment) return undefined
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function buildLandmarks(book: FoliateBook): FoliateReaderLandmark[] {
  return (book.landmarks ?? [])
    .filter((item): item is NonNullable<typeof book.landmarks>[number] => Boolean(item?.href))
    .map((item, index) => {
      const typeLabel = Array.isArray(item.type)
        ? formatLandmarkType(item.type.find(Boolean))
        : undefined
      const label = item.label?.trim() || typeLabel || `Landmark ${index + 1}`
      return {
        href: item.href,
        label,
        typeLabel: typeLabel && typeLabel !== label ? typeLabel : undefined,
      }
    })
}

// ============================================================
// Location Helpers
// ============================================================

type FoliateSectionCatalog = Pick<FoliateBook, "sections">

function canonicalizeRelocationCfi(
  detail: FoliateRelocationDetail,
  book: FoliateSectionCatalog | undefined,
): string | undefined {
  const cfi = detail.cfi
  const index = detail.index
  if (!book || !cfi || index === undefined) return cfi

  const sectionCfi = book.sections[index]?.cfi
  if (!sectionCfi || !sectionCfi.endsWith(")")) return cfi
  if (getTargetSectionCfi(cfi) === sectionCfi) return cfi

  const indirectionIndex = cfi.indexOf("!")
  return indirectionIndex < 0
    ? sectionCfi
    : `${sectionCfi.slice(0, -1)}${cfi.slice(indirectionIndex)}`
}

export function buildLocationState(
  detail?: FoliateRelocationDetail,
  book?: FoliateSectionCatalog,
): FoliateReaderLocation {
  if (!detail) return {}

  let locationLabel: string | undefined
  const locationCurrent = detail.location?.current
  const locationTotal = detail.location?.total
  if (locationCurrent !== undefined && Number.isFinite(locationCurrent)) {
    const displayLocation = locationCurrent + 1
    locationLabel =
      locationTotal !== undefined && Number.isFinite(locationTotal)
        ? `Location ${displayLocation} / ${locationTotal}`
        : `Location ${displayLocation}`
  }

  return {
    fraction: detail.fraction,
    cfi: canonicalizeRelocationCfi(detail, book),
    index: detail.index,
    tocLabel: detail.tocItem?.label,
    pageLabel: detail.pageItem?.label,
    locationLabel,
    currentPassageText: readCurrentPassageText(detail.range),
  }
}

const CURRENT_PASSAGE_MAX_CHARS = 1200

function normalizeCurrentPassageText(value: string): string | undefined {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (!normalized) {
    return undefined
  }

  if (normalized.length <= CURRENT_PASSAGE_MAX_CHARS) {
    return normalized
  }

  return `${normalized.slice(0, CURRENT_PASSAGE_MAX_CHARS).trimEnd()}…`
}

function readCurrentPassageText(range: Range | null | undefined): string | undefined {
  if (!range) {
    return undefined
  }

  try {
    return normalizeCurrentPassageText(range.toString())
  } catch {
    return undefined
  }
}

export function syncMarginals(
  view: FoliateView,
  snapshot: { title: string; author: string } | null,
  location: FoliateReaderLocation,
) {
  const renderer = view.renderer
  const heads = renderer?.heads
  const feet = renderer?.feet
  if (!heads || !feet || !snapshot) return

  const leftLabel = snapshot.title
  const rightLabel = location.tocLabel ?? snapshot.author
  const progressLabel =
    location.pageLabel ?? location.locationLabel ?? toPercentLabel(location.fraction) ?? ""

  for (const head of heads) head.textContent = leftLabel
  for (const foot of feet)
    foot.textContent = `${rightLabel}${progressLabel ? ` • ${progressLabel}` : ""}`
}

// ============================================================
// Annotation Helpers
// ============================================================

export function getBookmarkAtLocation(
  bookmarks: ReaderBookmark[],
  cfi: string | undefined,
): ReaderBookmark | undefined {
  if (!cfi) return undefined
  return bookmarks.find((bookmark) => bookmark.value === cfi)
}

export function getAnnotationAtValue(
  annotations: ReaderAnnotation[],
  value: string,
): ReaderAnnotation | undefined {
  return annotations.find((annotation) => annotation.value === value)
}

export function getAnnotationColorId(color: string | undefined): ReaderAnnotationColorId {
  if (!color) return "amber"
  for (const key of ANNOTATION_COLOR_IDS) {
    if (ANNOTATION_COLORS[key].value === color) {
      return key
    }
  }
  return "amber"
}

export function getAnnotationColorValue(colorId: ReaderAnnotationColorId): string {
  return ANNOTATION_COLORS[colorId].value
}

export function resolveAnnotationColorValue(
  colorId: ReaderAnnotationColorId,
  element: HTMLElement | null,
): string {
  try {
    const token = ANNOTATION_COLOR_TOKENS[colorId]
    const computedValue = globalThis.window
      .getComputedStyle(element ?? globalThis.document.documentElement)
      .getPropertyValue(token)
    const trimmedValue = computedValue.trim()
    return trimmedValue || getAnnotationColorValue(colorId)
  } catch {
    return getAnnotationColorValue(colorId)
  }
}

export function getAnnotationStyle(annotation: ReaderAnnotation): FoliateReaderAnnotationStyle {
  const { style } = annotation
  if (style === ANNOTATION_STYLE_UNDERLINE) return ANNOTATION_STYLE_UNDERLINE
  if (style === ANNOTATION_STYLE_SQUIGGLY) return ANNOTATION_STYLE_SQUIGGLY
  if (style === ANNOTATION_STYLE_STRIKETHROUGH) return ANNOTATION_STYLE_STRIKETHROUGH
  return ANNOTATION_STYLE_HIGHLIGHT
}

export function isReaderAnnotationColorId(value: string): value is ReaderAnnotationColorId {
  return value in ANNOTATION_COLORS
}

export function getSearchResultRows(searchState: {
  rows: Array<{ kind: string }>
}): Array<{ cfi: string }> {
  return searchState.rows.filter(
    (row): row is { kind: string; cfi: string } => row.kind === "result",
  )
}

// ============================================================
// Selection Helpers
// ============================================================

export function readSelectedRange(selection: Selection | null): Range | null {
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  const text = selection.toString().trim()
  if (text.length === 0) return null
  return range
}

const OVERLAY_EDGE_PADDING_PX = 24
const OVERLAY_VERTICAL_OFFSET_PX = 12

type OverlayRect = {
  left: number
  top: number
  width: number
  height: number
}

function toOverlayRect(rect: DOMRect | DOMRectReadOnly): OverlayRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

function getFrameElement(view: Window): HTMLElement | null {
  const frame = view.frameElement
  return frame instanceof HTMLElement ? frame : null
}

function toTopViewportRect(rect: OverlayRect, view: Window | null): OverlayRect {
  let nextRect = rect
  let currentView = view

  while (currentView) {
    const frame = getFrameElement(currentView)
    if (!frame) break

    const frameRect = frame.getBoundingClientRect()
    nextRect = {
      left: nextRect.left + frameRect.left + frame.clientLeft,
      top: nextRect.top + frameRect.top + frame.clientTop,
      width: nextRect.width,
      height: nextRect.height,
    }

    currentView = currentView.parent === currentView ? null : currentView.parent
  }

  return nextRect
}

export function getOverlayPosition(range: Range, container: HTMLElement) {
  const ownerView = range.startContainer.ownerDocument?.defaultView ?? null
  const rangeRect = toTopViewportRect(toOverlayRect(range.getBoundingClientRect()), ownerView)
  const containerRect = container.getBoundingClientRect()
  const maxX = Math.max(OVERLAY_EDGE_PADDING_PX, containerRect.width - OVERLAY_EDGE_PADDING_PX)

  return {
    x: clamp(
      rangeRect.left - containerRect.left + rangeRect.width / 2,
      OVERLAY_EDGE_PADDING_PX,
      maxX,
    ),
    y: Math.max(
      rangeRect.top - containerRect.top - OVERLAY_VERTICAL_OFFSET_PX,
      OVERLAY_EDGE_PADDING_PX,
    ),
  }
}

// ============================================================
// UI Helpers
// ============================================================

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {}
  return false
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

// ============================================================
// Cover Helpers
// ============================================================

export async function resolveCoverUrl(book: FoliateBook): Promise<string | undefined> {
  const cover = await Promise.resolve(book.getCover?.())
  if (!cover) return undefined
  return URL.createObjectURL(cover)
}

export function releaseObjectUrl(url: string | undefined) {
  if (!url) return
  URL.revokeObjectURL(url)
}

// ============================================================
// Cleanup Helpers
// ============================================================

export function cleanupView(view: FoliateView | null, coverUrl: string | undefined) {
  if (!view) {
    releaseObjectUrl(coverUrl)
    return
  }

  // Release the cover URL immediately
  releaseObjectUrl(coverUrl)

  const book = view.book
  try {
    view.close()
  } catch (error) {
    console.warn("Foliate view.close() failed during cleanup", error)
  }

  try {
    view.remove()
  } catch {
    // Ignore removal errors
  }

  // Destroy the book/source reference if it exists
  if (book?.destroy) {
    Promise.resolve(book.destroy()).catch((error) => {
      console.warn("Foliate book.destroy() failed during cleanup", error)
    })
  }
}
