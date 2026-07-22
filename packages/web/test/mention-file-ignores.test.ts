import { describe, expect, test } from "bun:test"
import {
  filterIgnoredMentionFiles,
  isIgnoredMentionPath,
} from "../src/components/prompt/mention-file-ignores"

describe("mention file ignores", () => {
  test("ignores dependency, cache, and VCS directories at any depth", () => {
    expect(isIgnoredMentionPath("node_modules")).toBe(true)
    expect(isIgnoredMentionPath("node_modules/@types/node/assert.d.ts")).toBe(true)
    expect(isIgnoredMentionPath("packages/web/node_modules/react")).toBe(true)
    expect(isIgnoredMentionPath(".git/config")).toBe(true)
    expect(isIgnoredMentionPath("app/__pycache__/mod.pyc")).toBe(true)
    expect(isIgnoredMentionPath("coverage/lcov.info")).toBe(true)
  })

  test("keeps ordinary source files and lookalike names", () => {
    expect(isIgnoredMentionPath("src/components/prompt/prompt-composer.tsx")).toBe(false)
    // Not ignored: build output people sometimes reference, and vendored code.
    expect(isIgnoredMentionPath("dist/index.js")).toBe(false)
    expect(isIgnoredMentionPath("vendor/opencode/README.md")).toBe(false)
    // A substring of an ignored name is not a whole segment.
    expect(isIgnoredMentionPath("src/node_modules_helper.ts")).toBe(false)
  })

  test("filterIgnoredMentionFiles drops ignored paths but preserves order", () => {
    const files = [
      { path: "src/a.ts" },
      { path: "node_modules/react/index.js" },
      { path: "src/b.ts" },
    ]
    expect(filterIgnoredMentionFiles(files)).toEqual([{ path: "src/a.ts" }, { path: "src/b.ts" }])
  })
})
