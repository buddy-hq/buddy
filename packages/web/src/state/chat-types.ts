import type {
  McpStatus as SdkMcpStatus,
  Message as SdkMessage,
  OutputFormat as SdkOutputFormat,
  Part as SdkPart,
  PermissionRequest as SdkPermissionRequest,
  Provider as SdkProvider,
  ProviderAuthMethod as SdkProviderAuthMethod,
  ProviderOpenaiModelAvailabilityGetResponses,
  Session as SdkSession,
  SessionStatus as SdkSessionStatus,
} from "@buddy/sdk"

export type SessionInfo = Pick<SdkSession, "id" | "title" | "parentID" | "time" | "revert">

export type MessageOutputFormat = SdkOutputFormat
type MessageTime = {
  created: number
  completed?: number | null
}

type MessageModel = {
  providerID: string
  modelID: string
  variant?: string | null
}

type SdkAssistantError = NonNullable<Extract<SdkMessage, { role: "assistant" }>["error"]>

export type MessageError = {
  name: SdkAssistantError["name"] | string
  message?: string
  data?: unknown
  [key: string]: unknown
}

export type UserMessageInfo = Omit<
  Extract<SdkMessage, { role: "user" }>,
  "format" | "model" | "time"
> & {
  model: MessageModel
  time: MessageTime
  format?: MessageOutputFormat | null
}

export type AssistantMessageInfo = Omit<
  Extract<SdkMessage, { role: "assistant" }>,
  "error" | "time"
> & {
  time: MessageTime
  error?: MessageError | null
}

export type MessageInfo = UserMessageInfo | AssistantMessageInfo

type MessagePartID = Pick<SdkPart, "id" | "sessionID" | "messageID">

// Keep dynamic field access and partial payloads available during incremental event handling.
export type MessagePart = MessagePartID & {
  type: SdkPart["type"] | (string & {})
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

export type SessionStatusInfo = SdkSessionStatus

export type PermissionRequest = SdkPermissionRequest

export type QuestionOption = {
  label: string
  description: string
}

export type QuestionInfo = {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type QuestionRequest = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  }
}

type SdkProviderModel = SdkProvider["models"][string]

export type ProviderModelInfo = Pick<
  SdkProviderModel,
  "id" | "providerID" | "name" | "family" | "status" | "limit"
> & {
  releaseDate?: SdkProviderModel["release_date"]
  variants: string[]
  capabilities: Pick<
    SdkProviderModel["capabilities"],
    "reasoning" | "attachment" | "toolcall" | "input" | "output" | "interleaved"
  >
}

export type ProviderMethodInfo = Pick<SdkProviderAuthMethod, "type" | "label">

export type ProviderInfo = Pick<SdkProvider, "id" | "name" | "source" | "env"> & {
  connected: boolean
  methods: ProviderMethodInfo[]
  models: ProviderModelInfo[]
}

export type ProviderCatalogState = {
  providers: ProviderInfo[]
  default: Record<string, string>
  openAIModelAvailability: ProviderOpenaiModelAvailabilityGetResponses[200]
}

export type McpStatusInfo = {
  status: SdkMcpStatus["status"]
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
