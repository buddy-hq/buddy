import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { createQueryTestRoot } from "./query-test-root"
import {
  MarkdownBenchEditor,
  type MarkdownBenchEditorHandle,
} from "../src/components/bench/markdown/editor"
import {
  EXPLORER_EMBEDDED_MARKDOWN_LOADER,
  type ObsidianLinkResolution,
  type ObsidianWikiLinkContext,
} from "../src/components/bench/markdown/plugins/obsidian"
import { ThemeProvider } from "../src/theme"

const CALLOUT_SELECTOR = '[data-component="markdown-bench-obsidian-callout"]'
const TITLE_SELECTOR = '[data-slot="markdown-bench-callout-title"]'
const WIKILINK_SELECTOR = '[data-component="markdown-bench-obsidian-link"]'

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

describe("MarkdownBenchEditor callout titles", () => {
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
    options: { resolutions?: readonly ObsidianLinkResolution[] } = {},
  ) {
    const editorRef = createRef<MarkdownBenchEditorHandle>()
    const processingErrors: string[] = []
    const openedTargets: string[] = []
    const openedLinks: string[] = []
    const obsidianWikiLinkContext: ObsidianWikiLinkContext = {
      directory: "/tmp/test-notes",
      documentPath: "Callouts.md",
      compatible: true,
      embeddedMarkdownLoader: EXPLORER_EMBEDDED_MARKDOWN_LOADER,
      resolutions: new Map(
        (options.resolutions ?? []).map((resolution) => [resolution.target, resolution]),
      ),
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
            directory="/tmp/test-notes"
            documentFormat="markdown"
            path="Callouts.md"
            obsidianWikiLinkContext={obsidianWikiLinkContext}
            onChange={() => {}}
            onOpenLink={(href) => openedLinks.push(href)}
            onProcessingResult={(result) => {
              if (result.error) processingErrors.push(result.error)
            }}
          />
        </ThemeProvider>,
      )
      await flushEffects()
    })
    return { editorRef, processingErrors, openedTargets, openedLinks }
  }

  function readTitle() {
    const callout = container.querySelector<HTMLElement>(CALLOUT_SELECTOR)
    const label = callout?.firstElementChild
    if (!callout || !label) throw new Error("Expected a rendered Obsidian callout")
    return { callout, label, title: label.querySelector<HTMLElement>(TITLE_SELECTOR) }
  }

  test("renders code, emphasis, strong and strikethrough in the title", async () => {
    const markdown = ["> [!note] use `code` and **bold** and *soft* and ~~gone~~", "> body"].join(
      "\n",
    )

    const { processingErrors, editorRef } = await mountEditor(markdown)
    const { label, title } = readTitle()

    expect(processingErrors).toEqual([])
    expect(label.textContent).toBe("use code and bold and soft and gone")
    expect(title?.querySelector("code")?.textContent).toBe("code")
    expect(title?.querySelector("strong")?.textContent).toBe("bold")
    expect(title?.querySelector("em")?.textContent).toBe("soft")
    expect(title?.querySelector("del")?.textContent).toBe("gone")
    expect(label.textContent).not.toContain("`")
    expect(label.textContent).not.toContain("*")
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("renders inline Markdown in the title of a foldable callout", async () => {
    const markdown = ["> [!tip]- Read `the` **docs**", "> body"].join("\n")

    const { editorRef } = await mountEditor(markdown)
    const { callout, label } = readTitle()

    expect(callout.tagName).toBe("DETAILS")
    expect(label.tagName).toBe("SUMMARY")
    expect(label.querySelector("code")?.textContent).toBe("the")
    expect(label.querySelector("strong")?.textContent).toBe("docs")
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("keeps the spaces around inline elements in a flex label", async () => {
    await mountEditor(["> [!note] a `b` c", "> body"].join("\n"))
    const { label, title } = readTitle()

    expect(title?.parentElement === label).toBe(true)
    expect(label.children.length).toBe(1)
    expect(title?.textContent).toBe("a b c")
  })

  test("shows raw HTML in the title as text", async () => {
    const markdown = ["> [!note] use <T> generics", "> body"].join("\n")

    const { editorRef } = await mountEditor(markdown)
    const { label } = readTitle()

    expect(label.textContent).toBe("use <T> generics")
    expect(label.querySelector("t")).toBeNull()
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("shows tags and scripts in the title as text without creating elements", async () => {
    const markdown = [
      "> [!note] <b>bold</b> <img src=x onerror=alert(1)> <script>x</script>",
      "> body",
    ].join("\n")

    const { editorRef } = await mountEditor(markdown)
    const { label } = readTitle()

    expect(label.textContent).toBe("<b>bold</b> <img src=x onerror=alert(1)> <script>x</script>")
    expect(label.querySelector("b, img, script")).toBeNull()
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("shows code spans containing tags and brackets literally", async () => {
    const markdown = ["> [!note] `<T>` and `[[Not a link]]`", "> body"].join("\n")

    await mountEditor(markdown)
    const { label } = readTitle()

    expect(label.textContent).toBe("<T> and [[Not a link]]")
    expect(Array.from(label.querySelectorAll("code"), (code) => code.textContent)).toEqual([
      "<T>",
      "[[Not a link]]",
    ])
    expect(label.querySelector(WIKILINK_SELECTOR)).toBeNull()
  })

  test("keeps plain titles with quotes and ampersands unchanged", async () => {
    const markdown = ['> [!quote]- Replace "deliveries" with "speeds" & move on…', "> body"].join(
      "\n",
    )

    const { editorRef } = await mountEditor(markdown)
    const { label } = readTitle()

    expect(label.textContent).toBe('Replace "deliveries" with "speeds" & move on…')
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("decodes character references and escapes in the title", async () => {
    await mountEditor(
      ["> [!note] AT&amp;T &copy; \\*not bold\\* a&b &unknown;", "> body"].join("\n"),
    )
    const { label } = readTitle()

    expect(label.textContent).toBe("AT&T © *not bold* a&b &unknown;")
  })

  test("renders a Markdown link in the title and hands its click to the editor", async () => {
    const markdown = ['> [!note] see [the docs](https://example.com/docs "Docs")', "> body"].join(
      "\n",
    )

    const { editorRef, openedLinks } = await mountEditor(markdown)
    const { label } = readTitle()
    const anchor = label.querySelector("a")

    expect(anchor?.textContent).toBe("the docs")
    expect(anchor?.getAttribute("href")).toBe("https://example.com/docs")
    expect(anchor?.getAttribute("title")).toBe("Docs")
    await act(async () => {
      anchor?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
      await flushEffects()
    })
    expect(openedLinks).toEqual(["https://example.com/docs"])
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("renders a relative link and a bare URL as links", async () => {
    await mountEditor(
      ["> [!note] [spec](../Spec.md#intro) or https://example.com", "> body"].join("\n"),
    )
    const { label } = readTitle()

    expect(
      Array.from(label.querySelectorAll("a"), (anchor) => anchor.getAttribute("href")),
    ).toEqual(["../Spec.md#intro", "https://example.com"])
  })

  test("does not make a link out of an unsafe scheme", async () => {
    await mountEditor(
      [
        "> [!note] [bad](javascript:alert(1)) and [worse](data:text/html,x) and [fine](mailto:a@b.co)",
        "> body",
      ].join("\n"),
    )
    const { label } = readTitle()

    expect(label.textContent).toBe("bad and worse and fine")
    expect(
      Array.from(label.querySelectorAll("a"), (anchor) => anchor.getAttribute("href")),
    ).toEqual(["mailto:a@b.co"])
  })

  test("renders a resolved wikilink in the title and opens it like a body wikilink", async () => {
    const markdown = [
      "> [!note] use `code` and **bold** and [[Notes/Alpha#Details|the Link]]",
      "> body [[Notes/Alpha#Details|in body]]",
    ].join("\n")

    const { editorRef, openedTargets } = await mountEditor(markdown, {
      resolutions: [
        {
          target: "Notes/Alpha#Details",
          status: "resolved",
          path: "Notes/Alpha.md",
          fragment: "Details",
          kind: "markdown",
        },
      ],
    })
    const { label } = readTitle()
    const link = label.querySelector<HTMLButtonElement>(WIKILINK_SELECTOR)

    expect(label.textContent).toBe("use code and bold and the Link")
    expect(link?.textContent).toBe("the Link")
    expect(link?.getAttribute("data-resolved")).toBe("true")
    expect(link?.disabled).toBe(false)
    await act(async () => {
      link?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
      await flushEffects()
    })
    expect(openedTargets).toEqual(["Notes/Alpha#Details"])
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("renders an unresolved wikilink in the title as inert", async () => {
    const markdown = ["> [!note] see [[Missing]]", "> body"].join("\n")

    const { editorRef, openedTargets } = await mountEditor(markdown)
    const { label } = readTitle()
    const link = label.querySelector<HTMLButtonElement>(WIKILINK_SELECTOR)

    expect(link?.textContent).toBe("Missing")
    expect(link?.getAttribute("data-resolved")).toBe("false")
    expect(link?.disabled).toBe(true)
    expect(openedTargets).toEqual([])
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })

  test("renders a wikilink inside strong text in the title", async () => {
    await mountEditor(["> [!note] **bold [[A]] more**", "> body"].join("\n"))
    const { label } = readTitle()

    expect(label.querySelector("strong")?.textContent).toBe("bold A more")
    expect(label.querySelector(`strong ${WIKILINK_SELECTOR}`)).not.toBeNull()
  })

  test("keeps wikilink targets with emphasis characters intact", async () => {
    await mountEditor(["> [!note] [[a*b*c]]", "> body"].join("\n"))
    const { label } = readTitle()

    expect(label.querySelector("em")).toBeNull()
    expect(label.querySelector(WIKILINK_SELECTOR)?.textContent).toBe("a*b*c")
  })

  test("keeps an embed written in the title as text", async () => {
    await mountEditor(["> [!note] see ![[diagram.png]]", "> body"].join("\n"))
    const { label } = readTitle()

    expect(label.textContent).toBe("see ![[diagram.png]]")
    expect(label.querySelector(WIKILINK_SELECTOR)).toBeNull()
  })

  test("keeps the default label for a callout without a title", async () => {
    await mountEditor(["> [!warning]", "> body"].join("\n"))
    const { label, title } = readTitle()

    expect(label.textContent).toBe("Warning")
    expect(title).toBeNull()
  })

  test("keeps the title read-only", async () => {
    await mountEditor(["> [!note] a `b` c", "> body"].join("\n"))
    const { label } = readTitle()

    expect(label.querySelector("[contenteditable='true']")).toBeNull()
    expect(label.closest("[contenteditable]")?.getAttribute("contenteditable")).toBe("false")
  })

  test("saves titles with inline Markdown byte for byte", async () => {
    const markdown = [
      "> [!note]+ use `code` and **bold** and [[Link]] and [x](https://example.com)",
      "> body",
      "",
      '> [!tip] ~~old~~ <T> & "quoted"',
      "> more",
    ].join("\n")

    const { editorRef, processingErrors } = await mountEditor(markdown)

    expect(processingErrors).toEqual([])
    expect(editorRef.current?.getMarkdown()).toBe(markdown)
  })
})
