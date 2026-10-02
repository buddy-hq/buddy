export type {
  DesktopTheme,
  ThemePaletteColors,
  ThemeSeedColors,
  ThemeVariant,
  HexColor,
  OklchColor,
  ResolvedTheme,
  ColorValue,
  CssVarRef,
  TokenCategory,
  ThemeToken,
} from "@buddy/opencode-adapter/theme"

export type ColorScheme = "system" | "light" | "dark"

export type ThemeMode = "light" | "dark"

export type ThemeSlots = Record<ThemeMode, string>
