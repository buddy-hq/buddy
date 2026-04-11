import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"
import {
  Badge,
  BookOpenIcon,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  CopyIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EllipsisIcon,
  Input,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PinIcon,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SettingsIcon,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  XIcon,
  cn,
} from "@buddy/ui"
import {
  FileQuestionIcon,
  InfoIcon,
  LayoutPanelLeftIcon,
  Loader2Icon,
  MapIcon,
  PencilLineIcon,
  Redo2Icon,
  ScrollTextIcon,
  SearchIcon,
  Undo2Icon,
} from "lucide-react"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import { ensureFoliateRuntimeCompat } from "@/lib/foliate/ensure-foliate-runtime-compat"
import type {
  FoliateAnnotationPayload,
  FoliateBook,
  FoliateDrawAnnotationEventDetail,
  FoliateMetadata,
  FoliateNavigationTarget,
  FoliateRelocationDetail,
  FoliateSearchExcerpt,
  FoliateSearchResult,
  FoliateTocItem,
  View as FoliateView,
} from "foliate-js/view.js"

ensureFoliateRuntimeCompat()

const DEFAULT_TITLE = "Untitled publication"
const DEFAULT_AUTHOR = "Unknown author"
const DEFAULT_EMPTY_MESSAGE = "Select a compatible ebook or PDF to preview it here."
const DEFAULT_ERROR_TITLE = "Unable to open publication"
const DEFAULT_ERROR_MESSAGE = "Buddy could not initialize the foliate renderer for this source."
const TOC_EMPTY_MESSAGE = "This publication does not expose a table of contents."
const DETAILS_EMPTY_MESSAGE = "Metadata is limited for this publication."
const SEARCH_EMPTY_MESSAGE = "Search inside the current book or chapter."
const BOOKMARKS_EMPTY_MESSAGE = "Bookmarks you add here persist per book."
const ANNOTATIONS_EMPTY_MESSAGE = "Highlights and notes appear here."
const FLOW_PAGINATED = "paginated"
const FLOW_SCROLLED = "scrolled"
const SIDEBAR_CONTENTS = "contents"
const SIDEBAR_SEARCH = "search"
const SIDEBAR_BOOKMARKS = "bookmarks"
const SIDEBAR_ANNOTATIONS = "annotations"
const SIDEBAR_DETAILS = "details"
const SIDEBAR_PREFERENCES = "preferences"
const APPEARANCE_SYSTEM = "system"
const APPEARANCE_LIGHT = "light"
const APPEARANCE_DARK = "dark"
const SEARCH_SCOPE_BOOK = "book"
const SEARCH_SCOPE_SECTION = "section"
const FONT_PUBLISHER = "publisher"
const FONT_SERIF = "serif"
const FONT_SANS = "sans"
const ANNOTATION_STYLE_HIGHLIGHT = "highlight"
const ANNOTATION_STYLE_UNDERLINE = "underline"
const ANNOTATION_STYLE_SQUIGGLY = "squiggly"
const ANNOTATION_STYLE_STRIKETHROUGH = "strikethrough"
const VIEW_ELEMENT_CLASS_NAME = "buddy-foliate-view"
const VIEWPORT_CLASS_NAME = "buddy-foliate-viewport"
const READER_SIDE_PANEL_WIDTH_CLASS = "lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]"
const DEPENDENCY_KEY_EMPTY = "none"
const DEPENDENCY_KEY_SEPARATOR = "::"
const DEPENDENCY_KEY_KIND_REFERENCE = "reference"
const DEPENDENCY_REFERENCE_ID_START = 1
const GLOBAL_PREFERENCES_STORAGE_KEY = "buddy:foliate-reader:preferences:v1"
const BOOK_STATE_STORAGE_KEY_PREFIX = "buddy:foliate-reader:book:v1:"
const SEARCH_RESULT_KEY_PREFIX = "search-result:"
const SEARCH_SECTION_KEY_PREFIX = "search-section:"
const VIRTUALIZE_ROW_THRESHOLD = 24
const DEFAULT_FONT_SCALE_REM = 1.04
const DEFAULT_LINE_HEIGHT = 1.62
const DEFAULT_MARGIN_PX = 56
const DEFAULT_GAP_PERCENT = 8
const DEFAULT_MAX_INLINE_SIZE_PX = 780
const DEFAULT_MAX_BLOCK_SIZE_PX = 1600
const DEFAULT_PROGRESS_STEPS = 1000

type KnownMetadataFieldKey =
  | "publisher"
  | "language"
  | "subject"
  | "identifier"
  | "source"
  | "rights"
  | "description"

export type FoliateReaderFlow = typeof FLOW_PAGINATED | typeof FLOW_SCROLLED
type FoliateReaderSidebarTab =
  | typeof SIDEBAR_CONTENTS
  | typeof SIDEBAR_SEARCH
  | typeof SIDEBAR_BOOKMARKS
  | typeof SIDEBAR_ANNOTATIONS
  | typeof SIDEBAR_DETAILS
  | typeof SIDEBAR_PREFERENCES
type FoliateReaderAppearanceMode =
  | typeof APPEARANCE_SYSTEM
  | typeof APPEARANCE_LIGHT
  | typeof APPEARANCE_DARK
type FoliateReaderSearchScope = typeof SEARCH_SCOPE_BOOK | typeof SEARCH_SCOPE_SECTION
type FoliateReaderFontPreset = typeof FONT_PUBLISHER | typeof FONT_SERIF | typeof FONT_SANS
type FoliateReaderAnnotationStyle =
  | typeof ANNOTATION_STYLE_HIGHLIGHT
  | typeof ANNOTATION_STYLE_UNDERLINE
  | typeof ANNOTATION_STYLE_SQUIGGLY
  | typeof ANNOTATION_STYLE_STRIKETHROUGH
export type FoliateReaderThemeId = "paper" | "sepia" | "night" | "mist" | "graphite"
export type FoliateReaderSource =
  | {
      kind: "file"
      file: File
    }
  | {
      kind: "blob"
      blob: Blob
      name: string
    }
  | {
      kind: "url"
      url: string
      name?: string
    }
  | {
      kind: "book"
      book: FoliateBook
      name?: string
    }

export type FoliateReaderSnapshot = {
  title: string
  author: string
  formatLabel: string
  isFixedLayout: boolean
  toc: FoliateTocItem[]
  pageList: FoliateTocItem[]
  landmarks: FoliateReaderLandmark[]
  metadata?: FoliateMetadata
  coverUrl?: string
  fileName?: string
}

export type FoliateReaderLocation = {
  fraction?: number
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type FoliateReaderHandle = {
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (target: FoliateNavigationTarget) => Promise<void>
  setTheme: (theme: FoliateReaderThemeId) => void
  setFlow: (flow: FoliateReaderFlow) => void
  getSnapshot: () => FoliateReaderSnapshot | null
}

export type FoliateReaderProps = {
  source: FoliateReaderSource | null
  className?: string
  initialLocation?: FoliateNavigationTarget
  defaultTheme?: FoliateReaderThemeId
  defaultFlow?: FoliateReaderFlow
  defaultSidebarTab?: FoliateReaderSidebarTab
  showSidebar?: boolean
  showToolbar?: boolean
  emptyState?: ReactNode
  onReady?: (snapshot: FoliateReaderSnapshot) => void
  onLocationChange?: (location: FoliateReaderLocation) => void
  onOpenExternalLink?: (href: string) => void
  onError?: (error: Error) => void
}

type FoliateReaderThemeDefinition = {
  id: FoliateReaderThemeId
  label: string
  shellClassName: string
  viewportClassName: string
  contentBackground: string
  contentForeground: string
  contentMuted: string
  contentLink: string
  contentHeading: string
  contentAccent: string
  pdfFilterLight: string
  pdfFilterDark: string
}

type FoliateReaderPreferences = {
  themeId: FoliateReaderThemeId
  flow: FoliateReaderFlow
  appearanceMode: FoliateReaderAppearanceMode
  fontPreset: FoliateReaderFontPreset
  fontScaleRem: number
  lineHeight: number
  marginPx: number
  gapPercent: number
  maxInlineSizePx: number
  maxBlockSizePx: number
  justify: boolean
  hyphenate: boolean
  reduceMotion: boolean
  autohideCursor: boolean
}

type MetadataFieldDefinition = {
  key: KnownMetadataFieldKey
  label: string
}

type MetadataRow = {
  key: string
  label: string
  value: string
}

type ReaderBookmark = {
  value: string
  label: string
  created: string
}

type ReaderAnnotation = FoliateAnnotationPayload & {
  label?: string
  index?: number
}

type ReaderBookState = {
  lastLocation?: string
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
}

type ReaderSearchState = {
  query: string
  scope: FoliateReaderSearchScope
  matchCase: boolean
  matchWholeWords: boolean
  matchDiacritics: boolean
  running: boolean
  progress: number | null
  rows: ReaderSearchRow[]
  activeResultCfi?: string
}

type ReaderSearchRow =
  | {
      key: string
      kind: "section"
      label: string
    }
  | {
      key: string
      kind: "result"
      label?: string
      cfi: string
      excerpt: FoliateSearchExcerpt
    }

type ReaderSelectionAction = {
  index: number
  range: Range
  cfi: string
  text: string
  x: number
  y: number
}

type ReaderSelectionToolbarState = {
  text: string
  x: number
  y: number
}

type ReaderAnnotationPopoverState = {
  value: string
  x: number
  y: number
}

type ReaderAnnotationDialogState = {
  mode: "create" | "edit"
  value: string
  text: string
  note: string
  style: FoliateReaderAnnotationStyle
  color: ReaderAnnotationColorId
}

export type FoliateReaderLandmark = {
  href: string
  label: string
  typeLabel?: string
}

type ReaderShortcut = {
  keys: string
  label: string
}

type ReaderAnnotationColorId = "amber" | "mint" | "sky" | "rose"

const READER_THEMES: FoliateReaderThemeDefinition[] = [
  {
    id: "paper",
    label: "Paper",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-raised-stronger)_60%,transparent)_0%,transparent_48%),linear-gradient(180deg,var(--surface-raised-base)_0%,var(--surface-base)_100%)]",
    viewportClassName: "bg-surface-inset-base",
    contentBackground: "var(--background-base)",
    contentForeground: "var(--text-strong)",
    contentMuted: "var(--text-weak)",
    contentLink: "var(--text-interactive-base)",
    contentHeading: "color-mix(in oklab, var(--text-stronger) 90%, black)",
    contentAccent: "color-mix(in oklab, var(--surface-info-base) 28%, transparent)",
    pdfFilterLight: "none",
    pdfFilterDark: "invert(1) hue-rotate(180deg) brightness(0.88) contrast(1.04)",
  },
  {
    id: "sepia",
    label: "Sepia",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-warning-base)_16%,transparent)_0%,transparent_52%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-warning-base)_8%,var(--surface-base))_0%,color-mix(in_oklab,var(--surface-warning-base)_12%,var(--surface-inset-base))_100%)]",
    viewportClassName:
      "bg-[color:color-mix(in_oklab,var(--surface-warning-base)_9%,var(--surface-inset-base))]",
    contentBackground: "color-mix(in oklab, var(--surface-warning-base) 11%, white)",
    contentForeground: "color-mix(in oklab, var(--text-strong) 88%, #3c2616)",
    contentMuted: "color-mix(in oklab, var(--text-weak) 82%, #725341)",
    contentLink: "color-mix(in oklab, var(--text-interactive-base) 72%, #8b4c1f)",
    contentHeading: "color-mix(in oklab, var(--text-stronger) 74%, #2a1407)",
    contentAccent: "color-mix(in oklab, var(--surface-warning-base) 26%, transparent)",
    pdfFilterLight: "sepia(0.22) saturate(0.92) brightness(0.98)",
    pdfFilterDark: "invert(0.94) sepia(0.16) brightness(0.88)",
  },
  {
    id: "night",
    label: "Night",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-info-base)_12%,transparent)_0%,transparent_44%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_68%,black)_0%,color-mix(in_oklab,var(--surface-inset-strong)_78%,black)_100%)]",
    viewportClassName: "bg-surface-strong",
    contentBackground: "color-mix(in oklab, var(--surface-strong) 92%, black)",
    contentForeground: "color-mix(in oklab, var(--text-stronger) 88%, white)",
    contentMuted: "color-mix(in oklab, var(--text-weak) 88%, white)",
    contentLink: "color-mix(in oklab, var(--text-interactive-base) 76%, white)",
    contentHeading: "color-mix(in oklab, var(--text-stronger) 98%, white)",
    contentAccent: "color-mix(in oklab, var(--surface-info-base) 22%, transparent)",
    pdfFilterLight: "invert(1) hue-rotate(180deg) brightness(0.88) contrast(1.04)",
    pdfFilterDark: "none",
  },
  {
    id: "mist",
    label: "Mist",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-info-base)_18%,transparent)_0%,transparent_50%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-info-base)_5%,var(--surface-base))_0%,var(--surface-inset-base)_100%)]",
    viewportClassName:
      "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-info-base)_7%,var(--surface-base))_0%,var(--surface-inset-base)_100%)]",
    contentBackground: "color-mix(in oklab, var(--surface-info-base) 7%, white)",
    contentForeground: "color-mix(in oklab, var(--text-strong) 96%, #1d3343)",
    contentMuted: "color-mix(in oklab, var(--text-weak) 86%, #5b7382)",
    contentLink: "color-mix(in oklab, var(--text-interactive-base) 88%, #1d5d84)",
    contentHeading: "color-mix(in oklab, var(--text-stronger) 92%, #0e2230)",
    contentAccent: "color-mix(in oklab, var(--surface-info-base) 28%, transparent)",
    pdfFilterLight: "brightness(0.99) saturate(0.96)",
    pdfFilterDark: "invert(0.98) hue-rotate(180deg) brightness(0.92)",
  },
  {
    id: "graphite",
    label: "Graphite",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-raised-stronger)_22%,transparent)_0%,transparent_44%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-inset-strong)_70%,black)_0%,color-mix(in_oklab,var(--surface-stronger)_88%,black)_100%)]",
    viewportClassName: "bg-[color:color-mix(in_oklab,var(--surface-inset-strong)_88%,black)]",
    contentBackground: "color-mix(in oklab, #1c2025 92%, black)",
    contentForeground: "color-mix(in oklab, #f4f2ee 92%, white)",
    contentMuted: "color-mix(in oklab, #a3acb4 92%, white)",
    contentLink: "color-mix(in oklab, #89c0f2 92%, white)",
    contentHeading: "color-mix(in oklab, #ffffff 90%, #d4d9dd)",
    contentAccent: "rgba(255,255,255,0.06)",
    pdfFilterLight: "invert(1) hue-rotate(180deg) brightness(0.9)",
    pdfFilterDark: "none",
  },
]

const ANNOTATION_COLORS: Record<
  ReaderAnnotationColorId,
  { label: string; value: string; previewClassName: string }
> = {
  amber: {
    label: "Amber",
    value: "#f59e0b",
    previewClassName: "bg-amber-400",
  },
  mint: {
    label: "Mint",
    value: "#34d399",
    previewClassName: "bg-emerald-400",
  },
  sky: {
    label: "Sky",
    value: "#38bdf8",
    previewClassName: "bg-sky-400",
  },
  rose: {
    label: "Rose",
    value: "#fb7185",
    previewClassName: "bg-rose-400",
  },
}

const ANNOTATION_COLOR_IDS: ReaderAnnotationColorId[] = ["amber", "mint", "sky", "rose"]

const ANNOTATION_STYLE_LABELS: Record<FoliateReaderAnnotationStyle, string> = {
  highlight: "Highlight",
  underline: "Underline",
  squiggly: "Squiggly",
  strikethrough: "Strike",
}

const SHORTCUTS: ReaderShortcut[] = [
  { keys: "Ctrl/Cmd + F", label: "Open search" },
  { keys: "Ctrl/Cmd + L", label: "Open location and landmarks" },
  { keys: "Ctrl/Cmd + D", label: "Toggle bookmark at current location" },
  { keys: "Alt + Left", label: "History back" },
  { keys: "Alt + Right", label: "History forward" },
  { keys: "Ctrl/Cmd + ,", label: "Open reader preferences" },
  { keys: "?", label: "Open keyboard help" },
  { keys: "Esc", label: "Close active reader overlays" },
]

const METADATA_FIELDS: MetadataFieldDefinition[] = [
  { key: "publisher", label: "Publisher" },
  { key: "language", label: "Language" },
  { key: "subject", label: "Subjects" },
  { key: "identifier", label: "Identifier" },
  { key: "source", label: "Source" },
  { key: "rights", label: "Rights" },
  { key: "description", label: "Description" },
]

const dependencyReferenceIds = new WeakMap<object, number>()
let nextDependencyReferenceId = DEPENDENCY_REFERENCE_ID_START

function getDependencyReferenceId(reference: object) {
  const existingId = dependencyReferenceIds.get(reference)
  if (existingId) return existingId
  const createdId = nextDependencyReferenceId
  nextDependencyReferenceId += 1
  dependencyReferenceIds.set(reference, createdId)
  return createdId
}

function buildSourceDependencyKey(source: FoliateReaderSource | null) {
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

function buildNavigationTargetDependencyKey(target: FoliateNavigationTarget | undefined) {
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

function getThemeDefinition(themeId: FoliateReaderThemeId) {
  return READER_THEMES.find((entry) => entry.id === themeId) ?? READER_THEMES[0]
}

function isFoliateReaderThemeId(value: string): value is FoliateReaderThemeId {
  return READER_THEMES.some((entry) => entry.id === value)
}

function isFoliateSidebarTab(value: string): value is FoliateReaderSidebarTab {
  return (
    value === SIDEBAR_CONTENTS ||
    value === SIDEBAR_SEARCH ||
    value === SIDEBAR_BOOKMARKS ||
    value === SIDEBAR_ANNOTATIONS ||
    value === SIDEBAR_DETAILS ||
    value === SIDEBAR_PREFERENCES
  )
}

function fileNameFromPath(path: string) {
  const normalized = path.replaceAll("\\", "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] ?? path
}

function getSourceName(source: FoliateReaderSource) {
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
      return source.name
  }
}

function getSourceFormatLabel(source: FoliateReaderSource) {
  const name = getSourceName(source)
  if (!name) return "Book"

  const lowerName = name.toLowerCase()
  const lastDot = lowerName.lastIndexOf(".")
  if (lastDot < 0 || lastDot === lowerName.length - 1) return "Book"
  return lowerName.slice(lastDot + 1).toUpperCase()
}

function toFoliateInput(source: FoliateReaderSource): string | Blob | File | FoliateBook {
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

function isLocalizedTextRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

function readLocalizedText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (!isLocalizedTextRecord(value)) return undefined

  for (const entry of Object.values(value)) {
    const trimmed = entry.trim()
    if (trimmed.length > 0) return trimmed
  }

  return undefined
}

function formatContributor(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value.map(formatContributor).filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  const directText = readLocalizedText(value)
  if (directText) return directText

  if (!value || typeof value !== "object" || !("name" in value)) return undefined
  return readLocalizedText(value.name)
}

function formatMetadataValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .map(formatMetadataValue)
      .filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  const contributor = formatContributor(value)
  if (contributor) return contributor

  return readLocalizedText(value)
}

function buildMetadataRows(metadata?: FoliateMetadata) {
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

function buildLocationState(detail?: FoliateRelocationDetail): FoliateReaderLocation {
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
  }
}

function toPercentLabel(fraction?: number) {
  if (typeof fraction !== "number") return undefined
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)))
  return `${percent}%`
}

async function resolveCoverUrl(book: FoliateBook) {
  const cover = await Promise.resolve(book.getCover?.())
  if (!cover) return undefined
  return URL.createObjectURL(cover)
}

function releaseObjectUrl(url: string | undefined) {
  if (!url) return
  URL.revokeObjectURL(url)
}

function createError(error: unknown) {
  if (error instanceof Error) return error
  return new Error(DEFAULT_ERROR_MESSAGE)
}

function cleanupView(view: FoliateView | null, coverUrl: string | undefined) {
  if (!view) {
    releaseObjectUrl(coverUrl)
    return
  }

  const book = view.book
  view.close()
  view.remove()
  releaseObjectUrl(coverUrl)
  Promise.resolve(book?.destroy?.()).catch(() => {})
}

function renderMetadataSummary(location: FoliateReaderLocation) {
  const segments = [location.pageLabel, location.locationLabel, toPercentLabel(location.fraction)]
    .filter((entry): entry is string => Boolean(entry))
    .join(" • ")
  return segments.length > 0 ? segments : "Ready"
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeStorageSegment(value: string | undefined) {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function buildBookPersistenceKey(source: FoliateReaderSource, book: FoliateBook) {
  const identifier = formatMetadataValue(book.metadata?.identifier)
  const title = formatMetadataValue(book.metadata?.title)
  const author =
    formatContributor(book.metadata?.author) ?? formatContributor(book.metadata?.contributor)
  const sourceName = getSourceName(source)
  const pieces = [identifier, title, author, sourceName]
    .map(normalizeStorageSegment)
    .filter(Boolean)
  return `${BOOK_STATE_STORAGE_KEY_PREFIX}${pieces.join("__") || buildSourceDependencyKey(source)}`
}

function safeReadStorage(key: string) {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWriteStorage(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return isObjectRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isReaderBookmark(value: unknown): value is ReaderBookmark {
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

function isReaderAnnotation(value: unknown): value is ReaderAnnotation {
  return isObjectRecord(value) && "value" in value && typeof value.value === "string"
}

function loadGlobalPreferences(
  defaultTheme: FoliateReaderThemeId,
  defaultFlow: FoliateReaderFlow,
): FoliateReaderPreferences {
  const parsed = parseJsonObject(safeReadStorage(GLOBAL_PREFERENCES_STORAGE_KEY))
  return {
    themeId:
      typeof parsed?.themeId === "string" && isFoliateReaderThemeId(parsed.themeId)
        ? parsed.themeId
        : defaultTheme,
    flow:
      parsed?.flow === FLOW_SCROLLED || parsed?.flow === FLOW_PAGINATED ? parsed.flow : defaultFlow,
    appearanceMode:
      parsed?.appearanceMode === APPEARANCE_LIGHT ||
      parsed?.appearanceMode === APPEARANCE_DARK ||
      parsed?.appearanceMode === APPEARANCE_SYSTEM
        ? parsed.appearanceMode
        : APPEARANCE_SYSTEM,
    fontPreset:
      parsed?.fontPreset === FONT_SERIF ||
      parsed?.fontPreset === FONT_SANS ||
      parsed?.fontPreset === FONT_PUBLISHER
        ? parsed.fontPreset
        : FONT_SERIF,
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
    reduceMotion: parsed?.reduceMotion === true,
    autohideCursor: parsed?.autohideCursor === true,
  }
}

function loadBookState(bookKey: string): ReaderBookState {
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

function saveGlobalPreferences(preferences: FoliateReaderPreferences) {
  safeWriteStorage(GLOBAL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
}

function saveBookState(bookKey: string, state: ReaderBookState) {
  safeWriteStorage(bookKey, JSON.stringify(state))
}

function flattenTocItems(items: FoliateTocItem[], depth = 0) {
  const flattened: Array<{ href: string; label: string; depth: number }> = []
  for (const item of items) {
    flattened.push({ href: item.href, label: item.label, depth })
    if (item.subitems && item.subitems.length > 0) {
      flattened.push(...flattenTocItems(item.subitems, depth + 1))
    }
  }
  return flattened
}

function formatLandmarkType(type: string | undefined) {
  if (!type) return undefined
  const segment = type.split(":").at(-1)
  if (!segment) return undefined
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildLandmarks(book: FoliateBook) {
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

function getBookmarkAtLocation(bookmarks: ReaderBookmark[], cfi: string | undefined) {
  if (!cfi) return undefined
  return bookmarks.find((bookmark) => bookmark.value === cfi)
}

function getAnnotationAtValue(annotations: ReaderAnnotation[], value: string) {
  return annotations.find((annotation) => annotation.value === value)
}

function getAnnotationColorId(color: string | undefined): ReaderAnnotationColorId {
  if (!color) return "amber"
  for (const key of ANNOTATION_COLOR_IDS) {
    if (ANNOTATION_COLORS[key].value === color) {
      return key
    }
  }
  return "amber"
}

function getAnnotationColorValue(colorId: ReaderAnnotationColorId) {
  return ANNOTATION_COLORS[colorId].value
}

function getAnnotationStyle(annotation: ReaderAnnotation): FoliateReaderAnnotationStyle {
  if (
    annotation.style === ANNOTATION_STYLE_UNDERLINE ||
    annotation.style === ANNOTATION_STYLE_SQUIGGLY ||
    annotation.style === ANNOTATION_STYLE_STRIKETHROUGH
  ) {
    return annotation.style
  }
  return ANNOTATION_STYLE_HIGHLIGHT
}

function isReaderAnnotationColorId(value: string): value is ReaderAnnotationColorId {
  return value in ANNOTATION_COLORS
}

function getSearchResultRows(searchState: ReaderSearchState) {
  return searchState.rows.filter(
    (row): row is Extract<ReaderSearchRow, { kind: "result" }> => row.kind === "result",
  )
}

function readSelectedRange(selection: Selection | null) {
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  const text = selection.toString().trim()
  if (text.length === 0) return null
  return range
}

function getOverlayPosition(range: Range, container: HTMLElement) {
  const rangeRect = range.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return {
    x: clamp(
      rangeRect.left - containerRect.left + rangeRect.width / 2,
      24,
      containerRect.width - 24,
    ),
    y: Math.max(rangeRect.top - containerRect.top - 12, 24),
  }
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {}
}

function createSvgElement(tag: string) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag)
}

function drawHighlight(rects: DOMRectList, color: string) {
  const group = createSvgElement("g")
  group.setAttribute("fill", color)
  group.style.opacity = "0.26"
  for (const rect of Array.from(rects)) {
    const node = createSvgElement("rect")
    node.setAttribute("x", `${rect.left}`)
    node.setAttribute("y", `${rect.top}`)
    node.setAttribute("height", `${rect.height}`)
    node.setAttribute("width", `${rect.width}`)
    group.append(node)
  }
  return group
}

function drawLinearMark(
  rects: DOMRectList,
  color: string,
  writingMode: string,
  kind: "underline" | "strikethrough" | "squiggly",
) {
  const vertical = writingMode === "vertical-rl" || writingMode === "vertical-lr"
  if (kind === "squiggly") {
    const group = createSvgElement("g")
    group.setAttribute("fill", "none")
    group.setAttribute("stroke", color)
    group.setAttribute("stroke-width", "2")
    for (const rect of Array.from(rects)) {
      const path = createSvgElement("path")
      if (vertical) {
        const blocks = Math.max(3, Math.round(rect.height / 6))
        const segment = rect.height / blocks
        const commands = Array.from(
          { length: blocks },
          (_, index) => `l${index % 2 === 0 ? 3 : -3} ${segment}`,
        ).join("")
        path.setAttribute("d", `M${rect.right} ${rect.top}${commands}`)
      } else {
        const blocks = Math.max(3, Math.round(rect.width / 6))
        const segment = rect.width / blocks
        const commands = Array.from(
          { length: blocks },
          (_, index) => `l${segment} ${index % 2 === 0 ? -3 : 3}`,
        ).join("")
        path.setAttribute("d", `M${rect.left} ${rect.bottom}${commands}`)
      }
      group.append(path)
    }
    return group
  }

  const group = createSvgElement("g")
  group.setAttribute("fill", color)
  for (const rect of Array.from(rects)) {
    const node = createSvgElement("rect")
    if (vertical) {
      node.setAttribute(
        "x",
        `${kind === "underline" ? rect.right - 2 : (rect.left + rect.right) / 2}`,
      )
      node.setAttribute("y", `${rect.top}`)
      node.setAttribute("width", "2")
      node.setAttribute("height", `${rect.height}`)
    } else {
      node.setAttribute("x", `${rect.left}`)
      node.setAttribute(
        "y",
        `${kind === "underline" ? rect.bottom - 2 : (rect.top + rect.bottom) / 2}`,
      )
      node.setAttribute("width", `${rect.width}`)
      node.setAttribute("height", "2")
    }
    group.append(node)
  }
  return group
}

function drawAnnotation(event: CustomEvent<FoliateDrawAnnotationEventDetail>) {
  const annotation = event.detail.annotation
  const color =
    typeof annotation.color === "string" ? annotation.color : ANNOTATION_COLORS.amber.value
  const style =
    annotation.style === ANNOTATION_STYLE_UNDERLINE ||
    annotation.style === ANNOTATION_STYLE_SQUIGGLY ||
    annotation.style === ANNOTATION_STYLE_STRIKETHROUGH
      ? annotation.style
      : ANNOTATION_STYLE_HIGHLIGHT
  const writingMode = event.detail.doc.defaultView?.getComputedStyle(
    event.detail.range.startContainer.parentElement ?? event.detail.doc.body,
  ).writingMode

  if (style === ANNOTATION_STYLE_HIGHLIGHT) {
    event.detail.draw((rects) => drawHighlight(rects, color))
    return
  }

  event.detail.draw((rects) => drawLinearMark(rects, color, writingMode ?? "", style))
}

function buildReaderStyles(
  theme: FoliateReaderThemeDefinition,
  preferences: FoliateReaderPreferences,
  appearance: "light" | "dark",
) {
  const fontFamily =
    preferences.fontPreset === FONT_SERIF
      ? `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif`
      : preferences.fontPreset === FONT_SANS
        ? `"Avenir Next", "IBM Plex Sans", "Segoe UI", sans-serif`
        : "inherit"

  return `
    @namespace epub "http://www.idpf.org/2007/ops";

    :root {
      color-scheme: ${appearance};
      --buddy-reader-accent: ${theme.contentAccent};
    }

    html {
      color-scheme: ${appearance};
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      font-size: ${preferences.fontScaleRem}rem;
      ${preferences.fontPreset === FONT_PUBLISHER ? "" : `font-family: ${fontFamily};`}
    }

    body {
      margin: 0 auto;
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      accent-color: ${theme.contentLink};
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    p,
    li,
    blockquote,
    dd {
      line-height: ${preferences.lineHeight};
      text-align: ${preferences.justify ? "justify" : "start"};
      -webkit-hyphens: ${preferences.hyphenate ? "auto" : "manual"};
      hyphens: ${preferences.hyphenate ? "auto" : "manual"};
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      color: ${theme.contentHeading};
      line-height: 1.14;
      text-wrap: balance;
    }

    a {
      color: ${theme.contentLink};
    }

    a:visited {
      color: ${theme.contentLink};
    }

    img,
    svg,
    video {
      max-inline-size: 100%;
      block-size: auto;
    }

    hr {
      border: 0;
      border-top: 1px solid color-mix(in oklab, ${theme.contentMuted} 34%, transparent);
    }

    pre,
    code,
    samp,
    kbd {
      font-family: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;
    }

    pre {
      white-space: pre-wrap !important;
    }

    blockquote {
      color: ${theme.contentMuted};
      border-inline-start: 2px solid color-mix(in oklab, ${theme.contentMuted} 28%, transparent);
      margin-inline: 0;
      padding-inline-start: 1rem;
    }

    mark {
      background: color-mix(in oklab, ${theme.contentAccent} 72%, transparent);
      color: inherit;
    }

    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `
}

function applyReaderPreferences(
  view: FoliateView,
  theme: FoliateReaderThemeDefinition,
  preferences: FoliateReaderPreferences,
  appearance: "light" | "dark",
) {
  view.className = VIEW_ELEMENT_CLASS_NAME

  if (preferences.autohideCursor) view.setAttribute("autohide-cursor", "")
  else view.removeAttribute("autohide-cursor")

  const renderer = view.renderer
  if (!renderer) return

  renderer.setStyles?.(buildReaderStyles(theme, preferences, appearance))
  if (preferences.reduceMotion) renderer.removeAttribute("animated")
  else renderer.setAttribute("animated", "")

  if (!view.isFixedLayout) {
    renderer.setAttribute("flow", preferences.flow)
    renderer.setAttribute("margin", `${preferences.marginPx}px`)
    renderer.setAttribute("gap", `${preferences.gapPercent}%`)
    renderer.setAttribute("max-inline-size", `${preferences.maxInlineSizePx}px`)
    renderer.setAttribute("max-block-size", `${preferences.maxBlockSizePx}px`)
  }
}

function syncMarginals(
  view: FoliateView,
  snapshot: FoliateReaderSnapshot | null,
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

function renderSearchExcerpt(excerpt: FoliateSearchExcerpt) {
  return (
    <span className="inline">
      <span>{excerpt.pre}</span>
      <span className="font-semibold text-text-strong">{excerpt.match}</span>
      <span>{excerpt.post}</span>
    </span>
  )
}

function isEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function toAnnotationDialogState(annotation?: ReaderAnnotation): ReaderAnnotationDialogState {
  return {
    mode: annotation ? "edit" : "create",
    value: annotation?.value ?? "",
    text: annotation?.text ?? "",
    note: annotation?.note ?? "",
    style: annotation ? getAnnotationStyle(annotation) : ANNOTATION_STYLE_HIGHLIGHT,
    color: getAnnotationColorId(annotation?.color),
  }
}

function FoliateEmptyState(props: { children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[22rem] items-center justify-center rounded-[1.2rem] border border-dashed border-border-base/70 bg-surface-weak/30 p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border-base/80 bg-surface-raised-base text-text-weak shadow-sm">
          <ScrollTextIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-text-strong">Foliate reader ready</div>
          <div className="text-sm text-text-weak">{props.children ?? DEFAULT_EMPTY_MESSAGE}</div>
        </div>
      </div>
    </div>
  )
}

function FoliateErrorState(props: { error: Error }) {
  return (
    <div className="flex h-full min-h-[22rem] items-center justify-center rounded-[1.2rem] border border-border-critical-base/40 bg-surface-critical-weak/40 p-8">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border-critical-base/40 bg-surface-critical-weak text-icon-critical-base">
          <FileQuestionIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-text-strong">{DEFAULT_ERROR_TITLE}</div>
          <div className="text-sm text-text-weak">
            {props.error.message || DEFAULT_ERROR_MESSAGE}
          </div>
        </div>
      </div>
    </div>
  )
}

function FoliateTocTree(props: {
  items: FoliateTocItem[]
  activeLabel?: string
  onSelect: (href: string) => void
  depth?: number
}) {
  const depth = props.depth ?? 0
  return (
    <div
      className={depth === 0 ? "space-y-1" : "ml-4 space-y-1 border-l border-border-base/60 pl-3"}
    >
      {props.items.map((item) => {
        const isActive = item.label === props.activeLabel
        return (
          <div key={`${depth}:${item.href}:${item.label}`} className="space-y-1">
            <button
              type="button"
              onClick={() => props.onSelect(item.href)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-surface-interactive-weak text-text-strong"
                  : "text-text-weak hover:bg-surface-weak/70 hover:text-text-base",
              )}
            >
              <span className="mt-1 shrink-0 text-text-weaker">
                <MapIcon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
            {item.subitems && item.subitems.length > 0 ? (
              <FoliateTocTree
                items={item.subitems}
                activeLabel={props.activeLabel}
                onSelect={props.onSelect}
                depth={depth + 1}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function FoliateMetadataPanel(props: { snapshot: FoliateReaderSnapshot | null }) {
  if (!props.snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
        {DETAILS_EMPTY_MESSAGE}
      </div>
    )
  }

  const metadataRows = buildMetadataRows(props.snapshot.metadata)
  const title = props.snapshot.title
  const author = props.snapshot.author

  return (
    <div className="space-y-4">
      <Card size="sm" className="bg-surface-raised-base/80">
        <CardHeader>
          <div className="flex items-start gap-3">
            {props.snapshot.coverUrl ? (
              <img
                src={props.snapshot.coverUrl}
                alt={`${title} cover`}
                className="h-28 w-20 shrink-0 rounded-lg border border-border-base/70 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-base/70 bg-surface-weak/70 text-text-weak">
                <BookOpenIcon className="size-5" />
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <CardTitle className="text-sm leading-snug">{title}</CardTitle>
                <p className="text-sm text-text-weak">{author}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{props.snapshot.formatLabel}</Badge>
                <Badge variant="outline">
                  {props.snapshot.isFixedLayout ? "Fixed layout" : "Reflowable"}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {metadataRows.length > 0 ? (
        <div className="space-y-3">
          {metadataRows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker">
                {row.label}
              </div>
              <div className="text-sm text-text-base">{row.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
          {DETAILS_EMPTY_MESSAGE}
        </div>
      )}
    </div>
  )
}

export const FoliateReader = forwardRef<FoliateReaderHandle, FoliateReaderProps>(
  function FoliateReader(
    {
      source,
      className,
      initialLocation,
      defaultTheme = "paper",
      defaultFlow = FLOW_PAGINATED,
      defaultSidebarTab = SIDEBAR_CONTENTS,
      showSidebar = true,
      showToolbar = true,
      emptyState,
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLElement | null>(null)
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<FoliateView | null>(null)
    const coverUrlRef = useRef<string | undefined>(undefined)
    const snapshotRef = useRef<FoliateReaderSnapshot | null>(null)
    const locationRef = useRef<FoliateReaderLocation>({})
    const searchGeneratorRef = useRef<AsyncGenerator<FoliateSearchResult> | null>(null)
    const searchRunIdRef = useRef(0)
    const selectionActionRef = useRef<ReaderSelectionAction | null>(null)
    const searchViewportRef = useRef<HTMLDivElement | null>(null)
    const bookmarkViewportRef = useRef<HTMLDivElement | null>(null)
    const annotationViewportRef = useRef<HTMLDivElement | null>(null)
    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const callbacksRef = useRef({
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    })
    const sliderListId = useId()
    const [preferences, setPreferences] = useState(() =>
      loadGlobalPreferences(defaultTheme, defaultFlow),
    )
    const [effectiveAppearance, setEffectiveAppearance] = useState<"light" | "dark">("light")
    const [sidebarTab, setSidebarTab] = useState<FoliateReaderSidebarTab>(defaultSidebarTab)
    const [sidebarOpen, setSidebarOpen] = useState(showSidebar)
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [snapshot, setSnapshot] = useState<FoliateReaderSnapshot | null>(null)
    const [location, setLocation] = useState<FoliateReaderLocation>({})
    const [error, setError] = useState<Error | null>(null)
    const [historyState, setHistoryState] = useState({ canGoBack: false, canGoForward: false })
    const [sectionFractions, setSectionFractions] = useState<number[]>([])
    const [bookKey, setBookKey] = useState<string | null>(null)
    const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([])
    const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([])
    const [searchState, setSearchState] = useState<ReaderSearchState>({
      query: "",
      scope: SEARCH_SCOPE_BOOK,
      matchCase: false,
      matchWholeWords: false,
      matchDiacritics: false,
      running: false,
      progress: null,
      rows: [],
    })
    const [selectionToolbar, setSelectionToolbar] = useState<ReaderSelectionToolbarState | null>(
      null,
    )
    const [annotationPopover, setAnnotationPopover] = useState<ReaderAnnotationPopoverState | null>(
      null,
    )
    const [annotationDialog, setAnnotationDialog] = useState<ReaderAnnotationDialogState | null>(
      null,
    )
    const [helpOpen, setHelpOpen] = useState(false)
    const [locationDialogOpen, setLocationDialogOpen] = useState(false)
    const [locationDraft, setLocationDraft] = useState("")
    const [progressDraft, setProgressDraft] = useState<number | null>(null)
    const preferencesRef = useRef(preferences)
    const effectiveAppearanceRef = useRef(effectiveAppearance)
    const annotationsRef = useRef(annotations)
    const bookmarksRef = useRef(bookmarks)
    const searchStateRef = useRef(searchState)
    const annotationDialogRef = useRef(annotationDialog)

    const sourceDependencyKey = buildSourceDependencyKey(source)
    const initialLocationDependencyKey = buildNavigationTargetDependencyKey(initialLocation)
    const stableSourceRef = useRef<{ key: string; value: FoliateReaderSource | null }>({
      key: sourceDependencyKey,
      value: source,
    })
    const stableInitialLocationRef = useRef<{
      key: string
      value: FoliateNavigationTarget | undefined
    }>({
      key: initialLocationDependencyKey,
      value: initialLocation,
    })

    if (stableSourceRef.current.key !== sourceDependencyKey) {
      stableSourceRef.current = { key: sourceDependencyKey, value: source }
    }
    if (stableInitialLocationRef.current.key !== initialLocationDependencyKey) {
      stableInitialLocationRef.current = {
        key: initialLocationDependencyKey,
        value: initialLocation,
      }
    }

    const stableSource = stableSourceRef.current.value
    const stableInitialLocation = stableInitialLocationRef.current.value
    const theme = getThemeDefinition(preferences.themeId)
    const canChangeFlow = snapshot ? !snapshot.isFixedLayout : false
    const progressSummary = renderMetadataSummary(location)
    const currentBookmark = useMemo(
      () => getBookmarkAtLocation(bookmarks, location.cfi),
      [bookmarks, location.cfi],
    )
    const flattenedToc = useMemo(() => flattenTocItems(snapshot?.toc ?? []), [snapshot?.toc])
    const searchResults = useMemo(() => getSearchResultRows(searchState), [searchState])
    const readerLandmarks = snapshot?.landmarks ?? []

    callbacksRef.current = {
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    }
    preferencesRef.current = preferences
    effectiveAppearanceRef.current = effectiveAppearance
    annotationsRef.current = annotations
    bookmarksRef.current = bookmarks
    searchStateRef.current = searchState
    annotationDialogRef.current = annotationDialog

    useImperativeHandle(
      ref,
      () => ({
        next: async () => {
          await viewRef.current?.next()
        },
        prev: async () => {
          await viewRef.current?.prev()
        },
        goTo: async (target) => {
          await viewRef.current?.goTo(target)
        },
        setTheme: (nextTheme) => {
          setPreferences((current) => ({ ...current, themeId: nextTheme }))
        },
        setFlow: (nextFlow) => {
          setPreferences((current) => ({ ...current, flow: nextFlow }))
        },
        getSnapshot: () => snapshotRef.current,
      }),
      [],
    )

    useEffect(() => {
      setSidebarOpen(showSidebar)
    }, [showSidebar])

    useEffect(() => {
      if (preferences.appearanceMode === APPEARANCE_LIGHT) {
        setEffectiveAppearance("light")
        return
      }
      if (preferences.appearanceMode === APPEARANCE_DARK) {
        setEffectiveAppearance("dark")
        return
      }
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      const apply = () => {
        setEffectiveAppearance(media.matches ? "dark" : "light")
      }
      apply()
      media.addEventListener("change", apply)
      return () => media.removeEventListener("change", apply)
    }, [preferences.appearanceMode])

    useEffect(() => {
      saveGlobalPreferences(preferences)
      const view = viewRef.current
      if (!view) return
      applyReaderPreferences(view, theme, preferences, effectiveAppearance)
      syncMarginals(view, snapshotRef.current, locationRef.current)
    }, [effectiveAppearance, preferences, theme])

    useEffect(() => {
      if (!bookKey) return
      saveBookState(bookKey, {
        lastLocation: typeof location.cfi === "string" ? location.cfi : undefined,
        bookmarks,
        annotations,
      })
    }, [annotations, bookmarks, bookKey, location.cfi])

    useEffect(() => {
      return () => {
        const generator = searchGeneratorRef.current
        if (generator) {
          void generator.return?.(undefined)
        }
      }
    }, [])

    function resetTransientUi() {
      selectionActionRef.current = null
      setSelectionToolbar(null)
      setAnnotationPopover(null)
      setAnnotationDialog(null)
      setProgressDraft(null)
    }

    async function resetSearch(view = viewRef.current) {
      const generator = searchGeneratorRef.current
      if (generator) {
        await generator.return?.(undefined)
      }
      searchGeneratorRef.current = null
      view?.clearSearch()
      setSearchState((current) => ({
        ...current,
        running: false,
        progress: null,
        rows: current.query.trim().length === 0 ? [] : current.rows,
      }))
    }

    async function runSearch(nextQuery?: string) {
      const view = viewRef.current
      if (!view) return

      const query = (nextQuery ?? searchState.query).trim()
      await resetSearch(view)

      if (!query) {
        setSearchState((current) => ({
          ...current,
          query,
          running: false,
          progress: null,
          rows: [],
          activeResultCfi: undefined,
        }))
        return
      }

      const runId = searchRunIdRef.current + 1
      searchRunIdRef.current = runId
      setSidebarTab(SIDEBAR_SEARCH)
      setSidebarOpen(true)
      setSearchState((current) => ({
        ...current,
        query,
        running: true,
        progress: null,
        rows: [],
        activeResultCfi: undefined,
      }))

      const generator = view.search({
        query,
        matchCase: searchState.matchCase,
        matchWholeWords: searchState.matchWholeWords,
        matchDiacritics: searchState.matchDiacritics,
        index: searchState.scope === SEARCH_SCOPE_SECTION ? locationRef.current.index : null,
      })
      searchGeneratorRef.current = generator

      const rows: ReaderSearchRow[] = []
      for await (const result of generator) {
        if (runId !== searchRunIdRef.current) return
        if (result === "done") {
          setSearchState((current) => ({
            ...current,
            running: false,
            progress: null,
            rows,
            activeResultCfi: rows.find((row) => row.kind === "result")?.cfi,
          }))
          return
        }
        if ("progress" in result) {
          setSearchState((current) => ({ ...current, progress: result.progress }))
          continue
        }
        if ("subitems" in result) {
          rows.push({
            key: `${SEARCH_SECTION_KEY_PREFIX}${rows.length}`,
            kind: "section",
            label: result.label ?? "Section",
          })
          for (const item of result.subitems) {
            rows.push({
              key: `${SEARCH_RESULT_KEY_PREFIX}${item.cfi}`,
              kind: "result",
              cfi: item.cfi,
              excerpt: item.excerpt,
            })
          }
        } else {
          rows.push({
            key: `${SEARCH_RESULT_KEY_PREFIX}${result.cfi}`,
            kind: "result",
            cfi: result.cfi,
            excerpt: result.excerpt,
          })
        }
        setSearchState((current) => ({
          ...current,
          rows: [...rows],
          progress: current.running ? current.progress : null,
        }))
      }
    }

    async function hydrateAnnotations(
      view: FoliateView,
      nextAnnotations: ReaderAnnotation[],
      onlyIndex?: number,
    ) {
      for (const annotation of nextAnnotations) {
        if (typeof onlyIndex === "number" && annotation.index !== onlyIndex) continue
        const info = await view.addAnnotation(annotation)
        if (!info) continue
        if (annotation.index === info.index && annotation.label === info.label) continue
        setAnnotations((current) =>
          current.map((entry) =>
            entry.value === annotation.value
              ? { ...entry, index: info.index, label: info.label }
              : entry,
          ),
        )
      }
    }

    function updateHistoryState(view: FoliateView) {
      setHistoryState({
        canGoBack: view.history.canGoBack,
        canGoForward: view.history.canGoForward,
      })
    }

    function openSelectionToolbar(action: ReaderSelectionAction) {
      selectionActionRef.current = action
      setAnnotationPopover(null)
      setSelectionToolbar({
        text: action.text,
        x: action.x,
        y: action.y,
      })
    }

    function openAnnotationPopover(value: string, range: Range) {
      const container = rootRef.current
      if (!container) return
      const position = getOverlayPosition(range, container)
      selectionActionRef.current = null
      setSelectionToolbar(null)
      setAnnotationPopover({
        value,
        x: position.x,
        y: position.y,
      })
    }

    function openAnnotationDialog(annotation?: ReaderAnnotation) {
      if (annotation) {
        setAnnotationDialog(toAnnotationDialogState(annotation))
      } else {
        const selectionAction = selectionActionRef.current
        setAnnotationDialog({
          mode: "create",
          value: selectionAction?.cfi ?? "",
          text: selectionAction?.text ?? "",
          note: "",
          style: ANNOTATION_STYLE_HIGHLIGHT,
          color: "amber",
        })
      }
      setSelectionToolbar(null)
      setAnnotationPopover(null)
    }

    async function createOrUpdateAnnotation(nextDialog: ReaderAnnotationDialogState) {
      const view = viewRef.current
      if (!view) return

      if (nextDialog.mode === "create") {
        const selectionAction = selectionActionRef.current
        if (!selectionAction) return
        const now = new Date().toISOString()
        const annotation: ReaderAnnotation = {
          value: selectionAction.cfi,
          text: selectionAction.text,
          note: nextDialog.note.trim(),
          style: nextDialog.style,
          color: getAnnotationColorValue(nextDialog.color),
          created: now,
          modified: now,
        }
        const info = await view.addAnnotation(annotation)
        if (info) {
          annotation.index = info.index
          annotation.label = info.label
        }
        setAnnotations((current) =>
          [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
        )
        setAnnotationDialog(null)
        setSelectionToolbar(null)
        return
      }

      const existing = getAnnotationAtValue(annotations, nextDialog.value)
      if (!existing) return
      const updated: ReaderAnnotation = {
        ...existing,
        note: nextDialog.note.trim(),
        style: nextDialog.style,
        color: getAnnotationColorValue(nextDialog.color),
        modified: new Date().toISOString(),
      }
      await view.deleteAnnotation(existing)
      const info = await view.addAnnotation(updated)
      if (info) {
        updated.index = info.index
        updated.label = info.label
      }
      setAnnotations((current) =>
        current.map((annotation) => (annotation.value === updated.value ? updated : annotation)),
      )
      setAnnotationDialog(null)
      setAnnotationPopover(null)
    }

    async function deleteAnnotationValue(value: string) {
      const view = viewRef.current
      const annotation = getAnnotationAtValue(annotations, value)
      if (!view || !annotation) return
      await view.deleteAnnotation(annotation)
      setAnnotations((current) => current.filter((entry) => entry.value !== value))
      setAnnotationDialog(null)
      setAnnotationPopover(null)
    }

    async function toggleBookmark() {
      const cfi = locationRef.current.cfi
      if (!cfi) return
      const existing = getBookmarkAtLocation(bookmarksRef.current, cfi)
      if (existing) {
        setBookmarks((current) => current.filter((bookmark) => bookmark.value !== cfi))
        return
      }
      const bookmark: ReaderBookmark = {
        value: cfi,
        label: locationRef.current.tocLabel ?? locationRef.current.pageLabel ?? cfi,
        created: new Date().toISOString(),
      }
      setBookmarks((current) =>
        [...current, bookmark].sort((a, b) => a.value.localeCompare(b.value)),
      )
    }

    async function showSearchResult(cfi: string) {
      const view = viewRef.current
      if (!view) return
      setSearchState((current) => ({ ...current, activeResultCfi: cfi }))
      await view.goTo(cfi)
    }

    async function cycleSearchResults(direction: 1 | -1) {
      const results = getSearchResultRows(searchState)
      if (results.length === 0) return
      const currentIndex = results.findIndex((row) => row.cfi === searchState.activeResultCfi)
      const baseIndex = currentIndex < 0 ? 0 : currentIndex
      const nextIndex = (baseIndex + direction + results.length) % results.length
      await showSearchResult(results[nextIndex].cfi)
    }

    function revealSearchPanel(query: string) {
      setSidebarOpen(true)
      setSidebarTab(SIDEBAR_SEARCH)
      setSearchState((current) => ({ ...current, query }))
      window.setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 0)
    }

    function openSearchWithQuery(query: string) {
      revealSearchPanel(query)
      void runSearch(query)
    }

    function openLocationDialog() {
      setLocationDraft(locationRef.current.cfi ?? "")
      setLocationDialogOpen(true)
    }

    async function goToLocationTarget(target: string) {
      const value = target.trim()
      if (!value) return
      await viewRef.current?.goTo(value)
      setLocationDialogOpen(false)
    }

    function handleShortcut(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
      if (isEditingTarget(event.target)) return
      const key = event.key
      const command = event.metaKey || event.ctrlKey
      if (command && key.toLowerCase() === "f") {
        event.preventDefault()
        revealSearchPanel(searchStateRef.current.query)
        return
      }
      if (command && key.toLowerCase() === "d") {
        event.preventDefault()
        void toggleBookmark()
        return
      }
      if (command && key.toLowerCase() === "l") {
        event.preventDefault()
        openLocationDialog()
        return
      }
      if (command && key === ",") {
        event.preventDefault()
        setSidebarOpen(true)
        setSidebarTab(SIDEBAR_PREFERENCES)
        return
      }
      if (event.altKey && key === "ArrowLeft") {
        event.preventDefault()
        viewRef.current?.history.back()
        return
      }
      if (event.altKey && key === "ArrowRight") {
        event.preventDefault()
        viewRef.current?.history.forward()
        return
      }
      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (key === "Escape") {
        setSelectionToolbar(null)
        setAnnotationPopover(null)
        setLocationDialogOpen(false)
        if (annotationDialogRef.current) setAnnotationDialog(null)
      }
    }

    useEffect(() => {
      const root = rootRef.current
      if (!root) return

      const listener = (event: KeyboardEvent) => handleShortcut(event)
      root.addEventListener("keydown", listener)
      return () => root.removeEventListener("keydown", listener)
    }, [])

    useEffect(() => {
      const host = viewportRef.current
      if (!host) return

      cleanupView(viewRef.current, coverUrlRef.current)
      viewRef.current = null
      coverUrlRef.current = undefined
      host.replaceChildren()

      void resetSearch(null)
      resetTransientUi()

      if (!stableSource) {
        snapshotRef.current = null
        locationRef.current = {}
        setBookKey(null)
        setStatus("idle")
        setSnapshot(null)
        setLocation({})
        setBookmarks([])
        setAnnotations([])
        setHistoryState({ canGoBack: false, canGoForward: false })
        setSectionFractions([])
        setError(null)
        return
      }

      let cancelled = false
      snapshotRef.current = null
      locationRef.current = {}
      setStatus("loading")
      setSnapshot(null)
      setLocation({})
      setError(null)
      setBookmarks([])
      setAnnotations([])
      setSectionFractions([])
      setHistoryState({ canGoBack: false, canGoForward: false })

      void (async () => {
        try {
          const module = await import("foliate-js/view.js")
          if (cancelled) return

          const view = new module.View()
          viewRef.current = view
          host.append(view)

          const relocateListener = (event: CustomEvent<FoliateRelocationDetail>) => {
            const nextLocation = buildLocationState(event.detail)
            locationRef.current = nextLocation
            startTransition(() => setLocation(nextLocation))
            syncMarginals(view, snapshotRef.current, nextLocation)
            callbacksRef.current.onLocationChange?.(nextLocation)
          }

          const externalLinkListener = (event: CustomEvent<{ href: string }>) => {
            if (!callbacksRef.current.onOpenExternalLink) return
            event.preventDefault()
            callbacksRef.current.onOpenExternalLink(event.detail.href)
          }

          const drawAnnotationListener = (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => {
            drawAnnotation(event)
          }

          const overlayListener = (event: CustomEvent<{ index: number }>) => {
            void hydrateAnnotations(view, annotationsRef.current, event.detail.index)
          }

          const showAnnotationListener = (
            event: CustomEvent<{ value: string; index: number; range: Range }>,
          ) => {
            openAnnotationPopover(event.detail.value, event.detail.range)
          }

          const historyListener = () => updateHistoryState(view)

          const loadListener = (event: CustomEvent<{ doc: Document; index: number }>) => {
            event.detail.doc.addEventListener("pointerup", () => {
              const selection = event.detail.doc.getSelection()
              const range = readSelectedRange(selection)
              const container = rootRef.current
              if (!range || !container) {
                return
              }
              const position = getOverlayPosition(range, container)
              openSelectionToolbar({
                index: event.detail.index,
                range,
                cfi: view.getCFI(event.detail.index, range),
                text: selection?.toString().trim() ?? "",
                x: position.x,
                y: position.y,
              })
            })
            event.detail.doc.addEventListener("keydown", (keyEvent) => handleShortcut(keyEvent))
          }

          view.addEventListener("relocate", relocateListener)
          view.addEventListener("external-link", externalLinkListener)
          view.addEventListener("draw-annotation", drawAnnotationListener)
          view.addEventListener("create-overlay", overlayListener)
          view.addEventListener("show-annotation", showAnnotationListener)
          view.addEventListener("load", loadListener)
          view.history.addEventListener("index-change", historyListener)

          await view.open(toFoliateInput(stableSource))
          if (cancelled) return

          const nextBookKey = buildBookPersistenceKey(stableSource, view.book)
          const persisted = loadBookState(nextBookKey)

          const themeDefinition = getThemeDefinition(preferencesRef.current.themeId)
          applyReaderPreferences(
            view,
            themeDefinition,
            preferencesRef.current,
            effectiveAppearanceRef.current,
          )
          const coverUrlPromise = resolveCoverUrl(view.book)

          await view.init({
            lastLocation: stableInitialLocation ?? persisted.lastLocation,
            showTextStart:
              stableInitialLocation === undefined && persisted.lastLocation === undefined,
          })

          const coverUrl = await coverUrlPromise
          if (cancelled) {
            releaseObjectUrl(coverUrl)
            return
          }

          const nextSnapshot: FoliateReaderSnapshot = {
            title:
              formatMetadataValue(view.book.metadata?.title) ??
              getSourceName(stableSource) ??
              DEFAULT_TITLE,
            author:
              formatContributor(view.book.metadata?.author) ??
              formatContributor(view.book.metadata?.contributor) ??
              DEFAULT_AUTHOR,
            formatLabel: getSourceFormatLabel(stableSource),
            isFixedLayout: view.isFixedLayout,
            toc: view.book.toc ?? [],
            pageList: view.book.pageList ?? [],
            landmarks: buildLandmarks(view.book),
            metadata: view.book.metadata,
            coverUrl,
            fileName: getSourceName(stableSource),
          }

          coverUrlRef.current = coverUrl
          const nextLocation = buildLocationState(view.lastLocation)
          snapshotRef.current = nextSnapshot
          locationRef.current = nextLocation

          startTransition(() => {
            setBookKey(nextBookKey)
            setBookmarks(persisted.bookmarks)
            setAnnotations(persisted.annotations)
            setSnapshot(nextSnapshot)
            setLocation(nextLocation)
            setStatus("ready")
          })

          setSectionFractions(view.getSectionFractions())
          updateHistoryState(view)
          syncMarginals(view, nextSnapshot, nextLocation)
          await hydrateAnnotations(view, persisted.annotations)
          callbacksRef.current.onReady?.(nextSnapshot)
          callbacksRef.current.onLocationChange?.(nextLocation)
        } catch (caughtError) {
          if (cancelled) return
          cleanupView(viewRef.current, coverUrlRef.current)
          viewRef.current = null
          coverUrlRef.current = undefined
          host.replaceChildren()
          const nextError = createError(caughtError)
          setError(nextError)
          setStatus("error")
          callbacksRef.current.onError?.(nextError)
        }
      })()

      return () => {
        cancelled = true
        cleanupView(viewRef.current, coverUrlRef.current)
        viewRef.current = null
        coverUrlRef.current = undefined
        host.replaceChildren()
      }
    }, [stableInitialLocation, stableSource])

    const progressValue =
      progressDraft ?? Math.round((location.fraction ?? 0) * DEFAULT_PROGRESS_STEPS)
    const chromeClassName =
      effectiveAppearance === "dark"
        ? "border-border-base/80 bg-surface-strong text-text-strong"
        : "border-border-base/80 bg-surface-raised-base text-text-base"

    const renderSearchPanel = () => (
      <div className="flex h-full min-h-0 flex-col">
        <div className="space-y-3 border-b border-border-base/70 px-4 py-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-weaker" />
            <Input
              ref={searchInputRef}
              value={searchState.query}
              onChange={(event) =>
                setSearchState((current) => ({ ...current, query: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void runSearch()
                }
              }}
              className="pl-9"
              placeholder="Search this book"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => void runSearch()} disabled={status !== "ready"}>
              Search
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void cycleSearchResults(1)}
              disabled={searchResults.length === 0}
            >
              Next result
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={searchState.scope}
              onValueChange={(value) => {
                if (value === SEARCH_SCOPE_BOOK || value === SEARCH_SCOPE_SECTION) {
                  setSearchState((current) => ({ ...current, scope: value }))
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEARCH_SCOPE_BOOK}>Whole book</SelectItem>
                <SelectItem value={SEARCH_SCOPE_SECTION}>Current section</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void cycleSearchResults(-1)}
              disabled={searchResults.length === 0}
            >
              Previous
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border-base/70 bg-surface-weak/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-weak">Match case</span>
              <Switch
                checked={searchState.matchCase}
                onCheckedChange={(checked) =>
                  setSearchState((current) => ({ ...current, matchCase: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-weak">Whole words</span>
              <Switch
                checked={searchState.matchWholeWords}
                onCheckedChange={(checked) =>
                  setSearchState((current) => ({ ...current, matchWholeWords: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-weak">Match diacritics</span>
              <Switch
                checked={searchState.matchDiacritics}
                onCheckedChange={(checked) =>
                  setSearchState((current) => ({ ...current, matchDiacritics: checked }))
                }
              />
            </div>
          </div>
          {searchState.running && searchState.progress !== null ? (
            <div className="space-y-1">
              <div className="text-xs text-text-weak">
                Scanning book… {Math.round(searchState.progress * 100)}%
              </div>
              <div className="h-1.5 rounded-full bg-surface-weak">
                <div
                  className="h-full rounded-full bg-surface-info-base transition-[width]"
                  style={{ width: `${Math.round(searchState.progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <ScrollArea className="h-full px-4 py-4" viewportRef={searchViewportRef}>
          {searchState.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
              {SEARCH_EMPTY_MESSAGE}
            </div>
          ) : searchState.rows.length >= VIRTUALIZE_ROW_THRESHOLD ? (
            <VirtualizedRows
              items={searchState.rows}
              getItemKey={(item) => item.key}
              estimateSize={(item) => (item.kind === "section" ? 34 : 72)}
              getScrollElement={() => searchViewportRef.current}
              overscan={8}
              measure
              renderItem={(row) =>
                row.kind === "section" ? (
                  <div className="pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker">
                    {row.label}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void showSearchResult(row.cfi)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                      searchState.activeResultCfi === row.cfi
                        ? "border-border-interactive-base bg-surface-interactive-weak text-text-strong"
                        : "border-border-base/70 bg-surface-weak/30 text-text-weak hover:bg-surface-weak/60 hover:text-text-base",
                    )}
                  >
                    <div className="line-clamp-3">{renderSearchExcerpt(row.excerpt)}</div>
                  </button>
                )
              }
            />
          ) : (
            <div className="space-y-2">
              {searchState.rows.map((row) =>
                row.kind === "section" ? (
                  <div
                    key={row.key}
                    className="pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker"
                  >
                    {row.label}
                  </div>
                ) : (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => void showSearchResult(row.cfi)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                      searchState.activeResultCfi === row.cfi
                        ? "border-border-interactive-base bg-surface-interactive-weak text-text-strong"
                        : "border-border-base/70 bg-surface-weak/30 text-text-weak hover:bg-surface-weak/60 hover:text-text-base",
                    )}
                  >
                    <div className="line-clamp-3">{renderSearchExcerpt(row.excerpt)}</div>
                  </button>
                ),
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    )

    const renderBookmarksPanel = () => (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border-base/70 px-4 py-4">
          <div>
            <div className="text-sm font-medium text-text-strong">Bookmarks</div>
            <div className="text-xs text-text-weak">Saved per book and jumpable.</div>
          </div>
          <Button
            size="sm"
            variant={currentBookmark ? "secondary" : "outline"}
            onClick={() => void toggleBookmark()}
          >
            <PinIcon className="size-4" />
            {currentBookmark ? "Remove" : "Add"}
          </Button>
        </div>
        <ScrollArea className="h-full px-4 py-4" viewportRef={bookmarkViewportRef}>
          {bookmarks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
              {BOOKMARKS_EMPTY_MESSAGE}
            </div>
          ) : bookmarks.length >= VIRTUALIZE_ROW_THRESHOLD ? (
            <VirtualizedRows
              items={bookmarks}
              getItemKey={(item) => item.value}
              estimateSize={() => 76}
              getScrollElement={() => bookmarkViewportRef.current}
              overscan={8}
              measure
              renderItem={(bookmark) => (
                <div className="pb-2">
                  <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => void viewRef.current?.goTo(bookmark.value)}
                        className="min-w-0 text-left"
                      >
                        <div className="truncate text-sm font-medium text-text-strong">
                          {bookmark.label}
                        </div>
                        <div className="truncate text-xs text-text-weak">{bookmark.value}</div>
                      </button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          setBookmarks((current) =>
                            current.filter((entry) => entry.value !== bookmark.value),
                          )
                        }
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            />
          ) : (
            <div className="space-y-2">
              {bookmarks.map((bookmark) => (
                <div
                  key={bookmark.value}
                  className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void viewRef.current?.goTo(bookmark.value)}
                      className="min-w-0 text-left"
                    >
                      <div className="truncate text-sm font-medium text-text-strong">
                        {bookmark.label}
                      </div>
                      <div className="truncate text-xs text-text-weak">{bookmark.value}</div>
                    </button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() =>
                        setBookmarks((current) =>
                          current.filter((entry) => entry.value !== bookmark.value),
                        )
                      }
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    )

    const renderAnnotationsPanel = () => (
      <div className="flex h-full min-h-0 flex-col">
        <div className="space-y-2 border-b border-border-base/70 px-4 py-4">
          <div>
            <div className="text-sm font-medium text-text-strong">Annotations</div>
            <div className="text-xs text-text-weak">Highlights, marks, and notes.</div>
          </div>
        </div>
        <ScrollArea className="h-full px-4 py-4" viewportRef={annotationViewportRef}>
          {annotations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
              {ANNOTATIONS_EMPTY_MESSAGE}
            </div>
          ) : annotations.length >= VIRTUALIZE_ROW_THRESHOLD ? (
            <VirtualizedRows
              items={annotations}
              getItemKey={(item) => item.value}
              estimateSize={() => 104}
              getScrollElement={() => annotationViewportRef.current}
              overscan={8}
              measure
              renderItem={(annotation) => (
                <div className="pb-2">
                  <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => void viewRef.current?.showAnnotation(annotation)}
                        className="min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2.5 rounded-full",
                              ANNOTATION_COLORS[getAnnotationColorId(annotation.color)]
                                .previewClassName,
                            )}
                          />
                          <span className="text-xs uppercase tracking-[0.12em] text-text-weaker">
                            {ANNOTATION_STYLE_LABELS[getAnnotationStyle(annotation)]}
                          </span>
                        </div>
                        <div className="mt-2 line-clamp-2 text-sm font-medium text-text-strong">
                          {annotation.text}
                        </div>
                        {annotation.note ? (
                          <div className="mt-1 line-clamp-2 text-xs text-text-weak">
                            {annotation.note}
                          </div>
                        ) : null}
                      </button>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => openAnnotationDialog(annotation)}
                        >
                          <PencilLineIcon className="size-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => void deleteAnnotationValue(annotation.value)}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            />
          ) : (
            <div className="space-y-2">
              {annotations.map((annotation) => (
                <div
                  key={annotation.value}
                  className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void viewRef.current?.showAnnotation(annotation)}
                      className="min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2.5 rounded-full",
                            ANNOTATION_COLORS[getAnnotationColorId(annotation.color)]
                              .previewClassName,
                          )}
                        />
                        <span className="text-xs uppercase tracking-[0.12em] text-text-weaker">
                          {ANNOTATION_STYLE_LABELS[getAnnotationStyle(annotation)]}
                        </span>
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm font-medium text-text-strong">
                        {annotation.text}
                      </div>
                      {annotation.note ? (
                        <div className="mt-1 line-clamp-2 text-xs text-text-weak">
                          {annotation.note}
                        </div>
                      ) : null}
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => openAnnotationDialog(annotation)}
                      >
                        <PencilLineIcon className="size-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void deleteAnnotationValue(annotation.value)}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    )

    const renderPreferencesPanel = () => (
      <ScrollArea className="h-full px-4 py-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 p-4">
            <div className="mb-3 text-sm font-medium text-text-strong">Appearance</div>
            <div className="grid gap-3">
              <Select
                value={preferences.themeId}
                onValueChange={(value) => {
                  if (isFoliateReaderThemeId(value)) {
                    setPreferences((current) => ({ ...current, themeId: value }))
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  {READER_THEMES.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={preferences.appearanceMode}
                onValueChange={(value) => {
                  if (
                    value === APPEARANCE_SYSTEM ||
                    value === APPEARANCE_LIGHT ||
                    value === APPEARANCE_DARK
                  ) {
                    setPreferences((current) => ({
                      ...current,
                      appearanceMode: value,
                    }))
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chrome style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={APPEARANCE_SYSTEM}>System chrome</SelectItem>
                  <SelectItem value={APPEARANCE_LIGHT}>Light chrome</SelectItem>
                  <SelectItem value={APPEARANCE_DARK}>Dark chrome</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={preferences.fontPreset}
                onValueChange={(value) => {
                  if (value === FONT_PUBLISHER || value === FONT_SERIF || value === FONT_SANS) {
                    setPreferences((current) => ({ ...current, fontPreset: value }))
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Font family" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FONT_PUBLISHER}>Publisher fonts</SelectItem>
                  <SelectItem value={FONT_SERIF}>Serif</SelectItem>
                  <SelectItem value={FONT_SANS}>Sans</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 p-4">
            <div className="mb-3 text-sm font-medium text-text-strong">Layout</div>
            <div className="space-y-3">
              {canChangeFlow ? (
                <Select
                  value={preferences.flow}
                  onValueChange={(value) => {
                    if (value === FLOW_PAGINATED || value === FLOW_SCROLLED) {
                      setPreferences((current) => ({ ...current, flow: value }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Reading flow" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FLOW_PAGINATED}>Paginated</SelectItem>
                    <SelectItem value={FLOW_SCROLLED}>Vertical scroll</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <label className="space-y-1">
                <div className="text-xs text-text-weak">Font size</div>
                <input
                  type="range"
                  min="0.85"
                  max="1.4"
                  step="0.01"
                  value={preferences.fontScaleRem}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      fontScaleRem: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-text-weak">Line height</div>
                <input
                  type="range"
                  min="1.2"
                  max="2"
                  step="0.02"
                  value={preferences.lineHeight}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      lineHeight: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-text-weak">Column gap</div>
                <input
                  type="range"
                  min="0"
                  max="18"
                  step="1"
                  value={preferences.gapPercent}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      gapPercent: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-text-weak">Margins</div>
                <input
                  type="range"
                  min="16"
                  max="120"
                  step="2"
                  value={preferences.marginPx}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      marginPx: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-text-weak">Max column width</div>
                <input
                  type="range"
                  min="520"
                  max="1100"
                  step="10"
                  value={preferences.maxInlineSizePx}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      maxInlineSizePx: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-text-weak">Max page height</div>
                <input
                  type="range"
                  min="900"
                  max="2200"
                  step="25"
                  value={preferences.maxBlockSizePx}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      maxBlockSizePx: Number(event.target.value),
                    }))
                  }
                  className="w-full"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 p-4">
            <div className="mb-3 text-sm font-medium text-text-strong">Reading behavior</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-weak">Justify text</span>
                <Switch
                  checked={preferences.justify}
                  onCheckedChange={(checked) =>
                    setPreferences((current) => ({ ...current, justify: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-weak">Hyphenation</span>
                <Switch
                  checked={preferences.hyphenate}
                  onCheckedChange={(checked) =>
                    setPreferences((current) => ({ ...current, hyphenate: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-weak">Reduce motion</span>
                <Switch
                  checked={preferences.reduceMotion}
                  onCheckedChange={(checked) =>
                    setPreferences((current) => ({ ...current, reduceMotion: checked }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-weak">Autohide cursor</span>
                <Switch
                  checked={preferences.autohideCursor}
                  onCheckedChange={(checked) =>
                    setPreferences((current) => ({ ...current, autohideCursor: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    )

    return (
      <section
        ref={rootRef}
        tabIndex={0}
        data-component="foliate-reader"
        data-theme={theme.id}
        data-appearance={effectiveAppearance}
        onKeyDown={handleShortcut}
        className={cn(
          "grid min-h-0 overflow-hidden rounded-[1.4rem] border shadow-[0_18px_48px_color-mix(in_oklab,var(--surface-strong)_18%,transparent)]",
          chromeClassName,
          theme.shellClassName,
          sidebarOpen ? READER_SIDE_PANEL_WIDTH_CLASS : "grid-cols-1",
          className,
        )}
      >
        <style>{`
          .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME} {
            display: block;
            height: 100%;
            width: 100%;
          }

          .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(head),
          .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(foot) {
            color: var(--text-weak);
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          [data-component="foliate-reader"][data-theme="${theme.id}"][data-appearance="${effectiveAppearance}"] .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(filter) {
            filter: ${effectiveAppearance === "dark" ? theme.pdfFilterDark : theme.pdfFilterLight};
          }
        `}</style>

        {sidebarOpen ? (
          <aside className="min-h-0 border-b border-border-base/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-raised-base)_94%,transparent)_0%,color-mix(in_oklab,var(--surface-base)_96%,transparent)_100%)] backdrop-blur lg:border-b-0 lg:border-r">
            <Tabs
              value={sidebarTab}
              onValueChange={(nextValue) => {
                if (isFoliateSidebarTab(nextValue)) setSidebarTab(nextValue)
              }}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="space-y-4 border-b border-border-base/70 px-4 py-4">
                <div className="flex items-start gap-3">
                  {snapshot?.coverUrl ? (
                    <img
                      src={snapshot.coverUrl}
                      alt={`${snapshot.title} cover`}
                      className="h-20 w-14 shrink-0 rounded-xl border border-border-base/70 object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-base/70 bg-surface-weak/60 text-text-weaker">
                      <BookOpenIcon className="size-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="space-y-1">
                      <div className="line-clamp-2 text-sm font-semibold leading-snug text-text-strong">
                        {snapshot?.title ??
                          (source ? getSourceName(source) : undefined) ??
                          DEFAULT_TITLE}
                      </div>
                      <div className="truncate text-xs text-text-weak">
                        {snapshot?.author ?? DEFAULT_AUTHOR}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{snapshot?.formatLabel ?? "Book"}</Badge>
                      <Badge variant="outline">
                        {location.locationLabel ?? "Location pending"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border-base/70 bg-surface-weak/25 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                        Current location
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-text-strong">
                        {location.tocLabel ?? snapshot?.title ?? "Opening section"}
                      </div>
                      <div className="truncate text-xs text-text-weak">
                        {location.pageLabel ??
                          location.locationLabel ??
                          snapshot?.author ??
                          DEFAULT_AUTHOR}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                        Progress
                      </div>
                      <div className="mt-1 text-sm font-semibold text-text-strong">
                        {toPercentLabel(location.fraction) ?? "0%"}
                      </div>
                    </div>
                  </div>
                </div>

                <TabsList className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-border-base/70 bg-surface-weak/20 p-1">
                  <TabsTrigger
                    value={SIDEBAR_CONTENTS}
                    className="h-auto flex-col gap-1 rounded-xl px-2 py-2.5 text-[11px]"
                  >
                    <MapIcon className="size-4" />
                    Contents
                  </TabsTrigger>
                  <TabsTrigger
                    value={SIDEBAR_SEARCH}
                    className="h-auto flex-col gap-1 rounded-xl px-2 py-2.5 text-[11px]"
                  >
                    <SearchIcon className="size-4" />
                    Search
                  </TabsTrigger>
                  <TabsTrigger
                    value={SIDEBAR_BOOKMARKS}
                    className="h-auto flex-col gap-1 rounded-xl px-2 py-2.5 text-[11px]"
                  >
                    <PinIcon className="size-4" />
                    Marks
                  </TabsTrigger>
                  <TabsTrigger
                    value={SIDEBAR_ANNOTATIONS}
                    className="h-auto flex-col gap-1 rounded-xl px-2 py-2.5 text-[11px]"
                  >
                    <PencilLineIcon className="size-4" />
                    Notes
                  </TabsTrigger>
                  <TabsTrigger
                    value={SIDEBAR_DETAILS}
                    className="h-auto flex-col gap-1 rounded-xl px-2 py-2.5 text-[11px]"
                  >
                    <InfoIcon className="size-4" />
                    Details
                  </TabsTrigger>
                  <TabsTrigger
                    value={SIDEBAR_PREFERENCES}
                    className="h-auto flex-col gap-1 rounded-xl px-2 py-2.5 text-[11px]"
                  >
                    <SettingsIcon className="size-4" />
                    Prefs
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={SIDEBAR_CONTENTS} className="min-h-0 flex-1">
                <ScrollArea className="h-full px-4 py-4">
                  {snapshot?.toc?.length ? (
                    <FoliateTocTree
                      items={snapshot.toc}
                      activeLabel={location.tocLabel}
                      onSelect={(href) => {
                        void viewRef.current?.goTo(href)
                      }}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
                      {TOC_EMPTY_MESSAGE}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value={SIDEBAR_SEARCH} className="min-h-0 flex-1">
                {renderSearchPanel()}
              </TabsContent>

              <TabsContent value={SIDEBAR_BOOKMARKS} className="min-h-0 flex-1">
                {renderBookmarksPanel()}
              </TabsContent>

              <TabsContent value={SIDEBAR_ANNOTATIONS} className="min-h-0 flex-1">
                {renderAnnotationsPanel()}
              </TabsContent>

              <TabsContent value={SIDEBAR_DETAILS} className="min-h-0 flex-1">
                <ScrollArea className="h-full px-4 py-4">
                  <FoliateMetadataPanel snapshot={snapshot} />
                </ScrollArea>
              </TabsContent>

              <TabsContent value={SIDEBAR_PREFERENCES} className="min-h-0 flex-1">
                {renderPreferencesPanel()}
              </TabsContent>
            </Tabs>
          </aside>
        ) : null}

        <div className="flex min-h-0 flex-col">
          {showToolbar ? (
            <header className="space-y-3 border-b border-border-base/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-raised-base)_94%,transparent)_0%,color-mix(in_oklab,var(--surface-base)_97%,transparent)_100%)] px-4 py-3 backdrop-blur">
              <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
                <div className="flex items-center gap-2">
                  {showSidebar ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSidebarOpen((current) => !current)}
                      aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                    >
                      {sidebarOpen ? (
                        <PanelLeftCloseIcon className="size-4" />
                      ) : (
                        <PanelLeftOpenIcon className="size-4" />
                      )}
                    </Button>
                  ) : null}

                  <div className="flex items-center gap-1 rounded-full border border-border-base/70 bg-surface-raised-base/70 p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Previous page"
                      onClick={() => {
                        void viewRef.current?.goLeft()
                      }}
                      disabled={status !== "ready"}
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="History back"
                      onClick={() => viewRef.current?.history.back()}
                      disabled={!historyState.canGoBack}
                    >
                      <Undo2Icon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="History forward"
                      onClick={() => viewRef.current?.history.forward()}
                      disabled={!historyState.canGoForward}
                    >
                      <Redo2Icon className="size-4" />
                    </Button>
                    <Separator orientation="vertical" className="mx-1 h-5" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Next page"
                      onClick={() => {
                        void viewRef.current?.goRight()
                      }}
                      disabled={status !== "ready"}
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openLocationDialog}
                  className="min-w-0 rounded-[1.15rem] border border-border-base/70 bg-surface-raised-base/62 px-3 py-2.5 text-left shadow-[inset_0_1px_0_color-mix(in_oklab,var(--surface-stronger)_14%,transparent)] transition hover:border-border-strong hover:bg-surface-raised-base/78"
                  aria-label="Open location and jumps"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                        <MapIcon className="size-3.5" />
                        Location
                      </div>
                      <div className="mt-1 truncate text-sm font-medium text-text-strong">
                        {location.tocLabel ?? snapshot?.title ?? DEFAULT_TITLE}
                      </div>
                      <div className="truncate text-xs text-text-weak">
                        {location.pageLabel ??
                          location.locationLabel ??
                          snapshot?.author ??
                          progressSummary}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                        Progress
                      </div>
                      <div className="mt-1 text-sm font-semibold text-text-strong">
                        {toPercentLabel(location.fraction) ?? "0%"}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant={currentBookmark ? "secondary" : "outline"}
                    onClick={() => void toggleBookmark()}
                    className="rounded-full"
                  >
                    <PinIcon className="size-4" />
                    {currentBookmark ? "Saved" : "Bookmark"}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label="Reader actions">
                        <EllipsisIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => openSearchWithQuery(searchState.query)}>
                        <SearchIcon className="mr-2 size-4" />
                        Find in book
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={openLocationDialog}>
                        <MapIcon className="mr-2 size-4" />
                        Location and jumps
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSidebarOpen(true)
                          setSidebarTab(SIDEBAR_PREFERENCES)
                        }}
                      >
                        <SettingsIcon className="mr-2 size-4" />
                        Reader preferences
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                        <CircleQuestionMarkIcon className="mr-2 size-4" />
                        Keyboard shortcuts
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid gap-3 border-t border-border-base/60 pt-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="space-y-2 rounded-[1.1rem] border border-border-base/60 bg-surface-weak/15 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                    <span>Progress</span>
                    <span>{toPercentLabel(location.fraction) ?? "0%"}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={String(DEFAULT_PROGRESS_STEPS)}
                    step="1"
                    list={sliderListId}
                    value={progressValue}
                    onChange={(event) => {
                      setProgressDraft(Number(event.target.value))
                    }}
                    onMouseUp={() => {
                      if (progressDraft === null) return
                      void viewRef.current?.goToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
                      setProgressDraft(null)
                    }}
                    onTouchEnd={() => {
                      if (progressDraft === null) return
                      void viewRef.current?.goToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
                      setProgressDraft(null)
                    }}
                    className="w-full accent-[var(--text-interactive-base)]"
                  />
                  <datalist id={sliderListId}>
                    {sectionFractions.map((fraction) => (
                      <option
                        key={fraction}
                        value={Math.round(fraction * DEFAULT_PROGRESS_STEPS)}
                      />
                    ))}
                  </datalist>
                </div>

                <Select
                  value={preferences.themeId}
                  onValueChange={(value) => {
                    if (isFoliateReaderThemeId(value)) {
                      setPreferences((current) => ({ ...current, themeId: value }))
                    }
                  }}
                >
                  <SelectTrigger className="min-w-[10rem] rounded-full bg-surface-raised-base/70">
                    <SelectValue placeholder="Theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {READER_THEMES.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {canChangeFlow ? (
                  <div className="flex items-center gap-1 rounded-full border border-border-base/60 bg-surface-raised-base/70 p-1">
                    <Button
                      type="button"
                      variant={preferences.flow === FLOW_PAGINATED ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() =>
                        setPreferences((current) => ({ ...current, flow: FLOW_PAGINATED }))
                      }
                    >
                      <LayoutPanelLeftIcon className="size-4" />
                      Paginated
                    </Button>
                    <Button
                      type="button"
                      variant={preferences.flow === FLOW_SCROLLED ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() =>
                        setPreferences((current) => ({ ...current, flow: FLOW_SCROLLED }))
                      }
                    >
                      <ScrollTextIcon className="size-4" />
                      Vertical scroll
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center rounded-full border border-border-base/70 bg-surface-raised-base/80 px-3 text-xs text-text-weak">
                    Fixed layout
                  </div>
                )}
              </div>
            </header>
          ) : null}

          <div className={cn("relative min-h-0 flex-1 p-3 sm:p-4", theme.viewportClassName)}>
            <div className="absolute inset-x-3 top-3 z-10 sm:inset-x-4 sm:top-4">
              {status === "loading" ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-border-base/80 bg-surface-raised-base/85 px-3 py-1.5 text-xs text-text-weak shadow-sm backdrop-blur">
                  <Loader2Icon className="size-4 animate-spin" />
                  Preparing reader…
                </div>
              ) : null}
            </div>

            {status === "idle" ? (
              <FoliateEmptyState>{emptyState}</FoliateEmptyState>
            ) : status === "error" && error ? (
              <FoliateErrorState error={error} />
            ) : null}

            <div
              ref={viewportRef}
              className={cn(
                VIEWPORT_CLASS_NAME,
                "h-full min-h-[24rem] overflow-hidden rounded-[1.2rem] border border-border-base/70 bg-surface-raised-base/80 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--surface-stronger)_18%,transparent)]",
                status === "idle" || status === "error" ? "hidden" : "block",
              )}
            />

            {selectionToolbar ? (
              <div
                className="absolute z-20 -translate-x-1/2 -translate-y-full"
                style={{ left: `${selectionToolbar.x}px`, top: `${selectionToolbar.y}px` }}
              >
                <Card size="sm" className="bg-surface-raised-base/96 shadow-xl backdrop-blur">
                  <CardContent className="flex items-center gap-1 px-2 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (selectionActionRef.current) {
                          void copyText(selectionActionRef.current.text)
                        }
                      }}
                    >
                      <CopyIcon className="size-4" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (selectionActionRef.current) {
                          void copyText(selectionActionRef.current.cfi)
                        }
                      }}
                    >
                      CFI
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const action = selectionActionRef.current
                        if (!action) return
                        const now = new Date().toISOString()
                        const annotation: ReaderAnnotation = {
                          value: action.cfi,
                          text: action.text,
                          note: "",
                          style: ANNOTATION_STYLE_HIGHLIGHT,
                          color: ANNOTATION_COLORS.amber.value,
                          created: now,
                          modified: now,
                        }
                        void (async () => {
                          const info = await viewRef.current?.addAnnotation(annotation)
                          if (info) {
                            annotation.index = info.index
                            annotation.label = info.label
                          }
                          setAnnotations((current) =>
                            [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
                          )
                          setSelectionToolbar(null)
                        })()
                      }}
                    >
                      Highlight
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openAnnotationDialog()}>
                      Note
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (selectionActionRef.current) {
                          openSearchWithQuery(selectionActionRef.current.text)
                        }
                      }}
                    >
                      Search
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {annotationPopover ? (
              <div
                className="absolute z-20 -translate-x-1/2 -translate-y-full"
                style={{ left: `${annotationPopover.x}px`, top: `${annotationPopover.y}px` }}
              >
                <Card size="sm" className="bg-surface-raised-base/96 shadow-xl backdrop-blur">
                  <CardContent className="flex items-center gap-1 px-2 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        openAnnotationDialog(
                          getAnnotationAtValue(annotations, annotationPopover.value),
                        )
                      }
                    >
                      <PencilLineIcon className="size-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void deleteAnnotationValue(annotationPopover.value)}
                    >
                      <XIcon className="size-4" />
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {snapshot ? (
              <div className="pointer-events-none absolute inset-x-6 bottom-5 hidden justify-center lg:flex">
                <Card
                  size="sm"
                  className="pointer-events-auto max-w-xl bg-surface-raised-base/86 shadow-lg backdrop-blur"
                >
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex size-9 items-center justify-center rounded-xl border border-border-base/70 bg-surface-weak/70 text-text-weak">
                      <BookOpenIcon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-strong">
                        {snapshot.title}
                      </div>
                      <div className="truncate text-xs text-text-weak">
                        {location.tocLabel ?? location.pageLabel ?? snapshot.author}
                      </div>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="text-right text-xs text-text-weak">
                      <div>{toPercentLabel(location.fraction) ?? "Ready"}</div>
                      <div>{location.locationLabel ?? snapshot.formatLabel}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </div>

        <Dialog
          open={Boolean(annotationDialog)}
          onOpenChange={(open) => !open && setAnnotationDialog(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {annotationDialog?.mode === "edit" ? "Edit annotation" : "Add note"}
              </DialogTitle>
              <DialogDescription>
                {annotationDialog?.mode === "edit"
                  ? "Adjust the highlight style or note."
                  : "Create a persistent highlight or note from the current selection."}
              </DialogDescription>
            </DialogHeader>
            {annotationDialog ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3 text-sm text-text-weak">
                  {annotationDialog.text || selectionToolbar?.text || "Selected text"}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    value={annotationDialog.style}
                    onValueChange={(value) => {
                      if (
                        value === ANNOTATION_STYLE_HIGHLIGHT ||
                        value === ANNOTATION_STYLE_UNDERLINE ||
                        value === ANNOTATION_STYLE_SQUIGGLY ||
                        value === ANNOTATION_STYLE_STRIKETHROUGH
                      ) {
                        setAnnotationDialog((current) =>
                          current ? { ...current, style: value } : current,
                        )
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Style" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ANNOTATION_STYLE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={annotationDialog.color}
                    onValueChange={(value) => {
                      if (isReaderAnnotationColorId(value)) {
                        setAnnotationDialog((current) =>
                          current ? { ...current, color: value } : current,
                        )
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Color" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ANNOTATION_COLORS).map(([value, definition]) => (
                        <SelectItem key={value} value={value}>
                          {definition.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={annotationDialog.note}
                  onChange={(event) =>
                    setAnnotationDialog((current) =>
                      current ? { ...current, note: event.target.value } : current,
                    )
                  }
                  placeholder="Add a note"
                  rows={5}
                />
              </div>
            ) : null}
            <DialogFooter>
              {annotationDialog?.mode === "edit" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (annotationDialog) {
                      void deleteAnnotationValue(annotationDialog.value)
                    }
                  }}
                >
                  Delete
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setAnnotationDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (annotationDialog) {
                    void createOrUpdateAnnotation(annotationDialog)
                  }
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
          <DialogContent className="sm:max-w-[42rem]">
            <DialogHeader>
              <DialogTitle>Location and jumps</DialogTitle>
              <DialogDescription>
                Foliate-style reading controls for chapters, pages, CFI targets, and landmarks.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                    Chapter
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium text-text-strong">
                    {location.tocLabel ?? "Current section"}
                  </div>
                </div>
                <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                    Page
                  </div>
                  <div className="mt-1 text-sm font-medium text-text-strong">
                    {location.pageLabel ?? "Unavailable"}
                  </div>
                </div>
                <div className="rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                    Progress
                  </div>
                  <div className="mt-1 text-sm font-medium text-text-strong">
                    {location.locationLabel ??
                      toPercentLabel(location.fraction) ??
                      "Reading position unavailable"}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                  CFI
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={locationDraft}
                    onChange={(event) => setLocationDraft(event.target.value)}
                    placeholder="Paste a CFI target"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      void copyText((locationDraft.trim() || location.cfi || "").trim())
                    }
                    disabled={!locationDraft.trim() && !location.cfi}
                  >
                    <CopyIcon className="size-4" />
                    Copy
                  </Button>
                  <Button
                    onClick={() => void goToLocationTarget(locationDraft)}
                    disabled={!locationDraft.trim()}
                  >
                    Go
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  value=""
                  onValueChange={(value) => {
                    if (value) {
                      void goToLocationTarget(value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Jump to chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    {flattenedToc.map((item) => (
                      <SelectItem key={item.href} value={item.href}>
                        {`${"".padStart(item.depth * 2, " ")}${item.label}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value=""
                  onValueChange={(value) => {
                    if (value) {
                      void goToLocationTarget(value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Jump to page" />
                  </SelectTrigger>
                  <SelectContent>
                    {(snapshot?.pageList ?? []).map((item) => (
                      <SelectItem key={item.href} value={item.href}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-weaker">
                    Landmarks
                  </div>
                  <div className="text-xs text-text-weak">
                    {readerLandmarks.length > 0
                      ? `${readerLandmarks.length} available`
                      : "Not exposed by this book"}
                  </div>
                </div>
                <ScrollArea className="max-h-64 rounded-xl border border-border-base/70 bg-surface-weak/15">
                  {readerLandmarks.length > 0 ? (
                    <div className="space-y-1 p-2">
                      {readerLandmarks.map((landmark) => (
                        <button
                          key={`${landmark.href}:${landmark.label}`}
                          type="button"
                          onClick={() => void goToLocationTarget(landmark.href)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-surface-raised-base/65"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-strong">
                              {landmark.label}
                            </div>
                            <div className="truncate text-xs text-text-weak">
                              {landmark.typeLabel ?? landmark.href}
                            </div>
                          </div>
                          <ChevronRightIcon className="size-4 shrink-0 text-text-weaker" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-sm text-text-weak">
                      This publication does not expose landmarks.
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLocationDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reader shortcuts</DialogTitle>
              <DialogDescription>
                Foliate-style reader shortcuts wired into Buddy&apos;s React shell.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border-base/70 bg-surface-weak/30 px-3 py-2"
                >
                  <div className="text-sm text-text-strong">{shortcut.label}</div>
                  <Badge variant="outline">{shortcut.keys}</Badge>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </section>
    )
  },
)

FoliateReader.displayName = "FoliateReader"
