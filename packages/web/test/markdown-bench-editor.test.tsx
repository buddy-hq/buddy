import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown-bench-editor"
import { createMermaidThemeConfig } from "../src/components/media/renderers/mermaid/lib/theme"
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
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="test.md"
            onHistoryControlsChange={(controls) => {
              historyControls = controls
            }}
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
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
    expect(document.head.textContent).toContain("var(--background-stronger)")
    expect(document.head.textContent).toContain("var(--syntax-keyword)")
    expect(container.querySelector(".mdxeditor-toolbar")?.classList.contains("!hidden")).toBe(true)
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
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="test.md"
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
      await flushEffects(50)
    })

    const editor = container.querySelector('[data-component="markdown-bench-editor"]')
    expect(editor?.getAttribute("data-content-theme")).toBe("light")
    expect(editor).toBeInstanceOf(HTMLElement)
    if (editor instanceof HTMLElement) {
      expect(editor.className).toContain("px-[clamp")
      expect(editor.className).toContain("pt-[clamp")
    }
    const editable = container.querySelector<HTMLElement>('[aria-label="editable markdown"]')
    expect(editable?.className).toContain("px-[clamp")
    expect(editable?.className).toContain("py-[clamp")

    const themeStyle = container.querySelector<HTMLStyleElement>(
      "style[data-markdown-bench-content-theme-style]",
    )
    expect(themeStyle).not.toBeNull()
    expect(themeStyle?.hasAttribute("data-markdown-export-ignore")).toBe(true)
    expect(themeStyle?.textContent).toContain("color-scheme: light")
    expect(themeStyle?.textContent).toContain("--markdown-bench-document-font-scale: 1.15")
    expect(themeStyle?.textContent).toContain("--markdown-text: #111827;")
  })

  test("raises MDXEditor popup dialogs above the floating chat layer", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="Dialog layer test."
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="test.md"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const mdxEditor = container.querySelector<HTMLElement>(".mdxeditor")
    expect(mdxEditor?.className).toContain("markdown-bench-mdx-editor")

    const popupLayerStyle = container.querySelector<HTMLStyleElement>(
      "style[data-markdown-bench-mdx-popup-layer-style]",
    )
    expect(popupLayerStyle).not.toBeNull()
    expect(popupLayerStyle?.hasAttribute("data-markdown-export-ignore")).toBe(true)
    expect(popupLayerStyle?.textContent).toContain(
      ".markdown-bench-mdx-editor.mdxeditor-popup-container",
    )
    expect(popupLayerStyle?.textContent).toContain('[class*="_dialogOverlay_"]')
    expect(popupLayerStyle?.textContent).toContain('[role="dialog"]')
    expect(popupLayerStyle?.textContent).toContain("z-index: 60")
    expect(popupLayerStyle?.textContent).toContain("z-index: 61")
    expect(popupLayerStyle?.textContent).toContain("z-index: 62")
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
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="test.md"
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

  test("renders and serializes MDX components without executing them", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown = [
      "import Callout from './callout'",
      "",
      "# Lesson",
      "",
      '<Callout tone="info">Read {answer}.</Callout>',
    ].join("\n")

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
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const serialized = editorRef.current?.getMarkdown() ?? ""
    expect(serialized).toContain("import Callout from './callout'")
    expect(serialized).toContain('<Callout tone="info">')
    expect(serialized).toContain("{answer}")
    expect(container.textContent).toContain("Callout")
  })

  test("shows inline custom MDX component children in rich mode", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown = "Use <Term>evaporation</Term> to explain cooling."

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
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const component = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-mdx-component"]',
    )
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(component?.textContent).toContain("Term")
    expect(component?.textContent).toContain("evaporation")
    expect(editorRef.current?.getMarkdown() ?? "").toContain("<Term>evaporation</Term>")
  })

  test("shows invalid MDX in source mode with its parser error", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown={'# Broken\n\n<Component value={}>Content</Component>'}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(container.querySelector(".mdxeditor-source-editor")).not.toBeNull()
    expect(container.textContent).toContain("Error parsing markdown")
  })

  test("renders allowlisted intrinsic SVG without executing unsafe markup", async () => {
    const markdown = [
      '<div style="display:flex;justify-content:center;background:#f8fafc">',
      '  <strong style="color:#1a1a2e">Solid</strong>',
      '  <img src="./particle-model.png" alt="Particle model" onerror="alert(1)" />',
      '<svg width="140" height="120" viewBox="0 0 140 120" onload="alert(1)">',
      '  <circle cx="30" cy="25" r="10" fill="#4a9eed" stroke-width="1.5" />',
      '  <text x="20" y="110">Particle label</text>',
      "  <script>alert(1)</script>",
      "</svg>",
      '  <div style="font-size:13px">Regular lattice<br />Vibrate in place</div>',
      "</div>",
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
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const intrinsic = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-mdx-intrinsic"] > div',
    )
    const svg = container.querySelector('svg[data-component="markdown-bench-mdx-svg"]')
    const image = intrinsic?.querySelector("img")
    const circle = svg?.querySelector("circle")
    expect(intrinsic?.style.display).toBe("flex")
    expect(intrinsic?.style.justifyContent).toBe("center")
    expect(svg).not.toBeNull()
    expect(image?.getAttribute("src")).toContain("/api/file/raw/particle-model.png")
    expect(image?.getAttribute("src")).toContain("path=particle-model.png")
    expect(image?.getAttribute("onerror")).toBeNull()
    expect(intrinsic?.textContent).toContain("Solid")
    expect(intrinsic?.textContent).toContain("Particle label")
    expect(intrinsic?.textContent).toContain("Regular lattice")
    expect(circle?.getAttribute("stroke-width")).toBe("1.5")
    expect(svg?.querySelector("p")).toBeNull()
    expect(svg?.getAttribute("onload")).toBeNull()
    expect(svg?.querySelector("script")).toBeNull()
  })

  test("updates intrinsic previews when image nodes are added", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="<div><strong>No image yet</strong></div>"
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    expect(container.textContent).toContain("No image yet")
    expect(container.querySelector("img")).toBeNull()

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown='<div><img src="./particle-model.png" alt="Particle model" /></div>'
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const image = container.querySelector("img")
    expect(image?.getAttribute("src")).toContain("/api/file/raw/particle-model.png")
    expect(image?.getAttribute("alt")).toBe("Particle model")
  })

  test("renders educational admonitions with the full authoring toolbar", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const advancedToolbarContainer = document.createElement("div")
    document.body.appendChild(advancedToolbarContainer)

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            ref={editorRef}
            advancedToolbarContainer={advancedToolbarContainer}
            markdown={[":::tip", "Connect the particle model to observable evidence.", ":::"].join(
              "\n",
            )}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    expect(container.querySelector(".mdxeditor-toolbar")?.classList.contains("!hidden")).toBe(true)
    expect(
      advancedToolbarContainer.querySelector(
        '[data-component="markdown-bench-advanced-toolbar"]',
      ),
    ).not.toBeNull()
    expect(container.textContent).toContain("Connect the particle model")
    const admonition = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-admonition"][data-admonition-kind="tip"]',
    )
    expect(admonition).not.toBeNull()
    expect(admonition?.dataset.admonitionTone).toBe("success")
    expect(admonition?.textContent).toContain("Tip")
    expect(container.querySelector('[data-lexical-decorator="true"]')).not.toBeNull()
    expect(editorRef.current?.getMarkdown() ?? "").toContain(":::tip")
    advancedToolbarContainer.remove()
  })

  test("renders arbitrary container directives without switching to source mode", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown = [
      ":::answer-key",
      "## Answer Key",
      "",
      "1. C",
      "2. A",
      ":::",
    ].join("\n")

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
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const directive = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-container-directive"][data-directive-name="answer-key"]',
    )
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(directive).not.toBeNull()
    expect(directive?.textContent).toContain("Answer Key")
    expect(directive?.querySelector('[data-slot="markdown-bench-directive-label"]')).toBeNull()
    expect(directive?.querySelector("h2")?.textContent).toBe("Answer Key")
    expect(directive?.querySelectorAll("ol li").length).toBe(2)
    expect(editorRef.current?.getMarkdown() ?? "").toContain(":::answer-key")
  })

  test("parses and renders the complete educational MDX feature set", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown = [
      "---",
      "title: Complete lesson",
      "standard: MS-PS1-4",
      "---",
      "",
      "import QuizCard from './QuizCard'",
      "",
      "# Complete lesson",
      "",
      "**Bold evidence**, *careful reasoning*, and [a source](https://example.com).",
      "",
      "> Explain the observable evidence.",
      "",
      "- Solid",
      "- Liquid",
      "- Gas",
      "",
      "| State | Motion |",
      "| --- | --- |",
      "| Solid | Vibrates |",
      "",
      ":::tip",
      "Connect the particle model to evidence.",
      ":::",
      "",
      "```ts",
      "const states = 3",
      "```",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
      "```mermaid",
      "graph TD",
      "  Solid -->|heat| Liquid",
      "```",
      "",
      "![Particle diagram](https://example.com/particle.png)",
      "",
      "<!-- teacher annotation -->",
      '<div style="display:flex;gap:12px;background:#f8fafc;padding:12px">',
      "  <strong>Particle card</strong>",
      '  <img src="./particle.png" alt="Particles" />',
      '  <svg width="120" height="60" viewBox="0 0 120 60">',
      '    <circle cx="20" cy="30" r="10" fill="#4a9eed" />',
      '    <text x="40" y="35">Particle motion</text>',
      "  </svg>",
      "</div>",
      "",
      "<QuizCard>What changes when energy is added?</QuizCard>",
    ].join("\n")

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
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            contentTheme={{
              mermaidThemeConfig: TEST_MERMAID_THEME_CONFIG,
              mode: "print",
              variables: "--background-base: #ffffff;\n--markdown-text: #111827;",
            }}
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(container.querySelector("h1")?.textContent).toContain("Complete lesson")
    expect(container.querySelector("table")).not.toBeNull()
    expect(container.querySelector(".cm-editor")).not.toBeNull()
    expect(container.querySelector(".katex")).not.toBeNull()
    expect(container.querySelector('[data-component="markdown-bench-mermaid"]')).not.toBeNull()
    expect(
      container.querySelector('[data-component="mermaid-diagram-static-viewport"] svg')?.textContent,
    ).toContain("Mermaid")
    expect(container.querySelector('img[alt="Particles"]')).not.toBeNull()
    expect(
      container.querySelector('[data-component="markdown-bench-mdx-svg"] text')?.textContent,
    ).toBe("Particle motion")
    expect(container.querySelector('[data-component="markdown-bench-mdx-svg"] p')).toBeNull()
    expect(container.textContent).toContain("Connect the particle model")
    expect(container.textContent).toContain("QuizCard")

    const serialized = editorRef.current?.getMarkdown() ?? ""
    expect(serialized).toContain("import QuizCard from './QuizCard'")
    expect(serialized).toContain(":::tip")
    expect(serialized).toContain("| State | Motion")
    expect(serialized).toContain("![Particle diagram](https://example.com/particle.png)")
    expect(serialized).toContain("```mermaid")
    expect(serialized).toContain("{/* teacher annotation */}")
    expect(serialized).toContain("<svg")
  })
})
