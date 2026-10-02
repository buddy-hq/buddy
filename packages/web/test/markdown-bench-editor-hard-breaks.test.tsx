import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  BLUR_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  getNearestEditorFromDOMNode,
  type LexicalEditor,
} from "lexical"
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
const MDX_COMPONENT_CONTENT_SELECTOR =
  "[data-component=markdown-bench-mdx-component] [contenteditable]"
const CALLOUT_CONTENT_SELECTOR =
  '[data-component="markdown-bench-obsidian-callout"] [contenteditable]'

type SavedHardBreakCase = {
  name: string
  markdown: string
  saved?: string
  documentFormat?: MarkdownBenchDocumentFormat
}

const SAVED_HARD_BREAK_CASES: SavedHardBreakCase[] = [
  { name: "a trailing-spaces hard break", markdown: "line one  \nline two" },
  { name: "a backslash hard break", markdown: "line one\\\nline two" },
  {
    name: "hard breaks in a list item and a quote",
    markdown: "- one  \n  two\n- three\n\n> quoted\\\n> again",
  },
  {
    name: "both hard break styles in one paragraph",
    markdown: "line one  \nline two\\\nline three",
  },
  { name: "a soft line break", markdown: "line one\nline two" },
  { name: "two paragraphs in a list item", markdown: "- one\n\n  two\n- three" },
  {
    name: "a hard break in a list item with two paragraphs",
    markdown: "- one  \n  two\n\n  three\\\n  four\n- five",
  },
  { name: "a hard break after bold text", markdown: "**line one**\\\nline two" },
  { name: "a hard break before a link", markdown: "line one  \n[link](https://example.com)" },
  {
    name: "a trailing-spaces hard break in a setext heading",
    markdown: "line one  \nline two\n========",
  },
  {
    name: "a backslash hard break in a setext heading",
    markdown: "line one\\\nline two\n--------",
  },
  {
    name: "a trailing-spaces hard break in a callout",
    markdown: "> [!note] Title\n> line one  \n> line two",
  },
  {
    name: "a backslash hard break in a callout",
    markdown: "> [!note] Title\n> line one\\\n> line two",
  },
  { name: "two backslash hard breaks in a row", markdown: "a\\\n\\\nb" },
  {
    name: "a trailing-spaces hard break and a backslash hard break in a row",
    markdown: "a  \n\\\nb",
  },
  { name: "three backslash hard breaks in a row", markdown: "a\\\n\\\n\\\nb" },
  {
    name: "a trailing-spaces hard break with extra spaces",
    markdown: "line one    \nline two",
    saved: "line one  \nline two",
  },
  {
    name: "trailing spaces at the end of a paragraph",
    markdown: "line one  \n\nline two",
    saved: "line one\n\nline two",
  },
  {
    name: "both hard break styles in MDX",
    markdown: "line one  \nline two\\\nline three",
    documentFormat: "mdx",
  },
  {
    name: "hard breaks in a list item and a quote in MDX",
    markdown: "- one  \n  two\n- three\n\n> quoted\\\n> again",
    documentFormat: "mdx",
  },
  {
    name: "a trailing-spaces hard break inside an inline MDX component",
    markdown: "Text <Badge>line one  \nline two</Badge> after",
    documentFormat: "mdx",
  },
]

const HARD_BREAKS_LEFT_AT_PARAGRAPH_END = [
  { style: "backslash", markdown: "line one\\\nline two\n\nnext" },
  { style: "trailing-spaces", markdown: "line one  \nline two\n\nnext" },
]

const HARD_BREAKS_IN_INLINE_MDX_COMPONENTS = [
  { style: "backslash", markdown: "Text <Badge>line one\\\nline two</Badge> after" },
  { style: "trailing-spaces", markdown: "Text <Badge>line one  \nline two</Badge> after" },
]

function textNodeReading(text: string) {
  const textNode = $getRoot()
    .getAllTextNodes()
    .find((candidate) => candidate.getTextContent() === text)
  if (!textNode) throw new Error(`Expected text reading "${text}"`)
  return textNode
}

describe("MarkdownBenchEditor hard breaks", () => {
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

  function editorBehind(selector: string): LexicalEditor {
    const element = container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`Expected an editable element matching ${selector}`)
    const editor = getNearestEditorFromDOMNode(element)
    if (!editor) throw new Error("Expected a Lexical editor behind the element")
    return editor
  }

  async function savedAfterEditing(markdown: string, edit: () => void) {
    const { changes, processingErrors } = await mountEditor(markdown, "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)
    await act(async () => {
      editor.update(edit)
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  async function focusAndLeaveCallouts() {
    const bodies = Array.from(container.querySelectorAll<HTMLElement>(CALLOUT_CONTENT_SELECTOR))
    expect(bodies.length).toBeGreaterThan(0)
    await act(async () => {
      for (const body of bodies) {
        body.focus()
        body.blur()
      }
      await flushEffects()
    })
  }

  async function savedAfterFocusingCallouts(markdown: string) {
    const { editorRef, processingErrors } = await mountEditor(markdown, "markdown")
    await focusAndLeaveCallouts()
    expect(processingErrors).toEqual([])
    return editorRef.current?.getMarkdown()
  }

  async function placeCaret(editor: LexicalEditor, text: string, offset: number) {
    await act(async () => {
      editor.update(() => {
        textNodeReading(text).select(offset, offset)
      })
      await flushEffects()
    })
  }

  async function pressShiftEnter(editor: LexicalEditor) {
    await act(async () => {
      editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false)
      await flushEffects()
    })
  }

  for (const savedCase of SAVED_HARD_BREAK_CASES) {
    const documentFormat = savedCase.documentFormat ?? "markdown"
    test(`keeps ${savedCase.name}`, async () => {
      const { editorRef, processingErrors } = await mountEditor(savedCase.markdown, documentFormat)

      expect(processingErrors).toEqual([])
      expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
      expect(editorRef.current?.getMarkdown()).toBe(savedCase.saved ?? savedCase.markdown)
    })
  }

  test("keeps both hard break styles when text after them is edited", async () => {
    const saved = await savedAfterEditing("line one  \nline two\\\nline three", () => {
      const lastText = textNodeReading("line three")
      lastText.setTextContent(`${lastText.getTextContent()} edited`)
    })

    expect(saved).toBe("line one  \nline two\\\nline three edited")
  })

  test("keeps a hard break when text before it is edited", async () => {
    const saved = await savedAfterEditing("line one  \nline two", () => {
      const firstText = textNodeReading("line one")
      firstText.setTextContent(`${firstText.getTextContent()} edited`)
    })

    expect(saved).toBe("line one edited  \nline two")
  })

  for (const { style, markdown } of HARD_BREAKS_LEFT_AT_PARAGRAPH_END) {
    test(`saves no stray marker for a ${style} hard break left at the end of a paragraph`, async () => {
      const saved = await savedAfterEditing(markdown, () => {
        textNodeReading("line two").remove()
      })

      expect(saved).toBe("line one\n\n\nnext")
    })
  }

  test("keeps both line breaks when one is typed right after a hard break", async () => {
    const saved = await savedAfterEditing("line one\\\nline two", () => {
      textNodeReading("line two").insertBefore($createLineBreakNode())
    })

    expect(saved).toBe("line one\\\n\\\nline two")
  })

  test("saves a typed line break as a trailing-spaces hard break that loads back as a line break", async () => {
    const { changes, processingErrors } = await mountEditor("Bodytext", "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)

    await placeCaret(editor, "Bodytext", 4)
    await pressShiftEnter(editor)

    const saved = changes.at(-1)
    expect(processingErrors).toEqual([])
    expect(saved).toBe("Body  \ntext")
    expect(saved).not.toContain("&#x20;")

    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    root = createQueryTestRoot(container)
    const remounted = await mountEditor(saved ?? "", "markdown")

    expect(remounted.processingErrors).toEqual([])
    expect(remounted.editorRef.current?.getMarkdown()).toBe(saved)
    expect(
      editorBehind(CONTENT_ROOT_SELECTOR)
        .getEditorState()
        .read(() =>
          $getRoot()
            .getAllTextNodes()
            .map((textNode) => textNode.getTextContent()),
        ),
    ).toEqual(["Body", "text"])
  })

  test("saves two typed line breaks in a row with a backslash for the second", async () => {
    const { changes, processingErrors } = await mountEditor("Bodytext", "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)

    await placeCaret(editor, "Bodytext", 4)
    await pressShiftEnter(editor)
    await pressShiftEnter(editor)

    expect(processingErrors).toEqual([])
    expect(changes.at(-1)).toBe("Body  \n\\\ntext")
  })

  test("saves a typed line break at the start of a paragraph with a backslash", async () => {
    const { changes, processingErrors } = await mountEditor("Bodytext", "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)

    await placeCaret(editor, "Bodytext", 0)
    await pressShiftEnter(editor)

    expect(processingErrors).toEqual([])
    expect(changes.at(-1)).toBe("\\\nBodytext")
  })

  test("saves no hard break marker for a typed line break at the end of a paragraph", async () => {
    const { changes, processingErrors } = await mountEditor("Body\n\nnext", "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)

    await placeCaret(editor, "Body", 4)
    await pressShiftEnter(editor)

    expect(processingErrors).toEqual([])
    expect(changes.at(-1)).toBe("Body\n\n\nnext")
  })

  test("saves a typed line break in a list item as a trailing-spaces hard break", async () => {
    const { changes, processingErrors } = await mountEditor("- onetwo\n- three", "markdown")
    const editor = editorBehind(CONTENT_ROOT_SELECTOR)

    await placeCaret(editor, "onetwo", 3)
    await pressShiftEnter(editor)

    expect(processingErrors).toEqual([])
    expect(changes.at(-1)).toBe("- one  \n  two\n- three")
  })

  test("saves a typed line break inside a callout as a trailing-spaces hard break", async () => {
    const { editorRef, processingErrors } = await mountEditor("> [!note] T\n> Bodytext", "markdown")
    const editor = editorBehind(CALLOUT_CONTENT_SELECTOR)

    await placeCaret(editor, "Bodytext", 4)
    await pressShiftEnter(editor)
    await focusAndLeaveCallouts()

    expect(processingErrors).toEqual([])
    expect(editorRef.current?.getMarkdown()).toBe("> [!note] T\n> Body  \n> text")
  })

  test("saves no stray backslash for two hard breaks in a row left at the end of a paragraph", async () => {
    const saved = await savedAfterEditing("a\\\n\\\nb\n\nnext", () => {
      textNodeReading("b").remove()
    })

    expect(saved).toBe("a\n\n\n\nnext")
  })

  test("keeps two backslash hard breaks in a row in a callout after focusing and leaving it", async () => {
    const markdown = "> [!note] T\n> a\\\n> \\\n> b"

    expect(await savedAfterFocusingCallouts(markdown)).toBe(markdown)
  })

  test("keeps a trailing-spaces hard break as a backslash once the text before it is removed", async () => {
    const saved = await savedAfterEditing("line one  \nline two", () => {
      textNodeReading("line one").remove()
    })

    expect(saved).toBe("\\\nline two")
  })

  test("saves a space for a hard break moved into a heading that cannot hold one", async () => {
    const saved = await savedAfterEditing("### Title\n\nline one  \nline two", () => {
      const [heading, paragraph] = $getRoot().getChildren()
      if (!$isElementNode(heading) || !$isElementNode(paragraph)) {
        throw new Error("Expected a heading followed by a paragraph")
      }
      heading.append($createTextNode(" "), ...paragraph.getChildren())
      paragraph.remove()
    })

    expect(saved).toBe("### Title line one line two")
  })

  for (const { style, markdown } of HARD_BREAKS_IN_INLINE_MDX_COMPONENTS) {
    test(`keeps a ${style} hard break inside an inline MDX component after editing it`, async () => {
      const { changes, processingErrors } = await mountEditor(markdown, "mdx")
      const componentEditor = editorBehind(MDX_COMPONENT_CONTENT_SELECTOR)

      await act(async () => {
        componentEditor.update(
          () => {
            const lastText = textNodeReading("line two")
            lastText.setTextContent(`${lastText.getTextContent()} edited`)
          },
          { discrete: true },
        )
        componentEditor.dispatchCommand(BLUR_COMMAND, new FocusEvent("blur"))
        await flushEffects()
      })

      expect(processingErrors).toEqual([])
      expect(changes.at(-1)).toBe(markdown.replace("line two", "line two edited"))
    })
  }
})
