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
} from "../../../vendor/opencode/packages/ui/src/theme/types"
import type {
  ColorValue,
  DesktopTheme,
  HexColor,
  ResolvedTheme,
  ThemeVariant,
} from "../../../vendor/opencode/packages/ui/src/theme/types"

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
} from "../../../vendor/opencode/packages/ui/src/theme/color"

import { hexToRgb, mixColors } from "../../../vendor/opencode/packages/ui/src/theme/color"
import {
  resolveThemeVariant as resolveVendorThemeVariant,
  themeToCss,
} from "../../../vendor/opencode/packages/ui/src/theme/resolve"
export { themeToCss } from "../../../vendor/opencode/packages/ui/src/theme/resolve"

export * from "../../../vendor/opencode/packages/ui/src/theme/default-themes"
export { DEFAULT_THEMES as defaultThemes } from "../../../vendor/opencode/packages/ui/src/theme/default-themes"

const BLACK = "#000000" satisfies HexColor
const WHITE = "#ffffff" satisfies HexColor
const NORMAL_TEXT_CONTRAST = 4.5
const SUBTLE_TEXT_CONTRAST = 3

function toLinearRgb(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function isHexColor(value: ColorValue | undefined): value is HexColor {
  return value !== undefined && value.startsWith("#")
}

function luminance(color: HexColor): number {
  const rgb = hexToRgb(color)

  return 0.2126 * toLinearRgb(rgb.r) + 0.7152 * toLinearRgb(rgb.g) + 0.0722 * toLinearRgb(rgb.b)
}

function contrastRatio(left: HexColor, right: HexColor): number {
  const leftLuminance = luminance(left)
  const rightLuminance = luminance(right)
  const lighter = Math.max(leftLuminance, rightLuminance)
  const darker = Math.min(leftLuminance, rightLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

function readableTone(background: HexColor, preferred: HexColor, minimum: number): HexColor {
  if (contrastRatio(preferred, background) >= minimum) return preferred

  const target =
    contrastRatio(BLACK, background) >= contrastRatio(WHITE, background) ? BLACK : WHITE

  for (const amount of [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]) {
    const candidate = mixColors(background, target, amount)
    if (contrastRatio(candidate, background) >= minimum) return candidate
  }

  return target
}

function hexToken(tokens: ResolvedTheme, key: string): HexColor | undefined {
  const value = tokens[key]
  return isHexColor(value) ? value : undefined
}

function setAlias(tokens: ResolvedTheme, key: string, value: ColorValue | undefined): void {
  if (value !== undefined) tokens[key] = value
}

function setReadableToken(
  tokens: ResolvedTheme,
  key: string,
  preferredKey: string,
  backgroundKey: string,
  minimum: number,
): void {
  const preferred = hexToken(tokens, preferredKey)
  const background = hexToken(tokens, backgroundKey)
  if (!preferred || !background) return

  tokens[key] = readableTone(background, preferred, minimum)
}

function normalizeBuddyTokens(tokens: ResolvedTheme): ResolvedTheme {
  const next = { ...tokens }

  setReadableToken(next, "text-base", "text-base", "background-base", NORMAL_TEXT_CONTRAST)
  setReadableToken(next, "text-strong", "text-strong", "background-base", NORMAL_TEXT_CONTRAST)
  setReadableToken(next, "text-weak", "text-weak", "background-base", NORMAL_TEXT_CONTRAST)
  setReadableToken(next, "text-weaker", "text-weaker", "background-base", SUBTLE_TEXT_CONTRAST)
  setReadableToken(
    next,
    "text-interactive-base",
    "text-interactive-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )

  setReadableToken(
    next,
    "text-on-button-primary-base",
    "text-invert-strong",
    "button-primary-base",
    NORMAL_TEXT_CONTRAST,
  )

  const buttonPrimaryBase = hexToken(next, "button-primary-base")
  const backgroundBase = hexToken(next, "background-base")
  if (buttonPrimaryBase && backgroundBase) {
    next["button-primary-hover"] = mixColors(buttonPrimaryBase, backgroundBase, 0.08)
  }

  setReadableToken(
    next,
    "text-success-base",
    "icon-success-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )
  setReadableToken(
    next,
    "text-warning-base",
    "icon-warning-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )
  setReadableToken(
    next,
    "text-critical-base",
    "icon-critical-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )
  setReadableToken(
    next,
    "text-critical-strong",
    "icon-critical-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )
  setReadableToken(
    next,
    "text-info-weak",
    "icon-info-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )
  setReadableToken(
    next,
    "text-info-strong",
    "icon-info-base",
    "background-base",
    NORMAL_TEXT_CONTRAST,
  )

  setAlias(next, "text-subtle", next["text-weaker"])
  setAlias(next, "text-weakest", next["text-weaker"])
  setAlias(next, "icon-weak", next["icon-weak-base"])

  setAlias(next, "border", next["border-base"])
  setAlias(next, "border-weak", next["border-weak-base"])
  setAlias(next, "border-weaker", next["border-weaker-base"])
  setAlias(next, "border-critical-weak", next["border-critical-base"])
  setAlias(next, "border-info-weak", next["border-info-base"])

  setAlias(next, "surface-tertiary", next["surface-weak"])
  setAlias(next, "surface-info-hover", next["surface-info-weak"])
  setAlias(next, "surface-critical-base-hover", next["surface-critical-strong"])
  setAlias(next, "surface-warning-base-hover", next["surface-warning-strong"])
  setAlias(next, "surface-success-base-hover", next["surface-success-strong"])
  setAlias(next, "surface-interactive-base-hover", next["surface-interactive-hover"])
  setAlias(next, "surface-stronger", next["surface-raised-stronger"])

  setAlias(next, "syntax-unknown", next["syntax-diff-unknown"])

  return next
}

export function resolveThemeVariant(variant: ThemeVariant, isDark: boolean): ResolvedTheme {
  return normalizeBuddyTokens(resolveVendorThemeVariant(variant, isDark))
}

export function resolveTheme(theme: DesktopTheme): { light: ResolvedTheme; dark: ResolvedTheme } {
  return {
    light: resolveThemeVariant(theme.light, false),
    dark: resolveThemeVariant(theme.dark, true),
  }
}
