import { describe, expect, test } from "bun:test"
import { sanitizeMarkdownHtml } from "../src/components/markdown/markdown-html-segment"
import { parseMarkdownToHtml } from "../src/components/markdown/markdown-parser"

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
    const html = await parseMarkdownToHtml(
      String.raw`$ \ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O} $`,
    )

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
    const html = await parseMarkdownToHtml(String.raw`$$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$`)

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

  test("suppresses transient latex error styling while streaming", async () => {
    const markdown = String.raw`$\begin{multline} a + b + c \\ = d + e + f \end{multline}$`
    const html = await parseMarkdownToHtml(markdown, true, "streaming-latex-error")

    expect(html).not.toContain("katex-error")
    expect(html).toContain("\\begin{multline}")
  })

  test("still renders valid latex while streaming", async () => {
    const html = await parseMarkdownToHtml(String.raw`$E = mc^2$`, true, "streaming-valid-latex")

    expect(html).toContain('class="katex"')
    expect(html).not.toContain("katex-error")
  })

  test("keeps invalid display math stable as raw text while streaming", async () => {
    const html = await parseMarkdownToHtml(
      String.raw`$$\begin{multline} a + b + c \\ = d + e + f \end{multline}$$`,
      true,
      "streaming-display-latex-error",
    )

    expect(html).not.toContain("katex-error")
    expect(html).not.toContain("data-math-pending")
    expect(html).toContain("\\begin{multline}")
  })

  test("renders display-only environments even when models wrap them in single dollars", async () => {
    const html = await parseMarkdownToHtml(String.raw`$\begin{gather} a = b \\ c = d \end{gather}$`)

    expect(html).toContain("katex-display")
    expect(html).not.toContain("katex-error")
  })
})
