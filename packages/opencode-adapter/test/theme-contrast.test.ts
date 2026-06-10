import { describe, expect, test } from "bun:test"

import {
  CONTRAST_TARGET,
  compositeLayerStack,
  contrastRatio,
  defaultThemes,
  ensureTextContrast,
  hexToOklch,
  layeredContrastRatio,
  resolveThemeVariant,
  type HexColor,
} from "../src/theme"

function readHex(tokens: Record<string, string>, key: string): HexColor {
  const value = tokens[key]
  if (!value?.startsWith("#")) throw new Error(`Expected ${key} to resolve to a hex color`)
  return value
}

describe("theme contrast", () => {
  test("composites translucent layers before measuring contrast", () => {
    expect(compositeLayerStack(["#00000080", "#ffffff"])).toBe("#7f7f7f")
    expect(layeredContrastRatio("#ffffff", ["#00000080", "#ffffff"])).toBeGreaterThan(4)
  })

  test("preserves semantic hue while adjusting text lightness", () => {
    const preferred = "#0abe00"
    const result = ensureTextContrast(preferred, [["#f8f8f8"]])
    const preferredHue = hexToOklch(preferred).h
    const resultHue = hexToOklch(result).h

    expect(Math.abs(preferredHue - resultHue)).toBeLessThan(1)
    expect(contrastRatio(result, "#f8f8f8")).toBeGreaterThanOrEqual(
      CONTRAST_TARGET.normalText,
    )
  })

  test("normalizes semantic component states across every bundled theme", () => {
    for (const theme of Object.values(defaultThemes)) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = resolveThemeVariant(theme[mode], mode === "dark")
        const parents = [
          "background-base",
          "surface-raised-base",
          "surface-raised-stronger-non-alpha",
        ] as const

        for (const parentKey of parents) {
          const parent = readHex(tokens, parentKey)

          for (const status of ["critical", "warning", "success", "info"] as const) {
            for (const strength of ["weak", "base", "strong"] as const) {
              const surface = readHex(tokens, `surface-${status}-${strength}`)
              const foreground = readHex(tokens, `text-on-${status}-${strength}`)

              expect(
                layeredContrastRatio(foreground, [surface, parent]),
                `${theme.id}/${mode} ${status}-${strength} on ${parentKey}`,
              ).toBeGreaterThanOrEqual(CONTRAST_TARGET.normalText)
            }
          }

          for (const state of ["base", "hover"] as const) {
            const surface = readHex(tokens, `button-secondary-${state}`)
            const foreground = readHex(tokens, `text-on-button-secondary-${state}`)
            const renderedSurface = compositeLayerStack([surface, parent])

            expect(
              contrastRatio(renderedSurface, parent),
              `${theme.id}/${mode} secondary ${state} boundary on ${parentKey}`,
            ).toBeGreaterThanOrEqual(CONTRAST_TARGET.subtleSurface)
            expect(
              layeredContrastRatio(foreground, [surface, parent]),
              `${theme.id}/${mode} secondary ${state} text on ${parentKey}`,
            ).toBeGreaterThanOrEqual(CONTRAST_TARGET.normalText)
          }
        }
      }
    }
  })
})
