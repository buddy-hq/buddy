import { describe, expect, test } from "bun:test"
import {
  filterMentionableFiles,
  isFolderPrefixMention,
} from "../src/components/prompt/mention-autocomplete"

const COMPOSED = "Biólogo/"
const DECOMPOSED = "Biólogo/"

describe("filterMentionableFiles", () => {
  test("matches a composed query against a path stored with decomposed accents", () => {
    expect(COMPOSED).not.toBe(DECOMPOSED)
    expect(filterMentionableFiles([{ path: DECOMPOSED }], "bió")).toEqual([{ path: DECOMPOSED }])
    expect(filterMentionableFiles([{ path: DECOMPOSED }], "ólogo")).toEqual([{ path: DECOMPOSED }])
  })

  test("matches a decomposed query against a path stored composed", () => {
    expect(filterMentionableFiles([{ path: COMPOSED }], "bió")).toEqual([{ path: COMPOSED }])
  })

  test("ranks a decomposed prefix match ahead of a mid-path match", () => {
    const files = [{ path: "notes/Biólogo.md" }, { path: DECOMPOSED }]
    expect(filterMentionableFiles(files, "bió").map((file) => file.path)).toEqual([
      DECOMPOSED,
      "notes/Biólogo.md",
    ])
  })

  test("keeps ASCII matching case-insensitive and drops non-matches", () => {
    const files = [{ path: "Biology/" }, { path: "chemistry/" }]
    expect(filterMentionableFiles(files, "BIO")).toEqual([{ path: "Biology/" }])
    expect(filterMentionableFiles(files, "")).toHaveLength(2)
  })
})

describe("isFolderPrefixMention", () => {
  test("matches folders that start with the typed query, never files or an empty query", () => {
    const folder = { type: "file" as const, path: "Biology/cells/" }
    expect(isFolderPrefixMention(folder, "bio")).toBe(true)
    expect(isFolderPrefixMention(folder, "biology/cells/")).toBe(true)
    expect(isFolderPrefixMention(folder, "cells")).toBe(false)
    expect(isFolderPrefixMention(folder, "")).toBe(false)
    expect(isFolderPrefixMention({ type: "file", path: "biology.md" }, "bio")).toBe(false)
  })
})
