import type {
  AssistantMessageInfo,
  MessagePart,
  MessageWithParts,
  TranscriptAssistantMessage,
  TranscriptEntry,
  TranscriptGenericCustomMessage,
  TranscriptMessage,
  TranscriptPromptCustomMessage,
  TranscriptToolResultMessage,
  TranscriptUserMessage,
  UserMessageInfo,
} from "./chat-types"

export const BUDDY_PROMPT_CUSTOM_TYPE = "buddy-user-prompt" as const

const DEFAULT_AGENT = "buddy"
const DEFAULT_MODE = "pi"
const DEFAULT_PROVIDER_ID = "pi"
const DEFAULT_MODEL_ID = "unknown"
const TEXT_JOIN_SEPARATOR = "\n"
const PART_ID_INDEX_RADIX = 36
const PART_ID_INDEX_WIDTH = 6

type ToolResultDetails = {
  output: string
  isError: boolean
  timestamp: number
  metadata: Record<string, unknown>
}

function partIndexKey(index: number) {
  return index.toString(PART_ID_INDEX_RADIX).padStart(PART_ID_INDEX_WIDTH, "0")
}

function partID(messageID: string, kind: string, index: number) {
  return `prt_${messageID}_${kind}_${partIndexKey(index)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPromptCustomMessage(
  message: TranscriptMessage,
): message is TranscriptPromptCustomMessage {
  return message.role === "custom" && message.customType === BUDDY_PROMPT_CUSTOM_TYPE
}

function textFromBlocks(blocks: readonly { type: string; text?: string; thinking?: string }[]) {
  return blocks
    .flatMap((block) => {
      if (block.type === "text" && typeof block.text === "string") {
        return [block.text]
      }
      if (block.type === "thinking" && typeof block.thinking === "string") {
        return [block.thinking]
      }
      return []
    })
    .join(TEXT_JOIN_SEPARATOR)
}

function toolResultText(message: TranscriptToolResultMessage) {
  return textFromBlocks(message.content)
}

function toolResultMetadata(message: TranscriptToolResultMessage) {
  return isRecord(message.details) ? message.details : {}
}

function collectToolResults(transcript: readonly TranscriptEntry[]) {
  const results = new Map<string, ToolResultDetails>()
  for (const entry of transcript) {
    if (entry.message.role !== "toolResult") continue
    results.set(entry.message.toolCallId, {
      output: toolResultText(entry.message),
      isError: entry.message.isError,
      timestamp: entry.message.timestamp,
      metadata: toolResultMetadata(entry.message),
    })
  }
  return results
}

function promptCustomInfo(
  entry: TranscriptEntry,
  message: TranscriptPromptCustomMessage,
): UserMessageInfo {
  const model = message.details.model
  return {
    id: entry.id,
    sessionID: entry.sessionID,
    role: "user",
    time: {
      created: message.timestamp,
    },
    agent: message.details.agent ?? DEFAULT_AGENT,
    model: {
      providerID: model?.providerID ?? DEFAULT_PROVIDER_ID,
      modelID: model?.modelID ?? DEFAULT_MODEL_ID,
      variant: model?.variant ?? null,
    },
    tools: {},
  }
}

function userInfo(entry: TranscriptEntry): UserMessageInfo {
  const message = entry.message as TranscriptUserMessage
  return {
    id: entry.id,
    sessionID: entry.sessionID,
    role: "user",
    time: {
      created: message.timestamp,
    },
    agent: DEFAULT_AGENT,
    model: {
      providerID: DEFAULT_PROVIDER_ID,
      modelID: DEFAULT_MODEL_ID,
      variant: null,
    },
    tools: {},
  }
}

function userPartsFromContent(
  entry: TranscriptEntry,
  content: TranscriptUserMessage["content"],
): MessagePart[] {
  if (typeof content === "string") {
    return [
      {
        id: partID(entry.id, "text", 0),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "text",
        text: content,
        time: {
          start: entry.message.role === "user" ? entry.message.timestamp : Date.now(),
          end: entry.message.role === "user" ? entry.message.timestamp : Date.now(),
        },
      },
    ]
  }

  return content.map((block, contentIndex): MessagePart => {
    if (block.type === "text") {
      return {
        id: partID(entry.id, "text", contentIndex),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "text",
        text: block.text,
        time: {
          start: entry.message.timestamp,
          end: entry.message.timestamp,
        },
      }
    }

    return {
      id: partID(entry.id, "file", contentIndex),
      sessionID: entry.sessionID,
      messageID: entry.id,
      type: "file",
      mime: block.mimeType,
      url: `data:${block.mimeType};base64,${block.data}`,
    }
  })
}

function promptCustomParts(
  entry: TranscriptEntry,
  message: TranscriptPromptCustomMessage,
): MessagePart[] {
  return message.details.parts.map((part, index): MessagePart => {
    if (part.type === "text") {
      return {
        id: partID(entry.id, "text", index),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "text",
        text: part.text,
        time: {
          start: message.timestamp,
          end: message.timestamp,
        },
        ...(part.metadata ? { metadata: part.metadata } : {}),
      }
    }

    if (part.type === "agent") {
      return {
        id: partID(entry.id, "agent", index),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "agent",
        name: part.name,
      }
    }

    return {
      id: partID(entry.id, "file", index),
      sessionID: entry.sessionID,
      messageID: entry.id,
      type: "file",
      mime: part.mime,
      url: part.url,
      ...(part.filename ? { filename: part.filename } : {}),
    }
  })
}

function genericCustomParts(
  entry: TranscriptEntry,
  message: TranscriptGenericCustomMessage,
): MessagePart[] {
  return userPartsFromContent(
    entry,
    typeof message.content === "string"
      ? message.content
      : message.content.filter(
          (block): block is Extract<typeof block, { type: "text" | "image" }> =>
            block.type === "text" || block.type === "image",
        ),
  )
}

function assistantInfo(input: {
  entry: TranscriptEntry
  message: TranscriptAssistantMessage
  previousVisibleMessageID?: string
  completed: boolean
}): AssistantMessageInfo {
  const { entry, message, previousVisibleMessageID, completed } = input
  return {
    id: entry.id,
    sessionID: entry.sessionID,
    role: "assistant",
    time: {
      created: message.timestamp,
      completed: completed ? message.timestamp : null,
    },
    ...(message.errorMessage
      ? {
          error: {
            name: "ProviderError",
            message: message.errorMessage,
          },
        }
      : {}),
    parentID: previousVisibleMessageID ?? entry.id,
    modelID: message.model,
    providerID: message.provider,
    mode: DEFAULT_MODE,
    agent: DEFAULT_AGENT,
    path: {
      cwd: "",
      root: "",
    },
    cost: message.usage.cost.total,
    tokens: {
      total: message.usage.totalTokens,
      input: message.usage.input,
      output: message.usage.output,
      reasoning: 0,
      cache: {
        read: message.usage.cacheRead,
        write: message.usage.cacheWrite,
      },
    },
    finish: message.stopReason,
  }
}

function assistantParts(input: {
  entry: TranscriptEntry
  message: TranscriptAssistantMessage
  toolResults: ReadonlyMap<string, ToolResultDetails>
  completed: boolean
}): MessagePart[] {
  const { entry, message, toolResults, completed } = input
  return message.content.map((block, contentIndex): MessagePart => {
    if (block.type === "text") {
      return {
        id: partID(entry.id, "text", contentIndex),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "text",
        text: block.text,
        time: {
          start: message.timestamp,
          ...(completed ? { end: message.timestamp } : {}),
        },
      }
    }

    if (block.type === "thinking") {
      return {
        id: partID(entry.id, "thinking", contentIndex),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "reasoning",
        text: block.thinking,
        time: {
          start: message.timestamp,
          ...(completed ? { end: message.timestamp } : {}),
        },
      }
    }

    const result = toolResults.get(block.id)
    if (!result) {
      return {
        id: partID(entry.id, "tool", contentIndex),
        sessionID: entry.sessionID,
        messageID: entry.id,
        type: "tool",
        callID: block.id,
        tool: block.name,
        state: {
          status: "pending",
          input: block.arguments,
          raw: JSON.stringify(block.arguments),
        },
      }
    }

    return {
      id: partID(entry.id, "tool", contentIndex),
      sessionID: entry.sessionID,
      messageID: entry.id,
      type: "tool",
      callID: block.id,
      tool: block.name,
      state: result.isError
        ? {
            status: "error",
            input: block.arguments,
            error: result.output,
            metadata: result.metadata,
            time: {
              start: result.timestamp,
              end: result.timestamp,
            },
          }
        : {
            status: "completed",
            input: block.arguments,
            output: result.output,
            title: block.name,
            metadata: result.metadata,
            time: {
              start: result.timestamp,
              end: result.timestamp,
            },
          },
    }
  })
}

export function buildMessageFromTranscriptEntry(
  entry: TranscriptEntry,
  input?: {
    previousVisibleMessageID?: string
    completed?: boolean
    includeAssistantParts?: boolean
  },
) {
  const message = entry.message

  if (message.role === "user") {
    return {
      info: userInfo(entry),
      parts: userPartsFromContent(entry, message.content),
    } satisfies MessageWithParts
  }

  if (message.role === "assistant") {
    const completed = input?.completed ?? true
    return {
      info: assistantInfo({
        entry,
        message,
        previousVisibleMessageID: input?.previousVisibleMessageID,
        completed,
      }),
      parts: input?.includeAssistantParts === false
        ? []
        : assistantParts({
            entry,
            message,
            toolResults: new Map(),
            completed,
          }),
    } satisfies MessageWithParts
  }

  if (isPromptCustomMessage(message)) {
    return {
      info: promptCustomInfo(entry, message),
      parts: promptCustomParts(entry, message),
    } satisfies MessageWithParts
  }

  if (
    message.role === "custom" &&
    message.customType !== BUDDY_PROMPT_CUSTOM_TYPE &&
    message.display
  ) {
    return {
      info: {
        id: entry.id,
        sessionID: entry.sessionID,
        role: "user",
        time: {
          created: message.timestamp,
        },
        agent: DEFAULT_AGENT,
        model: {
          providerID: DEFAULT_PROVIDER_ID,
          modelID: DEFAULT_MODEL_ID,
          variant: null,
        },
        tools: {},
      },
      parts: genericCustomParts(entry, message),
    } satisfies MessageWithParts
  }

  return undefined
}

export function buildMessageViewFromTranscript(
  transcript: readonly TranscriptEntry[],
  input?: { incompleteMessageIDs?: ReadonlySet<string> },
) {
  const toolResults = collectToolResults(transcript)
  const messages: MessageWithParts[] = []
  let previousVisibleMessageID: string | undefined

  for (const entry of transcript) {
    const message = entry.message
    if (message.role === "user") {
      messages.push({
        info: userInfo(entry),
        parts: userPartsFromContent(entry, message.content),
      })
      previousVisibleMessageID = entry.id
      continue
    }

    if (message.role === "assistant") {
      const completed = !input?.incompleteMessageIDs?.has(entry.id)
      messages.push({
        info: assistantInfo({
          entry,
          message,
          previousVisibleMessageID,
          completed,
        }),
        parts: assistantParts({
          entry,
          message,
          toolResults,
          completed,
        }),
      })
      previousVisibleMessageID = entry.id
      continue
    }

    if (isPromptCustomMessage(message)) {
      messages.push({
        info: promptCustomInfo(entry, message),
        parts: promptCustomParts(entry, message),
      })
      previousVisibleMessageID = entry.id
      continue
    }

    if (
      message.role === "custom" &&
      message.customType !== BUDDY_PROMPT_CUSTOM_TYPE &&
      message.display
    ) {
      messages.push({
        info: {
          id: entry.id,
          sessionID: entry.sessionID,
          role: "user",
          time: {
            created: message.timestamp,
          },
          agent: DEFAULT_AGENT,
          model: {
            providerID: DEFAULT_PROVIDER_ID,
            modelID: DEFAULT_MODEL_ID,
            variant: null,
          },
          tools: {},
        },
        parts: genericCustomParts(entry, message),
      })
      previousVisibleMessageID = entry.id
    }
  }

  return messages
}
