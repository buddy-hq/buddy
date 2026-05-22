import { describe, expect, test } from "bun:test"
import {
  parseTaskResultOutput,
  readTaskAgent,
  readTaskDescription,
  readTaskSessionId,
} from "../src/components/chat/tools/render/task/task-utils"

describe("task tool helpers", () => {
  test("prefers PI task metadata when present", () => {
    const metadata = {
      sessionId: "ses_child",
      agent: "practice-agent",
      description: "Generate practice",
    }
    const input = {
      agent: "ignored-agent",
      task: "ignored task",
    }

    expect(readTaskSessionId(metadata)).toBe("ses_child")
    expect(readTaskAgent(input, metadata)).toBe("practice-agent")
    expect(readTaskDescription(input, metadata)).toBe("Generate practice")
  })

  test("falls back to plain output when task tags are absent", () => {
    expect(parseTaskResultOutput("done")).toBe("done")
  })
})
