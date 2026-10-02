import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { EditorView } from "@codemirror/view"
import { $getRoot, getNearestEditorFromDOMNode } from "lexical"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { ThemeProvider } from "../src/theme"
import { commitNestedEditors } from "./markdown-bench-nested-editors"

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

const BYTE_ORDER_MARK = "\uFEFF"
const CONTENT_ROOT_SELECTOR = ".mdxeditor-root-contenteditable [contenteditable]"

const UNTOUCHED_DOCUMENT = [
  "# Notes ##",
  "",
  "TODO:fix this, see http://x.com and snake_case for $5.",
  "",
  "",
  "| a | b |",
  "|---|:-:|",
  "| 1 | 2 |",
  "",
  "* first",
  "* second",
  "",
  "***",
  "",
  "> [!note] Kept",
  "> body",
  "",
  "Edit me here.",
  "",
].join("\n")

describe("MarkdownBenchEditor untouched blocks", () => {
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

  async function mountEditor(
    markdown: string,
    documentFormat: MarkdownBenchDocumentFormat = "markdown",
    preserveUntouchedBlocks = true,
  ) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const changes: string[] = []
    const processingErrors: string[] = []
    const rerender = (nextMarkdown: string) =>
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            ref={editorRef}
            markdown={nextMarkdown}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-notes"
            documentFormat={documentFormat}
            path={documentFormat === "mdx" ? "Index.mdx" : "Index.md"}
            preserveUntouchedBlocks={preserveUntouchedBlocks}
            onChange={(next) => changes.push(next)}
            onProcessingResult={(result) => {
              if (result.error) processingErrors.push(result.error)
            }}
          />
        </ThemeProvider>,
      )
    await act(async () => {
      rerender(markdown)
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return { editorRef, changes, rerender }
  }

  async function publishCodeMirrorDocuments() {
    const codeEditors = Array.from(container.querySelectorAll<HTMLElement>(".cm-editor"))
    expect(codeEditors.length).toBeGreaterThan(0)
    await act(async () => {
      for (const codeEditor of codeEditors) {
        const view = EditorView.findFromDOM(codeEditor)
        if (!view) throw new Error("Expected the CodeMirror view behind the code block")
        view.dispatch({ selection: { anchor: 0 } })
      }
      await flushEffects()
    })
  }

  function lexicalEditor() {
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    if (!element) throw new Error("Expected the editable document")
    const editor = getNearestEditorFromDOMNode(element)
    if (!editor) throw new Error("Expected the Lexical editor behind the document")
    return editor
  }

  async function replaceText(from: string, to: string) {
    await act(async () => {
      lexicalEditor().update(() => {
        const textNode = $getRoot()
          .getAllTextNodes()
          .find((candidate) => candidate.getTextContent().includes(from))
        if (!textNode) throw new Error(`Expected text containing "${from}"`)
        textNode.setTextContent(textNode.getTextContent().replace(from, to))
      })
      await flushEffects()
    })
  }

  test("returns the file exactly when nothing was edited", async () => {
    const { editorRef } = await mountEditor(UNTOUCHED_DOCUMENT)

    expect(editorRef.current?.getMarkdown()).toBe(UNTOUCHED_DOCUMENT)
  })

  test("re-serializes only the edited block", async () => {
    const { editorRef, changes } = await mountEditor(UNTOUCHED_DOCUMENT)

    await replaceText("Edit me here.", "Edited here.")

    const expected = UNTOUCHED_DOCUMENT.replace("Edit me here.", "Edited here.")
    expect(changes.at(-1)).toBe(expected)
    expect(editorRef.current?.getMarkdown()).toBe(expected)
  })

  test("keeps an untouched block while the block beside it changes", async () => {
    const { changes } = await mountEditor(UNTOUCHED_DOCUMENT)

    await replaceText("TODO:fix this", "TODO:fix that")

    expect(changes.at(-1)).toBe(
      UNTOUCHED_DOCUMENT.replace(
        "TODO:fix this, see http://x.com and snake_case for $5.",
        "TODO:fix that, see http://x.com and snake_case for $5.",
      ),
    )
  })

  test("keeps Windows line endings and the final newline of an untouched file", async () => {
    const markdown = UNTOUCHED_DOCUMENT.replaceAll("\n", "\r\n")
    const { editorRef, changes } = await mountEditor(markdown)

    expect(editorRef.current?.getMarkdown()).toBe(markdown)
    await replaceText("Edit me here.", "Edited here.")
    expect(changes.at(-1)).toBe(markdown.replace("Edit me here.", "Edited here."))
  })

  test("keeps reference definitions, task lists, math and directives during a separate prose edit", async () => {
    const markdown = [
      "Edit me here.",
      "",
      "- [ ] open task",
      "- plain item",
      "  - [x] nested done",
      "  - nested plain",
      "",
      "> [!note] Definition first",
      "> [x]: https://example.com",
      "",
      "See [reference][qa].",
      "",
      "[qa]: https://example.org",
      "",
      "\\[ y = 1 \\]",
      "",
      "> [!note] Directive text",
      "> - ::video[Clip]{src='a \"b\"' .wide #main}",
      "",
    ].join("\n")
    const { editorRef, changes } = await mountEditor(markdown)
    await commitNestedEditors(container)
    expect(changes.every((change) => change === markdown)).toBe(true)
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
    await replaceText("Edit me here.", "Edited here.")

    const expected = markdown.replace("Edit me here.", "Edited here.")
    expect(changes.at(-1)).toBe(expected)
    expect(editorRef.current?.getMarkdown()).toBe(expected)
  })

  test("keeps a quoted python block when a reloaded BOM and CRLF note changes only its last paragraph", async () => {
    const quote = [
      "> [!quote]+ Costs $5, equation $x$, key:value, नमस्ते 😀 python snake_case = 1",
      "> Costs $5, equation $x$, key:value, http://example.com/a_b, नमस्ते 😀",
      ">",
      "> ```python",
      "> snake_case = 1",
      "> ```",
      ">",
      "> [Open message](buddy://chat/ses_01abc?message=msg_01xyz)",
    ]
    const created = ["---", "type: buddy-session-note", "---", "*21:00*", "", ...quote, ""].join(
      "\n",
    )
    const reloaded = `${BYTE_ORDER_MARK}${[
      "---",
      "# keep this comment",
      'custom: "amber:42"',
      "type: buddy-session-note",
      "---",
      "*21:00*",
      "",
      ...quote,
      "",
      "Final paragraph",
      "",
    ].join("\r\n")}`
    const { editorRef, changes, rerender } = await mountEditor(created)

    await act(async () => {
      rerender(reloaded)
      editorRef.current?.setMarkdown(reloaded)
      await flushEffects()
    })
    await publishCodeMirrorDocuments()
    expect(
      Array.from(
        container.querySelectorAll("[aria-label=Language]"),
        (select) => select.textContent,
      ),
    ).toEqual(["Python"])
    expect(changes).toEqual([])

    await replaceText("Final paragraph", "Final paragraph edited")

    expect(changes.at(-1)).toBe(reloaded.replace("Final paragraph", "Final paragraph edited"))
  })

  test("keeps a multi-line CRLF code block after CodeMirror publishes its document", async () => {
    const markdown = [
      "> [!note] Code",
      "> ```ts",
      "> const a = 1",
      "> const b = 2",
      "> ```",
      "",
      "```python",
      "x = 1",
      "y = 2",
      "```",
      "",
      "Edit me here.",
      "",
    ].join("\r\n")
    const { changes } = await mountEditor(markdown)

    await publishCodeMirrorDocuments()
    expect(changes).toEqual([])
    await replaceText("Edit me here.", "Edited here.")

    expect(changes.at(-1)).toBe(markdown.replace("Edit me here.", "Edited here."))
  })

  test("uses a file loaded later as the new source", async () => {
    const { editorRef, changes } = await mountEditor(UNTOUCHED_DOCUMENT)
    const reloaded = "* other\n* list\n\nEdit me here.\n"

    await act(async () => {
      editorRef.current?.setMarkdown(reloaded)
      await flushEffects()
    })
    await replaceText("Edit me here.", "Edited here.")

    expect(changes.at(-1)).toBe("* other\n* list\n\nEdited here.\n")
  })

  test("saves the plain serializer output when preservation is off", async () => {
    const { editorRef } = await mountEditor("* first\n* second\n", "markdown", false)

    expect(editorRef.current?.getMarkdown()).toBe("- first\n- second\n")
  })

  test("keeps MDX byte-identical on focus and blur, then serializes an intentional edit", async () => {
    const markdown = "* first\n* second\n\nSee http://example.com/a_b here.\n"
    const { editorRef, changes } = await mountEditor(markdown, "mdx")

    await act(async () => {
      const content = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
      content?.focus()
      content?.blur()
      await flushEffects()
    })
    expect(changes.every((change) => change === markdown)).toBe(true)
    expect(editorRef.current?.getMarkdown()).toBe(markdown)

    await replaceText("here.", "there.")
    expect(changes.at(-1)).toBe(
      "- first\n- second\n\nSee [http://example.com/a_b](http://example.com/a_b) there.\n",
    )
  })
})
