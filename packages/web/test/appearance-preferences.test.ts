import { beforeEach, describe, expect, test } from "bun:test"
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_UI_FONT_SIZE,
  MAX_APPEARANCE_FONT_SIZE,
  MAX_CHAT_LINE_HEIGHT_PERCENT,
  MIN_APPEARANCE_FONT_SIZE,
  applyAppearancePreferences,
  codeFontFamily,
  migrateAppearancePreferences,
  normalizeAppearanceFontSize,
  uiFallbackFontFamily,
  uiFontFamily,
  useAppearancePreferences,
  type AppearancePreferences,
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

  test("chat and document fonts fall back to the UI font", () => {
    expect(uiFallbackFontFamily("", "Aptos")).toBe(uiFontFamily("Aptos"))
    expect(uiFallbackFontFamily("Charter", "Aptos")).toBe(`Charter, ${uiFontFamily("Aptos")}`)
  })

  test("normalizes font sizes to the supported range", () => {
    expect(normalizeAppearanceFontSize(5, DEFAULT_UI_FONT_SIZE)).toBe(MIN_APPEARANCE_FONT_SIZE)
    expect(normalizeAppearanceFontSize(40, DEFAULT_UI_FONT_SIZE)).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(normalizeAppearanceFontSize(Number.NaN, DEFAULT_UI_FONT_SIZE)).toBe(DEFAULT_UI_FONT_SIZE)
    expect(normalizeAppearanceFontSize(13.456, DEFAULT_CODE_FONT_SIZE)).toBe(13.46)
  })

  test("applies global font variables and code sizing styles", () => {
    applyAppearancePreferences({
      uiFont: "Aptos",
      codeFont: "SF Mono",
      chatFont: "Charter",
      documentFont: "Literata",
      uiFontSize: 15,
      codeFontSize: 12,
      chatFontSize: 17,
      documentFontSize: 18.5,
      chatLineSpacing: "relaxed",
      chatLineHeightPercent: DEFAULT_APPEARANCE_PREFERENCES.chatLineHeightPercent,
    })

    expect(document.documentElement.style.getPropertyValue("--buddy-ui-font-size")).toBe("15px")
    expect(document.documentElement.style.getPropertyValue("--buddy-code-font-size")).toBe("12px")
    expect(document.documentElement.style.getPropertyValue("--buddy-chat-font-size")).toBe("17px")
    expect(document.documentElement.style.getPropertyValue("--buddy-chat-line-height")).toBe("1.9")
    expect(document.documentElement.style.getPropertyValue("--buddy-chat-font-family")).toBe(
      uiFallbackFontFamily("Charter", "Aptos"),
    )
    expect(document.documentElement.style.getPropertyValue("--buddy-document-font-size")).toBe(
      "18.5px",
    )
    expect(document.documentElement.style.getPropertyValue("--buddy-document-font-family")).toBe(
      uiFallbackFontFamily("Literata", "Aptos"),
    )
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
    expect(document.getElementById("buddy-appearance-preferences")?.textContent).toContain(
      "[data-chat-typography] [data-markdown-document]",
    )
  })

  test("custom chat line spacing applies the percent as a line height", () => {
    applyAppearancePreferences({
      ...DEFAULT_APPEARANCE_PREFERENCES,
      chatLineSpacing: "custom",
      chatLineHeightPercent: 165,
    })

    expect(document.documentElement.style.getPropertyValue("--buddy-chat-line-height")).toBe("1.65")
  })

  test("switching to custom line spacing starts from the current preset", () => {
    useAppearancePreferences.getState().setChatLineSpacing("compact")
    useAppearancePreferences.getState().setChatLineSpacing("custom")

    expect(useAppearancePreferences.getState().chatLineHeightPercent).toBe(150)

    useAppearancePreferences.getState().setChatLineHeightPercent(165)
    useAppearancePreferences.getState().setChatLineSpacing("custom")

    expect(useAppearancePreferences.getState().chatLineHeightPercent).toBe(165)
  })

  test("migration keeps chat and document text at their current sizes", () => {
    expect(
      migrateAppearancePreferences({
        uiFont: "Aptos",
        codeFont: "",
        uiFontSize: 16,
        codeFontSize: 12,
      }),
    ).toEqual({
      uiFont: "Aptos",
      codeFont: "",
      chatFont: "",
      documentFont: "",
      uiFontSize: 16,
      codeFontSize: 12,
      chatFontSize: 16,
      documentFontSize: 18.29,
      chatLineSpacing: "normal",
      chatLineHeightPercent: DEFAULT_APPEARANCE_PREFERENCES.chatLineHeightPercent,
    })
  })

  test("migration keeps typography that is already saved", () => {
    const saved = {
      uiFont: "Aptos",
      codeFont: "SF Mono",
      chatFont: "Charter",
      documentFont: "Literata",
      uiFontSize: 16,
      codeFontSize: 12,
      chatFontSize: 18.5,
      documentFontSize: 20,
      chatLineSpacing: "custom",
      chatLineHeightPercent: 165,
    } satisfies AppearancePreferences

    expect(migrateAppearancePreferences(saved)).toEqual(saved)
    expect(
      migrateAppearancePreferences({ ...saved, chatLineSpacing: "roomy" }).chatLineSpacing,
    ).toBe("normal")
  })

  test("migration clamps saved sizes to the supported range", () => {
    const migrated = migrateAppearancePreferences({
      uiFontSize: 100,
      codeFontSize: 2,
      chatFontSize: 100,
      documentFontSize: 100,
      chatLineHeightPercent: 400,
    })

    expect(migrated.uiFontSize).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(migrated.codeFontSize).toBe(MIN_APPEARANCE_FONT_SIZE)
    expect(migrated.chatFontSize).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(migrated.documentFontSize).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(migrated.chatLineHeightPercent).toBe(MAX_CHAT_LINE_HEIGHT_PERCENT)
  })

  test("store actions normalize persisted values", () => {
    useAppearancePreferences.getState().setUiFont("  Aptos  ")
    useAppearancePreferences.getState().setCodeFont("  SF Mono  ")
    useAppearancePreferences.getState().setUiFontSize(40)
    useAppearancePreferences.getState().setCodeFontSize(5)
    useAppearancePreferences.getState().setChatFont("  Charter  ")
    useAppearancePreferences.getState().setChatFontSize(30)
    useAppearancePreferences.getState().setDocumentFont("  Literata  ")
    useAppearancePreferences.getState().setDocumentFontSize(15.555)
    useAppearancePreferences.getState().setChatLineHeightPercent(400)

    expect(useAppearancePreferences.getState().uiFont).toBe("Aptos")
    expect(useAppearancePreferences.getState().codeFont).toBe("SF Mono")
    expect(useAppearancePreferences.getState().uiFontSize).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(useAppearancePreferences.getState().codeFontSize).toBe(MIN_APPEARANCE_FONT_SIZE)
    expect(useAppearancePreferences.getState().chatFont).toBe("Charter")
    expect(useAppearancePreferences.getState().chatFontSize).toBe(MAX_APPEARANCE_FONT_SIZE)
    expect(useAppearancePreferences.getState().documentFont).toBe("Literata")
    expect(useAppearancePreferences.getState().documentFontSize).toBe(15.56)
    expect(useAppearancePreferences.getState().chatLineHeightPercent).toBe(
      MAX_CHAT_LINE_HEIGHT_PERCENT,
    )
  })
})
