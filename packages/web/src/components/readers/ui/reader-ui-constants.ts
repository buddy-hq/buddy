import type { ReaderAnnotationColorId, ReaderAnnotationStyle } from "../reader-types"
import { ANNOTATION_COLOR_IDS, ANNOTATION_COLORS } from "../foliate-reader-constants"

export type ReaderAnnotationColorOption = {
  id: ReaderAnnotationColorId
  label: string
  /** The exact ink the reader paints, so swatches match the page. */
  ink: string
}

export const READER_ANNOTATION_COLOR_OPTIONS: ReaderAnnotationColorOption[] =
  ANNOTATION_COLOR_IDS.map((id) => ({
    id,
    label: ANNOTATION_COLORS[id].label,
    ink: ANNOTATION_COLORS[id].value,
  }))

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
