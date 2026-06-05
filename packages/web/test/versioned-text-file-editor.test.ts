import { describe, expect, test } from "bun:test"
import {
  resolveVersionedTextFileSaveRetryContent,
  shouldUseSavedVersionedTextFileContent,
  shouldShowVersionedTextFileSaveRetry,
  shouldSkipVersionedTextFileFlush,
} from "../src/components/editors/versioned-text-file-editor"

const PERSISTED_CONTENT = "persisted"
const EDITED_CONTENT = "edited"
const DEFAULT_CONTENT = "default"

describe("versioned text file editor flush rules", () => {
  test("background flushes skip unchanged failed content", () => {
    expect(
      shouldSkipVersionedTextFileFlush({
        exists: true,
        saving: false,
        hasConflict: false,
        content: EDITED_CONTENT,
        savedContent: PERSISTED_CONTENT,
        failedSaveContent: EDITED_CONTENT,
        retryFailedContent: false,
      }),
    ).toBe(true)
  })

  test("explicit flushes retry unchanged failed content", () => {
    expect(
      shouldSkipVersionedTextFileFlush({
        exists: true,
        saving: false,
        hasConflict: false,
        content: EDITED_CONTENT,
        savedContent: PERSISTED_CONTENT,
        failedSaveContent: EDITED_CONTENT,
        retryFailedContent: true,
      }),
    ).toBe(false)
  })

  test("shows retry only when a save attempt can be retried", () => {
    expect(
      shouldShowVersionedTextFileSaveRetry({
        error: "Read failed",
        exists: false,
        content: "",
        savedContent: "",
        failedSaveContent: undefined,
      }),
    ).toBe(false)

    expect(
      shouldShowVersionedTextFileSaveRetry({
        error: "Save failed",
        exists: false,
        content: "",
        savedContent: "",
        failedSaveContent: DEFAULT_CONTENT,
      }),
    ).toBe(true)

    expect(
      shouldShowVersionedTextFileSaveRetry({
        error: "Save failed",
        exists: true,
        content: EDITED_CONTENT,
        savedContent: PERSISTED_CONTENT,
        failedSaveContent: undefined,
      }),
    ).toBe(true)
  })

  test("retries the failed payload before falling back to current editor content", () => {
    expect(
      resolveVersionedTextFileSaveRetryContent({
        content: "",
        failedSaveContent: DEFAULT_CONTENT,
      }),
    ).toBe(DEFAULT_CONTENT)

    expect(
      resolveVersionedTextFileSaveRetryContent({
        content: EDITED_CONTENT,
        failedSaveContent: undefined,
      }),
    ).toBe(EDITED_CONTENT)
  })

  test("uses saved content after create without clobbering newer local edits", () => {
    expect(
      shouldUseSavedVersionedTextFileContent({
        existedBeforeSave: false,
        currentContent: "",
        requestedContent: DEFAULT_CONTENT,
      }),
    ).toBe(true)

    expect(
      shouldUseSavedVersionedTextFileContent({
        existedBeforeSave: true,
        currentContent: "newer edit",
        requestedContent: EDITED_CONTENT,
      }),
    ).toBe(false)
  })
})
