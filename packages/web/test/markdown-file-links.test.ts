import { describe, expect, test } from "bun:test"
import {
  anchorMarkdownOutsidePath,
  markdownFileLinkPath,
  resolveLiteralMarkdownFileLink,
  resolveMarkdownFileLink,
  windowsDriveFileUrl,
} from "../src/lib/markdown-file-links"

describe("markdown file links", () => {
  test("reads local paths from file URLs", () => {
    expect(markdownFileLinkPath("file:///Users/example/buddy/package.json#L5-L15")).toBe(
      "/Users/example/buddy/package.json",
    )
    expect(markdownFileLinkPath("file:///C:/Users/example/report.pdf")).toBe(
      "C:/Users/example/report.pdf",
    )
    expect(markdownFileLinkPath("file://fileserver/share/spec.md")).toBe(
      "\\\\fileserver\\share\\spec.md",
    )
  })

  test("decodes percent-encoded link targets", () => {
    expect(markdownFileLinkPath("./My%20Notes.md")).toBe("./My Notes.md")
    expect(markdownFileLinkPath("file:///Users/example/My%20Notes.md")).toBe(
      "/Users/example/My Notes.md",
    )
  })

  test("accepts home, parent, and absolute paths with a file extension", () => {
    expect(markdownFileLinkPath("~/Documents/report.pdf")).toBe("~/Documents/report.pdf")
    expect(markdownFileLinkPath("../shared/spec.md")).toBe("../shared/spec.md")
    expect(markdownFileLinkPath("/Users/example/notes.md")).toBe("/Users/example/notes.md")
    expect(markdownFileLinkPath("./artifacts/notes.md?raw")).toBe("./artifacts/notes.md")
  })

  test("accepts a markdown link whose target is a bare notebook filename", () => {
    expect(markdownFileLinkPath("workshop-objectives.md")).toBe("workshop-objectives.md")
    expect(markdownFileLinkPath("notes/a.md")).toBe("notes/a.md")
    expect(markdownFileLinkPath("Note:%20sub.md")).toBe("Note: sub.md")
  })

  test("leaves web, app, and in-page links alone", () => {
    expect(markdownFileLinkPath("https://arxiv.org/pdf/2401.00001.pdf")).toBeUndefined()
    expect(markdownFileLinkPath("//cdn.example.com/lib.js")).toBeUndefined()
    expect(markdownFileLinkPath("mailto:hello@hibuddy.in")).toBeUndefined()
    expect(markdownFileLinkPath("#usage")).toBeUndefined()
    expect(markdownFileLinkPath("/Users/example/folder")).toBeUndefined()
  })

  test("resolves a chat link from the notebook and a file link from its own folder", () => {
    expect(resolveMarkdownFileLink(undefined, "workshop-objectives.md")).toEqual({
      kind: "inside",
      path: "workshop-objectives.md",
    })
    expect(resolveMarkdownFileLink(undefined, "./artifacts/notes.md")).toEqual({
      kind: "inside",
      path: "./artifacts/notes.md",
    })
    expect(resolveMarkdownFileLink(undefined, "../Outside.md")).toEqual({
      kind: "outside",
      path: "../Outside.md",
    })
    expect(resolveMarkdownFileLink("docs/guide.md", "../notes/a.md")).toEqual({
      kind: "inside",
      path: "notes/a.md",
    })
    expect(resolveMarkdownFileLink("docs/guide.md", "./img.png")).toEqual({
      kind: "inside",
      path: "docs/img.png",
    })
    expect(resolveMarkdownFileLink("docs/guide.md", "workshop-objectives.md")).toEqual({
      kind: "inside",
      path: "docs/workshop-objectives.md",
    })
    expect(resolveMarkdownFileLink("docs/deep/guide.md", "../../../secret.md")).toEqual({
      kind: "outside",
      path: "../secret.md",
    })
    expect(resolveMarkdownFileLink("docs/guide.md", "https://example.com/guide")).toEqual({
      kind: "external",
      url: "https://example.com/guide",
    })
  })

  test("decodes a raw href once and keeps a chip path literal", () => {
    expect(resolveMarkdownFileLink(undefined, "./report%23draft.md")).toEqual({
      kind: "inside",
      path: "./report#draft.md",
    })
    expect(resolveMarkdownFileLink(undefined, "./report%2520draft.md")).toEqual({
      kind: "inside",
      path: "./report%20draft.md",
    })
    expect(resolveLiteralMarkdownFileLink(undefined, "./report#draft.md")).toEqual({
      kind: "inside",
      path: "./report#draft.md",
    })
    expect(resolveLiteralMarkdownFileLink(undefined, "./report%20draft.md")).toEqual({
      kind: "inside",
      path: "./report%20draft.md",
    })
    expect(resolveLiteralMarkdownFileLink("docs/guide.md", "./report#draft.md")).toEqual({
      kind: "inside",
      path: "docs/report#draft.md",
    })
  })

  test("forwards a parsed file URL and keeps a Windows home path outside", () => {
    expect(resolveMarkdownFileLink("docs/guide.md", "file:/tmp/report.pdf")).toEqual({
      kind: "outside",
      path: "/tmp/report.pdf",
    })
    expect(resolveMarkdownFileLink("docs/guide.md", "FILE:///tmp/x.pdf")).toEqual({
      kind: "outside",
      path: "/tmp/x.pdf",
    })
    expect(resolveMarkdownFileLink("docs/guide.md", "~\\Desktop\\report.pdf")).toEqual({
      kind: "outside",
      path: "~\\Desktop\\report.pdf",
    })
  })

  test("anchors a relative outside path to the document storage root", () => {
    expect(anchorMarkdownOutsidePath("/notes", "../Outside.md")).toBe("/Outside.md")
    expect(anchorMarkdownOutsidePath("/notes", "/tmp/report.pdf")).toBe("/tmp/report.pdf")
    expect(anchorMarkdownOutsidePath("/notes", "~\\Desktop\\report.pdf")).toBe(
      "~\\Desktop\\report.pdf",
    )
    expect(anchorMarkdownOutsidePath("C:\\notes", "..\\Outside.md")).toBe("C:\\Outside.md")
    for (const [directory, path, expected] of [
      ["/", "../Outside.md", "/Outside.md"],
      ["C:\\", "../Outside.md", "C:\\Outside.md"],
      ["C:/", "../Outside.md", "C:\\Outside.md"],
      ["C:/notes", "../../Outside.md", "C:\\Outside.md"],
      ["\\\\server\\share", "../Outside.md", "\\\\server\\share\\Outside.md"],
      ["\\\\server\\share\\notes", "../../Outside.md", "\\\\server\\share\\Outside.md"],
      ["//server/share", "../Outside.md", "\\\\server\\share\\Outside.md"],
      ["//server/share/notes", "../../Outside.md", "\\\\server\\share\\Outside.md"],
    ] as const) {
      expect(anchorMarkdownOutsidePath(directory, path)).toBe(expected)
    }
  })

  test("rewrites Windows drive paths as file URLs", () => {
    expect(windowsDriveFileUrl("C:\\Users\\example\\report.pdf")).toBe(
      "file:///C:/Users/example/report.pdf",
    )
    expect(windowsDriveFileUrl("./notes.md")).toBeUndefined()
  })
})
