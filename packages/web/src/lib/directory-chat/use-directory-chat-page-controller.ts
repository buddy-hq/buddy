import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { animate, type AnimationPlaybackControls } from "motion"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type UIEvent,
} from "react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import {
  PROMPT_PART_TYPE_TEXT,
  RESOURCE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import type { PromptComposerAttachment, PromptComposerPart } from "@/components/prompt/prompt-types"
import {
  COMPACT_SLASH_COMMAND_ALIASES,
  COMPACT_SLASH_COMMAND_NAME,
  buildQuizSlashPromptParts,
  buildQuizSlashPrompt,
  parseSlashCommandInput,
  QUIZ_SLASH_COMMAND_NAME,
  SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES,
} from "@/components/prompt/slash-autocomplete"
import type { MentionableAgent } from "@/components/prompt/mention-autocomplete"
import type { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import type { DirectoryChatRightSidebar } from "@/components/directory-chat/directory-chat-right-sidebar"
import type { DirectoryChatShell } from "@/components/directory-chat/directory-chat-shell"
import {
  isResourceLocalSlashCommandName,
  parseResourceLocalSlashCommand,
  RESOURCE_COMMAND_ADD,
  RESOURCE_COMMAND_PANEL,
  RESOURCE_COMMAND_REMOVE,
  RESOURCE_COMMAND_REBUILD,
  RESOURCE_COMMAND_USE,
  RESOURCE_LOCAL_SLASH_COMMANDS,
  type ResourceLocalSlashCommand,
} from "../resource-commands"
import { resolveTeachingPromptContext } from "../teaching-context"
import { pickProjectDirectory } from "../directory-picker"
import { decodeDirectory, encodeDirectory } from "../directory-token"
import {
  type LearnerCurriculumView,
  abortPrompt,
  closeOpenProject,
  ensureDirectorySession,
  findWorkspaceFiles,
  loadMessages,
  createManagedNotebook,
  compactSession,
  openInboxNotebook,
  openProject,
  rejectQuestion,
  reorderOpenProjects,
  replyPermission,
  replyQuestion,
  selectSession,
  sendCommand,
  sendPrompt,
  startNewSessionDraft,
  updateSession,
} from "../../state/chat-actions"
import { addResource, rebuildResource, removeResource } from "../../state/resource-actions"
import {
  invalidateResourcesQueries,
  isSupportedReadingResourcePath,
  readingResourceBlobQueryOptions,
  resourcesQueryOptions,
} from "../../state/resources-query"
import { setOpenProjectsQueryData } from "../../state/bootstrap-query"
import {
  directoryChatQueryKeys,
  removeDirectoryChatQueries,
  removeDirectoryPermissionQueryData,
  removeDirectoryQuestionQueryData,
  upsertDirectorySessionQueryData,
} from "../../state/directory-chat-query"
import { teachingSessionStateQueryOptions } from "../../state/teaching-session-query"
import {
  clonePromptDraft,
  createTextPromptDraft,
  getPromptDraft,
  getPromptScopeKey,
  usePromptStore,
} from "../../state/prompt-store"
import { getModelSelectionScopeKey } from "../../state/model-selection-store"
import { useChatStore } from "../../state/chat-store"
import { useUiPreferences } from "../../state/ui-preferences"
import { shallow } from "zustand/shallow"
import { stringifyError } from "../../state/teaching-actions"
import {
  intentFromSelection,
  useTeachingRuntime,
  type TeachingIntent,
} from "../../state/teaching-runtime"
import { buildCommandAttachmentParts, buildPromptSubmissionParts } from "./chat-prompt-helpers"
import { useDirectoryChatState } from "./use-directory-chat-state"
import { useChatSync } from "./use-chat-sync"
import { useChatConfig } from "./use-chat-config"
import { useTeachingWorkspace } from "./use-teaching-workspace"
import { getRightSidebarDefaultWidth, RIGHT_SIDEBAR_EDITOR_MIN_WIDTH } from "./right-sidebar-layout"
import type { SidebarResourceTarget } from "@/components/layout/chat-left-sidebar/resources-section"
import { useQuestionSetSidebarActions } from "@/components/question-set/use-question-set-sidebar-actions"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"

const BOTTOM_THRESHOLD_PX = 96
const SIDEBAR_MIN_WIDTH = 220

function canScrollElement(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight > 1
}

function distanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight - el.scrollTop
}
const EMPTY_MENTIONABLE_AGENTS: MentionableAgent[] = []
const MIN_TRANSCRIPT_SCROLL_DURATION_S = 0.08
const MAX_TRANSCRIPT_SCROLL_DURATION_S = 0.24
const TRANSCRIPT_SCROLL_SPEED_PX_PER_S = 1200
const SMOOTH_FOLLOW_LERP = 0.12
const E2E_BACKEND_COMMAND_NAME = "e2e-backend-command"
const TRANSCRIPT_THREAD_SWITCH_SNAP_WINDOW_MS = 350
const COMPACT_SESSION_MISSING_MODEL_ERROR = "Select a model before compacting this session."
const COMPACT_SESSION_MISSING_SESSION_ERROR = "Start a session before compacting it."

type DirectoryChatPageControllerProps = {
  directoryToken: string
}

type DirectoryChatShellProps = ComponentProps<typeof DirectoryChatShell>
type DirectoryChatMainPaneProps = ComponentProps<typeof DirectoryChatConversationPane>
type DirectoryChatRightSidebarProps = ComponentProps<typeof DirectoryChatRightSidebar>

type ReadyDirectoryChatPageControllerState = {
  status: "ready"
  leftSidebarProps: ComponentProps<typeof ChatLeftSidebar>
  mainPaneProps: DirectoryChatMainPaneProps
  rightSidebarProps: DirectoryChatRightSidebarProps
  shellProps: Omit<
    DirectoryChatShellProps,
    "leftSidebar" | "mainPane" | "rightSidebar" | "createTeachingFileDialog"
  >
  dialogProps: ComponentProps<typeof CreateTeachingFileDialog>
}

export type DirectoryChatPageControllerState =
  | { status: "invalid" }
  | { status: "opening" }
  | ReadyDirectoryChatPageControllerState

export function useDirectoryChatPageController(
  props: DirectoryChatPageControllerProps,
): DirectoryChatPageControllerState {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const transcriptRef = useRef<HTMLElement>(null)
  const transcriptScrollAnimationRef = useRef<AnimationPlaybackControls | null>(null)
  const smoothFollowRafRef = useRef<number | null>(null)
  const smoothFollowingRef = useRef(false)
  const stickToBottomRef = useRef(true)
  const transcriptBusyRef = useRef(false)
  const transcriptThreadSwitchSnapUntilRef = useRef(0)
  const closingDirectoryRef = useRef<string | undefined>(undefined)
  const previousDirectoryRef = useRef<string | undefined>(undefined)
  const autoScrollMarkerRef = useRef<{ top: number; time: number } | undefined>(undefined)
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settlingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [stickToBottom, setStickToBottom] = useState(true)
  const [resourcesRefreshToken, setResourcesRefreshToken] = useState(0)
  const [systemPromptRefreshToken, setSystemPromptRefreshToken] = useState(0)
  const [pendingSuggestionOverride, setPendingSuggestionOverride] = useState<
    | {
        label: string
        prompt: string
        intent?: TeachingIntent
        focusGoalIds: string[]
      }
    | undefined
  >(undefined)
  const [isStartingInteractiveLesson, setIsStartingInteractiveLesson] = useState(false)
  const [createFileDialogOpen, setCreateFileDialogOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(props.directoryToken)
    } catch {
      return ""
    }
  }, [props.directoryToken])

  const showDevSessionTrace = false
  const showCapabilitiesSidebarTab = showDevSessionTrace
  const showSystemPromptSidebarTab = showDevSessionTrace
  const showSnapshotSidebarTab = showDevSessionTrace
  const showPaletteSidebarTab = showDevSessionTrace

  const openProjects = useChatStore((state) => state.openProjects, shallow)
  const activeReadingResource = useChatStore((state) =>
    decodedDirectory ? state.activeReadingResourceByDirectory[decodedDirectory] : undefined,
  )
  const linkedSessionByResource = useChatStore((state) => state.linkedSessionByResource)
  const linkReadingResourceSession = useChatStore((state) => state.linkReadingResourceSession)
  const { openWorkspaceQuestionSet } = useQuestionSetSidebarActions()
  const hasRegisteredProject = useMemo(
    () =>
      !!decodedDirectory && openProjects.filter((d) => d && d !== "/").includes(decodedDirectory),
    [decodedDirectory, openProjects],
  )

  const chatConfig = useChatConfig({ decodedDirectory, hasRegisteredProject })

  const cs = useDirectoryChatState({
    decodedDirectory,
    agentCatalog: chatConfig.agentCatalog,
    defaultAgent: chatConfig.defaultAgent,
    configuredModel: chatConfig.configuredModel,
    autoCompactionEnabled: chatConfig.autoCompactionEnabled,
    personaCatalog: chatConfig.personaCatalog,
    defaultPersona: chatConfig.defaultPersona,
    defaultIntent: chatConfig.defaultIntent,
    showSystemPromptSidebarTab,
    showCapabilitiesSidebarTab,
    showPaletteSidebarTab,
  })
  const {
    clearUnread,
    migrateWorkspaceDraft,
    currentAgentName,
    selectedThinking,
    sessionID,
    sessionKey,
    rightSidebarWidth,
    setRightSidebarOpen,
    setRightSidebarTab,
    setRightSidebarWidth,
    setActiveDirectory,
    pushRecentModelKey,
    setSelectedAgent,
    setSelectedModel,
    setSelectedVariant,
    validOpenProjects,
  } = cs

  const { slashCommands } = chatConfig
  const slashCommandCandidates = useMemo(() => {
    const candidates = new Map<string, { name: string; aliases?: string[] }>()
    for (const name of SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES) {
      candidates.set(name, { name })
    }
    candidates.set(COMPACT_SLASH_COMMAND_NAME, {
      name: COMPACT_SLASH_COMMAND_NAME,
      aliases: [...COMPACT_SLASH_COMMAND_ALIASES],
    })
    if (import.meta.env.VITE_BUDDY_E2E === "1") {
      candidates.set(E2E_BACKEND_COMMAND_NAME, { name: E2E_BACKEND_COMMAND_NAME })
    }
    for (const command of RESOURCE_LOCAL_SLASH_COMMANDS) {
      candidates.set(command.name, { name: command.name })
    }
    for (const command of slashCommands) {
      candidates.set(command.name, { name: command.name })
    }
    return Array.from(candidates.values())
  }, [slashCommands])

  const teachingWs = useTeachingWorkspace({
    decodedDirectory,
    sessionID,
    sessionKey,
    isInteractiveMode: cs.isInteractiveMode,
    isBusy: cs.isBusy,
    messages: cs.messages,
    selectedPersonaSupportsEditor: cs.selectedPersonaSupportsEditor,
    selectedPersona: cs.selectedPersona,
    storedIntent: cs.storedIntent,
    preferredLanguage: cs.preferredLanguage,
    effectiveModelSelection: cs.effectiveModelSelection,
    setDirectoryError: cs.setDirectoryError,
    setRightSidebarTab: cs.setRightSidebarTab,
    setRightSidebarOpen: cs.setRightSidebarOpen,
    setRightSidebarWidth: cs.setRightSidebarWidth,
    rightSidebarWidth: cs.rightSidebarWidth,
    setIsStartingInteractiveLesson,
  })

  useChatSync({
    decodedDirectory,
    hasRegisteredProject,
    applySessionUpdated: cs.applySessionUpdated,
    applySessionStatus: cs.applySessionStatus,
    applyMessageUpdated: cs.applyMessageUpdated,
    applyPartUpdated: cs.applyPartUpdated,
    applyPartDelta: cs.applyPartDelta,
    applyPermissionAsked: cs.applyPermissionAsked,
    applyPermissionReplied: cs.applyPermissionReplied,
    applyQuestionAsked: cs.applyQuestionAsked,
    applyQuestionResolved: cs.applyQuestionResolved,
    clearDirectoryError: cs.clearDirectoryError,
    setDirectoryError: cs.setDirectoryError,
    setStreamStatus: cs.setStreamStatus,
    setSystemPromptRefreshToken,
    refreshSlashCommands: chatConfig.refreshSlashCommands,
    refreshMcpStatus: chatConfig.refreshMcpStatus,
  })

  type PromptSnapshot = ReturnType<typeof clonePromptDraft> & {
    key: string
  }

  function readPromptSnapshot() {
    return {
      key: cs.promptKey,
      ...clonePromptDraft(getPromptDraft(usePromptStore.getState(), cs.promptKey)),
    } satisfies PromptSnapshot
  }

  function restorePromptSnapshot(snapshot: PromptSnapshot) {
    const liveSessionID = decodedDirectory
      ? useChatStore.getState().directories[decodedDirectory]?.sessionID
      : undefined
    const livePromptKey = getPromptScopeKey(decodedDirectory, liveSessionID)
    const restoreKeys = new Set([snapshot.key, livePromptKey])
    const nextDraft = {
      value: snapshot.value,
      parts: snapshot.parts,
      attachments: snapshot.attachments,
      cursor: snapshot.cursor,
    }

    for (const key of restoreKeys) {
      cs.setPromptDraft(key, nextDraft)
    }
  }

  function stagePromptText(value: string) {
    const nextDraft = createTextPromptDraft(value)
    cs.setPromptDraft(cs.promptKey, nextDraft)
  }

  const stopTranscriptScrollAnimation = useCallback(() => {
    transcriptScrollAnimationRef.current?.stop()
    transcriptScrollAnimationRef.current = null
  }, [])

  const stopSmoothFollow = useCallback(() => {
    if (smoothFollowRafRef.current !== null) {
      cancelAnimationFrame(smoothFollowRafRef.current)
      smoothFollowRafRef.current = null
    }
    smoothFollowingRef.current = false
  }, [])

  function markAutoScroll(el: HTMLElement) {
    autoScrollMarkerRef.current = {
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      time: Date.now(),
    }
    if (autoScrollTimerRef.current) clearTimeout(autoScrollTimerRef.current)
    autoScrollTimerRef.current = setTimeout(() => {
      autoScrollMarkerRef.current = undefined
      autoScrollTimerRef.current = undefined
    }, 1500)
  }

  function isAutoScroll(el: HTMLElement) {
    const a = autoScrollMarkerRef.current
    if (!a) return false
    if (Date.now() - a.time > 1500) {
      autoScrollMarkerRef.current = undefined
      return false
    }
    return Math.abs(el.scrollTop - a.top) < 2
  }

  function updateOverflowAnchor(el: HTMLElement | null) {
    if (!el) return
    el.style.overflowAnchor = stickToBottomRef.current ? "none" : "auto"
  }

  const startSmoothFollow = useCallback(() => {
    if (smoothFollowRafRef.current !== null) return

    smoothFollowingRef.current = true

    const follow = () => {
      const container = transcriptRef.current
      if (!container || !stickToBottomRef.current) {
        smoothFollowRafRef.current = null
        smoothFollowingRef.current = false
        return
      }

      const target = Math.max(0, container.scrollHeight - container.clientHeight)
      const current = container.scrollTop
      const distance = target - current

      if (distance < 1) {
        container.scrollTop = target
        smoothFollowRafRef.current = null
        smoothFollowingRef.current = false
        return
      }

      container.scrollTop = current + distance * SMOOTH_FOLLOW_LERP
      smoothFollowRafRef.current = requestAnimationFrame(follow)
    }

    smoothFollowRafRef.current = requestAnimationFrame(follow)
  }, [])

  const animateTranscriptScrollToBottom = useCallback(() => {
    const container = transcriptRef.current
    if (!container) return

    const targetScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const currentScrollTop = container.scrollTop

    if (Math.abs(targetScrollTop - currentScrollTop) < 1) {
      stopTranscriptScrollAnimation()
      return
    }

    if (targetScrollTop <= currentScrollTop) {
      stopTranscriptScrollAnimation()
      container.scrollTop = targetScrollTop
      return
    }

    stopTranscriptScrollAnimation()
    const duration = Math.max(
      MIN_TRANSCRIPT_SCROLL_DURATION_S,
      Math.min(
        MAX_TRANSCRIPT_SCROLL_DURATION_S,
        Math.abs(targetScrollTop - currentScrollTop) / TRANSCRIPT_SCROLL_SPEED_PX_PER_S,
      ),
    )
    transcriptScrollAnimationRef.current = animate(currentScrollTop, targetScrollTop, {
      duration,
      ease: "linear",
      onUpdate: (latest) => {
        const nextContainer = transcriptRef.current
        if (!nextContainer) return
        nextContainer.scrollTop = Math.max(currentScrollTop, Math.min(targetScrollTop, latest))
      },
      onComplete: () => {
        transcriptScrollAnimationRef.current = null
      },
    })
  }, [stopTranscriptScrollAnimation])

  const snapTranscriptToBottom = useCallback(() => {
    const container = transcriptRef.current
    if (!container) return false
    stopTranscriptScrollAnimation()
    stopSmoothFollow()
    container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
    markAutoScroll(container)
    return true
  }, [stopSmoothFollow, stopTranscriptScrollAnimation])

  const syncTranscriptToBottom = useCallback(() => {
    if (!stickToBottomRef.current) return
    if (Date.now() < transcriptThreadSwitchSnapUntilRef.current) {
      snapTranscriptToBottom()
      return
    }
    if (transcriptBusyRef.current || settlingRef.current) {
      stopTranscriptScrollAnimation()
      startSmoothFollow()
      return
    }
    stopSmoothFollow()
    animateTranscriptScrollToBottom()
  }, [
    animateTranscriptScrollToBottom,
    snapTranscriptToBottom,
    stopTranscriptScrollAnimation,
    startSmoothFollow,
    stopSmoothFollow,
  ])

  useEffect(() => {
    setPendingSuggestionOverride(undefined)
  }, [sessionKey])

  useEffect(() => {
    const previousDirectory = previousDirectoryRef.current
    previousDirectoryRef.current = decodedDirectory

    if (previousDirectory === undefined || previousDirectory === decodedDirectory) {
      return
    }

    setResourcesRefreshToken(0)
    setSystemPromptRefreshToken(0)
    setPendingSuggestionOverride(undefined)
    setIsStartingInteractiveLesson(false)
    setCreateFileDialogOpen(false)
  }, [decodedDirectory])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    migrateWorkspaceDraft(decodedDirectory, sessionID)
    useTeachingRuntime.getState().migrateWorkspaceSelection(decodedDirectory, sessionID)
  }, [decodedDirectory, migrateWorkspaceDraft, sessionID])

  useEffect(() => {
    if (!decodedDirectory) {
      return
    }

    const pendingArtifactID = useWorkspaceQuestionSetPanelStore
      .getState()
      .consumePendingOpen(decodedDirectory)
    if (!pendingArtifactID) {
      return
    }

    openWorkspaceQuestionSet({
      directory: decodedDirectory,
      artifactID: pendingArtifactID,
      fallbackTab: cs.selectedPersonaDefaultSurface,
    })
  }, [cs.selectedPersonaDefaultSurface, decodedDirectory, openWorkspaceQuestionSet])

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
        navigate({ to: "/chat", replace: true })
      }
      return
    }

    if (!decodedDirectory) return

    if (closingDirectoryRef.current === decodedDirectory && !hasRegisteredProject) {
      const fallback = validOpenProjects[0]
      if (fallback) {
        navigate({
          to: "/$directory/chat",
          params: { directory: encodeDirectory(fallback) },
          replace: true,
        })
      } else {
        navigate({ to: "/chat", replace: true })
      }
      closingDirectoryRef.current = undefined
      return
    }

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
        navigate({ to: "/chat", replace: true })
      })
  }, [decodedDirectory, hasRegisteredProject, navigate, setActiveDirectory, validOpenProjects])

  useEffect(() => {
    const closingDirectory = closingDirectoryRef.current
    if (!closingDirectory) return
    if (closingDirectory === decodedDirectory) return
    closingDirectoryRef.current = undefined
  }, [decodedDirectory])

  useEffect(() => {
    transcriptThreadSwitchSnapUntilRef.current =
      Date.now() + TRANSCRIPT_THREAD_SWITCH_SNAP_WINDOW_MS
    stopTranscriptScrollAnimation()
    stopSmoothFollow()
    setStickToBottom(true)
  }, [sessionID, stopSmoothFollow, stopTranscriptScrollAnimation])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    clearUnread(decodedDirectory, sessionID)
  }, [clearUnread, decodedDirectory, sessionID])

  useEffect(() => {
    stickToBottomRef.current = stickToBottom
  }, [stickToBottom])

  useEffect(() => {
    transcriptBusyRef.current = cs.isBusy
    if (cs.isBusy) {
      settlingRef.current = false
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = undefined
      }
    } else {
      settlingRef.current = true
      settleTimerRef.current = setTimeout(() => {
        settlingRef.current = false
        settleTimerRef.current = undefined
      }, 300)
    }
  }, [cs.isBusy])

  useLayoutEffect(() => {
    syncTranscriptToBottom()
  }, [cs.messages, cs.isBusy, syncTranscriptToBottom])

  const scrollTranscriptToBottom = useCallback(() => {
    syncTranscriptToBottom()
  }, [syncTranscriptToBottom])

  const handleOpenCurrentDirectorySession = useCallback(
    (targetSessionID: string) => {
      if (!decodedDirectory) return

      void (async () => {
        try {
          await selectSession(decodedDirectory, targetSessionID)
          clearUnread(decodedDirectory, targetSessionID)
        } catch {
          // Store already captures and displays errors.
        }
      })()
    },
    [clearUnread, decodedDirectory],
  )

  useLayoutEffect(() => {
    const container = transcriptRef.current
    if (!container) return
    const content = container.firstElementChild
    if (!(content instanceof HTMLElement)) return

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return
      snapTranscriptToBottom()
    })
    observer.observe(container)
    observer.observe(content)

    return () => {
      observer.disconnect()
    }
  }, [snapTranscriptToBottom])

  useEffect(() => {
    if (stickToBottom) return
    stopTranscriptScrollAnimation()
    stopSmoothFollow()
  }, [stickToBottom, stopTranscriptScrollAnimation, stopSmoothFollow])

  useEffect(() => {
    return () => {
      stopTranscriptScrollAnimation()
      stopSmoothFollow()
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current)
        autoScrollTimerRef.current = undefined
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = undefined
      }
    }
  }, [stopTranscriptScrollAnimation, stopSmoothFollow])

  useEffect(() => {
    const container = transcriptRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return
      const target = e.target instanceof Element ? e.target : undefined
      const nested = target?.closest("[data-scrollable]")
      if (nested && nested !== container) return
      if (!stickToBottomRef.current) return
      stopTranscriptScrollAnimation()
      stopSmoothFollow()
      setStickToBottom(false)
    }

    container.addEventListener("wheel", handleWheel, { passive: true })
    return () => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [stopSmoothFollow, stopTranscriptScrollAnimation])

  useEffect(() => {
    const container = transcriptRef.current
    if (!container) return

    const handleInteraction = () => {
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) {
        if (!stickToBottomRef.current) return
        stopTranscriptScrollAnimation()
        stopSmoothFollow()
        setStickToBottom(false)
      }
    }

    container.addEventListener("pointerdown", handleInteraction, { capture: true })
    return () => {
      container.removeEventListener("pointerdown", handleInteraction, { capture: true })
    }
  }, [stopSmoothFollow, stopTranscriptScrollAnimation])

  useEffect(() => {
    const container = transcriptRef.current
    if (!container) return
    container.style.overflowAnchor = stickToBottom ? "none" : "auto"
  }, [stickToBottom])

  const syncTeachingRuntimeSelection = useCallback(
    async (input?: { directory?: string; sessionID?: string; sessionKey?: string }) => {
      const activeDirectory = input?.directory ?? decodedDirectory
      const activeSessionID = input?.sessionID ?? sessionID
      const activeSessionKey = input?.sessionKey ?? sessionKey
      if (!activeDirectory || !activeSessionID || !activeSessionKey) return

      try {
        const runtime = await queryClient.fetchQuery(
          teachingSessionStateQueryOptions(activeDirectory, activeSessionID),
        )
        if (!runtime) return
        const teaching = useTeachingRuntime.getState()
        teaching.setSessionPersona(activeSessionKey, runtime.persona)
        teaching.setSessionIntent(activeSessionKey, runtime.intent ?? "auto")
      } catch {
        // Ignore sessions without Buddy teaching state yet.
      }
    },
    [decodedDirectory, queryClient, sessionID, sessionKey],
  )

  useEffect(() => {
    void syncTeachingRuntimeSelection()
  }, [syncTeachingRuntimeSelection])

  function onSwitchDirectory(nextDirectory: string) {
    if (!nextDirectory) return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(nextDirectory) },
    })
  }

  function seedDraftModelSelection(targetDirectory: string) {
    const scopeKey = getModelSelectionScopeKey(targetDirectory)
    const carryModelKey = cs.selectedModelKey || undefined
    setSelectedAgent(scopeKey, undefined)
    setSelectedModel(scopeKey, carryModelKey)
    setSelectedVariant(scopeKey, undefined)
  }

  async function onNewSession(targetDirectory = decodedDirectory) {
    if (!targetDirectory) return
    try {
      startNewSessionDraft(targetDirectory)
      seedDraftModelSelection(targetDirectory)
      if (targetDirectory !== decodedDirectory) onSwitchDirectory(targetDirectory)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onSelectSession(targetDirectory: string, nextSessionID?: string) {
    if (!targetDirectory) return
    if (!nextSessionID) {
      if (targetDirectory !== decodedDirectory) onSwitchDirectory(targetDirectory)
      return
    }
    try {
      const selection = selectSession(targetDirectory, nextSessionID)
      if (targetDirectory !== decodedDirectory) onSwitchDirectory(targetDirectory)
      await selection
      cs.clearUnread(targetDirectory, nextSessionID)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onPermissionReply(requestID: string, reply: "once" | "always" | "reject") {
    if (!decodedDirectory) return
    try {
      await replyPermission({ directory: decodedDirectory, requestID, reply })
      removeDirectoryPermissionQueryData(queryClient, decodedDirectory, requestID)
    } catch {
      // Store error is handled elsewhere; keep UI non-blocking here.
    }
  }

  async function onQuestionReply(requestID: string, answers: string[][]) {
    if (!decodedDirectory) return
    try {
      await replyQuestion({ directory: decodedDirectory, requestID, answers })
      removeDirectoryQuestionQueryData(queryClient, decodedDirectory, requestID)
    } catch {
      // Store error is handled elsewhere; keep UI non-blocking here.
    }
  }

  async function onQuestionReject(requestID: string) {
    if (!decodedDirectory) return
    try {
      await rejectQuestion({ directory: decodedDirectory, requestID })
      removeDirectoryQuestionQueryData(queryClient, decodedDirectory, requestID)
    } catch {
      // Store error is handled elsewhere; keep UI non-blocking here.
    }
  }

  function reportCurrentDirectoryError(error: unknown) {
    if (!decodedDirectory) return
    cs.setDirectoryError(decodedDirectory, stringifyError(error))
  }

  async function onOpenExistingFolder() {
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      const nextDirectory = await openProject(picked)
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      cs.setActiveDirectory(nextDirectory)
      onSwitchDirectory(nextDirectory)
    } catch (error) {
      reportCurrentDirectoryError(error)
    }
  }

  async function onQuickChat() {
    try {
      const inboxDirectory = await openInboxNotebook()
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      cs.setActiveDirectory(inboxDirectory)
      startNewSessionDraft(inboxDirectory)
      seedDraftModelSelection(inboxDirectory)
      if (inboxDirectory !== decodedDirectory) {
        onSwitchDirectory(inboxDirectory)
      }
    } catch (error) {
      reportCurrentDirectoryError(error)
    }
  }

  async function onCreateNotebook(name: string) {
    try {
      const nextDirectory = await createManagedNotebook(name)
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      cs.setActiveDirectory(nextDirectory)
      startNewSessionDraft(nextDirectory)
      useUiPreferences.getState().setMainPaneTab("chat")
      setLibraryOpen(false)
      seedDraftModelSelection(nextDirectory)
      if (nextDirectory !== decodedDirectory) {
        onSwitchDirectory(nextDirectory)
      }
    } catch (error) {
      reportCurrentDirectoryError(error)
      throw error
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
      cs.removePromptDraft(
        (await import("../../state/prompt-store")).getPromptScopeKey(
          targetDirectory,
          targetSessionID,
        ),
      )
      cs.clearDirectorySessionState(targetDirectory, targetSessionID)
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: directoryChatQueryKeys.sessions(targetDirectory),
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: directoryChatQueryKeys.permissions(targetDirectory),
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: directoryChatQueryKeys.questions(targetDirectory),
          exact: true,
        }),
      ])

      const activeSessionID = useChatStore.getState().directories[targetDirectory]?.sessionID
      if (!activeSessionID) {
        startNewSessionDraft(targetDirectory)
        seedDraftModelSelection(targetDirectory)
        await Promise.all([
          queryClient.refetchQueries({
            queryKey: directoryChatQueryKeys.permissions(targetDirectory),
            exact: true,
          }),
          queryClient.refetchQueries({
            queryKey: directoryChatQueryKeys.questions(targetDirectory),
            exact: true,
          }),
        ])
        return
      }

      if (activeSessionID !== targetSessionID) {
        await loadMessages(targetDirectory, activeSessionID)
        cs.clearUnread(targetDirectory, activeSessionID)
      }
    } catch {
      // Action layers keep directory-level error state.
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
      upsertDirectorySessionQueryData(queryClient, targetDirectory, updated)
      cs.applySessionUpdated(targetDirectory, updated)
    } catch {
      // Action layers keep directory-level error state.
    }
  }

  async function onCloseDirectory(targetDirectory: string) {
    closingDirectoryRef.current = targetDirectory
    const closedDirectory = await closeOpenProject(targetDirectory)
    if (!closedDirectory) {
      if (closingDirectoryRef.current === targetDirectory) {
        closingDirectoryRef.current = undefined
      }
      return
    }
    setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
    await removeDirectoryChatQueries(queryClient, closedDirectory)
    if (closedDirectory !== decodedDirectory) {
      if (closingDirectoryRef.current === targetDirectory) {
        closingDirectoryRef.current = undefined
      }
      return
    }

    const nextDirectory = useChatStore.getState().openProjects[0]
    if (nextDirectory) {
      navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(nextDirectory) },
        replace: true,
      })
      return
    }

    navigate({ to: "/chat", replace: true })
  }

  function onToggleUnreadSession(
    targetDirectory: string,
    targetSessionID: string,
    unread: boolean,
  ) {
    if (!targetDirectory) return
    if (unread) {
      cs.markUnread(targetDirectory, targetSessionID)
      return
    }
    cs.clearUnread(targetDirectory, targetSessionID)
  }

  function openCurriculumPanel() {
    cs.setRightSidebarTab("curriculum")
    cs.setRightSidebarOpen(true)
  }

  function openResourcesPanel() {
    cs.setMainPaneTab("resources")
  }

  function refreshResourcesPanel() {
    if (decodedDirectory) {
      void invalidateResourcesQueries(queryClient, decodedDirectory)
    }
    setResourcesRefreshToken((current) => current + 1)
  }

  function openSettingsPanel() {
    navigate({ to: "/settings", search: { tab: "general" } })
  }

  function openResourceInReadingMode(targetDirectory: string, resource: SidebarResourceTarget) {
    const openingFromLibrary = libraryOpen
    const activeSessionID = useChatStore.getState().directories[targetDirectory]?.sessionID
    const linkedSessionID = resource.resourceID
      ? linkedSessionByResource[`${targetDirectory}::${resource.resourceID}`]
      : undefined

    if (openingFromLibrary) {
      setLibraryOpen(false)
      cs.setMainPaneTab("chat")
    }

    void queryClient.prefetchQuery(resourcesQueryOptions(targetDirectory))
    if (isSupportedReadingResourcePath(resource.path)) {
      void queryClient.prefetchQuery(
        readingResourceBlobQueryOptions(targetDirectory, resource.path),
      )
    }

    void (async () => {
      if (openingFromLibrary) {
        startNewSessionDraft(targetDirectory)
        seedDraftModelSelection(targetDirectory)
      } else if (linkedSessionID && linkedSessionID !== activeSessionID) {
        await selectSession(targetDirectory, linkedSessionID).catch(() => undefined)
      }

      void navigate({
        to: "/$directory/read",
        params: {
          directory: encodeDirectory(targetDirectory),
        },
        search: {
          path: resource.path,
          ...(resource.resourceID ? { resource: resource.resourceID } : {}),
        },
      })
    })()
  }

  function openQuestionSetFromLibrary(
    targetDirectory: string,
    artifactID: string,
    selectedArtifactID?: string,
  ) {
    if (!targetDirectory) {
      return
    }

    if (targetDirectory !== decodedDirectory) {
      if (libraryOpen) {
        setLibraryOpen(false)
        cs.setMainPaneTab("chat")
      }

      useWorkspaceQuestionSetPanelStore.getState().queueQuestionSetOpen(targetDirectory, artifactID)

      void navigate({
        to: "/$directory/chat",
        params: { directory: encodeDirectory(targetDirectory) },
      })
      return
    }

    openWorkspaceQuestionSet({
      directory: targetDirectory,
      artifactID,
      selectedArtifactID,
      fallbackTab: cs.selectedPersonaDefaultSurface,
    })
  }

  const openTeachingEditorPanel = useCallback(() => {
    setRightSidebarTab("editor")
    if (rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      setRightSidebarWidth(getRightSidebarDefaultWidth("editor"))
    }
    setRightSidebarOpen(true)
  }, [rightSidebarWidth, setRightSidebarOpen, setRightSidebarTab, setRightSidebarWidth])

  async function handleResourceCommand(
    command: ResourceLocalSlashCommand,
    input: { rawAttachments: PromptComposerAttachment[] },
  ) {
    if (command.type === RESOURCE_COMMAND_PANEL) {
      openResourcesPanel()
      refreshResourcesPanel()
      return true
    }

    if (command.type === RESOURCE_COMMAND_ADD) {
      await addResource(decodedDirectory, {
        sourcePath: command.path,
        ...(command.alias ? { alias: command.alias } : {}),
      })
      openResourcesPanel()
      refreshResourcesPanel()
      return true
    }

    if (command.type === RESOURCE_COMMAND_REBUILD || command.type === RESOURCE_COMMAND_REMOVE) {
      if (command.type === RESOURCE_COMMAND_REBUILD) {
        await rebuildResource(decodedDirectory, { resourceKey: command.key })
      } else {
        await removeResource(decodedDirectory, { resourceKey: command.key })
      }
      openResourcesPanel()
      refreshResourcesPanel()
      return true
    }

    if (command.type === RESOURCE_COMMAND_USE) {
      const sent = await sendRuntimePrompt({
        content: command.prompt ?? "",
        attachments: input.rawAttachments,
        parts: [{ type: RESOURCE_REFERENCE_PART_TYPE, key: command.key }],
        intent: intentFromSelection(cs.storedIntent),
      })
      if (sent) {
        cs.clearPromptDraft(cs.promptKey)
        return true
      }
      return false
    }

    return false
  }

  async function onSearchMentionFiles(query: string) {
    if (!decodedDirectory) return []
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

  async function sendRuntimePrompt(input: {
    content: string
    attachments?: PromptComposerAttachment[]
    parts?: PromptComposerPart[]
    intent?: TeachingIntent
    focusGoalIds?: string[]
  }) {
    if (!decodedDirectory) return false

    const rawAttachments = input.attachments ?? []
    const promptParts = [...(input.parts ?? [])]
    const hasActiveReadingResourceReference =
      !!activeReadingResource?.resourceID &&
      !promptParts.some(
        (part) =>
          part.type === RESOURCE_REFERENCE_PART_TYPE &&
          part.key === activeReadingResource.resourceID,
      )
    if (hasActiveReadingResourceReference && activeReadingResource.resourceID) {
      promptParts.unshift({
        type: RESOURCE_REFERENCE_PART_TYPE,
        key: activeReadingResource.resourceID,
      })
    }
    const content = input.content.trim()
    const hasStructuredPromptParts = promptParts.some((part) => part.type !== PROMPT_PART_TYPE_TEXT)
    const promptPartsForSubmission = hasStructuredPromptParts ? promptParts : []
    const submissionParts = buildPromptSubmissionParts(promptPartsForSubmission, rawAttachments)
    const contentForSubmission = hasStructuredPromptParts ? "" : content

    if (!contentForSubmission && submissionParts.length === 0) return false

    if (cs.selectedPersonaSupportsEditor && cs.isInteractiveMode) {
      const ready = await teachingWs.flushTeachingWorkspace()
      if (!ready) return false
    }

    const variant = selectedThinking !== "default" ? selectedThinking : undefined
    const intent = input.intent ?? intentFromSelection(cs.storedIntent)
    const activeWorkspace = cs.sessionKey
      ? useTeachingRuntime.getState().workspaceBySession[cs.sessionKey]
      : undefined
    const teachingContext = await resolveTeachingPromptContext({
      workspace: activeWorkspace,
      pendingWorkspace: cs.sessionKey
        ? teachingWs.workspaceProbeBySessionRef.current.get(cs.sessionKey)
        : undefined,
    })

    const submittedSessionID = await sendPrompt(decodedDirectory, contentForSubmission, {
      parts: submissionParts,
      persona: cs.selectedPersona,
      intent,
      focusGoalIds: input.focusGoalIds,
      agent: currentAgentName,
      model: cs.effectiveModelSelection,
      variant,
      teaching: teachingContext,
      ...(activeReadingResource
        ? {
            reading: {
              ...(activeReadingResource.resourceID
                ? { resourceKey: activeReadingResource.resourceID }
                : {}),
              title: activeReadingResource.name,
              path: activeReadingResource.path,
              ...(activeReadingResource.locationLabel
                ? { locationLabel: activeReadingResource.locationLabel }
                : {}),
              ...(activeReadingResource.tocLabel
                ? { tocLabel: activeReadingResource.tocLabel }
                : {}),
              ...(activeReadingResource.pageLabel
                ? { pageLabel: activeReadingResource.pageLabel }
                : {}),
            },
          }
        : {}),
    })

    if (activeReadingResource?.resourceID) {
      linkReadingResourceSession(
        decodedDirectory,
        activeReadingResource.resourceID,
        submittedSessionID,
      )
    }

    setSystemPromptRefreshToken((token) => token + 1)
    void syncTeachingRuntimeSelection()
    return true
  }

  async function onSend() {
    if (!decodedDirectory) return
    const draftSnapshot = readPromptSnapshot()
    const rawContent = draftSnapshot.value
    const promptParts = draftSnapshot.parts
    const rawAttachments = draftSnapshot.attachments
    const content = rawContent.trim()
    if (!content && rawAttachments.length === 0 && promptParts.length === 0) return

    setStickToBottom(true)

    const variant = selectedThinking !== "default" ? selectedThinking : undefined
    const slashCommand = parseSlashCommandInput(rawContent, slashCommandCandidates)

    if (slashCommand) {
      const intent = intentFromSelection(cs.storedIntent)

      if (slashCommand.command.name === "new") {
        cs.clearPromptDraft(cs.promptKey)
        try {
          await onNewSession()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (slashCommand.command.name === "mcp") {
        cs.clearPromptDraft(cs.promptKey)
        navigate({ to: "/settings", search: { tab: "mcps" } })
        return
      }

      if (slashCommand.command.name === QUIZ_SLASH_COMMAND_NAME) {
        cs.clearPromptDraft(cs.promptKey)
        try {
          const sent = await sendRuntimePrompt({
            content: buildQuizSlashPrompt(slashCommand.arguments),
            parts: buildQuizSlashPromptParts(promptParts, slashCommand.arguments),
            attachments: rawAttachments,
            intent: "assess",
          })
          if (!sent) {
            restorePromptSnapshot(draftSnapshot)
            return
          }
          setPendingSuggestionOverride(undefined)
          setSystemPromptRefreshToken((token) => token + 1)
          void syncTeachingRuntimeSelection()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (slashCommand.command.name === COMPACT_SLASH_COMMAND_NAME) {
        if (!cs.effectiveModelSelection) {
          cs.setDirectoryError(decodedDirectory, COMPACT_SESSION_MISSING_MODEL_ERROR)
          return
        }

        if (!sessionID) {
          cs.setDirectoryError(decodedDirectory, COMPACT_SESSION_MISSING_SESSION_ERROR)
          return
        }

        cs.clearPromptDraft(cs.promptKey)
        try {
          await compactSession(decodedDirectory, sessionID, {
            providerID: cs.effectiveModelSelection.providerID,
            modelID: cs.effectiveModelSelection.modelID,
          })
          setSystemPromptRefreshToken((token) => token + 1)
          void syncTeachingRuntimeSelection()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (isResourceLocalSlashCommandName(slashCommand.command.name)) {
        const resourceCommand = parseResourceLocalSlashCommand(rawContent)
        cs.clearPromptDraft(cs.promptKey)
        if (!resourceCommand) {
          restorePromptSnapshot(draftSnapshot)
          return
        }
        try {
          const handled = await handleResourceCommand(resourceCommand, {
            rawAttachments,
          })
          if (handled) return
          restorePromptSnapshot(draftSnapshot)
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      const attachmentParts = buildCommandAttachmentParts(rawAttachments)
      cs.clearPromptDraft(cs.promptKey)
      try {
        await sendCommand(decodedDirectory, slashCommand.command.name, slashCommand.arguments, {
          parts: attachmentParts,
          persona: cs.selectedPersona,
          intent,
          agent: currentAgentName,
          model: cs.effectiveModelSelection,
          variant,
        })
        setSystemPromptRefreshToken((token) => token + 1)
        void syncTeachingRuntimeSelection()
      } catch {
        restorePromptSnapshot(draftSnapshot)
      }
      return
    }

    cs.clearPromptDraft(cs.promptKey)
    try {
      const sent = await sendRuntimePrompt({
        content,
        parts: promptParts,
        attachments: rawAttachments,
        intent: pendingSuggestionOverride?.intent,
        focusGoalIds: pendingSuggestionOverride?.focusGoalIds,
      })
      if (!sent) {
        restorePromptSnapshot(draftSnapshot)
        return
      }
      setPendingSuggestionOverride(undefined)
    } catch {
      restorePromptSnapshot(draftSnapshot)
    }
  }

  async function onRunCurriculumAction(action: LearnerCurriculumView["actions"][number]) {
    const override = {
      label: `${action.label}: ${action.reason}`,
      prompt: action.prompt,
      intent: action.intent,
      focusGoalIds: action.focusGoalIds,
    }

    if (cs.sessionKey) {
      cs.teachingRuntime.setSessionIntent(cs.sessionKey, action.intent)
    }

    setPendingSuggestionOverride(override)

    const currentDraft = getPromptDraft(usePromptStore.getState(), cs.promptKey)
    const canSendImmediately =
      !!decodedDirectory &&
      !!cs.sessionKey &&
      !cs.isBusy &&
      currentDraft.value.trim().length === 0 &&
      currentDraft.attachments.length === 0

    if (canSendImmediately) {
      try {
        const sent = await sendRuntimePrompt({
          content: override.prompt,
          intent: override.intent,
          focusGoalIds: override.focusGoalIds,
        })
        if (sent) {
          setPendingSuggestionOverride(undefined)
          cs.clearPromptDraft(cs.promptKey)
          return
        }
      } catch {
        // Fall through to staging the override in the composer.
      }
    }

    stagePromptText(action.prompt)
  }

  async function onAbort() {
    if (!decodedDirectory) return
    await abortPrompt(decodedDirectory)
  }

  function onTranscriptScroll(event: UIEvent<HTMLElement>) {
    const node = event.currentTarget
    if (!canScrollElement(node)) {
      if (!stickToBottom) setStickToBottom(true)
      updateOverflowAnchor(node)
      return
    }

    const dist = distanceFromBottom(node)

    if (dist <= BOTTOM_THRESHOLD_PX) {
      if (!stickToBottom) setStickToBottom(true)
      updateOverflowAnchor(node)
      return
    }

    if ((transcriptScrollAnimationRef.current || smoothFollowingRef.current) && stickToBottom) {
      return
    }

    if (stickToBottom && isAutoScroll(node)) {
      syncTranscriptToBottom()
      return
    }

    stopTranscriptScrollAnimation()
    setStickToBottom(false)
    updateOverflowAnchor(node)
  }

  function onPersonaChange(persona: string) {
    cs.teachingRuntime.setSessionPersona(cs.sessionKey, persona)

    const nextPersona = cs.primaryPersonaOptions.find((option) => option.id === persona)
    if (!nextPersona) return

    if (cs.rightSidebarActiveTab === "capabilities" && showCapabilitiesSidebarTab) return
    if (cs.rightSidebarActiveTab === "agents-md") return
    if (cs.rightSidebarActiveTab === "diagrams") return
    if (cs.rightSidebarActiveTab === "files") return
    if (cs.rightSidebarActiveTab === "editor") return

    if (nextPersona.surfaces.includes("editor") && cs.teachingWorkspace) {
      openTeachingEditorPanel()
      return
    }

    if (!nextPersona.surfaces.includes(cs.selectedSurfaceTab)) {
      cs.setRightSidebarTab(nextPersona.defaultSurface)
    }
  }

  function onIntentChange(intent: TeachingIntent) {
    cs.teachingRuntime.setSessionIntent(cs.sessionKey, intent)
  }

  function onTeachingCreateFile() {
    if (!decodedDirectory || !cs.sessionID || !cs.sessionKey) return
    setCreateFileDialogOpen(true)
  }

  async function onStartInteractiveLesson() {
    if (
      !decodedDirectory ||
      !cs.sessionID ||
      !cs.sessionKey ||
      !cs.selectedPersonaSupportsEditor ||
      cs.isBusy ||
      isStartingInteractiveLesson
    )
      return

    await teachingWs.onStartInteractiveLesson({
      sessionID: cs.sessionID,
      sessionKey: cs.sessionKey,
      preferredLanguage: cs.preferredLanguage,
      selectedPersona: cs.selectedPersona,
      storedIntent: cs.storedIntent,
      effectiveModelSelection: cs.effectiveModelSelection,
      isBusy: cs.isBusy,
      isStartingInteractiveLesson,
      selectedPersonaSupportsEditor: cs.selectedPersonaSupportsEditor,
      rightSidebarWidth: cs.rightSidebarWidth,
      setIsStartingInteractiveLesson,
    })
  }

  if (!decodedDirectory) return { status: "invalid" }
  if (!hasRegisteredProject) return { status: "opening" }

  const promptComposerProps = {
    directory: decodedDirectory,
    sessionID: cs.sessionID,
    isBusy: cs.isBusy,
    personaOptions: cs.primaryPersonaOptions.map((persona) => ({
      name: persona.id,
      label: persona.label,
    })),
    mentionableAgents: EMPTY_MENTIONABLE_AGENTS,
    slashCommands,
    modelOptions: cs.modelOptions,
    selectedPersona: cs.selectedPersona,
    selectedIntent: cs.storedIntent,
    selectedModel: cs.selectedModelKey,
    pendingSteerLabel: pendingSuggestionOverride?.label,
    thinkingOptions: cs.thinkingOptions,
    selectedThinking,
    onPersonaChange,
    onIntentChange,
    onClearPendingSteer: () => {
      setPendingSuggestionOverride(undefined)
    },
    onModelChange: (model: string) => {
      pushRecentModelKey(model)
      cs.setSelectedModel(cs.promptKey, model)
    },
    onThinkingChange: (thinking: string) => {
      setSelectedVariant(cs.promptKey, thinking === "default" ? null : thinking)
    },
    onAbort: () => {
      void onAbort()
    },
    onNewSession: () => {
      void onNewSession()
    },
    onOpenMcpDialog: () => {
      navigate({ to: "/settings", search: { tab: "mcps" } })
    },
    onSearchFiles: onSearchMentionFiles,
    onRefreshSlashCommands: chatConfig.refreshSlashCommands,
    onSubmit: () => {
      void onSend()
    },
  } satisfies DirectoryChatMainPaneProps["promptComposerProps"]

  const leftSidebarProps: ComponentProps<typeof ChatLeftSidebar> = {
    directories: cs.sidebarDirectories,
    currentDirectory: decodedDirectory,
    sessionsByDirectory: cs.sessionsByDirectory,
    activeSessionID: cs.sessionID,
    sessionStatusByDirectory: cs.sessionStatusByDirectory,
    pinnedByDirectory: cs.pinnedByDirectory,
    unreadByDirectory: cs.unreadByDirectory,
    onOpenDirectory: () => {
      void onOpenExistingFolder()
    },
    onOpenExistingFolder: () => {
      void onOpenExistingFolder()
    },
    onQuickChat: () => {
      cs.setMainPaneTab("chat")
      setLibraryOpen(false)
      void onQuickChat()
    },
    onCreateNotebook,
    onNewSession: (targetDirectory) => {
      cs.setMainPaneTab("chat")
      setLibraryOpen(false)
      void onNewSession(targetDirectory)
    },
    onSelectSession: (targetDirectory, targetSessionID) => {
      cs.setMainPaneTab("chat")
      setLibraryOpen(false)
      void onSelectSession(targetDirectory, targetSessionID)
    },
    onTogglePin: (targetDirectory, targetSessionID) =>
      cs.togglePinned(targetDirectory, targetSessionID),
    onToggleUnread: onToggleUnreadSession,
    onArchiveSession,
    onRenameSession,
    onReorderDirectories: (nextOrder) => {
      void reorderOpenProjects(nextOrder)
        .then((nextDirectories) => {
          setOpenProjectsQueryData(queryClient, nextDirectories)
        })
        .catch(() => undefined)
    },
    onCloseDirectory: (targetDirectory) => {
      void onCloseDirectory(targetDirectory)
    },
    onOpenCurriculum: openCurriculumPanel,
    libraryOpen,
    onToggleLibrary: () => setLibraryOpen((open) => !open),
    mainPaneTab: cs.mainPaneTab,
    onMainPaneTabChange: (tab) => {
      setLibraryOpen(false)
      cs.setMainPaneTab(tab)
    },
    onOpenSettings: openSettingsPanel,
    className: "w-full h-full",
  }

  const mainPaneProps: DirectoryChatMainPaneProps = {
    directory: decodedDirectory,
    chatState: cs,
    transcriptRef,
    onTranscriptScroll,
    onAssistantTextFinalRender: scrollTranscriptToBottom,
    onOpenSession: handleOpenCurrentDirectorySession,
    onPermissionReply: async (reply) => {
      if (!cs.pendingPermissions[0]) return
      await onPermissionReply(cs.pendingPermissions[0].id, reply)
    },
    onQuestionReply: async (requestID, answers) => {
      await onQuestionReply(requestID, answers)
    },
    onQuestionReject: async (requestID) => {
      await onQuestionReject(requestID)
    },
    promptComposerProps,
    mainPaneTab: cs.mainPaneTab,
    resourcesRefreshToken,
    onOpenResource: openResourceInReadingMode,
    onOpenQuestionSet: openQuestionSetFromLibrary,
    selectedPersonaDefaultSurface: cs.selectedPersonaDefaultSurface,
    libraryOpen,
    directories: cs.sidebarDirectories,
  }

  const rightSidebarProps: DirectoryChatRightSidebarProps = {
    directory: decodedDirectory,
    chatState: cs,
    teachingWorkspace: teachingWs,
    showCapabilitiesTab: showCapabilitiesSidebarTab,
    showSystemPromptTab: showSystemPromptSidebarTab,
    showSnapshotTab: showSnapshotSidebarTab,
    showPaletteTab: showPaletteSidebarTab,
    systemPromptRefreshToken,
    isStartingInteractiveLesson,
    onRunCurriculumAction: (action) => {
      void onRunCurriculumAction(action)
    },
    onOpenCreateTeachingFileDialog: onTeachingCreateFile,
    onStartInteractiveLesson: () => {
      void onStartInteractiveLesson()
    },
  }

  const dialogProps: ComponentProps<typeof CreateTeachingFileDialog> = {
    open: createFileDialogOpen,
    onOpenChange: setCreateFileDialogOpen,
    onConfirm: (path) => void teachingWs.onCreateTeachingFileConfirm(path),
  }

  const shellProps: ReadyDirectoryChatPageControllerState["shellProps"] = {
    leftSidebarOpen: cs.leftSidebarOpen,
    leftSidebarDisplayWidth: cs.leftSidebarDisplayWidth,
    leftSidebarWidth: cs.leftSidebarWidth,
    leftSidebarMinWidth: SIDEBAR_MIN_WIDTH,
    leftSidebarMaxWidth: cs.leftSidebarMaxWidth,
    onLeftSidebarResize: cs.setLeftSidebarWidth,
    onLeftSidebarCollapse: () => cs.setLeftSidebarOpen(false),
    rightSidebarOpen: cs.rightSidebarOpen,
    rightSidebarDisplayWidth: cs.rightSidebarDisplayWidth,
    rightSidebarMinWidth: cs.rightSidebarMinWidth,
    rightSidebarMaxWidth: cs.rightSidebarMaxWidth,
    onRightSidebarResize: cs.setRightSidebarWidth,
    onRightSidebarCollapse: () => cs.setRightSidebarOpen(false),
  }

  return {
    status: "ready",
    leftSidebarProps,
    mainPaneProps,
    rightSidebarProps,
    shellProps,
    dialogProps,
  }
}
