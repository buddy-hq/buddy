import { describe, expect, test } from "bun:test"
import { createMermaidThemeConfig } from "../src/components/media/renderers/mermaid/lib/theme"
import { parseColor } from "../src/components/media/renderers/mermaid/lib/color"
import { adaptMermaidSourceColors } from "../src/components/media/renderers/mermaid/lib/theme-colors"
import { rgbToOklch } from "../src/theme/color"

const DARK_THEME = createMermaidThemeConfig({
  backgroundBase: "#101116",
  surfaceBase: "#16171d",
  surfaceRaisedBase: "#131419",
  surfaceWeak: "#1d1e25",
  borderBase: "#34353d",
  textBase: "#e5e7eb",
  textStrong: "#f9fafb",
  textWeak: "#9ca3af",
  textInvertBase: "#111827",
  textInteractiveBase: "#60a5fa",
})

const LIGHT_THEME = createMermaidThemeConfig({
  backgroundBase: "#ffffff",
  surfaceBase: "#ffffff",
  surfaceRaisedBase: "#f5f5f5",
  surfaceWeak: "#efefef",
  borderBase: "#d6d6d6",
  textBase: "#1f2937",
  textStrong: "#111827",
  textWeak: "#6b7280",
  textInvertBase: "#ffffff",
  textInteractiveBase: "#2563eb",
})

function toOklch(value: string | undefined) {
  const color = parseColor(value)
  if (!color) {
    throw new Error(`Unparseable color ${value}`)
  }
  return rgbToOklch(color.red / 255, color.green / 255, color.blue / 255)
}

function readDeclaration(source: string, property: string) {
  const match = source.match(new RegExp(`(?:^|[\\s,;])${property}:(#[0-9a-f]{6})`, "u"))
  return toOklch(match?.[1])
}

function readFillLightness(source: string): number[] {
  return Array.from(source.matchAll(/fill:(#[0-9a-f]{6})/gu), (match) => toOklch(match[1]).l)
}

function compositeOverCanvas(value: string | undefined) {
  const color = parseColor(value)
  const canvas = parseColor(DARK_THEME.backgroundColor)
  if (!color || !canvas) {
    throw new Error(`Unparseable color ${value}`)
  }
  const blend = (front: number, back: number) => front * color.alpha + back * (1 - color.alpha)
  return {
    red: blend(color.red, canvas.red),
    green: blend(color.green, canvas.green),
    blue: blend(color.blue, canvas.blue),
  }
}

function hueDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % 360
  return Math.min(distance, 360 - distance)
}

describe("mermaid theme colors", () => {
  test("leaves light themes unchanged", () => {
    const source = "flowchart TD\n  A --> B\n  style A fill:#e8f5e9,stroke:#2e7d32"

    expect(adaptMermaidSourceColors(source, LIGHT_THEME)).toBe(source)
  })

  test("darkens pastel fills and lightens strokes while keeping their hue", () => {
    const adapted = adaptMermaidSourceColors(
      "flowchart TD\n  A --> B\n  style A fill:#e8f5e9,stroke:#2e7d32",
      DARK_THEME,
    )
    const styleLine = adapted.split("\n")[2] ?? ""
    const fill = readDeclaration(styleLine, "fill")
    const stroke = readDeclaration(styleLine, "stroke")

    expect(fill.l).toBeCloseTo(0.42, 2)
    expect(hueDistance(fill.h, toOklch("#e8f5e9").h)).toBeLessThan(10)
    expect(stroke.l).toBeGreaterThanOrEqual(0.69)
    expect(hueDistance(stroke.h, toOklch("#2e7d32").h)).toBeLessThan(10)
  })

  test("keeps pale tints chromatic instead of treating them as neutral", () => {
    const adapted = adaptMermaidSourceColors("classDef soft fill:#e8eaf6", DARK_THEME)
    const fill = readDeclaration(adapted, "fill")

    expect(fill.c).toBeGreaterThan(0.02)
    expect(hueDistance(fill.h, toOklch("#e8eaf6").h)).toBeLessThan(10)
  })

  test("maps black fills and neutral strokes and text to theme tokens", () => {
    expect(
      adaptMermaidSourceColors(
        "classDef plain fill:#000000,stroke:#333,color:black !important",
        DARK_THEME,
      ),
    ).toBe("classDef plain fill:#16171d,stroke:#34353d,color:#e5e7eb !important")
  })

  test("keeps gray fills apart in their original order", () => {
    const lightness = readFillLightness(
      adaptMermaidSourceColors(
        ["#000000", "#444444", "#888888", "#cccccc", "#ffffff"]
          .map((color, index) => `classDef level${index} fill:${color}`)
          .join("\n"),
        DARK_THEME,
      ),
    )

    expect(lightness).toHaveLength(5)
    for (const [index, value] of lightness.entries()) {
      expect(value).toBeGreaterThan((lightness[index - 1] ?? 0) + 0.02)
    }
    expect(lightness.at(-1)).toBeLessThanOrEqual(0.43)
  })

  test("lifts model text colors above the fill band", () => {
    const adapted = adaptMermaidSourceColors("style A fill:#e8f5e9,color:#1b5e20", DARK_THEME)
    const text = readDeclaration(adapted, "color")

    expect(text.l).toBeGreaterThanOrEqual(0.85)
  })

  test("rewrites link styles and preserves alpha", () => {
    const adapted = adaptMermaidSourceColors(
      "linkStyle 0 stroke:#c62828,stroke-width:4px\nclassDef glass fill:#e3f2fd80",
      DARK_THEME,
    )
    const [linkLine, classLine] = adapted.split("\n")

    expect(linkLine).toContain("stroke-width:4px")
    expect(readDeclaration(linkLine ?? "", "stroke").l).toBeGreaterThan(0.69)
    expect(classLine).toMatch(/fill:#[0-9a-f]{6}80$/u)
  })

  test("leaves non-color values and non-style lines untouched", () => {
    const source = [
      "flowchart TD",
      '  A["fill:#ffffff"] --> B',
      "  style A fill:none,stroke-width:2px,stroke-dasharray: 5 5",
    ].join("\n")

    expect(adaptMermaidSourceColors(source, DARK_THEME)).toBe(source)
  })

  test("rewrites sequence rect regions using rgb syntax", () => {
    const adapted = adaptMermaidSourceColors(
      [
        "sequenceDiagram",
        "  rect rgb(191, 223, 255)",
        "  A->>B: Hi",
        "  end",
        "  rect rgba(0, 0, 255, 0.1)",
        "  end",
      ].join("\n"),
      DARK_THEME,
    )
    const lines = adapted.split("\n")

    expect(lines[1]).toMatch(/^ {2}rect rgb\(\d+, \d+, \d+\)$/u)
    expect(lines[1]).not.toBe("  rect rgb(191, 223, 255)")
    expect(lines[4]).toMatch(/^ {2}rect rgba\(\d+, \d+, \d+, 0\.1\)$/u)
  })

  test("keeps faint washes visibly lighter than the canvas", () => {
    const adapted = adaptMermaidSourceColors(
      "sequenceDiagram\n  rect rgba(0, 0, 255, 0.1)\n  end",
      DARK_THEME,
    )
    const wash = compositeOverCanvas(adapted.match(/rect (rgba\([^)]*\))/u)?.[1])
    const canvas = toOklch(DARK_THEME.backgroundColor)
    const seen = rgbToOklch(wash.red / 255, wash.green / 255, wash.blue / 255)

    expect(seen.l - canvas.l).toBeGreaterThan(0.05)
    expect(wash.blue).toBeGreaterThan(wash.red)
  })
})
