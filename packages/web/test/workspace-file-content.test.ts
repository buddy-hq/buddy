import { describe, expect, test } from "bun:test"
import { isReadableWorkspaceText } from "../src/lib/workspace-file-content"

describe("workspace file content readability", () => {
  test("allows valid UTF-8 text with form feed page separators", () => {
    expect(isReadableWorkspaceText("Page 1\n\fPage 2\n")).toBe(true)
  })

  test("rejects replacement-decoded invalid UTF-8", () => {
    expect(isReadableWorkspaceText("valid text\uFFFDinvalid byte")).toBe(false)
  })

  test("rejects binary-looking control characters", () => {
    expect(isReadableWorkspaceText("text\u0000binary")).toBe(false)
  })
})
