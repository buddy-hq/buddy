import type {
  FoliateAnnotationPayload,
  FoliateBook,
  FoliateMetadata,
  FoliateNavigationTarget,
  FoliateTocItem,
} from "foliate-js/view.js"

export type { FoliateNavigationTarget }

// ============================================================
// Flow Types
// ============================================================

export const FLOW_PAGINATED = "paginated" as const
export const FLOW_SCROLLED = "scrolled" as const

export type FoliateReaderFlow = typeof FLOW_PAGINATED | typeof FLOW_SCROLLED

// ============================================================
// Sidebar Tab Types
// ============================================================

export const SIDEBAR_CONTENTS = "contents" as const
export const SIDEBAR_SEARCH = "search" as const
export const SIDEBAR_BOOKMARKS = "bookmarks" as const
export const SIDEBAR_ANNOTATIONS = "annotations" as const
export const SIDEBAR_DETAILS = "details" as const
export const SIDEBAR_PREFERENCES = "preferences" as const

export type FoliateReaderSidebarTab =
  | typeof SIDEBAR_CONTENTS
  | typeof SIDEBAR_SEARCH
  | typeof SIDEBAR_BOOKMARKS
  | typeof SIDEBAR_ANNOTATIONS
  | typeof SIDEBAR_DETAILS
  | typeof SIDEBAR_PREFERENCES

// ============================================================
// Search Scope Types
// ============================================================

export const SEARCH_SCOPE_BOOK = "book" as const
export const SEARCH_SCOPE_SECTION = "section" as const

export type FoliateReaderSearchScope = typeof SEARCH_SCOPE_BOOK | typeof SEARCH_SCOPE_SECTION

// ============================================================
// Font Preset Types
// ============================================================

export const FONT_PUBLISHER = "publisher" as const
export const FONT_SERIF = "serif" as const
export const FONT_SANS = "sans" as const

export type FoliateReaderFontPreset = typeof FONT_PUBLISHER | typeof FONT_SERIF | typeof FONT_SANS

// ============================================================
// Annotation Style Types
// ============================================================

export const ANNOTATION_STYLE_HIGHLIGHT = "highlight" as const
export const ANNOTATION_STYLE_UNDERLINE = "underline" as const
export const ANNOTATION_STYLE_SQUIGGLY = "squiggly" as const
export const ANNOTATION_STYLE_STRIKETHROUGH = "strikethrough" as const

export type FoliateReaderAnnotationStyle =
  | typeof ANNOTATION_STYLE_HIGHLIGHT
  | typeof ANNOTATION_STYLE_UNDERLINE
  | typeof ANNOTATION_STYLE_SQUIGGLY
  | typeof ANNOTATION_STYLE_STRIKETHROUGH

// ============================================================
// Theme Types
// ============================================================

export type FoliateReaderThemeId = "paper" | "sepia" | "night" | "mist" | "graphite"

export interface FoliateReaderThemeDefinition {
  id: FoliateReaderThemeId
  label: string
  appearance: "light" | "dark"
  shellClassName: string
  viewportClassName: string
  contentBackground: string
  contentForeground: string
  contentMuted: string
  contentLink: string
  contentHeading: string
  contentAccent: string
  pdfFilter: string
}

// ============================================================
// Source Types
// ============================================================

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

// ============================================================
// Snapshot Types
// ============================================================

export interface FoliateReaderLandmark {
  href: string
  label: string
  typeLabel?: string
}

export interface FoliateReaderSnapshot {
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

// ============================================================
// Location Types
// ============================================================

export interface FoliateReaderLocation {
  fraction?: number
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
  currentPassageText?: string
}

export type ReadingTrailEntry = {
  tocLabel: string
  cfi?: string
  fraction?: number
}

export type FoliateReaderSelection = {
  text: string
  cfi: string
  index: number
  selectionKey?: string
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

// ============================================================
// Handle Types
// ============================================================

export interface FoliateReaderHandle {
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (target: FoliateNavigationTarget) => Promise<void>
  setTheme: (theme: FoliateReaderThemeId) => void
  setFlow: (flow: FoliateReaderFlow) => void
  getSnapshot: () => FoliateReaderSnapshot | null
}

// ============================================================
// Props Types
// ============================================================

import type { ReactNode } from "react"

export interface FoliateReaderProps {
  source: FoliateReaderSource | null
  className?: string
  initialLocation?: FoliateNavigationTarget
  defaultTheme?: FoliateReaderThemeId
  defaultFlow?: FoliateReaderFlow
  showToolbar?: boolean
  emptyState?: ReactNode
  onReady?: (snapshot: FoliateReaderSnapshot) => void
  onLocationChange?: (location: FoliateReaderLocation) => void
  onChatSelection?: (selection: FoliateReaderSelection) => void
  onChatSelectionRemoved?: (selectionKey: string) => void
  onOpenExternalLink?: (href: string) => void
  onError?: (error: Error) => void
  onAnnotationsChange?: (annotations: ReaderAnnotation[]) => void
  persistenceSuffix?: string
}

// ============================================================
// Preferences Types
// ============================================================

export interface FoliateReaderPreferences {
  themeId: FoliateReaderThemeId
  flow: FoliateReaderFlow
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

// ============================================================
// Metadata Types
// ============================================================

export type KnownMetadataFieldKey =
  | "publisher"
  | "language"
  | "subject"
  | "identifier"
  | "source"
  | "rights"
  | "description"

export interface MetadataFieldDefinition {
  key: KnownMetadataFieldKey
  label: string
}

export interface MetadataRow {
  key: string
  label: string
  value: string
}

// ============================================================
// Bookmark Types
// ============================================================

export interface ReaderBookmark {
  value: string
  label: string
  created: string
}

// ============================================================
// Annotation Types
// ============================================================

export type ReaderAnnotationColorId = "amber" | "mint" | "sky" | "rose"

export interface ReaderAnnotation extends FoliateAnnotationPayload {
  label?: string
  index?: number
}

export interface ReaderAnnotationColor {
  label: string
  value: string
  previewClassName: string
}

// ============================================================
// Search Types
// ============================================================

import type { FoliateSearchExcerpt } from "foliate-js/view.js"

export interface ReaderSearchState {
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

export type ReaderSearchRow =
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

// ============================================================
// Selection Types
// ============================================================

export interface ReaderSelectionAction {
  index: number
  range: Range
  cfi: string
  text: string
  selectionKey: string
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
  x: number
  y: number
}

export interface ReaderSelectionToolbarState {
  text: string
  cfi: string
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
  x: number
  y: number
}

// ============================================================
// Annotation UI State Types
// ============================================================

export interface ReaderAnnotationPopoverState {
  value: string
  x: number
  y: number
}

export interface ReaderAnnotationDialogState {
  mode: "create" | "edit"
  value: string
  text: string
  note: string
  style: FoliateReaderAnnotationStyle
  color: ReaderAnnotationColorId
}

// ============================================================
// Shortcut Types
// ============================================================

export interface ReaderShortcut {
  keys: string
  label: string
}

// ============================================================
// Book State Types
// ============================================================

export interface ReaderBookState {
  lastLocation?: string
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
}

// ============================================================
// Event Detail Types (from foliate-js)
// ============================================================

export type FoliateRelocationDetail = import("foliate-js/view.js").FoliateRelocationDetail
export type FoliateDrawAnnotationEventDetail =
  import("foliate-js/view.js").FoliateDrawAnnotationEventDetail
export type FoliateSearchResult = import("foliate-js/view.js").FoliateSearchResult
