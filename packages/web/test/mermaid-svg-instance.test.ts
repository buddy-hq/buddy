import { describe, expect, test } from "bun:test"
import { scopeMermaidSvgResourcesForInstance } from "../src/components/media/renderers/mermaid/lib/svg-instance"

const CACHED_SVG = [
  '<svg id="buddy_mermaid_render_1" viewBox="0 0 100 40">',
  "<style>",
  "#buddy_mermaid_render_1 .marker { fill: currentColor; }",
  "</style>",
  '<marker id="buddy_mermaid_render_1_pointEnd"><path d="M0 0L10 5L0 10z"/></marker>',
  '<clipPath id="diagramClip"><rect width="100" height="40"/></clipPath>',
  '<path id="edge_1" marker-end="url(#buddy_mermaid_render_1_pointEnd)" ',
  'clip-path="url(#diagramClip)" d="M0 20L100 20"/>',
  '<g id="flowchart-A-0"><text>A</text></g>',
  "</svg>",
].join("")

describe("Mermaid SVG instance resources", () => {
  test("gives transcript and Bench copies independent marker resources", () => {
    const transcript = scopeMermaidSvgResourcesForInstance(CACHED_SVG, ":transcript:r1:")
    const bench = scopeMermaidSvgResourcesForInstance(CACHED_SVG, ":bench:r2:")

    expect(transcript).toContain('id="buddy-mermaid-transcript-r1-buddy_mermaid_render_1_pointEnd"')
    expect(transcript).toContain(
      'marker-end="url(#buddy-mermaid-transcript-r1-buddy_mermaid_render_1_pointEnd)"',
    )
    expect(bench).toContain('id="buddy-mermaid-bench-r2-buddy_mermaid_render_1_pointEnd"')
    expect(bench).toContain(
      'marker-end="url(#buddy-mermaid-bench-r2-buddy_mermaid_render_1_pointEnd)"',
    )
    expect(transcript).not.toContain("buddy-mermaid-bench-r2")
    expect(bench).not.toContain("buddy-mermaid-transcript-r1")
  })

  test("scopes referenced paint resources and root styles without changing interactive node ids", () => {
    const scoped = scopeMermaidSvgResourcesForInstance(CACHED_SVG, ":bench:r2:")

    expect(scoped).toContain('id="buddy-mermaid-bench-r2-diagramClip"')
    expect(scoped).toContain('clip-path="url(#buddy-mermaid-bench-r2-diagramClip)"')
    expect(scoped).toContain(
      "#buddy-mermaid-bench-r2-buddy_mermaid_render_1 .marker { fill: currentColor; }",
    )
    expect(scoped).toContain('id="flowchart-A-0"')
    expect(CACHED_SVG).toContain('marker-end="url(#buddy_mermaid_render_1_pointEnd)"')
  })

  test("does not rewrite longer unscoped ids that share a scoped id prefix", () => {
    const svg = [
      '<svg id="foo" viewBox="0 0 100 40">',
      "<style>#foo { color: red; } #foo-bar { color: blue; }</style>",
      '<g id="foo-bar"><text>Prefix sibling</text></g>',
      "</svg>",
    ].join("")

    const scoped = scopeMermaidSvgResourcesForInstance(svg, ":bench:r2:")

    expect(scoped).toContain('id="buddy-mermaid-bench-r2-foo"')
    expect(scoped).toContain("#buddy-mermaid-bench-r2-foo { color: red; }")
    expect(scoped).toContain('id="foo-bar"')
    expect(scoped).toContain("#foo-bar { color: blue; }")
    expect(scoped).not.toContain("#buddy-mermaid-bench-r2-foo-bar")
  })
})
