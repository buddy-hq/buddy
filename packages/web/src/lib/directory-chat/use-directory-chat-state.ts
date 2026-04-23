import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useShallow } from "zustand/react/shallow"
import { useChatStore } from "@/state/chat-store"
import {
  getSelectedAgentKey,
  getSelectedModelKey,
  getSelectedVariantKey,
  useModelSelectionStore,
} from "@/state/model-selection-store"
import { useUiPreferences } from "@/state/ui-preferences"
import { useTeachingRuntime, teachingSelectionKey } from "@/state/teaching-runtime"
import { usePromptStore, getPromptScopeKey } from "@/state/prompt-store"
import {
  directoryPermissionsQueryOptions,
  directoryQuestionsQueryOptions,
  directorySessionsQueryOptions,
} from "@/state/directory-chat-query"
import { getSessionFamily } from "../session-family"
import { modelSelectionKey, parseConfiguredModel } from "./chat-prompt-helpers"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import type { AgentConfigOption, PersonaConfigOption } from "@/state/chat-actions"
import type { ChatRightSidebarTab } from "@/components/layout/chat-right-sidebar"
import {
  getConnectedProviders,
  resolveAutoModelSelection,
  resolveConnectedModelSelection,
} from "@/lib/provider-catalog"
import { resolveCurrentAgent } from "./agent-catalog"
import { getRightSidebarMaxWidth, getRightSidebarMinWidth } from "./right-sidebar-layout"

const MODEL_VISIBILITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 31 * 6
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

function isSidebarSurface(value: string): value is PersonaConfigOption["surfaces"][number] {
  return (
    value === "curriculum" || value === "editor" || value === "figure" || value === "question-set"
  )
}

type UseDirectoryChatStateProps = {
  decodedDirectory: string
  agentCatalog: AgentConfigOption[]
  defaultAgent?: string
  configuredModel: { providerID: string; modelID: string } | undefined
  autoCompactionEnabled: boolean
  personaCatalog: PersonaConfigOption[]
  defaultPersona: string
  defaultIntent: "auto" | "learn" | "practice" | "assess"
  showSystemPromptSidebarTab: boolean
  showCapabilitiesSidebarTab: boolean
  showPaletteSidebarTab: boolean
}

export function useDirectoryChatState(props: UseDirectoryChatStateProps) {
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
  const applyMessageUpdated = useChatStore((state) => state.applyMessageUpdated)
  const applyMessageRemoved = useChatStore((state) => state.applyMessageRemoved)
  const applyPartUpdated = useChatStore((state) => state.applyPartUpdated)
  const applyPartRemoved = useChatStore((state) => state.applyPartRemoved)
  const applyPartDelta = useChatStore((state) => state.applyPartDelta)
  const applyPermissionAsked = useChatStore((state) => state.applyPermissionAsked)
  const applyPermissionReplied = useChatStore((state) => state.applyPermissionReplied)
  const applyQuestionAsked = useChatStore((state) => state.applyQuestionAsked)
  const applyQuestionResolved = useChatStore((state) => state.applyQuestionResolved)
  const clearDirectoryError = useChatStore((state) => state.clearDirectoryError)
  const setDirectoryError = useChatStore((state) => state.setDirectoryError)

  // ── UI preferences ─────────────────────────────────────────────────────────
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const leftSidebarWidth = useUiPreferences((state) => state.chatLeftSidebarWidth)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useUiPreferences((state) => state.rightSidebarWidth)
  const mainPaneTab = useUiPreferences((state) => state.mainPaneTab)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const setLeftSidebarWidth = useUiPreferences((state) => state.setChatLeftSidebarWidth)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarWidth = useUiPreferences((state) => state.setRightSidebarWidth)
  const setMainPaneTab = useUiPreferences((state) => state.setMainPaneTab)
  const setRightSidebarTab = useUiPreferences((state) => state.setRightSidebarTab)
  const togglePinned = useUiPreferences((state) => state.togglePinned)
  const markUnread = useUiPreferences((state) => state.markUnread)
  const clearUnread = useUiPreferences((state) => state.clearUnread)
  const clearDirectorySessionState = useUiPreferences((state) => state.clearDirectorySessionState)

  // ── Teaching runtime ───────────────────────────────────────────────────────
  const teachingRuntime = useTeachingRuntime()

  // ── Prompt store ───────────────────────────────────────────────────────────
  const sessionID = directoryState?.sessionID
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
  const sessionTitle = sessionFamily.current?.title ?? directoryState?.sessionTitle ?? "New thread"
  const parentSession = useMemo(
    () =>
      sessionFamily.current?.parentID
        ? sessionFamily.family.find((session) => session.id === sessionFamily.current?.parentID)
        : undefined,
    [sessionFamily.current?.parentID, sessionFamily.family],
  )
  const messages = directoryState?.messages ?? EMPTY_LIST
  const providers = directoryState?.providers ?? EMPTY_LIST
  const providerDefault = directoryState?.providerDefault ?? EMPTY_RECORD
  const connectedProviders = useMemo(() => getConnectedProviders(providers), [providers])
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
    const visible = new Set<string>()
    const latestByFamily = new Map<string, { key: string; releaseTime: number }>()
    const now = Date.now()

    for (const provider of connectedProviders) {
      for (const model of provider.models) {
        const key = modelSelectionKey({ providerID: provider.id, modelID: model.id })
        const releaseTime = model.releaseDate ? Date.parse(model.releaseDate) : Number.NaN

        if (!Number.isFinite(releaseTime)) {
          visible.add(key)
          continue
        }
        if (Math.abs(now - releaseTime) >= MODEL_VISIBILITY_WINDOW_MS) continue

        const family = model.family || model.id
        const familyKey = `${provider.id}:${family}`
        const existing = latestByFamily.get(familyKey)
        if (!existing || releaseTime > existing.releaseTime) {
          latestByFamily.set(familyKey, { key, releaseTime })
        }
      }
    }

    for (const latest of latestByFamily.values()) {
      visible.add(latest.key)
    }

    if (autoModelSelection) visible.add(modelSelectionKey(autoModelSelection))
    if (selectedModelOverrideKey) visible.add(selectedModelOverrideKey)

    return visible
  }, [autoModelSelection, connectedProviders, selectedModelOverrideKey])
  const primaryPersonaOptions = useMemo(
    () => props.personaCatalog.filter((persona) => !persona.hidden),
    [props.personaCatalog],
  )
  const modelOptions = useMemo(() => {
    const options: Array<{ key: string; label: string; group?: string; disabled?: boolean }> = []

    for (const provider of connectedProviders) {
      for (const model of provider.models) {
        const key = modelSelectionKey({ providerID: provider.id, modelID: model.id })
        if (!visibleModelKeys.has(key)) continue
        options.push({ key, label: model.name || model.id, group: provider.name })
      }
    }

    return options
  }, [connectedProviders, visibleModelKeys])
  const selectedModelOverride = useMemo(
    () => parseConfiguredModel(selectedModelOverrideKey),
    [selectedModelOverrideKey],
  )
  const connectedSelectedModelOverride = useMemo(
    () =>
      resolveConnectedModelSelection({
        providers,
        selection: selectedModelOverride,
      }),
    [providers, selectedModelOverride],
  )
  const effectiveModelSelection = useMemo(
    () => connectedSelectedModelOverride ?? autoModelSelection,
    [autoModelSelection, connectedSelectedModelOverride],
  )
  const effectiveModelInfo = useMemo(() => {
    if (!effectiveModelSelection) return undefined
    return connectedProviders
      .find((provider) => provider.id === effectiveModelSelection.providerID)
      ?.models.find((model) => model.id === effectiveModelSelection.modelID)
  }, [connectedProviders, effectiveModelSelection])
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
  const isBusy = directoryState?.isBusy ?? false
  const isReady = directoryState?.isReady ?? false
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
  const sessionKey = useMemo(
    () => (decodedDirectory ? teachingSelectionKey(decodedDirectory, sessionID) : ""),
    [decodedDirectory, sessionID],
  )
  const storedPersona = sessionKey
    ? (teachingRuntime.selectedPersonaBySession[sessionKey] ?? props.defaultPersona)
    : props.defaultPersona
  const storedIntent = sessionKey
    ? (teachingRuntime.selectedIntentBySession[sessionKey] ?? props.defaultIntent)
    : props.defaultIntent
  const preferredLanguage = sessionKey
    ? (teachingRuntime.preferredLanguageBySession[sessionKey] ?? "ts")
    : "ts"
  const teachingWorkspace = sessionKey ? teachingRuntime.workspaceBySession[sessionKey] : undefined
  const selectedPersonaConfig = useMemo(
    () =>
      primaryPersonaOptions.find((persona) => persona.id === storedPersona) ??
      primaryPersonaOptions[0],
    [primaryPersonaOptions, storedPersona],
  )
  const selectedPersona = selectedPersonaConfig?.id ?? storedPersona
  const selectedPersonaSurfaces =
    selectedPersonaConfig?.surfaces ?? (["curriculum"] satisfies PersonaConfigOption["surfaces"])
  const selectedPersonaDefaultSurface = selectedPersonaConfig?.defaultSurface ?? "curriculum"
  const selectedPersonaSupportsEditor = selectedPersonaSurfaces.includes("editor")
  const selectedPersonaSupportsFigure = selectedPersonaSurfaces.includes("figure")
  const isInteractiveMode = !!sessionID && !!teachingWorkspace
  const selectedSurfaceTab =
    rightSidebarTab === "editor"
      ? "editor"
      : isSidebarSurface(rightSidebarTab) && selectedPersonaSurfaces.includes(rightSidebarTab)
        ? rightSidebarTab
        : selectedPersonaDefaultSurface
  const rightSidebarActiveTab: ChatRightSidebarTab =
    rightSidebarTab === "system-prompt" && props.showSystemPromptSidebarTab
      ? "system-prompt"
      : rightSidebarTab === "capabilities" && props.showCapabilitiesSidebarTab
        ? "capabilities"
        : rightSidebarTab === "palette" && props.showPaletteSidebarTab
          ? "palette"
          : rightSidebarTab === "diagrams"
            ? "diagrams"
            : rightSidebarTab === "agents-md"
              ? "agents-md"
              : rightSidebarTab === "files"
                ? "files"
                : selectedSurfaceTab
  const wideSidebarSizing = rightSidebarActiveTab === "editor" || rightSidebarActiveTab === "files"
  const rightSidebarMinWidth = getRightSidebarMinWidth(rightSidebarActiveTab)
  const rightSidebarMaxWidth = getRightSidebarMaxWidth(rightSidebarActiveTab)
  const rightSidebarDisplayWidth = Math.min(
    Math.max(rightSidebarWidth, rightSidebarMinWidth),
    rightSidebarMaxWidth,
  )
  const leftSidebarMaxWidth = 360
  const leftSidebarDisplayWidth = Math.max(leftSidebarWidth, 220)

  return {
    // Chat store actions
    setActiveDirectory,
    setStreamStatus,
    applySessionUpdated,
    applySessionStatus,
    applyMessageUpdated,
    applyMessageRemoved,
    applyPartUpdated,
    applyPartRemoved,
    applyPartDelta,
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
    setRightSidebarOpen,
    setRightSidebarWidth,
    setMainPaneTab,
    setRightSidebarTab,
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
    rightSidebarOpen,
    rightSidebarWidth,
    mainPaneTab,
    rightSidebarDisplayWidth,
    rightSidebarMinWidth,
    rightSidebarMaxWidth,
    rightSidebarTab,
    rightSidebarActiveTab,
    editorPanelSizing: wideSidebarSizing,
    pinnedByDirectory,
    unreadByDirectory,
    sidebarDirectories,
    validOpenProjects,
    hasRegisteredProject,
    // Model
    selectedModelKey: effectiveModelSelection ? modelSelectionKey(effectiveModelSelection) : "",
    currentAgentName,
    selectedModelOverrideKey,
    selectedVariantKey,
    effectiveModelSelection,
    selectedThinking,
    thinkingOptions,
    modelOptions,
    primaryPersonaOptions,
    // Teaching
    teachingRuntime,
    teachingWorkspace,
    storedPersona,
    storedIntent,
    preferredLanguage,
    selectedPersona,
    selectedPersonaSurfaces,
    selectedPersonaDefaultSurface,
    selectedPersonaSupportsEditor,
    selectedPersonaSupportsFigure,
    selectedSurfaceTab,
    isInteractiveMode,
    autoCompactionEnabled: props.autoCompactionEnabled,
    // Directory state
    isBusy,
    isReady,
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

export type DirectoryChatState = ReturnType<typeof useDirectoryChatState>
