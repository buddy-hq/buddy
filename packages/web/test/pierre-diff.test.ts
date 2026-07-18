import { describe, expect, test } from "bun:test"

import { normalizePierreDiff } from "../src/components/chat/tools/activity-row/pierre-diff"
import { getToolInfo } from "../src/components/chat/tools/tool-info"
import type { ToolState } from "../src/components/chat/tools/types"
import { activityPresentation } from "./tool-presentation-fixtures"

function completedPatchPresentation(detail: string) {
  return activityPresentation({
    phase: "completed",
    action: "Applied edits",
    detail,
    category: "edit-files",
    summary: "Edited files",
    icon: "edit",
    renderer: "apply-patch",
  })
}

function completedApplyPatchState(files: ToolState["metadata"]["files"]): ToolState {
  return {
    status: "completed",
    input: {},
    metadata: { files },
    attachments: [],
  }
}

describe("Pierre activity file details", () => {
  test("normalizes complete before and after contents into a full file diff", () => {
    const view = normalizePierreDiff({
      file: "notes.md",
      before: "first\nsecond\n",
      after: "first\nupdated\n",
      additions: 1,
      deletions: 1,
      status: "modified",
    })

    expect(view.fileDiff.isPartial).toBe(false)
    expect(view.fileDiff.deletionLines.join("")).toBe("first\nsecond\n")
    expect(view.fileDiff.additionLines.join("")).toBe("first\nupdated\n")
  })

  test("keeps partial patches partial for simple hunk separators", () => {
    const view = normalizePierreDiff({
      file: "notes.md",
      patch: "--- notes.md\n+++ notes.md\n@@ -3,1 +3,1 @@\n-old\n+new\n",
      additions: 1,
      deletions: 1,
      status: "modified",
    })

    expect(view.fileDiff.isPartial).toBe(true)
  })

  test("preserves separated hunks when a partial patch starts at line one", () => {
    const view = normalizePierreDiff({
      file: "notes.md",
      patch:
        "--- notes.md\n+++ notes.md\n@@ -1,2 +1,2 @@\n-old\n+new\n keep\n@@ -20,2 +20,2 @@\n-old-20\n+new-20\n keep-20\n",
      additions: 2,
      deletions: 2,
      status: "modified",
    })

    expect(view.fileDiff.isPartial).toBe(true)
  })

  test("uses the resolved presentation detail for patch summaries", () => {
    expect(
      getToolInfo(
        "apply_patch",
        completedApplyPatchState([{ filePath: "/workspace/notes.md", relativePath: "notes.md" }]),
        completedPatchPresentation("notes.md"),
      ).subtitle,
    ).toBe("notes.md")
    expect(
      getToolInfo(
        "apply_patch",
        completedApplyPatchState([
          { filePath: "/workspace/notes.md", relativePath: "notes.md" },
          { filePath: "/workspace/tasks.md", relativePath: "tasks.md" },
        ]),
        completedPatchPresentation("2 files"),
      ).subtitle,
    ).toBe("2 files")
  })
})
