import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { executeWriteWithoutPrompt } from "../../src/learning/features/lesson-workspace/tools/write-without-prompt"
import { tmpdir } from "../helpers/tmpdir"

function createContext(input?: {
  ask?: BuddyToolContext["ask"]
  metadata?: BuddyToolContext["metadata"]
}): BuddyToolContext {
  return {
    directory: "",
    sessionID: "ses_test",
    messageID: "msg_test",
    agent: "buddy",
    abort: new AbortController().signal,
    messages: [],
    metadata: input?.metadata ?? (async () => {}),
    ask: input?.ask ?? (async () => {}),
  }
}

describe("executeWriteWithoutPrompt", () => {
  test("writes atomically without issuing a second permission request", async () => {
    await using project = await tmpdir({ git: true })

    let askCalls = 0
    const targetFile = path.join(project.path, "notes", "lesson.txt")

    const result = await executeWriteWithoutPrompt(
      { ...createContext({ async ask() { askCalls += 1 } }), directory: project.path },
      { filePath: targetFile, content: "draft lesson" },
    )


    expect(askCalls).toBe(0)
    expect(result.title).not.toBe("Write file")
    expect(result.title.endsWith(path.join("notes", "lesson.txt"))).toBe(true)
    expect(result.output).toContain("Wrote file successfully")
    expect(result.metadata).toMatchObject({
      filepath: targetFile,
      exists: false,
    })
    await expect(fs.readFile(targetFile, "utf8")).resolves.toBe("draft lesson")
  })
})
