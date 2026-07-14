import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useShallow } from "zustand/react/shallow"
import { language } from "@/context/language"
import { useChatStore, type ChatStore } from "@/state/chat-store"
import {
  getSelectedAgentKey,
  getSelectedModelKey,
  getSelectedVariantKey,
  useModelSelectionStore,
  type ModelSelectionStore,
} from "@/state/model-selection-store"
import { useUiPreferences, type UiPreferencesStore } from "@/state/ui-preferences"
import {
  useTeachingRuntime,
  teachingSelectionKey,
  type TeachingLanguage,
  type TeachingRuntimeState,
} from "@/state/teaching-runtime"
import { usePromptStore, getPromptScopeKey, type PromptStore } from "@/state/prompt-store"
import {
  directoryPermissionsQueryOptions,
  directoryQuestionsQueryOptions,
  directorySessionsQueryOptions,
} from "@/state/directory-chat-query"
import {
  applyTranscriptMessageRemoved,
  applyTranscriptMessageUpdated,
  applyTranscriptPartDelta,
  applyTranscriptPartRemoved,
  applyTranscriptPartUpdated,
  useTranscriptSessionMessages,
  useTranscriptSessionMeta,
} from "@/state/transcript-repository"
import { getSessionFamily, type SessionFamily } from "../session-family"
import { isSessionWorking } from "@/state/session-status"
import { modelSelectionKey, parseConfiguredModel } from "./chat-prompt-helpers"
import { formatSessionTitle } from "@/lib/session-title"
import type {
  MessageInfo,
  MessagePart,
  MessageWithParts,
  ProviderInfo,
  ProviderModelInfo,
  SessionInfo,
  SessionStatusInfo,
} from "@/state/chat-types"
import type { AgentConfigOption, PersonaConfigOption } from "@/state/chat-actions"
import {
  getUsableProviders,
  resolveAutoModelSelection,
  resolveUsableModelSelection,
  type ProviderModelSelection,
} from "@/lib/provider-catalog"
import { OPENCODE_PROVIDER_ID } from "@/lib/provider-ids"
import { resolveCurrentAgent } from "./agent-catalog"

const EMPTY_LIST: never[] = []
const EMPTY_RECORD: Record<string, never> = {}
const EMPTY_SESSIONS: SessionInfo[] = []
const EMPTY_SESSION_STATUS: Record<string, SessionStatusInfo> = {}
const THINKING_DEFAULT_KEY = "default" as const
const THINKING_LEVEL_ORDER = ["none", "low", "medium", "high", "xhigh"] as const
type ThinkingLevel = (typeof THINKING_LEVEL_ORDER)[number]
const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Xhigh",
}

function asThinkingLevel(value: string): ThinkingLevel | undefined {
  const normalized = value.trim().toLowerCase()
  if (
    normalized !== "none" &&
    normalized !== "low" &&
    normalized !== "medium" &&
    normalized !== "high" &&
    normalized !== "xhigh"
  ) {
    return undefined
  }
  return normalized
}

function thinkingLevelRank(value: string) {
  const normalized = asThinkingLevel(value)
  if (!normalized) return Number.POSITIVE_INFINITY
  return THINKING_LEVEL_ORDER.indexOf(normalized)
}

function formatThinkingLabel(value: string) {
  const normalized = asThinkingLevel(value)
  if (normalized) return THINKING_LEVEL_LABELS[normalized]
  if (!value) return value
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`
}

function sortThinkingVariants(variants: string[]) {
  return variants.slice().toSorted((left, right) => {
    const leftRank = thinkingLevelRank(left)
    const rightRank = thinkingLevelRank(right)
    const leftKnown = Number.isFinite(leftRank)
    const rightKnown = Number.isFinite(rightRank)
    if (leftKnown && rightKnown && leftRank !== rightRank) {
      return leftRank - rightRank
    }
    if (leftKnown && !rightKnown) return -1
    if (!leftKnown && rightKnown) return 1
    return left.localeCompare(right)
  })
}

function readSeededSessionList(directory: string) {
  const sessions = useChatStore.getState().directories[directory]?.sessions
  return sessions && sessions.length > 0 ? sessions : undefined
}

function readSeededPendingPermissions(directory: string) {
  const pendingPermissions = useChatStore.getState().directories[directory]?.pendingPermissions
  return pendingPermissions && pendingPermissions.length > 0 ? pendingPermissions : undefined
}

function readSeededPendingQuestions(directory: string) {
  const pendingQuestions = useChatStore.getState().directories[directory]?.pendingQuestions
  return pendingQuestions && pendingQuestions.length > 0 ? pendingQuestions : undefined
}

function isModelSelection(
  value: ReturnType<typeof parseConfiguredModel>,
): value is NonNullable<ReturnType<typeof parseConfiguredModel>> {
  return value !== undefined
}

export function resolveVisibleModelKeys(input: {
  usableProviders: ProviderInfo[]
  autoModelSelection: ProviderModelSelection | undefined
  selectedModelOverrideKey: string | undefined
}) {
  const visible = new Set<string>()

  for (const provider of input.usableProviders) {
    for (const model of provider.models) {
      const key = modelSelectionKey({ providerID: provider.id, modelID: model.id })
      visible.add(key)
    }
  }

  if (input.autoModelSelection) visible.add(modelSelectionKey(input.autoModelSelection))
  if (input.selectedModelOverrideKey) visible.add(input.selectedModelOverrideKey)

  return visible
}

export function resolveProviderModelGroup(provider: ProviderInfo) {
  if (provider.id === OPENCODE_PROVIDER_ID && !provider.connected) {
    return language.t("prompt.toolbar.groups.freeModels")
  }
  return provider.name
}

function resolveConfiguredAgentVariant(input: {
  agent: AgentConfigOption | undefined
  model:
    | {
        providerID: string
        modelID: string
        variants: string[]
      }
    | undefined
}) {
  if (!input.agent?.variant) return undefined
  if (!input.agent.model) return undefined
  if (!input.model) return undefined
  if (input.agent.model.providerID !== input.model.providerID) return undefined
  if (input.agent.model.modelID !== input.model.modelID) return undefined
  if (!input.model.variants.includes(input.agent.variant)) return undefined
  return input.agent.variant
}

function resolveSelectedVariant(input: {
  selected: string | null | undefined
  configured: string | undefined
  variants: string[]
}) {
  if (input.selected === null) return undefined
  if (input.selected && input.variants.includes(input.selected)) return input.selected
  if (input.configured && input.variants.includes(input.configured)) return input.configured
  return undefined
}

type UseDirectoryChatStateProps = {
  decodedDirectory: string
  agentCatalog: AgentConfigOption[]
  defaultAgent?: string
  configuredModel: { providerID: string; modelID: string } | undefined
  autoCompactionEnabled: boolean
  personaCatalog: PersonaConfigOption[]
}

type DirectoryChatStoreSlice = Pick<
  ChatStore,
  | "streamStatus"
  | "setStreamStatus"
  | "setActiveDirectory"
  | "applySessionUpdated"
  | "applySessionStatus"
  | "applyPermissionAsked"
  | "applyPermissionReplied"
  | "applyQuestionAsked"
  | "applyQuestionResolved"
  | "clearDirectoryError"
  | "setDirectoryError"
>

type DirectoryChatTranscriptActionSlice = {
  applyMessageUpdated: (directory: string, info: MessageInfo) => void
  applyMessageRemoved: (directory: string, input: { sessionID: string; messageID: string }) => void
  applyPartUpdated: (directory: string, part: MessagePart) => void
  applyPartRemoved: (
    directory: string,
    input: { sessionID: string; messageID: string; partID: string },
  ) => void
  applyPartDelta: (
    directory: string,
    input: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
  ) => void
}

type DirectoryChatUiSlice = Pick<
  UiPreferencesStore,
  | "leftSidebarOpen"
  | "pinnedByDirectory"
  | "unreadByDirectory"
  | "setLeftSidebarOpen"
  | "togglePinned"
  | "markUnread"
  | "clearUnread"
  | "clearDirectorySessionState"
>

type DirectoryChatModelSlice = Pick<
  ModelSelectionStore,
  | "setSelectedAgent"
  | "setSelectedModel"
  | "setSelectedVariant"
  | "pushRecentModelKey"
  | "restoreSessionSelection"
>

type DirectoryChatTeachingSlice = Pick<TeachingRuntimeState, "setSessionPersona">

type DirectoryChatModelOption = {
  key: string
  label: string
  group?: string
  disabled?: boolean
  acceptsImages: boolean
}

type DirectoryChatThinkingOption = {
  key: string
  label: string
}

export type DirectoryChatState = DirectoryChatStoreSlice &
  DirectoryChatTranscriptActionSlice &
  DirectoryChatUiSlice &
  DirectoryChatModelSlice &
  DirectoryChatTeachingSlice & {
    setLeftSidebarWidth: UiPreferencesStore["setChatLeftSidebarWidth"]
    setPromptDraft: PromptStore["replaceDraft"]
    clearPromptDraft: PromptStore["clearDraft"]
    migrateWorkspaceDraft: PromptStore["migrateWorkspaceDraft"]
    migrateWorkspaceModelSelection: ModelSelectionStore["migrateWorkspaceSelection"]
    removePromptDraft: PromptStore["removeSessionDraft"]
    sessionID: ChatStore["directories"][string]["sessionID"] | undefined
    promptKey: string
    sessionTitle: string
    parentSession: SessionInfo | undefined
    sessions: SessionInfo[]
    sessionFamily: SessionFamily
    sessionKey: string
    leftSidebarWidth: UiPreferencesStore["chatLeftSidebarWidth"]
    leftSidebarDisplayWidth: number
    leftSidebarMaxWidth: number
    sidebarDirectories: string[]
    validOpenProjects: string[]
    hasRegisteredProject: boolean
    selectedModelKey: string
    currentAgentName: string | undefined
    selectedModelOverrideKey: string | undefined
    selectedVariantKey: string | null | undefined
    effectiveModelSelection: ProviderModelSelection | undefined
    effectiveModelInfo: ProviderModelInfo | undefined
    selectedModelAcceptsImages: boolean
    selectedThinking: string
    thinkingOptions: DirectoryChatThinkingOption[]
    modelOptions: DirectoryChatModelOption[]
    primaryPersonaOptions: PersonaConfigOption[]
    teachingWorkspace: TeachingRuntimeState["workspaceBySession"][string] | undefined
    storedPersona: string
    preferredLanguage: TeachingLanguage
    selectedPersona: string
    selectedPersonaSupportsEditor: boolean
    isInteractiveMode: boolean
    autoCompactionEnabled: boolean
    isBusy: ChatStore["directories"][string]["isBusy"]
    isTurnActive: boolean
    isReady: ChatStore["directories"][string]["isReady"]
    loadingSessionID: ChatStore["directories"][string]["loadingSessionID"]
    error: ChatStore["directories"][string]["error"] | undefined
    pendingPermissions: ChatStore["directories"][string]["pendingPermissions"]
    pendingQuestions: ChatStore["directories"][string]["pendingQuestions"]
    messages: MessageWithParts[]
    providers: ChatStore["directories"][string]["providers"]
    sessionsByDirectory: Record<string, SessionInfo[]>
    sessionStatusByDirectory: Record<string, Record<string, SessionStatusInfo>>
    connectedMcpCount: number
    hasMcpError: boolean
    mcpEntries: Array<[string, ChatStore["directories"][string]["mcpStatus"][string]]>
  }

export function useDirectoryChatState(props: UseDirectoryChatStateProps): DirectoryChatState {
  const { decodedDirectory } = props

  // ── Chat store ─────────────────────────────────────────────────────────────
  const openProjects = useChatStore(useShallow((state) => state.openProjects))
  const streamStatus = useChatStore((state) => state.streamStatus)
  const directoryState = useChatStore((state) =>
    decodedDirectory ? state.directories[decodedDirectory] : undefined,
  )
  const setActiveDirectory = useChatStore((state) => state.setActiveDirectory)
  const setStreamStatus = useChatStore((state) => state.setStreamStatus)
  const applySessionUpdated = useChatStore((state) => state.applySessionUpdated)
  const applySessionStatus = useChatStore((state) => state.applySessionStatus)
  const applyPermissionAsked = useChatStore((state) => state.applyPermissionAsked)
  const applyPermissionReplied = useChatStore((state) => state.applyPermissionReplied)
  const applyQuestionAsked = useChatStore((state) => state.applyQuestionAsked)
  const applyQuestionResolved = useChatStore((state) => state.applyQuestionResolved)
  const clearDirectoryError = useChatStore((state) => state.clearDirectoryError)
  const setDirectoryError = useChatStore((state) => state.setDirectoryError)

  // ── UI preferences ─────────────────────────────────────────────────────────
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const leftSidebarWidth = useUiPreferences((state) => state.chatLeftSidebarWidth)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const setLeftSidebarWidth = useUiPreferences((state) => state.setChatLeftSidebarWidth)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const clearDirectorySessionState = useUiPreferences((state) => state.clearDirectorySessionState)

  // ── Teaching runtime ───────────────────────────────────────────────────────
  const setSessionPersona = useTeachingRuntime((state) => state.setSessionPersona)

  // ── Prompt store ───────────────────────────────────────────────────────────
  const sessionID = directoryState?.sessionID
  const sessionKey = useMemo(
    () => (decodedDirectory ? teachingSelectionKey(decodedDirectory, sessionID) : ""),
    [decodedDirectory, sessionID],
  )
  const storedPersonaForSession = useTeachingRuntime((state) =>
    sessionKey ? state.selectedPersonaBySession[sessionKey] : undefined,
  )
  const preferredLanguageForSession = useTeachingRuntime((state) =>
    sessionKey ? state.preferredLanguageBySession[sessionKey] : undefined,
  )
  const teachingWorkspace = useTeachingRuntime((state) =>
    sessionKey ? state.workspaceBySession[sessionKey] : undefined,
  )
  const promptKey = useMemo(
    () => getPromptScopeKey(decodedDirectory, sessionID),
    [decodedDirectory, sessionID],
  )
  const setSelectedAgent = useModelSelectionStore((state) => state.setSelectedAgent)
  const setSelectedModel = useModelSelectionStore((state) => state.setSelectedModel)
  const setSelectedVariant = useModelSelectionStore((state) => state.setSelectedVariant)
  const pushRecentModelKey = useModelSelectionStore((state) => state.pushRecentModelKey)
  const restoreSessionSelection = useModelSelectionStore((state) => state.restoreSessionSelection)
  const migrateWorkspaceModelSelection = useModelSelectionStore(
    (state) => state.migrateWorkspaceSelection,
  )
  const selectedModelOverrideKey = useModelSelectionStore((state) =>
    decodedDirectory ? getSelectedModelKey(state, promptKey) : undefined,
  )
  const selectedAgentKey = useModelSelectionStore((state) =>
    decodedDirectory ? getSelectedAgentKey(state, promptKey) : undefined,
  )
  const selectedVariantKey = useModelSelectionStore((state) =>
    decodedDirectory ? getSelectedVariantKey(state, promptKey) : undefined,
  )
  const recentModelKeys = useModelSelectionStore((state) => state.recentModelKeys)
  const setPromptDraft = usePromptStore((state) => state.replaceDraft)
  const clearPromptDraft = usePromptStore((state) => state.clearDraft)
  const migrateWorkspaceDraft = usePromptStore((state) => state.migrateWorkspaceDraft)
  const removePromptDraft = usePromptStore((state) => state.removeSessionDraft)

  // ── Derived state ──────────────────────────────────────────────────────────
  const validOpenProjects = useMemo(
    () => openProjects.filter((directory) => directory && directory !== "/"),
    [openProjects],
  )
  const hasRegisteredProject = useMemo(
    () => !!decodedDirectory && validOpenProjects.includes(decodedDirectory),
    [decodedDirectory, validOpenProjects],
  )

  useQueries({
    queries: validOpenProjects.map((directory) => ({
      ...directorySessionsQueryOptions(directory),
      initialData: () => readSeededSessionList(directory),
    })),
  })

  useQuery({
    ...directoryPermissionsQueryOptions(decodedDirectory),
    enabled: decodedDirectory.length > 0 && hasRegisteredProject,
    initialData: () => readSeededPendingPermissions(decodedDirectory),
  })
  useQuery({
    ...directoryQuestionsQueryOptions(decodedDirectory),
    enabled: decodedDirectory.length > 0 && hasRegisteredProject,
    initialData: () => readSeededPendingQuestions(decodedDirectory),
  })

  const sessionsByDirectory = useChatStore(
    useShallow((state) => {
      const result: Record<string, SessionInfo[]> = {}
      for (const directory of validOpenProjects) {
        result[directory] = state.directories[directory]?.sessions ?? EMPTY_SESSIONS
      }
      return result
    }),
  )

  const sessionStatusByDirectory = useChatStore(
    useShallow((state) => {
      const result: Record<string, Record<string, SessionStatusInfo>> = {}
      for (const directory of validOpenProjects) {
        result[directory] = state.directories[directory]?.sessionStatusByID ?? EMPTY_SESSION_STATUS
      }
      return result
    }),
  )
  const sessions = directoryState?.sessions ?? EMPTY_LIST
  const sessionFamily = useMemo(() => getSessionFamily(sessions, sessionID), [sessionID, sessions])
  const sessionTitle = formatSessionTitle(
    sessionFamily.current?.title ?? directoryState?.sessionTitle ?? "New chat",
  )
  const parentSession = useMemo(
    () =>
      sessionFamily.current?.parentID
        ? sessionFamily.family.find((session) => session.id === sessionFamily.current?.parentID)
        : undefined,
    [sessionFamily.current?.parentID, sessionFamily.family],
  )
  const messages = useTranscriptSessionMessages(decodedDirectory, sessionID)
  const transcriptMeta = useTranscriptSessionMeta(decodedDirectory, sessionID)
  const isTurnActive = isSessionWorking({
    info: sessionFamily.current,
    status: sessionID ? directoryState?.sessionStatusByID[sessionID] : undefined,
    messages,
  })
  const providers = directoryState?.providers ?? EMPTY_LIST
  const providerDefault = directoryState?.providerDefault ?? EMPTY_RECORD
  const usableProviders = useMemo(() => getUsableProviders(providers), [providers])
  const currentAgent = useMemo(
    () =>
      resolveCurrentAgent({
        agents: props.agentCatalog,
        selectedAgentName: selectedAgentKey,
        defaultAgentName: props.defaultAgent,
      }),
    [props.agentCatalog, props.defaultAgent, selectedAgentKey],
  )
  const currentAgentName = currentAgent?.name ?? props.defaultAgent
  const recentModels = useMemo(
    () => recentModelKeys.map(parseConfiguredModel).filter(isModelSelection),
    [recentModelKeys],
  )
  const autoModelSelection = useMemo(() => {
    return resolveAutoModelSelection({
      providers,
      providerDefault,
      agentModel: currentAgent?.model,
      configuredModel: props.configuredModel,
      recentModels,
    })
  }, [currentAgent?.model, props.configuredModel, providerDefault, providers, recentModels])
  const visibleModelKeys = useMemo(() => {
    return resolveVisibleModelKeys({
      usableProviders,
      autoModelSelection,
      selectedModelOverrideKey,
    })
  }, [autoModelSelection, selectedModelOverrideKey, usableProviders])
  const primaryPersonaOptions = useMemo(
    () => props.personaCatalog.filter((persona) => !persona.hidden),
    [props.personaCatalog],
  )
  const modelOptions = useMemo(() => {
    const options: DirectoryChatModelOption[] = []

    for (const provider of usableProviders) {
      for (const model of provider.models) {
        const key = modelSelectionKey({ providerID: provider.id, modelID: model.id })
        if (!visibleModelKeys.has(key)) continue
        options.push({
          key,
          label: model.name || model.id,
          group: resolveProviderModelGroup(provider),
          acceptsImages: model.capabilities.input.image,
        })
      }
    }

    return options
  }, [usableProviders, visibleModelKeys])
  const selectedModelOverride = useMemo(
    () => parseConfiguredModel(selectedModelOverrideKey),
    [selectedModelOverrideKey],
  )
  const usableSelectedModelOverride = useMemo(
    () =>
      resolveUsableModelSelection({
        providers,
        selection: selectedModelOverride,
      }),
    [providers, selectedModelOverride],
  )
  const effectiveModelSelection = useMemo(
    () => usableSelectedModelOverride ?? autoModelSelection,
    [autoModelSelection, usableSelectedModelOverride],
  )
  const effectiveModelInfo = useMemo(() => {
    if (!effectiveModelSelection) return undefined
    return usableProviders
      .find((provider) => provider.id === effectiveModelSelection.providerID)
      ?.models.find((model) => model.id === effectiveModelSelection.modelID)
  }, [effectiveModelSelection, usableProviders])
  const configuredVariant = useMemo(
    () =>
      resolveConfiguredAgentVariant({
        agent: currentAgent,
        model: effectiveModelInfo
          ? {
              providerID: effectiveModelSelection?.providerID ?? "",
              modelID: effectiveModelSelection?.modelID ?? "",
              variants: effectiveModelInfo.variants ?? [],
            }
          : undefined,
      }),
    [
      currentAgent,
      effectiveModelInfo,
      effectiveModelSelection?.modelID,
      effectiveModelSelection?.providerID,
    ],
  )
  const thinkingOptions = useMemo(() => {
    const variants = sortThinkingVariants(effectiveModelInfo?.variants ?? [])
    return [
      { key: THINKING_DEFAULT_KEY, label: "Default" },
      ...variants.map((variant) => ({ key: variant, label: formatThinkingLabel(variant) })),
    ]
  }, [effectiveModelInfo])
  const selectedThinking = useMemo(
    () =>
      resolveSelectedVariant({
        selected: selectedVariantKey,
        configured: configuredVariant,
        variants: effectiveModelInfo?.variants ?? [],
      }) ?? THINKING_DEFAULT_KEY,
    [configuredVariant, effectiveModelInfo?.variants, selectedVariantKey],
  )
  const isBusy = isTurnActive
  const isReady = directoryState?.isReady ?? false
  const loadingSessionID =
    transcriptMeta.loading && sessionID && messages.length === 0
      ? sessionID
      : directoryState?.loadingSessionID
  const error = directoryState?.error
  const pendingPermissions = directoryState?.pendingPermissions ?? []
  const pendingQuestions = directoryState?.pendingQuestions ?? []
  const mcpStatus = directoryState?.mcpStatus ?? EMPTY_RECORD
  const mcpEntries = useMemo(
    () => Object.entries(mcpStatus).sort(([left], [right]) => left.localeCompare(right)),
    [mcpStatus],
  )
  const connectedMcpCount = useMemo(
    () => mcpEntries.filter(([, entry]) => entry.status === "connected").length,
    [mcpEntries],
  )
  const hasMcpError = useMemo(
    () =>
      mcpEntries.some(
        ([, entry]) =>
          entry.status === "failed" ||
          entry.status === "needs_auth" ||
          entry.status === "needs_client_registration",
      ),
    [mcpEntries],
  )
  const sidebarDirectories = validOpenProjects
  const storedPersona = storedPersonaForSession ?? primaryPersonaOptions[0]?.id ?? "buddy"
  const preferredLanguage = preferredLanguageForSession ?? "ts"
  const selectedPersonaConfig = useMemo(
    () =>
      primaryPersonaOptions.find((persona) => persona.id === storedPersona) ??
      primaryPersonaOptions[0],
    [primaryPersonaOptions, storedPersona],
  )
  const selectedPersona = selectedPersonaConfig?.id ?? storedPersona
  const selectedPersonaSurfaces =
    selectedPersonaConfig?.surfaces ?? (["curriculum"] satisfies PersonaConfigOption["surfaces"])
  const selectedPersonaSupportsEditor = selectedPersonaSurfaces.includes("editor")
  const isInteractiveMode = !!sessionID && !!teachingWorkspace
  const leftSidebarMaxWidth = 360
  const leftSidebarDisplayWidth = Math.max(leftSidebarWidth, 220)

  return {
    // Chat store actions
    setActiveDirectory,
    setStreamStatus,
    applySessionUpdated,
    applySessionStatus,
    applyMessageUpdated: applyTranscriptMessageUpdated,
    applyMessageRemoved: applyTranscriptMessageRemoved,
    applyPartUpdated: applyTranscriptPartUpdated,
    applyPartRemoved: applyTranscriptPartRemoved,
    applyPartDelta: applyTranscriptPartDelta,
    applyPermissionAsked,
    applyPermissionReplied,
    applyQuestionAsked,
    applyQuestionResolved,
    clearDirectoryError,
    setDirectoryError,
    setSelectedAgent,
    setSelectedModel,
    setSelectedVariant,
    pushRecentModelKey,
    restoreSessionSelection,
    // UI preferences actions
    setLeftSidebarOpen,
    setLeftSidebarWidth,
    togglePinned,
    markUnread,
    clearUnread,
    clearDirectorySessionState,
    // Prompt store actions
    setPromptDraft,
    clearPromptDraft,
    migrateWorkspaceDraft,
    migrateWorkspaceModelSelection,
    removePromptDraft,
    // Session & routing
    sessionID,
    promptKey,
    sessionTitle,
    parentSession,
    sessions,
    sessionFamily,
    sessionKey,
    // UI state
    streamStatus,
    leftSidebarOpen,
    leftSidebarWidth,
    leftSidebarDisplayWidth,
    leftSidebarMaxWidth,
    pinnedByDirectory,
    unreadByDirectory,
    sidebarDirectories,
    validOpenProjects,
    hasRegisteredProject,
    // Model
    selectedModelKey: effectiveModelSelection ? modelSelectionKey(effectiveModelSelection) : "",
    selectedModelAcceptsImages: effectiveModelInfo?.capabilities.input.image ?? false,
    currentAgentName,
    selectedModelOverrideKey,
    selectedVariantKey,
    effectiveModelSelection,
    effectiveModelInfo,
    selectedThinking,
    thinkingOptions,
    modelOptions,
    primaryPersonaOptions,
    // Teaching
    setSessionPersona,
    teachingWorkspace,
    storedPersona,
    preferredLanguage,
    selectedPersona,
    selectedPersonaSupportsEditor,
    isInteractiveMode,
    autoCompactionEnabled: props.autoCompactionEnabled,
    // Directory state
    isBusy,
    isTurnActive,
    isReady,
    loadingSessionID,
    error,
    pendingPermissions,
    pendingQuestions,
    messages,
    providers,
    sessionsByDirectory,
    sessionStatusByDirectory,
    connectedMcpCount,
    hasMcpError,
    mcpEntries,
  }
}
