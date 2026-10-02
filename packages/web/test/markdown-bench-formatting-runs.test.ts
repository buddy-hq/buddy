import { describe, expect, test } from "bun:test"
import type { Paragraph, PhrasingContent } from "mdast"
import { joinFormattingAroundInlineNodes } from "../src/components/bench/markdown/plugins/formatting-runs"

function text(value: string): PhrasingContent {
  return { type: "text", value }
}

function inlineMath(value: string): PhrasingContent {
  return { type: "inlineMath", value }
}

function paragraph(children: PhrasingContent[]): Paragraph {
  return { type: "paragraph", children }
}

describe("joinFormattingAroundInlineNodes", () => {
  test("joins bold split around inline math back into one run", () => {
    const node = paragraph([
      { type: "strong", children: [text("bold ")] },
      { type: "strong", children: [inlineMath("x")] },
      { type: "strong", children: [text(" after ")] },
      { type: "strong", children: [inlineMath("y")] },
      { type: "strong", children: [text(" end")] },
    ])

    joinFormattingAroundInlineNodes(node)

    expect(node.children).toEqual([
      {
        type: "strong",
        children: [text("bold "), inlineMath("x"), text(" after "), inlineMath("y"), text(" end")],
      },
    ])
  })

  test("joins nested formatting at every level", () => {
    const node = paragraph([
      { type: "emphasis", children: [{ type: "strong", children: [text("both ")] }] },
      {
        type: "emphasis",
        children: [
          {
            type: "strong",
            children: [{ type: "link", url: "https://x.com", children: [text("a")] }],
          },
        ],
      },
      { type: "emphasis", children: [{ type: "strong", children: [text(" here")] }] },
    ])

    joinFormattingAroundInlineNodes(node)

    expect(node.children).toEqual([
      {
        type: "emphasis",
        children: [
          {
            type: "strong",
            children: [
              text("both "),
              { type: "link", url: "https://x.com", children: [text("a")] },
              text(" here"),
            ],
          },
        ],
      },
    ])
  })

  test("leaves runs separated by text, code or a different formatting alone", () => {
    const children: PhrasingContent[] = [
      { type: "strong", children: [text("a")] },
      text(" "),
      inlineMath("x"),
      { type: "strong", children: [text("b")] },
      { type: "inlineCode", value: "c" },
      { type: "strong", children: [text("d")] },
      inlineMath("y"),
      { type: "emphasis", children: [text("e")] },
    ]
    const node = paragraph(structuredClone(children))

    joinFormattingAroundInlineNodes(node)

    expect(node.children).toEqual(children)
  })
})
