import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Z_INDEX } from "@buddy/ui"
import { readCitationPromptPart, type Citation } from "@buddy/citation-contract"
import { BenchSurfaceActivityProvider } from "../src/components/bench/bench-surface-activity"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
  type MarkdownBenchProcessingResult,
} from "../src/components/bench/markdown/editor"
import {
  EXPLORER_EMBEDDED_MARKDOWN_LOADER,
  type ObsidianWikiLinkContext,
} from "../src/components/bench/markdown/plugins/obsidian"
import {
  registerCitationNavigationHandler,
  requestCitationNavigation,
} from "../src/lib/citations/navigation"
import { createMermaidThemeConfig } from "../src/components/media/renderers/mermaid/lib/theme"
import { ThemeProvider } from "../src/theme"

// Bun fails to evaluate @uiw/file-icons SVGs when this file also loads MDX editor CSS.
mock.module("@/components/files/file-type-icon", () => ({
  FileTypeIcon: () => null,
  createFileTypeIconElement: () => document.createElement("span"),
  resolveFileTypeIconUrl: () => "",
}))

const { useMarkdownBenchSelectionSync } =
  await import("../src/components/bench/markdown/use-selection-sync")
const { getPromptDraft, usePromptStore } = await import("../src/state/prompt-store")

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

function popupHost() {
  return document.querySelector<HTMLElement>(".markdown-bench-mdx-editor.mdxeditor-popup-container")
    ?.parentElement
}

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

const EXTERNAL_MARKDOWN_PATH = "/tmp/external-notes/outside.md"
const READ_ONLY_CITATION_PROMPT_KEY = "read-only-citation-prompt"

function ReadOnlyCitationHarness(props: { markdown: string }) {
  const citeSelection = useMarkdownBenchSelectionSync({
    path: EXTERNAL_MARKDOWN_PATH,
    promptKey: READ_ONLY_CITATION_PROMPT_KEY,
    version: "external-version",
  })
  return (
    <MarkdownBenchEditor
      markdown={props.markdown}
      version="external-version"
      dirty={false}
      saving={false}
      conflict={false}
      directory="/tmp/test-dir"
      documentFormat="markdown"
      path={EXTERNAL_MARKDOWN_PATH}
      readOnly
      onChange={() => {}}
      onCiteSelection={citeSelection}
    />
  )
}

function selectRenderedText(container: HTMLElement, text: string, length: number) {
  const textNode = Array.from(container.querySelectorAll('[data-lexical-text="true"]'))
    .map((element) => element.firstChild)
    .find((node) => node?.textContent === text)
  if (!(textNode instanceof Text)) {
    throw new Error("Expected rendered Markdown text")
  }
  const range = document.createRange()
  range.setStart(textNode, 0)
  range.setEnd(textNode, length)
  const selectionRects = [{ top: 120, height: 18 }]
  Object.assign(selectionRects, {
    item: (index: number) => selectionRects[index] ?? null,
  })
  Object.defineProperty(range, "getClientRects", { value: () => selectionRects })
  Object.defineProperty(range, "cloneRange", { value: () => range })
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
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
            path="test — 01M0SHCWXGYA3ZV63GE13HTS24.md"
            title="test"
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
    expect(document.head.textContent).toContain("var(--buddy-code-font-size)")
    expect(document.head.textContent).toContain("var(--buddy-font-family-mono)")
    const editorChromeStyle = container.querySelector<HTMLStyleElement>(
      "style[data-markdown-bench-mdx-popup-layer-style]",
    )
    expect(editorChromeStyle?.textContent).toContain('[class*="_codeMirrorWrapper_"]')
    expect(editorChromeStyle?.textContent).toContain("position: static")
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
    expect(editable?.className).not.toContain("px-[clamp")
    expect(editable?.className).toContain("!px-0")
    expect(editable?.className).toContain("!pt-0")
    expect(editable?.className).toContain("var(--buddy-document-font-size)")
    expect(editable?.className).toContain("var(--buddy-document-font-family)")
    expect(editable?.className).toContain("[&_h1]:!text-[1.618em]")
    expect(editable?.className).toContain("[&_h2]:!text-[1.462em]")
    expect(editable?.className).toContain("[&_h6]:!leading-[1.5]")

    const noteTitle = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-note-title"]',
    )
    expect(noteTitle?.getAttribute("role")).toBe("heading")
    expect(noteTitle?.getAttribute("aria-level")).toBe("1")
    expect(noteTitle?.hasAttribute("data-markdown-export-ignore")).toBe(true)
    const documentContent = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-document-content"]',
    )
    expect(documentContent?.className).toContain("px-[clamp")
    expect(noteTitle?.parentElement?.getAttribute("data-component")).toBe(
      "markdown-bench-note-title-row",
    )
    expect(noteTitle?.parentElement?.parentElement).toBe(documentContent)
    expect(
      container.querySelector('[data-component="markdown-bench-properties-toggle"]'),
    ).toBeNull()
    expect(documentContent?.contains(editable ?? null)).toBe(true)

    const noteTitleInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Note title"]',
    )
    expect(noteTitleInput?.value).toBe("test")
    expect(noteTitleInput?.readOnly).toBe(true)

    const themeStyle = container.querySelector<HTMLStyleElement>(
      "style[data-markdown-bench-content-theme-style]",
    )
    expect(themeStyle).not.toBeNull()
    expect(themeStyle?.hasAttribute("data-markdown-export-ignore")).toBe(true)
    expect(themeStyle?.textContent).toContain("color-scheme: light")
    expect(themeStyle?.textContent).toContain("--markdown-bench-document-font-scale: 1.15")
    expect(themeStyle?.textContent).toContain("--markdown-text: #111827;")
  })

  test("reveals note properties from the title info control", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="Document body."
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="test.md"
            properties={[
              { name: "buddy-id", kind: "text", text: "01K4Z7Q9M2C8V3N5B6X1R0T2YH" },
              { name: "done", kind: "checkbox", checked: false },
            ]}
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="markdown-bench-properties"]')).toBeNull()
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-component="markdown-bench-properties-toggle"]',
    )
    expect(toggle?.getAttribute("aria-label")).toBe("Show properties")
    expect(toggle?.getAttribute("aria-pressed")).toBe("false")
    expect(toggle?.hasAttribute("data-markdown-export-ignore")).toBe(true)

    await act(async () => {
      toggle?.click()
      await flushEffects()
    })

    const properties = container.querySelector<HTMLElement>(
      '[data-component="markdown-bench-properties"]',
    )
    const table = properties?.querySelector('table[aria-label="Properties"]')
    const rows = Array.from(table?.querySelectorAll("tr") ?? []).map((row) =>
      Array.from(row.children).map((cell) => cell.textContent),
    )
    expect(properties?.hasAttribute("data-markdown-export-ignore")).toBe(true)
    expect(toggle?.getAttribute("aria-label")).toBe("Hide properties")
    expect(toggle?.getAttribute("aria-pressed")).toBe("true")
    expect(rows).toEqual([
      ["buddy-id", "01K4Z7Q9M2C8V3N5B6X1R0T2YH"],
      ["done", "No"],
    ])
  })

  test("commits an edited inline note title on blur", async () => {
    const renamedTitles: string[] = []
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="Document body."
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="Original note.md"
            onChange={() => {}}
            onRenameTitle={async (title) => {
              renamedTitles.push(title)
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const titleInput = container.querySelector<HTMLInputElement>('input[aria-label="Note title"]')
    expect(titleInput).not.toBeNull()
    expect(titleInput?.readOnly).toBe(false)

    await act(async () => {
      if (!titleInput) return
      titleInput.focus()
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(titleInput, "Renamed note")
      titleInput.dispatchEvent(new Event("input", { bubbles: true }))
      titleInput.blur()
      await flushEffects()
    })

    expect(renamedTitles).toEqual(["Renamed note"])
  })

  test("locks the title and document body while a rename is running", async () => {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="Document body."
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="markdown"
            path="Original note.md"
            renamingTitle
            onChange={() => {}}
            onRenameTitle={async () => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const titleInput = container.querySelector<HTMLInputElement>('input[aria-label="Note title"]')
    const editable = container.querySelector<HTMLElement>('[aria-label="editable markdown"]')
    expect(titleInput?.readOnly).toBe(true)
    expect(editable?.getAttribute("contenteditable")).toBe("false")
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
    // Popups clear the chat's floating layer; the editor's own dialogs sit on the
    // modal layer, backdrop and content together so nesting stacks by DOM order.
    expect(popupLayerStyle?.textContent).toContain(`z-index: ${Z_INDEX.floating}`)
    expect(popupLayerStyle?.textContent).toContain(`z-index: ${Z_INDEX.modal}`)
    expect(Z_INDEX.floating).toBeGreaterThan(Z_INDEX.modal)
  })

  test("hides MDXEditor popups while the Bench surface is parked", async () => {
    function renderEditor(surfaceActive: boolean) {
      root.render(
        <ThemeProvider>
          <BenchSurfaceActivityProvider value={surfaceActive}>
            <MarkdownBenchEditor
              markdown="[Guide](https://example.com/guide)"
              version="version-1"
              dirty={false}
              saving={false}
              conflict={false}
              directory="/tmp/test-dir"
              documentFormat="markdown"
              path="test.md"
              onChange={() => {}}
            />
          </BenchSurfaceActivityProvider>
        </ThemeProvider>,
      )
    }
    await act(async () => {
      renderEditor(true)
      await flushEffects()
    })
    expect(popupHost()?.parentElement).toBe(document.body)
    expect(popupHost()?.hidden).toBe(false)

    await act(async () => {
      renderEditor(false)
      await flushEffects()
    })
    expect(popupHost()?.hidden).toBe(true)

    await act(async () => {
      renderEditor(true)
      await flushEffects()
    })
    expect(popupHost()?.hidden).toBe(false)

    const host = popupHost()
    expect(host).toBeDefined()
    await act(async () => {
      root.render(null)
      await flushEffects()
    })
    expect(host?.isConnected).toBe(false)
  })

  test("commits a rendered document selection only after Cite is activated", async () => {
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
            onCiteSelection={(selection) => {
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
    const selectionRects = [{ top: 120, height: 18 }]
    Object.assign(selectionRects, {
      item: (index: number) => selectionRects[index] ?? null,
    })
    Object.defineProperty(range, "getClientRects", { value: () => selectionRects })
    Object.defineProperty(range, "cloneRange", { value: () => range })
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const editor = container.querySelector<HTMLElement>('[data-component="markdown-bench-editor"]')
    if (!editor) {
      throw new Error("Expected Markdown bench editor")
    }

    await act(async () => {
      editor.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true }),
      )
      window.dispatchEvent(new MouseEvent("mouseup", { button: 0, clientX: 80, clientY: 180 }))
      await flushEffects(20)
    })

    expect(selectedMarkdown).toBe("")
    expect(editor.querySelector('[data-component="markdown-bench-selection-section"]')).toBeNull()
    expect(editor.querySelector('[data-component="markdown-bench-selection-edge"]')).toBeNull()

    const cite = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Cite selected text"]',
    )
    if (!cite) throw new Error("Expected citation action")
    await act(async () => {
      cite.click()
      await flushEffects()
    })

    expect(selectedMarkdown).toBe("Select this")
    expect(selectedHeadingPath).toEqual(["Lesson", "Prompt"])
    expect(document.body.querySelector('button[aria-label="Cite selected text"]')).toBeNull()
  })

  test("cites and reveals selections from a read-only external document", async () => {
    usePromptStore.getState().clearDraft(READ_ONLY_CITATION_PROMPT_KEY)
    await act(async () => {
      root.render(
        <ThemeProvider>
          <ReadOnlyCitationHarness
            markdown={["# External", "", "Quote this outside passage."].join("\n")}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const editable = container.querySelector(".mdxeditor-root-contenteditable [contenteditable]")
    expect(editable?.getAttribute("contenteditable")).toBe("false")

    selectRenderedText(container, "Quote this outside passage.", "Quote this".length)
    const editor = container.querySelector<HTMLElement>('[data-component="markdown-bench-editor"]')
    if (!editor) throw new Error("Expected Markdown bench editor")
    await act(async () => {
      editor.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, isPrimary: true }),
      )
      window.dispatchEvent(new MouseEvent("mouseup", { button: 0, clientX: 80, clientY: 180 }))
      await flushEffects(20)
    })

    const cite = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Cite selected text"]',
    )
    if (!cite) throw new Error("Expected citation action")
    await act(async () => {
      cite.click()
      await flushEffects()
    })

    const citationParts = getPromptDraft(
      usePromptStore.getState(),
      READ_ONLY_CITATION_PROMPT_KEY,
    ).parts.flatMap((part) => {
      const parsed = readCitationPromptPart(part)
      return parsed ? [parsed] : []
    })
    expect(citationParts).toHaveLength(1)
    const citation = citationParts[0]?.citation
    if (!citation) throw new Error("Expected a document citation in the prompt draft")
    expect(citation.excerpt).toBe("Quote this")
    expect(citation.source).toMatchObject({
      kind: "document",
      path: EXTERNAL_MARKDOWN_PATH,
      revision: "external-version",
    })
    expect(citation.source).not.toHaveProperty("directory")

    window.getSelection()?.removeAllRanges()
    let revealed = false
    await act(async () => {
      revealed = await requestCitationNavigation(citation)
      await flushEffects()
    })
    expect(revealed).toBe(true)
    expect(window.getSelection()?.toString()).toBe("Quote this")

    await act(async () => {
      root.render(<ThemeProvider>{null}</ThemeProvider>)
      await flushEffects()
    })
    window.getSelection()?.removeAllRanges()
    const reopenedPaths: string[] = []
    const unregisterFallback = registerCitationNavigationHandler((pendingCitation) => {
      if (pendingCitation.source.kind !== "document") return false
      reopenedPaths.push(pendingCitation.source.path)
      return "pending"
    })
    try {
      await act(async () => {
        revealed = await requestCitationNavigation(citation)
        await flushEffects()
      })
      expect(revealed).toBe(true)
      expect(reopenedPaths).toEqual([EXTERNAL_MARKDOWN_PATH])
      expect(window.getSelection()?.toString()).toBe("")

      await act(async () => {
        root.render(
          <ThemeProvider>
            <ReadOnlyCitationHarness
              markdown={["# External", "", "Quote this outside passage."].join("\n")}
            />
          </ThemeProvider>,
        )
        await flushEffects(20)
      })
      expect(window.getSelection()?.toString()).toBe("Quote this")
    } finally {
      unregisterFallback()
    }
  })

  test("leaves external citations to the fallback while its Bench surface is parked", async () => {
    const citation: Citation = {
      schemaVersion: 1,
      id: "parked-external",
      excerpt: "Quote this",
      source: {
        kind: "document",
        path: EXTERNAL_MARKDOWN_PATH,
        selector: { version: 1, start: 9, end: 19, prefix: "External\n", suffix: " outside" },
      },
    }
    function renderParkable(surfaceActive: boolean) {
      root.render(
        <ThemeProvider>
          <BenchSurfaceActivityProvider value={surfaceActive}>
            <ReadOnlyCitationHarness
              markdown={["# External", "", "Quote this outside passage."].join("\n")}
            />
          </BenchSurfaceActivityProvider>
        </ThemeProvider>,
      )
    }
    const fallbackCitations: string[] = []
    const unregisterFallback = registerCitationNavigationHandler((pendingCitation) => {
      fallbackCitations.push(pendingCitation.id)
      return true
    })
    try {
      await act(async () => {
        renderParkable(false)
        await flushEffects()
      })
      window.getSelection()?.removeAllRanges()
      await act(async () => {
        await requestCitationNavigation(citation)
        await flushEffects()
      })
      expect(fallbackCitations).toEqual(["parked-external"])
      expect(window.getSelection()?.toString()).toBe("")

      await act(async () => {
        renderParkable(true)
        await flushEffects()
      })
      await act(async () => {
        await requestCitationNavigation(citation)
        await flushEffects()
      })
      expect(fallbackCitations).toEqual(["parked-external"])
      expect(window.getSelection()?.toString()).toBe("Quote this")
    } finally {
      unregisterFallback()
    }
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

  test("reports initial and imperative parsing results against the exact Markdown source", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const processingResults: MarkdownBenchProcessingResult[] = []

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            ref={editorRef}
            markdown="# Initial"
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
            onProcessingResult={(result) => processingResults.push(result)}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    expect(processingResults.at(-1)).toEqual({
      markdown: "# Initial",
      error: undefined,
    })

    await act(async () => {
      editorRef.current?.setMarkdown("# Updated externally")
      await flushEffects()
    })

    expect(processingResults.at(-1)).toEqual({
      markdown: "# Updated externally",
      error: undefined,
    })

    const malformedMarkdown = "# Broken externally\n\n<Component value={}>Content</Component>"
    await act(async () => {
      editorRef.current?.setMarkdown(malformedMarkdown)
      await flushEffects(50)
    })

    expect(processingResults.at(-1)).toEqual({
      markdown: malformedMarkdown,
      error: expect.stringContaining("Unexpected empty expression"),
    })
  })

  test("returns to rich text when externally repaired MDX becomes valid", async () => {
    const processingResults: MarkdownBenchProcessingResult[] = []

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown={"# Broken\n\n<Component value={}>Content</Component>"}
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
            onProcessingResult={(result) => processingResults.push(result)}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(container.querySelector(".mdxeditor-source-editor")).not.toBeNull()
    expect(container.textContent).toContain("Error parsing markdown")
    expect(processingResults.at(-1)).toEqual({
      markdown: "# Broken\n\n<Component value={}>Content</Component>",
      error: expect.stringContaining("Unexpected empty expression"),
    })

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown={"# Repaired\n\nContent"}
            version="version-2"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-dir"
            documentFormat="mdx"
            path="test.mdx"
            onChange={() => {}}
            onProcessingResult={(result) => processingResults.push(result)}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(container.textContent).not.toContain("Error parsing markdown")
    expect(container.textContent).toContain("Repaired")
    expect(processingResults.at(-1)).toEqual({
      markdown: "# Repaired\n\nContent",
      error: undefined,
    })
  })

  test("renders allowlisted inline SVG in Markdown", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown =
      '# Diagram\n\n<svg viewBox="0 0 10 10" onload="alert(1)"><title>Circle</title><circle cx="5" cy="5" r="4" /><script>alert(1)</script></svg>'

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
            documentFormat="markdown"
            path="test.md"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(container.textContent).not.toContain(
      "Parsing of the following markdown structure failed",
    )
    expect(container.textContent).toContain("Diagram")
    expect(
      container.querySelector('svg[data-component="markdown-bench-mdx-svg"] circle'),
    ).not.toBeNull()
    expect(
      container.querySelector('svg[data-component="markdown-bench-mdx-svg"] title')?.textContent,
    ).toBe("Circle")
    expect(
      container
        .querySelector('svg[data-component="markdown-bench-mdx-svg"]')
        ?.getAttribute("onload"),
    ).toBeNull()
    expect(
      container.querySelector('svg[data-component="markdown-bench-mdx-svg"] script'),
    ).toBeNull()
    expect(editorRef.current?.getMarkdown()).toContain("<svg")
  })

  test("renders Markdown angle placeholders without treating them as MDX tags", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown = [
      'Analyze the {argument name="What to Analyse?"}.',
      "",
      "## Argument #_n_: <detailed argument>",
      "## Conclusion: <conclusion>",
      "## Premises:",
      "    1. <premise> [explicit/implicit]",
      "    2. ...",
      "* Type: <type>:<reasoning>",
      "* Strength: <...>",
      "Literal authored escape: \\<widget>",
      "",
      "---",
      "<overarching argument flow: how one text flows from one argument to another.>",
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
            documentFormat="markdown"
            path="prompt.md"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(container.textContent).not.toContain("Error parsing markdown")
    expect(container.textContent).toContain("<premise>")
    expect(editorRef.current?.getMarkdown()).toContain("<premise>")
    expect(editorRef.current?.getMarkdown()).toContain("Literal authored escape: \\<widget>")
  })

  test("round-trips HTML void tags with attributes without adding Markdown escapes", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const markdown = [
      'Before <img src="particle.png" alt="Particle *model* > state"> after.',
      '<input type="checkbox" disabled>',
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
            documentFormat="markdown"
            path="test.md"
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects(50)
    })

    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("renders allowlisted intrinsic SVG without executing unsafe markup", async () => {
    const processingResults: MarkdownBenchProcessingResult[] = []
    const markdown = [
      '<div style="display:flex;justify-content:center;background:#f8fafc">',
      '  <strong style="color:#1a1a2e">Solid</strong>',
      '  <img src="./particle-model.png" alt="Particle model" onerror="alert(1)" />',
      '<svg width="140" height="120" viewBox="0 0 140 120" onload="alert(1)">',
      '  <circle cx="30" cy="25" r="10" fill="#4a9eed" stroke-width="1.5" />',
      '  <text x="20" y="110">Particle label</text>',
      '  <text x="5" y="25">{}</text>',
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
            onProcessingResult={(result) => processingResults.push(result)}
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
    expect(container.querySelector(".mdxeditor-source-editor")).toBeNull()
    expect(processingResults.at(-1)).toEqual({
      markdown,
      error: undefined,
    })
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
      advancedToolbarContainer.querySelector('[data-component="markdown-bench-advanced-toolbar"]'),
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
    const markdown = [":::answer-key", "## Answer Key", "", "1. C", "2. A", ":::"].join("\n")

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
      container.querySelector('[data-component="mermaid-diagram-static-viewport"] svg')
        ?.textContent,
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

  test("renders and losslessly serializes Obsidian wikilinks, embeds, and callouts", async () => {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const openedTargets: string[] = []
    const markdown = [
      "Read [[Notes/Alpha#Details|the explanation]].",
      "",
      "![[assets/diagram.png]]",
      "",
      "![[references/source.pdf]]",
      "",
      "> [!tip]+ Evidence",
      "> Connect the observation.",
    ].join("\n")
    const obsidianWikiLinkContext: ObsidianWikiLinkContext = {
      directory: "/tmp/test-vault",
      documentPath: "Current.md",
      compatible: true,
      embeddedMarkdownLoader: EXPLORER_EMBEDDED_MARKDOWN_LOADER,
      resolutions: new Map([
        [
          "Notes/Alpha#Details",
          {
            target: "Notes/Alpha#Details",
            status: "resolved",
            path: "Notes/Alpha.md",
            fragment: "Details",
            kind: "markdown",
          },
        ],
        [
          "assets/diagram.png",
          {
            target: "assets/diagram.png",
            status: "resolved",
            path: "assets/diagram.png",
            kind: "image",
          },
        ],
        [
          "references/source.pdf",
          {
            target: "references/source.pdf",
            status: "resolved",
            path: "references/source.pdf",
            kind: "file",
          },
        ],
      ]),
      openResolution(resolution) {
        openedTargets.push(resolution.target)
      },
    }

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
            directory="/tmp/test-vault"
            documentFormat="markdown"
            path="Current.md"
            obsidianWikiLinkContext={obsidianWikiLinkContext}
            onChange={() => {}}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    expect(
      container
        .querySelector('[data-component="markdown-bench-editor"]')
        ?.getAttribute("data-obsidian-vault"),
    ).toBe("true")
    expect(
      container.querySelector('[data-component="markdown-bench-obsidian-link"]')?.textContent,
    ).toContain("the explanation")
    const wikiLink = container.querySelector<HTMLButtonElement>(
      '[data-component="markdown-bench-obsidian-link"]',
    )
    await act(async () => {
      wikiLink?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
      await flushEffects()
    })
    expect(openedTargets).toContain("Notes/Alpha#Details")
    expect(container.querySelector('img[alt="assets/diagram.png"]')).not.toBeNull()
    const attachment = container.querySelector<HTMLButtonElement>(
      '[data-component="markdown-bench-obsidian-embed"]',
    )
    expect(attachment?.textContent).toContain("Open attachment")
    await act(async () => {
      attachment?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
      await flushEffects()
    })
    expect(openedTargets).toContain("references/source.pdf")
    expect(
      container.querySelector('[data-component="markdown-bench-obsidian-callout"]'),
    ).not.toBeNull()

    const serialized = editorRef.current?.getMarkdown() ?? ""
    expect(serialized).toContain("[[Notes/Alpha#Details|the explanation]]")
    expect(serialized).toContain("![[assets/diagram.png]]")
    expect(serialized).toContain("![[references/source.pdf]]")
    expect(serialized).toContain("> [!tip]+ Evidence")
    expect(serialized).toContain("> Connect the observation.")
  })

  test("routes rendered Markdown links through the Bench link handler", async () => {
    const openedLinks: string[] = []

    await act(async () => {
      root.render(
        <ThemeProvider>
          <MarkdownBenchEditor
            markdown="[Polynomial Functions](#Polynomial%20Functions)"
            version="version-1"
            dirty={false}
            saving={false}
            conflict={false}
            directory="/tmp/test-vault"
            documentFormat="markdown"
            path="Index.md"
            onChange={() => {}}
            onOpenLink={(href) => openedLinks.push(href)}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    const link = container.querySelector<HTMLAnchorElement>("a")
    expect(link).not.toBeNull()
    await act(async () => {
      link?.click()
      await flushEffects()
    })
    expect(openedLinks).toEqual(["#Polynomial%20Functions"])
  })
})
