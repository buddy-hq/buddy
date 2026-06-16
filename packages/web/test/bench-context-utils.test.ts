import { describe, expect, test } from "bun:test"
import { workspaceAbsolutePath } from "../src/components/bench/bench-context-utils"

describe("bench context utilities", () => {
  test("builds POSIX workspace absolute paths", () => {
    expect(
      workspaceAbsolutePath({
        directory: "/Users/me/project/",
        path: "/docs/design.md",
      }),
    ).toBe("/Users/me/project/docs/design.md")
  })

  test("builds Windows workspace absolute paths without mixed separators", () => {
    expect(
      workspaceAbsolutePath({
        directory: "C:\\Users\\me\\project\\",
        path: "/docs/design.md",
      }),
    ).toBe("C:\\Users\\me\\project\\docs\\design.md")
  })
})
