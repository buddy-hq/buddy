import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState, type UIEvent } from "react"
import { Button } from "@buddy/ui"
import { ChatEmptyState } from "@/components/chat/chat-empty-state"
import { SessionContextUsage } from "@/components/chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/chat/permission-dock"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { ChatRightSidebar } from "@/components/layout/chat-right-sidebar"
import { McpDialog } from "@/components/mcp-dialog"
import { ResizeHandle } from "@/components/layout/resize-handle"
import { SettingsModal } from "@/components/settings-modal"
import { TeachingEditorPanel } from "@/components/teaching/teaching-editor-panel"
import { MathFigurePanel } from "@/components/teaching/math-figure-panel"
import { usePlatform } from "@/context/platform"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import type { PromptAttachmentPart, PromptComposerAttachment } from "@/components/prompt/prompt-types"
import { parseSlashCommandInput } from "@/components/prompt/slash-autocomplete"
import {
  ChevronRightIcon,
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
} from "@/components/layout/sidebar-icons"
import { resolveTeachingPromptContext } from "../lib/teaching-context"
import { pickProjectDirectory } from "../lib/directory-picker"
import { decodeDirectory, encodeDirectory } from "../lib/directory-token"
import { getSessionFamily } from "../lib/session-family"
import {
  type LearnerCurriculumView,
  type PersonaConfigOption,
  type PromptCommandOption,
  abortPrompt,
  ensureDirectorySession,
  findWorkspaceFiles,
  loadCommandCatalog,
  loadPersonaCatalog,
  loadMcpStatus,
  loadPermissions,
  loadOpenProjects,
  loadProjectConfig,
  loadTeachingSessionState,
  loadMessages,
  loadSessions,
  preloadProjectSessions,
  replyPermission,
  openProject,
  resyncDirectory,
  resolveDefaultPersonaID,
  selectSession,
  sendCommand,
  sendPrompt,
  startNewSession,
  updateSession,
} from "../state/chat-actions"
import { useChatStore } from "../state/chat-store"
import { startChatSync } from "../state/chat-sync"
import type { GlobalEvent, MessageInfo, MessagePart, PermissionRequest, SessionInfo } from "../state/chat-types"
import {
  activateTeachingWorkspaceFile,
  checkpointTeachingWorkspace,
  createTeachingWorkspaceFile,
  ensureTeachingWorkspace,
  loadTeachingWorkspace,
  probeTeachingWorkspace,
  restoreTeachingWorkspace,
  saveTeachingWorkspace,
  stringifyError,
  TeachingConflictError,
} from "../state/teaching-actions"
import {
  TEACHING_LANGUAGE_OPTIONS,
  intentOverrideFromSelection,
  teachingLanguageLabel,
  teachingSessionKey,
  useTeachingRuntime,
  type TeachingLanguage,
  type TeachingIntent,
  type TeachingIntentSelection,
} from "../state/teaching-runtime"
import { useUiPreferences } from "../state/ui-preferences"

export const Route = createFileRoute("/$directory/chat")({
  component: DirectoryChatPage,
})

const BOTTOM_THRESHOLD_PX = 96
const SIDEBAR_MIN_WIDTH = 244
const SIDEBAR_DEFAULT_MAX_WIDTH = 1000
const RIGHT_SIDEBAR_MIN_WIDTH = 200
const RIGHT_SIDEBAR_MAX_WIDTH = 480
const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 360
const RIGHT_SIDEBAR_EDITOR_MAX_WIDTH = 960
const RIGHT_SIDEBAR_COLLAPSE_THRESHOLD = 160
const MODEL_VISIBILITY_WINDOW_MS = 1000 * 60 * 60 * 24 * 31 * 6
const DEFAULT_PERSONA_SURFACES = ["curriculum"] satisfies PersonaConfigOption["surfaces"]

function isSidebarSurface(value: string): value is PersonaConfigOption["surfaces"][number] {
  return value === "curriculum" || value === "editor" || value === "figure"
}

async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function readSessionErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error
  if (!error || typeof error !== "object") return "An error occurred"

  const message = "message" in error ? (error as { message?: unknown }).message : undefined
  if (typeof message === "string" && message.trim()) return message

  const dataMessage =
    "data" in error && error.data && typeof error.data === "object"
      ? (error.data as { message?: unknown }).message
      : undefined
  if (typeof dataMessage === "string" && dataMessage.trim()) return dataMessage

  const name = "name" in error ? (error as { name?: unknown }).name : undefined
  if (typeof name === "string" && name.trim()) return name

  return "An error occurred"
}

function buildSessionTrace(input: { directory: string; sessionID?: string; streamStatus: string }) {
  const state = useChatStore.getState()
  const directoryState = state.directories[input.directory]
  const session = directoryState?.sessions.find((entry) => entry.id === input.sessionID)

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: input.sessionID,
      streamStatus: input.streamStatus,
      session,
      directoryState: directoryState
        ? {
            sessionTitle: directoryState.sessionTitle,
            sessionStatusByID: directoryState.sessionStatusByID,
            isBusy: directoryState.isBusy,
            isReady: directoryState.isReady,
            error: directoryState.error,
            pendingPermissions: directoryState.pendingPermissions,
            sessions: directoryState.sessions,
            messages: directoryState.messages,
          }
        : undefined,
      openProjects: state.openProjects,
      activeDirectory: state.activeDirectory,
      lastSessionByDirectory: state.lastSessionByDirectory,
    },
    null,
    2,
  )
}

function parseConfiguredModel(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator >= trimmed.length - 1) return undefined

  return {
    providerID: trimmed.slice(0, separator),
    modelID: trimmed.slice(separator + 1),
  }
}

function modelSelectionKey(input: { providerID: string; modelID: string }) {
  return `${input.providerID}/${input.modelID}`
}

function decodeAttachmentDataUrl(dataUrl: string) {
  const separator = dataUrl.indexOf(",")
  if (separator === -1) return undefined

  const metadata = dataUrl.slice(0, separator)
  const payload = dataUrl.slice(separator + 1)

  if (/;base64$/i.test(metadata)) {
    const binary = window.atob(payload)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return bytes
  }

  return new TextEncoder().encode(decodeURIComponent(payload))
}

function decodeAttachmentText(dataUrl: string) {
  const bytes = decodeAttachmentDataUrl(dataUrl)
  if (!bytes) return undefined

  try {
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

function buildPromptAttachmentParts(attachments: PromptComposerAttachment[]): PromptAttachmentPart[] {
  return attachments.flatMap((attachment): PromptAttachmentPart[] => {
    const textLike = attachment.mime === "image/svg+xml" || attachment.mime.startsWith("text/")
    if (textLike) {
      const content = decodeAttachmentText(attachment.dataUrl)
      if (content !== undefined) {
        return [
          {
            type: "text" as const,
            text: `Attached file (${attachment.filename}):\n${content}`,
          },
        ]
      }
    }

    return [
      {
        type: "file" as const,
        mime: attachment.mime,
        url: attachment.dataUrl,
        filename: attachment.filename,
      },
    ]
  })
}

function buildCommandAttachmentParts(attachments: PromptComposerAttachment[]) {
  return attachments.map((attachment) => ({
    type: "file" as const,
    mime: attachment.mime === "text/plain" ? "application/octet-stream" : attachment.mime,
    url: attachment.dataUrl,
    filename: attachment.filename,
  }))
}

async function loadComposerConfiguration(directory: string) {
  const [personas, config, commands] = await Promise.all([
    loadPersonaCatalog(directory),
    loadProjectConfig(directory),
    loadCommandCatalog(directory),
  ])
  const configuredDefault = resolveDefaultPersonaID(
    personas,
    typeof config.default_persona === "string" ? config.default_persona : undefined,
  ) ?? "buddy"

  return {
    personas,
    commands,
    configuredDefault,
    configuredModel: parseConfiguredModel(config.model),
    configuredIntent:
      config.default_intent === "learn" || config.default_intent === "practice" || config.default_intent === "assess"
        ? config.default_intent
        : ("auto" as const),
  } satisfies {
    personas: PersonaConfigOption[]
    commands: PromptCommandOption[]
    configuredDefault: string
    configuredModel: { providerID: string; modelID: string } | undefined
    configuredIntent: TeachingIntentSelection
  }
}

function DirectoryChatPage() {
  const params = Route.useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const [draft, setDraft] = useState("")
  const [draftAttachments, setDraftAttachments] = useState<PromptComposerAttachment[]>([])
  const transcriptRef = useRef<HTMLElement | null>(null)
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)
  const previousBusyRef = useRef(false)
  const teachingSessionInitializedRef = useRef(new Set<string>())
  const workspaceProbeBySessionRef = useRef(
    new Map<string, Promise<Awaited<ReturnType<typeof loadTeachingWorkspace>> | undefined>>(),
  )
  const [stickToBottom, setStickToBottom] = useState(true)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false)
  const [personaCatalog, setPersonaCatalog] = useState<PersonaConfigOption[]>([])
  const [slashCommands, setSlashCommands] = useState<PromptCommandOption[]>([])
  const [defaultPersona, setDefaultPersona] = useState("buddy")
  const [defaultIntent, setDefaultIntent] = useState<TeachingIntentSelection>("auto")
  const [configuredModel, setConfiguredModel] = useState<{ providerID: string; modelID: string } | undefined>(undefined)
  const [selectedThinking, setSelectedThinking] = useState("default")
  const [pendingSuggestionOverride, setPendingSuggestionOverride] = useState<
    | {
        label: string
        prompt: string
        intent?: TeachingIntent
        activityBundleId?: string
        focusGoalIds: string[]
      }
    | undefined
  >(undefined)

  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(params.directory)
    } catch {
      return ""
    }
  }, [params.directory])

  const openProjects = useChatStore((state) => state.openProjects)
  const streamStatus = useChatStore((state) => state.streamStatus)
  const allDirectoryStates = useChatStore((state) => state.directories)
  const directoryState = useChatStore((state) => (decodedDirectory ? state.directories[decodedDirectory] : undefined))
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
  const teachingRuntime = useTeachingRuntime()

  const sessionID = directoryState?.sessionID
  const showHeaderSidebarToggle = !(platform.platform === "desktop" && platform.os === "macos")
  const sessions = directoryState?.sessions ?? []
  const sessionFamily = useMemo(() => getSessionFamily(sessions, sessionID), [sessionID, sessions])
  const sessionTitle = sessionFamily.current?.title ?? directoryState?.sessionTitle ?? "New thread"
  const parentSession = useMemo(
    () =>
      sessionFamily.current?.parentID
        ? sessionFamily.family.find((session) => session.id === sessionFamily.current?.parentID)
        : undefined,
    [sessionFamily.current?.parentID, sessionFamily.family],
  )
  const validOpenProjects = useMemo(
    () => openProjects.filter((directory) => directory && directory !== "/"),
    [openProjects],
  )
  const hasRegisteredProject = useMemo(
    () => !!decodedDirectory && validOpenProjects.includes(decodedDirectory),
    [decodedDirectory, validOpenProjects],
  )
  const messages = directoryState?.messages ?? []
  const providers = directoryState?.providers ?? []
  const providerDefault = directoryState?.providerDefault ?? {}
  const connectedProviders = useMemo(() => providers.filter((provider) => provider.connected), [providers])
  const autoModelSelection = useMemo(() => {
    if (configuredModel) {
      return configuredModel
    }

    for (const provider of connectedProviders) {
      const configuredDefaultModel = providerDefault[provider.id]
      if (configuredDefaultModel && provider.models.some((model) => model.id === configuredDefaultModel)) {
        return {
          providerID: provider.id,
          modelID: configuredDefaultModel,
        }
      }
    }

    const firstProvider = connectedProviders[0]
    const firstModel = firstProvider?.models[0]
    if (!firstProvider || !firstModel) {
      return undefined
    }

    return {
      providerID: firstProvider.id,
      modelID: firstModel.id,
    }
  }, [configuredModel, connectedProviders, providerDefault])
  const visibleModelKeys = useMemo(() => {
    const visible = new Set<string>()
    const latestByFamily = new Map<string, { key: string; releaseTime: number }>()
    const now = Date.now()

    for (const provider of connectedProviders) {
      for (const model of provider.models) {
        const key = modelSelectionKey({
          providerID: provider.id,
          modelID: model.id,
        })
        const releaseTime = model.releaseDate ? Date.parse(model.releaseDate) : Number.NaN

        if (!Number.isFinite(releaseTime)) {
          visible.add(key)
          continue
        }

        if (Math.abs(now - releaseTime) >= MODEL_VISIBILITY_WINDOW_MS) {
          continue
        }

        const family = model.family || model.id
        const familyKey = `${provider.id}:${family}`
        const existing = latestByFamily.get(familyKey)
        if (!existing || releaseTime > existing.releaseTime) {
          latestByFamily.set(familyKey, {
            key,
            releaseTime,
          })
        }
      }
    }

    for (const latest of latestByFamily.values()) {
      visible.add(latest.key)
    }

    if (autoModelSelection) {
      visible.add(modelSelectionKey(autoModelSelection))
    }
    if (selectedModelKey !== "auto") {
      visible.add(selectedModelKey)
    }

    return visible
  }, [autoModelSelection, connectedProviders, selectedModelKey])
  const primaryPersonaOptions = useMemo(() => personaCatalog.filter((persona) => !persona.hidden), [personaCatalog])
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
      {
        key: "auto",
        label: autoLabel,
      },
    ]

    for (const provider of connectedProviders) {
      for (const model of provider.models) {
        const key = modelSelectionKey({
          providerID: provider.id,
          modelID: model.id,
        })
        if (!visibleModelKeys.has(key)) continue

        options.push({
          key,
          label: model.name || model.id,
          group: provider.name,
        })
      }
    }

    return options
  }, [autoModelSelection, connectedProviders, visibleModelKeys])
  const effectiveModelSelection = useMemo(
    () => (selectedModelKey === "auto" ? autoModelSelection : parseConfiguredModel(selectedModelKey)),
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
      {
        key: "default",
        label: "Default",
      },
      ...variants.map((variant) => ({
        key: variant,
        label: variant,
      })),
    ]
  }, [effectiveModelInfo])
  useEffect(() => {
    if (selectedModelKey === "auto") return
    if (modelOptions.some((option) => option.key === selectedModelKey)) return
    if (!decodedDirectory) return
    setSelectedModel(decodedDirectory, "auto")
  }, [decodedDirectory, modelOptions, selectedModelKey, setSelectedModel])
  useEffect(() => {
    if (thinkingOptions.some((option) => option.key === selectedThinking)) return
    setSelectedThinking("default")
  }, [selectedThinking, thinkingOptions])
  const isBusy = directoryState?.isBusy ?? false
  const isReady = directoryState?.isReady ?? false
  const error = directoryState?.error
  const pendingPermissions = directoryState?.pendingPermissions ?? []
  const mcpStatus = directoryState?.mcpStatus ?? {}
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
          entry.status === "failed" || entry.status === "needs_auth" || entry.status === "needs_client_registration",
      ),
    [mcpEntries],
  )
  const sessionsByDirectory = useMemo(
    () =>
      Object.fromEntries(
        validOpenProjects.map((directory) => [directory, allDirectoryStates[directory]?.sessions ?? []]),
      ) as Record<string, SessionInfo[]>,
    [allDirectoryStates, validOpenProjects],
  )
  const sessionStatusByDirectory = useMemo(
    () =>
      Object.fromEntries(
        validOpenProjects.map((directory) => [directory, allDirectoryStates[directory]?.sessionStatusByID ?? {}]),
      ) as Record<string, Record<string, "busy" | "idle">>,
    [allDirectoryStates, validOpenProjects],
  )
  const showDevSessionTrace = import.meta.env.DEV
  const sidebarDirectories = validOpenProjects
  const leftSidebarMaxWidth = typeof window === "undefined" ? SIDEBAR_DEFAULT_MAX_WIDTH : window.innerWidth * 0.3 + 64
  const sessionKey = useMemo(
    () => (decodedDirectory && sessionID ? teachingSessionKey(decodedDirectory, sessionID) : ""),
    [decodedDirectory, sessionID],
  )
  const storedPersona =
    sessionKey ? (teachingRuntime.selectedPersonaBySession[sessionKey] ?? defaultPersona) : defaultPersona
  const storedIntent = sessionKey ? (teachingRuntime.selectedIntentBySession[sessionKey] ?? defaultIntent) : defaultIntent
  const preferredLanguage = sessionKey ? (teachingRuntime.preferredLanguageBySession[sessionKey] ?? "ts") : "ts"
  const teachingWorkspace = sessionKey ? teachingRuntime.workspaceBySession[sessionKey] : undefined
  const selectedPersonaConfig = useMemo(
    () => primaryPersonaOptions.find((persona) => persona.id === storedPersona) ?? primaryPersonaOptions[0],
    [primaryPersonaOptions, storedPersona],
  )
  const selectedPersona = selectedPersonaConfig?.id ?? storedPersona
  const selectedPersonaSurfaces = selectedPersonaConfig?.surfaces ?? DEFAULT_PERSONA_SURFACES
  const selectedPersonaDefaultSurface = selectedPersonaConfig?.defaultSurface ?? "curriculum"
  const selectedPersonaSupportsEditor = selectedPersonaSurfaces.includes("editor")
  const selectedPersonaSupportsFigure = selectedPersonaSurfaces.includes("figure")
  const isInteractiveMode = !!sessionID && !!teachingWorkspace
  const rightSidebarSurface = isSidebarSurface(rightSidebarTab) && selectedPersonaSurfaces.includes(rightSidebarTab)
    ? rightSidebarTab
    : selectedPersonaDefaultSurface
  const editorPanelSizing = rightSidebarSurface === "editor"
  const rightSidebarMinWidth = editorPanelSizing ? RIGHT_SIDEBAR_EDITOR_MIN_WIDTH : RIGHT_SIDEBAR_MIN_WIDTH
  const rightSidebarMaxWidth = editorPanelSizing ? RIGHT_SIDEBAR_EDITOR_MAX_WIDTH : RIGHT_SIDEBAR_MAX_WIDTH
  const rightSidebarDisplayWidth = Math.min(Math.max(rightSidebarWidth, rightSidebarMinWidth), rightSidebarMaxWidth)
  const leftSidebarDisplayWidth = Math.max(leftSidebarWidth, SIDEBAR_MIN_WIDTH)

  useEffect(() => {
    setPendingSuggestionOverride(undefined)
  }, [sessionKey])

  useEffect(() => {
    void loadOpenProjects()
      .then((knownOpenProjects) => preloadProjectSessions(knownOpenProjects))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (decodedDirectory === "/") {
      const fallback = validOpenProjects[0]
      if (fallback) {
        navigate({
          to: "/$directory/chat",
          params: { directory: encodeDirectory(fallback) },
          replace: true,
        })
      } else {
        navigate({
          to: "/chat",
          replace: true,
        })
      }
      return
    }

    if (!decodedDirectory) return

    void ensureDirectorySession(decodedDirectory)
      .then((result) => {
        setActiveDirectory(result.directory)
        if (result.directory === decodedDirectory) return

        navigate({
          to: "/$directory/chat",
          params: { directory: encodeDirectory(result.directory) },
          replace: true,
        })
      })
      .catch((error) => {
        const state = useChatStore.getState()
        if (state.openProjects.includes(decodedDirectory)) {
          setActiveDirectory(decodedDirectory)
          return
        }

        const fallback = state.openProjects[0]
        if (fallback && fallback !== decodedDirectory) {
          navigate({
            to: "/$directory/chat",
            params: { directory: encodeDirectory(fallback) },
            replace: true,
          })
          return
        }

        state.setEntryError(stringifyError(error))
        navigate({
          to: "/chat",
          replace: true,
        })
      })
  }, [decodedDirectory, navigate, setActiveDirectory, validOpenProjects])

  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    let cancelled = false

    loadComposerConfiguration(decodedDirectory)
      .then((configuration) => {
        if (cancelled) return

        setPersonaCatalog(configuration.personas)
        setSlashCommands(configuration.commands)
        setDefaultPersona(configuration.configuredDefault)
        setDefaultIntent(configuration.configuredIntent)
        setConfiguredModel(configuration.configuredModel)
      })
      .catch(() => {
        if (cancelled) return
        setPersonaCatalog([])
        setSlashCommands([])
        setDefaultPersona("buddy")
        setDefaultIntent("auto")
        setConfiguredModel(undefined)
      })

    return () => {
      cancelled = true
    }
  }, [decodedDirectory, hasRegisteredProject])

  function onSettingsModalOpenChange(nextOpen: boolean) {
    setSettingsModalOpen(nextOpen)
    if (nextOpen || !decodedDirectory || !hasRegisteredProject) return

    void loadComposerConfiguration(decodedDirectory)
      .then((configuration) => {
        setPersonaCatalog(configuration.personas)
        setSlashCommands(configuration.commands)
        setDefaultPersona(configuration.configuredDefault)
        setDefaultIntent(configuration.configuredIntent)
        setConfiguredModel(configuration.configuredModel)
      })
      .catch(() => undefined)
  }

  function refreshSlashCommands() {
    if (!decodedDirectory || !hasRegisteredProject) return
    void loadCommandCatalog(decodedDirectory)
      .then((commands) => {
        setSlashCommands(commands)
      })
      .catch(() => undefined)
  }

  function refreshMcpStatus() {
    if (!decodedDirectory || !hasRegisteredProject) return
    void loadMcpStatus(decodedDirectory).catch(() => undefined)
  }

  async function syncTeachingRuntimeSelection(input?: {
    directory?: string
    sessionID?: string
    sessionKey?: string
  }) {
    const activeDirectory = input?.directory ?? decodedDirectory
    const activeSessionID = input?.sessionID ?? sessionID
    const activeSessionKey = input?.sessionKey ?? sessionKey
    if (!activeDirectory || !activeSessionID || !activeSessionKey) return

    try {
      const runtime = await loadTeachingSessionState(activeDirectory, activeSessionID)
      if (!runtime) return
      const teaching = useTeachingRuntime.getState()
      teaching.setSessionPersona(activeSessionKey, runtime.persona)
      teaching.setSessionIntent(activeSessionKey, runtime.intentOverride ?? "auto")
    } catch {
      // Ignore sessions that have not produced Buddy teaching state yet.
    }
  }

  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    const refresh = () => {
      refreshSlashCommands()
      refreshMcpStatus()
    }
    const interval = window.setInterval(refresh, 30_000)
    const onFocus = () => {
      refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      refresh()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [decodedDirectory, hasRegisteredProject])

  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    const sync = startChatSync({
      directory: decodedDirectory,
      onStatus(status) {
        setStreamStatus(status)
      },
      onOpen() {
        if (!decodedDirectory || decodedDirectory === "/") return
        void resyncDirectory(decodedDirectory)
      },
      onEvent(event: GlobalEvent) {
        const directory = event.directory
        if (!directory || directory === "global") {
          if (event.payload.type === "server.connected") {
            if (!decodedDirectory || decodedDirectory === "/") {
              return
            }
            void resyncDirectory(decodedDirectory)
          }
          return
        }

        const payload = event.payload
        const properties = payload.properties

        if (payload.type === "session.created" || payload.type === "session.updated") {
          applySessionUpdated(directory, properties.info as SessionInfo)
          return
        }

        if (payload.type === "session.status") {
          const rawStatus = properties.status
          const statusType =
            typeof rawStatus === "string"
              ? rawStatus
              : rawStatus && typeof rawStatus === "object" && "type" in rawStatus
                ? String((rawStatus as { type?: unknown }).type ?? "idle")
                : "idle"

          const normalizedStatus = statusType === "busy" || statusType === "retry" ? "busy" : "idle"
          applySessionStatus(directory, String(properties.sessionID ?? ""), normalizedStatus)
          return
        }

        if (payload.type === "session.error") {
          const erroredSessionID =
            typeof properties.sessionID === "string" && properties.sessionID ? properties.sessionID : undefined

          if (erroredSessionID) {
            applySessionStatus(directory, erroredSessionID, "idle")
          }

          setDirectoryError(directory, readSessionErrorMessage(properties.error))
          return
        }

        if (payload.type === "message.updated") {
          const info = properties.info as MessageInfo
          applyMessageUpdated(directory, info)
          if (info.role === "assistant" && !info.error && (!!info.finish || !!info.time.completed)) {
            clearDirectoryError(directory)
          }
          const activeSessionID = useChatStore.getState().directories[directory]?.sessionID
          if (info.role === "assistant" && info.sessionID && info.sessionID !== activeSessionID) {
            useUiPreferences.getState().markUnread(directory, info.sessionID)
          }
          return
        }

        if (payload.type === "message.part.updated") {
          applyPartUpdated(directory, properties.part as MessagePart)
          return
        }

        if (payload.type === "message.part.delta") {
          applyPartDelta(directory, {
            sessionID: String(properties.sessionID ?? ""),
            messageID: String(properties.messageID ?? ""),
            partID: String(properties.partID ?? ""),
            field: String(properties.field ?? ""),
            delta: String(properties.delta ?? ""),
          })
          return
        }

        if (payload.type === "permission.asked") {
          applyPermissionAsked(directory, properties as PermissionRequest)
          return
        }

        if (payload.type === "permission.replied") {
          applyPermissionReplied(directory, String(properties.requestID ?? ""))
        }
      },
    })

    return () => {
      sync.stop()
      setStreamStatus("idle")
    }
  }, [
    decodedDirectory,
    hasRegisteredProject,
    applyMessageUpdated,
    applyPermissionAsked,
    applyPermissionReplied,
    applyPartDelta,
    applyPartUpdated,
    applySessionStatus,
    applySessionUpdated,
    clearDirectoryError,
    setDirectoryError,
    setStreamStatus,
  ])

  useEffect(() => {
    setStickToBottom(true)
  }, [sessionID])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    clearUnread(decodedDirectory, sessionID)
  }, [clearUnread, decodedDirectory, sessionID])

  useEffect(() => {
    if (!stickToBottom) return
    const container = transcriptRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto",
    })
  }, [messages, isBusy, stickToBottom])

  useEffect(() => {
    if (!decodedDirectory || !sessionID || !sessionKey || teachingWorkspace) return
    if (workspaceProbeBySessionRef.current.has(sessionKey)) return

    let cancelled = false
    const probe = probeTeachingWorkspace({
      directory: decodedDirectory,
      sessionID,
    })
      .then((workspace) => {
        if (!workspace) return undefined
        if (cancelled) return undefined
        const teaching = useTeachingRuntime.getState()
        teaching.setWorkspace(sessionKey, workspace)
        teaching.setSaveError(sessionKey, undefined)
        return workspace
      })
      .catch(() => {
        // No workspace exists yet for normal chat sessions. Ignore background probe failures.
        return undefined
      })
      .finally(() => {
        workspaceProbeBySessionRef.current.delete(sessionKey)
      })

    workspaceProbeBySessionRef.current.set(sessionKey, probe)

    return () => {
      cancelled = true
    }
  }, [decodedDirectory, isBusy, messages.length, sessionID, sessionKey, teachingWorkspace])

  useEffect(() => {
    void syncTeachingRuntimeSelection()
  }, [decodedDirectory, sessionID, sessionKey])

  function onTranscriptScroll(event: UIEvent<HTMLElement>) {
    const node = event.currentTarget
    const distanceFromBottom = node.scrollHeight - (node.scrollTop + node.clientHeight)
    setStickToBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
  }

  useEffect(() => {
    if (!decodedDirectory || !sessionID || !sessionKey || !teachingWorkspace || !selectedPersonaSupportsEditor) return

    if (!teachingSessionInitializedRef.current.has(sessionKey)) {
      teachingSessionInitializedRef.current.add(sessionKey)
      const ui = useUiPreferences.getState()
      ui.setRightSidebarTab("editor")
      ui.setRightSidebarOpen(true)
      if (ui.rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
        ui.setRightSidebarWidth(640)
      }
    }
  }, [decodedDirectory, sessionID, sessionKey, selectedPersonaSupportsEditor, teachingWorkspace])

  useEffect(() => {
    if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey || !teachingWorkspace) {
      previousBusyRef.current = isBusy
      return
    }

    if (previousBusyRef.current && !isBusy) {
      void loadTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
      })
        .then((workspace) => {
          useTeachingRuntime.getState().applyRemoteSnapshot(sessionKey, workspace)
        })
        .catch((workspaceError) => {
          useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(workspaceError))
        })
    }

    previousBusyRef.current = isBusy
  }, [decodedDirectory, isBusy, isInteractiveMode, sessionID, sessionKey, teachingWorkspace])

  useEffect(() => {
    if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey || !teachingWorkspace || !isBusy) {
      return
    }

    const activeDirectory = decodedDirectory
    const activeSessionID = sessionID
    let cancelled = false
    let refreshInFlight = false

    async function refreshWorkspace() {
      if (cancelled || refreshInFlight || saveInFlightRef.current) return

      refreshInFlight = true
      try {
        const workspace = await loadTeachingWorkspace({
          directory: activeDirectory,
          sessionID: activeSessionID,
        })
        if (cancelled) return
        useTeachingRuntime.getState().applyRemoteSnapshot(sessionKey, workspace)
      } catch {
        // Ignore transient refresh failures while the agent is still mid-step.
      } finally {
        refreshInFlight = false
      }
    }

    void refreshWorkspace()
    const interval = window.setInterval(() => {
      void refreshWorkspace()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [decodedDirectory, isBusy, isInteractiveMode, sessionID, sessionKey, teachingWorkspace])

  async function flushTeachingWorkspace(input?: { forceOverwrite?: boolean; language?: TeachingLanguage }) {
    if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey) {
      return true
    }

    if (saveInFlightRef.current) {
      const inFlight = saveInFlightRef.current
      const settled = await inFlight
      if (!settled) return false
    }

    const latest = useTeachingRuntime.getState().workspaceBySession[sessionKey]
    if (!latest) {
      const message = "Teaching workspace is still loading"
      useTeachingRuntime.getState().setSaveError(sessionKey, message)
      return false
    }

    if (latest.conflict && !input?.forceOverwrite) {
      return false
    }

    const nextLanguage = input?.language ?? latest.language
    const hasChanges = latest.code !== latest.savedCode || nextLanguage !== latest.language || !!input?.forceOverwrite

    if (!hasChanges) {
      return true
    }

    const expectedRevision = input?.forceOverwrite && latest.conflict ? latest.conflict.revision : latest.revision
    const requestCode = latest.code

    const task = (async () => {
      useTeachingRuntime.getState().setPendingSave(sessionKey, true)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)

      try {
        const saved = await saveTeachingWorkspace({
          directory: decodedDirectory,
          sessionID,
          code: requestCode,
          expectedRevision,
          relativePath: latest.activeRelativePath,
          language: nextLanguage,
        })

        useTeachingRuntime.getState().applySaveSuccess(sessionKey, {
          requestCode,
          workspace: saved,
        })
        return true
      } catch (saveError) {
        if (saveError instanceof TeachingConflictError) {
          useTeachingRuntime.getState().setConflict(sessionKey, {
            code: saveError.payload.code,
            revision: saveError.payload.revision,
            lessonFilePath: saveError.payload.lessonFilePath,
          })
          return false
        }

        useTeachingRuntime.getState().setPendingSave(sessionKey, false)
        useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(saveError))
        return false
      }
    })()

    saveInFlightRef.current = task

    try {
      return await task
    } finally {
      if (saveInFlightRef.current === task) {
        saveInFlightRef.current = null
      }
    }
  }

  useEffect(() => {
    if (!decodedDirectory || !sessionID || !isInteractiveMode || !sessionKey || !teachingWorkspace) return
    if (teachingWorkspace.conflict) return
    if (teachingWorkspace.code === teachingWorkspace.savedCode) return

    const timeout = window.setTimeout(() => {
      void flushTeachingWorkspace()
    }, 500)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    decodedDirectory,
    isInteractiveMode,
    sessionID,
    sessionKey,
    teachingWorkspace?.code,
    teachingWorkspace?.savedCode,
    teachingWorkspace?.conflict,
  ])

  async function sendRuntimePrompt(input: {
    content: string
    attachments?: PromptComposerAttachment[]
    intent?: TeachingIntent
    activityBundleId?: string
    focusGoalIds?: string[]
  }) {
    if (!decodedDirectory) return false

    const rawAttachments = input.attachments ?? []
    const content = input.content.trim()
    if (!content && rawAttachments.length === 0) return false

    if (selectedPersonaSupportsEditor && isInteractiveMode) {
      const ready = await flushTeachingWorkspace()
      if (!ready) return false
    }

    const modelSelection = effectiveModelSelection
    const variant = selectedThinking !== "default" ? selectedThinking : undefined
    const activeWorkspace = sessionKey ? useTeachingRuntime.getState().workspaceBySession[sessionKey] : undefined
    const teachingContext = await resolveTeachingPromptContext({
      workspace: activeWorkspace,
      pendingWorkspace: sessionKey ? workspaceProbeBySessionRef.current.get(sessionKey) : undefined,
    })

    await sendPrompt(decodedDirectory, content, {
      parts: buildPromptAttachmentParts(rawAttachments),
      persona: selectedPersona,
      intent: input.intent ?? intentOverrideFromSelection(storedIntent),
      activityBundleId: input.activityBundleId,
      focusGoalIds: input.focusGoalIds,
      model: modelSelection,
      variant,
      teaching: teachingContext,
    })
    void syncTeachingRuntimeSelection()
    return true
  }

  async function onSend(input?: { value: string; attachments: PromptComposerAttachment[] }) {
    if (!decodedDirectory) return
    const rawContent = input?.value ?? draft
    const rawAttachments = input?.attachments ?? draftAttachments
    const content = rawContent.trim()
    if (!content && rawAttachments.length === 0) return

    const modelSelection = effectiveModelSelection
    const variant = selectedThinking !== "default" ? selectedThinking : undefined
    const slashCommand = parseSlashCommandInput(rawContent, slashCommands)

    if (slashCommand) {
      const attachmentParts = buildCommandAttachmentParts(rawAttachments)
      setDraft("")
      setDraftAttachments([])
    try {
      await sendCommand(decodedDirectory, slashCommand.command.name, slashCommand.arguments, {
          parts: attachmentParts,
          persona: selectedPersona,
          intent: intentOverrideFromSelection(storedIntent),
          model: modelSelection,
          variant,
        })
        void syncTeachingRuntimeSelection()
      } catch {
        setDraft(rawContent)
        setDraftAttachments(rawAttachments)
      }
      return
    }

    setDraft("")
    setDraftAttachments([])
    try {
      const sent = await sendRuntimePrompt({
        content,
        attachments: rawAttachments,
        intent: pendingSuggestionOverride?.intent,
        activityBundleId: pendingSuggestionOverride?.activityBundleId,
        focusGoalIds: pendingSuggestionOverride?.focusGoalIds,
      })
      if (!sent) {
        setDraft(rawContent)
        setDraftAttachments(rawAttachments)
        return
      }
      setPendingSuggestionOverride(undefined)
    } catch {
      setDraft(rawContent)
      setDraftAttachments(rawAttachments)
    }
  }

  async function onRunLearningPlanAction(action: LearnerCurriculumView["actions"][number]) {
    const override = {
      label: `${action.label}${action.activityBundleLabel ? ` (${action.activityBundleLabel})` : ""}: ${action.reason}`,
      prompt: action.prompt,
      intent: action.intent,
      activityBundleId: action.activityBundleId,
      focusGoalIds: action.focusGoalIds,
    }

    if (sessionKey) {
      teachingRuntime.setSessionIntent(sessionKey, action.intent)
    }

    setPendingSuggestionOverride(override)

    const canSendImmediately =
      !!decodedDirectory &&
      !!sessionKey &&
      !isBusy &&
      draft.trim().length === 0 &&
      draftAttachments.length === 0

    if (canSendImmediately) {
      try {
        const sent = await sendRuntimePrompt({
          content: override.prompt,
          intent: override.intent,
          activityBundleId: override.activityBundleId,
          focusGoalIds: override.focusGoalIds,
        })
        if (sent) {
          setPendingSuggestionOverride(undefined)
          setDraft("")
          setDraftAttachments([])
          return
        }
      } catch {
        // Fall through to staging the override in the composer.
      }
    }

    setDraftAttachments([])
    setDraft(action.prompt)
  }

  async function onUseActivityBundle(bundle: LearnerCurriculumView["activityBundles"][number]) {
    const override = {
      label: `${bundle.label}: ${bundle.description}`,
      prompt: `Use the ${bundle.label} activity for the current learning goal. Keep it grounded in the learner state and current conversation.`,
      intent: bundle.intent,
      activityBundleId: bundle.id,
      focusGoalIds: [],
    }

    if (sessionKey) {
      teachingRuntime.setSessionIntent(sessionKey, bundle.intent)
    }

    setPendingSuggestionOverride(override)

    const canSendImmediately =
      !!decodedDirectory &&
      !!sessionKey &&
      !isBusy &&
      draft.trim().length === 0 &&
      draftAttachments.length === 0

    if (canSendImmediately) {
      try {
        const sent = await sendRuntimePrompt({
          content: override.prompt,
          intent: override.intent,
          activityBundleId: override.activityBundleId,
          focusGoalIds: override.focusGoalIds,
        })
        if (sent) {
          setPendingSuggestionOverride(undefined)
          setDraft("")
          setDraftAttachments([])
          return
        }
      } catch {
        // Fall through to staging the override in the composer.
      }
    }

    setDraftAttachments([])
    setDraft(`Use the ${bundle.label} activity for the current learning goal.`)
  }

  async function onAbort() {
    if (!decodedDirectory) return
    await abortPrompt(decodedDirectory)
  }

  async function onNewSession(targetDirectory = decodedDirectory) {
    if (!targetDirectory) return
    try {
      await startNewSession(targetDirectory)
      if (targetDirectory !== decodedDirectory) {
        onSwitchDirectory(targetDirectory)
      }
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onSelectSession(targetDirectory: string, nextSessionID?: string) {
    if (!targetDirectory) return
    if (!nextSessionID) {
      if (targetDirectory !== decodedDirectory) {
        onSwitchDirectory(targetDirectory)
      }
      return
    }
    try {
      await selectSession(targetDirectory, nextSessionID)
      clearUnread(targetDirectory, nextSessionID)
      if (targetDirectory !== decodedDirectory) {
        onSwitchDirectory(targetDirectory)
      }
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onPermissionReply(requestID: string, reply: "once" | "always" | "reject") {
    if (!decodedDirectory) return
    try {
      await replyPermission({
        directory: decodedDirectory,
        requestID,
        reply,
      })
    } catch {
      // store error is handled by action callers elsewhere; keep UI non-blocking here
    }
  }

  function onSwitchDirectory(nextDirectory: string) {
    if (!nextDirectory) return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(nextDirectory) },
    })
  }

  async function onOpenProject() {
    if (!decodedDirectory) return

    try {
      const picked = await pickProjectDirectory()
      if (!picked) return

      const nextDirectory = await openProject(picked)
      setActiveDirectory(nextDirectory)
      onSwitchDirectory(nextDirectory)
    } catch (error) {
      setDirectoryError(decodedDirectory, stringifyError(error))
    }
  }

  async function onArchiveSession(targetDirectory: string, targetSessionID: string) {
    if (!targetDirectory) return
    try {
      await updateSession({
        directory: targetDirectory,
        sessionID: targetSessionID,
        archivedAt: Date.now(),
      })
      clearDirectorySessionState(targetDirectory, targetSessionID)
      await loadSessions(targetDirectory)
      await loadPermissions(targetDirectory)

      const activeSessionID = useChatStore.getState().directories[targetDirectory]?.sessionID
      if (!activeSessionID) {
        await startNewSession(targetDirectory)
        await loadPermissions(targetDirectory)
        return
      }

      if (activeSessionID !== targetSessionID) {
        await loadMessages(targetDirectory, activeSessionID)
        clearUnread(targetDirectory, activeSessionID)
      }
    } catch {
      // action layers keep directory-level error state
    }
  }

  async function onRenameSession(targetDirectory: string, targetSessionID: string, title: string) {
    if (!targetDirectory) return
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const updated = await updateSession({
        directory: targetDirectory,
        sessionID: targetSessionID,
        title: trimmed,
      })
      applySessionUpdated(targetDirectory, updated)
    } catch {
      // action layers keep directory-level error state
    }
  }

  function onToggleUnreadSession(targetDirectory: string, targetSessionID: string, unread: boolean) {
    if (!targetDirectory) return
    if (unread) {
      markUnread(targetDirectory, targetSessionID)
      return
    }
    clearUnread(targetDirectory, targetSessionID)
  }

  function openCurriculumPanel() {
    setRightSidebarTab("curriculum")
    setRightSidebarOpen(true)
  }

  function openSettingsPanel() {
    setSettingsModalOpen(true)
  }

  function openSkillsPage() {
    navigate({ to: "/skills" })
  }

  async function onSearchMentionFiles(query: string) {
    if (!decodedDirectory) return [] as Array<{ path: string }>

    try {
      const files = await findWorkspaceFiles(decodedDirectory, query, {
        includeDirectories: true,
        limit: 20,
      })
      return files.map((path) => ({ path }))
    } catch {
      return []
    }
  }

  function onPersonaChange(persona: string) {
    if (!sessionKey) return
    teachingRuntime.setSessionPersona(sessionKey, persona)

    const nextPersona = primaryPersonaOptions.find((option) => option.id === persona)
    if (!nextPersona) return

    if (nextPersona.surfaces.includes("editor") && teachingWorkspace) {
      setRightSidebarTab("editor")
      if (rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
        setRightSidebarWidth(640)
      }
      setRightSidebarOpen(true)
      return
    }

    if (!nextPersona.surfaces.includes(rightSidebarSurface)) {
      setRightSidebarTab(nextPersona.defaultSurface)
    }
  }

  function onIntentChange(intent: TeachingIntentSelection) {
    if (!sessionKey) return
    teachingRuntime.setSessionIntent(sessionKey, intent)
  }

  function onTeachingCodeChange(code: string) {
    if (!sessionKey) return
    useTeachingRuntime.getState().updateWorkspaceCode(sessionKey, code)
  }

  function onTeachingSelectionChange(selection?: {
    selectionStartLine?: number
    selectionStartColumn?: number
    selectionEndLine?: number
    selectionEndColumn?: number
  }) {
    if (!sessionKey) return
    useTeachingRuntime.getState().setSelection(sessionKey, selection)
  }

  function onTeachingLanguageChange(language: TeachingLanguage) {
    void flushTeachingWorkspace({ language })
  }

  function onPreferredLanguageChange(language: TeachingLanguage) {
    if (!sessionKey) return
    teachingRuntime.setPreferredLanguage(sessionKey, language)
  }

  async function onTeachingSelectFile(relativePath: string) {
    if (!decodedDirectory || !sessionID || !sessionKey) return
    if (teachingWorkspace?.activeRelativePath === relativePath) return

    const ready = await flushTeachingWorkspace()
    if (!ready) return

    try {
      const workspace = await activateTeachingWorkspaceFile({
        directory: decodedDirectory,
        sessionID,
        relativePath,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
    } catch (fileError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(fileError))
    }
  }

  async function onTeachingCreateFile() {
    if (!decodedDirectory || !sessionID || !sessionKey) return

    const relativePath = window.prompt("New teaching file path", "helpers.ts")?.trim()
    if (!relativePath) return

    const ready = await flushTeachingWorkspace()
    if (!ready) return

    try {
      const workspace = await createTeachingWorkspaceFile({
        directory: decodedDirectory,
        sessionID,
        relativePath,
        activate: true,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
      setRightSidebarTab("editor")
      setRightSidebarOpen(true)
    } catch (fileError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(fileError))
    }
  }

  function onToggleRightSidebar() {
    if (rightSidebarOpen) {
      setRightSidebarOpen(false)
      return
    }

    if (rightSidebarSurface === "editor" && rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      setRightSidebarWidth(640)
    }

    setRightSidebarOpen(true)
  }

  async function onStartInteractiveLesson() {
    if (!decodedDirectory || !sessionID || !sessionKey || !selectedPersonaSupportsEditor) return
    setRightSidebarTab("editor")
    if (rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      setRightSidebarWidth(640)
    }
    setRightSidebarOpen(true)

    try {
      const workspace = await ensureTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
        language: preferredLanguage,
        persona: selectedPersona,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)

      await sendPrompt(
        decodedDirectory,
        `I started an interactive lesson in ${teachingLanguageLabel(preferredLanguage)} mode. Interactive workspace tools are now available. Please use the editor workspace to set up the next hands-on step and guide me there.`,
        {
          persona: selectedPersona,
          intent: intentOverrideFromSelection(storedIntent),
          model: effectiveModelSelection,
          teaching: {
            active: true,
            sessionID: workspace.sessionID,
            lessonFilePath: workspace.lessonFilePath,
            checkpointFilePath: workspace.checkpointFilePath,
            language: workspace.language,
            revision: workspace.revision,
          },
        },
      )
    } catch (interactiveError) {
      const message = stringifyError(interactiveError)
      setDirectoryError(decodedDirectory, message)
      useTeachingRuntime.getState().setSaveError(sessionKey, message)
    }
  }

  function onLoadExternalChanges() {
    if (!sessionKey) return
    useTeachingRuntime.getState().loadConflictVersion(sessionKey)
  }

  function onForceOverwrite() {
    void flushTeachingWorkspace({ forceOverwrite: true })
  }

  async function onTeachingCheckpoint() {
    if (!decodedDirectory || !sessionID || !sessionKey) return
    const ready = await flushTeachingWorkspace()
    if (!ready) return

    try {
      await checkpointTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
      })
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
    } catch (checkpointError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(checkpointError))
    }
  }

  async function onTeachingRestoreAccepted() {
    if (!decodedDirectory || !sessionID || !sessionKey) return

    try {
      const workspace = await restoreTeachingWorkspace({
        directory: decodedDirectory,
        sessionID,
      })
      useTeachingRuntime.getState().setWorkspace(sessionKey, workspace)
      useTeachingRuntime.getState().setSaveError(sessionKey, undefined)
    } catch (restoreError) {
      useTeachingRuntime.getState().setSaveError(sessionKey, stringifyError(restoreError))
    }
  }

  if (!decodedDirectory) {
    return <div className="p-6">Invalid notebook identifier in URL.</div>
  }

  if (!hasRegisteredProject) {
    return <div className="p-6">Opening notebook...</div>
  }

  return (
    <div className="h-full w-full overflow-hidden bg-card">
      <div className="h-full w-full flex min-w-0">
        <div
          className={`relative shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
            leftSidebarOpen ? "" : "pointer-events-none"
          }`}
          style={{ width: `${leftSidebarOpen ? leftSidebarDisplayWidth : 0}px` }}
        >
          <div
            className={`h-full transition-opacity duration-200 ease-out ${
              leftSidebarOpen ? "opacity-100" : "opacity-0"
            }`}
            style={{ width: `${leftSidebarDisplayWidth}px` }}
          >
            <ChatLeftSidebar
              directories={sidebarDirectories}
              currentDirectory={decodedDirectory}
              sessionsByDirectory={sessionsByDirectory}
              activeSessionID={sessionID}
              sessionStatusByDirectory={sessionStatusByDirectory}
              pinnedByDirectory={pinnedByDirectory}
              unreadByDirectory={unreadByDirectory}
              onOpenDirectory={() => {
                void onOpenProject()
              }}
              onNewSession={(targetDirectory) => {
                void onNewSession(targetDirectory)
              }}
              onSelectSession={(targetDirectory, targetSessionID) => {
                void onSelectSession(targetDirectory, targetSessionID)
              }}
              onTogglePin={(targetDirectory, targetSessionID) => togglePinned(targetDirectory, targetSessionID)}
              onToggleUnread={onToggleUnreadSession}
              onArchiveSession={onArchiveSession}
              onRenameSession={onRenameSession}
              onOpenCurriculum={openCurriculumPanel}
              onOpenSkills={openSkillsPage}
              onOpenSettings={openSettingsPanel}
              className="w-full h-full"
            />
          </div>
          {leftSidebarOpen ? (
            <ResizeHandle
              direction="horizontal"
              size={leftSidebarWidth}
              min={SIDEBAR_MIN_WIDTH}
              max={leftSidebarMaxWidth}
              collapseThreshold={SIDEBAR_MIN_WIDTH}
              onResize={setLeftSidebarWidth}
              onCollapse={() => setLeftSidebarOpen(false)}
            />
          ) : null}
        </div>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-background/20">
          <header className="border-b px-3 py-2">
            <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-1.5">
                {showHeaderSidebarToggle ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
                    title={leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
                  >
                    {leftSidebarOpen ? (
                      <LayoutLeftPartialIcon className="size-3.5" />
                    ) : (
                      <LayoutLeftIcon className="size-3.5" />
                    )}
                  </Button>
                ) : null}
                {parentSession ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      void onSelectSession(decodedDirectory, parentSession.id)
                    }}
                    title={`Back to ${parentSession.title || "parent thread"}`}
                  >
                    <ChevronRightIcon className="size-3.5 rotate-180" />
                  </Button>
                ) : null}
                <div className="min-w-0">
                  <h1 className="text-sm md:text-base font-medium truncate">{sessionTitle}</h1>
                  <p className="text-xs text-muted-foreground truncate">local: {getFilename(decodedDirectory)}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <SessionContextUsage messages={messages} providers={providers} />
                <Button
                  variant={hasMcpError ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setMcpDialogOpen(true)}
                  title="View and manage MCPs"
                >
                  {mcpEntries.length > 0
                    ? hasMcpError
                      ? "MCP error"
                      : `MCP ${connectedMcpCount}/${mcpEntries.length}`
                    : "MCP"}
                </Button>
                {showHeaderSidebarToggle ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onToggleRightSidebar}
                    title={rightSidebarOpen ? "Collapse right panel" : "Expand right panel"}
                  >
                    {rightSidebarOpen ? (
                      <LayoutRightPartialIcon className="size-3.5" />
                    ) : (
                      <LayoutRightIcon className="size-3.5" />
                    )}
                  </Button>
                ) : null}

                {showDevSessionTrace && sessionID ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void copyToClipboard(
                        buildSessionTrace({
                          directory: decodedDirectory,
                          sessionID,
                          streamStatus,
                        }),
                      )
                    }}
                  >
                    Copy Trace
                  </Button>
                ) : null}
                {showDevSessionTrace && (
                  <span className="text-xs text-muted-foreground hidden lg:inline">SSE: {streamStatus}</span>
                )}
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
              <section ref={transcriptRef} onScroll={onTranscriptScroll} className="flex-1 min-h-0 overflow-y-auto">
                <div
                  className={`mx-auto w-full max-w-[1080px] px-4 py-4 space-y-4 ${
                    messages.length === 0 && isReady ? "h-full" : ""
                  }`}
                >
                  {!isReady ? (
                    <p className="text-sm text-muted-foreground">Loading conversation history...</p>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col">
                      <ChatEmptyState
                        directoryLabel={getFilename(decodedDirectory)}
                        onUsePrompt={(value) => {
                          setDraftAttachments([])
                          setDraft(value)
                        }}
                        onOpenCurriculum={openCurriculumPanel}
                      />
                    </div>
                  ) : (
                    <ChatTranscript
                      messages={messages}
                      providers={providers}
                      isBusy={isBusy}
                      onOpenSession={(targetSessionID) => {
                        void onSelectSession(decodedDirectory, targetSessionID)
                      }}
                    />
                  )}
                </div>
              </section>

              {error ? (
                <div className="mx-auto w-full max-w-[1080px] px-4 pb-2">
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                </div>
              ) : null}

              {pendingPermissions.length > 0 ? (
                <div className="mx-auto w-full max-w-[1080px] px-4 pb-2">
                  <PermissionDock
                    request={pendingPermissions[0]!}
                    pendingCount={Math.max(0, pendingPermissions.length - 1)}
                    onReply={async (reply) => {
                      await onPermissionReply(pendingPermissions[0]!.id, reply)
                    }}
                  />
                </div>
              ) : null}

              <div className="mx-auto w-full max-w-[1080px] px-4">
                <PromptComposer
                  className="mb-4"
                  value={draft}
                  attachments={draftAttachments}
                  isBusy={isBusy}
                  personaOptions={primaryPersonaOptions.map((persona) => ({ name: persona.id, label: persona.label }))}
                  mentionableAgents={[]}
                  slashCommands={slashCommands}
                  modelOptions={modelOptions}
                  selectedPersona={selectedPersona}
                  selectedIntent={storedIntent}
                  selectedModel={selectedModelKey}
                  pendingSteerLabel={pendingSuggestionOverride?.label}
                  thinkingOptions={thinkingOptions}
                  selectedThinking={selectedThinking}
                  onChange={setDraft}
                  onAttachmentsChange={setDraftAttachments}
                  onPersonaChange={onPersonaChange}
                  onIntentChange={onIntentChange}
                  onClearPendingSteer={() => {
                    setPendingSuggestionOverride(undefined)
                  }}
                  onModelChange={(model) => {
                    if (!decodedDirectory) return
                    setSelectedModel(decodedDirectory, model)
                  }}
                  onThinkingChange={setSelectedThinking}
                  onAbort={() => {
                    void onAbort()
                  }}
                  onNewSession={() => {
                    void onNewSession()
                  }}
                  onOpenMcpDialog={() => {
                    setMcpDialogOpen(true)
                  }}
                  onSearchFiles={onSearchMentionFiles}
                  onRefreshSlashCommands={refreshSlashCommands}
                  historyKey={decodedDirectory}
                  onSubmit={(input) => {
                    void onSend(input)
                  }}
                />
              </div>
            </div>
          </div>
        </main>

        <div
          className={`relative shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
            rightSidebarOpen ? "" : "pointer-events-none"
          }`}
          style={{ width: `${rightSidebarOpen ? rightSidebarDisplayWidth : 0}px` }}
        >
          <div
            className={`h-full transition-opacity duration-200 ease-out ${
              rightSidebarOpen ? "opacity-100" : "opacity-0"
            }`}
            style={{ width: `${rightSidebarDisplayWidth}px` }}
          >
            <ChatRightSidebar
              directory={decodedDirectory}
              activeTab={rightSidebarSurface}
              onTabChange={setRightSidebarTab}
              surfaces={selectedPersonaSurfaces}
              sessionID={sessionID}
              persona={selectedPersona}
              intent={intentOverrideFromSelection(storedIntent)}
              onRunAction={(action) => {
                void onRunLearningPlanAction(action)
              }}
              onUseActivityBundle={(bundle) => {
                void onUseActivityBundle(bundle)
              }}
              editorPanel={
                selectedPersonaSupportsEditor ? (
                  isInteractiveMode ? (
                    teachingWorkspace ? (
                      <TeachingEditorPanel
                        className="h-full min-h-0 flex-1 border-t-0 bg-transparent lg:border-l-0"
                        workspace={teachingWorkspace}
                        isBusy={isBusy}
                        onCodeChange={onTeachingCodeChange}
                        onSelectFile={(relativePath) => {
                          void onTeachingSelectFile(relativePath)
                        }}
                        onCreateFile={() => {
                          void onTeachingCreateFile()
                        }}
                        onSelectionChange={onTeachingSelectionChange}
                        onLanguageChange={onTeachingLanguageChange}
                        onCheckpoint={() => {
                          void onTeachingCheckpoint()
                        }}
                        onRestoreAccepted={() => {
                          void onTeachingRestoreAccepted()
                        }}
                        onLoadExternalChanges={onLoadExternalChanges}
                        onForceOverwrite={onForceOverwrite}
                      />
                    ) : (
                      <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-sm text-muted-foreground">
                        Preparing lesson workspace...
                      </section>
                    )
                  ) : (
                    <section className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-6 py-8">
                      <div className="space-y-2">
                        <h2 className="text-sm font-medium">Interactive Lesson</h2>
                        <p className="text-sm text-muted-foreground">
                          Start an interactive session to create a tracked workspace with files, checkpoints, and
                          server-backed editor diagnostics.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-muted-foreground" htmlFor="interactive-language">
                          Language
                        </label>
                        <select
                          id="interactive-language"
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value={preferredLanguage}
                          onChange={(event) => onPreferredLanguageChange(event.target.value as TeachingLanguage)}
                          disabled={!sessionKey || isBusy}
                        >
                          {TEACHING_LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={() => {
                            void onStartInteractiveLesson()
                          }}
                          disabled={!sessionKey || isBusy}
                        >
                          Start Interactive Lesson
                        </Button>
                      </div>

                      <div className="rounded-lg border border-border/70 bg-background p-3 text-xs text-muted-foreground">
                        Current workspace: not started
                        <br />
                        Selected persona: {selectedPersona}
                      </div>
                    </section>
                  )
                ) : undefined
              }
              figurePanel={
                selectedPersonaSupportsFigure ? <MathFigurePanel className="h-full min-h-0 flex-1" /> : undefined
              }
              onClose={() => setRightSidebarOpen(false)}
              className="w-full h-full"
            />
          </div>
          {rightSidebarOpen ? (
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={rightSidebarDisplayWidth}
              min={rightSidebarMinWidth}
              max={rightSidebarMaxWidth}
              collapseThreshold={RIGHT_SIDEBAR_COLLAPSE_THRESHOLD}
              onResize={setRightSidebarWidth}
              onCollapse={() => setRightSidebarOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <McpDialog
        directory={decodedDirectory}
        open={!!decodedDirectory && mcpDialogOpen}
        onOpenChange={setMcpDialogOpen}
      />
      <SettingsModal directory={decodedDirectory} open={settingsModalOpen} onOpenChange={onSettingsModalOpenChange} />
    </div>
  )
}
