import type {
  CommandListResponses,
  ConfigGetResponses,
  ConfigGetRawResponses,
  ConfigPersonasResponses,
  ExplorerFileEditReadResponses,
  ExplorerFileEditSaveResponses,
  FileContent,
  FileNode,
  FindFilesResponses,
  FlashcardDecksListResponse,
  GlobalConfigGetResponses,
  GlobalNotebookHomeGetResponses,
  GlobalNotebookHomePutResponses,
  GlobalNotebooksListResponses,
  LearnerMemoryListResponses,
  McpLocalConfig,
  McpRemoteConfig,
  MermaidArtifactsListResponses,
  McpStatusResponses,
  OpenProjectsCreateResponses,
  PermissionListResponses,
  ProjectListResponses,
  QuestionSetArtifactsListResponse,
  SessionCommandResponses,
  SessionMessagesResponses,
  SessionTeachingStateResponses,
  ProviderAuthMethod,
  ProviderAuthResponse,
  ProviderListResponse,
} from "@buddy/sdk"
import { useChatStore } from "./chat-store"
import { getModelSelectionScopeKey, useModelSelectionStore } from "./model-selection-store"
import type {
  MessageInfo,
  MessagePart,
  MessageWithParts,
  McpStatusMap,
  PermissionRequest,
  QuestionRequest,
  ProviderCatalogState,
  ProviderInfo,
  SessionInfo,
} from "./chat-types"
import type { TeachingPromptContext } from "./teaching-runtime"
import { stringifyError } from "../lib/api-client"

import { getBuddyClient, requireBuddyData, buddyResultMessage } from "../lib/buddy-client"
import { retry } from "../lib/retry"
import type { PromptFilePart, PromptSubmissionPart } from "../components/prompt/prompt-types"
import {
  BUSY_SESSION_STATUS,
  IDLE_SESSION_STATUS,
  isSessionStatusActive,
  normalizeSessionStatusValue,
} from "./session-status"

export type PersonaConfigOption = {
  id: string
  label: string
  description?: string
  surfaces: Array<"curriculum" | "editor" | "figure" | "question-set">
  defaultSurface: "curriculum" | "editor" | "figure" | "question-set"
  hidden?: boolean
}

export type LearnerCurriculumView = {
  workspace: {
    workspaceId: string
    label: string
    tags: string[]
    pinnedGoalIds: string[]
    projectConstraints: string[]
    localToolAvailability: string[]
    preferredSurfaces: Array<"chat" | "curriculum" | "editor" | "figure" | "question-set">
    motivationContext?: string
    opportunities: string[]
    userOverride: boolean
    createdAt: string
    updatedAt: string
  }
  coldStart: boolean
  alignmentSummary: {
    records: Array<{
      goalId: string
      practiceCount: number
      assessmentCount: number
      assessmentFormats: string[]
      coverage: "missing" | "partial" | "complete"
      suiteComplete: boolean
      orphanedRefs: string[]
      recommendation: string
    }>
    incompleteGoalIds: string[]
    recommendations: string[]
  }
  alignmentSummaryUnavailable?: boolean
  openFeedbackActions: Array<{
    feedbackId: string
    goalIds: string[]
    requiredAction: string
    scaffoldingLevel: string
    pattern?: string
    createdAt: string
  }>
  actions: Array<{
    actionId:
      | "define-goals"
      | "start-practice"
      | "run-check"
      | "review-due"
      | "resolve-feedback"
      | "understand-next"
    label: string
    prompt: string
    focusGoalIds: string[]
    reason: string
  }>
  actionsUnavailable?: boolean
  constraintsSummary: string[]
  markdown: string
  sections: Array<{
    title: string
    items: string[]
  }>
}

export type SessionRuntimeView = {
  persona: string
  teachingWorkspaceState: "inactive" | "active"
  visibleSurfaces: string[]
  defaultSurface: string
  tools: {
    allow: string[]
    deny: string[]
  }
  skills: {
    allow: string[]
    deny: string[]
  }
  subagents: {
    allow: string[]
    deny: string[]
  }
}

export type WorkspaceMermaidArtifactView = MermaidArtifactsListResponses[200]["artifacts"][number]

export type PromptCommandOption = {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
}

export type AgentConfigOption = {
  name: string
  description?: string
  mode?: string
  hidden?: boolean
  model?: {
    providerID: string
    modelID: string
  }
  variant?: string
}

export type TeachingSessionSnapshot = {
  sessionId: string
  persona: string
  currentSurface: string
  teachingWorkspaceState: "inactive" | "active"
  focusGoalIds: string[]
  sessionRuntime?: SessionRuntimeView
  lastLlmOutbound?: TeachingLlmOutboundSnapshot
  llmOutboundHistory?: TeachingLlmOutboundSnapshot[]
}

export type TeachingLlmOutboundSnapshot = {
  kind: "message" | "command"
  createdAt: string
  payload: Record<string, unknown>
  fullSystemPrompt?: string
}

type TeachingStateSessionRuntimeResponse = {
  persona: string
  teachingWorkspaceState: "inactive" | "active"
  access: {
    tools: Record<string, "allow" | "deny">
    skills: Record<string, "allow" | "deny">
    subagents: Record<string, "allow" | "deny">
  }
  ui: {
    visibleSurfaces: string[]
    defaultSurface: string
  }
}

function readRuntimeActionMap(value: Record<string, unknown>) {
  const entries = Object.entries(value).flatMap(([key, action]) =>
    action === "allow" || action === "deny" ? ([[key, action]] as const) : [],
  )
  return Object.fromEntries(entries)
}

function readTeachingWorkspaceStateFromResponse(
  snapshot: SessionTeachingStateResponses[200],
): "inactive" | "active" {
  if (isRecord(snapshot)) {
    const next = snapshot["teachingWorkspaceState"]
    if (next === "inactive" || next === "active") {
      return next
    }
  }

  return "inactive"
}

function readSessionRuntimeFromResponse(
  snapshot: SessionTeachingStateResponses[200],
): TeachingStateSessionRuntimeResponse | undefined {
  if (!isRecord(snapshot)) return undefined

  const runtime = snapshot["sessionRuntime"]
  if (!isRecord(runtime)) return undefined

  const persona = runtime["persona"]
  const teachingWorkspaceState = runtime["teachingWorkspaceState"]
  const access = runtime["access"]
  const ui = runtime["ui"]

  if (typeof persona !== "string") return undefined
  if (teachingWorkspaceState !== "inactive" && teachingWorkspaceState !== "active") {
    return undefined
  }
  if (!isRecord(access) || !isRecord(ui)) return undefined

  const tools = access["tools"]
  const skills = access["skills"]
  const subagents = access["subagents"]
  const visibleSurfaces = ui["visibleSurfaces"]
  const defaultSurface = ui["defaultSurface"]

  if (!isRecord(tools) || !isRecord(skills) || !isRecord(subagents)) return undefined
  if (!Array.isArray(visibleSurfaces) || typeof defaultSurface !== "string") return undefined

  return {
    persona,
    teachingWorkspaceState,
    access: {
      tools: readRuntimeActionMap(tools),
      skills: readRuntimeActionMap(skills),
      subagents: readRuntimeActionMap(subagents),
    },
    ui: {
      visibleSurfaces: visibleSurfaces.flatMap((surface) =>
        typeof surface === "string" ? [surface] : [],
      ),
      defaultSurface,
    },
  }
}

function normalizeProjectDirectory(directory: string) {
  const normalized = directory.trim().replace(/\/+$/, "")
  if (!normalized || normalized === "/") {
    return undefined
  }
  return normalized
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0
}

function normalizeDirectoryList(directories: string[]) {
  return Array.from(
    new Set(directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
  ).filter(isNonEmptyString)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function resolveDefaultPersonaID(
  personas: PersonaConfigOption[],
  configuredDefaultPersona?: string,
): string | undefined {
  const selectablePersonas = personas.filter((persona) => !persona.hidden)

  if (
    configuredDefaultPersona &&
    selectablePersonas.some((persona) => persona.id === configuredDefaultPersona)
  ) {
    return configuredDefaultPersona
  }

  return selectablePersonas[0]?.id
}

type RawProvider = ProviderListResponse["all"][number]
type RawProviderModel = RawProvider["models"][string]
type LearnerSnapshotPersona = "buddy" | "code-buddy" | "math-buddy" | "reading-buddy"
type LearnerMemoryRecord = LearnerMemoryListResponses[200]["memories"][number]
const DEFAULT_PERSONA_SURFACE: PersonaConfigOption["defaultSurface"] = "curriculum"
const DEFAULT_LEARNER_MEMORY_LIMIT = 25
const EMPTY_ALIGNMENT_SUMMARY: LearnerCurriculumView["alignmentSummary"] = {
  records: [],
  incompleteGoalIds: [],
  recommendations: [],
}
const SESSION_NOT_FOUND_ERROR = "Session not found"
const UNDO_MISSING_SESSION_ERROR = "Start a session before undoing the last message."
const UNDO_NO_MESSAGE_ERROR = "No user message is available to undo."
const RESTORE_NO_MESSAGE_ERROR = "No undone message is available to restore."
const TRANSCRIPT_RETRY_ATTEMPTS = 4
const TRANSCRIPT_RETRY_DELAY_MS = 500
const TRANSCRIPT_RETRY_FACTOR = 2
const pendingSessionCreations = new Map<string, Promise<SessionInfo>>()
export const DEFAULT_INBOX_NOTEBOOK_NAME = "Inbox" as const

export type NotebookHomeState = {
  configuredDirectory?: string
  defaultDirectory: string
  resolvedDirectory: string
  inboxDirectory: string
  inboxName: string
}

export type ManagedNotebookEntry = {
  name: string
  directory: string
}

export type KnownNotebookEntry = {
  directory: string
  name?: string
}
const latestSessionListRequestByDirectory = new Map<string, number>()
const latestTranscriptRequestByDirectory = new Map<string, number>()
const OPTIMISTIC_MESSAGE_ID_PREFIX = "msg" as const
const OPTIMISTIC_PART_ID_PREFIX = "prt" as const
const DEFAULT_OPTIMISTIC_AGENT = "buddy" as const
const PENDING_OPTIMISTIC_MODEL_PROVIDER_ID = "pending" as const
const PENDING_OPTIMISTIC_MODEL_ID = "pending" as const
const VENDOR_ID_COUNTER_RADIX = 0x1000
const VENDOR_ID_LENGTH = 26
const VENDOR_ID_TIME_BYTE_COUNT = 6
const VENDOR_ID_HEX_LENGTH = VENDOR_ID_TIME_BYTE_COUNT * 2
const VENDOR_ID_RANDOM_LENGTH = VENDOR_ID_LENGTH - VENDOR_ID_HEX_LENGTH
const VENDOR_ID_BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

let lastOptimisticTimestamp = 0
let optimisticCounter = 0

function createOptimisticID(prefix: string) {
  const currentTimestamp = Date.now()
  if (currentTimestamp !== lastOptimisticTimestamp) {
    lastOptimisticTimestamp = currentTimestamp
    optimisticCounter = 0
  }
  optimisticCounter += 1

  const encoded =
    BigInt(currentTimestamp) * BigInt(VENDOR_ID_COUNTER_RADIX) + BigInt(optimisticCounter)
  const timeBytes = new Uint8Array(VENDOR_ID_TIME_BYTE_COUNT)
  for (let index = 0; index < VENDOR_ID_TIME_BYTE_COUNT; index += 1) {
    const shift = BigInt(40 - 8 * index)
    timeBytes[index] = Number((encoded >> shift) & BigInt(0xff))
  }

  const randomBytes = new Uint8Array(VENDOR_ID_RANDOM_LENGTH)
  crypto.getRandomValues(randomBytes)
  const suffix = Array.from(
    randomBytes,
    (value) => VENDOR_ID_BASE62[value % VENDOR_ID_BASE62.length],
  ).join("")
  const timestampHex = Array.from(timeBytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  )
  return `${prefix}_${timestampHex}${suffix}`
}

function bumpDirectoryRequestSequence(map: Map<string, number>, directory: string) {
  const next = (map.get(directory) ?? 0) + 1
  map.set(directory, next)
  return next
}

function invalidateSessionLists(directory: string) {
  bumpDirectoryRequestSequence(latestSessionListRequestByDirectory, directory)
}

function invalidateTranscripts(directory: string) {
  bumpDirectoryRequestSequence(latestTranscriptRequestByDirectory, directory)
}

function selectDraftSession(directory: string) {
  invalidateSessionLists(directory)
  invalidateTranscripts(directory)
  const store = useChatStore.getState()
  store.startSessionDraft(directory)
  store.setDirectoryReady(directory, true)
}

function selectCanonicalSession(directory: string, info: SessionInfo) {
  invalidateSessionLists(directory)
  invalidateTranscripts(directory)
  const store = useChatStore.getState()
  store.setSessionInfo(directory, info)
  store.setDirectoryReady(directory, true)
}
type DirectorySessionLoadResult = {
  directory: string
  info: SessionInfo | undefined
}
const pendingDirectorySessionLoads = new Map<string, Promise<DirectorySessionLoadResult>>()

type SessionMutationResponse = {
  info: MessageInfo
  parts: MessagePart[]
}

type OptimisticPromptInput = {
  directory: string
  sessionID: string
  messageID: string
  content: string
  parts: PromptSubmissionPart[]
  agent?: string
  persona?: string
  model?: {
    providerID: string
    modelID: string
  }
  variant?: string
}

class RetryableTranscriptReloadError extends Error {
  constructor(cause: unknown) {
    super("Retryable transcript reload")
    this.name = "RetryableTranscriptReloadError"
    this.cause = cause
  }
}

function toLearnerPersona(persona?: string): LearnerSnapshotPersona | undefined {
  switch (persona) {
    case undefined:
      return undefined
    case "buddy":
    case "code-buddy":
    case "math-buddy":
    case "reading-buddy":
      return persona
    default:
      throw new Error(`Unsupported learner persona: ${persona}`)
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return value
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function isMessageWithParts(value: unknown): value is MessageWithParts {
  const record = asRecord(value)
  if (!record) return false
  if (!("info" in record)) return false
  if (!Array.isArray(record.parts)) return false
  return true
}

function isMessageWithPartsArray(value: unknown): value is MessageWithParts[] {
  return Array.isArray(value) && value.every((entry) => isMessageWithParts(entry))
}

function parseSessionMessagesPayload(value: unknown): MessageWithParts[] {
  if (isMessageWithPartsArray(value)) {
    return value
  }

  const record = asRecord(value)
  if (record && isMessageWithPartsArray(record.messages)) {
    return record.messages
  }

  throw new Error("Session messages payload must be an array of message parts.")
}

function restoreSessionSelectionFromMessages(
  directory: string,
  sessionID: string,
  messages: MessageWithParts[],
) {
  const lastUserMessage = messages.findLast((message) => message.info.role === "user")
  if (!lastUserMessage || lastUserMessage.info.role !== "user") return

  useModelSelectionStore
    .getState()
    .restoreSessionSelection(getModelSelectionScopeKey(directory, sessionID), {
      agent: lastUserMessage.info.agent,
      model: `${lastUserMessage.info.model.providerID}/${lastUserMessage.info.model.modelID}`,
      variant: lastUserMessage.info.model.variant ?? null,
      messageCreatedAt: lastUserMessage.info.time.created,
    })
}

function promoteSessionMutation(input: {
  directory: string
  sessionID: string
  response: SessionMutationResponse
  optimisticMessageID?: string
}) {
  const store = useChatStore.getState()
  invalidateTranscripts(input.directory)
  const activeState = store.directories[input.directory]
  const isActiveSession = activeState?.sessionID === input.sessionID
  store.setDirectoryReady(input.directory, true)
  const sessionMessages =
    activeState?.messagesBySessionID?.[input.sessionID] ??
    (isActiveSession ? (activeState?.messages ?? []) : [])

  const optimisticReplacementParts =
    input.response.info.role === "user" &&
    input.optimisticMessageID &&
    input.optimisticMessageID !== input.response.info.id
      ? (sessionMessages
          .find((message) => message.info.id === input.optimisticMessageID)
          ?.parts.map((part) =>
            Object.assign({}, part, {
              id: createOptimisticID(OPTIMISTIC_PART_ID_PREFIX),
              sessionID: input.sessionID,
              messageID: input.response.info.id,
            }),
          ) ?? [])
      : []

  store.applyMessageUpdated(input.directory, input.response.info)
  for (const part of input.response.parts) {
    store.applyPartUpdated(input.directory, part)
  }
  if (input.response.parts.length === 0) {
    for (const part of optimisticReplacementParts) {
      store.applyPartUpdated(input.directory, part)
    }
  }

  if (
    input.response.info.role === "user" &&
    input.optimisticMessageID &&
    input.optimisticMessageID !== input.response.info.id
  ) {
    store.applyMessageRemoved(input.directory, {
      sessionID: input.sessionID,
      messageID: input.optimisticMessageID,
    })
  }
  if (input.response.info.role === "user") {
    useModelSelectionStore
      .getState()
      .restoreSessionSelection(getModelSelectionScopeKey(input.directory, input.sessionID), {
        agent: input.response.info.agent,
        model: `${input.response.info.model.providerID}/${input.response.info.model.modelID}`,
        variant: input.response.info.model.variant ?? null,
        messageCreatedAt: input.response.info.time.created,
      })
  }
  if (isActiveSession) {
    store.clearDirectoryError(input.directory)
  }
}

function createOptimisticPromptParts(input: {
  sessionID: string
  messageID: string
  content: string
  parts: PromptSubmissionPart[]
}) {
  const text = input.content.trim()
  const hasSubmittedTextPart = input.parts.some((part) => part.type === "text")
  const textPart: MessagePart[] =
    text && !hasSubmittedTextPart
      ? [
          {
            id: createOptimisticID(OPTIMISTIC_PART_ID_PREFIX),
            sessionID: input.sessionID,
            messageID: input.messageID,
            type: "text",
            optimistic: true,
            text,
          },
        ]
      : []

  const visibleParts = input.parts
    .filter((part) => part.type === "text" || part.type === "file" || part.type === "agent")
    .map((part) =>
      Object.assign({}, part, {
        id: createOptimisticID(OPTIMISTIC_PART_ID_PREFIX),
        sessionID: input.sessionID,
        messageID: input.messageID,
        optimistic: true,
      }),
    )

  return [...textPart, ...visibleParts]
}

function addOptimisticPromptMessage(input: OptimisticPromptInput) {
  const store = useChatStore.getState()
  const optimisticModel = resolveOptimisticPromptModel(input)
  store.setActiveSession(input.directory, input.sessionID)
  store.setDirectoryReady(input.directory, true)
  store.applyMessageUpdated(input.directory, {
    id: input.messageID,
    sessionID: input.sessionID,
    role: "user",
    agent: input.agent ?? input.persona ?? DEFAULT_OPTIMISTIC_AGENT,
    model: {
      providerID: optimisticModel.providerID,
      modelID: optimisticModel.modelID,
      ...(input.variant ? { variant: input.variant } : {}),
    },
    time: {
      created: Date.now(),
    },
  })

  for (const part of createOptimisticPromptParts(input)) {
    store.applyPartUpdated(input.directory, part)
  }

  return true
}

function resolveOptimisticPromptModel(input: OptimisticPromptInput) {
  if (input.model) return input.model

  const state = useChatStore.getState().directories[input.directory]
  const messages =
    state?.messagesBySessionID?.[input.sessionID] ??
    (state?.sessionID === input.sessionID ? (state.messages ?? []) : [])
  const lastUserMessage = messages.findLast(
    (message) => message.info.sessionID === input.sessionID && message.info.role === "user",
  )
  if (lastUserMessage?.info.role === "user") {
    return {
      providerID: lastUserMessage.info.model.providerID,
      modelID: lastUserMessage.info.model.modelID,
    }
  }

  return {
    providerID: PENDING_OPTIMISTIC_MODEL_PROVIDER_ID,
    modelID: PENDING_OPTIMISTIC_MODEL_ID,
  }
}

function parseAgentConfigEntry(value: unknown): AgentConfigOption | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const name = asString(record.name)
  if (!name) return undefined

  const modelRecord = asRecord(record.model)
  const providerID = asString(modelRecord?.providerID)
  const modelID = asString(modelRecord?.modelID)

  return {
    name,
    description: asString(record.description) || undefined,
    mode: asString(record.mode) || undefined,
    hidden: typeof record.hidden === "boolean" ? record.hidden : undefined,
    model: providerID && modelID ? { providerID, modelID } : undefined,
    variant: asString(record.variant) || undefined,
  }
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

function parseWorkspaceView(workspace: unknown): LearnerCurriculumView["workspace"] {
  const value = asRecord(workspace) ?? {}

  const preferredSurfaces = asStringArray(value.preferredSurfaces).filter(
    (surface): surface is LearnerCurriculumView["workspace"]["preferredSurfaces"][number] =>
      surface === "chat" ||
      surface === "curriculum" ||
      surface === "editor" ||
      surface === "figure" ||
      surface === "question-set",
  )

  return {
    workspaceId: asString(value.workspaceId),
    label: asString(value.label, "Workspace"),
    tags: asStringArray(value.tags),
    pinnedGoalIds: asStringArray(value.pinnedGoalIds),
    projectConstraints: asStringArray(value.projectConstraints),
    localToolAvailability: asStringArray(value.localToolAvailability),
    preferredSurfaces,
    motivationContext: asString(value.motivationContext) || undefined,
    opportunities: asStringArray(value.opportunities),
    userOverride: asBoolean(value.userOverride),
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt),
  }
}

function parsePersonaSurfaces(surfaces: string[] | undefined): PersonaConfigOption["surfaces"] {
  if (!surfaces || surfaces.length === 0) return [DEFAULT_PERSONA_SURFACE]

  const normalized = surfaces.filter(
    (surface): surface is PersonaConfigOption["surfaces"][number] =>
      surface === "curriculum" ||
      surface === "editor" ||
      surface === "figure" ||
      surface === "question-set",
  )

  return normalized.length > 0 ? normalized : [DEFAULT_PERSONA_SURFACE]
}

function parseDefaultSurface(
  value: string | undefined,
  surfaces: PersonaConfigOption["surfaces"],
): PersonaConfigOption["defaultSurface"] {
  if (
    value === "curriculum" ||
    value === "editor" ||
    value === "figure" ||
    value === "question-set"
  ) {
    return value
  }
  return surfaces[0] ?? DEFAULT_PERSONA_SURFACE
}

function normalizeMcpStatusMap(input: McpStatusResponses[200]): McpStatusMap {
  return Object.fromEntries(
    Object.entries(input).map(([name, status]) => [
      name,
      {
        status: status.status,
        ...("error" in status && typeof status.error === "string" ? { error: status.error } : {}),
      },
    ]),
  )
}

function normalizeProviderSource(input: unknown, connected: boolean): ProviderInfo["source"] {
  if (input === "env" || input === "config" || input === "custom" || input === "api") {
    return input
  }
  return connected ? "api" : "custom"
}

function normalizeProviderModel(
  providerID: string,
  input: RawProviderModel,
): ProviderInfo["models"][number] {
  return {
    id: input.id,
    providerID,
    name: input.name,
    family: input.family,
    releaseDate: input.release_date,
    variants: Object.keys(input.variants ?? {}).toSorted((a, b) => a.localeCompare(b)),
    status: input.status ?? "active",
    limit: {
      context: input.limit.context,
      input: input.limit.input,
      output: input.limit.output,
    },
    capabilities: {
      reasoning: input.capabilities.reasoning,
      attachment: input.capabilities.attachment,
      toolcall: input.capabilities.toolcall,
      input: {
        text: input.capabilities.input.text,
        audio: input.capabilities.input.audio,
        image: input.capabilities.input.image,
        video: input.capabilities.input.video,
        pdf: input.capabilities.input.pdf,
      },
      output: {
        text: input.capabilities.output.text,
        audio: input.capabilities.output.audio,
        image: input.capabilities.output.image,
        video: input.capabilities.output.video,
        pdf: input.capabilities.output.pdf,
      },
      interleaved: input.capabilities.interleaved ?? false,
    },
  }
}

function normalizeProviderCatalog(
  providers: ProviderListResponse,
  authMethods: ProviderAuthResponse,
): ProviderCatalogState {
  const connected = new Set(providers.connected)

  return {
    default: providers.default,
    providers: providers.all
      .map((provider) => {
        const isConnected = connected.has(provider.id)
        const source = normalizeProviderSource(
          "source" in provider ? provider.source : undefined,
          isConnected,
        )

        return {
          id: provider.id,
          name: provider.name,
          source,
          env: provider.env,
          connected: isConnected,
          methods: (authMethods[provider.id] ?? []).map((method: ProviderAuthMethod) => ({
            type: method.type,
            label: method.label,
          })),
          models: Object.values(provider.models)
            .filter((model) => model.status !== "deprecated")
            .map((model) => normalizeProviderModel(provider.id, model))
            .toSorted((a, b) => a.name.localeCompare(b.name)),
        }
      })
      .toSorted((a, b) => a.name.localeCompare(b.name)),
  }
}

async function fetchProviderCatalog(directory?: string) {
  const client = getBuddyClient(directory)
  const [providerResult, authResult] = await Promise.all([
    client.provider.list(),
    client.provider.auth(),
  ])

  return normalizeProviderCatalog(
    requireBuddyData<ProviderListResponse>(providerResult),
    requireBuddyData<ProviderAuthResponse>(authResult),
  )
}

export async function loadProviderCatalogSnapshot(directory?: string) {
  return fetchProviderCatalog(directory)
}

export async function loadOpenProjects() {
  const response = requireBuddyData(await getBuddyClient().openProjects.list())
  const knownOpenProjects = normalizeDirectoryList(response.directories)
  useChatStore.getState().setOpenProjects(knownOpenProjects)
  return useChatStore.getState().openProjects
}

export async function openProject(directory: string) {
  const normalized = normalizeProjectDirectory(directory)
  if (!normalized) {
    throw new Error("Please choose a notebook directory, not /")
  }

  const opened = requireBuddyData(
    await getBuddyClient().openProjects.open({ directory: normalized }),
  )
  const canonicalDirectory = normalizeProjectDirectory(opened.directory)

  if (!canonicalDirectory) {
    throw new Error("Invalid notebook directory")
  }

  useChatStore.getState().ensureOpenProject(canonicalDirectory)
  return canonicalDirectory
}

export async function createManagedNotebook(name: string) {
  const notebookName = name.trim()
  if (!notebookName) {
    throw new Error("Notebook name is required")
  }

  const opened = requireBuddyData<OpenProjectsCreateResponses[200]>(
    await getBuddyClient().openProjects.create({ name: notebookName }),
  )
  const canonicalDirectory = normalizeProjectDirectory(opened.directory)
  if (!canonicalDirectory) {
    throw new Error("Invalid notebook directory")
  }

  useChatStore.getState().ensureOpenProject(canonicalDirectory)
  return canonicalDirectory
}

export async function openInboxNotebook() {
  return createManagedNotebook(DEFAULT_INBOX_NOTEBOOK_NAME)
}

export async function loadNotebookHome() {
  const result = requireBuddyData<GlobalNotebookHomeGetResponses[200]>(
    await getBuddyClient().global.notebookHome.get(),
  )
  return {
    configuredDirectory: result.configuredDirectory,
    defaultDirectory: result.defaultDirectory,
    resolvedDirectory: result.resolvedDirectory,
    inboxDirectory: result.inboxDirectory,
    inboxName: result.inboxName,
  }
}

export async function saveNotebookHome(directory: string) {
  const nextDirectory = directory.trim()
  if (!nextDirectory) {
    throw new Error("Notebook home is required")
  }

  const result = requireBuddyData<GlobalNotebookHomePutResponses[200]>(
    await getBuddyClient().global.notebookHome.put({ directory: nextDirectory }),
  )
  return {
    configuredDirectory: result.configuredDirectory,
    defaultDirectory: result.defaultDirectory,
    resolvedDirectory: result.resolvedDirectory,
    inboxDirectory: result.inboxDirectory,
    inboxName: result.inboxName,
  }
}

export async function loadManagedNotebooks() {
  const notebooks = requireBuddyData<GlobalNotebooksListResponses[200]>(
    await getBuddyClient().global.notebooks.list(),
  )
  return notebooks.map((notebook) => ({
    name: notebook.name,
    directory: notebook.directory,
  }))
}

export async function loadKnownNotebooks() {
  const projects = requireBuddyData<ProjectListResponses[200]>(
    await getBuddyClient().project.list(),
  )
  return projects.map((project) => ({
    directory: project.worktree,
    name: project.name,
  }))
}

export async function preloadProjectSessions(directories: string[]) {
  const unique = Array.from(
    new Set(directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
  ).filter(isNonEmptyString)
  await Promise.all(unique.map((directory) => loadSessions(directory).catch(() => undefined)))
}

export async function bootstrapOpenProjects() {
  const knownOpenProjects = await loadOpenProjects()
  await preloadProjectSessions(knownOpenProjects)
  return knownOpenProjects
}

export async function closeOpenProject(directory: string) {
  const normalized = normalizeProjectDirectory(directory)
  if (!normalized) return undefined

  const closed = requireBuddyData(
    await getBuddyClient().openProjects.close({ directory: normalized }),
  )
  const canonicalDirectory = normalizeProjectDirectory(closed.directory)
  if (!canonicalDirectory) return undefined

  useChatStore.getState().closeProject(canonicalDirectory)
  return canonicalDirectory
}

export async function reorderOpenProjects(directories: string[]) {
  const ordered = normalizeDirectoryList(directories)
  const response = requireBuddyData(
    await getBuddyClient().openProjects.reorder({ directories: ordered }),
  )
  const knownOpenProjects = normalizeDirectoryList(response.directories)
  useChatStore.getState().setOpenProjects(knownOpenProjects)
  return knownOpenProjects
}

export async function loadSessions(directory: string) {
  const store = useChatStore.getState()
  const requestSequence = bumpDirectoryRequestSequence(
    latestSessionListRequestByDirectory,
    directory,
  )

  try {
    const sessions = requireBuddyData<SessionInfo[]>(
      await getBuddyClient(directory).session.list({ directory }),
    )
    if (latestSessionListRequestByDirectory.get(directory) !== requestSequence) {
      return store.directories[directory]?.sessions ?? []
    }

    store.setSessions(directory, sessions)
    store.setDirectoryError(directory, undefined)
    return sessions
  } catch (error) {
    if (latestSessionListRequestByDirectory.get(directory) !== requestSequence) {
      return store.directories[directory]?.sessions ?? []
    }

    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

function currentSelectedSessionID(directory: string) {
  return useChatStore.getState().directories[directory]?.sessionID
}

function isLatestTranscriptRequest(directory: string, requestSequence: number) {
  return latestTranscriptRequestByDirectory.get(directory) === requestSequence
}

async function sessionStillExists(directory: string, sessionID: string) {
  const client = getBuddyClient(directory)
  const getResult = await client.session.get({
    sessionID,
  })
  if (getResult.response?.ok && getResult.error === undefined && getResult.data !== undefined) {
    return true
  }

  const listResult = await client.session.list({
    directory,
  })
  if (
    !listResult.response?.ok ||
    listResult.error !== undefined ||
    !Array.isArray(listResult.data)
  ) {
    return false
  }

  return listResult.data.some((session) => session.id === sessionID)
}

async function fetchSessionMessages(directory: string, sessionID: string) {
  const payload = requireBuddyData<SessionMessagesResponses[200]>(
    await getBuddyClient(directory).session.messages({
      sessionID,
    }),
  )

  return parseSessionMessagesPayload(payload)
}

async function loadSessionStatuses(directory: string) {
  const statusBySession = requireBuddyData(await getBuddyClient(directory).session.status())
  const store = useChatStore.getState()
  const snapshot = store.directories[directory]
  if (!snapshot) return statusBySession

  const sessionIDs = new Set<string>()
  for (const session of snapshot.sessions) {
    sessionIDs.add(session.id)
  }
  if (snapshot.sessionID) {
    sessionIDs.add(snapshot.sessionID)
  }

  for (const sessionID of sessionIDs) {
    store.applySessionStatus(
      directory,
      sessionID,
      normalizeSessionStatusValue(statusBySession[sessionID]),
    )
  }

  return statusBySession
}

async function recoverSessionAfterAbortAttempt(directory: string, sessionID: string) {
  await loadSessions(directory).catch(() => undefined)
  await loadSessionStatuses(directory).catch(() => undefined)

  const initialState = useChatStore.getState().directories[directory]
  if (!initialState) {
    return false
  }

  const sessionExists = initialState.sessions.some((session) => session.id === sessionID)
  if (!sessionExists) {
    return true
  }

  const selectedSessionID = initialState.sessionID
  if (selectedSessionID !== sessionID) {
    return !isSessionStatusActive(initialState.sessionStatusByID[sessionID])
  }

  if (!shouldDeferTranscriptReload(directory, sessionID)) {
    await loadMessages(directory, sessionID).catch((error) => {
      if (isMissingSessionError(error)) {
        return undefined
      }
      throw error
    })
    await loadSessionStatuses(directory).catch(() => undefined)
  }

  const nextState = useChatStore.getState().directories[directory]
  if (!nextState) {
    return false
  }

  const nextSessionExists = nextState.sessions.some((session) => session.id === sessionID)
  if (!nextSessionExists) {
    return true
  }

  if (nextState.sessionID !== sessionID) {
    return !isSessionStatusActive(nextState.sessionStatusByID[sessionID])
  }

  return !isSessionStatusActive(nextState.sessionStatusByID[sessionID]) && !nextState.isBusy
}

export async function loadMessages(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  const requestSequence = bumpDirectoryRequestSequence(
    latestTranscriptRequestByDirectory,
    directory,
  )
  let lastError: unknown

  try {
    const messages = await retry(
      async () => {
        try {
          return await fetchSessionMessages(directory, sessionID)
        } catch (error) {
          if (!isLatestTranscriptRequest(directory, requestSequence)) {
            throw error
          }

          const shouldRetry =
            isMissingSessionError(error) &&
            currentSelectedSessionID(directory) === sessionID &&
            (await sessionStillExists(directory, sessionID).catch(() => false))

          if (!shouldRetry) {
            throw error
          }

          throw new RetryableTranscriptReloadError(error)
        }
      },
      {
        attempts: TRANSCRIPT_RETRY_ATTEMPTS,
        delay: TRANSCRIPT_RETRY_DELAY_MS,
        factor: TRANSCRIPT_RETRY_FACTOR,
        retryIf: (error) => error instanceof RetryableTranscriptReloadError,
      },
    )

    if (!isLatestTranscriptRequest(directory, requestSequence)) {
      return messages
    }

    store.setMessages(directory, sessionID, messages)
    restoreSessionSelectionFromMessages(directory, sessionID, messages)
    store.setDirectoryError(directory, undefined)
    return messages
  } catch (error) {
    lastError =
      error instanceof RetryableTranscriptReloadError && error.cause !== undefined
        ? error.cause
        : error
  }

  if (
    isLatestTranscriptRequest(directory, requestSequence) &&
    currentSelectedSessionID(directory) === sessionID
  ) {
    store.setDirectoryError(directory, stringifyError(lastError))
  }

  throw lastError
}

export async function loadPermissions(directory: string) {
  const store = useChatStore.getState()
  try {
    const requests: PermissionRequest[] = requireBuddyData<PermissionListResponses[200]>(
      await getBuddyClient(directory).permission.list(),
    )
    store.setPendingPermissions(directory, requests)
    store.setDirectoryError(directory, undefined)
    return requests
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadQuestions(directory: string) {
  const store = useChatStore.getState()
  try {
    const requests: QuestionRequest[] = requireBuddyData(
      await getBuddyClient(directory).question.list(),
    )
    store.setPendingQuestions(directory, requests)
    store.setDirectoryError(directory, undefined)
    return requests
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadProviderCatalog(directory: string) {
  const store = useChatStore.getState()
  try {
    const providers = await fetchProviderCatalog(directory)
    store.setProviders(directory, providers)
    store.setDirectoryError(directory, undefined)
    return providers
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

function primeDirectoryRuntimeState(directory: string) {
  return Promise.all([
    loadSessionStatuses(directory).catch(() => undefined),
    loadPermissions(directory),
    loadProviderCatalog(directory),
    loadMcpStatus(directory).catch(() => undefined),
  ]).catch(() => undefined)
}

async function createSession(directory: string) {
  const pendingCreation = pendingSessionCreations.get(directory)
  if (pendingCreation) {
    return pendingCreation
  }

  const createPromise = (async () => {
    const info = requireBuddyData<SessionInfo>(await getBuddyClient(directory).session.create())
    selectCanonicalSession(directory, info)
    const store = useChatStore.getState()
    store.setMessages(directory, info.id, [])
    useModelSelectionStore.getState().migrateWorkspaceSelection(directory, info.id)
    return info
  })()

  pendingSessionCreations.set(directory, createPromise)
  try {
    return await createPromise
  } finally {
    if (pendingSessionCreations.get(directory) === createPromise) {
      pendingSessionCreations.delete(directory)
    }
  }
}

export async function ensureDirectorySession(directory: string) {
  const normalizedDirectory = normalizeProjectDirectory(directory) ?? directory
  const existingLoad =
    pendingDirectorySessionLoads.get(normalizedDirectory) ??
    pendingDirectorySessionLoads.get(directory)
  if (existingLoad) {
    return existingLoad
  }

  const loadKeys = new Set<string>([normalizedDirectory, directory])
  let loadingPromise: Promise<DirectorySessionLoadResult>

  loadingPromise = (async () => {
    const store = useChatStore.getState()
    let targetDirectory = normalizedDirectory

    try {
      const knownOpenProjects = store.openProjects
      targetDirectory = knownOpenProjects.includes(normalizedDirectory)
        ? normalizedDirectory
        : await openProject(normalizedDirectory)
      if (!loadKeys.has(targetDirectory)) {
        loadKeys.add(targetDirectory)
        const currentLoad = pendingDirectorySessionLoads.get(normalizedDirectory)
        if (currentLoad) {
          pendingDirectorySessionLoads.set(targetDirectory, currentLoad)
        }
      }

      const readyState = useChatStore.getState().directories[targetDirectory]
      if (readyState?.isReady && !readyState.sessionID) {
        store.clearDirectoryError(targetDirectory)
        void primeDirectoryRuntimeState(targetDirectory)
        return {
          directory: targetDirectory,
          info: undefined,
        }
      }
      const readyInfo = readyState?.isReady
        ? readyState.sessions.find((session) => session.id === readyState.sessionID)
        : undefined

      if (readyInfo) {
        store.clearDirectoryError(targetDirectory)
        void primeDirectoryRuntimeState(targetDirectory)
        return {
          directory: targetDirectory,
          info: readyInfo,
        }
      }

      store.setDirectoryReady(targetDirectory, false)
      store.clearDirectoryError(targetDirectory)

      const state = useChatStore.getState()
      const current = state.directories[targetDirectory]
      const storedSession = current?.sessionID ?? state.lastSessionByDirectory[targetDirectory]
      const sessions = await loadSessions(targetDirectory)
      const sessionByID = new Map(sessions.map((session) => [session.id, session]))

      let info: SessionInfo | undefined
      if (storedSession && sessionByID.has(storedSession)) {
        info = sessionByID.get(storedSession)
      }

      if (!info) {
        info = sessions[0]
      }

      if (!info && storedSession) {
        info = await getBuddyClient(targetDirectory)
          .session.get({
            sessionID: storedSession,
          })
          .then((result) => requireBuddyData(result))
          .catch(() => undefined)
      }

      if (!info) {
        const latestStoreState = useChatStore.getState()
        const latestState = latestStoreState.directories[targetDirectory]
        const latestSessionID =
          latestState?.sessionID ?? latestStoreState.lastSessionByDirectory[targetDirectory]
        if (latestSessionID) {
          info =
            latestState?.sessions.find((session) => session.id === latestSessionID) ??
            (await getBuddyClient(targetDirectory)
              .session.get({
                sessionID: latestSessionID,
              })
              .then((result) => requireBuddyData(result))
              .catch(() => undefined))
        }
      }

      if (info) {
        selectCanonicalSession(targetDirectory, info)
        const activeState = useChatStore.getState().directories[targetDirectory]
        const hasLiveTranscript =
          activeState?.sessionID === info.id &&
          (activeState.messages.length > 0 || activeState.isBusy)
        if (!hasLiveTranscript) {
          store.setDirectoryReady(targetDirectory, false)
          await loadMessages(targetDirectory, info.id)
        }
      } else {
        // The persisted active session ID can point to a session from a previous runtime.
        // If no valid session can be resolved, always reset to a fresh draft.
        selectDraftSession(targetDirectory)
      }

      store.setDirectoryReady(targetDirectory, true)
      void primeDirectoryRuntimeState(targetDirectory)
      return {
        directory: targetDirectory,
        info,
      }
    } catch (error) {
      store.setDirectoryReady(targetDirectory, true)
      store.setDirectoryError(targetDirectory, stringifyError(error))
      throw error
    }
  })()

  for (const key of loadKeys) {
    pendingDirectorySessionLoads.set(key, loadingPromise)
  }

  try {
    return await loadingPromise
  } finally {
    for (const key of loadKeys) {
      if (pendingDirectorySessionLoads.get(key) === loadingPromise) {
        pendingDirectorySessionLoads.delete(key)
      }
    }
  }
}

export async function selectSession(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  const current = store.directories[directory]
  const existing = current?.sessions.find((session) => session.id === sessionID)

  if (existing) {
    selectCanonicalSession(directory, existing)
  } else {
    const info = requireBuddyData<SessionInfo>(
      await getBuddyClient(directory).session.get({
        sessionID,
      }),
    )
    selectCanonicalSession(directory, info)
  }

  try {
    await loadMessages(directory, sessionID)
  } catch (error) {
    if (!isMissingSessionError(error)) {
      throw error
    }

    const sessions = await loadSessions(directory).catch(() => [])
    const fallback = sessions[0]
    if (!fallback) {
      selectDraftSession(directory)
      store.clearDirectoryError(directory)
      return
    }

    selectCanonicalSession(directory, fallback)
    const fallbackLoaded = await loadMessages(directory, fallback.id)
      .then(() => true)
      .catch(() => false)
    if (fallbackLoaded) {
      store.clearDirectoryError(directory)
    }
  }
}

export async function startNewSession(directory: string) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  const info = await createSession(directory)
  void loadSessions(directory).catch(() => undefined)
  await loadMessages(directory, info.id)
  return info
}

export function startNewSessionDraft(directory: string) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  selectDraftSession(directory)
}

async function resolveSessionForSend(directory: string) {
  const store = useChatStore.getState()
  const existing = store.directories[directory]?.sessionID
  if (existing) return existing

  const created = await createSession(directory)
  void loadSessions(directory).catch(() => undefined)
  return created.id
}

function resolvePromptTarget(input?: { persona?: string; agent?: string }) {
  const persona = input?.persona?.trim()
  if (persona) {
    return { persona }
  }

  const agent = input?.agent?.trim()
  if (agent) {
    return { agent }
  }

  return {}
}

export async function sendPrompt(
  directory: string,
  content: string,
  input?: {
    parts?: PromptSubmissionPart[]
    persona?: string
    focusGoalIds?: string[]
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    variant?: string
    teaching?: TeachingPromptContext
    reading?: {
      resourceKey?: string
      title: string
      path: string
      cfi?: string
      index?: number
      fraction?: number
      locationLabel?: string
      tocLabel?: string
      pageLabel?: string
      currentPassageText?: string
      visibleStartText?: string
      visibleEndText?: string
      readingTrail?: { tocLabel: string; cfi?: string; fraction?: number }[]
      annotationSummary?: { text: string; tocLabel?: string; note?: string }[]
    }
  },
): Promise<string> {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  let sessionID: string | undefined
  let optimisticMessageID: string | undefined

  try {
    const resolvedSessionID = await resolveSessionForSend(directory)
    sessionID = resolvedSessionID
    store.applySessionStatus(directory, resolvedSessionID, BUSY_SESSION_STATUS)

    optimisticMessageID = createOptimisticID(OPTIMISTIC_MESSAGE_ID_PREFIX)
    const promptParts = input?.parts ?? []
    const target = resolvePromptTarget(input)
    const promptBody = {
      messageID: optimisticMessageID,
      content,
      ...(promptParts.length > 0 ? { parts: promptParts } : {}),
      ...target,
      ...(input?.focusGoalIds && input.focusGoalIds.length > 0
        ? { focusGoalIds: input.focusGoalIds }
        : {}),
      ...(input?.model ? { model: input.model } : {}),
      ...(input?.variant ? { variant: input.variant } : {}),
      ...(input?.teaching ? { teaching: input.teaching } : {}),
      ...(input?.reading ? { reading: input.reading } : {}),
    }
    const optimisticAdded = addOptimisticPromptMessage({
      directory,
      sessionID: resolvedSessionID,
      messageID: optimisticMessageID,
      content,
      parts: promptParts,
      agent: input?.agent,
      persona: input?.persona,
      model: input?.model,
      variant: input?.variant,
    })

    const postPrompt = async (targetSessionID: string): Promise<void> => {
      const result = await getBuddyClient(directory).session.promptAsync({
        sessionID: targetSessionID,
        body: promptBody,
      })
      if (!result.response || !result.response.ok || result.error !== undefined) {
        throw new Error(buddyResultMessage(result))
      }
    }

    console.info("[chat-action] prompt.start", {
      directory,
      contentLength: content.length,
      sessionID: resolvedSessionID,
    })

    try {
      await postPrompt(resolvedSessionID)
    } catch (error) {
      const shouldRecover = await shouldRecoverMissingSession(directory, resolvedSessionID, error)
      if (!shouldRecover) {
        throw error
      }

      store.applySessionStatus(directory, resolvedSessionID, IDLE_SESSION_STATUS)
      if (optimisticAdded) {
        store.applyMessageRemoved(directory, {
          sessionID: resolvedSessionID,
          messageID: optimisticMessageID,
        })
      }
      selectDraftSession(directory)
      const recoveredSessionID = await resolveSessionForSend(directory)
      sessionID = recoveredSessionID
      store.applySessionStatus(directory, recoveredSessionID, BUSY_SESSION_STATUS)
      addOptimisticPromptMessage({
        directory,
        sessionID: recoveredSessionID,
        messageID: optimisticMessageID,
        content,
        parts: promptParts,
        agent: input?.agent,
        persona: input?.persona,
        model: input?.model,
        variant: input?.variant,
      })

      console.warn("[chat-action] prompt.retry-missing-session", {
        directory,
        previousSessionID: resolvedSessionID,
        recoveredSessionID,
      })

      await postPrompt(recoveredSessionID)
    }

    void loadSessions(directory).catch(() => undefined)
    console.info("[chat-action] prompt.accepted", { directory, sessionID })
    return sessionID ?? resolvedSessionID
  } catch (error) {
    if (sessionID) {
      console.error("[chat-action] prompt.failed", {
        directory,
        sessionID,
        error: stringifyError(error),
      })
    } else {
      console.error("[chat-action] prompt.failed.before-session", {
        directory,
        error: stringifyError(error),
      })
    }

    const missingSession = isMissingSessionError(error)
    if (sessionID) {
      store.applySessionStatus(directory, sessionID, IDLE_SESSION_STATUS)
      if (optimisticMessageID) {
        store.applyMessageRemoved(directory, {
          sessionID,
          messageID: optimisticMessageID,
        })
      }
      if (missingSession) {
        selectDraftSession(directory)
      } else {
        void loadMessages(directory, sessionID).catch(() => undefined)
      }
      void loadSessions(directory).catch(() => undefined)
    }

    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

function isMissingSessionError(error: unknown) {
  const message = stringifyError(error).toLowerCase()
  return message.includes(SESSION_NOT_FOUND_ERROR.toLowerCase())
}

async function isSessionMissingInDirectory(directory: string, sessionID: string) {
  const result = await getBuddyClient(directory).session.get({
    sessionID,
  })
  return result.response?.status === 404
}

async function shouldRecoverMissingSession(directory: string, sessionID: string, error: unknown) {
  if (isMissingSessionError(error)) return true
  return isSessionMissingInDirectory(directory, sessionID).catch(() => false)
}

export async function sendCommand(
  directory: string,
  command: string,
  argumentsText: string,
  input?: {
    parts?: PromptFilePart[]
    persona?: string
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    variant?: string
  },
): Promise<string> {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  let sessionID: string | undefined

  try {
    const resolvedSessionID = await resolveSessionForSend(directory)
    sessionID = resolvedSessionID
    store.applySessionStatus(directory, resolvedSessionID, BUSY_SESSION_STATUS)

    const target = resolvePromptTarget(input)
    const commandBody = {
      command,
      arguments: argumentsText,
      ...(input?.parts && input.parts.length > 0 ? { parts: input.parts } : {}),
      ...target,
      ...(input?.model ? { model: `${input.model.providerID}/${input.model.modelID}` } : {}),
      ...(input?.variant ? { variant: input.variant } : {}),
    }

    const postCommand = async (targetSessionID: string): Promise<SessionMutationResponse> =>
      requireBuddyData<SessionCommandResponses[200]>(
        await getBuddyClient(directory).session.command({
          sessionID: targetSessionID,
          body: commandBody,
        }),
      )

    try {
      const response = await postCommand(resolvedSessionID)
      promoteSessionMutation({
        directory,
        sessionID: resolvedSessionID,
        response,
      })
    } catch (error) {
      const shouldRecover = await shouldRecoverMissingSession(directory, resolvedSessionID, error)
      if (!shouldRecover) {
        throw error
      }

      store.applySessionStatus(directory, resolvedSessionID, IDLE_SESSION_STATUS)
      selectDraftSession(directory)
      const recoveredSessionID = await resolveSessionForSend(directory)
      sessionID = recoveredSessionID
      store.applySessionStatus(directory, recoveredSessionID, BUSY_SESSION_STATUS)
      const response = await postCommand(recoveredSessionID)
      promoteSessionMutation({
        directory,
        sessionID: recoveredSessionID,
        response,
      })
      void loadSessions(directory).catch(() => undefined)
    }

    return sessionID
  } catch (error) {
    const missingSession = isMissingSessionError(error)
    if (sessionID) {
      store.applySessionStatus(directory, sessionID, IDLE_SESSION_STATUS)
      if (missingSession) {
        selectDraftSession(directory)
      } else {
        void loadMessages(directory, sessionID).catch(() => undefined)
      }
      void loadSessions(directory).catch(() => undefined)
    }

    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function compactSession(
  directory: string,
  sessionID: string,
  input: {
    providerID: string
    modelID: string
    auto?: boolean
  },
) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  store.applySessionStatus(directory, sessionID, BUSY_SESSION_STATUS)

  try {
    requireBuddyData(
      await getBuddyClient(directory).session.summarize({
        sessionID,
        providerID: input.providerID,
        modelID: input.modelID,
        ...(input.auto === undefined ? {} : { auto: input.auto }),
      }),
    )
  } catch (error) {
    const missingSession = isMissingSessionError(error)
    store.applySessionStatus(directory, sessionID, IDLE_SESSION_STATUS)
    if (missingSession) {
      selectDraftSession(directory)
    } else {
      void loadMessages(directory, sessionID).catch(() => undefined)
    }
    void loadSessions(directory).catch(() => undefined)
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function loadTeachingSessionState(directory: string, sessionID: string) {
  const result = await getBuddyClient(directory).session.teachingState({
    sessionID,
  })

  if (result.response?.status === 204) {
    return undefined
  }

  if (
    !result.response ||
    !result.response.ok ||
    result.error !== undefined ||
    result.data === undefined
  ) {
    throw new Error(buddyResultMessage(result))
  }

  const snapshot = result.data
  const sessionRuntime = readSessionRuntimeFromResponse(snapshot)
  return {
    sessionId: snapshot.sessionId,
    persona: snapshot.persona,
    currentSurface: snapshot.currentSurface,
    teachingWorkspaceState: readTeachingWorkspaceStateFromResponse(snapshot),
    focusGoalIds: snapshot.focusGoalIds,
    ...(sessionRuntime
      ? {
          sessionRuntime: buildSessionRuntimeView(sessionRuntime),
        }
      : {}),
    lastLlmOutbound: snapshot.lastLlmOutbound,
    llmOutboundHistory: snapshot.llmOutboundHistory,
  }
}

export async function abortPrompt(directory: string) {
  const store = useChatStore.getState()
  const state = store.directories[directory]
  const sessionID = state?.sessionID
  if (!sessionID) {
    return false
  }

  let abortError: unknown
  let aborted = false

  try {
    aborted = requireBuddyData(
      await getBuddyClient(directory).session.abort({
        sessionID,
      }),
    )
    if (aborted) {
      const latestAssistantMessage = useChatStore
        .getState()
        .directories[directory]?.messages.findLast((message) => message.info.role === "assistant")
      if (latestAssistantMessage?.info.role === "assistant") {
        store.applyMessageUpdated(directory, {
          ...latestAssistantMessage.info,
          finish: "aborted",
        })
      }

      store.applySessionStatus(directory, sessionID, IDLE_SESSION_STATUS)
    }
  } catch (error) {
    abortError = error
  }

  const recovered = await recoverSessionAfterAbortAttempt(directory, sessionID).catch(() => false)

  if (abortError) {
    if (recovered) {
      store.clearDirectoryError(directory)
      return false
    }

    store.setDirectoryError(directory, stringifyError(abortError))
    throw abortError
  }

  return aborted
}

function resolveUndoTargetMessageID(input: {
  messages: MessageWithParts[]
  session: SessionInfo | undefined
  explicitMessageID?: string
}) {
  if (input.explicitMessageID) return input.explicitMessageID

  const revertMessageID = input.session?.revert?.messageID
  const latestUserMessage = input.messages.findLast(
    (message) =>
      message.info.role === "user" &&
      (revertMessageID === undefined || message.info.id < revertMessageID),
  )
  if (!latestUserMessage || latestUserMessage.info.role !== "user") {
    return undefined
  }

  return latestUserMessage.info.id
}

function resolveRestoreTargetMessageID(input: {
  messages: MessageWithParts[]
  session: SessionInfo | undefined
}) {
  const revertMessageID = input.session?.revert?.messageID
  if (!revertMessageID) {
    return undefined
  }

  const nextUserMessage = input.messages.find(
    (message) => message.info.role === "user" && message.info.id > revertMessageID,
  )
  return nextUserMessage?.info.id
}

async function performSessionRevertMutation(input: {
  directory: string
  sessionID: string
  request: () => Promise<SessionInfo>
}) {
  const store = useChatStore.getState()
  store.applySessionStatus(input.directory, input.sessionID, BUSY_SESSION_STATUS)

  try {
    const session = await input.request()

    selectCanonicalSession(input.directory, session)
    await loadMessages(input.directory, input.sessionID)
    void loadSessions(input.directory).catch(() => undefined)
    store.applySessionStatus(input.directory, input.sessionID, IDLE_SESSION_STATUS)
    store.clearDirectoryError(input.directory)
    return session
  } catch (error) {
    const missingSession = isMissingSessionError(error)
    store.applySessionStatus(input.directory, input.sessionID, IDLE_SESSION_STATUS)
    if (missingSession) {
      selectDraftSession(input.directory)
    } else {
      void loadMessages(input.directory, input.sessionID).catch(() => undefined)
    }
    void loadSessions(input.directory).catch(() => undefined)
    store.setDirectoryError(input.directory, stringifyError(error))
    throw error
  }
}

export async function undoLastSessionMessage(
  directory: string,
  input?: {
    sessionID?: string
    messageID?: string
  },
) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)

  const initialState = store.directories[directory]
  const sessionID = input?.sessionID ?? initialState?.sessionID
  if (!sessionID) {
    const error = new Error(UNDO_MISSING_SESSION_ERROR)
    store.setDirectoryError(directory, error.message)
    throw error
  }

  if (initialState?.isBusy) {
    await abortPrompt(directory).catch(() => undefined)
  }

  const latestState = useChatStore.getState().directories[directory]
  const activeSession = latestState?.sessions.find((session) => session.id === sessionID)
  const messageID = resolveUndoTargetMessageID({
    messages: latestState?.messages ?? [],
    session: activeSession,
    explicitMessageID: input?.messageID,
  })

  if (!messageID) {
    const error = new Error(UNDO_NO_MESSAGE_ERROR)
    store.setDirectoryError(directory, error.message)
    throw error
  }

  return performSessionRevertMutation({
    directory,
    sessionID,
    request: async () =>
      requireBuddyData(
        await getBuddyClient(directory).session.revert({
          sessionID,
          messageID,
        }),
      ),
  })
}

export async function restoreRevertedSessionMessage(
  directory: string,
  input?: {
    sessionID?: string
  },
) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)

  const initialState = store.directories[directory]
  const sessionID = input?.sessionID ?? initialState?.sessionID
  if (!sessionID) {
    const error = new Error(UNDO_MISSING_SESSION_ERROR)
    store.setDirectoryError(directory, error.message)
    throw error
  }

  if (initialState?.isBusy) {
    await abortPrompt(directory).catch(() => undefined)
  }

  const latestState = useChatStore.getState().directories[directory]
  const activeSession = latestState?.sessions.find((session) => session.id === sessionID)
  const nextMessageID = resolveRestoreTargetMessageID({
    messages: latestState?.messages ?? [],
    session: activeSession,
  })
  const hasRevertState = !!activeSession?.revert?.messageID

  if (!hasRevertState) {
    const error = new Error(RESTORE_NO_MESSAGE_ERROR)
    store.setDirectoryError(directory, error.message)
    throw error
  }

  return performSessionRevertMutation({
    directory,
    sessionID,
    request: async () =>
      nextMessageID
        ? requireBuddyData(
            await getBuddyClient(directory).session.revert({
              sessionID,
              messageID: nextMessageID,
            }),
          )
        : requireBuddyData(
            await getBuddyClient(directory).session.unrevert({
              sessionID,
            }),
          ),
  })
}

async function resyncDirectoryState(
  directory: string,
  input?: {
    forceActiveTranscriptReload?: boolean
  },
) {
  await loadSessions(directory)
  await loadSessionStatuses(directory).catch(() => undefined)
  await loadPermissions(directory)
  await loadQuestions(directory)
  await loadProviderCatalog(directory)
  await loadMcpStatus(directory).catch(() => undefined)
  const sessionID = useChatStore.getState().directories[directory]?.sessionID
  if (!sessionID) return
  if (!input?.forceActiveTranscriptReload && shouldDeferTranscriptReload(directory, sessionID)) {
    return
  }
  await loadMessages(directory, sessionID)
  await loadSessionStatuses(directory).catch(() => undefined)
}

export async function resyncDirectory(directory: string) {
  return resyncDirectoryState(directory)
}

export async function resyncDirectoryAfterReconnect(directory: string) {
  return resyncDirectoryState(directory, {
    forceActiveTranscriptReload: true,
  })
}

export async function replyPermission(input: {
  directory: string
  requestID: string
  reply: "once" | "always" | "reject"
  message?: string
}) {
  const result = requireBuddyData(
    await getBuddyClient(input.directory).permission.reply({
      requestID: input.requestID,
      reply: input.reply,
      message: input.message,
    }),
  )
  if (result) {
    useChatStore.getState().applyPermissionReplied(input.directory, input.requestID)
  }
  return result
}

export async function replyQuestion(input: {
  directory: string
  requestID: string
  answers: string[][]
}) {
  const result = requireBuddyData(
    await getBuddyClient(input.directory).question.reply({
      requestID: input.requestID,
      answers: input.answers,
    }),
  )
  if (result) {
    useChatStore.getState().applyQuestionResolved(input.directory, input.requestID)
  }
  return result
}

export async function rejectQuestion(input: { directory: string; requestID: string }) {
  const result = requireBuddyData(
    await getBuddyClient(input.directory).question.reject({
      requestID: input.requestID,
    }),
  )
  if (result) {
    useChatStore.getState().applyQuestionResolved(input.directory, input.requestID)
  }
  return result
}

export async function updateSession(input: {
  directory: string
  sessionID: string
  title?: string
  archivedAt?: number
}) {
  const store = useChatStore.getState()
  const payload: {
    title?: string
    time?: {
      archived?: number
    }
  } = {}

  if (input.title !== undefined) {
    payload.title = input.title
  }

  if (input.archivedAt !== undefined) {
    payload.time = {
      archived: input.archivedAt,
    }
  }

  try {
    const session = requireBuddyData<SessionInfo>(
      await getBuddyClient(input.directory).session.update({
        sessionID: input.sessionID,
        ...payload,
      }),
    )
    store.setDirectoryError(input.directory, undefined)
    return session
  } catch (error) {
    store.setDirectoryError(input.directory, stringifyError(error))
    throw error
  }
}

export type LearnerSnapshotInput = {
  persona?: string
  sessionID?: string
}

type LearnerMemorySnapshot = {
  memories: LearnerMemoryRecord[]
}

function formatLearnerMemoryItem(memory: LearnerMemoryRecord): string {
  return `${memory.title}: ${memory.body}`
}

function learnerMemorySectionTitle(type: LearnerMemoryRecord["type"]): string {
  switch (type) {
    case "preference":
      return "Preferences"
    case "constraint":
      return "Constraints"
    case "goal":
      return "Goals"
    case "evidence":
      return "Evidence"
    case "fragile_skill":
      return "Fragile skills"
    case "misconception":
      return "Misconceptions"
    case "project_context":
      return "Project context"
    case "open_loop":
      return "Open loops"
  }
}

function buildLearnerMemoryMarkdown(memories: LearnerMemoryRecord[]): string {
  if (memories.length === 0) return "No active learner memories yet."

  return memories
    .map((memory) => `- ${memory.type}: ${memory.title} (${memory.confidence})`)
    .join("\n")
}

function buildCurriculumViewFromSnapshot(snapshot: LearnerMemorySnapshot): LearnerCurriculumView {
  const activeMemories = snapshot.memories.filter((memory) => memory.status === "active")
  const sectionsByTitle = new Map<string, string[]>()

  for (const memory of activeMemories) {
    const title = learnerMemorySectionTitle(memory.type)
    const items = sectionsByTitle.get(title) ?? []
    items.push(formatLearnerMemoryItem(memory))
    sectionsByTitle.set(title, items)
  }

  return {
    workspace: parseWorkspaceView({
      label: "Learner memory",
      preferredSurfaces: ["chat", "curriculum", "editor", "figure", "question-set"],
    }),
    coldStart: activeMemories.length === 0,
    alignmentSummary: EMPTY_ALIGNMENT_SUMMARY,
    alignmentSummaryUnavailable: true,
    openFeedbackActions: [],
    actions: [],
    actionsUnavailable: true,
    constraintsSummary: activeMemories
      .filter((memory) => memory.type === "constraint")
      .map(formatLearnerMemoryItem),
    markdown: buildLearnerMemoryMarkdown(activeMemories),
    sections: Array.from(sectionsByTitle.entries()).map(([title, items]) => ({ title, items })),
  }
}

function normalizeLearnerSnapshotInput(input?: LearnerSnapshotInput) {
  return {
    persona: toLearnerPersona(input?.persona),
    sessionID: input?.sessionID,
  }
}

export async function loadLearnerSnapshot(directory: string, input?: LearnerSnapshotInput) {
  normalizeLearnerSnapshotInput(input)
  return requestLearnerSnapshot(directory)
}

export async function loadCurriculumView(directory: string, input?: LearnerSnapshotInput) {
  const snapshot = await loadLearnerSnapshot(directory, input)
  return buildCurriculumViewFromSnapshot(snapshot)
}

async function requestLearnerSnapshot(directory: string): Promise<LearnerMemorySnapshot> {
  return requireBuddyData(
    await getBuddyClient(directory).learner.memory.list({
      directory,
    }),
  )
}

function sortedRuntimeEntries(access: Record<string, "allow" | "deny">, action: "allow" | "deny") {
  return Object.entries(access)
    .filter(([, value]) => value === action)
    .map(([key]) => key)
    .toSorted((left, right) => left.localeCompare(right))
}

function buildSessionRuntimeView(sessionRuntime: TeachingStateSessionRuntimeResponse) {
  return {
    persona: sessionRuntime.persona,
    teachingWorkspaceState: sessionRuntime.teachingWorkspaceState,
    visibleSurfaces: [...sessionRuntime.ui.visibleSurfaces],
    defaultSurface: sessionRuntime.ui.defaultSurface,
    tools: {
      allow: sortedRuntimeEntries(sessionRuntime.access.tools, "allow"),
      deny: sortedRuntimeEntries(sessionRuntime.access.tools, "deny"),
    },
    skills: {
      allow: sortedRuntimeEntries(sessionRuntime.access.skills, "allow"),
      deny: sortedRuntimeEntries(sessionRuntime.access.skills, "deny"),
    },
    subagents: {
      allow: sortedRuntimeEntries(sessionRuntime.access.subagents, "allow"),
      deny: sortedRuntimeEntries(sessionRuntime.access.subagents, "deny"),
    },
  } satisfies SessionRuntimeView
}

export type LearnerSnapshotViews = {
  snapshot: LearnerMemorySnapshot
  curriculum: LearnerCurriculumView
  sessionRuntime?: SessionRuntimeView
}

export async function loadLearnerSnapshotViews(
  directory: string,
  input?: LearnerSnapshotInput,
): Promise<LearnerSnapshotViews> {
  const [snapshot, teachingState] = await Promise.all([
    loadLearnerSnapshot(directory, input),
    input?.sessionID
      ? loadTeachingSessionState(directory, input.sessionID)
      : Promise.resolve(undefined),
  ])

  return {
    snapshot,
    curriculum: buildCurriculumViewFromSnapshot(snapshot),
    ...(teachingState?.sessionRuntime ? { sessionRuntime: teachingState.sessionRuntime } : {}),
  }
}

export async function loadSessionRuntimeView(directory: string, input: { sessionID: string }) {
  const teachingState = await loadTeachingSessionState(directory, input.sessionID)
  return teachingState?.sessionRuntime
}

export async function loadWorkspaceMermaidArtifacts(
  directory: string,
): Promise<{ artifacts: WorkspaceMermaidArtifactView[] }> {
  const result = requireBuddyData(
    await getBuddyClient(directory).mermaidArtifacts.list({
      directory,
    }),
  )

  return {
    artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
  }
}

export async function loadWorkspaceQuestionSetArtifacts(
  directory: string,
): Promise<QuestionSetArtifactsListResponse> {
  return requireBuddyData(await getBuddyClient(directory).questionSetArtifacts.list())
}

export async function loadWorkspaceFlashcardDecks(
  directory: string,
): Promise<FlashcardDecksListResponse> {
  return requireBuddyData(await getBuddyClient(directory).flashcardDecks.list())
}

export type GoalArtifact = {
  id: string
  kind: "goal"
  workspaceId: string
  status: "active" | "archived"
  setId?: string
  scope: "course" | "topic"
  contextLabel: string
  learnerRequest: string
  rationaleSummary?: string
  assumptions: string[]
  openQuestions: string[]
  statement: string
  actionVerb: string
  task: string
  cognitiveLevel: string
  howToTest: string
  dependsOnGoalIds: string[]
  buildsOnGoalIds: string[]
  reinforcesGoalIds: string[]
  conceptTags: string[]
  workspaceRefs: string[]
  createdAt: string
  updatedAt: string
}

export async function loadLearnerGoals(directory: string): Promise<{ goals: GoalArtifact[] }> {
  const result = requireBuddyData(
    await getBuddyClient(directory).learner.memory.list({
      directory,
    }),
  )
  return {
    goals: result.memories
      .filter((memory) => memory.status === "active" && memory.type === "goal")
      .slice(0, DEFAULT_LEARNER_MEMORY_LIMIT)
      .map((memory) => ({
        id: memory.id,
        kind: "goal",
        workspaceId: memory.projectPath ?? directory,
        status: "active",
        scope: "topic",
        contextLabel: memory.title,
        learnerRequest: memory.body,
        assumptions: [],
        openQuestions: [],
        statement: memory.body,
        actionVerb: "learn",
        task: memory.body,
        cognitiveLevel: "Application",
        howToTest: "Use learner memory evidence to check whether this goal is still active.",
        dependsOnGoalIds: [],
        buildsOnGoalIds: [],
        reinforcesGoalIds: [],
        conceptTags: memory.tags,
        workspaceRefs: memory.projectPath ? [memory.projectPath] : [],
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
      })),
  }
}

export async function loadLearnerProgress(directory: string) {
  const result = requireBuddyData(
    await getBuddyClient(directory).learner.memory.list({
      directory,
    }),
  )
  return {
    progress: [
      {
        activeGoalCount: result.memories.filter(
          (memory) => memory.status === "active" && memory.type === "goal",
        ).length,
      },
    ],
  }
}

export async function loadProjectConfig(directory: string) {
  const config = requireBuddyData<ConfigGetResponses[200]>(
    await getBuddyClient(directory).config.get(),
  )
  return asRecord(config) ?? {}
}

export async function loadRawProjectConfig(directory: string) {
  const config = requireBuddyData<ConfigGetRawResponses[200]>(
    await getBuddyClient(directory).config.getRaw(),
  )
  return asRecord(config) ?? {}
}

export async function patchProjectConfig(directory: string, patch: Record<string, unknown>) {
  const result = await getBuddyClient(directory).config.update({
    body: patch,
  })
  return asRecord(requireBuddyData(result)) ?? {}
}

export async function loadGlobalConfig() {
  const config = requireBuddyData<GlobalConfigGetResponses[200]>(
    await getBuddyClient().global.config.get(),
  )
  return asRecord(config) ?? {}
}

export async function patchGlobalConfig(patch: Record<string, unknown>) {
  const result = await getBuddyClient().global.config.patch({
    body: patch,
  })
  return asRecord(requireBuddyData(result)) ?? {}
}

export async function saveProjectMcpConfig(
  directory: string,
  name: string,
  config: McpLocalConfig | McpRemoteConfig,
) {
  const result = await getBuddyClient(directory).config.mcp.put({
    name,
    body: config,
  })

  return asRecord(requireBuddyData(result)) ?? {}
}

export async function loadPersonaCatalog(directory?: string) {
  const result = await getBuddyClient(directory).config.personas()
  const personas = requireBuddyData<ConfigPersonasResponses[200]>(result)
  return personas.map((persona) => {
    const surfaces = parsePersonaSurfaces(persona.surfaces)
    return {
      id: persona.id,
      label: persona.label,
      description: persona.description,
      surfaces,
      defaultSurface: parseDefaultSurface(persona.defaultSurface, surfaces),
      hidden: persona.hidden,
    }
  })
}

export async function loadAgentCatalog(directory: string) {
  const agents = requireBuddyData(await getBuddyClient(directory).config.agents())
  return agents
    .map(parseAgentConfigEntry)
    .filter((agent): agent is AgentConfigOption => agent !== undefined)
}

export async function loadCommandCatalog(directory: string) {
  const result = await getBuddyClient(directory).command.list()
  const commands = requireBuddyData<CommandListResponses[200]>(result)
  return commands.map((command) => ({
    name: command.name,
    description: command.description,
    source: command.source,
  }))
}

export async function loadMcpStatus(directory: string) {
  const store = useChatStore.getState()
  const status = normalizeMcpStatusMap(
    requireBuddyData<McpStatusResponses[200]>(await getBuddyClient(directory).mcp.status()),
  )
  store.setMcpStatus(directory, status)
  return status
}

export async function connectMcpServer(directory: string, name: string) {
  requireBuddyData(
    await getBuddyClient(directory).mcp.connect({
      name,
    }),
  )
  return loadMcpStatus(directory)
}

export async function disconnectMcpServer(directory: string, name: string) {
  requireBuddyData(
    await getBuddyClient(directory).mcp.disconnect({
      name,
    }),
  )
  return loadMcpStatus(directory)
}

export async function authenticateMcpServer(directory: string, name: string) {
  requireBuddyData(
    await getBuddyClient(directory).mcp.auth.authenticate({
      name,
    }),
  )
  return loadMcpStatus(directory)
}

export type ProjectExplorerFileNode = FileNode
export type ProjectExplorerFileContent = FileContent
export type ProjectExplorerEditableFileState = ExplorerFileEditReadResponses[200]
export type ProjectExplorerEditableFileSaveResult = ExplorerFileEditSaveResponses[200]

export class ProjectExplorerFileVersionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProjectExplorerFileVersionConflictError"
  }
}

export async function listProjectExplorerDirectory(input: {
  directory: string
  path: string
}): Promise<ProjectExplorerFileNode[]> {
  const response = await getBuddyClient(input.directory).explorer.file.list({
    path: input.path,
  })
  return requireBuddyData<ProjectExplorerFileNode[]>(response)
}

export async function readProjectExplorerFile(input: {
  directory: string
  path: string
}): Promise<ProjectExplorerFileContent> {
  const response = await getBuddyClient(input.directory).explorer.file.read({
    path: input.path,
  })
  return requireBuddyData<ProjectExplorerFileContent>(response)
}

export async function readProjectExplorerEditableFile(input: {
  directory: string
  path: string
}): Promise<ProjectExplorerEditableFileState> {
  const response = await getBuddyClient(input.directory).explorer.file.edit.read({
    path: input.path,
  })
  return requireBuddyData<ProjectExplorerEditableFileState>(response)
}

export async function saveProjectExplorerEditableFile(input: {
  directory: string
  path: string
  content: string
  expectedVersion?: string | null
}): Promise<ProjectExplorerEditableFileSaveResult> {
  const response = await getBuddyClient(input.directory).explorer.file.edit.save({
    path: input.path,
    content: input.content,
    expectedVersion: input.expectedVersion,
  })
  if (response.response?.status === 409) {
    throw new ProjectExplorerFileVersionConflictError(buddyResultMessage(response))
  }
  return requireBuddyData<ProjectExplorerEditableFileSaveResult>(response)
}

export async function findWorkspaceFiles(
  directory: string,
  query: string,
  input?: {
    includeDirectories?: boolean
    limit?: number
  },
): Promise<FindFilesResponses[200]> {
  const FIND_FILES_DEFAULT_LIMIT = 20
  const FIND_FILES_LIMIT_MIN = 1
  const FIND_FILES_LIMIT_MAX = 200
  const search = query.trim()
  if (!search) return []

  const includeDirectories = input?.includeDirectories ?? true
  const requestedLimit = input?.limit ?? FIND_FILES_DEFAULT_LIMIT
  const limit = Math.max(FIND_FILES_LIMIT_MIN, Math.min(FIND_FILES_LIMIT_MAX, requestedLimit))
  const response = await getBuddyClient(directory).find.files({
    query: search,
    dirs: includeDirectories ? "true" : "false",
    limit,
  })

  return requireBuddyData<FindFilesResponses[200]>(response)
}

export function shouldDeferTranscriptReload(directory: string, sessionID?: string) {
  const state = useChatStore.getState()
  const snapshot = state.directories[directory]
  if (!snapshot?.isBusy) return false
  if (sessionID && snapshot.sessionID !== sessionID) return false
  return true
}
