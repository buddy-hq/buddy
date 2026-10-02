import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import {
  prepareObsidianCalloutsForMdxEditor,
  restoreObsidianCalloutsFromMdxEditor,
} from "../src/components/bench/markdown/obsidian-callouts"
import { collectObsidianWikiLinkTargets } from "../src/components/bench/markdown/plugins/obsidian"
import {
  batchObsidianLinkTargets,
  invalidateObsidianFileCaches,
  invalidateObsidianWatcherCaches,
  obsidianVaultQueryKeys,
} from "../src/state/obsidian-vault-query"

describe("Obsidian Markdown compatibility", () => {
  test("round-trips titled and foldable callouts without changing final newlines", () => {
    const markdown = [
      "> [!tip]+ Evidence",
      "> Connect the observation.",
      ">",
      "> Then explain it.",
      "",
    ].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toContain(':::obsidian-callout{kind="tip" fold="+" title="Evidence"}')
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("keeps quotes and ampersands in a callout title parseable as a directive attribute", () => {
    const markdown = [
      '> [!quote]- Replace "deliveries" with "speeds" & move on…',
      "> Body.",
      "",
    ].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toContain(
      ':::obsidian-callout{kind="quote" fold="-" title="Replace &quot;deliveries&quot; with &quot;speeds&quot; &amp; move on…"}',
    )
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("restores a callout title the editor serialised with character references", () => {
    const serialized = [
      ':::obsidian-callout{kind="quote" fold="-" title="Replace &#x22;deliveries&#x22; with it\'s &#34;speeds&#34;"}',
      "Body.",
      ":::",
      "",
    ].join("\n")

    expect(restoreObsidianCalloutsFromMdxEditor(serialized)).toBe(
      ['> [!quote]- Replace "deliveries" with it\'s "speeds"', "> Body.", ""].join("\n"),
    )
  })

  test("leaves ordinary blockquotes and container directives unchanged", () => {
    const markdown = ["> Ordinary quote", "", ":::tip", "Keep this directive.", ":::"].join("\n")

    expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(markdown)
    expect(restoreObsidianCalloutsFromMdxEditor(markdown)).toBe(markdown)
  })

  test("preserves callout-like syntax inside frontmatter and fenced code", () => {
    const markdown = [
      "---",
      "example: |",
      "  > [!tip] Frontmatter example",
      "---",
      "",
      "```md",
      "> [!tip] Fenced example",
      "> Keep this literal.",
      "```",
      "",
      "```md",
      ':::obsidian-callout{kind="tip"}',
      "Keep this directive literal.",
      ":::",
      "```",
    ].join("\r\n")

    expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(markdown)
    expect(restoreObsidianCalloutsFromMdxEditor(markdown)).toBe(markdown)
  })

  test("keeps a bare ::: line inside a callout body from ending the callout", () => {
    const markdown = ["> [!note] T", "> before", "> :::", "> after", ""].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toBe(
      ['::::obsidian-callout{kind="note" title="T"}', "before", ":::", "after", "::::", ""].join(
        "\n",
      ),
    )
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("widens the callout fence past a container directive in the body", () => {
    const markdown = ["> [!note] T", "> :::tip", "> inner", "> :::", "> after"].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toBe(
      [
        '::::obsidian-callout{kind="note" title="T"}',
        ":::tip",
        "inner",
        ":::",
        "after",
        "::::",
      ].join("\n"),
    )
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("keeps a ::: line inside a fenced code block in a callout body", () => {
    const markdown = ["> [!note] T", "> ```md", "> :::", "> ```", ""].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared.startsWith('::::obsidian-callout{kind="note" title="T"}\n')).toBe(true)
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("restores a callout whose fence the editor widened to four colons", () => {
    const serialized = [
      '::::obsidian-callout{kind="note" title="T"}',
      ":::tip",
      "inner",
      ":::",
      "",
      "after",
      "::::",
      "",
    ].join("\n")

    expect(restoreObsidianCalloutsFromMdxEditor(serialized)).toBe(
      ["> [!note] T", "> :::tip", "> inner", "> :::", ">", "> after", ""].join("\n"),
    )
  })

  test("restores a callout whose body holds a fenced ::: line under an unwidened fence", () => {
    const serialized = [
      ':::obsidian-callout{kind="note" title="T"}',
      "```md",
      ":::",
      "```",
      ":::",
      "",
    ].join("\n")

    expect(restoreObsidianCalloutsFromMdxEditor(serialized)).toBe(
      ["> [!note] T", "> ```md", "> :::", "> ```", ""].join("\n"),
    )
  })

  test("restores a callout that ends inside an unclosed code fence", () => {
    const markdown = ["> [!note] T", "> ```md", "> text", ""].join("\n")

    expect(
      restoreObsidianCalloutsFromMdxEditor(prepareObsidianCalloutsForMdxEditor(markdown)),
    ).toBe(markdown)
  })

  test("converts a callout nested in a callout and restores the nesting", () => {
    const markdown = [
      "> [!note] Outer",
      "> text",
      "> > [!tip]- Inner",
      "> > inner text",
      "> >",
      "> > more",
      ">",
      "> after",
      "",
    ].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toBe(
      [
        '::::obsidian-callout{kind="note" title="Outer"}',
        "text",
        ':::obsidian-callout{kind="tip" fold="-" title="Inner"}',
        "inner text",
        "",
        "more",
        ":::",
        "",
        "after",
        "::::",
        "",
      ].join("\n"),
    )
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("converts callouts nested three deep", () => {
    const markdown = [
      "> [!note] One",
      "> > [!tip] Two",
      "> > > [!warning] Three",
      "> > > deepest",
      "",
    ].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toBe(
      [
        ':::::obsidian-callout{kind="note" title="One"}',
        '::::obsidian-callout{kind="tip" title="Two"}',
        ':::obsidian-callout{kind="warning" title="Three"}',
        "deepest",
        ":::",
        "::::",
        ":::::",
        "",
      ].join("\n"),
    )
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  test("leaves callout syntax inside a fenced code block in a callout body literal", () => {
    const markdown = ["> [!note] T", "> ```md", "> > [!tip] Not a callout", "> ```", ""].join("\n")

    const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
    expect(prepared).toBe(
      [
        ':::obsidian-callout{kind="note" title="T"}',
        "```md",
        "> [!tip] Not a callout",
        "```",
        ":::",
        "",
      ].join("\n"),
    )
    expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
  })

  describe("lazy continuation lines", () => {
    const NOTE_DIRECTIVE = ':::obsidian-callout{kind="note" title="T"}'

    test("keeps a lazy continuation line in the callout body", () => {
      const markdown = ["> [!note] T", "> body", "lazy continuation", "", "next"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe(
        [NOTE_DIRECTIVE, "body", "lazy continuation", ":::", "", "next"].join("\n"),
      )
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(
        ["> [!note] T", "> body", "> lazy continuation", "", "next"].join("\n"),
      )
    })

    test("keeps lazy lines mixed with quoted lines and keeps the final newline", () => {
      const markdown = ["> [!note] T", "> body", "lazy one", "> more", "lazy two", "lazy three", ""]

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown.join("\n"))
      expect(prepared).toBe(
        [NOTE_DIRECTIVE, "body", "lazy one", "more", "lazy two", "lazy three", ":::", ""].join(
          "\n",
        ),
      )
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(
        ["> [!note] T", "> body", "> lazy one", "> more", "> lazy two", "> lazy three", ""].join(
          "\n",
        ),
      )
    })

    test("keeps a lazy line right after a callout that has only a title line", () => {
      const markdown = ["> [!note] T", "lazy body", "", "next"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [NOTE_DIRECTIVE, "lazy body", ":::", "", "next"].join("\n"),
      )
    })

    test("keeps lazy lines with CRLF line endings and strips their indentation", () => {
      const markdown = ["> [!note] T", "> body", "   lazy", "", "next"].join("\r\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe([NOTE_DIRECTIVE, "body", "lazy", ":::", "", "next"].join("\r\n"))
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(
        ["> [!note] T", "> body", "> lazy", "", "next"].join("\r\n"),
      )
    })

    test("keeps a lazy line after an indented callout inside the callout", () => {
      const markdown = ["- item", "  > [!note] T", "  > body", "lazy", "", "next"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe(
        ["- item", `  ${NOTE_DIRECTIVE}`, "  body", "  lazy", "  :::", "", "next"].join("\n"),
      )
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(
        ["- item", "  > [!note] T", "  > body", "  > lazy", "", "next"].join("\n"),
      )
    })

    test("keeps a lazy line in the innermost nested callout", () => {
      const markdown = ["> [!note] Outer", "> > [!tip] Inner", "> > inner text", "lazy", "", "next"]

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown.join("\n"))
      expect(prepared).toBe(
        [
          '::::obsidian-callout{kind="note" title="Outer"}',
          ':::obsidian-callout{kind="tip" title="Inner"}',
          "inner text",
          "lazy",
          ":::",
          "::::",
          "",
          "next",
        ].join("\n"),
      )
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(
        ["> [!note] Outer", "> > [!tip] Inner", "> > inner text", "> > lazy", "", "next"].join(
          "\n",
        ),
      )
    })

    test("keeps a less-quoted line after a nested callout paragraph in the inner callout", () => {
      const markdown = ["> [!note] Outer", "> > [!tip] Inner", "> > more", "> after"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [
          '::::obsidian-callout{kind="note" title="Outer"}',
          ':::obsidian-callout{kind="tip" title="Inner"}',
          "more",
          "after",
          ":::",
          "::::",
        ].join("\n"),
      )
    })

    test("keeps a lazy line after a list item or a nested quote in the body", () => {
      for (const quoted of ["- item", "1. item", "> nested quote"]) {
        const markdown = ["> [!note] T", `> ${quoted}`, "lazy"].join("\n")

        expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
          [NOTE_DIRECTIVE, quoted, "lazy", ":::"].join("\n"),
        )
      }
    })

    test("leaves a line after a blank line outside the callout", () => {
      const markdown = ["> [!note] T", "> body", "", "after blank"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [NOTE_DIRECTIVE, "body", ":::", "", "after blank"].join("\n"),
      )
    })

    test("leaves a line after an empty quoted line outside the callout", () => {
      const markdown = ["> [!note] T", "> body", ">", "after empty quote line"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe(
        [NOTE_DIRECTIVE, "body", "", ":::", "after empty quote line"].join("\n"),
      )
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
    })

    test.each([
      ["a bullet list item", "- item"],
      ["a plus list item", "+ item"],
      ["a star list item", "* item"],
      ["an ordered list item starting at 1", "1. item"],
      ["an ordered list item with a parenthesis", "1) item"],
      ["a heading", "# Heading"],
      ["a heading with a tab", "##\tHeading"],
      ["a thematic break", "---"],
      ["a spaced thematic break", "* * *"],
      ["an underscore thematic break", "___"],
      ["a code fence", "```js"],
      ["a tilde code fence", "~~~"],
      ["an HTML block", "<div>block</div>"],
      ["an HTML comment", "<!-- note -->"],
      ["a container directive", ":::tip"],
      ["a math block", "$$"],
      ["a footnote definition", "[^1]: Footnote."],
      ["a bare dash", "-"],
      ["a bare number marker", "1."],
    ])("leaves %s after the callout outside it", (_, line) => {
      const markdown = ["> [!note] T", "> body", line, "tail"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe([NOTE_DIRECTIVE, "body", ":::", line, "tail"].join("\n"))
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
    })

    test.each([
      ["a number other than 1", "2. not a list"],
      ["inline HTML", "<kbd>K</kbd> continues"],
      ["a lone tag with text", "<T> generics"],
      ["a setext underline", "==="],
      ["an indented line", "      indented"],
      ["a tab-indented heading", "\t# not a heading"],
      ["a table row", "| a | b |"],
      ["a link reference definition", "[ref]: https://example.com"],
      ["a hash without a space", "#tag"],
      ["an emphasized word", "*emphasis* continues"],
    ])("keeps %s after the callout inside it", (_, line) => {
      const markdown = ["> [!note] T", "> body", line, "tail"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe([NOTE_DIRECTIVE, "body", line.trimStart(), "tail", ":::"].join("\n"))
    })

    test.each([
      ["a heading", "# Heading"],
      ["a thematic break", "---"],
      ["a code fence that is still open", "```md"],
      ["an HTML block", "<div>"],
      ["a math fence", "$$"],
      ["a container directive fence", ":::"],
      ["an empty list item", "-"],
      ["an empty nested quote", ">"],
      ["a heading inside a list item", "- # Heading"],
      ["a heading inside a nested quote", "> # Heading"],
    ])("leaves a line outside when the body ends with %s", (_, last) => {
      const markdown = ["> [!note] T", `> ${last}`, "lazy"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toMatch(/\n:{3,}\nlazy$/u)
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
    })

    test("leaves a line outside when the body ends inside a code fence", () => {
      const markdown = ["> [!note] T", "> ```md", "> code", "lazy"].join("\n")

      const prepared = prepareObsidianCalloutsForMdxEditor(markdown)
      expect(prepared).toBe([NOTE_DIRECTIVE, "```md", "code", ":::", "lazy"].join("\n"))
      expect(restoreObsidianCalloutsFromMdxEditor(prepared)).toBe(markdown)
    })

    test("keeps a lazy line after a closed code fence followed by text", () => {
      const markdown = ["> [!note] T", "> ```", "> code", "> ```", "> text", "lazy"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [NOTE_DIRECTIVE, "```", "code", "```", "text", "lazy", ":::"].join("\n"),
      )
    })

    test("leaves a lazy-looking line outside when the body ends inside an HTML block", () => {
      const markdown = ["> [!note] T", "> <div>", "> text", "lazy"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [NOTE_DIRECTIVE, "<div>", "text", ":::", "lazy"].join("\n"),
      )
    })

    test("leaves lazy-looking lines inside fenced code and frontmatter alone", () => {
      const markdown = ["```md", "> [!note] T", "> body", "lazy", "```"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(markdown)
    })

    test("stops a lazy run at the next block start", () => {
      const markdown = ["> [!note] T", "> body", "lazy", "- item", "tail"].join("\n")

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [NOTE_DIRECTIVE, "body", "lazy", ":::", "- item", "tail"].join("\n"),
      )
    })

    test("treats an ordinary blockquote line after the callout as outside it", () => {
      const markdown = ["> [!note] T", "> body", "", "> Ordinary quote", "lazy to the quote"].join(
        "\n",
      )

      expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
        [NOTE_DIRECTIVE, "body", ":::", "", "> Ordinary quote", "lazy to the quote"].join("\n"),
      )
    })
  })

  test("does not treat a ... line as the end of frontmatter", () => {
    const markdown = ["---", "> [!tip] Evidence", "> Body.", "", "...", ""].join("\n")

    expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(
      [
        "---",
        ':::obsidian-callout{kind="tip" title="Evidence"}',
        "Body.",
        ":::",
        "",
        "...",
        "",
      ].join("\n"),
    )
  })

  test("still protects frontmatter that closes with ---", () => {
    const markdown = ["---", "> [!tip] Evidence", "---", ""].join("\n")

    expect(prepareObsidianCalloutsForMdxEditor(markdown)).toBe(markdown)
  })

  test("collects unique resolver targets without aliases", () => {
    expect(
      collectObsidianWikiLinkTargets(
        "[[Beta]] [[Alpha|A]] ![[image.png]] [[Beta]] [[Alpha#Heading]]",
      ),
    ).toEqual(["Alpha", "Alpha#Heading", "Beta", "image.png"])
  })

  test("batches large resolver requests within the API target limit", () => {
    const targets = Array.from({ length: 501 }, (_, index) => `Note ${index}`)

    const batches = batchObsidianLinkTargets(targets)

    expect(batches.map((batch) => batch.length)).toEqual([500, 1])
    expect(batches.flat()).toEqual(targets)
  })

  test("invalidates link resolutions and the edited embedded note together", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const path = "Notes/Alpha.md"
    const linkKey = obsidianVaultQueryKeys.links(directory, "Index.md", ["Shared"])
    const otherDirectoryLinkKey = obsidianVaultQueryKeys.links("/tmp/other-vault", "Index.md", [
      "Shared",
    ])
    const embeddedNoteKey = obsidianVaultQueryKeys.embeddedNote(directory, path)
    queryClient.setQueryData(linkKey, { links: [], partial: false })
    queryClient.setQueryData(otherDirectoryLinkKey, { links: [], partial: false })
    queryClient.setQueryData(embeddedNoteKey, { content: "# Alpha" })

    await invalidateObsidianFileCaches(queryClient, {
      directory,
      path,
      previousContent: "---\naliases: [Old]\n---\n# Alpha",
      content: "---\naliases: [Shared]\n---\n# Alpha",
    })

    expect(queryClient.getQueryState(linkKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(embeddedNoteKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(otherDirectoryLinkKey)?.isInvalidated).toBe(false)
  })

  test("keeps link resolutions cached for body-only note edits", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const path = "Notes/Alpha.md"
    const linkKey = obsidianVaultQueryKeys.links(directory, "Index.md", ["Shared"])
    const embeddedNoteKey = obsidianVaultQueryKeys.embeddedNote(directory, path)
    queryClient.setQueryData(linkKey, { links: [], partial: false })
    queryClient.setQueryData(embeddedNoteKey, { content: "# Alpha" })

    await invalidateObsidianFileCaches(queryClient, {
      directory,
      path,
      previousContent: "---\naliases: [Shared]\n---\n# Old body",
      content: "---\naliases: [Shared]\n---\n# New body",
    })

    expect(queryClient.getQueryState(linkKey)?.isInvalidated).toBe(false)
    expect(queryClient.getQueryState(embeddedNoteKey)?.isInvalidated).toBe(true)
  })

  test("invalidates link resolutions for watcher-driven Markdown changes", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const linkKey = obsidianVaultQueryKeys.links(directory, "Index.md", ["Shared"])
    const profileKey = obsidianVaultQueryKeys.profile(directory)
    queryClient.setQueryData(linkKey, { links: [], partial: false })
    queryClient.setQueryData(profileKey, {
      detected: true,
      connected: true,
      configDirectories: [".obsidian"],
    })

    await invalidateObsidianWatcherCaches(queryClient, {
      directory,
      path: "Notes/Alpha.md",
      event: "change",
    })

    expect(queryClient.getQueryState(linkKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(false)
  })

  test("invalidates vault detection when root config directories change", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const profileKey = obsidianVaultQueryKeys.profile(directory)
    queryClient.setQueryData(profileKey, {
      detected: false,
      connected: false,
      configDirectories: [],
    })

    await invalidateObsidianWatcherCaches(queryClient, {
      directory,
      path: ".obsidian",
      event: "add",
    })

    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
  })

  test("invalidates vault detection when custom config markers change", async () => {
    const queryClient = new QueryClient()
    const directory = "/tmp/obsidian-vault"
    const profileKey = obsidianVaultQueryKeys.profile(directory)
    queryClient.setQueryData(profileKey, {
      detected: false,
      connected: false,
      configDirectories: [],
    })

    await invalidateObsidianWatcherCaches(queryClient, {
      directory,
      path: ".custom-config/core-plugins.json",
      event: "change",
    })

    expect(queryClient.getQueryState(profileKey)?.isInvalidated).toBe(true)
  })
})
