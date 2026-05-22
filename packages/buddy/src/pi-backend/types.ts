import type { AgentSession, ModelRegistry } from "@earendil-works/pi-coding-agent"
export type {
  BuddyPromptCustomMessageDetails,
  BuddyPromptPart,
  BuddyAssistantMessageInfo,
  BuddyMessageInfo,
  BuddyMessageModel,
  BuddyMessagePart,
  BuddyMessageWithParts,
  BuddySessionInfo,
  BuddySessionStatus,
  BuddySessionStatusMap,
  BuddyToolPart,
  BuddyToolPartState,
  BuddyTokenUsage,
  BuddyUserMessageInfo,
  PiTranscriptEntry,
  PiTranscriptMessage,
} from "./contracts"

export type PiModel = NonNullable<ReturnType<ModelRegistry["find"]>>
export type PiAgentMessage = AgentSession["messages"][number]
export type PiSessionStatus = { type: "idle" } | { type: "busy" }

export type BuddyGlobalEvent = {
  directory: string
  payload: {
    type: string
    properties: Record<string, unknown>
  }
}

export type PiPromptRequest = {
  content: string
  llmContent:
    | string
    | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>
  parts: readonly Record<string, unknown>[]
  system?: string
  turnPrelude?: string
  messageID?: string
  agent?: string
  model?: {
    providerID: string
    modelID: string
    variant?: string
  }
  variant?: string
}
