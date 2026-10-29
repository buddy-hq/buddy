import { describe, expect, test } from "bun:test"

import type { ToolPart } from "@buddy/transcript-contract/message"
import { withToolPresentationOnPart } from "@buddy/transcript-contract/session-tool-presentation"

describe("session tool presentation", () => {
  test("keeps runtime-defined MCP tool calls visible without exposing their raw IDs", () => {
    const toolID = "runtime-server_private_snake_case_tool"
    const pending: ToolPart = {
      id: "prt_mcp_pending",
      sessionID: "ses_mcp",
      messageID: "msg_mcp",
      type: "tool",
      callID: "call_mcp_pending",
      tool: toolID,
      state: {
        status: "pending",
        input: { query: "Buddy" },
        raw: "{}",
      },
    }
    const failed: ToolPart = {
      ...pending,
      id: "prt_mcp_failed",
      callID: "call_mcp_failed",
      state: {
        status: "error",
        input: { query: "Buddy" },
        error: "MCP tool returned an error",
        time: { start: 1, end: 2 },
      },
    }

    const enrichedPending = withToolPresentationOnPart(pending)
    const enrichedFailed = withToolPresentationOnPart(failed)

    expect(enrichedPending.metadata).toMatchObject({
      buddy: {
        presentation: {
          archetype: "activity",
          phase: "pending",
          action: "Preparing connected tool",
          outcome: { type: "active" },
        },
      },
    })
    expect(enrichedFailed.metadata).toMatchObject({
      buddy: {
        presentation: {
          archetype: "activity",
          phase: "error",
          action: "Failed to run connected tool",
          outcome: { type: "failure" },
        },
      },
    })
    expect(JSON.stringify(enrichedPending.metadata)).not.toContain(toolID)
    expect(JSON.stringify(enrichedFailed.metadata)).not.toContain(toolID)
  })
})
