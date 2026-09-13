import { describe, expect, test } from "bun:test"
import { createMarkdownBenchFileStore } from "../src/components/bench/markdown/file-store"
import {
  markdownBenchDirty,
  markdownBenchPendingSaveSnapshot,
  MARKDOWN_FILE_CHANGED_MESSAGE,
  MARKDOWN_FILE_UNAVAILABLE_MESSAGE,
} from "../src/components/bench/markdown/file-rules"

function store(content = "original") {
  return createMarkdownBenchFileStore({ content, version: "version-1" })
}

describe("Markdown Bench file store", () => {
  test("exposes edits synchronously so callbacks never read a stale mirror", () => {
    const file = store()
    file.getState().changeMarkdown("edited")

    expect(file.getState().markdown).toBe("edited")
    expect(markdownBenchDirty(file.getState())).toBe(true)
    expect(
      markdownBenchPendingSaveSnapshot(file.getState(), {
        directory: "/repo",
        path: "notes/worksheet.md",
      }),
    ).toEqual({
      conflict: false,
      content: "edited",
      directory: "/repo",
      exists: true,
      path: "notes/worksheet.md",
      saveError: false,
      savedContent: "original",
      saving: false,
      version: "version-1",
    })
  })

  test("keeps newer edits after a save commits the content that was sent", () => {
    const file = store()
    file.getState().changeMarkdown("first edit")
    file.getState().beginSave()
    file.getState().changeMarkdown("newer edit")
    file.getState().commitSaved({
      content: "first edit",
      path: "notes/worksheet.md",
      version: "version-2",
    })

    const state = file.getState()
    expect(state.markdown).toBe("newer edit")
    expect(state.savedMarkdown).toBe("first edit")
    expect(state.version).toBe("version-2")
    expect(state.saving).toBe(false)
    expect(markdownBenchDirty(state)).toBe(true)
  })

  test("only conflicts on a deleted file when there are unsaved edits", () => {
    const clean = store()
    clean.getState().markMissingOnDisk()
    expect(clean.getState().conflict).toBe(false)
    expect(clean.getState().saveError).toBeUndefined()

    const edited = store()
    edited.getState().changeMarkdown("edited")
    edited.getState().markMissingOnDisk()
    expect(edited.getState().conflict).toBe(true)
    expect(edited.getState().saveError).toBe(MARKDOWN_FILE_UNAVAILABLE_MESSAGE)
  })

  test("marks a stale file without discarding the in-memory document", () => {
    const file = store()
    file.getState().changeMarkdown("edited")
    file.getState().markStaleOnDisk()

    const state = file.getState()
    expect(state.markdown).toBe("edited")
    expect(state.conflict).toBe(true)
    expect(state.exists).toBe(true)
    expect(state.saveError).toBe(MARKDOWN_FILE_CHANGED_MESSAGE)
  })

  test("re-enters processing only when committed content differs from the editor", () => {
    const file = store()
    file.getState().commitFile({ content: "original", version: "version-2" })
    expect(file.getState().processingStatus).toBe("ready")

    file.getState().commitFile({ content: "from disk", version: "version-3" })
    expect(file.getState().processingStatus).toBe("loading")
  })

  test("ignores processing results for superseded content", () => {
    const file = store()
    file.getState().changeMarkdown("edited")
    file.getState().applyProcessingResult({ markdown: "original", error: "stale failure" })
    expect(file.getState().processingError).toBeUndefined()

    file.getState().applyProcessingResult({ markdown: "edited", error: "real failure" })
    expect(file.getState().processingStatus).toBe("error")
    expect(file.getState().processingError).toBe("real failure")
  })
})
