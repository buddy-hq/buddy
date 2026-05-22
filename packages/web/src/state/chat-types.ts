import type {
  McpStatusResponse,
  PermissionListResponse,
  QuestionListResponse,
  SessionListResponse,
  SessionMessagesResponse,
} from "@buddy/sdk"

export type SessionInfo = Pick<
  SessionListResponse[number],
  "id" | "title" | "time" | "parentID" | "revert"
>

export type MessageOutputFormat = "text"
type MessageTime = {
  created: number
  completed?: number | null
}

export type TranscriptEntry = SessionMessagesResponse[number]
export type TranscriptMessage = TranscriptEntry["message"]
export type TranscriptUserMessage = Extract<TranscriptMessage, { role: "user" }>
export type TranscriptAssistantMessage = Extract<TranscriptMessage, { role: "assistant" }>
export type TranscriptToolResultMessage = Extract<TranscriptMessage, { role: "toolResult" }>
export type TranscriptPromptCustomMessage = Extract<
  TranscriptMessage,
  { role: "custom"; customType: "buddy-user-prompt" }
>
export type TranscriptGenericCustomMessage = Extract<TranscriptMessage, { role: "custom" }>
export type TranscriptTextContent = Extract<
  TranscriptAssistantMessage["content"][number],
  { type: "text" }
>
export type TranscriptThinkingContent = Extract<
  TranscriptAssistantMessage["content"][number],
  { type: "thinking" }
>
export type TranscriptToolCallContent = Extract<
  TranscriptAssistantMessage["content"][number],
  { type: "toolCall" }
>

export type MessageModel = {
  providerID: string
  modelID: string
  variant?: string | null
}

export type MessageError = {
  name: string
  message?: string | null
  [key: string]: unknown
}

export type UserMessageInfo = {
  id: string
  sessionID: string
  role: "user"
  model: MessageModel
  time: MessageTime
  agent: string
  tools?: Record<string, boolean>
  format?: MessageOutputFormat | null
}

export type AssistantMessageInfo = {
  id: string
  sessionID: string
  role: "assistant"
  time: MessageTime
  parentID: string
  modelID: string
  providerID: string
  mode: string
  agent: string
  path: {
    cwd: string
    root: string
  }
  cost: number
  tokens: {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  variant?: string | null
  finish?: string | null
  error?: MessageError | null
  structured?: unknown
  summary?: unknown
}

export type MessageInfo = UserMessageInfo | AssistantMessageInfo

type MessagePartID = {
  id: string
  sessionID: string
  messageID: string
}
type MessagePartToolState = Record<string, unknown>

// Persisted transcript parts come from the SDK contract. Buddy also keeps a few local-only
// prompt/rendering fields on the same objects before those parts are echoed back by the server.
export type MessagePart = MessagePartID & {
  type: "text" | "reasoning" | "file" | "tool" | (string & {})
  text?: string
  time?: { start: number; end?: number }
  mime?: string
  filename?: string
  url?: string
  source?: unknown
  synthetic?: boolean
  callID?: string
  tool?: string
  state?: MessagePartToolState
  metadata?: Record<string, unknown>
  optimistic?: boolean
  path?: string
  key?: string
  name?: string
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
  buddyPromptPart?: Record<string, unknown>
  [key: string]: unknown
}

export type MessageWithParts = {
  info: MessageInfo
  parts: MessagePart[]
}

export type GlobalBusPayload = {
  type: string
  properties: Record<string, unknown>
}

export type GlobalSyncPayload = {
  type: "sync"
  syncEvent: Record<string, unknown>
}

export type GlobalEvent = {
  directory?: string
  payload: GlobalBusPayload | GlobalSyncPayload
}

export type SessionStatusInfo =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number }

export type PermissionRequest = PermissionListResponse[number]
export type QuestionRequest = QuestionListResponse[number]

export type ProviderSource = "env" | "config" | "custom" | "api"

export type RawProviderModelInfo = {
  id: string
  providerID: string
  name: string
  family: string
  status: string
  release_date?: string
  variants?: Record<string, unknown>
  cost: {
    input: number
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  capabilities: {
    reasoning: boolean
    attachment: boolean
    toolcall: boolean
    input: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    output: {
      text: boolean
      audio: boolean
      image: boolean
      video: boolean
      pdf: boolean
    }
    interleaved?: boolean
  }
}

export type RawProviderInfo = {
  id: string
  name: string
  source: ProviderSource
  env: string[]
  models: Record<string, RawProviderModelInfo>
}

type SdkProviderModel = RawProviderModelInfo

export type ProviderModelInfo = Pick<
  SdkProviderModel,
  "id" | "providerID" | "name" | "status" | "limit"
> & {
  family?: string
  releaseDate?: SdkProviderModel["release_date"]
  variants: string[]
  capabilities: Pick<
    SdkProviderModel["capabilities"],
    "reasoning" | "attachment" | "toolcall" | "input" | "output" | "interleaved"
  >
}

export type ProviderMethodInfo = {
  type: "api" | "oauth"
  label: string
}

export type ProviderInfo = Pick<RawProviderInfo, "id" | "name" | "source" | "env"> & {
  connected: boolean
  methods: ProviderMethodInfo[]
  models: ProviderModelInfo[]
}

export type ProviderCatalogState = {
  providers: ProviderInfo[]
  default: Record<string, string>
}

export type McpStatusInfo = {
  status: McpStatusResponse[string]["status"]
  error?: string
}

export type McpStatusMap = Record<string, McpStatusInfo>

export type DirectoryChatState = {
  sessionID?: string
  loadingSessionID?: string
  isDraft?: boolean
  sessionTitle: string
  sessions: SessionInfo[]
  sessionStatusByID: Record<string, SessionStatusInfo>
  transcript: TranscriptEntry[]
  transcriptBySessionID?: Record<string, TranscriptEntry[]>
  messages: MessageWithParts[]
  messagesBySessionID?: Record<string, MessageWithParts[]>
  orphanPartsByMessageID?: Record<string, MessagePart[]>
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  mcpStatus: McpStatusMap
  isBusy: boolean
  isReady: boolean
  error?: string
}
