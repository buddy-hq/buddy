import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MarkdownBenchEditor } from "../src/components/bench/markdown-bench-editor"
import { createMermaidThemeConfig } from "../src/components/chat/tools/render/mermaid/lib/theme"
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

const TEST_MERMAID_THEME_CONFIG = createMermaidThemeConfig({
  backgroundBase: "#ffffff",
  borderBase: "#d1d5db",
  surfaceBase: "#ffffff",
  surfaceRaisedBase: "#f8fafc",
  surfaceWeak: "#f3f4f6",
  textBase: "#111827",
  textInteractiveBase: "#1d4ed8",
  textInvertBase: "#ffffff",
  textStrong: "#030712",
  textWeak: "#374151",
})

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

describe("MarkdownBenchEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.assign(globalThis, {
      __BUDDY_TEST_MERMAID_RUNTIME__: {
        initialize() {},
        render() {
          return {
            svg: '<svg viewBox="0 0 120 40"><text x="8" y="20">Mermaid</text></svg>',
          }
        },
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
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
    Reflect.deleteProperty(globalThis, "__BUDDY_TEST_MERMAID_RUNTIME__")
    document.head.replaceChildren()
  })

  test("renders editable Buddy math and themed code blocks", async () => {
    let historyControls = { canRedo: true, canUndo: true }
    const markdown = [
      "# Document",
      "",
      String.raw`Inline \(E = mc^2\).`,
      "",
      String.raw`\[\ce{H2O}\]`,
      "",
      "```ts",
      "const answer = 42",
      "```",
      "",
      "```mermaid",
      "graph TD",
      "A-->B",
      "```",
    ].join("\n")

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown={markdown}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            onHistoryControlsChange={(controls) => {
              historyControls = controls
            }}
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    const mathNodes = container.querySelectorAll('[data-component="markdown-bench-math"]')
    expect(mathNodes.length).toBe(2)
    expect(container.querySelector(".katex")).not.toBeNull()

    const inlineMathButton = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-math"][data-display="inline"] [role="button"]',
    )
    expect(inlineMathButton).not.toBeNull()

    await act(async () => {
      inlineMathButton?.click()
      await flushEffects()
    })

    expect(container.querySelector('input[aria-label="Edit inline math"]')).not.toBeNull()
    expect(container.querySelector(".cm-editor")).not.toBeNull()
    expect(container.querySelector('[data-component="markdown-bench-mermaid"]')).not.toBeNull()
    expect(document.head.textContent).toContain("var(--background-stronger)")
    expect(document.head.textContent).toContain("var(--syntax-keyword)")
    expect(container.querySelector(".mdxeditor-toolbar")).toBeNull()
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(historyControls).toEqual({ canRedo: false, canUndo: false })
  })

  test("scopes document theme and text scale to the editor content", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="Themed document."
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            contentFontScale={1.15}
            contentTheme={{
              mermaidThemeConfig: TEST_MERMAID_THEME_CONFIG,
              mode: "light",
              variables: "--background-base: #ffffff;\n--markdown-text: #111827;",
            }}
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const editor = container.querySelector('[data-component="markdown-bench-editor"]')
    expect(editor?.getAttribute("data-content-theme")).toBe("light")

    const themeStyle = container.querySelector<HTMLStyleElement>(
      "style[data-markdown-bench-content-theme-style]",
    )
    expect(themeStyle).not.toBeNull()
    expect(themeStyle?.hasAttribute("data-markdown-export-ignore")).toBe(true)
    expect(themeStyle?.textContent).toContain("color-scheme: light")
    expect(themeStyle?.textContent).toContain("--markdown-bench-document-font-scale: 1.15")
    expect(themeStyle?.textContent).toContain("--markdown-text: #111827;")
  })

  test("reports rendered document selections without an explicit action", async () => {
    let selectedMarkdown = ""
    let selectedHeadingPath: string[] | undefined

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown={["# Lesson", "", "## Prompt", "", "Select this sentence."].join("\n")}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            onChange={() => {}}
            onSelectionChange={(selection) => {
              selectedMarkdown = selection.text
              selectedHeadingPath = selection.headingPath
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const textNode = Array.from(container.querySelectorAll('[data-lexical-text="true"]'))
      .map((element) => element.firstChild)
      .find((node) => node?.textContent === "Select this sentence.")
    if (!(textNode instanceof Text)) {
      throw new Error("Expected rendered Markdown text")
    }

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, "Select this".length)
    Object.defineProperty(range, "getClientRects", {
      value: () => [
        { top: 120, height: 18 },
        { top: 180, height: 18 },
      ],
    })
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const editor = container.querySelector<HTMLElement>('[data-component="markdown-bench-editor"]')
    if (!editor) {
      throw new Error("Expected Markdown bench editor")
    }
    Object.defineProperty(editor, "getBoundingClientRect", {
      value: () => ({ top: 100 }),
    })

    await act(async () => {
      editor.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))
      await flushEffects(20)
    })

    expect(selectedMarkdown).toBe("Select this")
    expect(selectedHeadingPath).toEqual(["Lesson", "Prompt"])

    const selectionSection = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-selection-section"]',
    )
    expect(selectionSection).not.toBeNull()
    expect(selectionSection?.style.top).toBe("20px")
    expect(selectionSection?.style.height).toBe("78px")
    expect(selectionSection?.className).toContain("right-0")
    expect(selectionSection?.className).toContain("--surface-warning-base")

    const selectionEdge = selectionSection?.querySelector<HTMLElement>(
      '[data-component="markdown-bench-selection-edge"]',
    )
    expect(selectionEdge).not.toBeNull()
    expect(selectionEdge?.style.width).toBe("3px")
    expect(selectionEdge?.className).toContain("bg-border-warning-base")
  })
})
