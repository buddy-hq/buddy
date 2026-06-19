export const mermaidConstants = {
  timeouts: {
    FEEDBACK_RESET: 2000,
    REVOKE_URL: 0,
  },
  svg: {
    DEFAULT_WIDTH: 1200,
    DEFAULT_HEIGHT: 800,
    OBJECT_ID_SLICE: 8,
  },
  zoom: {
    MIN: 0.05,
    MAX: 50.0,
    STEP: 0.1,
    DEFAULT: 1.0,
    MAX_AUTO_FIT: 10.0,
    WIDE_DIAGRAM_ASPECT_RATIO: 2.5,
  },
  viewport: {
    BREAKPOINT_MD: 768,
    INLINE_CANVAS_PADDING: 24,
    INLINE_PAN_OVERSCAN: 160,
    INLINE_AUTO_MIN_RENDERED_HEIGHT: 240,
    INLINE_AUTO_MAX_VIEWPORT_WIDTHS: 5,
    FULLSCREEN_CANVAS_PADDING: 80,
    FULLSCREEN_PAN_OVERSCAN: 240,
    FULLSCREEN_AUTO_MIN_RENDERED_HEIGHT: 320,
    FULLSCREEN_AUTO_MAX_VIEWPORT_WIDTHS: 6,
    FULLSCREEN_PADDING_MD_X: 64,
    FULLSCREEN_PADDING_SM_X: 40,
    FULLSCREEN_PADDING_MD_TOP: 128,
    FULLSCREEN_PADDING_SM_TOP: 112,
    FULLSCREEN_PADDING_BOTTOM: 24,
  },
  animation: {
    Y_OFFSET: 8,
    SCALE_START: 0.995,
  },
  patterns: {
    VOID_HTML_TAG:
      /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s[^>]*?)?\s*\/?>/giu,
  },
} as const
