import { describe, expect, test } from "bun:test"
import {
  flushMarkdownBenchPendingSave,
  resolveMarkdownBenchTargetStatus,
  shouldFlushMarkdownBenchPendingSave,
  type MarkdownBenchPendingSaveSnapshot,
} from "../src/components/bench/markdown-bench-page"
import type { ProjectExplorerEditableFileState } from "../src/state/chat-actions"

const BASE_SNAPSHOT: MarkdownBenchPendingSaveSnapshot = {
  conflict: false,
  content: "edited",
  directory: "/repo",
  exists: true,
  path: "notes/worksheet.md",
  saveError: false,
  savedContent: "original",
  saving: false,
  version: "version-1",
}

describe("MarkdownBenchPage pending save flush", () => {
  test("flushes the latest dirty snapshot without component state updates", async () => {
    const calls: Array<{
      content: string
      directory: string
      expectedVersion?: string | null
      path: string
    }> = []

    const flushed = await flushMarkdownBenchPendingSave(BASE_SNAPSHOT, async (input) => {
      calls.push({
        content: input.content,
        directory: input.directory,
        expectedVersion: input.expectedVersion,
        path: input.path,
      })
      return {
        content: input.content,
        path: input.path,
        version: "version-2",
      } satisfies ProjectExplorerEditableFileState
    })

    expect(flushed).toBe(true)
    expect(calls).toEqual([
      {
        content: "edited",
        directory: "/repo",
        expectedVersion: "version-1",
        path: "notes/worksheet.md",
      },
    ])
  })

  test("skips clean, saving, conflicted, and save-error snapshots", () => {
    expect(
      shouldFlushMarkdownBenchPendingSave({
        ...BASE_SNAPSHOT,
        content: BASE_SNAPSHOT.savedContent,
      }),
    ).toBe(false)
    expect(shouldFlushMarkdownBenchPendingSave({ ...BASE_SNAPSHOT, saving: true })).toBe(false)
    expect(shouldFlushMarkdownBenchPendingSave({ ...BASE_SNAPSHOT, conflict: true })).toBe(false)
    expect(shouldFlushMarkdownBenchPendingSave({ ...BASE_SNAPSHOT, saveError: true })).toBe(false)
    expect(shouldFlushMarkdownBenchPendingSave({ ...BASE_SNAPSHOT, exists: false })).toBe(false)
  })
})

describe("MarkdownBenchPage target status", () => {
  const baseInput = {
    conflict: false,
    dirty: false,
    exists: true,
    loading: false,
    processingStatus: "ready" as const,
    saveError: undefined,
  }

  test("publishes parser loading and error through the existing Bench status", () => {
    expect(
      resolveMarkdownBenchTargetStatus({
        ...baseInput,
        processingStatus: "loading",
      }),
    ).toBe("loading")
    expect(
      resolveMarkdownBenchTargetStatus({
        ...baseInput,
        processingStatus: "error",
      }),
    ).toBe("error")
    expect(resolveMarkdownBenchTargetStatus(baseInput)).toBe("ready")
  })
})
