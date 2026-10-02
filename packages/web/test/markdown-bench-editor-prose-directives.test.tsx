import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
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

const CALLOUT_CONTENT_SELECTOR =
  '[data-component="markdown-bench-obsidian-callout"] [contenteditable]'

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

describe("MarkdownBenchEditor prose directives on save", () => {
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

  async function savedAfterFocusingCallouts(markdown: string) {
    const { editorRef, processingErrors } = await mountEditor(markdown, "markdown")
    const bodies = Array.from(container.querySelectorAll<HTMLElement>(CALLOUT_CONTENT_SELECTOR))
    expect(bodies.length).toBeGreaterThan(0)
    await act(async () => {
      for (const body of bodies) {
        body.focus()
        body.blur()
      }
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return editorRef.current?.getMarkdown()
  }

  function describeSavedCases(cases: readonly (readonly [string, string, string])[]) {
    test.each(cases)("saves %s", async (_, markdown, expected) => {
      expect(await saved(markdown)).toBe(expected)
    })

    test.each(cases)("re-opens the saved %s unchanged", async (_, __, expected) => {
      expect(await saved(expected)).toBe(expected)
    })
  }

  describe("a leaf directive in a list item", () => {
    describeSavedCases([
      ["every item of a bullet list", "- ::before\n- ::after", "- \\::before\n- \\::after"],
      ["an item of an ordered list", "1. ::marker\n2. two", "1. \\::marker\n2. two"],
      ["a directive after a paragraph", "- item\n\n  ::before", "- item\n\n  \\::before"],
      [
        "a directive between paragraphs",
        "- item\n\n  ::before\n\n  after",
        "- item\n\n  \\::before\n\n  after",
      ],
      ["a directive before a paragraph", "- ::before\n\n  after", "- \\::before\n\n  after"],
      ["two directives in one item", "- ::one\n\n  ::two", "- \\::one\n\n  \\::two"],
      ["a directive with a label", "- ::youtube[Video]{#abc}", "- \\::youtube\\[Video]{#abc}"],
      ["a directive before a nested item", "- ::before\n  - child", "- \\::before\n  - child"],
      ["a directive in a nested item", "- parent\n  - ::child", "- parent\n  - \\::child"],
    ])
  })

  describe("a leaf directive outside a list item", () => {
    describeSavedCases([
      ["a quote", "> ::before", "> \\::before"],
      ["a quote after a paragraph", "> item\n>\n> ::before", "> item\n>\n> \\::before"],
      ["a document between paragraphs", "before\n\n::mid\n\nafter", "before\n\n\\::mid\n\nafter"],
    ])
  })

  describe("a text directive inside formatting", () => {
    describeSavedCases([
      ["bold text", "**ratio key:value here**", "**ratio key:value here**"],
      ["bold next to plain text", "plain **bold a:b bold** plain", "plain **bold a:b bold** plain"],
      ["italic text", "*it worked :D now*", "*it worked :D now*"],
      ["a link label", "[**see a:b**](https://x.com)", "[**see a:b**](https://x.com)"],
      ["bold italic text", "***both a:b***", "***both a:b***"],
      ["a directive with a label", "**bold :abbr[HTML] bold**", "**bold :abbr\\[HTML] bold**"],
      ["a bold directive label", ":abbr[**HTML**]", ":abbr\\[**HTML**]"],
    ])
  })

  describe("directive attributes", () => {
    describeSavedCases([
      [
        "a single-quoted value with inner double quotes",
        ":abbr{title='say \"hi\"'} text",
        ":abbr{title='say \"hi\"'} text",
      ],
      ["an unquoted value", ":abbr{title=x} text", ":abbr{title=x} text"],
      ["shorthand id and class in order", ":span[x]{.a #b}", ":span\\[x]{.a #b}"],
      ["shorthand class before id", ":span[x]{#b .a .c}", ":span\\[x]{#b .a .c}"],
      ["an empty block", ":span{} text", ":span{} text"],
      [
        "a leaf directive in a list item",
        "- ::video[Clip]{src='a \"b\"' .wide #main}",
        "- \\::video\\[Clip]{src='a \"b\"' .wide #main}",
      ],
      [
        "a bold text directive",
        "**see :abbr{title='say \"hi\"'} here**",
        "**see :abbr{title='say \"hi\"'} here**",
      ],
    ])
  })

  describe("in a callout body", () => {
    test.each([
      [
        "a leaf directive in each list item",
        "> [!note] T\n> - ::before\n> - ::after",
        "> [!note] T\n> - \\::before\n> - \\::after",
      ],
      [
        "a leaf directive after a paragraph",
        "> [!note] T\n> item\n>\n> ::before",
        "> [!note] T\n> item\n>\n> \\::before",
      ],
      [
        "a leaf directive with attributes in a list item",
        "> [!note] T\n> - ::video[Clip]{src='a \"b\"' .wide}",
        "> [!note] T\n> - \\::video\\[Clip]{src='a \"b\"' .wide}",
      ],
      [
        "bold text around a text directive",
        "> [!note] T\n> **see a:b here**",
        "> [!note] T\n> **see a:b here**",
      ],
    ])("saves %s", async (_, markdown, expected) => {
      expect(await savedAfterFocusingCallouts(markdown)).toBe(expected)
    })
  })
})
