import type {
  FoliateNavigationTarget,
  FoliateReaderLocation,
  FoliateReaderSidebarTab,
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
import { formatMetadataValue, toPercentLabel } from "./foliate-formatters"
import type { View as FoliateView } from "foliate-js/view.js"

// ============================================================
// Dependency Tracking
// ============================================================

const dependencyReferenceIds = new WeakMap<object, number>()
let nextDependencyReferenceId = DEPENDENCY_REFERENCE_ID_START

export function getDependencyReferenceId(reference: object): number {
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

  if (
    typeof target === "string" ||
    typeof target === "number" ||
    typeof target === "boolean" ||
    typeof target === "bigint"
  ) {
    return [typeof target, String(target)].join(DEPENDENCY_KEY_SEPARATOR)
  }

  if (typeof target === "object") {
    return [DEPENDENCY_KEY_KIND_REFERENCE, getDependencyReferenceId(target)].join(
      DEPENDENCY_KEY_SEPARATOR,
    )
  }

  return [typeof target, String(target)].join(DEPENDENCY_KEY_SEPARATOR)
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

function hasPdfExtension(value: string): boolean {
  const normalizedValue = value.split(/[?#]/, 1)[0] ?? value
  return normalizedValue.toLowerCase().endsWith(".pdf")
}

export function isPdfSource(source: FoliateReaderSource | null): boolean {
  if (!source) return false

  switch (source.kind) {
    case "file":
      return source.file.type === "application/pdf" || hasPdfExtension(source.file.name)
    case "blob":
      return source.blob.type === "application/pdf" || hasPdfExtension(source.name)
    case "url":
      return (source.name ? hasPdfExtension(source.name) : false) || hasPdfExtension(source.url)
    case "book":
      return source.name ? hasPdfExtension(source.name) : false
  }
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

// ============================================================
// Metadata Helpers
// ============================================================

export function buildMetadataRows(metadata?: FoliateMetadata): MetadataRow[] {
  if (!metadata) return []

  const rows: MetadataRow[] = []
  for (const field of METADATA_FIELDS) {
    const value = formatMetadataValue(metadata[field.key])
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

export function buildLocationState(detail?: FoliateRelocationDetail): FoliateReaderLocation {
  if (!detail) return {}

  let locationLabel: string | undefined
  const locationCurrent = detail.location?.current
  const locationTotal = detail.location?.total
  if (typeof locationCurrent === "number") {
    const displayLocation = locationCurrent + 1
    locationLabel =
      typeof locationTotal === "number"
        ? `Location ${displayLocation} / ${locationTotal}`
        : `Location ${displayLocation}`
  }

  return {
    fraction: detail.fraction,
    cfi: detail.cfi,
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
  if (typeof window === "undefined") {
    return getAnnotationColorValue(colorId)
  }

  const token = ANNOTATION_COLOR_TOKENS[colorId]
  const computedValue = window
    .getComputedStyle(element ?? document.documentElement)
    .getPropertyValue(token)
  const trimmedValue = computedValue.trim()
  return trimmedValue || getAnnotationColorValue(colorId)
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

export function getOverlayPosition(range: Range, container: HTMLElement): { x: number; y: number } {
  const ownerView = range.startContainer.ownerDocument?.defaultView ?? null
  const rangeRect = toTopViewportRect(toOverlayRect(range.getBoundingClientRect()), ownerView)
  const containerRect = container.getBoundingClientRect()

  return {
    x: clamp(
      rangeRect.left + rangeRect.width / 2,
      containerRect.left + OVERLAY_EDGE_PADDING_PX,
      containerRect.right - OVERLAY_EDGE_PADDING_PX,
    ),
    y: Math.max(
      rangeRect.top - OVERLAY_VERTICAL_OFFSET_PX,
      containerRect.top + OVERLAY_EDGE_PADDING_PX,
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
    // Foliate's view.close() can sometimes fail if called before the view is fully ready
    // or during rapid unmounts when internals are nullified.
    if (typeof view.close === "function") {
      view.close()
    }
  } catch (error) {
    console.warn("Foliate view.close() failed during cleanup", error)
  }

  try {
    if (typeof view.remove === "function") {
      view.remove()
    }
  } catch {
    // Ignore removal errors
  }

  // Destroy the book/source reference if it exists
  if (book && typeof book.destroy === "function") {
    Promise.resolve(book.destroy()).catch((error) => {
      console.warn("Foliate book.destroy() failed during cleanup", error)
    })
  }
}

export function createError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error("Buddy could not initialize the foliate renderer for this source.")
}

// ============================================================
// Sidebar Validation
// ============================================================

export function isFoliateSidebarTab(value: string): value is FoliateReaderSidebarTab {
  return (
    value === "contents" ||
    value === "search" ||
    value === "bookmarks" ||
    value === "annotations" ||
    value === "details" ||
    value === "preferences"
  )
}
