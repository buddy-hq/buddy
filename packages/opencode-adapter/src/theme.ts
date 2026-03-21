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
} from '../../../vendor/opencode/packages/ui/src/theme/types'

export {
  hexToRgb,
  rgbToHex,
  hexToOklch,
  oklchToHex,
  rgbToOklch,
  oklchToRgb,
  generateScale,
  generateNeutralScale,
  generateAlphaScale,
  fitOklch,
  blend,
  mixColors,
  shift,
  lighten,
  darken,
  withAlpha,
} from '../../../vendor/opencode/packages/ui/src/theme/color'

export {
  resolveThemeVariant,
  resolveTheme,
  themeToCss,
} from '../../../vendor/opencode/packages/ui/src/theme/resolve'

export * from '../../../vendor/opencode/packages/ui/src/theme/default-themes'
export { DEFAULT_THEMES as defaultThemes } from '../../../vendor/opencode/packages/ui/src/theme/default-themes'
