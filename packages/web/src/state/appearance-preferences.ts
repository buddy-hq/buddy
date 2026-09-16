import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"
import {
  browserDocument,
  parseBuddyConfigObject,
  parseFiniteNumber,
  parseStringValue,
} from "./parse-external"

export const APPEARANCE_PREFERENCES_STORAGE_KEY = "buddy.appearance.v1"

export const DEFAULT_UI_FONT_SIZE = 14
export const DEFAULT_CODE_FONT_SIZE = 13
export const DEFAULT_CHAT_FONT_SIZE = 14
export const DEFAULT_DOCUMENT_FONT_SIZE = 16
export const MIN_APPEARANCE_FONT_SIZE = 10
export const MAX_APPEARANCE_FONT_SIZE = 24
export const MIN_CHAT_LINE_HEIGHT_PERCENT = 100
export const MAX_CHAT_LINE_HEIGHT_PERCENT = 250
export const UI_FONT_PLACEHOLDER = "System Sans"
export const CODE_FONT_PLACEHOLDER = "System Mono"

const APPEARANCE_STYLE_ID = "buddy-appearance-preferences"
const DEFAULT_DOCUMENT_ROOT_FONT_SIZE = 16
const UI_FONT_BASE =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const CODE_FONT_BASE =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

export type ChatLineSpacing = "compact" | "normal" | "relaxed" | "custom"

const CHAT_LINE_HEIGHTS = {
  compact: 1.5,
  normal: 1.7142857,
  relaxed: 1.9,
} satisfies Record<Exclude<ChatLineSpacing, "custom">, number>

const DEFAULT_CHAT_LINE_HEIGHT_PERCENT = Math.round(CHAT_LINE_HEIGHTS.normal * 100)

export function isChatLineSpacing(value: string): value is ChatLineSpacing {
  return value === "compact" || value === "normal" || value === "relaxed" || value === "custom"
}

export type AppearancePreferences = {
  uiFont: string
  codeFont: string
  chatFont: string
  documentFont: string
  uiFontSize: number
  codeFontSize: number
  chatFontSize: number
  documentFontSize: number
  chatLineSpacing: ChatLineSpacing
  chatLineHeightPercent: number
}

type AppearancePreferencesStore = AppearancePreferences & {
  setUiFont: (value: string) => void
  setCodeFont: (value: string) => void
  setChatFont: (value: string) => void
  setDocumentFont: (value: string) => void
  setUiFontSize: (value: number) => void
  setCodeFontSize: (value: number) => void
  setChatFontSize: (value: number) => void
  setDocumentFontSize: (value: number) => void
  setChatLineSpacing: (value: ChatLineSpacing) => void
  setChatLineHeightPercent: (value: number) => void
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  uiFont: "",
  codeFont: "",
  chatFont: "",
  documentFont: "",
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  chatFontSize: DEFAULT_CHAT_FONT_SIZE,
  documentFontSize: DEFAULT_DOCUMENT_FONT_SIZE,
  chatLineSpacing: "normal",
  chatLineHeightPercent: DEFAULT_CHAT_LINE_HEIGHT_PERCENT,
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

export function uiFallbackFontFamily(font: string, uiFont: string): string {
  return fontStack(font, uiFontFamily(uiFont))
}

export function normalizeAppearanceFontSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(
    MAX_APPEARANCE_FONT_SIZE,
    Math.max(MIN_APPEARANCE_FONT_SIZE, Math.round(value * 100) / 100),
  )
}

function normalizeChatLineHeightPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_LINE_HEIGHT_PERCENT
  return Math.min(
    MAX_CHAT_LINE_HEIGHT_PERCENT,
    Math.max(MIN_CHAT_LINE_HEIGHT_PERCENT, Math.round(value)),
  )
}

function chatLineHeight(preferences: AppearancePreferences): number {
  if (preferences.chatLineSpacing === "custom") {
    return normalizeChatLineHeightPercent(preferences.chatLineHeightPercent) / 100
  }
  return CHAT_LINE_HEIGHTS[preferences.chatLineSpacing]
}

export function documentRootFontSize(uiFontSize: number): number {
  const normalized = normalizeAppearanceFontSize(uiFontSize, DEFAULT_UI_FONT_SIZE)
  return (normalized / DEFAULT_UI_FONT_SIZE) * DEFAULT_DOCUMENT_ROOT_FONT_SIZE
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
  const chatFontSize = normalizeAppearanceFontSize(preferences.chatFontSize, DEFAULT_CHAT_FONT_SIZE)
  const documentFontSize = normalizeAppearanceFontSize(
    preferences.documentFontSize,
    DEFAULT_DOCUMENT_FONT_SIZE,
  )

  root.style.setProperty("--buddy-font-family-sans", uiFontFamily(preferences.uiFont))
  root.style.setProperty("--buddy-font-family-mono", codeFontFamily(preferences.codeFont))
  root.style.setProperty(
    "--buddy-chat-font-family",
    uiFallbackFontFamily(preferences.chatFont, preferences.uiFont),
  )
  root.style.setProperty(
    "--buddy-document-font-family",
    uiFallbackFontFamily(preferences.documentFont, preferences.uiFont),
  )
  root.style.setProperty("--font-sans", "var(--buddy-font-family-sans)")
  root.style.setProperty("--font-mono", "var(--buddy-font-family-mono)")
  // Tailwind dimensions are rem-based. Scaling the document root keeps text,
  // controls, spacing, and layout in proportion while preserving Buddy's
  // existing 14 px default UI text at a 16 px browser root.
  root.style.fontSize = `${documentRootFontSize(uiFontSize)}px`
  root.style.setProperty("--buddy-ui-font-size", `${uiFontSize}px`)
  root.style.setProperty("--buddy-code-font-size", `${codeFontSize}px`)
  root.style.setProperty("--buddy-chat-font-size", `${chatFontSize}px`)
  root.style.setProperty("--buddy-chat-line-height", String(chatLineHeight(preferences)))
  root.style.setProperty("--buddy-document-font-size", `${documentFontSize}px`)
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

[data-component="markdown-code"] .shiki,
[data-component="markdown-code"] pre code {
  font-size: var(--buddy-code-font-size);
}

[data-chat-typography],
[data-chat-typography] [data-markdown-document] {
  font-family: var(--buddy-chat-font-family);
  font-size: var(--buddy-chat-font-size);
  line-height: var(--buddy-chat-line-height);
}

[data-chat-typography] [data-markdown-document] :is(h1, h2, h3, h4, h5, h6) {
  font-size: 1em;
}
`
}

export function migrateAppearancePreferences<TValue>(
  persistedState: TValue,
): AppearancePreferences {
  const state = parseBuddyConfigObject(persistedState) ?? {}
  const uiFontSize = parseFiniteNumber(state.uiFontSize) ?? DEFAULT_UI_FONT_SIZE
  const chatLineSpacing = parseStringValue(state.chatLineSpacing)
  return {
    uiFont: parseStringValue(state.uiFont) ?? "",
    codeFont: parseStringValue(state.codeFont) ?? "",
    chatFont: parseStringValue(state.chatFont) ?? "",
    documentFont: parseStringValue(state.documentFont) ?? "",
    uiFontSize,
    codeFontSize: parseFiniteNumber(state.codeFontSize) ?? DEFAULT_CODE_FONT_SIZE,
    chatFontSize: parseFiniteNumber(state.chatFontSize) ?? uiFontSize,
    documentFontSize:
      parseFiniteNumber(state.documentFontSize) ??
      normalizeAppearanceFontSize(
        (uiFontSize * DEFAULT_DOCUMENT_FONT_SIZE) / DEFAULT_UI_FONT_SIZE,
        DEFAULT_DOCUMENT_FONT_SIZE,
      ),
    chatLineSpacing:
      chatLineSpacing !== undefined && isChatLineSpacing(chatLineSpacing)
        ? chatLineSpacing
        : DEFAULT_APPEARANCE_PREFERENCES.chatLineSpacing,
    chatLineHeightPercent:
      parseFiniteNumber(state.chatLineHeightPercent) ?? DEFAULT_CHAT_LINE_HEIGHT_PERCENT,
  }
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
      setChatFont(value) {
        set({ chatFont: normalizeFontInput(value) })
      },
      setDocumentFont(value) {
        set({ documentFont: normalizeFontInput(value) })
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
      setChatFontSize(value) {
        set((current) => ({
          chatFontSize: normalizeAppearanceFontSize(value, current.chatFontSize),
        }))
      },
      setDocumentFontSize(value) {
        set((current) => ({
          documentFontSize: normalizeAppearanceFontSize(value, current.documentFontSize),
        }))
      },
      setChatLineSpacing(value) {
        set((current) =>
          value === "custom" && current.chatLineSpacing !== "custom"
            ? {
                chatLineSpacing: value,
                chatLineHeightPercent: Math.round(CHAT_LINE_HEIGHTS[current.chatLineSpacing] * 100),
              }
            : { chatLineSpacing: value },
        )
      },
      setChatLineHeightPercent(value) {
        set({ chatLineHeightPercent: normalizeChatLineHeightPercent(value) })
      },
    }),
    {
      name: APPEARANCE_PREFERENCES_STORAGE_KEY,
      version: 1,
      storage: createPlatformJsonStorage("buddy.appearance.dat"),
      migrate(persistedState) {
        return migrateAppearancePreferences(persistedState)
      },
      partialize(state) {
        return {
          uiFont: state.uiFont,
          codeFont: state.codeFont,
          chatFont: state.chatFont,
          documentFont: state.documentFont,
          uiFontSize: state.uiFontSize,
          codeFontSize: state.codeFontSize,
          chatFontSize: state.chatFontSize,
          documentFontSize: state.documentFontSize,
          chatLineSpacing: state.chatLineSpacing,
          chatLineHeightPercent: state.chatLineHeightPercent,
        }
      },
    },
  ),
)

applyAppearancePreferences(useAppearancePreferences.getState())

useAppearancePreferences.subscribe((state) => {
  applyAppearancePreferences(state)
})
