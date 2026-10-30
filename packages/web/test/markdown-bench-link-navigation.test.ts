import { describe, expect, test } from "bun:test"
import {
  markdownBenchOutsideFileOpen,
  resolveMarkdownBenchLink,
} from "../src/components/bench/markdown/link-navigation"
import {
  findMarkdownBenchFragmentTarget,
  readMarkdownBenchHeadings,
} from "../src/components/bench/markdown/editor-fragments"
import { createNotesWikiLinkContext } from "../src/features/notes/notes-wikilinks"
import { notesQueryKeys } from "../src/features/notes/queries"
import {
  buildBenchNavigation,
  readBenchTargetFromLocation,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { encodeDirectory } from "../src/lib/directory-token"

describe("Markdown Bench link navigation", () => {
  test("resolves punctuation, Unicode and duplicate heading slugs without changing the document", () => {
    const root = document.createElement("div")
    root.innerHTML = [
      "<h2>Agentic <em>Software Engineering</em>: Session Plan</h2>",
      "<h2>Session plan</h2>",
      "<h2>Session plan</h2>",
      "<h2>Session plan-1</h2>",
      "<h2>你好 Café</h2>",
    ].join("")
    const source = root.innerHTML
    const headings = readMarkdownBenchHeadings(root)
    expect(headings.map((heading) => heading.id)).toEqual([
      "agentic-software-engineering-session-plan",
      "session-plan",
      "session-plan-1",
      "session-plan-1-1",
      "你好-café",
    ])
    for (const [fragment, label] of [
      ["agentic-software-engineering-session-plan", "Agentic Software Engineering: Session Plan"],
      ["session-plan-1", "Session plan"],
      ["session-plan-1-1", "Session plan-1"],
      ["%E4%BD%A0%E5%A5%BD-caf%C3%A9", "你好 Café"],
    ] as const) {
      expect(findMarkdownBenchFragmentTarget(root, fragment)?.textContent).toBe(label)
    }
    expect(findMarkdownBenchFragmentTarget(root, "session-plan-1")).toBe(
      root.querySelectorAll<HTMLElement>("h2")[2],
    )
    expect(root.innerHTML).toBe(source)
  })

  test("preserves explicit anchors and Obsidian targets while excluding embedded notes from the outline", () => {
    const root = document.createElement("div")
    root.innerHTML = [
      '<div class="mdxeditor-root-contenteditable">',
      "<h2>Session plan</h2>",
      '<section data-component="markdown-bench-obsidian-note-embed"><h2>Session plan</h2></section>',
      "<h2>Session plan</h2><h2>Questions &amp; discussion</h2>",
      '<p id="session-plan">Explicit anchor</p><p>Important paragraph ^block-id</p>',
      "</div>",
    ].join("")
    expect(readMarkdownBenchHeadings(root).map((heading) => heading.id)).toEqual([
      "session-plan",
      "session-plan-1",
      "questions--discussion",
    ])
    expect(findMarkdownBenchFragmentTarget(root, "session-plan")?.textContent).toBe(
      "Explicit anchor",
    )
    expect(findMarkdownBenchFragmentTarget(root, "session-plan-1")).toBe(
      root.querySelectorAll("h2")[2],
    )
    expect(findMarkdownBenchFragmentTarget(root, "Questions%20%26%20discussion")?.textContent).toBe(
      "Questions & discussion",
    )
    expect(findMarkdownBenchFragmentTarget(root, "^block-id")?.textContent).toBe(
      "Important paragraph ^block-id",
    )
    expect(findMarkdownBenchFragmentTarget(root, "missing")).toBeUndefined()
  })

  test("resolves same-document fragments and relative workspace files", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "#Polynomial%20Functions")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "Notes/Current.md",
      fragment: "Polynomial Functions",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "../Resources/Guide.pdf")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "Resources/Guide.pdf",
    })
  })

  test("keeps relative links inside the Notes library", () => {
    expect(resolveMarkdownBenchLink("Current.md", "Related.md", "notes")).toEqual({
      type: "workspace-file",
      root: "notes",
      path: "Related.md",
    })
  })

  test("opens Notes wikilinks at their headings and preserves fragments in the URL", () => {
    const opened: BenchTarget[] = []
    const context = createNotesWikiLinkContext({
      directory: "/notes",
      documentPath: "Current.md",
      markdown: "[[Related#Details]] and [[#Introduction]]",
      notes: [
        { kind: "plain", relativePath: "Current.md", title: "Current", updatedAt: 0 },
        { kind: "plain", relativePath: "Related.md", title: "Related", updatedAt: 0 },
      ],
      openTarget: (target) => {
        opened.push(target)
      },
    })
    for (const link of ["Related#Details", "#Introduction"]) {
      const resolution = context.resolutions.get(link)
      if (!resolution) throw new Error(`Missing link resolution: ${link}`)
      context.openResolution(resolution)
    }
    expect(opened).toEqual([
      {
        type: "workspace-file",
        root: "notes",
        path: "Related.md",
        viewer: "markdown",
        fragment: "Details",
      },
      {
        type: "workspace-file",
        root: "notes",
        path: "Current.md",
        viewer: "markdown",
        fragment: "Introduction",
      },
    ])
    for (const target of opened) {
      const navigation = buildBenchNavigation({ directory: "/notebook", target, mode: "docked" })
      expect(
        readBenchTargetFromLocation({
          pathname: `/${encodeDirectory("/notebook")}/markdown`,
          search: navigation.search,
        }),
      ).toEqual(target)
    }
    expect(resolveMarkdownBenchLink("Current.md", "#Introduction", "notes")).toMatchObject({
      path: "Current.md",
      root: "notes",
      fragment: "Introduction",
    })
    expect(resolveMarkdownBenchLink("Current.md", "Related.md#Details", "notes")).toMatchObject({
      path: "Related.md",
      root: "notes",
      fragment: "Details",
    })
    expect(
      context.embeddedMarkdownLoader.queryKey({
        directory: "/notebook",
        path: "Related.md",
      }),
    ).toEqual(notesQueryKeys.note("Related.md"))
  })

  test("keeps image embeds available without presenting plain image links as openable", () => {
    const context = createNotesWikiLinkContext({
      directory: "/notes",
      documentPath: "Current.md",
      markdown: "![[photo.png]] and [[photo.png]]",
      notes: [],
      openTarget: () => undefined,
    })
    const resolution = context.resolutions.get("photo.png")
    expect(resolution).toMatchObject({ status: "resolved", kind: "image" })
    if (!resolution) throw new Error("Missing image resolution")
    expect(context.canOpenResolution?.(resolution)).toBe(false)
    expect(context.resolveImageSrc?.("photo.png")).toContain("photo.png")
  })

  test("keeps external URLs outside workspace navigation", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "https://example.com/guide")).toEqual({
      type: "external",
      url: "https://example.com/guide",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "//example.com/guide")).toEqual({
      type: "external",
      url: "https://example.com/guide",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "mailto:person@example.com")).toEqual({
      type: "external",
      url: "mailto:person@example.com",
    })
    expect(
      resolveMarkdownBenchLink("Notes/Current.md", "obsidian://open?vault=Notes&file=Current"),
    ).toEqual({
      type: "external",
      url: "obsidian://open?vault=Notes&file=Current",
    })
  })

  test("rejects unsafe and unsupported external URL schemes", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "javascript:alert(1)")).toBeUndefined()
    expect(resolveMarkdownBenchLink("Notes/Current.md", "custom-protocol:payload")).toBeUndefined()
  })

  test("resolves a relative link against the markdown file's own folder", () => {
    expect(resolveMarkdownBenchLink("docs/guide.md", "../notes/a.md")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "notes/a.md",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "./img.png")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "docs/img.png",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "workshop-objectives.md")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "docs/workshop-objectives.md",
    })
    expect(resolveMarkdownBenchLink("Notes/Current.md", "Note:%20sub.md")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "Notes/Note: sub.md",
    })
  })

  test("follows outside-file rules when a link leaves the notebook", () => {
    expect(resolveMarkdownBenchLink("Notes/Current.md", "file:///etc/passwd")).toEqual({
      type: "outside-file",
      path: "/etc/passwd",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "file:///tmp/LICENSE")).toEqual({
      type: "outside-file",
      path: "/tmp/LICENSE",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "file:///C:/docs/LICENSE")).toEqual({
      type: "outside-file",
      path: "C:/docs/LICENSE",
    })
    expect(resolveMarkdownBenchLink("Current.md", "../Outside.md")).toEqual({
      type: "outside-file",
      path: "../Outside.md",
    })
    expect(resolveMarkdownBenchLink("docs/deep/guide.md", "../../../secret.md")).toEqual({
      type: "outside-file",
      path: "../secret.md",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "/Users/example/notes.md")).toEqual({
      type: "outside-file",
      path: "/Users/example/notes.md",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "file:///Users/example/notes.md")).toEqual({
      type: "outside-file",
      path: "/Users/example/notes.md",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "file:/tmp/report.pdf")).toEqual({
      type: "outside-file",
      path: "/tmp/report.pdf",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "FILE:///tmp/x.pdf")).toEqual({
      type: "outside-file",
      path: "/tmp/x.pdf",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "~\\Desktop\\report.pdf")).toEqual({
      type: "outside-file",
      path: "~\\Desktop\\report.pdf",
    })
  })

  test("resolves extensionless relative files", () => {
    expect(resolveMarkdownBenchLink("docs/guide.md", "../LICENSE")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "LICENSE",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "./README")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "docs/README",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", ".env")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "docs/.env",
    })
    expect(resolveMarkdownBenchLink("docs/guide.md", "backup.001")).toEqual({
      type: "workspace-file",
      root: "notebook",
      path: "docs/backup.001",
    })
  })

  test("keeps the notebook when a Notes file links outside its library", () => {
    expect(
      markdownBenchOutsideFileOpen({
        notebookDirectory: "/notebook",
        storageDirectory: "/notes",
        outsidePath: "/tmp/report.pdf",
      }),
    ).toEqual({ directory: "/notebook", path: "/tmp/report.pdf" })
    expect(
      markdownBenchOutsideFileOpen({
        notebookDirectory: "/notebook",
        storageDirectory: "/notes",
        outsidePath: "../Outside.md",
      }),
    ).toEqual({ directory: "/notebook", path: "/Outside.md" })
  })
})
