import { describe, expect, test } from "bun:test"
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { piEventStream } from "../../src/pi-backend/event-bus"
import { PiSessionEventBridge } from "../../src/pi-backend/session-event-bridge"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

async function readNextEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) return undefined
    const text = decoder.decode(chunk.value)
    const line = text
      .split("\n")
      .find((entry) => entry.startsWith("data: ") && entry.length > "data: ".length)
    if (!line) continue
    const parsed: unknown = JSON.parse(line.slice("data: ".length))
    return parsed
  }
}

async function readUntilToolState(reader: ReadableStreamDefaultReader<Uint8Array>, status: string) {
  for (let index = 0; index < 10; index += 1) {
    const event = await readNextEvent(reader)
    if (!isRecord(event)) return undefined
    const payload = event.payload
    if (!isRecord(payload) || payload.type !== "message.part.updated") continue

    const properties = payload.properties
    if (!isRecord(properties)) continue
    const part = properties.part
    if (!isRecord(part) || part.type !== "tool") continue
    const state = part.state
    if (!isRecord(state) || state.status !== status) continue
    return state
  }

  return undefined
}

async function readUntilPartUpdate(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (part: Record<string, unknown>) => boolean,
) {
  for (let index = 0; index < 10; index += 1) {
    const event = await readNextEvent(reader)
    if (!isRecord(event)) return undefined
    const payload = event.payload
    if (!isRecord(payload) || payload.type !== "message.part.updated") continue

    const properties = payload.properties
    if (!isRecord(properties)) continue
    const part = properties.part
    if (!isRecord(part) || !predicate(part)) continue
    return part
  }

  return undefined
}

describe("PiSessionEventBridge", () => {
  test("buffers PI tool results until the assistant tool part exists", async () => {
    const directory = "/tmp/buddy-pi-bridge-test"
    const stream = piEventStream(directory)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error("Expected PI event stream body.")

    try {
      await readNextEvent(reader)

      const bridge = new PiSessionEventBridge({
        directory,
        session: {
          sessionId: "pi-session",
          messages: [],
          model: undefined,
          thinkingLevel: "off",
        },
        onSessionUpdated: async () => undefined,
      })

      bridge.handle({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "render_mermaid",
        args: {
          alt: "Example",
          source: "graph TD\nA-->B",
        },
      } satisfies AgentSessionEvent)
      bridge.handle({
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "render_mermaid",
        result: {
          content: [{ type: "text", text: "created" }],
          details: {
            artifact: "RenderMermaidOutput",
            value: {
              artifactID: "artifact-1",
              kind: "mermaid.v2",
              source: "graph TD\nA-->B",
            },
          },
        },
        isError: false,
      } satisfies AgentSessionEvent)

      const assistantMessage = {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "render_mermaid",
            arguments: {
              alt: "Example",
              source: "graph TD\nA-->B",
            },
          },
        ],
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-5.4",
        usage: emptyUsage,
        stopReason: "toolUse",
        timestamp,
      } satisfies PiAgentMessage

      bridge.handle({
        type: "message_start",
        message: assistantMessage,
      } satisfies AgentSessionEvent)

      const completedState = await readUntilToolState(reader, "completed")
      expect(completedState).toBeDefined()
      expect(completedState?.metadata).toEqual({
        artifact: "RenderMermaidOutput",
        value: {
          artifactID: "artifact-1",
          kind: "mermaid.v2",
          source: "graph TD\nA-->B",
        },
      })
    } finally {
      await reader.cancel()
    }
  })

  test("streams assistant text deltas without republishing the full message", async () => {
    const directory = "/tmp/buddy-pi-bridge-delta-test"
    const stream = piEventStream(directory)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error("Expected PI event stream body.")

    try {
      await readNextEvent(reader)

      const bridge = new PiSessionEventBridge({
        directory,
        session: {
          sessionId: "pi-session",
          messages: [],
          model: undefined,
          thinkingLevel: "off",
        },
        onSessionUpdated: async () => undefined,
      })

      const assistantMessage = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "hello",
          },
        ],
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-5.4",
        usage: emptyUsage,
        stopReason: "stop",
        timestamp,
      } satisfies PiAgentMessage

      bridge.handle({
        type: "message_start",
        message: assistantMessage,
      } satisfies AgentSessionEvent)

      const openingPart = await readUntilPartUpdate(
        reader,
        (part) => part.type === "text" && part.messageID === "msg_ses_pi-session_000000",
      )
      expect(openingPart?.text).toBe("")

      bridge.handle({
        type: "message_update",
        message: assistantMessage,
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: " world",
          partial: assistantMessage,
        },
      } satisfies AgentSessionEvent)

      const event = await readNextEvent(reader)
      expect(isRecord(event)).toBe(true)
      if (!isRecord(event)) return
      const payload = event.payload
      expect(isRecord(payload)).toBe(true)
      if (!isRecord(payload)) return
      expect(payload.type).toBe("message.part.delta")
    } finally {
      await reader.cancel()
    }
  })

  test("publishes the full assistant text only when the part completes", async () => {
    const directory = "/tmp/buddy-pi-bridge-final-text-test"
    const stream = piEventStream(directory)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error("Expected PI event stream body.")

    try {
      await readNextEvent(reader)

      const bridge = new PiSessionEventBridge({
        directory,
        session: {
          sessionId: "pi-session",
          messages: [],
          model: undefined,
          thinkingLevel: "off",
        },
        onSessionUpdated: async () => undefined,
      })

      const assistantMessage = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "hello world",
          },
        ],
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-5.4",
        usage: emptyUsage,
        stopReason: "stop",
        timestamp,
      } satisfies PiAgentMessage

      bridge.handle({
        type: "message_start",
        message: assistantMessage,
      } satisfies AgentSessionEvent)

      await readUntilPartUpdate(
        reader,
        (part) => part.type === "text" && part.messageID === "msg_ses_pi-session_000000",
      )

      bridge.handle({
        type: "message_end",
        message: assistantMessage,
      } satisfies AgentSessionEvent)

      const completedPart = await readUntilPartUpdate(
        reader,
        (part) =>
          part.type === "text" &&
          part.messageID === "msg_ses_pi-session_000000" &&
          typeof part.text === "string" &&
          part.text.length > 0,
      )

      expect(completedPart?.text).toBe("hello world")
    } finally {
      await reader.cancel()
    }
  })
})
