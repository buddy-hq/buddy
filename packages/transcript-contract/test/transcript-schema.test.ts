import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { MessageWithParts, Message, type ToolPart } from "../src/message"
import { Session, SessionStatus } from "../src/session"
import { TranscriptEvent } from "../src/event"

const assistant = {
  id: "msg_notice", sessionID: "ses_contract", role: "assistant", kind: "synthetic",
  time: { created: 1, completed: 1 }, parentID: "", agent: "", mode: "", modelID: "", providerID: "",
  cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  path: { cwd: "/workspace", root: "/workspace" },
  metadata: { source: "subagent", state: "completed", childID: "ses_child" },
}

describe("Buddy transcript schemas", () => {
  test("keeps SDK component names independent of runtime schemas", () => {
    const definitions = Schema.toJsonSchemaDocument(MessageWithParts).definitions
    for (const name of ["Message", "Part", "ToolPart", "TextPart", "ReasoningPart", "FilePart", "AgentPart", "OutputFormat", "NoticePart", "CompactionPart"]) {
      expect(definitions).toHaveProperty(name)
    }
    expect(Schema.toJsonSchemaDocument(Session).definitions).toHaveProperty("Session")
    expect(Schema.toJsonSchemaDocument(SessionStatus).definitions).toHaveProperty("SessionStatus")
  })

  test("accepts completion notices and native streaming input through the same transcript envelope", () => {
    const message = Schema.decodeUnknownSync(Message)(assistant)
    expect(message).toMatchObject({ kind: "synthetic", metadata: assistant.metadata })
    const part: ToolPart = { id: "prt_board", messageID: "msg_notice", sessionID: "ses_contract", type: "tool", callID: "provider-call", tool: "whiteboard_create_view", state: { status: "pending", input: {}, raw: '{"elements":[' } }
    expect(Schema.decodeUnknownSync(MessageWithParts)({ info: assistant, parts: [part] }).parts[0]).toEqual(part)
    expect(Schema.decodeUnknownSync(TranscriptEvent)({ type: "message.part.delta", properties: { sessionID: "ses_contract", messageID: "msg_notice", partID: "prt_board", field: "state.raw", delta: '{"elements":[' } })).toMatchObject({ type: "message.part.delta" })
  })
})
