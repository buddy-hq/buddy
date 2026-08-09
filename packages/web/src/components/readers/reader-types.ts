import type { ReactNode } from "react"
import type {
  ReaderPositionAnchor,
  ReaderRelocation,
  ReaderTextAnchor,
} from "@buddy/reader-contract"

export type {
  CfiPositionAnchor,
  CfiTextAnchor,
  PdfPoint,
  PdfPositionAnchor,
  PdfQuad,
  PdfTextAnchor,
  PdfTextQuote,
  PdfTextSegment,
  ReaderPositionAnchor,
  ReaderRelocation,
  ReaderTextAnchor,
} from "@buddy/reader-contract"

export const READER_FORMAT_PDF = "pdf" as const
export const READER_ENGINE_FOLIATE = "foliate" as const
export const READER_ENGINE_PDF = "pdf" as const

export type ReaderFormat = "epub" | "pdf" | "mobi" | "azw" | "fb2" | "cbz"

export type ReaderEngineKind = typeof READER_ENGINE_FOLIATE | typeof READER_ENGINE_PDF

export type ReaderEngineCapabilities = {
  textFlow: boolean
  pageLayouts: boolean
  search: boolean
  outline: boolean
  pageLabels: boolean
  textSelection: boolean
  annotations: boolean
}

export type ReaderSource =
  | {
      kind: "file"
      file: File
      sourceId: string
      format?: ReaderFormat
      contentFingerprint?: string
    }
  | {
      kind: "blob"
      blob: Blob
      name: string
      sourceId: string
      format?: ReaderFormat
      contentFingerprint?: string
    }
  | {
      kind: "url"
      url: string
      sourceId: string
      name?: string
      format?: ReaderFormat
      contentFingerprint?: string
    }

export type ReaderSelection = {
  text: string
  anchor: ReaderTextAnchor
  selectionKey: string
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type ReaderAnnotationStyle = "highlight" | "underline" | "squiggly" | "strikethrough"

export type ReaderAnnotationColorId = "amber" | "mint" | "sky" | "rose"

export type ReaderAnnotation = {
  id: string
  anchor: ReaderTextAnchor
  text: string
  note: string
  style: ReaderAnnotationStyle
  color: ReaderAnnotationColorId
  created: string
  modified: string
}

export type ReaderBookmark = {
  id: string
  anchor: ReaderPositionAnchor
  label: string
  created: string
}

export type ReaderNavigationItem = {
  id: string
  label: string
  description?: string
  subitems: ReaderNavigationItem[]
}

export type ReaderMetadataRow = {
  key: string
  label: string
  value: string
}

export type ReaderSnapshot = {
  engine: ReaderEngineKind
  capabilities: ReaderEngineCapabilities
  title: string
  author: string
  formatLabel: string
  isFixedLayout: boolean
  toc: ReaderNavigationItem[]
  pageList: ReaderNavigationItem[]
  landmarks: ReaderNavigationItem[]
  metadata: ReaderMetadataRow[]
  pageCount?: number
  coverUrl?: string
  fileName?: string
}

export type ReaderSearchExcerpt = {
  pre: string
  match: string
  post: string
}

export type ReaderSearchResult = {
  id: string
  label?: string
  anchor: ReaderTextAnchor
  excerpt: ReaderSearchExcerpt
}

export const READER_SEARCH_SCOPE_DOCUMENT = "document" as const
export const READER_SEARCH_SCOPE_SECTION = "section" as const

export type ReaderSearchScope =
  | typeof READER_SEARCH_SCOPE_DOCUMENT
  | typeof READER_SEARCH_SCOPE_SECTION

export type ReaderSearchRow =
  | {
      id: string
      kind: "section"
      label: string
    }
  | {
      id: string
      kind: "result"
      result: ReaderSearchResult
    }

export type ReaderSearchViewModel = {
  query: string
  scope: ReaderSearchScope
  matchCase: boolean
  matchWholeWords: boolean
  matchDiacritics: boolean
  running: boolean
  progress: number | null
  rows: ReaderSearchRow[]
  activeResultId?: string
}

export type ReaderAnnotationViewModel = ReaderAnnotation & {
  locationLabel?: string
}

export type ReaderSelectionToolbarViewModel = {
  text: string
  x: number
  y: number
}

export type ReaderAnnotationPopoverViewModel = {
  annotationId: string
  x: number
  y: number
}

export type ReaderAnnotationEditorViewModel = {
  mode: "create" | "edit"
  text: string
  note: string
  style: ReaderAnnotationStyle
  color: ReaderAnnotationColorId
}

export type ReaderThemeOption = {
  id: ReaderThemeId
  label: string
  contentBackground: string
  contentForeground: string
}

export type ReaderCommonPreferences = {
  themeId: ReaderThemeId
  reduceMotion: boolean
  autohideCursor: boolean
}

export type ReaderShortcut = {
  keys: string
  label: string
}

export type ReaderThemeId = "paper" | "sepia" | "night" | "mist" | "graphite"

export type PdfReaderLayout = "continuous" | "single-page" | "two-up"
export type PdfReaderScaleMode = "fit-width" | "fit-page" | "custom"
export type PdfReaderRotation = 0 | 90 | 180 | 270

export type PdfReaderMode = {
  layout: PdfReaderLayout
  scaleMode: PdfReaderScaleMode
  scale?: number
  rotation: PdfReaderRotation
}

export type DocumentReaderHandle = {
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (target: ReaderPositionAnchor) => Promise<void>
  setTheme: (theme: ReaderThemeId) => void
  getSnapshot: () => ReaderSnapshot | null
}

export type DocumentReaderProps = {
  source: ReaderSource | null
  className?: string
  persistenceSuffix?: string
  initialLocation?: ReaderPositionAnchor
  defaultTheme?: ReaderThemeId
  showToolbar?: boolean
  emptyState?: ReactNode
  onReady?: (snapshot: ReaderSnapshot) => void
  onLocationChange?: (location: ReaderRelocation) => void
  onChatSelection?: (selection: ReaderSelection) => void
  onChatSelectionRemoved?: (selectionKey: string) => void
  onOpenExternalLink?: (href: string) => void
  onOpeningInteractionChange?: (pending: boolean) => void
  onError?: (error: Error) => void
  onAnnotationsChange?: (annotations: ReaderAnnotation[]) => void
}

function hasPdfExtension(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0] ?? value
  return path.toLowerCase().endsWith(".pdf")
}

export function isPdfReaderSource(source: ReaderSource | null): boolean {
  if (!source) return false
  if (source.format) return source.format === READER_FORMAT_PDF
  if (source.kind === "file") {
    return source.file.type === "application/pdf" || hasPdfExtension(source.file.name)
  }
  if (source.kind === "blob") {
    return source.blob.type === "application/pdf" || hasPdfExtension(source.name)
  }
  return Boolean(source.name && hasPdfExtension(source.name)) || hasPdfExtension(source.url)
}
