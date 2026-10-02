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

type CalloutKindCase = {
  written: string
  label: string
  tone: string
}

const CALLOUT_KIND_CASES: readonly CalloutKindCase[] = [
  { written: "WARNING", label: "Warning", tone: "warning" },
  { written: "Warning", label: "Warning", tone: "warning" },
  { written: "NOTE", label: "Note", tone: "neutral" },
  { written: "TIP", label: "Tip", tone: "success" },
  { written: "IMPORTANT", label: "Important", tone: "info" },
  { written: "CAUTION", label: "Caution", tone: "warning" },
  { written: "Faq", label: "Question", tone: "info" },
  { written: "faq", label: "Question", tone: "info" },
  { written: "help", label: "Question", tone: "info" },
  { written: "tldr", label: "Abstract", tone: "neutral" },
  { written: "summary", label: "Abstract", tone: "neutral" },
  { written: "hint", label: "Tip", tone: "success" },
  { written: "check", label: "Success", tone: "success" },
  { written: "done", label: "Success", tone: "success" },
  { written: "attention", label: "Warning", tone: "warning" },
  { written: "fail", label: "Failure", tone: "critical" },
  { written: "missing", label: "Failure", tone: "critical" },
  { written: "cite", label: "Quote", tone: "neutral" },
  { written: "caution", label: "Caution", tone: "warning" },
  { written: "error", label: "Error", tone: "critical" },
  { written: "important", label: "Important", tone: "info" },
  { written: "danger", label: "Danger", tone: "critical" },
  { written: "mystery", label: "Note", tone: "neutral" },
]

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

describe("MarkdownBenchEditor callout kinds", () => {
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

  async function renderMarkdown(markdown: string) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
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
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })
    await commitNestedEditors(container)
    return editorRef
  }

  function readCallout() {
    const callout = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-obsidian-callout"]',
    )
    if (!callout) throw new Error("Expected a rendered Obsidian callout")
    return {
      kind: callout.getAttribute("data-admonition-kind"),
      tone: callout.getAttribute("data-admonition-tone"),
      label: callout.firstElementChild?.textContent,
    }
  }

  for (const testCase of CALLOUT_KIND_CASES) {
    test(`shows ${testCase.label} with the ${testCase.tone} tone for [!${testCase.written}]`, async () => {
      const markerLine = `> [!${testCase.written}]`
      const editorRef = await renderMarkdown([markerLine, "> Careful"].join("\n"))

      expect(readCallout()).toEqual({
        kind: testCase.written,
        tone: testCase.tone,
        label: testCase.label,
      })

      const serialized = editorRef.current?.getMarkdown() ?? ""
      expect(serialized).toContain(markerLine)
      expect(serialized).toContain("> Careful")
      expect(serialized).not.toContain(":::")
    })
  }

  test("keeps a custom title and the written kind for an upper-case alias", async () => {
    const markerLine = "> [!WARNING] Heads up"
    const editorRef = await renderMarkdown([markerLine, "> Careful"].join("\n"))

    expect(readCallout()).toEqual({ kind: "WARNING", tone: "warning", label: "Heads up" })
    expect(editorRef.current?.getMarkdown() ?? "").toContain(markerLine)
  })

  test("resolves the tone of a foldable callout written with a mixed-case alias", async () => {
    const markerLine = "> [!Faq]- Why does it fold?"
    const editorRef = await renderMarkdown([markerLine, "> Because."].join("\n"))

    const callout = container.querySelector('[data-component="markdown-bench-obsidian-callout"]')
    expect(callout?.tagName).toBe("DETAILS")
    expect(readCallout()).toEqual({ kind: "Faq", tone: "info", label: "Why does it fold?" })
    expect(editorRef.current?.getMarkdown() ?? "").toContain(markerLine)
  })

  test("keeps the exact-name behavior of plain admonition directives", async () => {
    const editorRef = await renderMarkdown([":::warning", "Careful", ":::"].join("\n"))

    const admonition = container.querySelector('[data-component="markdown-bench-admonition"]')
    expect(admonition?.getAttribute("data-admonition-kind")).toBe("warning")
    expect(admonition?.getAttribute("data-admonition-tone")).toBe("warning")
    expect(admonition?.firstElementChild?.textContent).toBe("Warning")
    expect(editorRef.current?.getMarkdown() ?? "").toContain(":::warning")
  })

  test("leaves a differently cased directive as a generic container", async () => {
    const editorRef = await renderMarkdown([":::Warning", "Careful", ":::"].join("\n"))

    expect(container.querySelector('[data-component="markdown-bench-admonition"]')).toBeNull()
    expect(
      container
        .querySelector('[data-component="markdown-bench-container-directive"]')
        ?.getAttribute("data-directive-name"),
    ).toBe("Warning")
    expect(editorRef.current?.getMarkdown() ?? "").toContain(":::Warning")
  })
})
