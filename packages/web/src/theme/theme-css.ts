import { themeToCss } from "./resolve"
import { themeTokens } from "./theme-catalog"
import { STORAGE_KEYS, THEME_CACHE_VERSION } from "./storage"
import type { ThemeMode, ThemeSlots } from "./types"

const THEME_CSS_STORAGE_KEYS = {
  light: STORAGE_KEYS.THEME_CSS_LIGHT,
  dark: STORAGE_KEYS.THEME_CSS_DARK,
} satisfies Record<ThemeMode, string>

export function textMixBlendMode(mode: ThemeMode): "plus-lighter" | "multiply" {
  return mode === "dark" ? "plus-lighter" : "multiply"
}

export function rootThemeCss(mode: ThemeMode, css: string): string {
  return `:root{color-scheme:${mode};--text-mix-blend-mode:${textMixBlendMode(mode)};${css}}`
}

export function readCachedThemeCss(storage: Storage, mode: ThemeMode): string | null {
  return storage.getItem(THEME_CSS_STORAGE_KEYS[mode])
}

export function clearCachedThemeCss(storage: Storage): void {
  storage.removeItem(STORAGE_KEYS.THEME_CSS_LIGHT)
  storage.removeItem(STORAGE_KEYS.THEME_CSS_DARK)
}

export function dropOutdatedThemeCssCache(storage: Storage): void {
  if (storage.getItem(STORAGE_KEYS.CACHE_VERSION) === THEME_CACHE_VERSION) return
  clearCachedThemeCss(storage)
  storage.setItem(STORAGE_KEYS.CACHE_VERSION, THEME_CACHE_VERSION)
}

export function writeCachedThemeCss(storage: Storage, mode: ThemeMode, css: string): void {
  try {
    storage.setItem(STORAGE_KEYS.CACHE_VERSION, THEME_CACHE_VERSION)
    storage.setItem(THEME_CSS_STORAGE_KEYS[mode], css)
  } catch {}
}

export function cacheThemeCss(storage: Storage, themeId: string, mode: ThemeMode): void {
  const tokens = themeTokens(themeId, mode)
  if (tokens) writeCachedThemeCss(storage, mode, themeToCss(tokens))
}

export function cacheThemeSlotsCss(storage: Storage, slots: ThemeSlots): void {
  cacheThemeCss(storage, slots.light, "light")
  cacheThemeCss(storage, slots.dark, "dark")
}

export function applyDocumentThemeState(
  document: Document,
  themeId: string,
  mode: ThemeMode,
): void {
  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.classList.toggle("dark", mode === "dark")
  document.documentElement.style.colorScheme = mode
}
