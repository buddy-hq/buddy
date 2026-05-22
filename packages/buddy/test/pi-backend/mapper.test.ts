import { describe, expect, test } from "bun:test"
import { mapPiMessagesToBuddyMessages, mapPiSessionInfo } from "../../src/pi-backend/mapper"
import type { PiAgentMessage } from "../../src/pi-backend/types"

const timestamp = 1_800_000_000_000

const emptyUsage = {
  input: 10,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 30,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
}

describe("PI runtime mapper", () => {
  test("maps PI session info to Buddy session shape", () => {
    const info = mapPiSessionInfo({
      directory: "/tmp/project",
      session: {
        id: "018f-session",
        cwd: "/tmp/project",
        path: "/tmp/project/session.jsonl",
        created: new Date(timestamp),
        modified: new Date(timestamp + 1),
        firstMessage: "hello",
      },
      metadata: {
        title: "Renamed",
        archived: timestamp + 2,
      },
    })

    expect(info.id).toBe("ses_018f-session")
    expect(info.title).toBe("Renamed")
    expect(info.directory).toBe("/tmp/project")
    expect(info.time.archived).toBe(timestamp + 2)
  })

  test("maps PI text, thinking, tool call, and tool result messages", () => {
    const messages = [
      {
        role: "user",
        content: "Run tests",
        timestamp,
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Need to inspect scripts" },
          { type: "text", text: "I will run the test command." },
          { type: "toolCall", id: "tool-1", name: "bash", arguments: { cmd: "bun test" } },
        ],
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-5.4",
        usage: emptyUsage,
        stopReason: "stop",
        timestamp: timestamp + 1,
      },
      {
        role: "toolResult",
        toolCallId: "tool-1",
        toolName: "bash",
        content: [{ type: "text", text: "ok" }],
        details: {
          artifact: "RenderMermaidOutput",
          value: {
            artifactID: "artifact-1",
          },
        },
        isError: false,
        timestamp: timestamp + 2,
      },
    ] satisfies PiAgentMessage[]

    const mapped = mapPiMessagesToBuddyMessages({
      sessionID: "018f-session",
      directory: "/tmp/project",
      messages,
      variant: "high",
    })

    expect(mapped).toHaveLength(2)
    expect(mapped[0]?.info.role).toBe("user")
    expect(mapped[0]?.parts[0]?.type).toBe("text")
    const assistant = mapped[1]?.info
    expect(assistant?.role).toBe("assistant")
    if (assistant?.role !== "assistant") {
      throw new Error("Expected assistant message")
    }
    expect(assistant.providerID).toBe("openai")
    expect(assistant.variant).toBe("high")
    expect(mapped[0]?.info.role === "user" ? mapped[0].info.model.variant : undefined).toBe("high")
    expect(mapped[1]?.parts.map((part) => part.type)).toEqual(["reasoning", "text", "tool"])

    const toolPart = mapped[1]?.parts.find((part) => part.type === "tool")
    expect(toolPart?.type).toBe("tool")
    expect(toolPart?.state.status).toBe("completed")
    if (toolPart?.state.status !== "completed") {
      throw new Error("Expected completed tool part")
    }
    expect(toolPart.state.metadata.artifact).toBe("RenderMermaidOutput")
  })
})
