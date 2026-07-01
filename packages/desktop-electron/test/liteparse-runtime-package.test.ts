import { describe, expect, test } from "bun:test"
import { liteParseNativePackageName } from "../../../script/backend-node-artifact"

describe("LiteParse runtime package", () => {
  test.each([
    {
      target: { platform: "darwin", arch: "arm64" },
      expected: "@llamaindex/liteparse-darwin-arm64",
    },
    {
      target: { platform: "darwin", arch: "x64" },
      expected: "@llamaindex/liteparse-darwin-x64",
    },
    {
      target: { platform: "win32", arch: "x64" },
      expected: "@llamaindex/liteparse-win32-x64-msvc",
    },
  ])("maps $target.platform-$target.arch to $expected", ({ target, expected }) => {
    expect(liteParseNativePackageName(target)).toBe(expected)
  })
})
