import "./opencode-environment"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { MessageID, ModelID, PartID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import type { PiAgentMessage, PiModel } from "./types"
import { buddyProviderIDFromPi } from "./provider-aliases"
import { messageIDForIndex, partIDForIndex } from "./mapper"

const OPEN_CODE_AGENT_NAME = "buddy"
const OPEN_CODE_MODE = "pi"
const DEFAULT_PROVIDER_ID = "openai"
const DEFAULT_MODEL_ID = "unknown"
const EMPTY_TEXT = ""

type ToolResultDetails = {
  toolName: string
  output: string
  isError: boolean
  timestamp: number
  metadata: Record<string, unknown>
}

type MappingContext = {
  sessionID: string
  directory: string
  model?: PiModel
  visibleIndex: number
  toolResults: Map<string, ToolResultDetails>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function textFromBlocks(blocks: readonly { type: string; text?: string }[]) {
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? EMPTY_TEXT)
    .join("\n")
}

function metadataFromToolDetails(details: unknown): Record<string, unknown> {
  return isRecord(details) ? details : {}
}

function toolResultOutput(
  content: readonly {
    type: string
    text?: string
  }[],
) {
  return textFromBlocks(content)
}

function assistantTokens(message: Extract<PiAgentMessage, { role: "assistant" }>) {
  return {
    total: message.usage.totalTokens,
    input: message.usage.input,
    output: message.usage.output,
    reasoning: 0,
    cache: {
      read: message.usage.cacheRead,
      write: message.usage.cacheWrite,
    },
  }
}

function toolStateForCall(input: {
  args: Record<string, unknown>
  result?: ToolResultDetails
}): MessageV2.ToolState {
  if (!input.result) {
    return {
      status: "pending",
      input: input.args,
      raw: JSON.stringify(input.args),
    }
  }

  if (input.result.isError) {
    return {
      status: "error",
      input: input.args,
      error: input.result.output,
      ...(Object.keys(input.result.metadata).length > 0 ? { metadata: input.result.metadata } : {}),
      time: {
        start: input.result.timestamp,
        end: input.result.timestamp,
      },
    }
  }

  return {
    status: "completed",
    input: input.args,
    output: input.result.output,
    title: input.result.toolName,
    metadata: input.result.metadata,
    time: {
      start: input.result.timestamp,
      end: input.result.timestamp,
    },
  }
}

function collectToolResults(messages: readonly PiAgentMessage[]) {
  const results = new Map<string, ToolResultDetails>()
  for (const message of messages) {
    if (message.role !== "toolResult") continue
    results.set(message.toolCallId, {
      toolName: message.toolName,
      output: toolResultOutput(message.content),
      isError: message.isError,
      timestamp: message.timestamp,
      metadata: metadataFromToolDetails(message.details),
    })
  }
  return results
}

function openCodeSessionID(sessionID: string) {
  return SessionID.make(sessionID)
}

function openCodeMessageID(sessionID: string, visibleIndex: number) {
  return MessageID.make(messageIDForIndex(sessionID, visibleIndex))
}

function openCodePartID(messageID: string, kind: string, index: number) {
  return PartID.make(partIDForIndex(messageID, kind, index))
}

function openCodeModel(model?: PiModel) {
  return {
    providerID: ProviderID.make(
      model ? buddyProviderIDFromPi(model.provider) : DEFAULT_PROVIDER_ID,
    ),
    modelID: ModelID.make(model?.id ?? DEFAULT_MODEL_ID),
  }
}

function mapUserMessage(
  input: MappingContext & { message: Extract<PiAgentMessage, { role: "user" }> },
): MessageV2.WithParts {
  const sessionID = openCodeSessionID(input.sessionID)
  const messageID = openCodeMessageID(input.sessionID, input.visibleIndex)
  const created = input.message.timestamp
  const parts: MessageV2.Part[] = []

  if (typeof input.message.content === "string") {
    parts.push({
      id: openCodePartID(messageID, "text", 0),
      sessionID,
      messageID,
      type: "text",
      text: input.message.content,
      time: {
        start: created,
        end: created,
      },
    })
  } else {
    input.message.content.forEach((block, index) => {
      if (block.type === "text") {
        parts.push({
          id: openCodePartID(messageID, "text", index),
          sessionID,
          messageID,
          type: "text",
          text: block.text,
          time: {
            start: created,
            end: created,
          },
        })
      }
    })
  }

  return {
    info: {
      id: messageID,
      sessionID,
      role: "user",
      time: {
        created,
      },
      agent: OPEN_CODE_AGENT_NAME,
      model: openCodeModel(input.model),
      tools: {},
    },
    parts,
  }
}

function mapAssistantMessage(
  input: MappingContext & { message: Extract<PiAgentMessage, { role: "assistant" }> },
): MessageV2.WithParts {
  const sessionID = openCodeSessionID(input.sessionID)
  const messageID = openCodeMessageID(input.sessionID, input.visibleIndex)
  const created = input.message.timestamp
  const completed = Date.now()
  const parts: MessageV2.Part[] = []

  input.message.content.forEach((block, index) => {
    if (block.type === "text") {
      parts.push({
        id: openCodePartID(messageID, "text", index),
        sessionID,
        messageID,
        type: "text",
        text: block.text,
        time: {
          start: created,
          end: completed,
        },
      })
      return
    }

    if (block.type === "thinking") {
      parts.push({
        id: openCodePartID(messageID, "reasoning", index),
        sessionID,
        messageID,
        type: "reasoning",
        text: block.thinking,
        time: {
          start: created,
          end: completed,
        },
      })
      return
    }

    if (block.type !== "toolCall") return
    const partID = openCodePartID(messageID, "tool", index)
    parts.push({
      id: partID,
      sessionID,
      messageID,
      type: "tool",
      callID: block.id,
      tool: block.name,
      state: toolStateForCall({
        args: block.arguments,
        result: input.toolResults.get(block.id),
      }),
    })
  })

  return {
    info: {
      id: messageID,
      sessionID,
      role: "assistant",
      time: {
        created,
        completed,
      },
      parentID: openCodeMessageID(input.sessionID, Math.max(input.visibleIndex - 1, 0)),
      modelID: ModelID.make(input.message.model),
      providerID: ProviderID.make(buddyProviderIDFromPi(input.message.provider)),
      mode: OPEN_CODE_MODE,
      agent: OPEN_CODE_AGENT_NAME,
      path: {
        cwd: input.directory,
        root: input.directory,
      },
      cost: input.message.usage.cost.total,
      tokens: assistantTokens(input.message),
      finish: input.message.stopReason,
    },
    parts,
  }
}

export function mapPiMessagesToOpenCodeMessages(input: {
  sessionID: string
  directory: string
  messages: readonly PiAgentMessage[]
  model?: PiModel
}) {
  const toolResults = collectToolResults(input.messages)
  const mapped: MessageV2.WithParts[] = []
  let visibleIndex = 0

  for (const message of input.messages) {
    if (message.role === "user") {
      mapped.push(
        mapUserMessage({
          ...input,
          visibleIndex,
          toolResults,
          message,
        }),
      )
      visibleIndex += 1
      continue
    }

    if (message.role !== "assistant") continue
    mapped.push(
      mapAssistantMessage({
        ...input,
        visibleIndex,
        toolResults,
        message,
      }),
    )
    visibleIndex += 1
  }

  return mapped
}
