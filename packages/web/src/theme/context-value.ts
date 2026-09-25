import { createContext } from "react"
import type { ColorScheme, DesktopTheme } from "./types"

export type ThemeContextValue = {
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

/** Keep the context identity stable when the provider implementation is hot reloaded. */
export const ThemeContext = createContext<ThemeContextValue | null>(null)
