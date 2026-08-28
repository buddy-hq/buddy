import { beforeEach, describe, expect, test } from "bun:test"
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  MAX_APPEARANCE_FONT_SIZE,
  MIN_APPEARANCE_FONT_SIZE,
  applyAppearancePreferences,
  codeFontFamily,
  normalizeAppearanceFontSize,
  uiFontFamily,
  useAppearancePreferences,
} from "../src/state/appearance-preferences"

describe("appearance preferences", () => {
  beforeEach(() => {
    document.getElementById("buddy-appearance-preferences")?.remove()
    document.documentElement.removeAttribute("style")
    useAppearancePreferences.setState({ ...DEFAULT_APPEARANCE_PREFERENCES })
  })

  test("builds font stacks with quoted custom family names", () => {
    expect(uiFontFamily("Aptos")).toContain("Aptos,")
    expect(codeFontFamily("SF Mono")).toContain('"SF Mono",')
  })

  test("normalizes font sizes to the supported range", () => {
    expect(normalizeAppearanceFontSize(5, DEFAULT_UI_FONT_SIZE)).toBe(MIN_APPEARANCE_FONT_SIZE)
    expect(normalizeAppearanceFontSize(40, DEFAULT_UI_FONT_SIZE)).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(normalizeAppearanceFontSize(Number.NaN, DEFAULT_UI_FONT_SIZE)).toBe(DEFAULT_UI_FONT_SIZE)
    expect(normalizeAppearanceFontSize(13.4, DEFAULT_CODE_FONT_SIZE)).toBe(13)
  })

  test("applies global font variables and code sizing styles", () => {
    applyAppearancePreferences({
      uiFont: "Aptos",
      codeFont: "SF Mono",
      uiFontSize: 15,
      codeFontSize: 12,
    })

    expect(document.documentElement.style.getPropertyValue("--buddy-ui-font-size")).toBe("15px")
    expect(document.documentElement.style.getPropertyValue("--buddy-code-font-size")).toBe("12px")
    expect(Number.parseFloat(document.documentElement.style.fontSize)).toBeCloseTo(17.142857)
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe(
      "var(--buddy-font-family-sans)",
    )
    expect(document.documentElement.style.getPropertyValue("--font-mono")).toBe(
      "var(--buddy-font-family-mono)",
    )
    expect(document.getElementById("buddy-appearance-preferences")?.textContent).toContain(
      '[data-component="markdown-code"] .shiki',
    )
  })

  test("store actions normalize persisted values", () => {
    useAppearancePreferences.getState().setUiFont("  Aptos  ")
    useAppearancePreferences.getState().setCodeFont("  SF Mono  ")
    useAppearancePreferences.getState().setUiFontSize(40)
    useAppearancePreferences.getState().setCodeFontSize(5)

    expect(useAppearancePreferences.getState().uiFont).toBe("Aptos")
    expect(useAppearancePreferences.getState().codeFont).toBe("SF Mono")
    expect(useAppearancePreferences.getState().uiFontSize).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(useAppearancePreferences.getState().codeFontSize).toBe(MIN_APPEARANCE_FONT_SIZE)
  })
})
