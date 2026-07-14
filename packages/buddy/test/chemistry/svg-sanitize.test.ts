import { describe, expect, test } from "bun:test"
import {
  CHEMISTRY_SVG_MAX_DEPTH,
  CHEMISTRY_SVG_MAX_INPUT_BYTES,
  sanitizeChemistrySvg,
} from "../../src/chemistry/svg-sanitize"

describe("chemistry SVG sanitizer", () => {
  test("preserves renderer geometry and valid same-document references", () => {
    const sanitized = sanitizeChemistrySvg(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="20" viewBox="0 0 20 10"><defs><path id="glyph" d="M0 0h1"/></defs><g stroke="#000"><use xlink:href="#glyph" x="2"/><text font-family="cmr10">C &amp; H</text></g></svg>',
    )

    expect(sanitized).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(sanitized).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"')
    expect(sanitized).toContain('xlink:href="#glyph"')
    expect(sanitized).toContain("C &amp; H")
  })

  test("removes executable subtrees, event/style attributes, and external references", () => {
    const sanitized = sanitizeChemistrySvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT><path d="bad"/></SCRIPT><a><animate attributeName="href" values="javascript:alert(1)"/><text>bad</text></a><path d="good" onclick="alert(1)" style="fill:url(javascript:alert(1))"/><use href="&#x68;ttps://example.test/glyph"/><use href="#missing"/></svg>',
    )

    expect(sanitized).not.toContain("SCRIPT")
    expect(sanitized).not.toContain("animate")
    expect(sanitized).not.toContain("onclick")
    expect(sanitized).not.toContain("style=")
    expect(sanitized).not.toContain("javascript")
    expect(sanitized).not.toContain("https")
    expect(sanitized).not.toContain("#missing")
    expect(sanitized).toContain('d="good"')
  })

  test("rejects XML directives, processing instructions, duplicate ids, and malformed roots", () => {
    expect(() =>
      sanitizeChemistrySvg('<!DOCTYPE svg [<!ENTITY x "value">]><svg><text>&x;</text></svg>'),
    ).toThrow("XML document directive")
    expect(() => sanitizeChemistrySvg("<svg><?target value?></svg>")).toThrow(
      "processing instruction",
    )
    expect(() => sanitizeChemistrySvg('<svg><path id="same"/><path id="same"/></svg>')).toThrow(
      "invalid or duplicate id",
    )
    expect(() => sanitizeChemistrySvg("<svg/><svg/>")).toThrow()
  })

  test("rejects oversized and excessively nested documents before serialization", () => {
    expect(() =>
      sanitizeChemistrySvg(`<svg><!--${"x".repeat(CHEMISTRY_SVG_MAX_INPUT_BYTES)}--></svg>`),
    ).toThrow("input size limit")

    const nested = `${"<g>".repeat(CHEMISTRY_SVG_MAX_DEPTH)}<path/>${"</g>".repeat(
      CHEMISTRY_SVG_MAX_DEPTH,
    )}`
    expect(() => sanitizeChemistrySvg(`<svg>${nested}</svg>`)).toThrow("nested too deeply")
  })
})
