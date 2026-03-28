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
export const THEME_CACHE_VERSION = "4"
export const DEFAULT_THEME_ID = "dracula"

export function normalizeThemeID(id: string | null | undefined): string | null {
  if (id === "oc-1") return DEFAULT_THEME_ID
  if (!id) return null
  return id
}
