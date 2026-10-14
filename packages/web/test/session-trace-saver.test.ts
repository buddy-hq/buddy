import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  writeSessionTraceLogFile,
  type WriteSessionTraceInput,
} from "../scripts/session-trace-saver"

describe("session-trace-saver", () => {
  let tempDir = ""

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "buddy-trace-test-"))
  })

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test("creates .traces directory and writes a log file with trace metadata", () => {
    const rawTrace = JSON.stringify({
      capturedAt: "2026-09-24T12:00:00.000Z",
      directory: "/my/repo",
      sessionID: "session_abc123",
      streamStatus: "idle",
      directoryState: {
        sessionTitle: "My Chat",
        messages: [{ info: { id: "m1" }, parts: [] }],
      },
    })

    const input: WriteSessionTraceInput = {
      trace: rawTrace,
      sessionID: "session_abc123",
      sessionTitle: "My Chat",
      directory: "/my/repo",
      devInstanceName: "my-worktree",
      devServer: "http://localhost:1420",
      worktree: tempDir,
      branch: "feature-branch",
    }

    const result = writeSessionTraceLogFile(input)

    expect(result.success).toBe(true)
    expect(result.worktree).toBe(tempDir)
    expect(result.branch).toBe("feature-branch")
    expect(result.devInstanceName).toBe("my-worktree")
    expect(result.devServer).toBe("http://localhost:1420")
    expect(result.sessionID).toBe("session_abc123")
    expect(result.sessionTitle).toBe("My Chat")
    expect(result.databasePath).toBeDefined()
    expect(result.messageCount).toBe(1)
    expect(result.streamStatus).toBe("idle")
    expect(result.relativeFilePath).toMatch(/^\.traces\/session-session_abc123-.*\.log$/)

    // Verify file exists on disk
    expect(existsSync(result.filePath)).toBe(true)

    // Verify content
    const content = JSON.parse(readFileSync(result.filePath, "utf8"))
    expect(content.sessionID).toBe("session_abc123")
    expect(content.traceMetadata).toBeDefined()
    expect(content.traceMetadata.worktree).toBe(tempDir)
    expect(content.traceMetadata.branch).toBe("feature-branch")
    expect(content.traceMetadata.devInstanceName).toBe("my-worktree")
    expect(content.traceMetadata.devServer).toBe("http://localhost:1420")
    expect(content.traceMetadata.logFile).toBe(result.relativeFilePath)
  })
})
