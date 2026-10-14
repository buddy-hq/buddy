import { describe, expect, test } from "bun:test"
import { getPermissionDockPathDisplay } from "../src/lib/permission-dock-path-display"

describe("permission dock path display", () => {
  test("keeps short paths plain", () => {
    expect(getPermissionDockPathDisplay("/Users/example/file.md")).toEqual({
      kind: "plain",
      path: "/Users/example/file.md",
    })
  })

  test("highlights the last three segments on long paths", () => {
    expect(
      getPermissionDockPathDisplay(
        "/Users/example/Desktop/long-path-test/level-1/level-2/level-3/level-4/deep-nested-folder/file.md",
      ),
    ).toEqual({
      kind: "split",
      prefix: "/Users/example/Desktop/long-path-test/level-1/level-2/level-3/",
      interactive: "level-4/deep-nested-folder",
      final: "file.md",
    })
  })

  test("handles folder globs", () => {
    expect(
      getPermissionDockPathDisplay(
        "/Users/example/Desktop/long-path-test/level-1/level-2/level-3/*",
      ),
    ).toEqual({
      kind: "split",
      prefix: "/Users/example/Desktop/long-path-test/level-1/",
      interactive: "level-2/level-3",
      final: "*",
    })
  })
  test("preserves Windows drive and network-share roots", () => {
    expect(getPermissionDockPathDisplay("C:\\Users\\example\\notes\\file.md")).toEqual({ kind: "split", prefix: "C:/Users/", interactive: "example/notes", final: "file.md" })
    expect(getPermissionDockPathDisplay("\\\\server\\share\\notes\\deep\\file.md")).toEqual({ kind: "split", prefix: "//server/share/", interactive: "notes/deep", final: "file.md" })
  })
  test("shows web resources without treating URL separators as filesystem segments", () => {
    expect(getPermissionDockPathDisplay("https://example.com/a/b/page")).toEqual({ kind: "plain", path: "https://example.com/a/b/page" })
  })

})
