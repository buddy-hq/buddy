import { createContext } from "react"
import type { ColorScheme, DesktopTheme, ThemeMode } from "./types"

export type ThemeContextValue = {
  themeId: string
  lightThemeId: string
  darkThemeId: string
  colorScheme: ColorScheme
  mode: ThemeMode
  themes: Record<string, DesktopTheme>
  setThemeForMode: (mode: ThemeMode, id: string) => void
  setColorScheme: (scheme: ColorScheme) => void
}

/** Keep the context identity stable when the provider implementation is hot reloaded. */
export const ThemeContext = createContext<ThemeContextValue | null>(null)
