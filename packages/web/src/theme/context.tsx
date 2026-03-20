import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
import type { DesktopTheme, ColorScheme } from "./types"
import { resolveThemeVariant } from "./resolve"
import { defaultThemes } from "./default-themes"
import { toShadcnCss } from "./shadcn-mapper"

const STORAGE_KEYS = {
  THEME_ID: "opencode-theme-id",
  COLOR_SCHEME: "opencode-color-scheme",
  CACHE_VERSION: "opencode-theme-cache-version",
  THEME_CSS_LIGHT: "opencode-theme-css-light",
  THEME_CSS_DARK: "opencode-theme-css-dark",
} as const

const THEME_STYLE_ID = "oc-theme"
const PRELOAD_STYLE_ID = "oc-theme-preload"
const THEME_CACHE_VERSION = "3"

function normalize(id: string | null | undefined): string | null {
  if (id === "oc-1") return "oc-2"
  if (!id) return null
  return id
}

function isColorScheme(value: string | null): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

function clearCache() {
  localStorage.removeItem(STORAGE_KEYS.THEME_CSS_LIGHT)
  localStorage.removeItem(STORAGE_KEYS.THEME_CSS_DARK)
}

function applyDocumentState(themeId: string, mode: "light" | "dark") {
  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode
  document.documentElement.classList.toggle("dark", mode === "dark")
  document.documentElement.style.colorScheme = mode
}

function ensureThemeStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  if (existing) return existing
  const element = document.createElement("style")
  element.id = THEME_STYLE_ID
  document.head.appendChild(element)
  return element
}

function getSystemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyThemeCss(theme: DesktopTheme, themeId: string, mode: "light" | "dark") {
  const isDark = mode === "dark"
  const variant = isDark ? theme.dark : theme.light
  const tokens = resolveThemeVariant(variant, isDark)
  const shadcnCss = toShadcnCss(tokens, isDark)

  try {
    localStorage.setItem(STORAGE_KEYS.CACHE_VERSION, THEME_CACHE_VERSION)
    localStorage.setItem(isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT, shadcnCss)
  } catch {}

  const fullCss = `:root {
  color-scheme: ${mode};
  --text-mix-blend-mode: ${isDark ? "plus-lighter" : "multiply"};
  ${shadcnCss}
}`

  document.getElementById(PRELOAD_STYLE_ID)?.remove()
  ensureThemeStyleElement().textContent = fullCss
  applyDocumentState(themeId, mode)
}

function cacheThemeVariants(theme: DesktopTheme) {
  for (const mode of ["light", "dark"] as const) {
    const isDark = mode === "dark"
    const variant = isDark ? theme.dark : theme.light
    const tokens = resolveThemeVariant(variant, isDark)
    const shadcnCss = toShadcnCss(tokens, isDark)
    try {
      localStorage.setItem(STORAGE_KEYS.CACHE_VERSION, THEME_CACHE_VERSION)
      localStorage.setItem(isDark ? STORAGE_KEYS.THEME_CSS_DARK : STORAGE_KEYS.THEME_CSS_LIGHT, shadcnCss)
    } catch {}
  }
}

export interface ThemeContextValue {
  themeId: string
  colorScheme: ColorScheme
  mode: "light" | "dark"
  themes: Record<string, DesktopTheme>
  setTheme: (id: string) => void
  setColorScheme: (scheme: ColorScheme) => void
  previewTheme: (id: string) => void
  previewColorScheme: (scheme: ColorScheme) => void
  commitPreview: () => void
  cancelPreview: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: string
  onThemeApplied?: (theme: DesktopTheme, mode: "light" | "dark") => void
}

export function ThemeProvider({ children, defaultTheme = "oc-2", onThemeApplied }: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    const saved = normalize(localStorage.getItem(STORAGE_KEYS.THEME_ID))
    return saved && defaultThemes[saved] ? saved : (normalize(defaultTheme) ?? "oc-2")
  })

  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COLOR_SCHEME)
    return isColorScheme(saved) ? saved : "system"
  })

  const [mode, setMode] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.COLOR_SCHEME)
    if (saved === "light" || saved === "dark") return saved
    return getSystemMode()
  })

  const [previewState, setPreviewState] = useState<{
    themeId: string | null
    colorScheme: ColorScheme | null
  }>({ themeId: null, colorScheme: null })

  const currentThemeId = previewState.themeId ?? themeId
  const currentMode = useMemo(() => {
    if (previewState.colorScheme) {
      return previewState.colorScheme === "system" ? getSystemMode() : previewState.colorScheme
    }
    return mode
  }, [previewState.colorScheme, mode])

  const applyTheme = useCallback(
    (theme: DesktopTheme, id: string, m: "light" | "dark") => {
      applyThemeCss(theme, id, m)
      onThemeApplied?.(theme, m)
    },
    [onThemeApplied],
  )

  // Apply theme when themeId or mode changes
  useEffect(() => {
    const theme = defaultThemes[currentThemeId]
    if (theme) {
      applyTheme(theme, currentThemeId, currentMode)
    }
  }, [currentThemeId, currentMode, applyTheme])

  // Listen for system color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (colorScheme === "system") {
        setMode(getSystemMode())
      }
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [colorScheme])

  // Sync persisted changes across tabs.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.THEME_ID && e.newValue) {
        const normalized = normalize(e.newValue)
        if (normalized) setThemeIdState(normalized)
      }
      if (e.key === STORAGE_KEYS.COLOR_SCHEME && isColorScheme(e.newValue)) {
        setColorSchemeState(e.newValue)
        setMode(e.newValue === "system" ? getSystemMode() : e.newValue)
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME_ID)
    const normalizedThemeId = normalize(savedTheme)
    const nextThemeId = normalizedThemeId && defaultThemes[normalizedThemeId] ? normalizedThemeId : themeId
    const savedScheme = localStorage.getItem(STORAGE_KEYS.COLOR_SCHEME)
    const cachedVersion = localStorage.getItem(STORAGE_KEYS.CACHE_VERSION)

    if (cachedVersion !== THEME_CACHE_VERSION) {
      clearCache()
      localStorage.setItem(STORAGE_KEYS.CACHE_VERSION, THEME_CACHE_VERSION)
    }

    if (savedTheme && normalizedThemeId && savedTheme !== normalizedThemeId) {
      localStorage.setItem(STORAGE_KEYS.THEME_ID, normalizedThemeId)
      clearCache()
    }

    if (normalizedThemeId && defaultThemes[normalizedThemeId]) {
      setThemeIdState(normalizedThemeId)
    }

    if (isColorScheme(savedScheme)) {
      setColorSchemeState(savedScheme)
      setMode(savedScheme === "system" ? getSystemMode() : savedScheme)
    }

    const currentTheme = defaultThemes[nextThemeId]
    if (currentTheme) {
      cacheThemeVariants(currentTheme)
    }
  }, [])

  const setTheme = useCallback((id: string) => {
    const next = normalize(id)
    if (!next) {
      console.warn(`Theme "${id}" not found`)
      return
    }
    const theme = defaultThemes[next]
    if (!theme) {
      console.warn(`Theme "${id}" not found`)
      return
    }
    setThemeIdState(next)
    localStorage.setItem(STORAGE_KEYS.THEME_ID, next)
    cacheThemeVariants(theme)
  }, [])

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme)
    localStorage.setItem(STORAGE_KEYS.COLOR_SCHEME, scheme)
    setMode(scheme === "system" ? getSystemMode() : scheme)
  }, [])

  const previewTheme = useCallback(
    (id: string) => {
      const next = normalize(id)
      if (!next) return
      const theme = defaultThemes[next]
      if (!theme) return
      setPreviewState((prev) => ({ ...prev, themeId: next }))
      const previewMode = previewState.colorScheme
        ? previewState.colorScheme === "system"
          ? getSystemMode()
          : previewState.colorScheme
        : mode
      applyTheme(theme, next, previewMode)
    },
    [mode, previewState.colorScheme, applyTheme],
  )

  const previewColorScheme = useCallback(
    (scheme: ColorScheme) => {
      setPreviewState((prev) => ({ ...prev, colorScheme: scheme }))
      const previewMode = scheme === "system" ? getSystemMode() : scheme
      const id = previewState.themeId ?? themeId
      const theme = defaultThemes[id]
      if (theme) {
        applyTheme(theme, id, previewMode)
      }
    },
    [themeId, previewState.themeId, applyTheme],
  )

  const commitPreview = useCallback(() => {
    if (previewState.themeId) {
      setTheme(previewState.themeId)
    }
    if (previewState.colorScheme) {
      setColorScheme(previewState.colorScheme)
    }
    setPreviewState({ themeId: null, colorScheme: null })
  }, [previewState, setTheme, setColorScheme])

  const cancelPreview = useCallback(() => {
    setPreviewState({ themeId: null, colorScheme: null })
    const theme = defaultThemes[themeId]
    if (theme) {
      applyTheme(theme, themeId, mode)
    }
  }, [themeId, mode, applyTheme])

  const value: ThemeContextValue = {
    themeId,
    colorScheme,
    mode,
    themes: defaultThemes,
    setTheme,
    setColorScheme,
    previewTheme,
    previewColorScheme,
    commitPreview,
    cancelPreview,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
