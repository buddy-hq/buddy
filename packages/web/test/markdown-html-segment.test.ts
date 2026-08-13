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

  test("does not paint a trailing line the parsed HTML will not have", () => {
    // The fallback shows for one frame before parsed HTML replaces it. A
    // trailing <br> makes it a line taller, so the block collapses upward.
    expect(sanitizeRawMarkdownFallback("The function returns.\n")).not.toContain("<br>")
    expect(sanitizeRawMarkdownFallback("The function returns.\n\n")).not.toContain("<br>")
    expect(sanitizeRawMarkdownFallback("first\nsecond\n")).toBe("first<br>second")
  })
})
