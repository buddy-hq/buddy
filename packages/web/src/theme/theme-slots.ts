import { readColorScheme } from "./color-scheme"
import { clearCachedThemeCss } from "./theme-css"
import { isSelectableTheme, lightThemeIDFor } from "./theme-catalog"
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID, STORAGE_KEYS } from "./storage"
import type { ThemeMode, ThemeSlots } from "./types"

export const THEME_SLOT_STORAGE_KEYS = {
  light: STORAGE_KEYS.LIGHT_THEME_ID,
  dark: STORAGE_KEYS.DARK_THEME_ID,
} satisfies Record<ThemeMode, string>

const THEME_MODES = ["light", "dark"] as const satisfies readonly ThemeMode[]

function readLegacyThemeID(storage: Storage): string | undefined {
  const legacy = storage.getItem(STORAGE_KEYS.LEGACY_THEME_ID)
  return legacy && isSelectableTheme(legacy, "dark") ? legacy : undefined
}

function hasUsedLightMode(storage: Storage): boolean {
  return readColorScheme(storage) !== "dark"
}

function lightThemeIDForLegacy(storage: Storage, legacyThemeId: string | undefined): string {
  if (!legacyThemeId) return DEFAULT_LIGHT_THEME_ID
  const isUnchosenDefault = legacyThemeId === DEFAULT_DARK_THEME_ID && !hasUsedLightMode(storage)
  return isUnchosenDefault ? DEFAULT_LIGHT_THEME_ID : lightThemeIDFor(legacyThemeId)
}

export function readThemeSlots(storage: Storage): ThemeSlots {
  const legacyThemeId = readLegacyThemeID(storage)
  const storedLight = storage.getItem(STORAGE_KEYS.LIGHT_THEME_ID)
  const storedDark = storage.getItem(STORAGE_KEYS.DARK_THEME_ID)

  return {
    light: storedLight
      ? lightThemeIDFor(storedLight)
      : lightThemeIDForLegacy(storage, legacyThemeId),
    dark:
      storedDark && isSelectableTheme(storedDark, "dark")
        ? storedDark
        : (legacyThemeId ?? DEFAULT_DARK_THEME_ID),
  }
}

export function migrateThemeSlots(storage: Storage): ThemeSlots {
  const slots = readThemeSlots(storage)
  const changedModes = THEME_MODES.filter(
    (mode) => storage.getItem(THEME_SLOT_STORAGE_KEYS[mode]) !== slots[mode],
  )

  if (changedModes.length > 0) clearCachedThemeCss(storage)
  for (const mode of changedModes) {
    storage.setItem(THEME_SLOT_STORAGE_KEYS[mode], slots[mode])
  }
  storage.removeItem(STORAGE_KEYS.LEGACY_THEME_ID)
  return slots
}
