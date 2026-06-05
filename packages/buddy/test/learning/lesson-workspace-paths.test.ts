import { describe, expect, test } from "bun:test"
import { TeachingPath } from "../../src/learning/features/lesson-workspace/paths/path"

describe("lesson workspace paths", () => {
  test("rejects bare parent-directory relative paths", () => {
    expect(() => TeachingPath.workspaceFile("/repo", "session_1", "..")).toThrow(
      "File path must stay inside the teaching workspace",
    )
    expect(() => TeachingPath.checkpointSnapshotFile("/repo", "session_1", "..")).toThrow(
      "File path must stay inside the teaching workspace",
    )
  })

  test("rejects dot-segment session ids", () => {
    expect(() => TeachingPath.root("/repo", "..")).toThrow(
      "Session ID must stay inside the teaching workspace",
    )
    expect(() => TeachingPath.root("/repo", ".")).toThrow(
      "Session ID must stay inside the teaching workspace",
    )
  })
})
