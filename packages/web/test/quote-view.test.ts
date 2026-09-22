import { describe, expect, test } from "bun:test"
import type { Citation, CitationSource } from "@buddy/citation-contract"
import { quoteView } from "../src/components/citations/quote-view"

const SELECTOR = { version: 1, start: 0, end: 7, prefix: "", suffix: "" } as const

type TCitationInput = {
  comment?: string
  source: CitationSource
}

function citation(input: TCitationInput): Citation {
  return { schemaVersion: 1, id: "citation_1", excerpt: "Excerpt", ...input }
}

describe("quote view", () => {
  test("labels a document quote with its file name and keeps its comment", () => {
    const view = quoteView({
      text: "Excerpt",
      source: "markdown",
      citation: citation({
        comment: "  from the md file  ",
        source: { kind: "document", path: "notes/2026/basic-demo.md", selector: SELECTOR },
      }),
    })

    expect(view).toMatchObject({
      kind: "document",
      excerpt: "Excerpt",
      label: "basic-demo.md",
      path: "notes/2026/basic-demo.md",
      comment: "from the md file",
    })
  })

  test("labels a chat quote as Chat with no path", () => {
    const view = quoteView({
      text: "Excerpt",
      source: "message",
      citation: citation({
        source: {
          kind: "chat",
          sessionID: "ses_1",
          messageID: "msg_1",
          partID: "prt_1",
          selector: SELECTOR,
        },
      }),
    })

    expect(view.kind).toBe("chat")
    expect(view.label).toBe("Chat")
    expect(view.path).toBeUndefined()
    expect(view.comment).toBeUndefined()
  })

  test("labels a web quote with its page title, then its host", () => {
    const source = {
      kind: "web" as const,
      url: "https://en.wikipedia.org/wiki/Photosynthesis",
      selector: SELECTOR,
    }
    const titled = quoteView({
      text: "Excerpt",
      source: "web",
      citation: { ...citation({ source }), presentation: { title: "Photosynthesis" } },
    })
    expect(titled).toMatchObject({ kind: "web", label: "Photosynthesis" })
    expect(titled.path).toBeUndefined()

    expect(
      quoteView({ text: "Excerpt", source: "web", citation: citation({ source }) }).label,
    ).toBe("en.wikipedia.org")
  })

  test("labels a whole-message note quote as a quoted message", () => {
    const view = quoteView({ text: "kill the server it started", source: "message" })

    expect(view).toEqual({
      kind: "message",
      excerpt: "kill the server it started",
      label: "Quoted message",
    })
  })

  test("labels a legacy Markdown selection by its path", () => {
    const view = quoteView({ text: "Bold text", source: "markdown", path: "notes/basic-demo.md" })

    expect(view.kind).toBe("document")
    expect(view.label).toBe("basic-demo.md")
  })
})
