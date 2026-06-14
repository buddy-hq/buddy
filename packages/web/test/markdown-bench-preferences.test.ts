import { describe, expect, test } from "bun:test"
import {
  buildMarkdownBenchContentThemeCss,
  isMarkdownBenchContentThemeMode,
  sanitizeMarkdownBenchThemeScopeID,
  type MarkdownBenchContentTheme,
} from "../src/components/bench/markdown-bench-document-theme"
import { createMermaidThemeConfig } from "../src/components/chat/tools/render/mermaid/lib/theme"
import {
  MARKDOWN_PDF_PRINT_PALETTE,
  MARKDOWN_PDF_PRINT_TYPE,
} from "../src/lib/markdown-pdf-export"
import {
  MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  clampMarkdownBenchContentFontScale,
} from "../src/state/markdown-bench-preferences"

const TEST_MERMAID_THEME_CONFIG = createMermaidThemeConfig({
  backgroundBase: "#ffffff",
  borderBase: "#d1d5db",
  surfaceBase: "#ffffff",
  surfaceRaisedBase: "#f8fafc",
  surfaceWeak: "#f3f4f6",
  textBase: "#111827",
  textInteractiveBase: "#1d4ed8",
  textInvertBase: "#ffffff",
  textStrong: "#030712",
  textWeak: "#374151",
})

describe("Markdown Bench preferences", () => {
  test("sanitizes scoped document theme ids for CSS attribute selectors", () => {
    expect(sanitizeMarkdownBenchThemeScopeID(":r1:")).toBe("r1")
    expect(sanitizeMarkdownBenchThemeScopeID("")).toBe("markdown-bench-document")
  })

  test("recognizes the supported document content theme modes", () => {
    expect(isMarkdownBenchContentThemeMode("light")).toBe(true)
    expect(isMarkdownBenchContentThemeMode("dark")).toBe(true)
    expect(isMarkdownBenchContentThemeMode("print")).toBe(true)
    expect(isMarkdownBenchContentThemeMode("system")).toBe(false)
  })

  test("builds a scoped document theme with an independent font scale", () => {
    const theme: MarkdownBenchContentTheme = {
      mermaidThemeConfig: TEST_MERMAID_THEME_CONFIG,
      mode: "dark",
      variables: "--background-base: #020617;\n--markdown-text: #f8fafc;",
    }

    const css = buildMarkdownBenchContentThemeCss({
      contentFontScale: 1.2,
      scopeID: ":r2:",
      theme,
    })

    expect(css).toContain('[data-markdown-bench-theme-scope="r2"]')
    expect(css).toContain("color-scheme: dark")
    expect(css).toContain("--markdown-bench-document-font-scale: 1.2")
    expect(css).toContain("--text-mix-blend-mode: plus-lighter")
    expect(css).toContain("--color-background-base: var(--background-base);")
    expect(css).toContain("--markdown-text: #f8fafc;")
    expect(css).toContain("background: var(--background-base) !important;")
  })

  test("locks print view to the PDF print theme and type scale", () => {
    const theme: MarkdownBenchContentTheme = {
      mermaidThemeConfig: TEST_MERMAID_THEME_CONFIG,
      mode: "print",
      variables: `--background-base: ${MARKDOWN_PDF_PRINT_PALETTE.page};`,
    }

    const css = buildMarkdownBenchContentThemeCss({
      contentFontScale: 1.2,
      scopeID: ":print:",
      theme,
    })

    expect(css).toContain("color-scheme: light")
    expect(css).toContain("--markdown-bench-document-font-scale: 1")
    expect(css).toContain(`background: ${MARKDOWN_PDF_PRINT_PALETTE.page} !important;`)
    expect(css).toContain(`font-size: ${MARKDOWN_PDF_PRINT_TYPE.bodyFontSize} !important;`)
    expect(css).toContain(`font-weight: ${MARKDOWN_PDF_PRINT_TYPE.strongFontWeight} !important;`)
    expect(css).toContain('[class*="_codeMirrorToolbar_"]')
    expect(css).toContain('data-component="mermaid-diagram-static-viewport"')
    expect(css).toContain("border-collapse: collapse !important;")
    expect(css).toContain("display: none !important;")
  })

  test("clamps document font scale to the supported viewing range", () => {
    expect(clampMarkdownBenchContentFontScale(0)).toBe(MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE)
    expect(clampMarkdownBenchContentFontScale(10)).toBe(MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE)
    expect(clampMarkdownBenchContentFontScale(1.121)).toBe(1.1)
  })
})
