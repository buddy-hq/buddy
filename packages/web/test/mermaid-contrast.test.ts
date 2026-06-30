import { describe, expect, test } from "bun:test"
import { normalizeMermaidSvgContrast } from "../src/components/media/renderers/mermaid/lib/svg-contrast"

describe("mermaid svg contrast", () => {
  test("rewrites unreadable white text on white node fills", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg">
  <g class="node">
    <rect x="0" y="0" width="120" height="40" fill="#ffffff" />
    <text x="10" y="24" fill="#ffffff">Unreadable</text>
  </g>
</svg>`

    const result = normalizeMermaidSvgContrast({
      backgroundColor: "#ffffff",
      candidateTextColors: ["#111827", "#ffffff"],
      svg: inputSvg,
      textFallbackColor: "#111827",
    })

    expect(result.contrastAdjustments).toHaveLength(1)
    expect(result.contrastAdjustments[0]?.to).toBe("#111827")
    expect(result.svg).toContain('data-buddy-contrast-adjusted="true"')
    expect(result.svg).toContain('fill="#111827"')
  })

  test("rewrites unreadable Mermaid stylesheet fill and text overrides", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    #diagram .node rect { fill: #ffffff; }
    #diagram .node .nodeLabel { color: #ffffff; }
  </style>
  <g id="diagram">
    <g class="node">
      <rect x="0" y="0" width="120" height="40" />
      <text class="nodeLabel" x="10" y="24">Unreadable</text>
    </g>
  </g>
</svg>`

    const result = normalizeMermaidSvgContrast({
      backgroundColor: "#ffffff",
      candidateTextColors: ["#111827", "#ffffff"],
      svg: inputSvg,
      textFallbackColor: "#111827",
    })

    expect(result.contrastAdjustments).toHaveLength(1)
    expect(result.contrastAdjustments[0]?.from).toBe("#ffffff")
    expect(result.contrastAdjustments[0]?.to).toBe("#111827")
    expect(result.svg).toContain('data-buddy-contrast-adjusted="true"')
    expect(result.svg).toContain("fill: #111827")
  })

  test("parses stylesheet colors with important suffixes", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    #diagram .node rect { fill: #ffffff !important; }
    #diagram .node .nodeLabel { color: #ffffff !important; }
  </style>
  <g id="diagram">
    <g class="node">
      <rect x="0" y="0" width="120" height="40" />
      <text class="nodeLabel" x="10" y="24">Unreadable</text>
    </g>
  </g>
</svg>`

    const result = normalizeMermaidSvgContrast({
      backgroundColor: "#ffffff",
      candidateTextColors: ["#111827", "#ffffff"],
      svg: inputSvg,
      textFallbackColor: "#111827",
    })

    expect(result.contrastAdjustments).toHaveLength(1)
    expect(result.contrastAdjustments[0]?.from).toBe("#ffffff")
    expect(result.svg).toContain("fill: #111827")
  })

  test("rewrites unreadable foreignObject label colors", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    #diagram .node rect { fill: #202027; }
    #diagram .node .nodeLabel { color: #202027; }
  </style>
  <g id="diagram">
    <g class="node">
      <rect x="0" y="0" width="120" height="40" />
      <foreignObject width="120" height="40">
        <div xmlns="http://www.w3.org/1999/xhtml" class="nodeLabel">Start</div>
      </foreignObject>
    </g>
  </g>
</svg>`

    const result = normalizeMermaidSvgContrast({
      backgroundColor: "#09090f",
      candidateTextColors: ["#f8fafc", "#111827"],
      svg: inputSvg,
      textFallbackColor: "#f8fafc",
    })

    expect(result.contrastAdjustments).toHaveLength(1)
    expect(result.contrastAdjustments[0]?.property).toBe("color")
    expect(result.contrastAdjustments[0]?.from).toBe("#202027")
    expect(result.contrastAdjustments[0]?.to).toBe("#f8fafc")
    expect(result.svg).toContain("color: #f8fafc")
  })
})
