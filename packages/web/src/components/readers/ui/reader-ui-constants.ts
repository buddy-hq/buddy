import type { ReaderAnnotationColorId, ReaderAnnotationStyle } from "../reader-types"

export type ReaderAnnotationColorOption = {
  id: ReaderAnnotationColorId
  label: string
  previewClassName: string
  washClassName: string
}

export const READER_ANNOTATION_COLOR_OPTIONS: ReaderAnnotationColorOption[] = [
  {
    id: "amber",
    label: "Amber",
    previewClassName: "bg-surface-warning-base",
    washClassName: "bg-surface-warning-base/35",
  },
  {
    id: "mint",
    label: "Mint",
    previewClassName: "bg-surface-success-base",
    washClassName: "bg-surface-success-base/35",
  },
  {
    id: "sky",
    label: "Sky",
    previewClassName: "bg-surface-info-base",
    washClassName: "bg-surface-info-base/35",
  },
  {
    id: "rose",
    label: "Rose",
    previewClassName: "bg-surface-critical-base",
    washClassName: "bg-surface-critical-base/30",
  },
]

export const READER_ANNOTATION_STYLE_LABELS = {
  highlight: "Highlight",
  underline: "Underline",
  squiggly: "Squiggly",
  strikethrough: "Strike",
} satisfies Record<ReaderAnnotationStyle, string>

export const READER_EMPTY_TOC_MESSAGE = "This publication does not expose a table of contents."
export const READER_EMPTY_SEARCH_MESSAGE = "Search inside the current document."
export const READER_EMPTY_BOOKMARKS_MESSAGE = "Bookmarks you add here persist per document."
export const READER_EMPTY_ANNOTATIONS_MESSAGE = "Highlights and notes appear here."
export const READER_EMPTY_METADATA_MESSAGE = "Metadata is limited for this publication."
export const READER_VIRTUALIZE_ROW_THRESHOLD = 24

export function isReaderAnnotationColorId(value: string): value is ReaderAnnotationColorId {
  return READER_ANNOTATION_COLOR_OPTIONS.some((option) => option.id === value)
}

export function isReaderAnnotationStyle(value: string): value is ReaderAnnotationStyle {
  return value in READER_ANNOTATION_STYLE_LABELS
}
