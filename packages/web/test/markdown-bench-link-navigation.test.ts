import { describe, expect, test } from "bun:test"
import { resolveMarkdownBenchLink } from "../src/components/bench/markdown/link-navigation"
import { createNotesWikiLinkContext } from "../src/features/notes/notes-wikilinks"
import { notesQueryKeys } from "../src/features/notes/queries"
import {
  buildBenchNavigation,
  readBenchTargetFromLocation,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { encodeDirectory } from "../src/lib/directory-token"

describe("Markdown Bench link navigation", () => {
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
    expect(resolveMarkdownBenchLink("Notes/Current.md", "file:///etc/passwd")).toBeUndefined()
    expect(resolveMarkdownBenchLink("Notes/Current.md", "javascript:alert(1)")).toBeUndefined()
    expect(resolveMarkdownBenchLink("Notes/Current.md", "custom-protocol:payload")).toBeUndefined()
  })

  test("rejects relative links that escape the notebook", () => {
    expect(resolveMarkdownBenchLink("Current.md", "../Outside.md")).toBeUndefined()
  })
})
