import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { OpenCode, type SessionMessageAssistant, type SessionMessageInfo } from "@opencode/client"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { toBuddyMessage, listMessages } from "../src/gateway/message"

const context = { sessionID: "ses_gateway", directory: "/workspace" }
const assistant: SessionMessageAssistant = {
  id: "msg_assistant", type: "assistant", agent: "buddy", model: { id: "model", providerID: "provider" },
  time: { created: 10, completed: 20 }, finish: "stop", cost: 0.25,
  tokens: { input: 5, output: 3, reasoning: 1, cache: { read: 2, write: 0 } },
  content: [
    { type: "reasoning", text: "Thinking", time: { created: 11, completed: 12 } },
    { type: "text", text: "Answer" },
    { type: "tool", id: "provider/call", name: "subagent", time: { created: 13, ran: 14, completed: 19 }, state: { status: "completed", input: { description: "Research" }, content: [{ type: "text", text: "Result" }, { type: "file", uri: "file:///image.png", mime: "image/png", name: "image.png" }], metadata: { sessionID: "ses_child", status: "running" } } },
  ],
}

describe("v2 gateway history", () => {
  test("preserves a typed permission rejection with arbitrary feedback through schema and presentation projection", () => {
    const message = toBuddyMessage({ ...assistant, content: [{ type: "tool", id: "denied", name: "shell", time: { created: 1, completed: 2 }, state: { status: "error", input: {}, error: { type: "permission.rejected", message: "Try a different command" } } }] }, context)
    const projected = Schema.decodeUnknownSync(MessageWithParts)(message)
    expect(projected.parts[0]).toMatchObject({ state: { status: "error", error: "Try a different command", errorType: "permission.rejected" }, metadata: { buddy: { presentation: { outcome: { type: "neutral", reason: "permission-denied" } } } } })
  })

  test("projects tool output, attachments, presentation, usage, and stable content order", () => {
    const message = toBuddyMessage(assistant, context)
    if (!message) throw new Error("Assistant fixture must map")
    expect(Schema.decodeUnknownSync(MessageWithParts)(message)).toEqual(message)
    expect(message?.parts.map((part) => part.id)).toEqual(message?.parts.map((part) => part.id).toSorted())
    expect(message?.parts[2]).toMatchObject({ tool: "subagent", state: { status: "completed", output: "Result", metadata: { sessionID: "ses_child", status: "running" }, attachments: [{ url: "file:///image.png", filename: "image.png" }] }, subagent: { childSessionID: "ses_child", description: "Research", background: true, workerStatus: "running" }, metadata: { buddy: { presentation: { renderer: "task" } } } })
    expect(message?.info).toMatchObject({ role: "assistant", finish: "stop", cost: 0.25, tokens: assistant.tokens })
    const next = toBuddyMessage({ ...assistant, id: "msg_other" }, context)
    expect(next?.parts[2]?.id).not.toBe(message?.parts[2]?.id)
  })

  test("keeps synthetic completion metadata and compaction while omitting hidden timeline entries", () => {
    const synthetic: SessionMessageInfo = { id: "msg_notice", type: "synthetic", text: "<subagent>Result</subagent>", description: "Research", metadata: { source: "subagent", childID: "ses_child", state: "completed" }, time: { created: 30 } }
    expect(toBuddyMessage(synthetic, context)).toMatchObject({ info: { kind: "synthetic", metadata: synthetic.metadata }, parts: [{ type: "notice", text: "Subagent completed: Research", source: "subagent" }] })
    const compaction: SessionMessageInfo = { id: "msg_compact", type: "compaction", reason: "auto", status: "completed", summary: "Context", recent: "Recent", time: { created: 40 } }
    expect(toBuddyMessage(compaction, context)).toMatchObject({ info: { kind: "compaction", finish: "stop" }, parts: [{ type: "compaction", auto: true, status: "completed" }] })
    expect(toBuddyMessage({ id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 50 } }, context)).toBeUndefined()
    expect(toBuddyMessage({ id: "msg_system", type: "system", text: "Instruction", time: { created: 50 } }, context)).toBeUndefined()
  })

  test("maps user files and preserves visibility metadata without inventing a historical model", () => {
    const mapped = toBuddyMessage({ id: "msg_user", type: "user", text: "Hello", metadata: { hiddenFromUser: true }, files: [{ data: "aGVsbG8=", mime: "text/plain", source: { type: "inline" }, name: "hello.txt", mention: { text: "Hello", start: 0, end: 5 } }], time: { created: 1 } }, context)
    expect(mapped).toMatchObject({ info: { role: "user", model: { modelID: "", providerID: "" }, metadata: { hiddenFromUser: true } }, parts: [{ type: "text", text: "Hello" }, { type: "file", url: "data:text/plain;base64,aGVsbG8=", source: { type: "inline", text: { value: "Hello", start: 0, end: 5 } } }] })
  })

  test("follows v2 opaque cursors without also sending order and skips pages with only hidden entries", async () => {
    const queries: URLSearchParams[] = []
    const runtimeFetch: typeof fetch = Object.assign(async (request: RequestInfo | URL) => {
      const url = new URL(request instanceof Request ? request.url : String(request))
      queries.push(url.searchParams)
      if (queries.length === 1) return Response.json({ data: [{ id: "msg_system", type: "system", text: "Hidden", time: { created: 40 } }], cursor: { next: "opaque-cursor" } })
      return Response.json({ data: [assistant], cursor: { next: "older-cursor" } })
    }, { preconnect: fetch.preconnect })
    const client = OpenCode.make({ baseUrl: "http://gateway.test", fetch: runtimeFetch })
    const page = await listMessages(client, context, { limit: 2 })
    expect(page.items).toHaveLength(1)
    expect(page.cursor).toBe("older-cursor")
    expect(queries[0]?.get("order")).toBe("desc")
    expect(queries[1]?.get("cursor")).toBe("opaque-cursor")
    expect(queries[1]?.has("order")).toBe(false)
  })
})
