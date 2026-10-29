import { describe, expect, test } from "bun:test"
import { markdownBenchAgentEditActivity } from "../src/components/bench/markdown/agent-edits"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import { createAssistantMessageInfo } from "./test-utils"

const TARGET_PATH = "notes/worksheet.md"

const TOOL_KINDS = {
  shell: "run-command",
  edit: "edit-file",
  write: "write-file",
  patch: "change-files",
} as const

function toolPart(input: {
  id: string
  tool: keyof typeof TOOL_KINDS
  status: string
  filePath?: string
  changedPaths?: string[]
  end?: number
}): MessagePart {
  return {
    id: input.id,
    messageID: "msg_agent_edits",
    sessionID: "ses_agent_edits",
    type: "tool",
    tool: input.tool,
    state: {
      status: input.status,
      input: {},
      summary: Object.assign(
        { kind: TOOL_KINDS[input.tool] },
        input.filePath ? { subject: input.filePath } : undefined,
      ),
      fileChanges: (input.changedPaths ?? []).map((path) => ({ path, relativePath: path })),
      time: input.end === undefined ? {} : { end: input.end },
    },
  }
}

function messages(parts: MessagePart[]): MessageWithParts[] {
  return [
    {
      info: createAssistantMessageInfo({ id: "msg_agent_edits", sessionID: "ses_agent_edits" }),
      parts,
    },
  ]
}

describe("Markdown Bench agent edit activity", () => {
  test("tracks only file-edit tools that target the open document", () => {
    const activity = markdownBenchAgentEditActivity(
      messages([
        toolPart({ id: "part-1", tool: "shell", status: "running" }),
        toolPart({ id: "part-2", tool: "edit", status: "running", filePath: "other/file.md" }),
      ]),
      TARGET_PATH,
    )

    expect(activity).toEqual({ running: false, completedKey: undefined })
  })

  test("matches absolute tool paths against the relative document path", () => {
    const activity = markdownBenchAgentEditActivity(
      messages([
        toolPart({
          id: "part-1",
          tool: "edit",
          status: "completed",
          filePath: `/repo/${TARGET_PATH}`,
          end: 1700,
        }),
      ]),
      TARGET_PATH,
    )

    expect(activity).toEqual({ running: false, completedKey: "part-1:1700" })
  })

  test("tracks a patch whose changed files include the open document", () => {
    const activity = markdownBenchAgentEditActivity(
      messages([
        toolPart({
          id: "part-1",
          tool: "patch",
          status: "completed",
          changedPaths: ["/repo/other.md", `/repo/${TARGET_PATH}`],
          end: 1700,
        }),
      ]),
      TARGET_PATH,
    )

    expect(activity).toEqual({ running: false, completedKey: "part-1:1700" })
  })

  test("stays running while any targeting edit is still in flight", () => {
    const activity = markdownBenchAgentEditActivity(
      messages([
        toolPart({
          id: "part-1",
          tool: "write",
          status: "completed",
          filePath: TARGET_PATH,
          end: 1700,
        }),
        toolPart({ id: "part-2", tool: "edit", status: "running", filePath: TARGET_PATH }),
      ]),
      TARGET_PATH,
    )

    expect(activity.running).toBe(true)
  })

  test("changes the completion key when the same part finishes again", () => {
    const first = markdownBenchAgentEditActivity(
      messages([
        toolPart({
          id: "part-1",
          tool: "edit",
          status: "completed",
          filePath: TARGET_PATH,
          end: 1700,
        }),
      ]),
      TARGET_PATH,
    )
    const second = markdownBenchAgentEditActivity(
      messages([
        toolPart({
          id: "part-1",
          tool: "edit",
          status: "completed",
          filePath: TARGET_PATH,
          end: 1800,
        }),
      ]),
      TARGET_PATH,
    )

    expect(first.completedKey).not.toBe(second.completedKey)
  })
})
