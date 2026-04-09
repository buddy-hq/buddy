import type {
  AgentPart as SdkAgentPart,
  FilePart as SdkFilePart,
  ReasoningPart as SdkReasoningPart,
  TextPart as SdkTextPart,
  ToolPart as SdkToolPart,
} from "@buddy/sdk"
import type { MessagePart } from "@/state/chat-types"

export type ChatFilePart = MessagePart & SdkFilePart
export type ChatAgentPart = MessagePart & SdkAgentPart
export type ChatTextPart = MessagePart & SdkTextPart
export type ChatReasoningPart = MessagePart & SdkReasoningPart
export type ChatToolPart = MessagePart & SdkToolPart

export function isChatFilePart(part: MessagePart): part is ChatFilePart {
  return part.type === "file" && typeof part.mime === "string" && typeof part.url === "string"
}

export function isChatAgentPart(part: MessagePart): part is ChatAgentPart {
  return part.type === "agent" && typeof part.name === "string"
}

export function isChatTextPart(part: MessagePart): part is ChatTextPart {
  return part.type === "text" && typeof part.text === "string"
}

export function isChatReasoningPart(part: MessagePart): part is ChatReasoningPart {
  return part.type === "reasoning" && typeof part.text === "string"
}

export function isChatToolPart(part: MessagePart): part is ChatToolPart {
  return part.type === "tool" && typeof part.tool === "string"
}
