import type { ColorScheme } from "./types"

export const STORAGE_KEYS = {
  LEGACY_THEME_ID: "opencode-theme-id",
  LIGHT_THEME_ID: "opencode-theme-id-light",
  DARK_THEME_ID: "opencode-theme-id-dark",
  COLOR_SCHEME: "opencode-color-scheme",
  CACHE_VERSION: "opencode-theme-cache-version",
  THEME_CSS_LIGHT: "opencode-theme-css-light",
  THEME_CSS_DARK: "opencode-theme-css-dark",
} as const

export const THEME_STYLE_ID = "oc-theme"
export const PRELOAD_STYLE_ID = "oc-theme-preload"
// Bump when the CSS generation format changes to force client cache invalidation.
export const THEME_CACHE_VERSION = "6"
export const DEFAULT_DARK_THEME_ID = "dracula"
export const DEFAULT_LIGHT_THEME_ID = "github"
export const DEFAULT_COLOR_SCHEME: ColorScheme = "dark"
