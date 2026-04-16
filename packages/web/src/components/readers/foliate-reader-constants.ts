import type {
  FoliateReaderAnnotationStyle,
  FoliateReaderThemeDefinition,
  MetadataFieldDefinition,
  ReaderAnnotationColor,
  ReaderAnnotationColorId,
  ReaderShortcut,
} from "./foliate-reader-types"
export {
  ANNOTATION_STYLE_HIGHLIGHT,
  ANNOTATION_STYLE_SQUIGGLY,
  ANNOTATION_STYLE_STRIKETHROUGH,
  ANNOTATION_STYLE_UNDERLINE,
  APPEARANCE_DARK,
  APPEARANCE_LIGHT,
  APPEARANCE_SYSTEM,
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  FONT_PUBLISHER,
  FONT_SANS,
  FONT_SERIF,
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
  SIDEBAR_ANNOTATIONS,
  SIDEBAR_BOOKMARKS,
  SIDEBAR_CONTENTS,
  SIDEBAR_DETAILS,
  SIDEBAR_PREFERENCES,
  SIDEBAR_SEARCH,
} from "./foliate-reader-types"

// ============================================================
// Default Messages
// ============================================================

export const DEFAULT_TITLE = "Untitled publication"
export const DEFAULT_AUTHOR = "Unknown author"
export const DEFAULT_EMPTY_MESSAGE = "Select a compatible ebook or PDF to preview it here."
export const DEFAULT_ERROR_TITLE = "Unable to open publication"
export const DEFAULT_ERROR_MESSAGE =
  "Buddy could not initialize the foliate renderer for this source."
export const TOC_EMPTY_MESSAGE = "This publication does not expose a table of contents."
export const DETAILS_EMPTY_MESSAGE = "Metadata is limited for this publication."
export const SEARCH_EMPTY_MESSAGE = "Search inside the current book or chapter."
export const BOOKMARKS_EMPTY_MESSAGE = "Bookmarks you add here persist per book."
export const ANNOTATIONS_EMPTY_MESSAGE = "Highlights and notes appear here."

// ============================================================
// Storage Keys
// ============================================================

export const GLOBAL_PREFERENCES_STORAGE_KEY = "buddy:foliate-reader:preferences:v1"
export const BOOK_STATE_STORAGE_KEY_PREFIX = "buddy:foliate-reader:book:v1:"

// ============================================================
// Dependency Keys
// ============================================================

export const DEPENDENCY_KEY_EMPTY = "none"
export const DEPENDENCY_KEY_SEPARATOR = "::"
export const DEPENDENCY_KEY_KIND_REFERENCE = "reference"
export const DEPENDENCY_REFERENCE_ID_START = 1

// ============================================================
// Search Keys
// ============================================================

export const SEARCH_RESULT_KEY_PREFIX = "search-result:"
export const SEARCH_SECTION_KEY_PREFIX = "search-section:"

// ============================================================
// UI Constants
// ============================================================

export const VIRTUALIZE_ROW_THRESHOLD = 24
export const DEFAULT_PROGRESS_STEPS = 1000

// ============================================================
// Default Values
// ============================================================

export const DEFAULT_FONT_SCALE_REM = 1.04
export const DEFAULT_LINE_HEIGHT = 1.62
export const DEFAULT_MARGIN_PX = 56
export const DEFAULT_GAP_PERCENT = 8
export const DEFAULT_MAX_INLINE_SIZE_PX = 780
export const DEFAULT_MAX_BLOCK_SIZE_PX = 1600

// ============================================================
// Class Names
// ============================================================

export const VIEW_ELEMENT_CLASS_NAME = "buddy-foliate-view"
export const VIEWPORT_CLASS_NAME = "buddy-foliate-viewport"
export const READER_SIDE_PANEL_WIDTH_CLASS = "grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]"
export const READER_SIDEBAR_DESKTOP_BREAKPOINT_PX = 1024
export const READER_SIDEBAR_BREAKPOINT_HYSTERESIS_PX = 32

// ============================================================
// Theme Definitions
// ============================================================

export const READER_THEMES: FoliateReaderThemeDefinition[] = [
  {
    id: "paper",
    label: "Paper",
    shellClassName: "bg-surface-raised-base",
    viewportClassName: "",
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
    shellClassName: "bg-[#f4ead2]",
    viewportClassName: "",
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
    shellClassName: "bg-surface-strong",
    viewportClassName: "",
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
    shellClassName: "bg-[#1f2428]",
    viewportClassName: "",
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
    shellClassName: "bg-[#121212]",
    viewportClassName: "",
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

// ============================================================
// Annotation Colors
// ============================================================

export const ANNOTATION_COLORS: Record<ReaderAnnotationColorId, ReaderAnnotationColor> = {
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

export const ANNOTATION_COLOR_IDS: ReaderAnnotationColorId[] = ["amber", "mint", "sky", "rose"]

export const DEFAULT_ANNOTATION_COLOR_ID: ReaderAnnotationColorId = "sky"

export const ANNOTATION_COLOR_TOKENS: Record<ReaderAnnotationColorId, string> = {
  amber: "--surface-warning-base",
  mint: "--surface-success-base",
  sky: "--surface-info-base",
  rose: "--surface-critical-base",
}

export const ANNOTATION_STYLE_LABELS: Record<FoliateReaderAnnotationStyle, string> = {
  highlight: "Highlight",
  underline: "Underline",
  squiggly: "Squiggly",
  strikethrough: "Strike",
}

// ============================================================
// Shortcuts
// ============================================================

export const SHORTCUTS: ReaderShortcut[] = [
  { keys: "Ctrl/Cmd + F", label: "Open search" },
  { keys: "Ctrl/Cmd + L", label: "Open location and landmarks" },
  { keys: "Ctrl/Cmd + D", label: "Toggle bookmark at current location" },
  { keys: "Alt + Left", label: "History back" },
  { keys: "Alt + Right", label: "History forward" },
  { keys: "Ctrl/Cmd + ,", label: "Open reader preferences" },
  { keys: "?", label: "Open keyboard help" },
  { keys: "Esc", label: "Close active reader overlays" },
]

// ============================================================
// Metadata Fields
// ============================================================

export const METADATA_FIELDS: MetadataFieldDefinition[] = [
  { key: "publisher", label: "Publisher" },
  { key: "language", label: "Language" },
  { key: "subject", label: "Subjects" },
  { key: "identifier", label: "Identifier" },
  { key: "source", label: "Source" },
  { key: "rights", label: "Rights" },
  { key: "description", label: "Description" },
]
