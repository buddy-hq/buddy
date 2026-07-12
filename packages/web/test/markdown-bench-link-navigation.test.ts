import { describe, expect, test } from "bun:test"
import { resolveMarkdownBenchLink } from "../src/components/bench/markdown-bench-link-navigation"

describe("Markdown Bench link navigation", () => {
  test("resolves same-document fragments and relative workspace files", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "#Polynomial%20Functions")).toEqual({
      type: "workspace-file",
      path: "Notes/Current.md",
      fragment: "Polynomial Functions",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "../Resources/Guide.pdf")).toEqual({
      type: "workspace-file",
      path: "Resources/Guide.pdf",
    })
  })

  test("keeps external URLs outside workspace navigation", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "https://example.com/guide")).toEqual({
      type: "external",
      url: "https://example.com/guide",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "//example.com/guide")).toEqual({
      type: "external",
      url: "https://example.com/guide",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "mailto:person@example.com")).toEqual({
      type: "external",
      url: "mailto:person@example.com",
    })
    expect(
      resolveMarkdownBenchLink(
        "Notes/Current.md",
        "obsidian://open?vault=Notes&file=Current",
      ),
    ).toEqual({
      type: "external",
      url: "obsidian://open?vault=Notes&file=Current",
    })
  })

  test("rejects unsafe and unsupported external URL schemes", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "file:///etc/passwd")).toBeUndefined()
    expect(resolveMarkdownBenchLink("Notes/Current.md", "javascript:alert(1)")).toBeUndefined()
    expect(resolveMarkdownBenchLink("Notes/Current.md", "custom-protocol:payload")).toBeUndefined()
  })

  test("rejects relative links that escape the notebook", () => {
    expect(resolveMarkdownBenchLink("Current.md", "../Outside.md")).toBeUndefined()
  })
})
