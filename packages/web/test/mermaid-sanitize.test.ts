import { describe, expect, test } from "bun:test"
import { sanitizeMermaidSvg } from "../src/components/chat/tools/render/mermaid/lib/svg-sanitize"

describe("mermaid svg sanitize", () => {
  test("preserves Mermaid ids so embedded stylesheet selectors still match", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg" id="buddy_mermaid_example">
  <style>
    #buddy_mermaid_example .node rect { fill: #222222; }
    .edgePath path { marker-end: url(#buddy_mermaid_example_flowchart-pointEnd); }
  </style>
  <defs>
    <marker id="buddy_mermaid_example_flowchart-pointEnd"></marker>
  </defs>
  <g class="node">
    <rect id="buddy_mermaid_example_node" width="100" height="40"></rect>
  </g>
</svg>`

    const result = sanitizeMermaidSvg(inputSvg)

    expect(result).toContain('id="buddy_mermaid_example"')
    expect(result).toContain("#buddy_mermaid_example .node rect")
    expect(result).toContain('id="buddy_mermaid_example_flowchart-pointEnd"')
    expect(result).toContain("url(#buddy_mermaid_example_flowchart-pointEnd)")
    expect(result).not.toContain("user-content-")
  })

  test("strips script tags and inline event handlers from persisted svg", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg" onclick="alert('xss')">
  <script>alert('xss')</script>
  <g class="node">
    <rect width="100" height="40"></rect>
  </g>
</svg>`

    const result = sanitizeMermaidSvg(inputSvg)

    expect(result).not.toContain("<script")
    expect(result).not.toContain("onclick=")
    expect(result).toContain("<svg")
    expect(result).toContain('<g class="node">')
  })

  test("strips encoded unsafe svg links before mounting", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg">
  <a href="javascript&#58;alert('xss')"><text>Unsafe</text></a>
  <a xlink:href="java&#x09;script:alert('xss')"><text>Split unsafe</text></a>
  <a href="data&#58;text/html,alert('xss')"><text>HTML data</text></a>
</svg>`

    const result = sanitizeMermaidSvg(inputSvg)

    expect(result).toContain("Unsafe")
    expect(result).toContain("Split unsafe")
    expect(result).toContain("HTML data")
    expect(result).not.toContain("javascript")
    expect(result).not.toContain("java&#x09;script")
    expect(result).not.toContain("data:text/html")
    expect(result).not.toContain("data&#58;text/html")
    expect(result).not.toContain("href=")
    expect(result).not.toContain("xlink:href=")
  })

  test("preserves Mermaid foreignObject labels while stripping unsafe nested content", () => {
    const inputSvg = `
<svg xmlns="http://www.w3.org/2000/svg">
  <g class="node">
    <rect width="100" height="40"></rect>
    <foreignObject width="100" height="40">
      <div xmlns="http://www.w3.org/1999/xhtml" onclick="alert('xss')">
        Start
        <script>alert('xss')</script>
        <iframe src="https://example.com"></iframe>
      </div>
    </foreignObject>
  </g>
</svg>`

    const result = sanitizeMermaidSvg(inputSvg)

    expect(result).toContain("<foreignObject")
    expect(result).toContain("Start")
    expect(result).not.toContain("<script")
    expect(result).not.toContain("<iframe")
    expect(result).not.toContain("onclick=")
  })
})
