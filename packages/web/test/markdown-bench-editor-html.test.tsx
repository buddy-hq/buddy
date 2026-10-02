import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { $getRoot, getNearestEditorFromDOMNode } from "lexical"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { ThemeProvider } from "../src/theme"

function createMediaQueryList(matches: boolean): MediaQueryList {
  const mediaQueryList: MediaQueryList = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }
  return mediaQueryList
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

const CONTENT_ROOT_SELECTOR = ".mdxeditor-root-contenteditable [contenteditable]"
const WORD_JOINER = "\u2060"
const RAW_HTML_SELECTOR = '[data-component="markdown-bench-raw-html"]'
const RAW_HTML_SOURCE_SELECTOR = '[data-component="markdown-bench-raw-html-source"]'

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  if (!valueSetter) throw new Error("Expected the textarea value setter")
  valueSetter.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("MarkdownBenchEditor HTML on save", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createQueryTestRoot(container)
    localStorage.clear()
    Object.defineProperty(window, "matchMedia", {
      value: () => createMediaQueryList(false),
      configurable: true,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    document.head.replaceChildren()
  })

  async function mountEditor(markdown: string, documentFormat: MarkdownBenchDocumentFormat) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const changes: string[] = []
    const processingErrors: string[] = []
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
            documentFormat={documentFormat}
            path={documentFormat === "mdx" ? "Index.mdx" : "Index.md"}
            onChange={(next) => changes.push(next)}
            onProcessingResult={(result) => {
              if (result.error) processingErrors.push(result.error)
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })
    return { editorRef, changes, processingErrors }
  }

  async function saved(markdown: string, documentFormat: MarkdownBenchDocumentFormat = "markdown") {
    const { editorRef, processingErrors } = await mountEditor(markdown, documentFormat)
    expect(processingErrors).toEqual([])
    return editorRef.current?.getMarkdown()
  }

  function contentRoot() {
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    if (!element) throw new Error("Expected the editable document")
    return element
  }

  function lexicalEditor() {
    const editor = getNearestEditorFromDOMNode(contentRoot())
    if (!editor) throw new Error("Expected the Lexical editor behind the document")
    return editor
  }

  async function savedAfterAppending(
    markdown: string,
    text: string,
    documentFormat: MarkdownBenchDocumentFormat = "markdown",
  ) {
    const { changes, processingErrors } = await mountEditor(markdown, documentFormat)
    const editor = lexicalEditor()
    await act(async () => {
      editor.update(() => {
        const lastText = $getRoot().getAllTextNodes().at(-1)
        if (!lastText) throw new Error("Expected text in the document")
        lastText.setTextContent(`${lastText.getTextContent()}${text}`)
      })
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  async function savedAfterEditing(markdown: string, from: string, to: string) {
    const { changes, processingErrors } = await mountEditor(markdown, "markdown")
    const editor = lexicalEditor()
    await act(async () => {
      editor.update(() => {
        const textNode = $getRoot()
          .getAllTextNodes()
          .find((candidate) => candidate.getTextContent().includes(from))
        if (!textNode) throw new Error(`Expected text containing "${from}"`)
        textNode.setTextContent(textNode.getTextContent().replace(from, to))
      })
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  describe("MDX comments", () => {
    test.each([
      ["a standalone comment", "<!-- top comment -->\n\nAfter"],
      ["an inline comment", "Text <!-- inline --> here."],
      ["a comment with MDX syntax inside", "<!-- {expression} */ <Tag> -->\n\nAfter"],
      ["a multi-line comment", "<!--\nmulti {line} *x* `y`\n-->\n\nAfter"],
      ["comments in a list item and a quote", "- item <!-- c -->\n\n> <!-- q -->"],
      ["a comment beside a code example", "<!-- real -->\n\n```html\n<!-- example -->\n```"],
    ])("keeps %s byte for byte", async (_, mdx) => {
      const result = await saved(mdx, "mdx")

      expect(result).toBe(mdx)
      expect(result).not.toContain(WORD_JOINER)
    })

    test("shows a comment as text", async () => {
      await mountEditor("Text <!-- note --> here.", "mdx")

      expect(contentRoot().textContent?.replaceAll(WORD_JOINER, "")).toContain(
        "Text <!-- note --> here.",
      )
    })

    test("keeps a comment inside an SVG element without markers", async () => {
      const result = await saved('<svg>\n  <!-- axes -->\n  <line x1="0" x2="10" />\n</svg>', "mdx")

      expect(result).toContain("<!-- axes -->")
      expect(result).not.toContain("{/*")
      expect(result).not.toContain(WORD_JOINER)
    })

    test("keeps comments after an edit", async () => {
      const result = await savedAfterAppending("<!-- note -->\n\nText", " more", "mdx")

      expect(result).toBe("<!-- note -->\n\nText more")
    })
  })

  describe("Markdown HTML blocks", () => {
    test.each([
      ["a wrapper with Markdown between blank lines", "<div>\n\n# Heading\n\n- item\n\n</div>"],
      [
        "details with Markdown between blank lines",
        "<details>\n<summary>Open</summary>\n\n**Bold** and [link](https://x.com)\n\n</details>",
      ],
      ["a centred image", '<p align="center">\n  <img src="a.png" />\n</p>'],
      ["a centred unclosed image", '<p align="center">\n  <img src="a.png" width="200">\n</p>'],
      ["an image with unquoted attributes", "<img src=a.png width=200>"],
      [
        "a table whose cells hold Markdown characters",
        "<table>\n<tr><td>x*y</td><td>a_b [c]</td></tr>\n</table>",
      ],
      ["Markdown that CommonMark leaves raw", "<p>**not bold** and _x_</p>"],
      ["blocks inside list items", '- item\n\n  <img src="a.png" />\n- <div>x</div>'],
      [
        "a block inside a blockquote",
        '> quote\n>\n> <p align="center">\n>   <img src="a.png">\n> </p>',
      ],
      [
        "a block inside a callout",
        '> [!note] Title\n> Body\n>\n> <div align="center">\n> <b>x</b>\n> </div>',
      ],
      ["a block right after a paragraph", 'Intro text\n<p align="center">x</p>\n\nAfter'],
      ["a block right after a heading", "# Title\n<img src=a.png>"],
      ["a block holding blank lines", "<pre>\na *b*\n\nc\n</pre>\n\nText"],
      [
        "an SVG block",
        '<svg width="20" viewBox="0 0 20 20">\n  <circle cx="10" cy="10" r="5" />\n</svg>',
      ],
      ["unsafe markup", "<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>"],
      ["Windows line endings", "<div>\r\n<b>x</b>\r\n</div>\r\n\r\nText\r\n"],
    ])("keeps %s byte for byte", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("renders the Markdown between blank-line-separated tags", async () => {
      await mountEditor("<div>\n\n# Heading\n\n- item\n\n</div>", "markdown")

      expect(contentRoot().querySelector("h1")?.textContent).toBe("Heading")
      expect(contentRoot().querySelector("ul li")?.textContent).toBe("item")
    })

    test("keeps blank-line-separated tags after an edit elsewhere", async () => {
      const markdown = "<details>\n<summary>Open</summary>\n\nBody\n\n</details>"

      expect(await savedAfterEditing(markdown, "Body", "Body more")).toBe(
        "<details>\n<summary>Open</summary>\n\nBody more\n\n</details>",
      )
    })

    test("renders a centred image as an image and keeps the tag after an edit", async () => {
      const markdown = '<p align="center">\n  <img src="a.png" />\n</p>\n\nText'
      await mountEditor(markdown, "markdown")

      const image = contentRoot().querySelector(`${RAW_HTML_SELECTOR} p[align="center"] img`)
      expect(image?.getAttribute("src")).toContain("/api/file/raw/a.png")
      expect(await savedAfterAppending(markdown, " more")).toBe(
        '<p align="center">\n  <img src="a.png" />\n</p>\n\nText more',
      )
    })

    test("renders an image with unquoted attributes", async () => {
      await mountEditor("<img src=a.png width=200>", "markdown")

      const image = contentRoot().querySelector(`${RAW_HTML_SELECTOR} img`)
      expect(image?.getAttribute("src")).toContain("/api/file/raw/a.png")
      expect(image?.getAttribute("width")).toBe("200")
    })

    test("leaves Markdown inside a raw HTML block unrendered, as CommonMark does", async () => {
      await mountEditor("<p>**not bold**</p>", "markdown")

      const block = contentRoot().querySelector(RAW_HTML_SELECTOR)
      expect(block?.querySelector("strong")).toBeNull()
      expect(block?.textContent).toBe("**not bold**")
    })

    test("drops unsafe elements and attributes from the preview", async () => {
      await mountEditor(
        '<img src=x onerror=alert(1)>\n\n<div onclick="alert(1)">t<script>alert(1)</script></div>',
        "markdown",
      )

      expect(contentRoot().querySelector("img")?.getAttribute("onerror")).toBeNull()
      expect(contentRoot().querySelector("script")).toBeNull()
      expect(
        contentRoot().querySelector(`${RAW_HTML_SELECTOR} div`)?.getAttribute("onclick"),
      ).toBeNull()
    })

    test("shows the source of a lone tag that renders nothing", async () => {
      await mountEditor("<div>\n\nText\n\n</div>", "markdown")

      const blocks = Array.from(
        contentRoot().querySelectorAll(RAW_HTML_SELECTOR),
        (block) => block.textContent,
      )
      expect(blocks).toEqual(["<div>", "</div>"])
    })

    test("renders an SVG block with the shared SVG allowlist", async () => {
      await mountEditor(
        '<svg viewBox="0 0 20 20">\n  <circle cx="10" cy="10" r="5" />\n</svg>',
        "markdown",
      )

      expect(
        contentRoot().querySelector('svg[data-component="markdown-bench-mdx-svg"] circle'),
      ).not.toBeNull()
    })

    test("saves an edited HTML block source", async () => {
      const { changes } = await mountEditor('<p align="center">x</p>\n\nText', "markdown")
      const preview = contentRoot()
        .querySelector(RAW_HTML_SELECTOR)
        ?.closest<HTMLElement>('[role="button"]')
      if (!preview) throw new Error("Expected the editable HTML preview")

      await act(async () => {
        preview.click()
        await flushEffects()
      })
      const textarea = container.querySelector<HTMLTextAreaElement>(RAW_HTML_SOURCE_SELECTOR)
      if (!textarea) throw new Error("Expected the HTML source editor")
      expect(textarea.value).toBe('<p align="center">x</p>')
      await act(async () => {
        setTextareaValue(textarea, '<p align="center">y</p>')
        await flushEffects()
      })

      expect(changes.at(-1)).toBe('<p align="center">y</p>\n\nText')
    })
  })

  describe("Markdown inline HTML", () => {
    test.each([
      ["a line break tag", "Line one<br>Line two"],
      ["self-closing line breaks", "Line one<br/>Line two<br />three"],
      ["an inline image", 'Before <img src="particle.png" alt="Particle *model* > state"> after.'],
      ["a multi-line inline image", 'Before <img\n  src="particle.png"\n  width=80> after.'],
      [
        "a multi-line image inside a quote",
        '> Before <img\n>   src="particle.png"\n>   width=80> after.',
      ],
      [
        "a multi-line image inside a list",
        '- Before <img\n    src="particle.png"\n    width=80> after.',
      ],
      ["an image after a soft line break", 'Line two\n<img src="a.png">'],
      ["an image after a hard line break", 'Line two\\\n<img src="a.png"> after'],
      [
        "images inside links",
        '[<img src="badge.svg">](https://x.com) and <a href="https://y.com"><img src="b.svg"></a>',
      ],
      ["tags inside a callout", '> [!tip] T\n> Line<br>two\n> <img src="a.png">'],
      ["standard inline tags", "Text <b>bold</b> and <kbd>Ctrl</kbd>"],
      ["a tag whose attributes MDX cannot parse", "Inline <span class=x>hi</span> here"],
      ["an uppercase tag", "Text <B>bold</B> here"],
      ["a custom element", "Text <my-el>x</my-el> here"],
      ["an SVG shape outside an SVG", 'Text <circle r="1" /> here'],
    ])("keeps %s byte for byte", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("renders a line break tag as a line break", async () => {
      await mountEditor("Line one<br>Line two", "markdown")

      expect(contentRoot().querySelector(`p ${RAW_HTML_SELECTOR} br`)).not.toBeNull()
    })

    test("renders an inline image tag as an image", async () => {
      await mountEditor('Before <img src="a.png" alt="x"> after.', "markdown")

      const image = contentRoot().querySelector(`p ${RAW_HTML_SELECTOR} img`)
      expect(image?.getAttribute("src")).toContain("/api/file/raw/a.png")
      expect(image?.getAttribute("alt")).toBe("x")
    })

    test("keeps a line break tag in a table cell", async () => {
      expect(await saved("| a |\n| - |\n| x<br>y |")).toBe("| a      |\n| ------ |\n| x<br>y |")
    })

    test("keeps standard inline tags rendered as HTML", async () => {
      await mountEditor("Text <b>bold</b> here", "markdown")

      expect(contentRoot().querySelector("b")?.textContent).toBe("bold")
    })

    test("keeps inline tags after an edit elsewhere", async () => {
      expect(await savedAfterAppending("Line one<br>Line two", " more")).toBe(
        "Line one<br>Line two more",
      )
    })
  })

  describe("HTML in MDX documents", () => {
    test("leaves HTML to the MDX component path", async () => {
      await mountEditor('<div align="center">\n  <img src="a.png" />\n</div>', "mdx")

      expect(contentRoot().querySelector(RAW_HTML_SELECTOR)).toBeNull()
    })
  })
})
