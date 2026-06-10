import type { HexColor } from "../../../vendor/opencode/packages/ui/src/theme/types"
import {
  hexToOklch,
  hexToRgb,
  oklchToHex,
  rgbToHex,
} from "../../../vendor/opencode/packages/ui/src/theme/color"

export const CONTRAST_TARGET = {
  normalText: 4.5,
  largeText: 3,
  subtleSurface: 1.3,
} as const

const SEARCH_STEPS = 100
const OPAQUE_ALPHA = 1
const BYTE_MAX = 255
const BLACK = "#000000" satisfies HexColor
const WHITE = "#ffffff" satisfies HexColor

function toLinearRgb(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function alphaChannel(color: HexColor): number {
  const value = color.slice(1)
  if (value.length === 4) {
    return Number.parseInt(`${value[3]}${value[3]}`, 16) / BYTE_MAX
  }
  if (value.length === 8) {
    return Number.parseInt(value.slice(6), 16) / BYTE_MAX
  }
  return OPAQUE_ALPHA
}

function opaque(color: HexColor): HexColor {
  const rgb = hexToRgb(color)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

function compositeLayer(foreground: HexColor, background: HexColor): HexColor {
  const foregroundRgb = hexToRgb(foreground)
  const backgroundRgb = hexToRgb(background)
  const alpha = alphaChannel(foreground)

  return rgbToHex(
    foregroundRgb.r * alpha + backgroundRgb.r * (1 - alpha),
    foregroundRgb.g * alpha + backgroundRgb.g * (1 - alpha),
    foregroundRgb.b * alpha + backgroundRgb.b * (1 - alpha),
  )
}

/**
 * Resolves a top-to-bottom color stack into the opaque color a user sees.
 * The final layer should be an opaque application background.
 */
export function compositeLayerStack(layers: readonly [HexColor, ...HexColor[]]): HexColor {
  let result = opaque(layers[layers.length - 1])

  for (let index = layers.length - 2; index >= 0; index -= 1) {
    result = compositeLayer(layers[index], result)
  }

  return result
}

function luminance(color: HexColor): number {
  const rgb = hexToRgb(color)

  return 0.2126 * toLinearRgb(rgb.r) + 0.7152 * toLinearRgb(rgb.g) + 0.0722 * toLinearRgb(rgb.b)
}

export function contrastRatio(left: HexColor, right: HexColor): number {
  const leftLuminance = luminance(left)
  const rightLuminance = luminance(right)
  const lighter = Math.max(leftLuminance, rightLuminance)
  const darker = Math.min(leftLuminance, rightLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

export function layeredContrastRatio(
  foreground: HexColor,
  backgroundLayers: readonly [HexColor, ...HexColor[]],
): number {
  const background = compositeLayerStack(backgroundLayers)
  const renderedForeground = compositeLayerStack([foreground, ...backgroundLayers])
  return contrastRatio(renderedForeground, background)
}

function lightnessCandidate(preferred: HexColor, target: 0 | 1, amount: number): HexColor {
  const color = hexToOklch(preferred)
  return oklchToHex({
    l: color.l + (target - color.l) * amount,
    c: color.c,
    h: color.h,
  })
}

function minimumTextRatio(
  foreground: HexColor,
  backgroundStacks: readonly (readonly [HexColor, ...HexColor[]])[],
): number {
  return Math.min(
    ...backgroundStacks.map((background) => layeredContrastRatio(foreground, background)),
  )
}

function minimumLayerRatio(
  foregroundLayer: HexColor,
  parentStacks: readonly (readonly [HexColor, ...HexColor[]])[],
): number {
  return Math.min(
    ...parentStacks.map((parents) => {
      const parent = compositeLayerStack(parents)
      const renderedLayer = compositeLayerStack([foregroundLayer, ...parents])
      return contrastRatio(renderedLayer, parent)
    }),
  )
}

function nearestPassingCandidate(
  preferred: HexColor,
  passes: (candidate: HexColor) => boolean,
): HexColor | undefined {
  const preferredLightness = hexToOklch(preferred).l
  const candidates: HexColor[] = []

  for (const target of [0, 1] as const) {
    for (let step = 1; step <= SEARCH_STEPS; step += 1) {
      const candidate = lightnessCandidate(preferred, target, step / SEARCH_STEPS)
      if (!passes(candidate)) continue
      candidates.push(candidate)
      break
    }
  }

  let nearest: HexColor | undefined
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    const distance = Math.abs(hexToOklch(candidate).l - preferredLightness)
    if (distance >= nearestDistance) continue
    nearest = candidate
    nearestDistance = distance
  }

  return nearest
}

export function ensureTextContrast(
  preferred: HexColor,
  backgroundStacks: readonly (readonly [HexColor, ...HexColor[]])[],
  minimum: number = CONTRAST_TARGET.normalText,
): HexColor {
  if (minimumTextRatio(preferred, backgroundStacks) >= minimum) return preferred

  const candidate = nearestPassingCandidate(
    opaque(preferred),
    (next) => minimumTextRatio(next, backgroundStacks) >= minimum,
  )
  if (candidate) return candidate

  return minimumTextRatio(BLACK, backgroundStacks) >= minimumTextRatio(WHITE, backgroundStacks)
    ? BLACK
    : WHITE
}

export function ensureLayerContrast(
  preferred: HexColor,
  parentStacks: readonly (readonly [HexColor, ...HexColor[]])[],
  minimum: number,
): HexColor {
  if (minimumLayerRatio(preferred, parentStacks) >= minimum) return preferred

  const candidate = nearestPassingCandidate(
    opaque(preferred),
    (next) => minimumLayerRatio(next, parentStacks) >= minimum,
  )
  if (candidate) return candidate

  return minimumLayerRatio(BLACK, parentStacks) >= minimumLayerRatio(WHITE, parentStacks)
    ? BLACK
    : WHITE
}

export function shiftLightness(color: HexColor, amount: number): HexColor {
  const value = hexToOklch(color)
  return oklchToHex({ ...value, l: value.l + amount })
}
