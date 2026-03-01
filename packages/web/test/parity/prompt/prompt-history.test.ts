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
    })
    const second = prependHistoryEntry(first, {
      value: "Review these diffs",
      attachments: [],
    })

    expect(first).toHaveLength(1)
    expect(second).toBe(first)
  })

  test("navigates from current draft to history and back to the saved draft", () => {
    const entries = prependHistoryEntry([], {
      value: "Investigate the prompt box",
      attachments: [],
    })
    const up = navigatePromptHistory({
      direction: "up",
      entries,
      historyIndex: -1,
      current: {
        value: "Unsaved draft",
        attachments: [],
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
      },
      cursor: "end",
    })
  })

  test("only allows fresh history navigation at the start or end of the editor", () => {
    expect(canNavigateHistoryAtCursor("up", "hello", 0)).toBe(true)
    expect(canNavigateHistoryAtCursor("up", "hello", 2)).toBe(false)
    expect(canNavigateHistoryAtCursor("down", "hello", 5)).toBe(true)
    expect(canNavigateHistoryAtCursor("down", "hello", 1)).toBe(false)
  })
})
