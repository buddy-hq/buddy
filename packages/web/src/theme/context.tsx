import { useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
import type { ColorScheme, DesktopTheme, ThemeMode, ThemeSlots } from "./types"
import { ThemeContext, type ThemeContextValue } from "./context-value"
import { SYSTEM_DARK_MEDIA_QUERY, colorSchemeMode, readColorScheme } from "./color-scheme"
import { defaultThemes } from "./default-themes"
import { themeToCss } from "./resolve"
import { PRELOAD_STYLE_ID, STORAGE_KEYS, THEME_STYLE_ID } from "./storage"
import { isSelectableTheme, themeTokens } from "./theme-catalog"
import {
  applyDocumentThemeState,
  cacheThemeCss,
  cacheThemeSlotsCss,
  dropOutdatedThemeCssCache,
  rootThemeCss,
  writeCachedThemeCss,
} from "./theme-css"
import { THEME_SLOT_STORAGE_KEYS, migrateThemeSlots, readThemeSlots } from "./theme-slots"

const THEME_ID_STORAGE_KEYS: ReadonlySet<string> = new Set([
  STORAGE_KEYS.LEGACY_THEME_ID,
  STORAGE_KEYS.LIGHT_THEME_ID,
  STORAGE_KEYS.DARK_THEME_ID,
])

function ensureThemeStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(THEME_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing
  const element = document.createElement("style")
  element.id = THEME_STYLE_ID
  document.head.appendChild(element)
  return element
}

function systemPrefersDark(): boolean {
  return window.matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches
}

function applyThemeCss(themeId: string, mode: ThemeMode): string | undefined {
  const tokens = themeTokens(themeId, mode)
  if (!tokens) return undefined

  const css = themeToCss(tokens)
  writeCachedThemeCss(localStorage, mode, css)
  document.getElementById(PRELOAD_STYLE_ID)?.remove()
  ensureThemeStyleElement().textContent = rootThemeCss(mode, css)
  applyDocumentThemeState(document, themeId, mode)
  return tokens["background-base"]
}

export type ThemeAppliedDetails = {
  theme: DesktopTheme
  mode: ThemeMode
  backgroundColor: string
}

export type ThemeProviderProps = {
  children: ReactNode
  onThemeApplied?: (details: ThemeAppliedDetails) => void
}

export function ThemeProvider({ children, onThemeApplied }: ThemeProviderProps) {
  const [slots, setSlots] = useState<ThemeSlots>(() => readThemeSlots(localStorage))
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() =>
    readColorScheme(localStorage),
  )
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  const mode = colorSchemeMode(colorScheme, systemDark)
  const themeId = slots[mode]

  useEffect(() => {
    dropOutdatedThemeCssCache(localStorage)
    cacheThemeSlotsCss(localStorage, migrateThemeSlots(localStorage))
  }, [])

  useEffect(() => {
    const theme = defaultThemes[themeId]
    if (!theme) return
    const backgroundColor = applyThemeCss(themeId, mode)
    if (backgroundColor) onThemeApplied?.({ theme, mode, backgroundColor })
  }, [themeId, mode, onThemeApplied])

  useEffect(() => {
    const mediaQuery = window.matchMedia(SYSTEM_DARK_MEDIA_QUERY)
    const handler = () => setSystemDark(mediaQuery.matches)
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === null || THEME_ID_STORAGE_KEYS.has(event.key)) {
        setSlots(readThemeSlots(localStorage))
      }
      if (event.key === null || event.key === STORAGE_KEYS.COLOR_SCHEME) {
        setColorSchemeState(readColorScheme(localStorage))
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  const setThemeForMode = useCallback((slotMode: ThemeMode, id: string) => {
    if (!isSelectableTheme(id, slotMode)) {
      console.warn(`Theme "${id}" is not available for ${slotMode}`)
      return
    }
    setSlots((current) => ({ ...current, [slotMode]: id }))
    localStorage.setItem(THEME_SLOT_STORAGE_KEYS[slotMode], id)
    cacheThemeCss(localStorage, id, slotMode)
  }, [])

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme)
    localStorage.setItem(STORAGE_KEYS.COLOR_SCHEME, scheme)
  }, [])

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      lightThemeId: slots.light,
      darkThemeId: slots.dark,
      colorScheme,
      mode,
      themes: defaultThemes,
      setThemeForMode,
      setColorScheme,
    }),
    [colorScheme, mode, setColorScheme, setThemeForMode, slots, themeId],
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
