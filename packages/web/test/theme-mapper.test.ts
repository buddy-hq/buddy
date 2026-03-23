import { describe, expect, test } from "bun:test"
import { defaultThemes } from "../src/theme/default-themes"
import { resolveThemeVariant, themeToCss } from "../src/theme/resolve"

function cssValue(css: string, key: string) {
  const match = css.match(new RegExp(`${key}:\\s*([^;]+);`))
  return match?.[1]
}

describe("themeToCss", () => {
  test("serializes dark theme tokens as raw css custom properties", () => {
    const tokens = resolveThemeVariant(defaultThemes["oc-2"].dark, true)
    const css = themeToCss(tokens)

    expect(cssValue(css, "--background-base")).toBe(tokens["background-base"])
    expect(cssValue(css, "--surface-raised-stronger-non-alpha")).toBe(
      tokens["surface-raised-stronger-non-alpha"],
    )
    expect(cssValue(css, "--text-base")).toBe(tokens["text-base"])
    expect(cssValue(css, "--border-interactive-base")).toBe(tokens["border-interactive-base"])
  })

  test("serializes light theme tokens", () => {
    const tokens = resolveThemeVariant(defaultThemes["oc-2"].light, false)
    const css = themeToCss(tokens)

    expect(cssValue(css, "--background-base")).toBe(tokens["background-base"])
    expect(cssValue(css, "--surface-weak")).toBe(tokens["surface-weak"])
    expect(cssValue(css, "--border-base")).toBe(tokens["border-base"])
  })
})
