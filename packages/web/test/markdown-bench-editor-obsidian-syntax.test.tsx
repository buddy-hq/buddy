import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import type { Root } from "react-dom/client"
import { $getRoot, getNearestEditorFromDOMNode, type LexicalNode } from "lexical"
import type { MarkdownBenchDocumentFormat } from "@buddy/workspace-file-policy"
import { commitNestedEditors } from "./markdown-bench-nested-editors"
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

type LexicalUrlHolder = LexicalNode & { setURL(url: string): LexicalNode }

function holdsUrl(node: LexicalNode | null): node is LexicalUrlHolder {
  return node !== null && "setURL" in node
}

describe("MarkdownBenchEditor Obsidian syntax on save", () => {
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

  function lexicalEditor() {
    const element = container.querySelector<HTMLElement>(CONTENT_ROOT_SELECTOR)
    if (!element) throw new Error("Expected the editable document")
    const editor = getNearestEditorFromDOMNode(element)
    if (!editor) throw new Error("Expected the Lexical editor behind the document")
    return editor
  }

  async function savedAfterRetargetingLink(markdown: string, url: string) {
    const { changes, processingErrors } = await mountEditor(markdown, "markdown")
    const editor = lexicalEditor()
    await act(async () => {
      editor.update(() => {
        const link = $getRoot().getAllTextNodes().at(-1)?.getParent() ?? null
        if (!holdsUrl(link)) throw new Error("Expected the text to sit inside a link")
        link.setURL(url)
      })
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  async function savedAfterAppending(markdown: string, text: string) {
    const { changes, processingErrors } = await mountEditor(markdown, "markdown")
    const editor = lexicalEditor()
    await act(async () => {
      editor.update(() => {
        const lastText = $getRoot().getAllTextNodes().at(-1)
        if (!lastText) throw new Error("Expected text in the document")
        lastText.setTextContent(`${lastText.getTextContent()}${text}`)
      })
      await flushEffects()
    })
    expect(processingErrors).toEqual([])
    return changes.at(-1)
  }

  describe("tags", () => {
    test.each([
      ["a nested tag on its own line", "#project/alpha"],
      [
        "tags at line starts, in lists, quotes and running text",
        "- #todo item\n\n> #quoted tag\n\ntext #tag here\n#second_line and #third-tag",
      ],
      ["an underscore inside a tag in running text", "see #snake_case_tag here"],
      ["a tag in a heading", "# Plans #weekly"],
      ["a tag with a non-Latin name", "#заметка and #日記"],
    ])("keeps %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test.each([
      ["a hash before a space, which would be a heading", "\\# not a heading"],
      ["a lone hash", "\\#"],
      ["a hash before digits only", "\\#1 is a number, not a tag"],
      ["a hash before two hashes", "\\##not a heading either"],
    ])("still escapes %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("still escapes an underscore that could open emphasis next to a tag", async () => {
      const markdown = "\\#\\_private and #done\\_"

      expect(await saved(markdown)).toBe(markdown)
    })

    test("drops a backslash typed before a tag at the start of a line", async () => {
      expect(await saved("\\#word at the start")).toBe("#word at the start")
    })

    test("keeps tags after an edit", async () => {
      expect(await savedAfterAppending("#project/alpha\n\n- #todo item", " more")).toBe(
        "#project/alpha\n\n- #todo item more",
      )
    })
  })

  describe("custom task statuses", () => {
    test.each([
      ["custom statuses", "- [/] in progress\n- [-] cancelled\n- [*] starred\n- [>] forwarded"],
      [
        "custom statuses mixed with real tasks and numbered items",
        "- [ ] todo\n- [/] doing\n- [x] done\n\n1. [?] question\n2. plain",
      ],
      ["a custom status in a nested item", "- parent\n  - [!] important"],
      ["an angle-bracket status", "- [<] scheduled\n- [>] forwarded"],
      ["an angle-bracket status after a checkbox", "- [ ] [<] a"],
    ])("keeps %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test.each([
      [
        "brackets that are not a status",
        "see \\[text] here\n\n\\[/] outside a list\n\n- \\[x] literal box\n- later \\[/] in the item\n- \\[/]no space",
      ],
      ["a status inside a quote in a list item", "- > \\[/] quoted"],
    ])("still escapes %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })
  })

  describe("footnotes", () => {
    test.each([
      ["a footnote reference and its definition", "Claim.[^1]\n\n[^1]: The note text."],
      [
        "named footnotes next to emphasis",
        "First[^my_note] and *second*[^2].\n\n[^my_note]: The first note.\n[^2]: The second note.",
      ],
      ["a one-word footnote definition", "Claim.[^1]\n\n[^1]: Source"],
      ["a footnote right after an exclamation mark", "It works![^1]\n\n[^1]: Indeed."],
      ["a footnote in a list item", "- item[^a]\n\n[^a]: A note."],
    ])("keeps %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test.each([
      ["an angle bracket", "see [^<x>] here", "see \\[^<x>] here"],
      [
        "a table pipe",
        "| a |\n| - |\n| x[^p\\|q] |",
        "| a         |\n| --------- |\n| x\\[^p\\|q] |",
      ],
    ])("keeps text with %s out of footnote labels", async (_, markdown, expected) => {
      const result = await saved(markdown)

      expect(result).toBe(expected)
      expect(result).not.toContain("\u2060")
    })

    test("still escapes brackets that are not a footnote", async () => {
      const markdown = "see \\[text] here and \\[^not a note] and \\[^]"

      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps a footnote that is followed by a parenthesis from becoming a link", async () => {
      const markdown = "Claim[^1]\\(aside)"

      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps footnotes after an edit", async () => {
      expect(await savedAfterAppending("Claim.[^1]\n\n[^1]: The note text.", " More.")).toBe(
        "Claim.[^1]\n\n[^1]: The note text. More.",
      )
    })
  })

  async function savedAfterFocusingCallouts(markdown: string) {
    const { editorRef, processingErrors } = await mountEditor(markdown, "markdown")
    await commitNestedEditors(container)
    expect(processingErrors).toEqual([])
    return editorRef.current?.getMarkdown()
  }

  describe("formatting across inline nodes", () => {
    test.each([
      ["math", "**bold $x$ after**"],
      ["link", "**see [target](target.md) now**"],
      ["wikilink", "*see [[target]] now*"],
      ["bare URL", "**see http://example.com now**"],
      ["inline HTML", "**bold <br> still**"],
      ["image", "**see ![pic](qa.png) now**"],
      ["nested emphasis", "***bold $x$ after***"],
      ["deliberate split", "**bold** $x$ **after**"],
    ])("keeps %s formatting after editing the run", async (_, markdown) => {
      const closing = markdown.endsWith("***") ? "***" : markdown.endsWith("**") ? "**" : "*"
      const expected = `${markdown.slice(0, -closing.length)} more${closing}`
      expect(await savedAfterAppending(markdown, " more")).toBe(expected)
    })
  })

  describe("currency", () => {
    test.each([
      ["Cost $5 and $10.50", "Cost $5 and $10.50 more"],
      ["Cost $5 beside $x$ today", "Cost $5 beside $x$ today more"],
      ["**Cost $5**", "**Cost $5 more**"],
      ["`echo $HOME` costs $5", "`echo $HOME` costs $5 more"],
    ])("keeps currency dollars when editing %s", async (markdown, expected) => {
      expect(await savedAfterAppending(markdown, " more")).toBe(expected)
    })
  })

  describe("colons in prose", () => {
    test.each([
      ["a colon between a label and its text", "TODO:fix this and Note:This"],
      ["a colon at the start of a line", ":start of line"],
      ["a colon at the start of a line in a list item", "- :start of line"],
      ["a colon at the start of a line in a quote", "> :start of line"],
      ["double colons and a colon pair around a word", "a::b and :smile: here"],
      ["a colon in bold text", "**ratio key:value here**"],
      ["a colon in italic text", "*it worked :D now*"],
      ["a colon in a link label", "[**see a:b**](https://x.com)"],
      ["a colon in a heading", "# Plans:next"],
      ["a colon before a port number", "see localhost:8080 and key:1"],
      ["a directive-like name with attributes", ":abbr{.a #b} text"],
      ["a directive-like name with an empty block", ":span{} text"],
    ])("keeps %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps a colon in a callout body", async () => {
      const markdown = "> [!note] T\n> key:value and :D and a::b"

      expect(await savedAfterFocusingCallouts(markdown)).toBe(markdown)
    })

    test("keeps a colon in a callout title", async () => {
      const markdown = "> [!note] Title:with colon\n> body:text"

      expect(await savedAfterFocusingCallouts(markdown)).toBe(markdown)
    })

    test("keeps a colon in an edited paragraph", async () => {
      expect(await savedAfterAppending("see key:value", " and more:text")).toBe(
        "see key:value and more:text",
      )
    })

    test("keeps a colon next to a tag", async () => {
      const markdown = "#todo:later and note:#done"

      expect(await saved(markdown)).toBe(markdown)
    })

    test("drops a backslash that older saves put before a colon", async () => {
      expect(await saved("TODO\\:fix this and \\:start")).toBe("TODO:fix this and :start")
    })

    test.each([
      ["a double colon at the start of a line", "\\::leaf"],
      ["a double colon with a label", "\\::youtube\\[Video]{#abc}"],
      ["a triple colon at the start of a line", "\\:::fence"],
      ["a double colon after a paragraph line", "first line\n\\::leaf"],
    ])("still escapes %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps a colon in an MDX document", async () => {
      const markdown = "TODO:fix this and :start\n\n**key:value**"

      expect(await saved(markdown, "mdx")).toBe(markdown)
    })
  })

  describe("equals signs in prose", () => {
    test.each([
      ["an equals sign between words", "x = y and a=b"],
      ["a directive attribute", ":abbr{title='x'} text"],
      ["a highlight next to an equals sign", "a ==mark== b = c"],
      ["an equals sign in a list item", "- total = 4"],
    ])("keeps %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("still escapes an equals sign that starts a line", async () => {
      const markdown = "a\n\\= b"

      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps an equals sign after an edit", async () => {
      expect(await savedAfterAppending("x = y", " and z = 1")).toBe("x = y and z = 1")
    })
  })

  describe("underscores inside words", () => {
    test.each([
      ["snake case names", "snake_case and foo_bar_baz plus v1_2"],
      ["an underscore name in bold", "**the my_var value**"],
      ["an underscore name in a heading", "# load_config"],
    ])("keeps %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("still escapes underscores at word edges", async () => {
      const markdown = "\\_lead and trail\\_ and a \\_ b"

      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps an underscore name after an edit", async () => {
      expect(await savedAfterAppending("see snake_case", " and my_var")).toBe(
        "see snake_case and my_var",
      )
    })
  })

  describe("bare URLs", () => {
    test.each([
      ["a URL in running text", "see http://x.com now"],
      ["an https URL with an underscore", "https://example.com/a_b"],
      ["a www address", "www.example.com"],
      ["a URL followed by a period", "see http://x.com. Next sentence"],
      ["a URL with a path, query and fragment", "go to https://x.com/a/b_c?d=1&e=2#top now"],
      ["an email address", "mail me a@b.com now"],
      ["a URL in a list item", "- see http://x.com/a_b\n- www.example.com"],
      ["a URL in a quote", "> quote http://x.com/a_b"],
      ["a URL in a heading", "# Docs http://x.com/a_b"],
      ["a URL in a task item", "- [ ] read http://x.com/a_b"],
    ])("keeps %s bare", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps a URL bare in a callout body", async () => {
      const markdown = "> [!note] T\n> see http://x.com/a_b and www.example.com"

      expect(await savedAfterFocusingCallouts(markdown)).toBe(markdown)
    })

    test.each([
      ["an angle-bracket autolink", "<http://x.com>"],
      ["an angle-bracket autolink in text", "see <http://x.com/a_b> now"],
      ["an angle-bracket email", "mail <a@b.com> now"],
      ["a link with a label", "[x](http://x.com)"],
      ["a link whose label is its URL, with a title", '[http://x.com](http://x.com "t")'],
    ])("does not change %s", async (_, markdown) => {
      expect(await saved(markdown)).toBe(markdown)
    })

    test("keeps a URL bare after an edit elsewhere in the paragraph", async () => {
      expect(await savedAfterAppending("see http://x.com/a_b now", " more")).toBe(
        "see http://x.com/a_b now more",
      )
    })

    test("keeps a URL bare after it is extended", async () => {
      expect(await savedAfterAppending("see http://x.com", "/path_a")).toBe(
        "see http://x.com/path_a",
      )
    })

    test("saves a link whose target no longer matches its text as a link", async () => {
      expect(await savedAfterRetargetingLink("see http://x.com", "https://other.com")).toBe(
        "see [http://x.com](https://other.com)",
      )
    })

    test("keeps angle brackets when a bare URL could turn into emphasis", async () => {
      expect(await savedAfterAppending("see http://x.com/", "_foo_")).toBe(
        "see <http://x.com/_foo_>",
      )
    })

    test("re-opens a saved bare URL unchanged", async () => {
      const first = await saved("see http://x.com now and https://example.com/a_b.")

      expect(first).toBe("see http://x.com now and https://example.com/a_b.")
      expect(await saved(first ?? "")).toBe(first)
    })
  })

  describe("in MDX documents", () => {
    test("keeps tags, statuses and footnotes", async () => {
      const markdown = "#project/alpha\n\n- [/] in progress\n\nClaim.[^1]"

      expect(await saved(markdown, "mdx")).toBe(markdown)
    })

    test.each([
      ["a URL in running text", "see http://x.com now", "see [http://x.com](http://x.com) now"],
      ["a www address", "www.example.com", "[www.example.com](https://www.example.com)"],
      ["an angle-bracket autolink", "<http://x.com>", "[http://x.com](http://x.com)"],
      ["a link with a label", "[x](http://x.com)", "[x](http://x.com)"],
    ])("saves %s as an explicit link", async (_, markdown, expected) => {
      const first = await saved(markdown, "mdx")

      expect(first).toBe(expected)
      expect(await saved(expected, "mdx")).toBe(expected)
    })
  })
})
