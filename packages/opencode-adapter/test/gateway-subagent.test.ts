import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import type {
  OpenCodeEvent,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageSynthetic,
} from "@opencode/client"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { createEventTranslator } from "../src/gateway/event"
import { partID, toBuddyMessage } from "../src/gateway/message"
import { subagentInboxMessage, toBuddySubagentCompletion } from "../src/gateway/subagent"

const context = { sessionID: "ses_owner", directory: "C:\\Notebook" }

function project(part: SessionMessageAssistantTool) {
  const message: SessionMessageAssistant = {
    id: "msg_launch",
    type: "assistant",
    time: { created: 10 },
    agent: "buddy",
    model: { id: "model", providerID: "test" },
    content: [part],
  }
  const mapped = Schema.decodeUnknownSync(MessageWithParts)(toBuddyMessage(message, context))
  const tool = mapped.parts[0]
  if (tool?.type !== "tool") throw new Error("Missing projected tool")
  return tool
}

function inboxEvent(
  item: Extract<OpenCodeEvent, { type: "session.inbox.enqueued" }>["data"]["item"],
): OpenCodeEvent {
  return {
    id: "evt_notice",
    created: 30,
    type: "session.inbox.enqueued",
    durable: { aggregateID: "ses_owner", seq: 5, version: 1 },
    data: { sessionID: "ses_owner", inboxID: "msg_notice", item },
  }
}

const base = {
  type: "tool",
  id: "call",
  name: "subagent",
  time: { created: 11, ran: 12, completed: 15 },
} as const

function part(events: readonly BuddyEvent[]) {
  return events.find((event) => event.payload.type === "message.part.updated")?.payload.properties
    .part
}

describe("subagent transcript normalization", () => {
  test("reads persisted v1 task history at the gateway, keeping raw input, metadata and tool identity", () => {
    const input = {
      subagent_type: "flashcard-author",
      description: "Make deck (@flashcard-author subagent)",
      prompt: "Cards",
    }
    const tool = project({
      type: "tool",
      id: "provider/call",
      name: "task",
      time: { created: 11, ran: 12, completed: 20 },
      state: {
        status: "completed",
        input,
        metadata: { sessionId: "ses_child" },
        content: [
          { type: "text", text: "task_id: ses_child\n\n<task_result>\nSaved deck\n</task_result>" },
        ],
      },
    })
    expect(tool.id).toBe(partID("msg_launch", 0, "tool:provider/call"))
    expect(tool.state.input).toEqual(input)
    expect(tool.state.metadata).toEqual({ sessionId: "ses_child" })
    expect(tool.subagent).toEqual({
      ownerSessionID: "ses_owner",
      messageID: "msg_launch",
      callID: "provider/call",
      childSessionID: "ses_child",
      agentID: "flashcard-author",
      description: "Make deck",
      background: false,
      workerStatus: "completed",
      startedAt: 12,
      result: "Saved deck",
    })
  })

  test("projects canonical v2 blocking results without the subagent envelope", () => {
    const tool = project({
      ...base,
      state: {
        status: "completed",
        input: { agent: "question-set-author", description: "Make quiz", prompt: "Quiz" },
        metadata: { sessionID: "ses_child", status: "completed" },
        content: [
          {
            type: "text",
            text: '<subagent sessionID="ses_child" state="completed">\nPlain response\n</subagent>',
          },
        ],
      },
    })
    expect(tool.state.metadata).toEqual({ sessionID: "ses_child", status: "completed" })
    expect(tool.subagent).toMatchObject({
      childSessionID: "ses_child",
      agentID: "question-set-author",
      description: "Make quiz",
      background: false,
      workerStatus: "completed",
      result: "Plain response",
    })
  })

  test.each<Record<string, boolean>>([{ background: true }, {}])(
    "distinguishes a background return from worker completion, including owner promotion (%p)",
    (extra) => {
      const tool = project({
        ...base,
        state: {
          status: "completed",
          input: { agent: "general", description: "Research", prompt: "Go", ...extra },
          metadata: { sessionID: "ses_child", status: "running" },
          content: [{ type: "text", text: "The subagent is working in the background" }],
        },
      })
      expect(tool.state.status).toBe("completed")
      expect(tool.subagent).toMatchObject({
        childSessionID: "ses_child",
        background: true,
        workerStatus: "running",
      })
      expect(tool.subagent?.result).toBeUndefined()
    },
  )

  test("identifies a continued child from its input before progress and omits streaming calls", () => {
    expect(
      project({
        ...base,
        state: {
          status: "running",
          input: {
            agent: "general",
            description: "Follow up",
            prompt: "More",
            sessionID: "ses_child",
          },
          metadata: {},
        },
      }).subagent,
    ).toMatchObject({ childSessionID: "ses_child", background: false, workerStatus: "running" })
    expect(
      project({ ...base, state: { status: "streaming", input: '{"agent":"gen' } }).subagent,
    ).toBeUndefined()
  })

  test("keeps the child link from progress metadata on failure and recognizes cancellation", () => {
    const input = { agent: "general", description: "Research", prompt: "Go" }
    expect(
      project({
        ...base,
        state: {
          status: "error",
          input,
          metadata: { sessionID: "ses_child", status: "running" },
          error: {
            type: "tool.execution",
            message: "Subagent failed (sessionID: ses_child): boom",
          },
        },
      }).subagent,
    ).toMatchObject({
      childSessionID: "ses_child",
      workerStatus: "error",
      result: "Subagent failed (sessionID: ses_child): boom",
    })
    expect(
      project({
        ...base,
        state: {
          status: "error",
          input,
          metadata: { sessionID: "ses_child", status: "running" },
          error: { type: "tool.execution", message: "Subagent cancelled (sessionID: ses_child)" },
        },
      }).subagent,
    ).toMatchObject({ childSessionID: "ses_child", workerStatus: "cancelled" })
    expect(
      project({
        ...base,
        state: {
          status: "error",
          input,
          metadata: { sessionID: "ses_child" },
          error: { type: "aborted", message: "Tool execution interrupted (sessionID: ses_child)" },
        },
      }).subagent,
    ).toMatchObject({ childSessionID: "ses_child", workerStatus: "cancelled" })
    expect(
      project({
        ...base,
        state: {
          status: "error",
          input,
          metadata: { sessionID: "ses_child" },
          error: {
            type: "tool.interrupted",
            message: "Tool execution was interrupted before V2 migration",
          },
        },
      }).subagent,
    ).toMatchObject({ childSessionID: "ses_child", workerStatus: "cancelled" })
  })

  test.each(["completed", "error", "cancelled"] as const)(
    "maps a %s synthetic completion identically from history and from inbox admission",
    (outcome) => {
      const metadata = {
        source: "subagent",
        childID: "ses_child",
        agent: "Display name",
        state: outcome,
      }
      const text = `<subagent sessionID="ses_child" state="${outcome}" description="Make quiz">\nWorker response\n</subagent>`
      const synthetic: SessionMessageSynthetic = {
        id: "msg_notice",
        type: "synthetic",
        time: { created: 30 },
        description: "Make quiz",
        text,
        metadata,
      }
      const completion = toBuddySubagentCompletion(synthetic, context.sessionID)
      expect(completion).toEqual({
        ownerSessionID: "ses_owner",
        childSessionID: "ses_child",
        messageID: "msg_notice",
        createdAt: 30,
        description: "Make quiz",
        agentName: "Display name",
        outcome,
        result: "Worker response",
      })
      const delivered = Schema.decodeUnknownSync(MessageWithParts)(
        toBuddyMessage(synthetic, context),
      )
      expect(delivered.parts[0]).toMatchObject({
        id: partID("msg_notice", 0, "notice"),
        type: "notice",
        source: "subagent",
        status: outcome,
        completion,
      })
      const admitted = subagentInboxMessage(
        inboxEvent({
          type: "synthetic",
          delivery: "queue",
          payload: { description: "Make quiz", text, metadata },
        }),
      )
      expect(admitted).toEqual(synthetic)
      if (!admitted) throw new Error("Missing admitted completion")
      expect(toBuddyMessage(admitted, context)).toEqual(toBuddyMessage(synthetic, context))
    },
  )

  test("seeds an admitted completion as the message its later delivery replaces in place", () => {
    const metadata = {
      source: "subagent",
      childID: "ses_child",
      agent: "general",
      state: "completed",
    }
    const admitted = subagentInboxMessage(
      inboxEvent({
        type: "synthetic",
        delivery: "steer",
        payload: {
          description: "Research",
          text: '<subagent sessionID="ses_child" state="completed" description="Research">\nDone\n</subagent>',
          metadata,
        },
      }),
    )
    if (!admitted) throw new Error("Missing admitted completion")
    const translator = createEventTranslator({ directory: context.directory })
    const provisional = translator.seed(context.sessionID, admitted, context.directory)
    const delivered = translator.seed(
      context.sessionID,
      { ...admitted, time: { created: 45 } },
      context.directory,
      true,
    )
    expect(provisional.map((event) => event.payload.type)).toEqual([
      "message.updated",
      "message.part.updated",
    ])
    expect(part(provisional)).toMatchObject({
      id: partID("msg_notice", 0, "notice"),
      completion: { messageID: "msg_notice", outcome: "completed", result: "Done", createdAt: 30 },
    })
    expect(part(delivered)).toMatchObject({
      id: partID("msg_notice", 0, "notice"),
      completion: { messageID: "msg_notice", createdAt: 45 },
    })
  })

  test("ignores unrelated inbox items, notices and malformed completions", () => {
    expect(
      subagentInboxMessage(
        inboxEvent({ type: "user", delivery: "queue", payload: { text: "Hello" } }),
      ),
    ).toBeUndefined()
    expect(
      subagentInboxMessage(
        inboxEvent({
          type: "synthetic",
          delivery: "queue",
          payload: {
            text: "Done",
            metadata: { source: "shell", shellID: "sh_1", state: "completed" },
          },
        }),
      ),
    ).toBeUndefined()
    expect(
      toBuddySubagentCompletion(
        {
          id: "msg_other",
          type: "synthetic",
          time: { created: 10 },
          text: "Done",
          metadata: { source: "shell", childID: "ses_child", state: "completed" },
        },
        "ses_owner",
      ),
    ).toBeUndefined()
    expect(
      toBuddySubagentCompletion(
        {
          id: "msg_other",
          type: "synthetic",
          time: { created: 10 },
          text: "Done",
          metadata: { source: "subagent", state: "completed" },
        },
        "ses_owner",
      ),
    ).toBeUndefined()
    expect(
      toBuddySubagentCompletion(
        {
          id: "msg_other",
          type: "synthetic",
          time: { created: 10 },
          text: "Done",
          metadata: { source: "subagent", childID: "ses_child", state: "running" },
        },
        "ses_owner",
      ),
    ).toBeUndefined()
  })
})
