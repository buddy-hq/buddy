import type {
  CommandListResponses,
  ConfigGetResponses,
  ConfigMcpPutData,
  ConfigPersonasResponses,
  ConfigUpdateData,
  FindFilesResponses,
  GlobalConfigGetResponses,
  GlobalConfigPatchData,
  GlobalNotebookHomeGetResponses,
  GlobalNotebookHomePutResponses,
  LearnerSnapshotResponses,
  McpLocalConfig,
  McpRemoteConfig,
  McpStatusResponses,
  OpenProjectsCreateResponses,
  PermissionListResponses,
  SessionMessagesResponses,
  SessionTeachingStateResponses,
  ProviderAuthMethod,
  ProviderAuthResponse,
  ProviderListResponse,
} from "@buddy/sdk"
import { useChatStore } from "./chat-store"
import type {
  MessageWithParts,
  McpStatusMap,
  PermissionRequest,
  ProviderCatalogState,
  ProviderInfo,
  SessionInfo,
} from "./chat-types"
import type { TeachingIntent, TeachingPromptContext } from "./teaching-runtime"
import { requestJson, stringifyError } from "../lib/api-client"
import { getBuddyClient, requireBuddyData, buddyResultMessage } from "../lib/buddy-client"
import { retry } from "../lib/retry"
import type { PromptFilePart, PromptSubmissionPart } from "../components/prompt/prompt-types"
import {
  BUSY_SESSION_STATUS,
  IDLE_SESSION_STATUS,
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
    intent: TeachingIntent
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

export type LearnerRuntimeCapabilitiesView = {
  persona: string
  intent: TeachingIntent
  workspaceState: "chat" | "interactive"
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
    prefer: string[]
    allow: string[]
    deny: string[]
  }
}

export type WorkspaceMermaidArtifactView = {
  artifactID: string
  kind: "mermaid.v1"
  diagramType: string
  alt: string
  caption?: string
  repairAttempts: number
  repairLog: string[]
  source: string
  createdAt: string
}

export type WorkspaceQuestionSetArtifactView = {
  artifactID: string
  kind: "question-set.v1"
  groupType: "quiz" | "practice" | "assessment"
  title: string
  createdAt: string
  questions: Array<{
    id: string
  }>
}

export type PromptCommandOption = {
  name: string
  description?: string
  source?: "command" | "mcp" | "skill"
}

export type TeachingSessionSnapshot = {
  sessionId: string
  persona: string
  intent: TeachingIntent
  currentSurface: string
  workspaceState: "chat" | "interactive"
  focusGoalIds: string[]
  lastLlmOutbound?: TeachingLlmOutboundSnapshot
  llmOutboundHistory?: TeachingLlmOutboundSnapshot[]
}

export type TeachingLlmOutboundSnapshot = {
  kind: "message" | "command"
  createdAt: string
  payload: Record<string, unknown>
  fullSystemPrompt?: string
}

const BUDDY_PERSONA_DEFAULT_ORDER = ["buddy", "code-buddy", "math-buddy"] as const

function normalizeProjectDirectory(directory: string) {
  const normalized = directory.trim().replace(/\/+$/, "")
  if (!normalized || normalized === "/") {
    return undefined
  }
  return normalized
}

function normalizeDirectoryList(directories: string[]) {
  return Array.from(
    new Set(directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
  ) as string[]
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

  for (const personaID of BUDDY_PERSONA_DEFAULT_ORDER) {
    if (selectablePersonas.some((persona) => persona.id === personaID)) {
      return personaID
    }
  }

  return selectablePersonas[0]?.id
}

type RawProvider = ProviderListResponse["all"][number]
type RawProviderModel = RawProvider["models"][string]
type LearnerPersona = "buddy" | "code-buddy" | "math-buddy"

const LEARNER_PERSONAS = ["buddy", "code-buddy", "math-buddy"] as const
const DEFAULT_PERSONA_SURFACE: PersonaConfigOption["defaultSurface"] = "curriculum"
const EMPTY_ALIGNMENT_SUMMARY: LearnerCurriculumView["alignmentSummary"] = {
  records: [],
  incompleteGoalIds: [],
  recommendations: [],
}
const SESSION_NOT_FOUND_ERROR = "Session not found"
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
const latestSessionListRequestByDirectory = new Map<string, number>()
const latestTranscriptRequestByDirectory = new Map<string, number>()
type DirectorySessionLoadResult = {
  directory: string
  info: SessionInfo | undefined
}
const pendingDirectorySessionLoads = new Map<string, Promise<DirectorySessionLoadResult>>()

class RetryableTranscriptReloadError extends Error {
  constructor(cause: unknown) {
    super("Retryable transcript reload")
    this.name = "RetryableTranscriptReloadError"
    this.cause = cause
  }
}

function toLearnerPersona(persona?: string): LearnerPersona | undefined {
  if (!persona) return undefined
  if (LEARNER_PERSONAS.includes(persona as LearnerPersona)) {
    return persona as LearnerPersona
  }
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
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

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

function parseToolPermissions(value: unknown): Record<string, "allow" | "deny"> {
  const record = asRecord(value)
  if (!record) return {}

  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, "allow" | "deny"] => entry[1] === "allow" || entry[1] === "deny",
    ),
  )
}

function parseSubagentPermissions(value: unknown): Record<string, "allow" | "deny" | "prefer"> {
  const record = asRecord(value)
  if (!record) return {}

  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, "allow" | "deny" | "prefer"] =>
        entry[1] === "allow" || entry[1] === "deny" || entry[1] === "prefer",
    ),
  )
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

function parseOpenFeedbackActions(
  openFeedback: unknown,
): LearnerCurriculumView["openFeedbackActions"] {
  if (!Array.isArray(openFeedback)) return []

  return openFeedback
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      feedbackId: asString(item.id),
      goalIds: asStringArray(item.goalIds),
      requiredAction: asString(item.requiredAction, "Follow up on current gap"),
      scaffoldingLevel: asString(item.scaffoldingLevel, "guided"),
      pattern: asString(item.pattern) || undefined,
      createdAt: asString(item.createdAt),
    }))
    .filter((item) => item.feedbackId.length > 0)
}

function parseSections(sections: unknown): LearnerCurriculumView["sections"] {
  if (!Array.isArray(sections)) return []
  return sections
    .map((section) => asRecord(section))
    .filter((section): section is Record<string, unknown> => section !== undefined)
    .map((section) => ({
      title: asString(section.title),
      items: asStringArray(section.items),
    }))
    .filter((section) => section.title.length > 0)
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
          (provider as { source?: unknown }).source,
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
  return requireBuddyData<GlobalNotebookHomeGetResponses[200]>(
    await getBuddyClient().global.notebookHome.get(),
  ) as NotebookHomeState
}

export async function saveNotebookHome(directory: string) {
  const nextDirectory = directory.trim()
  if (!nextDirectory) {
    throw new Error("Notebook home is required")
  }

  return requireBuddyData<GlobalNotebookHomePutResponses[200]>(
    await getBuddyClient().global.notebookHome.put({ directory: nextDirectory }),
  ) as NotebookHomeState
}

export async function preloadProjectSessions(directories: string[]) {
  const unique = Array.from(
    new Set(directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
  ) as string[]
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
  const requestSequence = (latestSessionListRequestByDirectory.get(directory) ?? 0) + 1
  latestSessionListRequestByDirectory.set(directory, requestSequence)

  try {
    const sessions = requireBuddyData<SessionInfo[]>(
      await getBuddyClient(directory).session.list({ directory }),
    )
    if (latestSessionListRequestByDirectory.get(directory) !== requestSequence) {
      return sessions
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
  const statusBySession = await requestJson<Record<string, unknown>>(
    directory,
    "/api/session/status",
  )
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

export async function loadMessages(directory: string, sessionID: string) {
  const store = useChatStore.getState()
  const requestSequence = (latestTranscriptRequestByDirectory.get(directory) ?? 0) + 1
  latestTranscriptRequestByDirectory.set(directory, requestSequence)
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
    const requests = requireBuddyData<PermissionListResponses[200]>(
      await getBuddyClient(directory).permission.list(),
    ) as PermissionRequest[]
    store.setPendingPermissions(directory, requests)
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

async function createSession(directory: string) {
  const pendingCreation = pendingSessionCreations.get(directory)
  if (pendingCreation) {
    return pendingCreation
  }

  const store = useChatStore.getState()
  const createPromise = (async () => {
    const info = requireBuddyData<SessionInfo>(await getBuddyClient(directory).session.create())
    store.setSessionInfo(directory, info)
    store.setMessages(directory, info.id, [])
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
      if (readyState?.isReady && readyState.isDraft) {
        store.clearDirectoryError(targetDirectory)
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
        return {
          directory: targetDirectory,
          info: readyInfo,
        }
      }

      store.setDirectoryReady(targetDirectory, false)
      store.clearDirectoryError(targetDirectory)

      const state = useChatStore.getState()
      const current = state.directories[targetDirectory]
      const preserveDraft = current?.isDraft === true
      const storedSession = preserveDraft
        ? undefined
        : (current?.sessionID ?? state.lastSessionByDirectory[targetDirectory])
      const sessions = await loadSessions(targetDirectory)
      const sessionByID = new Map(sessions.map((session) => [session.id, session]))

      let info: SessionInfo | undefined
      if (storedSession && sessionByID.has(storedSession)) {
        info = sessionByID.get(storedSession)
      }

      if (!info && !preserveDraft) {
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
        store.setSessionInfo(targetDirectory, info)
        await loadMessages(targetDirectory, info.id)
      } else {
        // The persisted active session ID can point to a session from a previous runtime.
        // If no valid session can be resolved, always reset to a fresh draft.
        store.startSessionDraft(targetDirectory)
      }

      store.setDirectoryReady(targetDirectory, true)
      void Promise.all([
        loadSessionStatuses(targetDirectory).catch(() => undefined),
        loadPermissions(targetDirectory),
        loadProviderCatalog(targetDirectory),
        loadMcpStatus(targetDirectory).catch(() => undefined),
      ]).catch(() => undefined)
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
    store.setSessionInfo(directory, existing)
  } else {
    const info = requireBuddyData<SessionInfo>(
      await getBuddyClient(directory).session.get({
        sessionID,
      }),
    )
    store.setSessionInfo(directory, info)
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
      store.startSessionDraft(directory)
      store.clearDirectoryError(directory)
      return
    }

    store.setSessionInfo(directory, fallback)
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
  store.startSessionDraft(directory)
}

async function resolveSessionForSend(directory: string) {
  const store = useChatStore.getState()
  const existing = store.directories[directory]?.sessionID
  if (existing) return existing

  const created = await createSession(directory)
  void loadSessions(directory).catch(() => undefined)
  return created.id
}

export async function sendPrompt(
  directory: string,
  content: string,
  input?: {
    parts?: PromptSubmissionPart[]
    persona?: string
    intent: TeachingIntent
    focusGoalIds?: string[]
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    variant?: string
    teaching?: TeachingPromptContext
  },
) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  let sessionID: string | undefined

  try {
    const resolvedSessionID = await resolveSessionForSend(directory)
    sessionID = resolvedSessionID
    store.applySessionStatus(directory, resolvedSessionID, BUSY_SESSION_STATUS)

    const intent = input?.intent ?? "auto"
    const promptBody = {
      content,
      ...(input?.parts && input.parts.length > 0 ? { parts: input.parts } : {}),
      ...(input?.persona ? { persona: input.persona } : {}),
      intent,
      ...(input?.focusGoalIds && input.focusGoalIds.length > 0
        ? { focusGoalIds: input.focusGoalIds }
        : {}),
      ...(input?.agent ? { agent: input.agent } : {}),
      ...(input?.model ? { model: input.model } : {}),
      ...(input?.variant ? { variant: input.variant } : {}),
      ...(input?.teaching ? { teaching: input.teaching } : {}),
    }

    const postPrompt = async (targetSessionID: string) => {
      requireBuddyData(
        await getBuddyClient(directory).session.prompt({
          sessionID: targetSessionID,
          body: promptBody,
        }),
      )
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
      store.startSessionDraft(directory)
      const recoveredSessionID = await resolveSessionForSend(directory)
      sessionID = recoveredSessionID
      store.applySessionStatus(directory, recoveredSessionID, BUSY_SESSION_STATUS)

      console.warn("[chat-action] prompt.retry-missing-session", {
        directory,
        previousSessionID: resolvedSessionID,
        recoveredSessionID,
      })

      await postPrompt(recoveredSessionID)
      void loadSessions(directory).catch(() => undefined)
    }

    console.info("[chat-action] prompt.accepted", { directory, sessionID })
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
      if (missingSession) {
        store.startSessionDraft(directory)
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
    intent: TeachingIntent
    agent?: string
    model?: {
      providerID: string
      modelID: string
    }
    variant?: string
  },
) {
  const store = useChatStore.getState()
  store.clearDirectoryError(directory)
  let sessionID: string | undefined

  try {
    const resolvedSessionID = await resolveSessionForSend(directory)
    sessionID = resolvedSessionID
    store.applySessionStatus(directory, resolvedSessionID, BUSY_SESSION_STATUS)

    const intent = input?.intent ?? "auto"
    const commandBody = {
      command,
      arguments: argumentsText,
      ...(input?.parts && input.parts.length > 0 ? { parts: input.parts } : {}),
      ...(input?.persona ? { persona: input.persona } : {}),
      intent,
      ...(input?.agent ? { agent: input.agent } : {}),
      ...(input?.model ? { model: `${input.model.providerID}/${input.model.modelID}` } : {}),
      ...(input?.variant ? { variant: input.variant } : {}),
    }

    const postCommand = async (targetSessionID: string) => {
      requireBuddyData(
        await getBuddyClient(directory).session.command({
          sessionID: targetSessionID,
          body: commandBody,
        }),
      )
    }

    try {
      await postCommand(resolvedSessionID)
    } catch (error) {
      const shouldRecover = await shouldRecoverMissingSession(directory, resolvedSessionID, error)
      if (!shouldRecover) {
        throw error
      }

      store.applySessionStatus(directory, resolvedSessionID, IDLE_SESSION_STATUS)
      store.startSessionDraft(directory)
      const recoveredSessionID = await resolveSessionForSend(directory)
      sessionID = recoveredSessionID
      store.applySessionStatus(directory, recoveredSessionID, BUSY_SESSION_STATUS)
      await postCommand(recoveredSessionID)
      void loadSessions(directory).catch(() => undefined)
    }
  } catch (error) {
    const missingSession = isMissingSessionError(error)
    if (sessionID) {
      store.applySessionStatus(directory, sessionID, IDLE_SESSION_STATUS)
      if (missingSession) {
        store.startSessionDraft(directory)
      } else {
        void loadMessages(directory, sessionID).catch(() => undefined)
      }
      void loadSessions(directory).catch(() => undefined)
    }

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

  return result.data as SessionTeachingStateResponses[200] as TeachingSessionSnapshot
}

export async function abortPrompt(directory: string) {
  const store = useChatStore.getState()
  const state = store.directories[directory]
  const sessionID = state?.sessionID
  if (!sessionID) {
    return false
  }

  try {
    const aborted = requireBuddyData(
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
    // Always resync once after abort attempt so UI doesn't stay stale if server state drifted.
    void loadMessages(directory, sessionID).catch(() => undefined)
    void loadSessions(directory).catch(() => undefined)
    return aborted
  } catch (error) {
    store.setDirectoryError(directory, stringifyError(error))
    throw error
  }
}

export async function resyncDirectory(directory: string) {
  await loadSessions(directory)
  await loadSessionStatuses(directory).catch(() => undefined)
  await loadPermissions(directory)
  await loadProviderCatalog(directory)
  await loadMcpStatus(directory).catch(() => undefined)
  const sessionID = useChatStore.getState().directories[directory]?.sessionID
  if (!sessionID) return
  if (shouldDeferTranscriptReload(directory, sessionID)) return
  await loadMessages(directory, sessionID)
  await loadSessionStatuses(directory).catch(() => undefined)
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

export async function loadCurriculumView(
  directory: string,
  input?: {
    persona?: string
    intent?: TeachingIntent
    sessionID?: string
  },
) {
  const intent = input?.intent ?? "auto"

  const snapshot = requireBuddyData<LearnerSnapshotResponses[200]>(
    await getBuddyClient(directory).learner.snapshot({
      persona: toLearnerPersona(input?.persona),
      intent,
      sessionId: input?.sessionID,
    }),
  )

  return {
    workspace: parseWorkspaceView(snapshot.workspace),
    coldStart: snapshot.goals.length === 0,
    alignmentSummary: EMPTY_ALIGNMENT_SUMMARY,
    alignmentSummaryUnavailable: true,
    openFeedbackActions: parseOpenFeedbackActions(snapshot.openFeedback),
    actions: [],
    actionsUnavailable: true,
    constraintsSummary: snapshot.constraintsSummary,
    markdown: snapshot.markdown,
    sections: parseSections(snapshot.sections),
  }
}

function sortedPermissionKeys(
  permissions: Record<string, "allow" | "deny">,
  action: "allow" | "deny",
) {
  return Object.entries(permissions)
    .filter(([, value]) => value === action)
    .map(([key]) => key)
    .toSorted((left, right) => left.localeCompare(right))
}

function sortedSubagentKeys(
  permissions: Record<string, "allow" | "deny" | "prefer">,
  action: "allow" | "deny" | "prefer",
) {
  return Object.entries(permissions)
    .filter(([, value]) => value === action)
    .map(([key]) => key)
    .toSorted((left, right) => left.localeCompare(right))
}

export async function loadRuntimeCapabilities(
  directory: string,
  input?: {
    persona?: string
    intent?: TeachingIntent
    sessionID?: string
  },
) {
  const requestedIntent = input?.intent ?? "auto"

  const snapshot = requireBuddyData<LearnerSnapshotResponses[200]>(
    await getBuddyClient(directory).learner.snapshot({
      persona: toLearnerPersona(input?.persona),
      intent: requestedIntent,
      sessionId: input?.sessionID,
    }),
  )

  const runtimeProfile = asRecord(snapshot.runtimeProfile)
  const envelope = asRecord(runtimeProfile?.capabilityEnvelope)
  if (!runtimeProfile || !envelope) {
    throw new Error("Runtime capability profile is unavailable for this session.")
  }

  const visibleSurfaces = asStringArray(envelope.visibleSurfaces).toSorted((left, right) =>
    left.localeCompare(right),
  )
  const tools = parseToolPermissions(envelope.tools)
  const skills = parseToolPermissions(envelope.skills)
  const subagents = parseSubagentPermissions(envelope.subagents)

  return {
    persona: asString(runtimeProfile.persona, toLearnerPersona(input?.persona) ?? "buddy"),
    intent: snapshot.runtimeContext?.intent ?? requestedIntent,
    workspaceState: snapshot.runtimeContext?.workspaceState ?? "chat",
    visibleSurfaces,
    defaultSurface: asString(
      envelope.defaultSurface,
      visibleSurfaces[0] ?? DEFAULT_PERSONA_SURFACE,
    ),
    tools: {
      allow: sortedPermissionKeys(tools, "allow"),
      deny: sortedPermissionKeys(tools, "deny"),
    },
    skills: {
      allow: sortedPermissionKeys(skills, "allow"),
      deny: sortedPermissionKeys(skills, "deny"),
    },
    subagents: {
      prefer: sortedSubagentKeys(subagents, "prefer"),
      allow: sortedSubagentKeys(subagents, "allow"),
      deny: sortedSubagentKeys(subagents, "deny"),
    },
  } satisfies LearnerRuntimeCapabilitiesView
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
): Promise<{ artifacts: WorkspaceQuestionSetArtifactView[] }> {
  const result = await requestJson<{ artifacts: WorkspaceQuestionSetArtifactView[] }>(
    directory,
    "/api/question-set-artifacts",
  )

  return {
    artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
  }
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
    await getBuddyClient(directory).learner.artifacts({
      kind: "goal",
      status: "active",
    }),
  )
  return {
    goals: result.artifacts as GoalArtifact[],
  }
}

export async function loadLearnerProgress(directory: string) {
  const result = requireBuddyData(await getBuddyClient(directory).learner.snapshot())
  return {
    progress: [{ activeGoalCount: Array.isArray(result.goals) ? result.goals.length : 0 }],
  }
}

export async function loadProjectConfig(directory: string) {
  return requireBuddyData<ConfigGetResponses[200]>(
    await getBuddyClient(directory).config.get(),
  ) as Record<string, unknown>
}

export async function patchProjectConfig(directory: string, patch: Record<string, unknown>) {
  const configPatch = patch as NonNullable<ConfigUpdateData["body"]>
  const result = await getBuddyClient(directory).config.update({
    body: configPatch,
  })
  return requireBuddyData(result) as Record<string, unknown>
}

export async function loadGlobalConfig() {
  return requireBuddyData<GlobalConfigGetResponses[200]>(
    await getBuddyClient().global.config.get(),
  ) as Record<string, unknown>
}

export async function patchGlobalConfig(patch: NonNullable<GlobalConfigPatchData["body"]>) {
  const result = await getBuddyClient().global.config.patch(patch)
  return requireBuddyData(result) as Record<string, unknown>
}

export async function saveProjectMcpConfig(
  directory: string,
  name: string,
  config: Record<string, unknown>,
) {
  const body = config as ConfigMcpPutData["body"] extends infer T
    ? T extends McpLocalConfig | McpRemoteConfig
      ? T
      : never
    : never
  const result = await getBuddyClient(directory).config.mcp.put({
    name,
    body,
  })

  return requireBuddyData(result) as Record<string, unknown>
}

export async function loadPersonaCatalog(directory: string) {
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

export async function findWorkspaceFiles(
  directory: string,
  query: string,
  input?: {
    includeDirectories?: boolean
    limit?: number
  },
): Promise<FindFilesResponses[200]> {
  const search = query.trim()
  if (!search) return [] as string[]

  const includeDirectories = input?.includeDirectories ?? true
  const response = await getBuddyClient(directory).find.files({
    query: search,
    dirs: includeDirectories ? "true" : "false",
    limit: input?.limit ?? 20,
  })

  return requireBuddyData<FindFilesResponses[200]>(response)
}

export function shouldDeferTranscriptReload(directory: string, sessionID?: string) {
  const state = useChatStore.getState()
  const snapshot = state.directories[directory]
  if (!snapshot?.isBusy) return false
  if (state.streamStatus !== "connected") return false
  if (sessionID && snapshot.sessionID !== sessionID) return false
  return true
}
