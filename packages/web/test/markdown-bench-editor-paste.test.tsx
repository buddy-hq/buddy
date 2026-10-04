import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { detectPlatform } from "@tanstack/react-hotkeys"
import {
  $getRoot,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
  getNearestEditorFromDOMNode,
  type LexicalEditor,
} from "lexical"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { markdownClipboardHtml } from "../src/lib/markdown-clipboard"
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
const CALLOUT_CONTENT_SELECTOR =
  '[data-component="markdown-bench-obsidian-callout"] [contenteditable]'

// The shape of the chat response that was pasted into a note and saved as escaped text.
const CHAT_RESPONSE = [
  "Yes—he gives lots of concrete cases. Below are **32 examples and contrasts from *This Is Marketing***, grouped under the eight mistakes we discussed.",
  "",
  "**Quotation marks indicate exact wording from the book.** These categories are my synthesis.",
  "",
  "- **1. Making something first, then hunting for people to buy it**",
  "  - **His basic contrast:**",
  "    - “It doesn’t make any sense to make a key and then run around looking for a lock to open.”",
  "    - *Chapter 1, “The lock and the key.”*",
  "  - **Penguin Magic: understand the customer’s actual situation.**",
  "    - **Quote:** “An amateur, on the other hand, always has the same audience.”",
].join("\n")

type Clipboard = {
  text: string
  html?: string
}

function pasteEvent(clipboard: Clipboard): ClipboardEvent {
  const clipboardData = new DataTransfer()
  clipboardData.setData("text/plain", clipboard.text)
  if (clipboard.html !== undefined) clipboardData.setData("text/html", clipboard.html)
  return new ClipboardEvent("paste", { cancelable: true, clipboardData })
}

function literalPasteKey(): KeyboardEvent {
  const mac = detectPlatform() === "mac"
  return new KeyboardEvent("keydown", {
    cancelable: true,
    key: "V",
    shiftKey: true,
    metaKey: mac,
    ctrlKey: !mac,
  })
}

describe("MarkdownBenchEditor paste", () => {
  let container: HTMLDivElement
  let root: Root
  let clipboardDescriptor: PropertyDescriptor | undefined

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
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    document.head.replaceChildren()
    if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor)
    else Reflect.deleteProperty(navigator, "clipboard")
  })

  async function mountEditor(markdown: string, documentFormat: MarkdownBenchDocumentFormat) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
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
            onChange={() => undefined}
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

  function editorBehind(selector: string): LexicalEditor {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Expected an editable element matching ${selector}`)
    const editor = getNearestEditorFromDOMNode(element)
    if (!editor) throw new Error("Expected a Lexical editor behind the element")
    return editor
  }

  async function placeCaret(editor: LexicalEditor, text: string | undefined, offset: number) {
    await act(async () => {
      editor.update(() => {
        if (text === undefined) {
          $getRoot().selectEnd()
          return
        }
        const textNode = $getRoot()
          .getAllTextNodes()
          .find((candidate) => candidate.getTextContent() === text)
        if (!textNode) throw new Error(`Expected text reading "${text}"`)
        textNode.select(offset, offset).setFormat(textNode.getFormat())
      })
      await flushEffects()
    })
  }

  async function paste(editor: LexicalEditor, clipboard: Clipboard) {
    const event = pasteEvent(clipboard)
    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, event)
      await flushEffects()
    })
    return event
  }

  async function savedAfterPasting(input: {
    markdown: string
    clipboard: Clipboard
    caretText?: string
    caretOffset?: number
    documentFormat?: MarkdownBenchDocumentFormat
  }) {
    const { editorRef, processingErrors } = await mountEditor(
      input.markdown,
      input.documentFormat ?? "markdown",
    )
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)
    await placeCaret(editor, input.caretText, input.caretOffset ?? 0)
    await paste(editor, input.clipboard)
    expect(processingErrors).toEqual([])
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    return editorRef.current?.getMarkdown()
  }

  test("pastes a chat response's Markdown as formatting instead of escaped text", async () => {
    const saved = await savedAfterPasting({ markdown: "", clipboard: { text: CHAT_RESPONSE } })

    expect(saved).toBe(CHAT_RESPONSE)
  })

  test("merges inline Markdown into the paragraph at the caret", async () => {
    const saved = await savedAfterPasting({
      markdown: "Hello world",
      caretText: "Hello world",
      caretOffset: "Hello ".length,
      clipboard: { text: "**bold** and _slanted_ " },
    })

    expect(saved).toBe("Hello **bold** and *slanted* world")
  })

  test("pastes plain prose unchanged", async () => {
    const saved = await savedAfterPasting({
      markdown: "Hello world",
      caretText: "Hello world",
      caretOffset: "Hello ".length,
      clipboard: { text: "plain " },
    })

    expect(saved).toBe("Hello plain world")
  })

  test("reads Windows line endings as Markdown line endings", async () => {
    const saved = await savedAfterPasting({
      markdown: "",
      clipboard: { text: "Intro\r\n\r\n- one\r\n- two\r\n" },
    })

    expect(saved).toBe("Intro\n\n- one\n- two")
  })

  test("reads Buddy's own Markdown copy as Markdown rather than its HTML", async () => {
    const copied = "Euler: $e^{i\\pi}+1=0$\n\n> [!note] Remember\n> Keep the callout."
    const saved = await savedAfterPasting({
      markdown: "",
      clipboard: { text: copied, html: markdownClipboardHtml(copied) },
    })

    expect(saved).toBe(copied)
  })

  test("leaves HTML from other apps to the HTML importer", async () => {
    const saved = await savedAfterPasting({
      markdown: "",
      clipboard: { text: "# Title", html: "<p># Title</p>" },
    })

    expect(saved).toBe("\\# Title")
  })

  test("pastes literally inside inline code", async () => {
    const saved = await savedAfterPasting({
      markdown: "Run `code` now",
      caretText: "code",
      caretOffset: 2,
      clipboard: { text: "**x**" },
    })

    expect(saved).toBe("Run `co**x**de` now")
  })

  test("never reads a pasted --- block as frontmatter", async () => {
    const saved = await savedAfterPasting({
      markdown: "---\ntitle: Note\n---\n\nBody",
      clipboard: { text: "---\ntags: pasted\n---\n\nMore" },
    })

    expect(saved).toBe("---\ntitle: Note\n---\n\nBody\n\n---\n\n## tags: pasted\n\nMore")
  })

  test("falls back to literal text when MDX cannot parse the paste", async () => {
    const saved = await savedAfterPasting({
      markdown: "Intro",
      documentFormat: "mdx",
      clipboard: { text: "a < b and {broken" },
    })

    expect(saved).toBe("Introa \\< b and \\{broken")
  })

  test("pastes a list between paragraphs without a stray blank paragraph", async () => {
    const saved = await savedAfterPasting({
      markdown: "Body\n\nNext",
      caretText: "Body",
      caretOffset: "Body".length,
      clipboard: { text: "- one\n- two" },
    })

    expect(saved).toBe("Body\n\n- one\n- two\n\nNext")
  })

  test("starts a new block when the pasted text starts with a line ending", async () => {
    const saved = await savedAfterPasting({
      markdown: "Body",
      caretText: "Body",
      caretOffset: "Body".length,
      clipboard: { text: "\n\nNext paragraph" },
    })

    expect(saved).toBe("Body\n\nNext paragraph")
  })

  test("pastes Markdown into a callout body", async () => {
    const { editorRef, processingErrors } = await mountEditor("> [!note] Title\n> Body", "markdown")
    const callout = container.querySelector<HTMLElement>(CALLOUT_CONTENT_SELECTOR)
    if (!callout) throw new Error("Expected a callout body")
    const editor = editorBehind(CALLOUT_CONTENT_SELECTOR)
    await act(async () => {
      callout.focus()
      await flushEffects()
    })
    await placeCaret(editor, undefined, 0)
    await paste(editor, { text: "\n\n- one\n- **two**" })
    await act(async () => {
      callout.blur()
      await flushEffects()
    })

    expect(processingErrors).toEqual([])
    expect(editorRef.current?.getMarkdown()).toBe(
      "> [!note] Title\n> Body\n>\n> - one\n> - **two**",
    )
  })

  test("starts a list on its own block when the pasted text starts with a line ending", async () => {
    const saved = await savedAfterPasting({
      markdown: "Body\n\nNext",
      caretText: "Body",
      caretOffset: "Body".length,
      clipboard: { text: "\n- one\n- two" },
    })

    expect(saved).toBe("Body\n\n- one\n- two\n\nNext")
  })

  test("pastes inline Markdown into a table cell but never block Markdown", async () => {
    const { editorRef, processingErrors } = await mountEditor(
      "| Name | Notes |\n| --- | --- |\n| a | b |",
      "markdown",
    )
    const cell = Array.from(container.querySelectorAll<HTMLElement>("td [contenteditable]")).at(-1)
    if (!cell) throw new Error("Expected an editable table cell")
    const editor = getNearestEditorFromDOMNode(cell)
    if (!editor) throw new Error("Expected a Lexical editor behind the cell")
    await act(async () => {
      cell.focus()
      await flushEffects()
    })
    await placeCaret(editor, undefined, 0)
    await paste(editor, { text: " **bold**" })
    await act(async () => {
      cell.blur()
      await flushEffects()
    })
    expect(editorRef.current?.getMarkdown()).toBe(
      "| Name | Notes      |\n| ---- | ---------- |\n| a    | b **bold** |",
    )

    await paste(editor, { text: "- one\n- two" })
    const cellBlockTypes = editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType()),
    )
    expect(cellBlockTypes).not.toContain("list")
    expect(processingErrors).toEqual([])
  })

  test("Mod+Shift+V pastes the clipboard text literally", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: () => Promise.resolve("**kept** as typed") },
      configurable: true,
    })
    const { editorRef, processingErrors } = await mountEditor("", "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)
    await placeCaret(editor, undefined, 0)
    const keydown = literalPasteKey()
    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, keydown)
      await flushEffects()
    })

    expect(keydown.defaultPrevented).toBe(true)
    expect(processingErrors).toEqual([])
    expect(editorRef.current?.getMarkdown()).toBe("\\*\\*kept\\*\\* as typed")
  })
})
