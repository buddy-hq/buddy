import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef, useState } from "react"
import type { Root } from "react-dom/client"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  getNearestEditorFromDOMNode,
} from "lexical"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import {
  applyMarkdownFileTextFormat,
  readMarkdownFileTextFormat,
} from "../src/components/bench/markdown/file-text-format"
import { resolveMarkdownBenchLink } from "../src/components/bench/markdown/link-navigation"
import type { OpenLinkOptions } from "../src/components/directory-chat/use-open-link"
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

const BYTE_ORDER_MARK = "﻿"
const CONTENT_ROOT_SELECTOR = ".mdxeditor-root-contenteditable [contenteditable]"
const CHAT_MESSAGE_URL = "buddy://chat/ses_01abc?message=msg_01xyz"
const OBSIDIAN_URL = "obsidian://open?vault=Notes&file=Alpha"

type OpenedLink = { href: string; options: OpenLinkOptions }

function ControlledEditor(props: { initialMarkdown: string; onChange(markdown: string): void }) {
  const [markdown, setMarkdown] = useState(props.initialMarkdown)
  return (
    <ThemeProvider>
      <MarkdownBenchEditor
        markdown={markdown}
        version="version-1"
        dirty={false}
        saving={false}
        conflict={false}
        directory="/tmp/test-notes"
        documentFormat="markdown"
        path="Index.md"
        onChange={(next) => {
          setMarkdown(next)
          props.onChange(next)
        }}
      />
    </ThemeProvider>
  )
}

describe("MarkdownBenchEditor link clicks and file endings", () => {
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

  async function mountEditor(input: {
    markdown: string
    documentFormat?: MarkdownBenchDocumentFormat
    path?: string
    onChange?(markdown: string): void
    onOpenLink?(href: string, options: OpenLinkOptions): void
  }) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            ref={editorRef}
            markdown={input.markdown}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-notes"
            documentFormat={input.documentFormat ?? "markdown"}
            path={input.path ?? "Index.md"}
            onChange={input.onChange ?? (() => {})}
            onOpenLink={input.onOpenLink}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })
    return editorRef
  }

  async function mountEditorCollectingLinks(markdown: string) {
    const openedLinks: OpenedLink[] = []
    await mountEditor({
      markdown,
      onOpenLink: (href, options) => openedLinks.push({ href, options }),
    })
    return openedLinks
  }

  async function clickAnchor(anchor: HTMLAnchorElement | null, init?: MouseEventInit) {
    expect(anchor).not.toBeNull()
    await act(async () => {
      anchor?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }))
      await flushEffects()
    })
  }

  async function editFirstBlock(text: string) {
    const contentRoot = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    const lexicalEditor = getNearestEditorFromDOMNode(contentRoot)
    if (!lexicalEditor) throw new Error("Expected the Lexical editor behind the document")
    await act(async () => {
      lexicalEditor.update(() => {
        const block = $getRoot().getFirstChild()
        if (!$isElementNode(block)) throw new Error("Expected a block at the start of the document")
        block.append($createTextNode(text))
      })
      await flushEffects()
    })
  }

  async function appendParagraph(text: string) {
    const contentRoot = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    const lexicalEditor = getNearestEditorFromDOMNode(contentRoot)
    if (!lexicalEditor) throw new Error("Expected the Lexical editor behind the document")
    await act(async () => {
      lexicalEditor.update(() => {
        $getRoot().append($createParagraphNode().append($createTextNode(text)))
      })
      await flushEffects()
    })
  }

  async function clearDocument() {
    const contentRoot = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    const lexicalEditor = getNearestEditorFromDOMNode(contentRoot)
    if (!lexicalEditor) throw new Error("Expected the Lexical editor behind the document")
    await act(async () => {
      lexicalEditor.update(() => {
        $getRoot().clear()
      })
      await flushEffects()
    })
  }

  describe("link clicks", () => {
    test("hands onOpenLink the real buddy chat URL instead of the sanitised href", async () => {
      const openedLinks = await mountEditorCollectingLinks(`[Open message](${CHAT_MESSAGE_URL})`)

      const anchor = container.querySelector<HTMLAnchorElement>("a")
      expect(anchor?.getAttribute("href")).toBe("about:blank")
      await clickAnchor(anchor)

      expect(openedLinks).toEqual([{ href: CHAT_MESSAGE_URL, options: { modified: false } }])
    })

    test("hands onOpenLink the real URL for the link inside a session note callout", async () => {
      const openedLinks = await mountEditorCollectingLinks(
        [
          "> [!quote]+ It costs five dollars",
          "> It costs five dollars.",
          ">",
          `> [Open message](${CHAT_MESSAGE_URL})`,
        ].join("\n"),
      )

      const anchor = container.querySelector<HTMLAnchorElement>(
        '[data-component="markdown-bench-obsidian-callout"] a',
      )
      expect(anchor?.getAttribute("href")).toBe("about:blank")
      await clickAnchor(anchor)

      expect(openedLinks.map((link) => link.href)).toEqual([CHAT_MESSAGE_URL])
    })

    test("hands onOpenLink the real obsidian URL", async () => {
      const openedLinks = await mountEditorCollectingLinks(`[Open in Obsidian](${OBSIDIAN_URL})`)

      const anchor = container.querySelector<HTMLAnchorElement>("a")
      expect(anchor?.getAttribute("href")).toBe("about:blank")
      await clickAnchor(anchor)

      expect(openedLinks.map((link) => link.href)).toEqual([OBSIDIAN_URL])
      expect(resolveMarkdownBenchLink("Index.md", OBSIDIAN_URL)).toEqual({
        type: "external",
        url: OBSIDIAN_URL,
      })
    })

    test("hands onOpenLink a relative link whose first segment contains a colon", async () => {
      const openedLinks = await mountEditorCollectingLinks("[Sub note](Note:%20sub.md)")

      const anchor = container.querySelector<HTMLAnchorElement>("a")
      expect(anchor?.getAttribute("href")).toBe("about:blank")
      await clickAnchor(anchor)

      expect(openedLinks.map((link) => link.href)).toEqual(["Note:%20sub.md"])
    })

    test("hands onOpenLink a relative link without a leading dot exactly as written", async () => {
      const openedLinks = await mountEditorCollectingLinks(
        ["[Sibling](other.md)", "[Nested](notes/a.md#section)"].join("\n\n"),
      )

      const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
      expect(anchors).toHaveLength(2)
      for (const anchor of anchors) await clickAnchor(anchor)

      expect(openedLinks.map((link) => link.href)).toEqual(["other.md", "notes/a.md#section"])
    })

    test("keeps web, relative and fragment links unchanged", async () => {
      const openedLinks = await mountEditorCollectingLinks(
        [
          "[Web](https://example.com/page?a=1)",
          "[Relative](./other.md#section)",
          "[Fragment](#Polynomial%20Functions)",
        ].join("\n\n"),
      )

      const anchors = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
      expect(anchors.map((anchor) => anchor.getAttribute("href"))).toEqual([
        "https://example.com/page?a=1",
        "./other.md#section",
        "#Polynomial%20Functions",
      ])
      for (const anchor of anchors) await clickAnchor(anchor)

      expect(openedLinks.map((link) => link.href)).toEqual([
        "https://example.com/page?a=1",
        "./other.md#section",
        "#Polynomial%20Functions",
      ])
    })

    test("passes the modifier state through for the real URL", async () => {
      const openedLinks = await mountEditorCollectingLinks(`[Open message](${CHAT_MESSAGE_URL})`)

      await clickAnchor(container.querySelector<HTMLAnchorElement>("a"), { metaKey: true })

      expect(openedLinks).toEqual([{ href: CHAT_MESSAGE_URL, options: { modified: true } }])
    })

    test("keeps the DOM href sanitised and leaves refusing unsafe schemes to the resolver", async () => {
      const unsafeUrl = "javascript:alert(1)"
      const openedLinks = await mountEditorCollectingLinks(`[Unsafe](${unsafeUrl})`)

      const anchor = container.querySelector<HTMLAnchorElement>("a")
      expect(anchor?.getAttribute("href")).toBe("about:blank")
      await clickAnchor(anchor)

      expect(openedLinks.map((link) => link.href)).toEqual([unsafeUrl])
      expect(resolveMarkdownBenchLink("Index.md", unsafeUrl)).toBeUndefined()
      expect(resolveMarkdownBenchLink("Index.md", CHAT_MESSAGE_URL)).toBeUndefined()
    })
  })

  describe("file endings", () => {
    test("keeps CRLF line endings and the final newline", async () => {
      const markdown = "# Title\r\n\r\npara one\r\npara two\r\n\r\n- a\r\n- b\r\n"
      const editorRef = await mountEditor({ markdown })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
    })

    test("writes all CRLF after an edit when the file used CRLF", async () => {
      const changes: string[] = []
      await mountEditor({
        markdown: "# Title\r\n\r\npara one\r\npara two\r\n\r\n- a\r\n- b\r\n",
        onChange: (markdown) => changes.push(markdown),
      })

      await editFirstBlock(" edited")

      expect(changes.at(-1)).toBe(
        "# Title edited\r\n\r\npara one\r\npara two\r\n\r\n- a\r\n- b\r\n",
      )
    })

    test("keeps the final newline of an LF file", async () => {
      const markdown = "# Title\n\npara one\npara two\n\n- a\n- b\n"
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown,
        onChange: (next) => changes.push(next),
      })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
      await editFirstBlock(" edited")
      expect(changes.at(-1)).toBe("# Title edited\n\npara one\npara two\n\n- a\n- b\n")
    })

    test("does not add a final newline to a file that had none", async () => {
      const markdown = "# Title\n\npara one\npara two"
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown,
        onChange: (next) => changes.push(next),
      })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
      await editFirstBlock(" edited")
      expect(changes.at(-1)).toBe("# Title edited\n\npara one\npara two")
    })

    test("does not add a final newline to a CRLF file that had none", async () => {
      const markdown = "# Title\r\n\r\npara one\r\npara two"
      const editorRef = await mountEditor({ markdown })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
    })

    test("keeps a leading byte-order mark", async () => {
      const markdown = `${BYTE_ORDER_MARK}# Title\n\npara\n`
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown,
        onChange: (next) => changes.push(next),
      })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
      await editFirstBlock(" edited")
      expect(changes.at(-1)).toBe(`${BYTE_ORDER_MARK}# Title edited\n\npara\n`)
    })

    test("keeps a byte-order mark together with CRLF and the final newline", async () => {
      const markdown = `${BYTE_ORDER_MARK}# Title\r\n\r\npara one\r\npara two\r\n`
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown,
        onChange: (next) => changes.push(next),
      })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
      await editFirstBlock(" edited")
      expect(changes.at(-1)).toBe(
        `${BYTE_ORDER_MARK}# Title edited\r\n\r\npara one\r\npara two\r\n`,
      )
    })

    test("does not add a byte-order mark to a file without one", async () => {
      const changes: string[] = []
      await mountEditor({
        markdown: "# Title\n",
        onChange: (next) => changes.push(next),
      })

      await editFirstBlock(" edited")

      expect(changes.at(-1)).toBe("# Title edited\n")
    })

    test("keeps the file format for MDX documents", async () => {
      const markdown = "# Title\r\n\r\n<Callout>\r\n  Hello\r\n</Callout>\r\n"
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown,
        documentFormat: "mdx",
        path: "Doc.mdx",
        onChange: (next) => changes.push(next),
      })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
      await editFirstBlock(" edited")
      expect(changes.at(-1)).toBe("# Title edited\r\n\r\n<Callout>\r\n  Hello\r\n</Callout>\r\n")
    })

    test("reports no change when nothing was edited", async () => {
      const changes: string[] = []
      await mountEditor({
        markdown: `${BYTE_ORDER_MARK}# Title\r\n\r\npara one\r\npara two\r\n`,
        onChange: (next) => changes.push(next),
      })
      await act(async () => {
        await flushEffects(20)
      })

      expect(changes).toEqual([])
    })

    test("returns the opened markdown unchanged when it needs no normalisation", async () => {
      const markdown = "# Title\r\n\r\npara one\r\npara two\r\n"
      const editorRef = await mountEditor({ markdown })

      expect(editorRef.current?.getMarkdown()).toBe(markdown)
    })

    test("keeps an empty document empty", async () => {
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown: "",
        onChange: (next) => changes.push(next),
      })

      expect(editorRef.current?.getMarkdown()).toBe("")
      expect(changes).toEqual([])
    })

    test("keeps the opened file format across successive edits that feed back as the document", async () => {
      const changes: string[] = []
      await act(async () => {
        root.render(
          <ControlledEditor
            initialMarkdown={`${BYTE_ORDER_MARK}# Title\r\n\r\npara\r\n`}
            onChange={(markdown) => changes.push(markdown)}
          />,
        )
        await flushEffects()
      })

      await editFirstBlock(" one")
      await appendParagraph("second")
      await clearDocument()
      await appendParagraph("after clearing")

      expect(changes).toEqual([
        `${BYTE_ORDER_MARK}# Title one\r\n\r\npara\r\n`,
        `${BYTE_ORDER_MARK}# Title one\r\n\r\npara\r\n\r\nsecond\r\n`,
        "",
        `${BYTE_ORDER_MARK}after clearing\r\n`,
      ])
    })

    test("writes an empty document when everything is deleted from a file with endings", async () => {
      const changes: string[] = []
      const editorRef = await mountEditor({
        markdown: `${BYTE_ORDER_MARK}# Title\r\n\r\npara\r\n`,
        onChange: (next) => changes.push(next),
      })

      await clearDocument()

      expect(changes.at(-1)).toBe("")
      expect(editorRef.current?.getMarkdown()).toBe("")
    })
  })
})

describe("Markdown file text format", () => {
  test("reads the byte-order mark, the dominant line ending and the final newline", () => {
    expect(readMarkdownFileTextFormat("# a\n\nb")).toEqual({
      byteOrderMark: false,
      lineEnding: "\n",
      finalNewline: false,
    })
    expect(readMarkdownFileTextFormat(`${BYTE_ORDER_MARK}# a\r\n\r\nb\r\n`)).toEqual({
      byteOrderMark: true,
      lineEnding: "\r\n",
      finalNewline: true,
    })
    expect(readMarkdownFileTextFormat("a\r\nb\nc\nd\r\n").lineEnding).toBe("\n")
    expect(readMarkdownFileTextFormat("a\r\nb\r\nc\nd").lineEnding).toBe("\r\n")
  })

  test("applies one line ending style to a mixed document", () => {
    const crlfFormat = readMarkdownFileTextFormat("a\r\n")
    const lfFormat = readMarkdownFileTextFormat("a\n")

    expect(applyMarkdownFileTextFormat("# T\n\npara\r\npara\n\n- a", crlfFormat)).toBe(
      "# T\r\n\r\npara\r\npara\r\n\r\n- a\r\n",
    )
    expect(applyMarkdownFileTextFormat("# T\n\npara\r\npara\n\n- a", lfFormat)).toBe(
      "# T\n\npara\npara\n\n- a\n",
    )
  })

  test("is idempotent and never doubles the byte-order mark", () => {
    const format = readMarkdownFileTextFormat(`${BYTE_ORDER_MARK}a\r\nb\r\n`)
    const once = applyMarkdownFileTextFormat("a\nb", format)

    expect(once).toBe(`${BYTE_ORDER_MARK}a\r\nb\r\n`)
    expect(applyMarkdownFileTextFormat(once, format)).toBe(once)
  })

  test("removes surplus final newlines and keeps a missing final newline missing", () => {
    expect(applyMarkdownFileTextFormat("a\n\n\n", readMarkdownFileTextFormat("x\n"))).toBe("a\n")
    expect(applyMarkdownFileTextFormat("a\n\n", readMarkdownFileTextFormat("x"))).toBe("a")
  })

  test("leaves a document without content empty whatever the opened file looked like", () => {
    const format = readMarkdownFileTextFormat(`${BYTE_ORDER_MARK}a\r\n`)

    expect(applyMarkdownFileTextFormat("", format)).toBe("")
    expect(applyMarkdownFileTextFormat("\n", format)).toBe("")
    expect(applyMarkdownFileTextFormat(BYTE_ORDER_MARK, format)).toBe("")
  })
})
