import { describe, expect, test } from "bun:test"
import {
  buildTeachingPromptContext,
  resolveTeachingPromptContext,
} from "../src/lib/teaching-context"
import type { TeachingWorkspaceState } from "../src/state/teaching-mode"

function workspace(): TeachingWorkspaceState {
  return {
    sessionID: "session_1",
    workspaceRoot: "/repo/.buddy/lesson",
    language: "ts",
    lessonFilePath: "/repo/.buddy/lesson/lesson.ts",
    checkpointFilePath: "/repo/.buddy/lesson/.checkpoint/lesson.ts",
    files: [],
    activeRelativePath: "lesson.ts",
    revision: 3,
    code: "console.log('hello')\n",
    savedCode: "console.log('hello')\n",
    pendingSave: false,
    lspAvailable: false,
    diagnostics: [],
    selection: {
      selectionStartLine: 1,
      selectionStartColumn: 1,
      selectionEndLine: 1,
      selectionEndColumn: 5,
    },
  }
}

describe("buildTeachingPromptContext", () => {
  test("preserves active workspace context for prompts", () => {
    expect(buildTeachingPromptContext(workspace())).toEqual({
      active: true,
      sessionID: "session_1",
      lessonFilePath: "/repo/.buddy/lesson/lesson.ts",
      checkpointFilePath: "/repo/.buddy/lesson/.checkpoint/lesson.ts",
      language: "ts",
      revision: 3,
      selectionStartLine: 1,
      selectionStartColumn: 1,
      selectionEndLine: 1,
      selectionEndColumn: 5,
    })
  })

  test("returns undefined when no workspace is active", () => {
    expect(buildTeachingPromptContext(undefined)).toBeUndefined()
  })

  test("waits for a pending workspace probe before dropping context", async () => {
    await expect(
      resolveTeachingPromptContext({
        pendingWorkspace: Promise.resolve(workspace()),
      }),
    ).resolves.toEqual({
      active: true,
      sessionID: "session_1",
      lessonFilePath: "/repo/.buddy/lesson/lesson.ts",
      checkpointFilePath: "/repo/.buddy/lesson/.checkpoint/lesson.ts",
      language: "ts",
      revision: 3,
      selectionStartLine: 1,
      selectionStartColumn: 1,
      selectionEndLine: 1,
      selectionEndColumn: 5,
    })
  })
})
