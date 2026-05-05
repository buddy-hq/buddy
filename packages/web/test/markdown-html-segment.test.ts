import { describe, expect, test } from "bun:test"
import { sanitizeRawMarkdownFallback } from "../src/components/markdown/markdown-html-segment"

describe("markdown html segment", () => {
  test("sanitizes raw markdown fallback text when parsing fails", () => {
    const html = sanitizeRawMarkdownFallback("<script>alert(1)</script>\nplain text")

    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).toContain("<br>")
    expect(html).toContain("plain text")
  })
})
