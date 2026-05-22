import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent"
import { publishPiEvent } from "./event-bus"
import { finishedToolPart, partIDForIndex, runningToolPart } from "./mapper"
import { serializePiTranscriptMessages, transcriptMessageID } from "./transcript"
import type {
  BuddyMessagePart,
  BuddyToolPart,
  BuddyToolPartState,
  PiAgentMessage,
  PiTranscriptEntry,
} from "./types"
import { buddySessionIDFromPi } from "./session-ids"

const MESSAGE_UPDATED_EVENT = "message.updated"
const MESSAGE_PART_UPDATED_EVENT = "message.part.updated"
const MESSAGE_PART_DELTA_EVENT = "message.part.delta"
const SESSION_STATUS_EVENT = "session.status"
const SESSION_UPDATED_EVENT = "session.updated"
const SESSION_ERROR_EVENT = "session.error"
const STATUS_BUSY = "busy"
const STATUS_IDLE = "idle"
const TEXT_FIELD = "text"
const EMPTY_TOOL_OUTPUT = ""
const UNKNOWN_ERROR_NAME = "PiRuntimeError"

type ActiveMessage = {
  messageID: string
  rawIndex: number
  role: PiAgentMessage["role"]
}

type ToolPartReference = {
  messageID: string
  partID: string
  callID: string
  toolName: string
  args: Record<string, unknown>
}

type BufferedToolResult = {
  output: string
  isError: boolean
  metadata: Record<string, unknown>
  timestamp: number
}

type BufferedToolExecution = {
  toolName: string
  args: Record<string, unknown>
  timestamp: number
  metadata?: Record<string, unknown>
  result?: BufferedToolResult
}

type PiBridgeSession = Pick<AgentSession, "messages" | "model" | "sessionId" | "thinkingLevel">

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function textFromContentBlocks(value: unknown) {
  if (!Array.isArray(value)) return EMPTY_TOOL_OUTPUT
  return value
    .filter((block) => isRecord(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => (isRecord(block) && typeof block.text === "string" ? block.text : ""))
    .join("\n")
}

function textFromToolResult(value: unknown) {
  if (!isRecord(value)) return EMPTY_TOOL_OUTPUT
  return textFromContentBlocks(value.content)
}

function metadataFromToolResult(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  return recordFromUnknown(value.details)
}

function textFromPiToolResultMessage(message: Extract<PiAgentMessage, { role: "toolResult" }>) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
}

function toolInputFromState(state: BuddyToolPartState) {
  return state.input
}

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || UNKNOWN_ERROR_NAME,
      message: error.message,
    }
  }

  return {
    name: UNKNOWN_ERROR_NAME,
    message: String(error),
  }
}

export class PiSessionEventBridge {
  private rawMessageCount: number
  private activeMessage: ActiveMessage | undefined
  private activeAssistant: ActiveMessage | undefined
  private openedStreamingPartIDs = new Set<string>()
  private toolPartsByCallID = new Map<string, ToolPartReference>()
  private bufferedToolExecutionsByCallID = new Map<string, BufferedToolExecution>()

  constructor(
    private input: {
      directory: string
      session: PiBridgeSession
      onSessionUpdated: () => Promise<void>
    },
  ) {
    this.rawMessageCount = input.session.messages.length
  }

  private get buddySessionID() {
    return buddySessionIDFromPi(this.input.session.sessionId)
  }

  handle = (event: AgentSessionEvent) => {
    switch (event.type) {
      case "agent_start":
        this.publishStatus(STATUS_BUSY)
        return
      case "agent_end":
        this.publishStatus(STATUS_IDLE)
        this.publishSessionUpdated()
        return
      case "message_start":
        this.handleMessageStart(event.message)
        return
      case "message_update":
        this.handleMessageUpdate(event.message, event.assistantMessageEvent)
        return
      case "message_end":
        this.handleMessageEnd(event.message)
        return
      case "tool_execution_start":
        this.handleToolExecutionStart(event.toolCallId, event.toolName, event.args)
        return
      case "tool_execution_update":
        this.handleToolExecutionUpdate(
          event.toolCallId,
          event.toolName,
          event.args,
          event.partialResult,
        )
        return
      case "tool_execution_end":
        this.handleToolExecutionEnd(event.toolCallId, event.toolName, event.result, event.isError)
        return
      default:
        return
    }
  }

  publishError(error: unknown) {
    this.publishStatus(STATUS_IDLE)
    publishPiEvent({
      directory: this.input.directory,
      payload: {
        type: SESSION_ERROR_EVENT,
        properties: {
          sessionID: this.buddySessionID,
          error: errorPayload(error),
        },
      },
    })
  }

  publishIdle() {
    this.publishStatus(STATUS_IDLE)
  }

  private publishSessionUpdated() {
    this.input.onSessionUpdated().catch((error) => {
      console.warn("Failed to publish PI session update:", error)
    })
  }

  private publishStatus(status: typeof STATUS_BUSY | typeof STATUS_IDLE) {
    publishPiEvent({
      directory: this.input.directory,
      payload: {
        type: SESSION_STATUS_EVENT,
        properties: {
          sessionID: this.buddySessionID,
          status: {
            type: status,
          },
        },
      },
    })
  }

  private publishMessageUpdated(message: PiAgentMessage, rawIndex: number, completed: boolean) {
    const serialized = serializePiTranscriptMessages({
      sessionID: this.buddySessionID,
      messages: [message],
    })[0]
    if (!serialized) return
    const transcriptEntry: PiTranscriptEntry = {
      id: transcriptMessageID(this.buddySessionID, rawIndex),
      sessionID: this.buddySessionID,
      message: serialized.message,
    }
    publishPiEvent({
      directory: this.input.directory,
      payload: {
        type: MESSAGE_UPDATED_EVENT,
        properties: {
          sessionID: this.buddySessionID,
          message: transcriptEntry,
          completed,
        },
      },
    })

    if (message.role !== "assistant") {
      return
    }

    const messageID = transcriptEntry.id
    const created = message.timestamp
    for (const [contentIndex, block] of message.content.entries()) {
      if (block.type === "toolCall") {
        this.publishPartUpdated({
          id: partIDForIndex(messageID, "tool", contentIndex),
          sessionID: this.buddySessionID,
          messageID,
          type: "tool",
          callID: block.id,
          tool: block.name,
          state: {
            status: "pending",
            input: block.arguments,
            raw: JSON.stringify(block.arguments),
          },
          metadata: undefined,
        })
        continue
      }

      if (block.type === "text") {
        const partID = partIDForIndex(messageID, "text", contentIndex)
        if (!completed && this.openedStreamingPartIDs.has(partID)) {
          continue
        }
        this.openedStreamingPartIDs.add(partID)
        this.publishPartUpdated({
          id: partID,
          sessionID: this.buddySessionID,
          messageID,
          type: "text",
          text: completed ? block.text : "",
          time: {
            start: created,
            ...(completed ? { end: Date.now() } : {}),
          },
        })
        continue
      }

      if (block.type === "thinking") {
        const partID = partIDForIndex(messageID, "thinking", contentIndex)
        if (!completed && this.openedStreamingPartIDs.has(partID)) {
          continue
        }
        this.openedStreamingPartIDs.add(partID)
        this.publishPartUpdated({
          id: partID,
          sessionID: this.buddySessionID,
          messageID,
          type: "reasoning",
          text: completed ? block.thinking : "",
          time: {
            start: created,
            ...(completed ? { end: Date.now() } : {}),
          },
        })
      }
    }
  }

  private publishPartUpdated(part: BuddyMessagePart, options?: { flushToolExecution?: boolean }) {
    if (part.type === "tool") {
      this.rememberToolPart(part)
    }

    publishPiEvent({
      directory: this.input.directory,
      payload: {
        type: MESSAGE_PART_UPDATED_EVENT,
        properties: {
          sessionID: this.buddySessionID,
          part,
          time: Date.now(),
        },
      },
    })

    if (part.type === "tool" && options?.flushToolExecution !== false) {
      this.flushBufferedToolExecution(part.callID)
    }
  }

  private publishPartDelta(messageID: string, partID: string, delta: string) {
    publishPiEvent({
      directory: this.input.directory,
      payload: {
        type: MESSAGE_PART_DELTA_EVENT,
        properties: {
          sessionID: this.buddySessionID,
          messageID,
          partID,
          field: TEXT_FIELD,
          delta,
        },
      },
    })
  }

  private rememberToolPart(part: BuddyToolPart) {
    this.toolPartsByCallID.set(part.callID, {
      messageID: part.messageID,
      partID: part.id,
      callID: part.callID,
      toolName: part.tool,
      args: toolInputFromState(part.state),
    })
  }

  private bufferToolExecution(input: {
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
    metadata?: Record<string, unknown>
    result?: BufferedToolResult
    timestamp: number
  }) {
    const current = this.bufferedToolExecutionsByCallID.get(input.toolCallId)
    this.bufferedToolExecutionsByCallID.set(input.toolCallId, {
      toolName: input.toolName,
      args: Object.keys(input.args).length > 0 ? input.args : (current?.args ?? {}),
      timestamp: current?.timestamp ?? input.timestamp,
      metadata: input.metadata ?? current?.metadata,
      result: input.result ?? current?.result,
    })
  }

  private flushBufferedToolExecution(toolCallId: string) {
    const reference = this.toolPartsByCallID.get(toolCallId)
    const buffered = this.bufferedToolExecutionsByCallID.get(toolCallId)
    if (!reference || !buffered) return

    if (buffered.result) {
      this.bufferedToolExecutionsByCallID.delete(toolCallId)
      this.publishPartUpdated(
        finishedToolPart({
          sessionID: this.buddySessionID,
          messageID: reference.messageID,
          partID: reference.partID,
          callID: toolCallId,
          toolName: buffered.toolName,
          args: Object.keys(reference.args).length > 0 ? reference.args : buffered.args,
          output: buffered.result.output,
          isError: buffered.result.isError,
          metadata: buffered.result.metadata,
          timestamp: buffered.result.timestamp,
        }),
        { flushToolExecution: false },
      )
      return
    }

    this.publishPartUpdated(
      runningToolPart({
        sessionID: this.buddySessionID,
        messageID: reference.messageID,
        partID: reference.partID,
        callID: toolCallId,
        toolName: buffered.toolName,
        args: Object.keys(reference.args).length > 0 ? reference.args : buffered.args,
        metadata: buffered.metadata,
        timestamp: buffered.timestamp,
      }),
      { flushToolExecution: false },
    )
  }

  private handleMessageStart(message: PiAgentMessage) {
    const active: ActiveMessage = {
      messageID: transcriptMessageID(this.buddySessionID, this.rawMessageCount),
      rawIndex: this.rawMessageCount,
      role: message.role,
    }
    this.activeMessage = active
    if (message.role === "assistant") {
      this.activeAssistant = active
    }
    this.publishMessageUpdated(message, active.rawIndex, false)
  }

  private handleMessageUpdate(
    message: PiAgentMessage,
    assistantMessageEvent: Extract<
      AgentSessionEvent,
      { type: "message_update" }
    >["assistantMessageEvent"],
  ) {
    const active = this.activeAssistant
    if (!active) return

    if (
      assistantMessageEvent.type === "text_delta" ||
      assistantMessageEvent.type === "thinking_delta"
    ) {
      const partKind = assistantMessageEvent.type === "text_delta" ? "text" : "thinking"
      this.publishPartDelta(
        active.messageID,
        partIDForIndex(active.messageID, partKind, assistantMessageEvent.contentIndex),
        assistantMessageEvent.delta,
      )
      return
    }

    // Text/thinking token deltas already stream through message.part.delta. Re-sending the
    // full message on every chunk causes avoidable transcript reflow and scroll jumps.
    if (assistantMessageEvent.type === "toolcall_delta") {
      return
    }

    this.publishMessageUpdated(message, active.rawIndex, false)
  }

  private handleMessageEnd(message: PiAgentMessage) {
    const active = this.activeMessage
    if (!active || active.role !== message.role) {
      this.publishMessageUpdated(message, this.rawMessageCount, true)
      this.rawMessageCount += 1
      if (message.role === "toolResult") {
        this.handleToolResultMessage(message)
      }
      return
    }

    this.publishMessageUpdated(message, active.rawIndex, true)
    this.rawMessageCount = Math.max(this.rawMessageCount, active.rawIndex + 1)
    if (message.role === "toolResult") {
      this.handleToolResultMessage(message)
    }
    if (active.role === "assistant") {
      this.activeAssistant = undefined
    }
    this.activeMessage = undefined
  }

  private handleToolExecutionStart(toolCallId: string, toolName: string, args: unknown) {
    const reference = this.toolPartsByCallID.get(toolCallId)
    if (!reference) {
      this.bufferToolExecution({
        toolCallId,
        toolName,
        args: recordFromUnknown(args),
        timestamp: Date.now(),
      })
      return
    }

    this.publishPartUpdated(
      runningToolPart({
        sessionID: this.buddySessionID,
        messageID: reference.messageID,
        partID: reference.partID,
        callID: toolCallId,
        toolName,
        args: recordFromUnknown(args),
        timestamp: Date.now(),
      }),
    )
  }

  private handleToolExecutionUpdate(
    toolCallId: string,
    toolName: string,
    args: unknown,
    partialResult: unknown,
  ) {
    const reference = this.toolPartsByCallID.get(toolCallId)
    if (!reference) {
      this.bufferToolExecution({
        toolCallId,
        toolName,
        args: recordFromUnknown(args),
        metadata: metadataFromToolResult(partialResult),
        timestamp: Date.now(),
      })
      return
    }

    this.publishPartUpdated(
      runningToolPart({
        sessionID: this.buddySessionID,
        messageID: reference.messageID,
        partID: reference.partID,
        callID: toolCallId,
        toolName,
        args: recordFromUnknown(args),
        metadata: metadataFromToolResult(partialResult),
        timestamp: Date.now(),
      }),
    )
  }

  private handleToolExecutionEnd(
    toolCallId: string,
    toolName: string,
    result: unknown,
    isError: boolean,
  ) {
    const reference = this.toolPartsByCallID.get(toolCallId)
    if (!reference) {
      this.bufferToolExecution({
        toolCallId,
        toolName,
        args: {},
        result: {
          output: textFromToolResult(result),
          isError,
          metadata: metadataFromToolResult(result),
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      })
      return
    }

    this.publishPartUpdated(
      finishedToolPart({
        sessionID: this.buddySessionID,
        messageID: reference.messageID,
        partID: reference.partID,
        callID: toolCallId,
        toolName,
        args: reference.args,
        output: textFromToolResult(result),
        isError,
        metadata: metadataFromToolResult(result),
        timestamp: Date.now(),
      }),
    )
  }

  private handleToolResultMessage(message: Extract<PiAgentMessage, { role: "toolResult" }>) {
    const reference = this.toolPartsByCallID.get(message.toolCallId)
    if (!reference) {
      this.bufferToolExecution({
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        args: {},
        result: {
          output: textFromPiToolResultMessage(message),
          isError: message.isError,
          metadata: recordFromUnknown(message.details),
          timestamp: message.timestamp,
        },
        timestamp: message.timestamp,
      })
      return
    }

    this.publishPartUpdated(
      finishedToolPart({
        sessionID: this.buddySessionID,
        messageID: reference.messageID,
        partID: reference.partID,
        callID: message.toolCallId,
        toolName: message.toolName,
        args: reference.args,
        output: textFromPiToolResultMessage(message),
        isError: message.isError,
        metadata: recordFromUnknown(message.details),
        timestamp: message.timestamp,
      }),
    )
  }

  async publishUpdatedSessionInfo(info: unknown) {
    publishPiEvent({
      directory: this.input.directory,
      payload: {
        type: SESSION_UPDATED_EVENT,
        properties: {
          info,
        },
      },
    })
  }
}
