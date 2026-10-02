import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { commitNestedEditors } from "./markdown-bench-nested-editors"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { ThemeProvider } from "../src/theme"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

type SavedMarkdownCase = {
  name: string
  markdown: string
  saved?: string
  hasNestedBody?: true
}

const SAVED_MARKDOWN_CASES: SavedMarkdownCase[] = [
  { name: "a block HTML comment", markdown: "before\n\n<!-- a comment -->\n\nafter\n" },
  { name: "an inline HTML comment", markdown: "text <!-- note *x* --> more" },
  {
    name: "a multi-line HTML comment",
    markdown: "before\n\n<!--\nline _one_\n# not heading\n-->\n\nafter",
  },
  {
    name: "a link whose URL has parentheses",
    markdown: "[wiki](https://en.wikipedia.org/wiki/Foo_(bar))",
    saved: "[wiki](https://en.wikipedia.org/wiki/Foo_\\(bar\\))",
  },
  {
    name: "a link whose URL has escaped parentheses",
    markdown: "[wiki](https://en.wikipedia.org/wiki/Foo_\\(bar\\))",
  },
  { name: "escaped brackets in link text", markdown: "[see \\[x\\] here](https://x.com)" },
  { name: "escaped brackets in image text", markdown: "![fig \\[1\\] here](a.png)" },
  {
    name: "a reference link",
    markdown: "See [docs][1].\n\n[1]: https://example.com",
    saved: "See [docs](https://example.com).\n\n[1]: https://example.com",
  },
  {
    name: "reference links inside a callout",
    markdown:
      '> [!note] T\n> See [docs][1] and ![pic][2].\n>\n> [1]: https://example.com "Title"\n> [2]: <a b.png>',
    saved:
      '> [!note] T\n> See [docs](https://example.com "Title") and ![pic](<a b.png>).\n>\n> [1]: https://example.com "Title"\n> [2]: <a b.png>',
    hasNestedBody: true,
  },
  {
    name: "an unused link definition",
    markdown: "Text\n\n[unused]: https://example.com",
    saved: "Text\n\n[unused]: https://example.com",
  },
  {
    name: "a dollar amount before a code block",
    markdown: "Cost is $5.\n\n```sh\necho $HOME\n```\n",
    saved: "Cost is $5.\n\n```sh\necho $HOME\n```\n",
  },
  {
    name: "dollar amounts in separate paragraphs",
    markdown: "Price: $5\n\nSome text.\n\nOther price: $7",
    saved: "Price: $5\n\nSome text.\n\nOther price: $7",
  },
  { name: "dollar amounts in wikilinks", markdown: "See [[Costs $5]] and [[Plan $10]]." },
  {
    name: "a dollar between inline code spans",
    markdown: "Use `$x` and $y then `$z`.",
    saved: "Use `$x` and \\$y then `$z`.",
  },
  {
    name: "Buddy math delimiters",
    markdown: "Inline \\(E = mc^2\\) and $\\sqrt{2}$.\n\n\\[\\ce{H2O}\\]",
    saved: "Inline $E = mc^2$ and $\\sqrt{2}$.\n\n$$\n\\ce{H2O}\n$$",
  },
  { name: "a link with an angle-bracket destination", markdown: "[b](<path with spaces.md>)" },
  { name: "authored escapes between angle brackets", markdown: "a < b \\*not em\\* > c" },
  {
    name: "frontmatter with dollar amounts",
    markdown: "---\ntitle: Cost $5\nprice: $20\n---\n\nBody\n",
  },
  {
    name: "frontmatter with an autolink and escaped parentheses",
    markdown: "---\nurl: <https://example.com>\nre: '\\(x\\)'\n---\n\nBody $5",
    saved: "---\nurl: <https://example.com>\nre: '\\(x\\)'\n---\n\nBody $5",
  },
  {
    name: "a callout title with dollar amounts",
    markdown: "> [!quote]- costs $5 and $10 today\n> body",
    hasNestedBody: true,
  },
  {
    name: "a callout title with an angle placeholder",
    markdown: "> [!note] use <T> generics\n> body",
    hasNestedBody: true,
  },
]

const CALLOUT_SELECTOR = '[data-component="markdown-bench-obsidian-callout"]'

const QUOTED_CHAT_MESSAGE_CASES = [
  {
    name: "a dollar amount",
    markdown:
      "> [!quote]+ It costs $5 today.\n> It costs $5 today.\n>\n> [Open message](buddy://chat/ses_01abc?message=msg_01xyz)",
    saved:
      "> [!quote]+ It costs $5 today.\n> It costs $5 today.\n>\n> [Open message](buddy://chat/ses_01abc?message=msg_01xyz)",
  },
  {
    name: "two dollar amounts",
    markdown:
      "> [!quote]+ It costs $5 and $10 per month\n> It costs $5 and $10 per month\n>\n> [Open message](buddy://chat/ses_01abc?message=msg_01xyz)",
    saved:
      "> [!quote]+ It costs $5 and $10 per month\n> It costs $5 and $10 per month\n>\n> [Open message](buddy://chat/ses_01abc?message=msg_01xyz)",
  },
]

describe("Markdown Bench editor saved output", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createQueryTestRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function mountMarkdown(markdown: string) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const processingErrors: unknown[] = []

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            ref={editorRef}
            markdown={markdown}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-notes"
            documentFormat="markdown"
            path="Saved.md"
            onChange={() => {}}
            onProcessingResult={(result) => {
              if (result.error) processingErrors.push(result.error)
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    return { editorRef, processingErrors }
  }

  for (const savedMarkdownCase of SAVED_MARKDOWN_CASES) {
    test(`keeps ${savedMarkdownCase.name}`, async () => {
      const { editorRef, processingErrors } = await mountMarkdown(savedMarkdownCase.markdown)
      if (savedMarkdownCase.hasNestedBody) await commitNestedEditors(container)

      expect(processingErrors).toEqual([])
      expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
      expect(editorRef.current?.getMarkdown()).toBe(
        savedMarkdownCase.saved ?? savedMarkdownCase.markdown,
      )
    })
  }

  for (const chatCase of QUOTED_CHAT_MESSAGE_CASES) {
    test(`saves a quoted chat message with ${chatCase.name}`, async () => {
      const { editorRef, processingErrors } = await mountMarkdown(chatCase.markdown)
      await commitNestedEditors(container)

      expect(processingErrors).toEqual([])
      expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
      expect(editorRef.current?.getMarkdown()).toBe(chatCase.saved)

      const callouts = container.querySelectorAll(CALLOUT_SELECTOR)
      expect(callouts).toHaveLength(1)
      expect(callouts[0]?.querySelector("[data-display]")).toBeNull()
      expect(callouts[0]?.querySelector("a")?.textContent).toBe("Open message")
    })
  }

  test.each([
    [
      "a footnote definition",
      "> [!quote]+ Title\n> [^1]: Source\n> more",
      "> [!quote]+ Title\n> [^1]: Source\n> more",
    ],
    [
      "a link definition",
      "> [!note] T\n> [x]: https://example.com",
      "> [!note] T\n> [x]: https://example.com",
    ],
  ])(
    "keeps a callout whose body starts with %s after focusing and leaving it",
    async (_, markdown, saved) => {
      const { editorRef, processingErrors } = await mountMarkdown(markdown)
      const body = container.querySelector<HTMLElement>(`${CALLOUT_SELECTOR} [contenteditable]`)
      if (!body) throw new Error("Expected the editable callout body")

      await commitNestedEditors(container)

      expect(processingErrors).toEqual([])
      expect(body.textContent).toContain("]: ")
      expect(editorRef.current?.getMarkdown()).toBe(saved)
    },
  )
})
