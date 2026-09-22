import { describe, expect, test } from "bun:test"
import { markdownFileLinkPath, windowsDriveFileUrl } from "../src/lib/markdown-file-links"

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

  test("leaves web, app, and in-page links alone", () => {
    expect(markdownFileLinkPath("https://arxiv.org/pdf/2401.00001.pdf")).toBeUndefined()
    expect(markdownFileLinkPath("//cdn.example.com/lib.js")).toBeUndefined()
    expect(markdownFileLinkPath("mailto:hello@hibuddy.in")).toBeUndefined()
    expect(markdownFileLinkPath("#usage")).toBeUndefined()
    expect(markdownFileLinkPath("/Users/example/folder")).toBeUndefined()
  })

  test("rewrites Windows drive paths as file URLs", () => {
    expect(windowsDriveFileUrl("C:\\Users\\example\\report.pdf")).toBe(
      "file:///C:/Users/example/report.pdf",
    )
    expect(windowsDriveFileUrl("./notes.md")).toBeUndefined()
  })
})
