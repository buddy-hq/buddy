import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { commitNestedEditors } from "./markdown-bench-nested-editors"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import { ThemeProvider } from "../src/theme"

const CALLOUT_SELECTOR = '[data-component="markdown-bench-obsidian-callout"]'

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

describe("MarkdownBenchEditor callout round trip", () => {
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

  async function mountEditor(markdown: string) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const processingErrors: unknown[] = []
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
            documentFormat="markdown"
            path="Callouts.md"
            onChange={() => {}}
            onProcessingResult={(result) => {
              if (result.error) processingErrors.push(result.error)
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })
    await commitNestedEditors(container)
    return {
      processingErrors,
      callouts: Array.from(container.querySelectorAll<HTMLElement>(CALLOUT_SELECTOR)),
      serialized: editorRef.current?.getMarkdown() ?? "",
    }
  }

  test("keeps the text after a bare ::: line inside the callout", async () => {
    const { processingErrors, callouts, serialized } = await mountEditor(
      ["> [!note] T", "> before", "> :::", "> after"].join("\n"),
    )

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.textContent).toContain("after")
    expect(serialized).toBe(["> [!note] T", "> before", "> \\:::", "> after"].join("\n"))
  })

  test("keeps a container directive in a callout body as plain syntax", async () => {
    const { processingErrors, callouts, serialized } = await mountEditor(
      ["> [!note] T", "> :::tip", "> inner", "> :::", "> after"].join("\n"),
    )

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(container.textContent).not.toContain(":::")
    expect(serialized).toBe(
      ["> [!note] T", "> :::tip", "> inner", "> :::", ">", "> after"].join("\n"),
    )
  })

  test("keeps a ::: line inside a fenced code block in the callout", async () => {
    const markdown = ["> [!note] T", "> ```md", "> :::", "> ```"].join("\n")

    const { processingErrors, callouts, serialized } = await mountEditor(markdown)

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(serialized).toBe(markdown)
  })

  test("keeps a ::: line after a fenced code block inside the callout", async () => {
    const { processingErrors, callouts, serialized } = await mountEditor(
      ["> [!note] T", "> ```md", "> :::", "> ```", "> :::", "> tail"].join("\n"),
    )

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.textContent).toContain("tail")
    expect(serialized).toBe(
      ["> [!note] T", "> ```md", "> :::", "> ```", ">", "> \\:::", "> tail"].join("\n"),
    )
  })

  test("renders a callout nested in a callout and saves the nesting", async () => {
    const { processingErrors, callouts, serialized } = await mountEditor(
      ["> [!note] Outer", "> text", "> > [!tip] Inner", "> > inner text"].join("\n"),
    )

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(2)
    expect(callouts[0]?.contains(callouts[1] ?? null)).toBe(true)
    expect(callouts[1]?.textContent).toContain("Inner")
    expect(callouts[1]?.textContent).toContain("inner text")
    expect(container.textContent).not.toContain("[!tip]")
    expect(serialized).toBe(
      ["> [!note] Outer", "> text", ">", "> > [!tip] Inner", "> > inner text"].join("\n"),
    )
  })

  test("keeps a lazy continuation line in the callout and saves it quoted", async () => {
    const { processingErrors, callouts, serialized } = await mountEditor(
      ["> [!note] T", "> body", "lazy continuation", "", "next"].join("\n"),
    )

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.textContent).toContain("lazy continuation")
    expect(callouts[0]?.textContent).not.toContain("next")
    expect(serialized).toBe(["> [!note] T", "> body", "> lazy continuation", "", "next"].join("\n"))
  })

  test("keeps a list right after a callout outside it", async () => {
    const markdown = ["> [!note] T", "> body", "- item", "- other"].join("\n")

    const { processingErrors, callouts, serialized } = await mountEditor(markdown)

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.textContent).not.toContain("item")
    expect(callouts[0]?.querySelector("li")).toBeNull()
    expect(serialized).toBe(["> [!note] T", "> body", "", "- item", "- other"].join("\n"))
  })

  test("renders a callout before a ... line because only --- closes frontmatter", async () => {
    const { processingErrors, callouts, serialized } = await mountEditor(
      ["---", "> [!tip] Evidence", "> Body.", "..."].join("\n"),
    )

    expect(processingErrors).toEqual([])
    expect(callouts).toHaveLength(1)
    expect(callouts[0]?.textContent).toContain("Evidence")
    expect(serialized).toContain("> [!tip] Evidence\n> Body.")
    expect(serialized).not.toContain("\\[!tip]")
  })
})
