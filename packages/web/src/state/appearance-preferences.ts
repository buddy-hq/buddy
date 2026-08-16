import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"
import { browserDocument } from "./parse-external"

export const APPEARANCE_PREFERENCES_STORAGE_KEY = "buddy.appearance.v1"

export const DEFAULT_UI_FONT_SIZE = 14
export const DEFAULT_CODE_FONT_SIZE = 13
export const MIN_APPEARANCE_FONT_SIZE = 10
export const MAX_APPEARANCE_FONT_SIZE = 24
export const UI_FONT_PLACEHOLDER = "System Sans"
export const CODE_FONT_PLACEHOLDER = "System Mono"

const APPEARANCE_STYLE_ID = "buddy-appearance-preferences"
const UI_FONT_BASE =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const CODE_FONT_BASE =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

export type AppearancePreferences = {
  uiFont: string
  codeFont: string
  uiFontSize: number
  codeFontSize: number
}

type AppearancePreferencesStore = AppearancePreferences & {
  setUiFont: (value: string) => void
  setCodeFont: (value: string) => void
  setUiFontSize: (value: number) => void
  setCodeFontSize: (value: number) => void
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  uiFont: "",
  codeFont: "",
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
}

function normalizeFontInput(value: string): string {
  return value.trim()
}

function quoteFontFamily(font: string): string {
  if (/^[\w-]+$/.test(font)) return font
  return `"${font.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function fontStack(font: string, fallback: string): string {
  const normalized = normalizeFontInput(font)
  if (!normalized) return fallback
  return `${quoteFontFamily(normalized)}, ${fallback}`
}

export function uiFontFamily(font: string): string {
  return fontStack(font, UI_FONT_BASE)
}

export function codeFontFamily(font: string): string {
  return fontStack(font, CODE_FONT_BASE)
}

export function normalizeAppearanceFontSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(MAX_APPEARANCE_FONT_SIZE, Math.max(MIN_APPEARANCE_FONT_SIZE, Math.round(value)))
}

function ensureAppearanceStyleElement(): HTMLStyleElement {
  const documentNode = browserDocument()
  if (!documentNode) {
    throw new Error("Appearance preferences require a document.")
  }
  const existing = documentNode.getElementById(APPEARANCE_STYLE_ID)
  if (existing instanceof HTMLStyleElement) return existing

  const element = documentNode.createElement("style")
  element.id = APPEARANCE_STYLE_ID
  documentNode.head.appendChild(element)
  return element
}

export function applyAppearancePreferences(preferences: AppearancePreferences): void {
  const documentNode = browserDocument()
  if (!documentNode) return

  const root = documentNode.documentElement
  const uiFontSize = normalizeAppearanceFontSize(preferences.uiFontSize, DEFAULT_UI_FONT_SIZE)
  const codeFontSize = normalizeAppearanceFontSize(preferences.codeFontSize, DEFAULT_CODE_FONT_SIZE)

  root.style.setProperty("--buddy-font-family-sans", uiFontFamily(preferences.uiFont))
  root.style.setProperty("--buddy-font-family-mono", codeFontFamily(preferences.codeFont))
  root.style.setProperty("--font-sans", "var(--buddy-font-family-sans)")
  root.style.setProperty("--font-mono", "var(--buddy-font-family-mono)")
  root.style.setProperty("--buddy-ui-font-size", `${uiFontSize}px`)
  root.style.setProperty("--buddy-code-font-size", `${codeFontSize}px`)
  root.style.setProperty("--buddy-font-size-xs", "calc(var(--buddy-ui-font-size) * 0.857142857)")
  root.style.setProperty("--buddy-font-size-sm", "var(--buddy-ui-font-size)")
  root.style.setProperty("--buddy-font-size-base", "calc(var(--buddy-ui-font-size) * 1.142857143)")
  root.style.setProperty("--buddy-font-size-lg", "calc(var(--buddy-ui-font-size) * 1.285714286)")
  root.style.setProperty("--buddy-font-size-xl", "calc(var(--buddy-ui-font-size) * 1.428571429)")

  ensureAppearanceStyleElement().textContent = `
body,
.font-sans {
  font-family: var(--buddy-font-family-sans);
}

.font-mono,
code,
pre,
kbd,
samp {
  font-family: var(--buddy-font-family-mono);
}

pre,
pre code,
[data-component="markdown-code"] code,
[data-component="markdown-code"] pre {
  font-size: var(--buddy-code-font-size);
}
`
}

export const useAppearancePreferences = create<AppearancePreferencesStore>()(
  persist(
    (set) => ({
      ...DEFAULT_APPEARANCE_PREFERENCES,
      setUiFont(value) {
        set({ uiFont: normalizeFontInput(value) })
      },
      setCodeFont(value) {
        set({ codeFont: normalizeFontInput(value) })
      },
      setUiFontSize(value) {
        set((current) => ({
          uiFontSize: normalizeAppearanceFontSize(value, current.uiFontSize),
        }))
      },
      setCodeFontSize(value) {
        set((current) => ({
          codeFontSize: normalizeAppearanceFontSize(value, current.codeFontSize),
        }))
      },
    }),
    {
      name: APPEARANCE_PREFERENCES_STORAGE_KEY,
      storage: createPlatformJsonStorage("buddy.appearance.dat"),
      partialize(state) {
        return {
          uiFont: state.uiFont,
          codeFont: state.codeFont,
          uiFontSize: state.uiFontSize,
          codeFontSize: state.codeFontSize,
        }
      },
    },
  ),
)

applyAppearancePreferences(useAppearancePreferences.getState())

useAppearancePreferences.subscribe((state) => {
  applyAppearancePreferences(state)
})
