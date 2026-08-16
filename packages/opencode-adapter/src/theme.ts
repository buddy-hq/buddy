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
  rgbToOklch,
  oklchToRgb,
  oklchToHex,
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

import { blend, mixColors } from "../../../vendor/opencode/packages/ui/src/theme/color"
import {
  resolveThemeVariant as resolveVendorThemeVariant,
  themeToCss,
} from "../../../vendor/opencode/packages/ui/src/theme/resolve"
export { themeToCss } from "../../../vendor/opencode/packages/ui/src/theme/resolve"

export * from "../../../vendor/opencode/packages/ui/src/theme/default-themes"
export { DEFAULT_THEMES as defaultThemes } from "../../../vendor/opencode/packages/ui/src/theme/default-themes"
export {
  compositeLayerStack,
  contrastRatio,
  layeredContrastRatio,
  ensureLayerContrast,
  ensureTextContrast,
  shiftLightness,
  CONTRAST_TARGET,
} from "./theme-contrast"
import {
  CONTRAST_TARGET,
  ensureLayerContrast,
  ensureTextContrast,
  shiftLightness,
} from "./theme-contrast"

const SECONDARY_BUTTON_HOVER_LIGHTNESS_SHIFT = 0.035
const SUBTLE_STATUS_SURFACE_ALPHA = 0.15

type ThemeIdentityColors = {
  primary: HexColor
  accent: HexColor
}

function themeIdentityColors(variant: ThemeVariant): ThemeIdentityColors {
  if (variant.palette) {
    return {
      primary: variant.palette.primary,
      accent: variant.palette.accent ?? variant.palette.primary,
    }
  }

  return {
    primary: variant.seeds.primary,
    accent: variant.seeds.interactive,
  }
}

function isHexColor(value: ColorValue | undefined): value is HexColor {
  return value !== undefined && value.startsWith("#")
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
  backgroundKeys: readonly string[],
  parentKeys: readonly string[],
  minimum: number,
): void {
  const preferred = hexToken(tokens, preferredKey)
  if (!preferred) return

  const backgrounds = backgroundKeys.flatMap((backgroundKey) => {
    const background = hexToken(tokens, backgroundKey)
    if (!background) return []

    return parentKeys.flatMap((parentKey) => {
      const parent = hexToken(tokens, parentKey)
      return parent ? ([[background, parent]] as const) : []
    })
  })
  if (backgrounds.length === 0) return

  tokens[key] = ensureTextContrast(preferred, backgrounds, minimum)
}

function normalizeBuddyTokens(
  tokens: ResolvedTheme,
  isDark: boolean,
  identity: ThemeIdentityColors,
): ResolvedTheme {
  const next = { ...tokens }
  const applicationParents = [
    "background-base",
    "surface-raised-base",
    "surface-raised-stronger-non-alpha",
  ] as const
  const backgroundOnly = ["background-base"] as const

  next["theme-primary-base"] = identity.primary
  next["theme-accent-base"] = identity.accent

  setReadableToken(
    next,
    "text-base",
    "text-base",
    backgroundOnly,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-strong",
    "text-strong",
    backgroundOnly,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-weak",
    "text-weak",
    backgroundOnly,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-weaker",
    "text-weaker",
    backgroundOnly,
    backgroundOnly,
    CONTRAST_TARGET.largeText,
  )
  setReadableToken(
    next,
    "text-interactive-base",
    "text-interactive-base",
    backgroundOnly,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )

  setReadableToken(
    next,
    "text-on-button-primary-base",
    "icon-invert-base",
    ["button-primary-base"],
    applicationParents,
    CONTRAST_TARGET.normalText,
  )

  const buttonPrimaryBase = hexToken(next, "button-primary-base")
  const backgroundBase = hexToken(next, "background-base")
  if (buttonPrimaryBase && backgroundBase) {
    next["button-primary-hover"] = mixColors(buttonPrimaryBase, backgroundBase, 0.08)
  }
  setReadableToken(
    next,
    "text-on-button-primary-hover",
    "icon-invert-base",
    ["button-primary-hover"],
    applicationParents,
    CONTRAST_TARGET.normalText,
  )

  const buttonSecondaryBase = hexToken(next, "button-secondary-base")
  const buttonParents = applicationParents.flatMap((parentKey) => {
    const parent = hexToken(next, parentKey)
    return parent ? ([[parent]] as const) : []
  })
  if (buttonSecondaryBase && buttonParents.length > 0) {
    const tunedBase = ensureLayerContrast(
      buttonSecondaryBase,
      buttonParents,
      CONTRAST_TARGET.subtleSurface,
    )
    next["button-secondary-base"] = tunedBase
    next["button-secondary-hover"] = shiftLightness(
      tunedBase,
      isDark ? SECONDARY_BUTTON_HOVER_LIGHTNESS_SHIFT : -SECONDARY_BUTTON_HOVER_LIGHTNESS_SHIFT,
    )
  }
  setReadableToken(
    next,
    "text-on-button-secondary-base",
    "text-strong",
    ["button-secondary-base"],
    applicationParents,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-on-button-secondary-hover",
    "text-strong",
    ["button-secondary-hover"],
    applicationParents,
    CONTRAST_TARGET.normalText,
  )

  for (const status of ["critical", "warning", "success", "info"] as const) {
    for (const strength of ["weak", "base", "strong"] as const) {
      setReadableToken(
        next,
        `text-on-${status}-${strength}`,
        `icon-${status}-base`,
        [`surface-${status}-${strength}`],
        applicationParents,
        CONTRAST_TARGET.normalText,
      )
    }
  }

  setReadableToken(
    next,
    "text-success-base",
    "icon-success-base",
    applicationParents,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-warning-base",
    "icon-warning-base",
    applicationParents,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-critical-base",
    "icon-critical-base",
    applicationParents,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-critical-strong",
    "icon-critical-base",
    applicationParents,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-info-weak",
    "icon-info-base",
    applicationParents,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-info-strong",
    "icon-info-base",
    applicationParents,
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )
  setReadableToken(
    next,
    "text-critical-on-raised",
    "icon-critical-base",
    ["surface-raised-stronger-non-alpha"],
    backgroundOnly,
    CONTRAST_TARGET.normalText,
  )

  const warningBase = hexToken(next, "surface-warning-base")
  const warningPreferred = hexToken(next, "icon-warning-base")
  if (warningBase && warningPreferred) {
    const subtleWarningBackgrounds = applicationParents.flatMap((parentKey) => {
      const parent = hexToken(next, parentKey)
      return parent ? ([[blend(warningBase, parent, SUBTLE_STATUS_SURFACE_ALPHA)]] as const) : []
    })
    if (subtleWarningBackgrounds.length > 0) {
      next["text-on-warning-subtle"] = ensureTextContrast(
        warningPreferred,
        subtleWarningBackgrounds,
        CONTRAST_TARGET.normalText,
      )
    }
  }

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
  return normalizeBuddyTokens(
    resolveVendorThemeVariant(variant, isDark),
    isDark,
    themeIdentityColors(variant),
  )
}

export function resolveTheme(theme: DesktopTheme) {
  return {
    light: resolveThemeVariant(theme.light, false),
    dark: resolveThemeVariant(theme.dark, true),
  }
}
