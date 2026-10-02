import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { $getRoot, $nodesOfType, getNearestEditorFromDOMNode, type LexicalEditor } from "lexical"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { BuddyMathNode } from "../src/components/bench/markdown/plugins/math"
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
const MATH_SELECTOR = '[data-component="markdown-bench-math"]'

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!valueSetter) throw new Error("Expected the input value setter")
  valueSetter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function replaceTextReading(from: string, to: string): () => void {
  return () => {
    const textNode = $getRoot()
      .getAllTextNodes()
      .find((candidate) => candidate.getTextContent().includes(from))
    if (!textNode) throw new Error(`Expected text containing "${from}"`)
    textNode.setTextContent(textNode.getTextContent().replace(from, to))
  }
}

function setMathValue(value: string): () => void {
  return () => {
    const [mathNode] = $nodesOfType(BuddyMathNode)
    if (!mathNode) throw new Error("Expected a math node")
    mathNode.setValue(value)
  }
}

const INLINE_MATH_DOCUMENTS = [
  {
    name: "inline double-dollar math in a paragraph",
    markdown: "Text $$x$$ inline.",
    from: "inline",
    to: "words",
  },
  {
    name: "inline double-dollar math in a list item",
    markdown: "- see $$a+b$$ here",
    from: "see",
    to: "read",
  },
  {
    name: "inline double-dollar math in a blockquote",
    markdown: "> quoted $$x$$",
    from: "quoted",
    to: "cited",
  },
  {
    name: "inline double-dollar math beside single-dollar math",
    markdown: "Both $$x$$ and $y$ here",
    from: "Both",
    to: "All",
  },
  {
    name: "two inline double-dollar equations in one paragraph",
    markdown: "Sum $$a$$ then $$b$$ then text",
    from: "then text",
    to: "then more text",
  },
  {
    name: "double-dollar math holding a single dollar",
    markdown: "Cost $$a$b$$ here",
    from: "Cost",
    to: "Price",
  },
  {
    name: "inline double-dollar math opening a paragraph",
    markdown: "$$a$$ then text",
    from: "then text",
    to: "then more text",
  },
  {
    name: "inline double-dollar math opening a later line",
    markdown: "Text\n$$x$$ more",
    from: "more",
    to: "after",
  },
  {
    name: "inline double-dollar math opening a list item",
    markdown: "- $$a$$ then text",
    from: "then text",
    to: "then more text",
  },
  {
    name: "inline double-dollar math across lines",
    markdown: "Text $$a\nb$$ more",
    from: "more",
    to: "after",
  },
  {
    name: "inline double-dollar math across lines in a blockquote",
    markdown: "> Text $$a\n> b$$ more",
    from: "more",
    to: "after",
  },
  {
    name: "single-dollar math",
    markdown: "Text $x$ inline.",
    from: "inline",
    to: "words",
  },
  {
    name: "display math in a list item",
    markdown: "- item\n\n  $$\n  x = 1\n  $$",
    from: "item",
    to: "entry",
  },
  {
    name: "display math in a blockquote",
    markdown: "> quoted\n>\n> $$\n> x = 1\n> $$",
    from: "quoted",
    to: "cited",
  },
]

const MATH_VALUE_EDITS = [
  {
    name: "math inside a continuous bold run",
    markdown: "**bold $x$ after**",
    value: "y",
    expected: "**bold $y$ after**",
  },
  {
    name: "inline double-dollar math",
    markdown: "Text $$x$$ inline.",
    value: "a+b",
    expected: "Text $$a+b$$ inline.",
  },
  {
    name: "inline double-dollar math in a list item",
    markdown: "- see $$x$$ here",
    value: "\\frac{a}{b}",
    expected: "- see $$\\frac{a}{b}$$ here",
  },
  {
    name: "inline double-dollar math in a blockquote",
    markdown: "> quoted $$x$$",
    value: "y",
    expected: "> quoted $$y$$",
  },
  {
    name: "inline double-dollar math given a single dollar",
    markdown: "Text $$x$$ inline.",
    value: "a$b",
    expected: "Text $$a$b$$ inline.",
  },
  {
    name: "inline double-dollar math given two dollars",
    markdown: "Text $$x$$ inline.",
    value: "a$$b",
    expected: "Text $$$a$$b$$$ inline.",
  },
  {
    name: "single-dollar math",
    markdown: "Text $x$ inline.",
    value: "y",
    expected: "Text $y$ inline.",
  },
  {
    name: "display math",
    markdown: "- item\n\n  $$\n  x = 1\n  $$",
    value: "y = 2",
    expected: "- item\n\n  $$\n  y = 2\n  $$",
  },
]

describe("MarkdownBenchEditor math inside containers", () => {
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

  function editorBehind(selector: string): LexicalEditor {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Expected an editable element matching ${selector}`)
    const editor = getNearestEditorFromDOMNode(element)
    if (!editor) throw new Error("Expected a Lexical editor behind the element")
    return editor
  }

  async function savedAfterEditing(
    markdown: string,
    edit: () => void,
    documentFormat: MarkdownBenchDocumentFormat = "markdown",
  ) {
    const { changes, processingErrors } = await mountEditor(markdown, documentFormat)
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)
    await act(async () => {
      editor.update(edit)
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  test.each([
    ["display math after the first paragraph of a list item", "- item\n\n  $$\n  x = 1\n  $$"],
    ["display math opening a list item", "- $$\n  x = 1\n  $$"],
    ["display math opening a numbered item", "1. $$\n   x\n   $$"],
    ["display math in a blockquote", "> $$\n> x = 1\n> $$"],
    ["display math at the top level", "$$\nx = 1\n$$"],
  ])("keeps %s", async (_, markdown) => {
    expect(await saved(markdown)).toBe(markdown)
  })

  test.each([
    ["one-line display math in a list item", "- $$y = 1$$", "- $$\n  y = 1\n  $$"],
    ["one-line display math in a blockquote", "> $$y = 1$$", "> $$\n> y = 1\n> $$"],
    ["bracket display math in a list item", "- item\n\n  \\[x\\]", "- item\n\n  $$\n  x\n  $$"],
  ])("keeps %s inside its container", async (_, markdown, expected) => {
    expect(await saved(markdown)).toBe(expected)
  })

  test("renders display math in a list item as a block inside the item", async () => {
    await saved("- item\n\n  $$\n  x = 1\n  $$")

    const item = container.querySelector(CONTENT_ROOT_SELECTOR)?.querySelector("li")
    expect(item?.querySelector('[data-display="block"]')).not.toBeNull()
  })

  test.each([
    ["inline inequality", "Before $a<b$ after", "a<b"],
    ["HTML-looking block math", "$$\n<b>x</b>\n$$", "<b>x</b>"],
  ])("keeps %s out of HTML preparation", async (_, markdown, expectedValue) => {
    const { editorRef, processingErrors } = await mountEditor(markdown, "markdown")
    expect(processingErrors).toEqual([])
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
    editorBehind(CONTENT_ROOT_SELECTOR)
      .getEditorState()
      .read(() => {
        const [math] = $nodesOfType(BuddyMathNode)
        expect(math?.getValue()).toBe(expectedValue)
      })
    expect(editorRef.current?.getMarkdown()).not.toContain("\u2060")
  })

  describe("inline math", () => {
    test.each(INLINE_MATH_DOCUMENTS)("keeps $name on save", async ({ markdown }) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test.each(INLINE_MATH_DOCUMENTS)(
      "keeps $name when text elsewhere is edited",
      async ({ markdown, from, to }) => {
        expect(await savedAfterEditing(markdown, replaceTextReading(from, to))).toBe(
          markdown.replace(from, to),
        )
      },
    )

    test.each(MATH_VALUE_EDITS)(
      "keeps the delimiters of $name when its value is edited",
      async ({ markdown, value, expected }) => {
        expect(await savedAfterEditing(markdown, setMathValue(value))).toBe(expected)
      },
    )

    test("keeps inline double-dollar math in an MDX document", async () => {
      const markdown = "Text $$x$$ inline."

      expect(await saved(markdown, "mdx")).toBe(markdown)
      expect(await savedAfterEditing(markdown, replaceTextReading("inline", "words"), "mdx")).toBe(
        "Text $$x$$ words.",
      )
    })

    test("renders inline double-dollar math in display mode inside its paragraph", async () => {
      await saved("Text $$x$$ inline.")

      const paragraph = container.querySelector(CONTENT_ROOT_SELECTOR)?.querySelector("p")
      const math = paragraph?.querySelector(MATH_SELECTOR)
      expect(math?.querySelector(".katex-display")).not.toBeNull()
      expect(math?.getAttribute("data-display")).toBe("block")
      expect(math?.tagName).toBe("SPAN")
      expect(paragraph?.querySelector("div")).toBeNull()
      expect(paragraph?.textContent).toContain("Text")
      expect(paragraph?.textContent).toContain("inline.")
    })

    test("renders single-dollar math in text mode", async () => {
      await saved("Text $x$ inline.")

      const math = container
        .querySelector(CONTENT_ROOT_SELECTOR)
        ?.querySelector("p")
        ?.querySelector(MATH_SELECTOR)
      expect(math?.querySelector(".katex")).not.toBeNull()
      expect(math?.querySelector(".katex-display")).toBeNull()
      expect(math?.getAttribute("data-display")).toBe("inline")
    })

    test("renders display math in a list item as a block outside any paragraph", async () => {
      await saved("- item\n\n  $$\n  x = 1\n  $$")

      const math = container
        .querySelector(CONTENT_ROOT_SELECTOR)
        ?.querySelector("li")
        ?.querySelector(MATH_SELECTOR)
      expect(math?.tagName).toBe("DIV")
      expect(math?.closest("p")).toBeNull()
    })

    test("renders inline double-dollar math without React warnings", async () => {
      const consoleError = spyOn(console, "error").mockImplementation(() => undefined)
      try {
        await saved("- see $$a+b$$ here\n\n> quoted $$x$$")
        expect(consoleError.mock.calls).toEqual([])
      } finally {
        consoleError.mockRestore()
      }
    })

    test("edits inline double-dollar math in place and keeps its delimiters", async () => {
      const { changes, processingErrors } = await mountEditor("Text $$x$$ inline.", "markdown")
      const button = container.querySelector<HTMLElement>(`${MATH_SELECTOR} [role="button"]`)

      await act(async () => {
        button?.click()
        await flushEffects()
      })
      const input = container.querySelector<HTMLInputElement>(
        'input[aria-label="Edit inline math"]',
      )
      expect(input).not.toBeNull()
      await act(async () => {
        if (input) setInputValue(input, "a+b")
        await flushEffects()
      })

      expect(processingErrors).toEqual([])
      expect(changes.at(-1)).toBe("Text $$a+b$$ inline.")
    })

    test("opens saved math nodes that predate the placement field", async () => {
      const { processingErrors } = await mountEditor("Text", "markdown")
      const editor = editorBehind(CONTENT_ROOT_SELECTOR)
      const opened: { inline: boolean; display: boolean }[] = []

      await act(async () => {
        editor.update(() => {
          const savedNodes = [
            { displayMode: false, type: "buddy-math", value: "x", version: 1 },
            { displayMode: true, type: "buddy-math", value: "x", version: 1 },
            { displayMode: true, inline: true, type: "buddy-math", value: "x", version: 1 },
          ] as const
          for (const savedNode of savedNodes) {
            const mathNode = BuddyMathNode.importJSON(savedNode)
            opened.push({ inline: mathNode.isInline(), display: mathNode.getDisplayMode() })
          }
        })
        await flushEffects()
      })

      expect(processingErrors).toEqual([])
      expect(opened).toEqual([
        { inline: true, display: false },
        { inline: false, display: true },
        { inline: true, display: true },
      ])
    })
  })
})
