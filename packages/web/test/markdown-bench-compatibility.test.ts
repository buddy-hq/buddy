import { describe, expect, test } from "bun:test"
import {
  prepareMarkdownForMdxEditor,
  prepareMdxForMdxEditor,
} from "../src/components/bench/markdown-bench-compatibility"

describe("Markdown Bench compatibility", () => {
  test("protects CommonMark URL and email autolinks from MDX parsing", () => {
    expect(
      prepareMarkdownForMdxEditor(
        "Visit <https://example.com/a_(b)> or email <person@example.com>.",
      ),
    ).toBe(
      "Visit [https://example.com/a_(b)](<https://example.com/a_(b)>) or email [person@example.com](<mailto:person@example.com>).",
    )
  })

  test("does not rewrite autolink-looking text inside code", () => {
    const markdown = [
      "Inline `<https://inline.example>`.",
      "",
      "```md",
      "<https://fenced.example>",
      "```",
      "",
      "<https://linked.example>",
    ].join("\n")

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(
      [
        "Inline `<https://inline.example>`.",
        "",
        "```md",
        "<https://fenced.example>",
        "```",
        "",
        "[https://linked.example](<https://linked.example>)",
      ].join("\n"),
    )
  })

  test("preserves raw HTML and ordinary resource links", () => {
    const markdown = [
      "<details>",
      "<summary>Open</summary>",
      "",
      "[OpenAI](https://openai.com)",
      "",
      "</details>",
    ].join("\n")

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(markdown)
  })

  test("normalizes Buddy inline and display math for the editor parser", () => {
    const markdown = String.raw`Inline \(E = mc^2\) and $\sqrt{2}$.

\[\ce{H2O}\]`

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(String.raw`Inline $E = mc^2$ and $\sqrt{2}$.

$$
\ce{H2O}
$$`)
  })

  test("repairs the legacy display marker form without retaining internal metadata", () => {
    const markdown = String.raw`$$$
\int_a^b f(x)\,dx = F(b) - F(a)$$

$$%__BUDDY_DISPLAY_MATH__
\ce{2H2 + O2 -> 2H2O}$$`

    const prepared = prepareMarkdownForMdxEditor(markdown)
    expect(prepared).toBe(String.raw`$$
\int_a^b f(x)\,dx = F(b) - F(a)
$$

$$
\ce{2H2 + O2 -> 2H2O}
$$`)
    expect(prepared).not.toContain("__BUDDY_DISPLAY_MATH__")
  })

  test("protects currency while leaving code math byte-for-byte unchanged", () => {
    const markdown = [
      "The price is $2.50 and then $3.00 today.",
      "",
      "`$inline$`",
      "",
      "```",
      "$fenced$",
      "```",
    ].join("\n")

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(
      [
        "The price is \\$2.50 and then $3.00 today.",
        "",
        "`$inline$`",
        "",
        "```",
        "$fenced$",
        "```",
      ].join("\n"),
    )
  })

  test("converts HTML comments to MDX comments without rewriting code examples", () => {
    const mdx = [
      "<svg>",
      "  <!-- axes -->",
      '  <line x1="0" x2="10" />',
      "</svg>",
      "",
      "```html",
      "<!-- example -->",
      "```",
    ].join("\n")

    expect(prepareMdxForMdxEditor(mdx)).toBe(
      [
        "<svg>",
        "  {/* axes */}",
        '  <line x1="0" x2="10" />',
        "</svg>",
        "",
        "```html",
        "<!-- example -->",
        "```",
      ].join("\n"),
    )
  })
})
