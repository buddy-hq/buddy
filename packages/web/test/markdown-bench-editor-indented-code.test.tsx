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
const TRICKY_CODE_LINE = "<b> [c]: /d $e$ $$f$$ \\g \\[h\\] # i"

describe("MarkdownBenchEditor indented code on save", () => {
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
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    return editorRef.current?.getMarkdown()
  }

  function lexicalEditor() {
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    if (!element) throw new Error("Expected the editable document")
    const editor = getNearestEditorFromDOMNode(element)
    if (!editor) throw new Error("Expected the Lexical editor behind the document")
    return editor
  }

  async function savedAfterAppending(markdown: string, text: string) {
    const { changes, processingErrors } = await mountEditor(markdown, "markdown")
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

  test.each([
    [
      "at the top level",
      `Text\n\n    const a = 1\n    ${TRICKY_CODE_LINE}\n\nAfter`,
      `Text\n\n\`\`\`\nconst a = 1\n${TRICKY_CODE_LINE}\n\`\`\`\n\nAfter`,
    ],
    [
      "after a heading",
      "## Premises\n    1. <premise> [explicit]",
      "## Premises\n\n```\n1. <premise> [explicit]\n```",
    ],
    [
      "with deeper indentation and a blank line inside",
      "Text\n\n    a\n\n        b",
      "Text\n\n```\na\n\n    b\n```",
    ],
    ["indented with a tab", "Text\n\n\tTabbed\n\t  code", "Text\n\n```\nTabbed\n  code\n```"],
    [
      "inside a list item",
      `- item\n\n      code line\n\n      ${TRICKY_CODE_LINE}\n\n- next`,
      `- item\n\n  \`\`\`\n  code line\n\n  ${TRICKY_CODE_LINE}\n  \`\`\`\n\n- next`,
    ],
    [
      "inside a blockquote",
      `> quote\n>\n>     code in quote\n>     ${TRICKY_CODE_LINE}`,
      `> quote\n>\n> \`\`\`\n> code in quote\n> ${TRICKY_CODE_LINE}\n> \`\`\``,
    ],
    [
      "inside a blockquote in a list item",
      "1. one\n\n   > quoted\n   >\n   >     deep code\n\n2. two",
      "1. one\n\n   > quoted\n   >\n   > ```\n   > deep code\n   > ```\n\n2. two",
    ],
    [
      "containing backticks",
      "Text\n\n    uses ``` fences and ```` four",
      "Text\n\n`````\nuses ``` fences and ```` four\n`````",
    ],
    [
      "whose first line looks like a fence",
      "    ```js\n    not a fence\n    ```\n\nText",
      "````\n```js\nnot a fence\n```\n````\n\nText",
    ],
    [
      "in a callout body",
      `> [!note] Title\n> Body\n>\n>     indented code\n>     ${TRICKY_CODE_LINE}`,
      `> [!note] Title\n> Body\n>\n> \`\`\`\n> indented code\n> ${TRICKY_CODE_LINE}\n> \`\`\``,
    ],
  ])("saves indented code %s as a fenced block", async (_, markdown, expected) => {
    expect(await saved(markdown)).toBe(expected)
  })

  test("leaves a real fenced block next to an indented block untouched", async () => {
    const markdown =
      "Para\n\n    indented <x>\n\n```js\nconst real = `<y>`\n```\n\n~~~\ntilde $z$\n~~~"

    expect(await saved(markdown)).toBe(
      "Para\n\n```\nindented <x>\n```\n\n```js\nconst real = `<y>`\n```\n\n```\ntilde $z$\n```",
    )
  })

  test("renders the converted block as code", async () => {
    await mountEditor(`Text\n\n    ${TRICKY_CODE_LINE}`, "markdown")

    expect(container.querySelector(".cm-editor")?.textContent).toContain(TRICKY_CODE_LINE)
  })

  test("keeps the fenced block after an edit elsewhere", async () => {
    expect(await savedAfterAppending("    code <x>\n\nText", " more")).toBe(
      "```\ncode <x>\n```\n\nText more",
    )
  })

  test("leaves indented lines in MDX alone", async () => {
    const mdx = "Text\n\n    not code in MDX"

    expect(await saved(mdx, "mdx")).not.toContain("```")
  })
})
