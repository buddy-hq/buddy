export const mermaidConstants = {
  timeouts: {
    FEEDBACK_RESET: 2000,
    REVOKE_URL: 0,
  },
  svg: {
    DEFAULT_WIDTH: 1200,
    DEFAULT_HEIGHT: 800,
    ARTIFACT_ID_SLICE: 8,
  },
  zoom: {
    MIN: 0.5,
    MAX: 3.5,
    STEP: 0.2,
    DEFAULT: 1,
    MAX_AUTO_FIT: 2.25,
  },
  layout: {
    BREAKPOINT_LG: 1024,
    BREAKPOINT_MD: 768,
    PADDING_LG_H: 220,
    PADDING_MD_H: 160,
    PADDING_SM_H: 96,
    PADDING_LG_V: 190,
    PADDING_SM_V: 128,
  },
  animation: {
    Y_OFFSET: 8,
    SCALE_START: 0.995,
  },
  patterns: {
    VOID_HTML_TAG: /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s[^>]*?)?\s*\/?>/giu,
  },
} as const
