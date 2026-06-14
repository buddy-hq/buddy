import { describe, expect, test } from "bun:test"
import {
  resolveWorkspaceFileOpenPlan,
  WORKSPACE_FILE_OPEN_TARGET_COPY_PATH,
  WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
  WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_PANEL,
  WORKSPACE_FILE_OPEN_TARGET_READING,
  WORKSPACE_FILE_OPEN_TARGET_REVEAL,
} from "../src/lib/workspace-file-open"

describe("workspace file open policy", () => {
  test("routes reader files to Buddy reading mode first", () => {
    expect(
      resolveWorkspaceFileOpenPlan({
        path: "notes/book.pdf",
        absolutePath: "/repo/notes/book.pdf",
        available: true,
        canOpenInBuddy: true,
        canOpenReading: true,
        canOpenDefaultApp: true,
        canReveal: true,
      }),
    ).toEqual({
      primaryTarget: WORKSPACE_FILE_OPEN_TARGET_READING,
      targets: [
        WORKSPACE_FILE_OPEN_TARGET_READING,
        WORKSPACE_FILE_OPEN_TARGET_PANEL,
        WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
        WORKSPACE_FILE_OPEN_TARGET_REVEAL,
        WORKSPACE_FILE_OPEN_TARGET_COPY_PATH,
      ],
    })
  })

  test("routes Markdown files to the Bench document surface", () => {
    expect(
      resolveWorkspaceFileOpenPlan({
        path: "notes/worksheet.md",
        absolutePath: "/repo/notes/worksheet.md",
        available: true,
        canOpenInBuddy: true,
        canOpenReading: true,
        canOpenDefaultApp: true,
        canReveal: false,
      }),
    ).toEqual({
      primaryTarget: WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
      targets: [
        WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
        WORKSPACE_FILE_OPEN_TARGET_PANEL,
        WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
        WORKSPACE_FILE_OPEN_TARGET_COPY_PATH,
      ],
    })
  })

  test("falls back to the default app for unsupported workspace files", () => {
    expect(
      resolveWorkspaceFileOpenPlan({
        path: "slides/deck.pptx",
        absolutePath: "/repo/slides/deck.pptx",
        available: true,
        canOpenInBuddy: true,
        canOpenReading: true,
        canOpenDefaultApp: true,
        canReveal: true,
      }).primaryTarget,
    ).toBe(WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP)
  })

  test("keeps missing files non-openable while preserving copy path", () => {
    expect(
      resolveWorkspaceFileOpenPlan({
        path: "missing.pdf",
        absolutePath: "/repo/missing.pdf",
        available: false,
        canOpenInBuddy: true,
        canOpenReading: true,
        canOpenDefaultApp: true,
        canReveal: true,
      }),
    ).toEqual({
      primaryTarget: undefined,
      targets: [WORKSPACE_FILE_OPEN_TARGET_COPY_PATH],
    })
  })
})
