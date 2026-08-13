import { describe, expect, test } from "bun:test"
import { sanitizeMarkdownHtml } from "../src/components/markdown/markdown-html-segment"
import {
  parseMarkdownToHtml,
  projectMarkdownBlocks,
  streamBlocks,
} from "../src/components/markdown/markdown-parser"

describe("markdown parser", () => {
  test("renders external links like OpenCode", async () => {
    const html = await parseMarkdownToHtml("[OpenCode](https://github.com/sst/opencode)")

    expect(html).toContain('class="external-link"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  test("keeps workspace-relative links in-app", async () => {
    const html = await parseMarkdownToHtml("[Notes](./artifacts/notes.md)")

    expect(html).toContain('<a href="./artifacts/notes.md">Notes</a>')
    expect(html).not.toContain('class="external-link"')
    expect(html).not.toContain('target="_blank"')
  })

  test("renders fenced code blocks with shiki", async () => {
    const html = await parseMarkdownToHtml("```ts\nconst x = 1\n```")

    expect(html).toContain("shiki")
    expect(html).toContain("var(--color-text-base)")
    expect(html).toContain("const")
  })

  test("renders inline, display, bracket, and environment math from raw markdown", async () => {
    const html = await parseMarkdownToHtml(String.raw`
$E = mc^2$
$$\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
\[\begin{matrix} a & b \\ c & d \end{matrix}\]
\begin{align} a&=b\\ c&=d \end{align}
\(\text{$100$}\)
`)

    expect(html.match(/class="katex(?:\s|")/gu)?.length).toBe(5)
    expect(html).not.toContain("katex-error")
  })

  test("renders chemistry notation with mhchem", async () => {
    const html = await parseMarkdownToHtml(String.raw`$\ce{CH3Br + OH- -> CH3OH + Br-}$`)

    expect(html).toContain('class="katex"')
    expect(html).not.toContain("katex-error")
    expect(html).toContain("CH")
  })

  test("renders inline math when models pad single-dollar delimiters with spaces", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$ \left(\frac{\partial^2}{\partial x^2} + \frac{\partial^2}{\partial y^2}\right) \phi = 0 $`,
    )

    expect(html).toContain('class="katex"')
    expect(html).not.toContain("katex-error")
    expect(html).toContain("partial")
  })

  test("renders spaced inline chemistry notation with mhchem", async () => {
    const html = await parseMarkdownToHtml(String.raw`$ \ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O} $`)

    expect(html).toContain('class="katex"')
    expect(html).not.toContain("katex-error")
    expect(html).toContain("<svg")
  })

  test("renders chemistry notation with common unescaped percent text", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$$\ce{RC(O)R' ->[BH3\text{–}THF][CBS catalyst] >99% ee}$$`,
    )

    expect(html).toContain("katex-display")
    expect(html).not.toContain("katex-error")
    expect(html).toContain("99")
  })

  test("preserves KaTeX chemistry arrows through sanitization", async () => {
    const html = sanitizeMarkdownHtml(
      await parseMarkdownToHtml(String.raw`$$\ce{CH3-CH=CH2 + HBr -> CH3-CHBr-CH3}$$`),
    )

    expect(html).toContain("<svg")
    expect(html).toContain("<path")
    expect(html).not.toContain("katex-error")
  })

  test("renders same-line display math as a block token", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$`,
    )

    expect(html.trim().startsWith('<span class="katex-display"')).toBe(true)
    expect(html).not.toContain("<p>")
    expect(html).not.toContain("katex-error")
  })

  test("does not render math inside code spans or fenced code blocks", async () => {
    const html = await parseMarkdownToHtml("`$x$`\n\n```txt\n$x$\n```")

    expect(html).not.toContain('class="katex"')
    expect(html).toContain("<code>$x$</code>")
    expect(html).toContain("$x$")
  })

  test("does not treat ordinary currency text as math", async () => {
    const html = await parseMarkdownToHtml("The price is $2.50 and then $3.00 today.")

    expect(html).not.toContain('class="katex"')
    expect(html).toContain("$2.50 and then $3.00")
  })

  test("does not render escaped dollar delimiters", async () => {
    const html = await parseMarkdownToHtml(String.raw`This is literal \$x$ but this is math $y$.`)

    expect(html.match(/class="katex(?:\s|")/gu)?.length).toBe(1)
    expect(html).toContain("$x$")
  })

  test("keeps unsupported latex visible without throwing", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$\begin{multline} a + b + c \\ = d + e + f \end{multline}$`,
    )

    expect(html).toContain("katex-error")
    expect(html).toContain("multline")
  })

  test("uses a placeholder for transient latex errors while streaming", async () => {
    const markdown = String.raw`$\begin{multline} a + b + c \\ = d + e + f \end{multline}$`
    const html = await parseMarkdownToHtml(markdown, true, "streaming-latex-error")

    expect(html).not.toContain("katex-error")
    expect(html).toContain('data-component="markdown-math-placeholder"')
    expect(html).toContain('data-display="inline"')
    expect(html).not.toContain("\\begin{multline}")
  })

  test("still renders valid latex while streaming", async () => {
    const html = await parseMarkdownToHtml(String.raw`$E = mc^2$`, true, "streaming-valid-latex")

    expect(html).toContain('class="katex"')
    expect(html).not.toContain("katex-error")
  })

  test("uses a fixed block placeholder for invalid display math while streaming", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$$\begin{multline} a + b + c \\ = d + e + f \end{multline}$$`,
      true,
      "streaming-display-latex-error",
    )

    expect(html).not.toContain("katex-error")
    expect(html).toContain('data-component="markdown-math-placeholder"')
    expect(html).toContain('data-display="block"')
    expect(html.match(/data-slot="math-placeholder-line"/gu)?.length).toBe(2)
    expect(html).not.toContain("\\begin{multline}")
  })

  test("uses a fixed block placeholder for incomplete display math while streaming", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$$ Q(\mathbf{x}) = \mathbf{x}^T \mathbf{A} \mathbf{x}`,
      true,
      "streaming-incomplete-display-latex",
    )

    expect(html).toContain('data-component="markdown-math-placeholder"')
    expect(html).toContain('data-display="block"')
    expect(html).not.toContain("Q(")
  })

  test("keeps final incomplete display math visible instead of hiding model output", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$$ Q(\mathbf{x}) = \mathbf{x}^T \mathbf{A} \mathbf{x}`,
    )

    expect(html).not.toContain("markdown-math-placeholder")
    expect(html).toContain("$$ Q")
  })

  test("renders display-only environments even when models wrap them in single dollars", async () => {
    const html = await parseMarkdownToHtml(String.raw`$\begin{gather} a = b \\ c = d \end{gather}$`)

    expect(html).toContain("katex-display")
    expect(html).not.toContain("katex-error")
  })

  test("projects completed streaming blocks separately from the live tail", () => {
    const blocks = streamBlocks(
      ["First paragraph.", "", "Second paragraph.", "", "Incomplete [link"].join("\n"),
      true,
    )

    expect(blocks.map((block) => block.mode)).toEqual(["full", "full", "live"])
    expect(blocks[0]?.raw).toBe("First paragraph.\n\n")
    expect(blocks[1]?.raw).toBe("Second paragraph.\n\n")
    expect(blocks[2]?.src).toContain("Incomplete")
  })

  test("keeps stable content separate from an open streaming math tail", () => {
    const blocks = streamBlocks(["Stable paragraph.", "", "$$ x^2"].join("\n"), true)

    expect(blocks.map((block) => block.mode)).toEqual(["full", "live"])
    expect(blocks[0]?.raw).toBe("Stable paragraph.\n\n")
    expect(blocks[1]?.src).toContain("$$ x^2")
  })

  test("projects code fences as dedicated streaming blocks", () => {
    expect(streamBlocks("before\n\n```ts\nconst x = 1", true)).toEqual([
      { raw: "before\n\n", src: "before\n\n", mode: "full" },
      {
        raw: "```ts\nconst x = 1",
        src: "const x = 1",
        mode: "code",
        language: "ts",
      },
    ])
  })

  test("keeps completed code fences in dedicated blocks", () => {
    expect(streamBlocks("```ts\nconst x = 1\n```\n\nafter", true)).toEqual([
      {
        raw: "```ts\nconst x = 1\n```\n\n",
        src: "const x = 1",
        mode: "code",
        language: "ts",
        complete: true,
      },
      { raw: "after", src: "after", mode: "live" },
    ])
  })

  test("appends open code deltas without reprojecting frozen blocks", () => {
    const previous = projectMarkdownBlocks(undefined, "# Plan\n\n```ts\nconst one = 1\n", true)
    const next = projectMarkdownBlocks(previous, `${previous.text}const two = 2\n`, true)

    expect(next.blocks[0]).toBe(previous.blocks[0])
    expect(next.blocks.at(-1)).toEqual({
      raw: "```ts\nconst one = 1\nconst two = 2\n",
      // The trailing newline is an uncommitted line: rendering it makes the open
      // block taller than the completed one will be.
      src: "const one = 1\nconst two = 2",
      mode: "code",
      language: "ts",
    })
  })

  test("closes code fences split across provider deltas", () => {
    const open = projectMarkdownBlocks(undefined, "```ts\nconst x = 1\n", true)
    const one = projectMarkdownBlocks(open, `${open.text}\``, true)
    const two = projectMarkdownBlocks(one, `${one.text}\``, true)
    const closed = projectMarkdownBlocks(two, `${two.text}\``, true)

    expect(closed.blocks.at(-1)).toEqual({
      raw: "```ts\nconst x = 1\n```",
      src: "const x = 1",
      mode: "code",
      language: "ts",
      complete: true,
    })
  })

  test("keeps a partial closing fence out of the open block's rendered source", () => {
    const open = projectMarkdownBlocks(undefined, "```ts\nconst x = 1\n", true)
    const one = projectMarkdownBlocks(open, `${open.text}\``, true)
    const two = projectMarkdownBlocks(one, `${one.text}\``, true)

    expect(open.blocks.at(-1)?.src).toBe("const x = 1")
    expect(one.blocks.at(-1)?.src).toBe("const x = 1")
    expect(two.blocks.at(-1)?.src).toBe("const x = 1")
  })

  test("never shrinks a streaming projection's line count", () => {
    const text = [
      "Prose before the block.",
      "",
      "```kotlin",
      "fun addOne(value: Int): Int {",
      "    return value + 1",
      "}",
      "```",
      "",
      "Prose after the block.",
    ].join("\n")

    const shrinks: { at: number; delta: number }[] = []
    let projection = projectMarkdownBlocks(undefined, text.slice(0, 1), true)
    let previousLines = projection.blocks.reduce(
      (total, block) => total + block.src.split("\n").length,
      0,
    )

    for (let length = 2; length <= text.length; length += 1) {
      projection = projectMarkdownBlocks(projection, text.slice(0, length), true)
      const lines = projection.blocks.reduce(
        (total, block) => total + block.src.split("\n").length,
        0,
      )
      if (lines < previousLines) shrinks.push({ at: length, delta: lines - previousLines })
      previousLines = lines
    }

    // A shrink is a visible upward jolt: content already painted is removed and
    // everything below it moves. Streaming may only add lines.
    expect(shrinks).toEqual([])
  })

  test("completing a fence does not change the block's line count", () => {
    const body = "```kotlin\nfun addOne(value: Int): Int {\n    return value + 1\n}\n"
    const open = projectMarkdownBlocks(undefined, `${body}\`\``, true)
    const closed = projectMarkdownBlocks(open, `${body}\`\`\``, true)

    const lineCount = (projection: typeof open) =>
      projection.blocks.reduce((total, block) => total + block.src.split("\n").length, 0)

    expect(closed.blocks.at(-1)?.complete).toBe(true)
    expect(lineCount(closed)).toBe(lineCount(open))
  })
})
