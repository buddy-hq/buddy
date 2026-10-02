import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { $createFrontmatterNode } from "@mdxeditor/editor"
import { act, createRef } from "react"
import { $getRoot, DELETE_CHARACTER_COMMAND, getNearestEditorFromDOMNode } from "lexical"
import type { Root } from "react-dom/client"
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

describe("MarkdownBenchEditor frontmatter on disk", () => {
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

  async function openInRichText(
    markdown: string,
    documentFormat: MarkdownBenchDocumentFormat = "markdown",
  ) {
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
    expect(processingErrors).toEqual([])
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    return {
      editorRef,
      saved: editorRef.current?.getMarkdown(),
      shownText: container.querySelector(CONTENT_ROOT_SELECTOR)?.textContent ?? "",
    }
  }

  test.each([
    ["a value with a second colon", "---\ntitle: Note: the sequel\n---\n\nBody text"],
    ["a duplicated key", "---\na: 1\na: 2\n---\n\nBody text"],
    ["only a comment", "---\n# just a comment\n---\n\nBody text"],
    ["a plain scalar", "---\njust a scalar\n---\n\nBody text"],
    ["a list", "---\n- one\n- two\n---\n\nBody text"],
    ["an unclosed quote", '---\ntitle: "unclosed\n---\n\nBody text'],
    ["valid properties", "---\ntitle: Hello\ntags: [a, b]\n---\n\nBody text"],
    ["dollar amounts", "---\ntitle: Cost $5\nprice: $20\n---\n\nBody text"],
  ])("opens frontmatter with %s and keeps it on save", async (_, markdown) => {
    const { saved, shownText } = await openInRichText(markdown)

    expect(shownText).toContain("Body text")
    expect(saved).toBe(markdown)
  })

  test("swaps in the Buddy node when the library inserts frontmatter itself", async () => {
    const { editorRef } = await openInRichText("Body text")
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    const editor = element ? getNearestEditorFromDOMNode(element) : null
    if (!editor) throw new Error("Expected the Lexical editor behind the document")

    let firstNodeType = ""
    await act(async () => {
      editor.update(() => {
        $getRoot().splice(0, 0, [$createFrontmatterNode("title: Note: the sequel")])
      })
      await flushEffects()
    })
    editor.getEditorState().read(() => {
      firstNodeType = $getRoot().getFirstChild()?.getType() ?? ""
    })

    expect(firstNodeType).toBe("buddyFrontmatter")
    expect(editorRef.current?.getMarkdown()).toBe("---\ntitle: Note: the sequel\n---\n\nBody text")
  })

  test("keeps frontmatter when Backspace is pressed at the start of the first line", async () => {
    const markdown = "---\ntitle: x\ntags: [a]\n---\n\nBody text"
    const { editorRef } = await openInRichText(markdown)
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    const editor = element ? getNearestEditorFromDOMNode(element) : null
    if (!editor) throw new Error("Expected the Lexical editor behind the document")

    await act(async () => {
      editor.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "Body text")
        if (!body) throw new Error("Expected the body text")
        body.select(0, 0)
      })
      editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true)
      await flushEffects()
    })

    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("opens unloadable frontmatter in an MDX document", async () => {
    const markdown = "---\ntitle: Note: the sequel\n---\n\nBody text"

    const { saved, shownText } = await openInRichText(markdown, "mdx")

    expect(shownText).toContain("Body text")
    expect(saved).toBe(markdown)
  })
})
