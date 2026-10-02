import { DEFAULT_COLOR_SCHEME, STORAGE_KEYS } from "./storage"
import type { ColorScheme, ThemeMode } from "./types"

export const SYSTEM_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)"

export function isColorScheme(value: string | null | undefined): value is ColorScheme {
  return value === "system" || value === "light" || value === "dark"
}

export function readColorScheme(storage: Storage): ColorScheme {
  const stored = storage.getItem(STORAGE_KEYS.COLOR_SCHEME)
  return isColorScheme(stored) ? stored : DEFAULT_COLOR_SCHEME
}

export function colorSchemeMode(scheme: ColorScheme, systemPrefersDark: boolean): ThemeMode {
  if (scheme !== "system") return scheme
  return systemPrefersDark ? "dark" : "light"
}
