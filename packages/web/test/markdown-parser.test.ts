import { describe, expect, test } from "bun:test"
import { parseMarkdownToHtml } from "../src/lib/markdown-parser"

describe("markdown parser", () => {
  test("renders external links like OpenCode", async () => {
    const html = await parseMarkdownToHtml("[OpenCode](https://github.com/sst/opencode)")

    expect(html).toContain('class="external-link"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  test("renders fenced code blocks with shiki", async () => {
    const html = await parseMarkdownToHtml("```ts\nconst x = 1\n```")

    expect(html).toContain("shiki")
    expect(html).toContain("const")
  })
})
