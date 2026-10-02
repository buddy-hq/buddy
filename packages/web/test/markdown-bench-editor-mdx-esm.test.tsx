import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import { $getRoot, DELETE_CHARACTER_COMMAND, getNearestEditorFromDOMNode } from "lexical"
import type { Root } from "react-dom/client"
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

describe("MarkdownBenchEditor MDX import and export statements", () => {
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

  async function openMdx(markdown: string) {
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
            documentFormat="mdx"
            path="Index.mdx"
            onChange={(next) => changes.push(next)}
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
    return { editorRef, changes }
  }

  function contentRoot() {
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    if (!element) throw new Error("Expected the editable document")
    return element
  }

  test.each([
    ["an exported constant", "export const x = 1\n\n# T"],
    [
      "an exported default layout",
      "export default function Layout({ children }) { return children }\n\n# T",
    ],
    ["an export used in an expression", "export const meta = { title: 'x' }\n\n# {meta.title}"],
    ["a side-effect import", "import './x.css'\n\n# T"],
    ["an unused default import", "import B from './b'\n\n# T"],
    ["a partly used named import", "import { A, B } from './ab'\n\n<A />"],
    ["a renamed import", "import { A as Z } from './a'\n\n<Z />"],
    ["a namespace import", "import * as UI from './ui'\n\n<UI.Button />"],
    [
      "two imports on consecutive lines",
      "import B from './b'\nimport A from './a'\n\n<A />\n\n<B />",
    ],
    ["double quotes", 'import A from "./a"\n\n<A />'],
    ["an import after frontmatter", "---\ntitle: x\n---\n\nimport A from './a'\n\n<A />"],
    ["an export between blocks", "# T\n\nexport const y = 2\n\ntext"],
    ["an import beside an inline component", "import B from './b'\n\nSee <B /> here."],
    ["a regular expression with escaped brackets", "export const re = /\\[x\\]/\n\n# T"],
    ["dollar signs in a string", "export const s = '$5 and $6'\n\n# T"],
    ["an angle-bracket URL in a string", 'export const u = "<https://x.com>"\n\n# T'],
    ["a saved URL link", "see [https://example.com](https://example.com) here"],
  ])("keeps %s", async (_, markdown) => {
    const { editorRef } = await openMdx(markdown)

    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test.each([
    [
      "a footnote with a URL definition",
      "Text[^1]\n\n[^1]: https://example.com",
      "Text[^1]\n\n[^1]: [https://example.com](https://example.com)",
    ],
    [
      "a bare URL",
      "see https://example.com here",
      "see [https://example.com](https://example.com) here",
    ],
  ])("saves %s as a link MDX can read back", async (_, markdown, saved) => {
    const { editorRef } = await openMdx(markdown)

    expect(editorRef.current?.getMarkdown()).toBe(saved)
  })

  test("keeps the statements after an edit", async () => {
    const { changes } = await openMdx("import { A, B } from './ab'\n\n# T\n\n<A />")
    const editor = getNearestEditorFromDOMNode(contentRoot())
    if (!editor) throw new Error("Expected the Lexical editor behind the document")

    await act(async () => {
      editor.update(() => {
        const heading = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "T")
        if (!heading) throw new Error("Expected the heading text")
        heading.setTextContent("Title")
      })
      await flushEffects()
    })

    expect(changes.at(-1)).toBe("import { A, B } from './ab'\n\n# Title\n\n<A />")
  })

  test("keeps an import when Backspace is pressed at the start of the next block", async () => {
    const markdown = "import A from './a'\n\nBody text"
    const { editorRef } = await openMdx(markdown)
    const editor = getNearestEditorFromDOMNode(contentRoot())
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

  test("shows the statement in the document", async () => {
    await openMdx("export const meta = { title: 'x' }\n\n# T")

    expect(contentRoot().textContent).toContain("export const meta = { title: 'x' }")
  })
})
