import { describe, expect, test } from "bun:test"
import {
  canNavigateHistoryAtCursor,
  navigatePromptHistory,
  prependHistoryEntry,
} from "../../../src/components/prompt/prompt-history"

describe("prompt history", () => {
  test("stores non-empty drafts and deduplicates the latest entry", () => {
    const first = prependHistoryEntry([], {
      value: "Review these diffs",
      attachments: [],
      parts: [],
    })
    const second = prependHistoryEntry(first, {
      value: "Review these diffs",
      attachments: [],
      parts: [],
    })

    expect(first).toHaveLength(1)
    expect(second).toBe(first)
  })

  test("navigates from current draft to history and back to the saved draft", () => {
    const entries = prependHistoryEntry([], {
      value: "Investigate the prompt box",
      attachments: [],
      parts: [],
    })
    const up = navigatePromptHistory({
      direction: "up",
      entries,
      historyIndex: -1,
      current: {
        value: "Unsaved draft",
        attachments: [],
        parts: [],
      },
      savedDraft: null,
    })

    expect(up.handled).toBe(true)
    if (!up.handled) return

    const down = navigatePromptHistory({
      direction: "down",
      entries,
      historyIndex: up.historyIndex,
      current: up.entry,
      savedDraft: up.savedDraft,
    })

    expect(down).toEqual({
      handled: true,
      historyIndex: -1,
      savedDraft: null,
      entry: {
        value: "Unsaved draft",
        attachments: [],
        parts: [],
      },
      cursor: "end",
    })
  })

  test("preserves structured parts when saving and restoring drafts", () => {
    const draft = {
      value: "Read @docs/book with spaces.pdf",
      attachments: [],
      parts: [
        {
          type: "text" as const,
          text: "Read ",
        },
        {
          type: "workspace-file-reference" as const,
          path: "docs/book with spaces.pdf",
        },
      ],
    }

    const entries = prependHistoryEntry([], draft)
    const restored = navigatePromptHistory({
      direction: "up",
      entries,
      historyIndex: -1,
      current: draft,
      savedDraft: null,
    })

    expect(restored.handled).toBe(true)
    if (!restored.handled) return

    expect(restored.entry.parts).toEqual(draft.parts)
  })

  test("keeps history entries that are represented only by structured parts", () => {
    const draft = {
      value: "",
      attachments: [],
      parts: [
        {
          type: "workspace-file-reference" as const,
          path: "docs/book.pdf",
        },
      ],
    }

    const entries = prependHistoryEntry([], draft)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.parts).toEqual(draft.parts)
  })

  test("does not deduplicate resource references with different keys", () => {
    const first = prependHistoryEntry([], {
      value: "Use resource:alpha",
      attachments: [],
      parts: [{ type: "resource-reference", key: "alpha" }],
    })
    const second = prependHistoryEntry(first, {
      value: "Use resource:beta",
      attachments: [],
      parts: [{ type: "resource-reference", key: "beta" }],
    })

    expect(second).toHaveLength(2)
    expect(second[0]?.parts).toEqual([{ type: "resource-reference", key: "beta" }])
    expect(second[1]?.parts).toEqual([{ type: "resource-reference", key: "alpha" }])
  })

  test("only allows fresh history navigation at the start or end of the editor", () => {
    expect(canNavigateHistoryAtCursor("up", "hello", 0)).toBe(true)
    expect(canNavigateHistoryAtCursor("up", "hello", 2)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", "hello", 5)).toBe(true)
    expect(canNavigateHistoryAtCursor("down", "hello", 1)).toBe(false)
  })
})
