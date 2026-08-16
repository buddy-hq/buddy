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
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  FONT_PUBLISHER,
  FONT_SANS,
  FONT_SERIF,
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
} from "./foliate-reader-types"

// ============================================================
// Default Messages
// ============================================================

export const DEFAULT_TITLE = "Untitled publication"
export const DEFAULT_AUTHOR = "Unknown author"

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

export const READER_SELECTION_BACKGROUND = "var(--surface-warning-base)"
export const READER_SELECTION_FOREGROUND = "var(--text-on-warning-base)"

export const READER_THEMES: FoliateReaderThemeDefinition[] = [
  {
    id: "paper",
    label: "Paper",
    appearance: "light",
    viewportClassName: "bg-[#efe7db]",
    contentBackground: "#fffdf7",
    contentForeground: "#1f1b16",
    contentMuted: "#6a6054",
    contentLink: "#2f69b7",
    contentHeading: "#15110c",
    contentAccent: READER_SELECTION_BACKGROUND,
    pdfFilter: "none",
  },
  {
    id: "sepia",
    label: "Sepia",
    appearance: "light",
    viewportClassName: "bg-[#e1d3b9]",
    contentBackground: "#f5ecd9",
    contentForeground: "#3b2d1f",
    contentMuted: "#755742",
    contentLink: "#8a4f24",
    contentHeading: "#2c1c12",
    contentAccent: READER_SELECTION_BACKGROUND,
    pdfFilter: "sepia(0.22) saturate(0.92) brightness(0.98)",
  },
  {
    id: "night",
    label: "Night",
    appearance: "dark",
    viewportClassName: "bg-[#111722]",
    contentBackground: "#0f141d",
    contentForeground: "#e6edf6",
    contentMuted: "#9aa8bb",
    contentLink: "#8fbbff",
    contentHeading: "#f5f8fc",
    contentAccent: READER_SELECTION_BACKGROUND,
    pdfFilter: "invert(1) hue-rotate(180deg) brightness(0.88) contrast(1.04)",
  },
  {
    id: "mist",
    label: "Mist",
    appearance: "light",
    viewportClassName: "bg-[#cad8e0]",
    contentBackground: "#edf4f8",
    contentForeground: "#203646",
    contentMuted: "#5b7382",
    contentLink: "#1d5d84",
    contentHeading: "#102432",
    contentAccent: READER_SELECTION_BACKGROUND,
    pdfFilter: "brightness(0.99) saturate(0.96)",
  },
  {
    id: "graphite",
    label: "Graphite",
    appearance: "dark",
    viewportClassName: "bg-[#1b2025]",
    contentBackground: "#1c2025",
    contentForeground: "#f4f2ee",
    contentMuted: "#a3acb4",
    contentLink: "#89c0f2",
    contentHeading: "#ffffff",
    contentAccent: READER_SELECTION_BACKGROUND,
    pdfFilter: "invert(1) hue-rotate(180deg) brightness(0.9)",
  },
]

export function resolveReaderContentFilter(input: {
  isFixedLayout: boolean
  filter: string
}): string {
  return input.isFixedLayout ? input.filter : "none"
}

// ============================================================
// Annotation Colors
// ============================================================

export const ANNOTATION_COLORS = {
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
} satisfies Record<ReaderAnnotationColorId, ReaderAnnotationColor>

export const ANNOTATION_COLOR_IDS: ReaderAnnotationColorId[] = ["amber", "mint", "sky", "rose"]

export const DEFAULT_ANNOTATION_COLOR_ID: ReaderAnnotationColorId = "amber"

export const ANNOTATION_COLOR_TOKENS = {
  amber: "--surface-warning-base",
  mint: "--surface-success-base",
  sky: "--surface-info-base",
  rose: "--surface-critical-base",
} satisfies Record<ReaderAnnotationColorId, string>

export const ANNOTATION_STYLE_LABELS = {
  highlight: "Highlight",
  underline: "Underline",
  squiggly: "Squiggly",
  strikethrough: "Strike",
} satisfies Record<FoliateReaderAnnotationStyle, string>

// ============================================================
// Shortcuts
// ============================================================

export const SHORTCUTS: ReaderShortcut[] = [
  { keys: "Ctrl/Cmd + F", label: "Open search" },
  { keys: "Ctrl/Cmd + L", label: "Open location and landmarks" },
  { keys: "Ctrl/Cmd + D", label: "Toggle bookmark at current location" },
  { keys: "Ctrl/Cmd + .", label: "Toggle Focus" },
  { keys: "Left / Right", label: "Turn pages in paginated and fixed-layout views" },
  { keys: "Up / Down", label: "Move through the current section in section scroll" },
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
