import {
  resolveThemeDocumentColors,
  resolveThemeVariant,
  unreadableDocumentColorKeys,
} from "@buddy/opencode-adapter/theme"
import { defaultThemes } from "./default-themes"
import { DEFAULT_LIGHT_THEME_ID } from "./storage"
import type { ResolvedTheme, ThemeMode } from "./types"

const LIGHT_COUNTERPART_THEME_IDS = new Map([
  ["catppuccin-frappe", "catppuccin"],
  ["catppuccin-macchiato", "catppuccin"],
  ["one-dark", "onedarkpro"],
])

const documentColorsByVariant = new Map<string, ResolvedTheme>()
const tokensByVariant = new Map<string, ResolvedTheme>()
const selectableIDsByMode = new Map<ThemeMode, readonly string[]>()

function variantKey(themeId: string, mode: ThemeMode): string {
  return `${themeId}/${mode}`
}

export function themeDocumentColors(themeId: string, mode: ThemeMode): ResolvedTheme | undefined {
  const theme = defaultThemes[themeId]
  if (!theme) return undefined

  const key = variantKey(themeId, mode)
  const cached = documentColorsByVariant.get(key)
  if (cached) return cached

  const colors = resolveThemeDocumentColors(theme[mode], mode === "dark")
  documentColorsByVariant.set(key, colors)
  return colors
}

export function themeTokens(themeId: string, mode: ThemeMode): ResolvedTheme | undefined {
  const theme = defaultThemes[themeId]
  if (!theme) return undefined

  const key = variantKey(themeId, mode)
  const cached = tokensByVariant.get(key)
  if (cached) return cached

  const tokens = resolveThemeVariant(theme[mode], mode === "dark")
  tokensByVariant.set(key, tokens)
  return tokens
}

export function isSelectableTheme(themeId: string, mode: ThemeMode): boolean {
  if (!defaultThemes[themeId]) return false
  if (mode === "dark") return true
  const colors = themeDocumentColors(themeId, mode)
  return colors !== undefined && unreadableDocumentColorKeys(colors).length === 0
}

export function selectableThemeIDs(mode: ThemeMode): readonly string[] {
  const cached = selectableIDsByMode.get(mode)
  if (cached) return cached

  const ids = Object.keys(defaultThemes)
    .filter((themeId) => isSelectableTheme(themeId, mode))
    .toSorted((left, right) => defaultThemes[left].name.localeCompare(defaultThemes[right].name))
  selectableIDsByMode.set(mode, ids)
  return ids
}

export function lightThemeIDFor(themeId: string): string {
  if (isSelectableTheme(themeId, "light")) return themeId
  const counterpart = LIGHT_COUNTERPART_THEME_IDS.get(themeId)
  return counterpart && isSelectableTheme(counterpart, "light")
    ? counterpart
    : DEFAULT_LIGHT_THEME_ID
}
