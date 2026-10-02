import { describe, expect, test } from "bun:test"
import {
  prepareMarkdownForMdxEditor,
  prepareMdxForMdxEditor,
  restoreMarkdownFromMdxEditor,
  restoreMdxFromMdxEditor,
} from "../src/components/bench/markdown/compatibility"
import {
  RAW_HTML_BLOCK_LANGUAGE,
  rawHtmlInlineCarrier,
} from "../src/components/bench/markdown/plugins/raw-html-carrier"

function rawHtmlBlock(lines: string[], prefix = "", info = RAW_HTML_BLOCK_LANGUAGE): string[] {
  return [`\`\`\`${info}`, ...lines.map((line) => `${prefix}${line}`), `${prefix}\`\`\``]
}

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

  test("carries raw HTML blocks verbatim around ordinary Markdown and resource links", () => {
    const markdown = [
      "<details>",
      "<summary>Open</summary>",
      "",
      "[OpenAI](https://openai.com)",
      "",
      "</details>",
    ].join("\n")

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(
      [
        ...rawHtmlBlock(["<details>", "<summary>Open</summary>"]),
        "",
        "[OpenAI](https://openai.com)",
        "",
        ...rawHtmlBlock(["</details>"]),
      ].join("\n"),
    )
  })

  test.each([
    ["an unquoted image", "<img src=a.png width=200>", rawHtmlBlock(["<img src=a.png width=200>"])],
    [
      "a centred image",
      '<p align="center">\n  <img src="a.png" />\n</p>',
      rawHtmlBlock(['<p align="center">', '  <img src="a.png" />', "</p>"]),
    ],
    [
      "a block inside a list item",
      "- <div>x</div>\n- b",
      ["- ```" + RAW_HTML_BLOCK_LANGUAGE, "  <div>x</div>", "  ```", "- b"],
    ],
    [
      "a block inside a blockquote",
      '> <p align="center">\n>   <img src="a.png">\n> </p>',
      [
        "> ```" + RAW_HTML_BLOCK_LANGUAGE,
        '> <p align="center">',
        '>   <img src="a.png">',
        "> </p>",
        "> ```",
      ],
    ],
    [
      "a block right after a paragraph",
      "Intro\n<div>x</div>",
      ["Intro", ...rawHtmlBlock(["<div>x</div>"], "", `${RAW_HTML_BLOCK_LANGUAGE} tight`)],
    ],
    [
      "a block holding backticks",
      "<pre>\n```\n</pre>",
      ["````" + RAW_HTML_BLOCK_LANGUAGE, "<pre>", "```", "</pre>", "````"],
    ],
  ])("carries %s as a raw HTML block", (_, markdown, expected) => {
    expect(prepareMarkdownForMdxEditor(markdown)).toBe(expected.join("\n"))
  })

  test("carries void inline tags and leaves other inline HTML to the editor", () => {
    expect(prepareMarkdownForMdxEditor("a<br>b <img src=x> <b>c</b>")).toBe(
      `a${rawHtmlInlineCarrier("<br>")}b ${rawHtmlInlineCarrier("<img src=x>")} <b>c</b>`,
    )
  })

  test("ends a raw HTML block at a directive fence", () => {
    expect(prepareMarkdownForMdxEditor(":::tip\n<div>x</div>\n:::")).toBe(
      [":::tip", ...rawHtmlBlock(["<div>x</div>"]), ":::"].join("\n"),
    )
  })

  test("leaves angle placeholders that are not HTML tags out of raw HTML blocks", () => {
    const prepared = prepareMarkdownForMdxEditor("<overarching flow: how it flows.>\n\n<T>")

    expect(prepared).not.toContain(RAW_HTML_BLOCK_LANGUAGE)
    expect(restoreMarkdownFromMdxEditor(prepared)).toBe("<overarching flow: how it flows.>\n\n<T>")
  })

  test("escapes inline tags whose attributes MDX cannot parse", () => {
    const markdown = "Inline <span class=x>hi</span> here"
    const prepared = prepareMarkdownForMdxEditor(markdown)

    expect(prepared.replaceAll("\u2060", "")).toBe("Inline \\<span class=x>hi\\</span> here")
    expect(restoreMarkdownFromMdxEditor(prepared)).toBe(markdown)
  })

  test("protects prose placeholders from MDX tag parsing", () => {
    const markdown = [
      "## Argument #_n_: <detailed argument>",
      "## Conclusion: <conclusion>",
      "    1. <premise> [explicit/implicit]",
      "* Type: <type>:<reasoning>",
      "* Notes: <hidden assumptions, ambiguities, possible counterexamples>",
      "* Strength: <...>",
    ].join("\n")
    const prepared = prepareMarkdownForMdxEditor(markdown)
    const visiblePrepared = prepared.replaceAll("\u2060", "")

    expect(visiblePrepared).toContain("\\<detailed argument>")
    expect(visiblePrepared).toContain("\\<...>")
    expect(restoreMarkdownFromMdxEditor(prepared)).toBe(
      markdown.replace(
        "    1. <premise> [explicit/implicit]",
        "```\n1. <premise> [explicit/implicit]\n```",
      ),
    )
  })

  test("preserves authored angle escapes separately from inserted parser escapes", () => {
    const markdown = "Literal \\<widget> and generated <premise>."
    const prepared = prepareMarkdownForMdxEditor(markdown)

    expect(prepared).toContain("Literal \\<widget>")
    expect(restoreMarkdownFromMdxEditor(prepared)).toBe(markdown)
  })

  test("preserves authored angle entities while restoring marked placeholders", () => {
    const markdown = "Literal &lt;T&gt; and &lt;widget&gt;."

    expect(restoreMarkdownFromMdxEditor(markdown)).toBe(markdown)
    expect(restoreMarkdownFromMdxEditor(`Generated \u2060&lt;premise&gt;.`)).toBe(
      "Generated <premise>.",
    )
  })

  test("fences indented template lines so MDX does not parse their placeholders as JSX", () => {
    const markdown = ["## Premises:", "    1. <premise> [explicit/implicit]"].join("\n")
    expect(prepareMarkdownForMdxEditor(markdown)).toBe(
      ["## Premises:", "```", "1. <premise> [explicit/implicit]", "```"].join("\n"),
    )
  })

  test.each([
    ["at the top level", "Text\n\n    a <b>\n    [c]: /d", "Text\n\n```\na <b>\n[c]: /d\n```"],
    [
      "in a list item",
      "- item\n\n      $x$ \\y\n\n      # z",
      "- item\n\n  ```\n  $x$ \\y\n\n  # z\n  ```",
    ],
    ["in a blockquote", ">     a\n>     b", "> ```\n> a\n> b\n> ```"],
    ["with backticks", "    a ``` b ```` c", "`````\na ``` b ```` c\n`````"],
  ])("fences indented code %s", (_, markdown, expected) => {
    expect(prepareMarkdownForMdxEditor(markdown)).toBe(expected)
  })

  test("leaves fenced code and MDX indented lines alone", () => {
    const markdown = "```\n    a <b>\n```\n\n~~~\n    c\n~~~"

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(markdown)
    expect(prepareMdxForMdxEditor("Text\n\n    not code")).toBe("Text\n\n    not code")
  })

  test("keeps fenced code and references after a callout title with an emoji", () => {
    const markdown = [
      "> [!quote]+ Costs $5 😀 𝑥",
      "> See [ref].",
      ">",
      "> ```python",
      "> snake_case = 1",
      "> ```",
      "",
      "[ref]: https://example.com",
    ].join("\n")

    expect(prepareMarkdownForMdxEditor(markdown).replaceAll("\u2060", "")).toBe(
      [
        ':::obsidian-callout{kind="quote" fold="+" title="Costs $5 😀 𝑥"}',
        "See [ref](https://example.com).",
        "",
        "```python",
        "snake_case = 1",
        "```",
        ":::",
        "",
        "\\[ref]: https://example.com",
      ].join("\n"),
    )
  })

  test("protects malformed and example angle syntax while preserving the source", () => {
    const markdown = [
      "Give <9000 negative sum.",
      "Endpoint <>:3000.",
      "A typo can be m<ore disruptive than expected.",
      "New subject <ownership is with teacher",
      "Literal HTML example: <input>",
    ].join("\n")
    const prepared = prepareMarkdownForMdxEditor(markdown)
    const visiblePrepared = prepared.replaceAll("\u2060", "")

    expect(visiblePrepared).toContain("\\<9000")
    expect(visiblePrepared).toContain("\\<>:3000")
    expect(visiblePrepared).toContain("m\\<ore")
    expect(visiblePrepared).toContain("\\<input>")
    expect(restoreMarkdownFromMdxEditor(prepared)).toBe(markdown)
  })

  test("carries an HTML block that opens a list item, as CommonMark reads it", () => {
    const markdown = ["- <ul>", "  - <li>Applesauce</li>", "  - </ul>"].join("\n")

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(
      [
        "- ```" + RAW_HTML_BLOCK_LANGUAGE,
        "  <ul>",
        "  - <li>Applesauce</li>",
        "  - </ul>",
        "  ```",
      ].join("\n"),
    )
  })

  test("keeps standard HTML and MDX component tags executable", () => {
    expect(prepareMarkdownForMdxEditor("Text <details><summary>Open</summary></details>")).toBe(
      "Text <details><summary>Open</summary></details>",
    )
    expect(prepareMdxForMdxEditor("<ArgumentCard>Reason</ArgumentCard>")).toBe(
      "<ArgumentCard>Reason</ArgumentCard>",
    )
  })

  test("normalizes Buddy inline and display math for the editor parser", () => {
    const markdown = String.raw`Inline \(E = mc^2\) and $\sqrt{2}$.

\[\ce{H2O}\]`

    expect(prepareMarkdownForMdxEditor(markdown)).toBe(String.raw`Inline $E = mc^2$ and $\sqrt{2}$.

$$
\ce{H2O}
$$`)
  })

  test.each([
    ["- item\n\n  $$\n  x = 1\n  $$", "- item\n\n  $$\n  x = 1\n  $$"],
    ["- $$\n  x = 1\n  $$", "- $$\n  x = 1\n  $$"],
    ["> $$\n> x = 1\n> $$", "> $$\n> x = 1\n> $$"],
    ["Text $$x$$ inline.", "Text $$x$$ inline."],
    ["- $$y = 1$$", "- $$\n  y = 1\n  $$"],
    ["> - $$y$$", "> - $$\n>   y\n>   $$"],
    ["- item\n\n  \\[x\\]", "- item\n\n  $$\n  x\n  $$"],
    ["Text\n$$x$$ more", "Text\n$$x$$ more"],
  ])("keeps display math %j inside its container", (markdown, expected) => {
    expect(prepareMarkdownForMdxEditor(markdown)).toBe(expected)
  })

  test.each([
    ["$$a$$ then text", "$$a$$ then text"],
    ["- $$a$$ then text", "- $$a$$ then text"],
    ["> $$a$$ then text", "> $$a$$ then text"],
    ["Text $$a\nb$$ more", "Text $$a\nb$$ more"],
    ["> Text $$a\n> b$$ more", "> Text $$a\n> b$$ more"],
    ["- Text $$a\n  b$$ more", "- Text $$a\n  b$$ more"],
    ["$$a\nb$$ more", "$a\nb$ more"],
    ["Text $$a\n$$ more", "Text $a$ more"],
  ])(
    "leaves inline double-dollar math %j to the math plugin unless it would open a block",
    (markdown, expected) => {
      expect(prepareMarkdownForMdxEditor(markdown)).toBe(expected)
      expect(prepareMdxForMdxEditor(markdown)).toBe(expected)
    },
  )

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
        "The price is \\$2.50 and then \\$3.00 today.",
        "",
        "`$inline$`",
        "",
        "```",
        "$fenced$",
        "```",
      ].join("\n"),
    )
  })

  test("keeps MDX HTML comments as marked text without rewriting code examples", () => {
    const mdx = [
      "<svg>",
      "  <!-- axes -->",
      '  <line x1="0" x2="10" />',
      "</svg>",
      "",
      "Text <!-- {note} */ --> here.",
      "",
      "```html",
      "<!-- example -->",
      "```",
    ].join("\n")
    const prepared = prepareMdxForMdxEditor(mdx)

    expect(prepared.replaceAll("\u2060", "")).toBe(
      [
        "<svg>",
        "  \\<\\!\\-\\- axes \\-\\-\\>",
        '  <line x1="0" x2="10" />',
        "</svg>",
        "",
        "Text \\<\\!\\-\\- \\{note\\} \\*\\/ \\-\\-\\> here.",
        "",
        "```html",
        "<!-- example -->",
        "```",
      ].join("\n"),
    )
    expect(prepared).not.toContain("{/*")
    expect(restoreMdxFromMdxEditor(prepared)).toBe(mdx)
  })
})
