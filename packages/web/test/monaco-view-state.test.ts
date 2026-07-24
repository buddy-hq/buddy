import { describe, expect, test } from "bun:test"
import { monacoViewStateKey } from "../src/lib/monaco-view-state"

describe("Monaco view-state keys", () => {
  test("scope identical relative paths to their notebook", () => {
    expect(monacoViewStateKey({ directory: "/notebooks/first", path: "README.md" })).not.toBe(
      monacoViewStateKey({ directory: "/notebooks/second", path: "README.md" }),
    )
  })
})
