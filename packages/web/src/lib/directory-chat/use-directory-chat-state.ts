import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useChatStore } from "@/state/chat-store"
import { useUiPreferences } from "@/state/ui-preferences"
import { useTeachingRuntime, teachingSelectionKey } from "@/state/teaching-runtime"
import { usePromptStore, getPromptScopeKey } from "@/state/prompt-store"
import { getSessionFamily } from "../session-family"
import { modelSelectionKey, parseConfiguredModel } from "./chat-prompt-helpers"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import type { PersonaConfigOption } from "@/state/chat-actions"
import { RESOURCE_SIDEBAR_TAB } from "../resource-commands"
import type { ChatRightSidebarTab } from "@/components/layout/chat-right-sidebar"
import { getConnectedProviders, resolveAutoModelSelection } from "@/lib/provider-catalog"

const MODEL_VISIBILITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 31 * 6
const EMPTY_LIST: never[] = []
const EMPTY_RECORD: Record<string, never> = {}
const EMPTY_SESSIONS: SessionInfo[] = []
const EMPTY_SESSION_STATUS: Record<string, SessionStatusInfo> = {}

function isSidebarSurface(value: string): value is PersonaConfigOption["surfaces"][number] {
  return value === "curriculum" || value === "editor" || value === "figure"
}

const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 360

type UseDirectoryChatStateProps = {
  decodedDirectory: string
  configuredModel: { providerID: string; modelID: string } | undefined
  personaCatalog: PersonaConfigOption[]
  defaultPersona: string
  defaultIntent: "auto" | "learn" | "practice" | "assess"
  selectedThinking: string
  showSystemPromptSidebarTab: boolean
  showCapabilitiesSidebarTab: boolean
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
  const applyPartUpdated = useChatStore((state) => state.applyPartUpdated)
  const applyPartDelta = useChatStore((state) => state.applyPartDelta)
  const applyPermissionAsked = useChatStore((state) => state.applyPermissionAsked)
  const applyPermissionReplied = useChatStore((state) => state.applyPermissionReplied)
  const clearDirectoryError = useChatStore((state) => state.clearDirectoryError)
  const setDirectoryError = useChatStore((state) => state.setDirectoryError)
  const setSelectedModel = useChatStore((state) => state.setSelectedModel)
  const selectedModelKey = useChatStore((state) =>
    decodedDirectory ? (state.selectedModelByDirectory[decodedDirectory] ?? "auto") : "auto",
  )

  // ── UI preferences ─────────────────────────────────────────────────────────
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const leftSidebarWidth = useUiPreferences((state) => state.leftSidebarWidth)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useUiPreferences((state) => state.rightSidebarWidth)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const pinnedByDirectory = useUiPreferences((state) => state.pinnedByDirectory)
  const unreadByDirectory = useUiPreferences((state) => state.unreadByDirectory)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const setLeftSidebarWidth = useUiPreferences((state) => state.setLeftSidebarWidth)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarWidth = useUiPreferences((state) => state.setRightSidebarWidth)
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
  const autoModelSelection = useMemo(() => {
    return resolveAutoModelSelection({
      providers,
      providerDefault,
      configuredModel: props.configuredModel,
    })
  }, [props.configuredModel, providerDefault, providers])
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
    if (selectedModelKey !== "auto") visible.add(selectedModelKey)

    return visible
  }, [autoModelSelection, connectedProviders, selectedModelKey])
  const primaryPersonaOptions = useMemo(
    () => props.personaCatalog.filter((persona) => !persona.hidden),
    [props.personaCatalog],
  )
  const modelOptions = useMemo(() => {
    const autoProvider = autoModelSelection
      ? connectedProviders.find((provider) => provider.id === autoModelSelection.providerID)
      : undefined
    const autoModelInfo = autoModelSelection
      ? autoProvider?.models.find((model) => model.id === autoModelSelection.modelID)
      : undefined
    const autoLabel = autoModelSelection
      ? `Auto (${autoModelInfo?.name ?? `${autoModelSelection.providerID}/${autoModelSelection.modelID}`})`
      : "Auto"
    const options: Array<{ key: string; label: string; group?: string; disabled?: boolean }> = [
      { key: "auto", label: autoLabel },
    ]

    for (const provider of connectedProviders) {
      for (const model of provider.models) {
        const key = modelSelectionKey({ providerID: provider.id, modelID: model.id })
        if (!visibleModelKeys.has(key)) continue
        options.push({ key, label: model.name || model.id, group: provider.name })
      }
    }

    return options
  }, [autoModelSelection, connectedProviders, visibleModelKeys])
  const effectiveModelSelection = useMemo(
    () =>
      selectedModelKey === "auto" ? autoModelSelection : parseConfiguredModel(selectedModelKey),
    [autoModelSelection, selectedModelKey],
  )
  const effectiveModelInfo = useMemo(() => {
    if (!effectiveModelSelection) return undefined
    return connectedProviders
      .find((provider) => provider.id === effectiveModelSelection.providerID)
      ?.models.find((model) => model.id === effectiveModelSelection.modelID)
  }, [connectedProviders, effectiveModelSelection])
  const thinkingOptions = useMemo(() => {
    const variants = effectiveModelInfo?.variants ?? []
    return [
      { key: "default", label: "Default" },
      ...variants.map((variant) => ({ key: variant, label: variant })),
    ]
  }, [effectiveModelInfo])
  const isBusy = directoryState?.isBusy ?? false
  const isReady = directoryState?.isReady ?? false
  const error = directoryState?.error
  const pendingPermissions = directoryState?.pendingPermissions ?? []
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
    isSidebarSurface(rightSidebarTab) && selectedPersonaSurfaces.includes(rightSidebarTab)
      ? rightSidebarTab
      : selectedPersonaDefaultSurface
  const rightSidebarActiveTab: ChatRightSidebarTab =
    rightSidebarTab === "system-prompt" && props.showSystemPromptSidebarTab
      ? "system-prompt"
      : rightSidebarTab === "capabilities" && props.showCapabilitiesSidebarTab
        ? "capabilities"
        : rightSidebarTab === "diagrams"
          ? "diagrams"
          : rightSidebarTab === RESOURCE_SIDEBAR_TAB
            ? RESOURCE_SIDEBAR_TAB
            : rightSidebarTab === "agents-md"
              ? "agents-md"
              : selectedSurfaceTab
  const editorPanelSizing = rightSidebarActiveTab === "editor"
  const rightSidebarMinWidth = editorPanelSizing ? RIGHT_SIDEBAR_EDITOR_MIN_WIDTH : 200
  const rightSidebarMaxWidth = editorPanelSizing ? 960 : 480
  const rightSidebarDisplayWidth = Math.min(
    Math.max(rightSidebarWidth, rightSidebarMinWidth),
    rightSidebarMaxWidth,
  )
  const leftSidebarMaxWidth = typeof window === "undefined" ? 1000 : window.innerWidth * 0.3 + 64
  const leftSidebarDisplayWidth = Math.max(leftSidebarWidth, 244)

  return {
    // Chat store actions
    setActiveDirectory,
    setStreamStatus,
    applySessionUpdated,
    applySessionStatus,
    applyMessageUpdated,
    applyPartUpdated,
    applyPartDelta,
    applyPermissionAsked,
    applyPermissionReplied,
    clearDirectoryError,
    setDirectoryError,
    setSelectedModel,
    // UI preferences actions
    setLeftSidebarOpen,
    setLeftSidebarWidth,
    setRightSidebarOpen,
    setRightSidebarWidth,
    setRightSidebarTab,
    togglePinned,
    markUnread,
    clearUnread,
    clearDirectorySessionState,
    // Prompt store actions
    setPromptDraft,
    clearPromptDraft,
    migrateWorkspaceDraft,
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
    rightSidebarDisplayWidth,
    rightSidebarMinWidth,
    rightSidebarMaxWidth,
    rightSidebarTab,
    rightSidebarActiveTab,
    editorPanelSizing,
    pinnedByDirectory,
    unreadByDirectory,
    sidebarDirectories,
    validOpenProjects,
    hasRegisteredProject,
    // Model
    selectedModelKey,
    effectiveModelSelection,
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
    // Directory state
    isBusy,
    isReady,
    error,
    pendingPermissions,
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
