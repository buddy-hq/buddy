import { describe, expect, test } from "bun:test"

import {
  CONTRAST_TARGET,
  CHAT_TEXT_CONTRAST_TARGET,
  compositeLayerStack,
  constrainTextContrast,
  contrastRatio,
  defaultThemes,
  ensureTextContrast,
  hexToOklch,
  layeredContrastRatio,
  resolveThemeVariant,
  type HexColor,
} from "../src/theme"

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function readHex(tokens: Record<string, string>, key: string): HexColor {
  const value = tokens[key]
  if (!value || !isHexColor(value)) throw new Error(`Expected ${key} to resolve to a hex color`)
  return value
}

function isHexColor(value: string): value is HexColor {
  return HEX_COLOR_PATTERN.test(value)
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
    expect(contrastRatio(result, "#f8f8f8")).toBeGreaterThanOrEqual(CONTRAST_TARGET.normalText)
  })

  test("constrains excessive text contrast without changing its hue", () => {
    const preferred = "#f8f8f8"
    const background = "#151720"
    const result = constrainTextContrast(preferred, [[background]], 7, 11.5)

    expect(contrastRatio(result, background)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(result, background)).toBeLessThanOrEqual(11.5)
    expect(Math.abs(hexToOklch(preferred).h - hexToOklch(result).h)).toBeLessThan(1)
  })

  test("caps only dark chat text across every bundled theme", () => {
    for (const theme of Object.values(defaultThemes)) {
      const light = resolveThemeVariant(theme.light, false)
      expect(light["chat-text-base"], `${theme.id}/light body`).toBe(light["text-base"])
      expect(light["chat-text-strong"], `${theme.id}/light strong`).toBe(light["text-strong"])

      const dark = resolveThemeVariant(theme.dark, true)
      const backgrounds = [
        readHex(dark, "background-base"),
        readHex(dark, "surface-raised-stronger-non-alpha"),
      ]

      for (const [token, maximum] of [
        ["chat-text-base", CHAT_TEXT_CONTRAST_TARGET.bodyMaximum],
        ["chat-text-strong", CHAT_TEXT_CONTRAST_TARGET.strongMaximum],
      ] as const) {
        const foreground = readHex(dark, token)
        const ratios = backgrounds.map((background) => contrastRatio(foreground, background))

        expect(Math.min(...ratios), `${theme.id}/dark ${token} minimum`).toBeGreaterThanOrEqual(
          CHAT_TEXT_CONTRAST_TARGET.minimum,
        )
        expect(Math.max(...ratios), `${theme.id}/dark ${token} maximum`).toBeLessThanOrEqual(
          maximum,
        )
      }
    }
  })

  test("normalizes semantic component states across every bundled theme", () => {
    for (const theme of Object.values(defaultThemes)) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = resolveThemeVariant(theme[mode], mode === "dark")
        readHex(tokens, "theme-primary-base")
        readHex(tokens, "theme-accent-base")
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
