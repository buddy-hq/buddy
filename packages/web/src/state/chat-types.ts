import { z } from "zod"
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
  TextPart as SdkTextPart,
} from "@buddy/sdk"
import {
  parseBooleanValue,
  parseFiniteNumber as parseFiniteNumberValue,
  parseFilteredStringArray,
  parseStringValue,
  parseWithSchema,
} from "./parse-external"

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

export type TRecord = NonNullable<SdkTextPart["metadata"]>

export type TMessageErrorData = {
  message?: string | null
  providerID?: string | null
  statusCode?: number | null
  isRetryable?: boolean | null
  responseBody?: string | null
}

export type MessageError = {
  name: SdkAssistantError["name"] | string
  message?: string
  data?: SdkAssistantError["data"] | TMessageErrorData
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
} & TRecord

export type MessageWithParts = {
  info: MessageInfo
  parts: MessagePart[]
}

export type GlobalBusPayload = {
  type: string
  properties: TRecord
}

export type GlobalSyncPayload = {
  type: "sync"
  syncEvent: TRecord
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
  // Nullable like the SDK's PermissionRequest.tool, so a null from the event stream is carried
  // rather than dropping the whole ask. No consumer reads this field today.
  tool?: {
    messageID: string
    callID: string
  } | null
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
  pendingPermissions: PermissionRequest[]
  pendingQuestions: QuestionRequest[]
  providers: ProviderInfo[]
  providerDefault: Record<string, string>
  mcpStatus: McpStatusMap
  isBusy: boolean
  isReady: boolean
  error?: string
}

export type TFailure = Error | string | TRecord

export const messageErrorDataSchema = z.object({
  message: z.string().nullable().optional(),
  providerID: z.string().nullable().optional(),
  statusCode: z.number().finite().nullable().optional(),
  isRetryable: z.boolean().nullable().optional(),
  responseBody: z.string().nullable().optional(),
})

export function isRecord<TValue>(value: TValue): value is TValue & TRecord {
  return value instanceof Object && !Array.isArray(value)
}

export function parseString<TValue>(value: TValue): string | undefined {
  return parseStringValue(value)
}

export function parseFiniteNumber<TValue>(value: TValue): number | undefined {
  return parseFiniteNumberValue(value)
}

export function parseBoolean<TValue>(value: TValue): boolean | undefined {
  return parseBooleanValue(value)
}

export function parseNonEmptyString<TValue>(value: TValue): string | undefined {
  const parsed = parseStringValue(value)?.trim()
  return parsed && parsed.length > 0 ? parsed : undefined
}

export function parseStringArray<TValue>(value: TValue): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed: string[] = []
  for (const entry of value) {
    const item = parseStringValue(entry)
    if (item === undefined) return undefined
    parsed.push(item)
  }
  return parsed
}

export function filterStringArray<TValue>(value: TValue): string[] {
  return parseFilteredStringArray(value) ?? []
}

export function parseFailure<TValue>(value: TValue): TFailure {
  if (value instanceof Error) return value
  const asString = parseStringValue(value)
  if (asString !== undefined) return asString
  if (isRecord(value)) return value
  return String(value)
}

export function parseMessageErrorData<TValue>(value: TValue): TMessageErrorData | undefined {
  return parseWithSchema(messageErrorDataSchema, value)
}
