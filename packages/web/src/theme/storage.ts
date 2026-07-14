export const STORAGE_KEYS = {
  THEME_ID: "opencode-theme-id",
  COLOR_SCHEME: "opencode-color-scheme",
  CACHE_VERSION: "opencode-theme-cache-version",
  THEME_CSS_LIGHT: "opencode-theme-css-light",
  THEME_CSS_DARK: "opencode-theme-css-dark",
} as const

export const THEME_STYLE_ID = "oc-theme"
export const PRELOAD_STYLE_ID = "oc-theme-preload"
// Bump when the CSS generation format changes to force client cache invalidation.
export const THEME_CACHE_VERSION = "5"
export const DEFAULT_THEME_ID = "dracula"

/** Legacy or brand-hidden theme ids remapped to the product default. */
const RETIRED_THEME_IDS = new Set(["oc-1", "oc-2", "opencode"])

export function normalizeThemeID(id: string | null | undefined): string | null {
  if (!id) return null
  if (RETIRED_THEME_IDS.has(id)) return DEFAULT_THEME_ID
  return id
}
