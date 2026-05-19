import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import {
  PROMPT_PART_TYPE_TEXT,
  RESOURCE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import { requestPromptComposerFocus } from "@/components/prompt/prompt-composer-focus"
import type { PromptComposerAttachment, PromptComposerPart } from "@/components/prompt/prompt-types"
import {
  COMPACT_SLASH_COMMAND_ALIASES,
  COMPACT_SLASH_COMMAND_NAME,
  buildQuizSlashPromptParts,
  buildQuizSlashPrompt,
  parseSlashCommandInput,
  QUIZ_SLASH_COMMAND_NAME,
  SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES,
  UNDO_SLASH_COMMAND_NAME,
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
  prefetchSessionMessages,
  createManagedNotebook,
  compactSession,
  openInboxNotebook,
  openProject,
  rejectQuestion,
  reorderOpenProjects,
  replyPermission,
  replyQuestion,
  restoreRevertedSessionMessage,
  selectSession,
  sendCommand,
  sendPrompt,
  startNewSessionDraft,
  undoLastSessionMessage,
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
import { useNotifications } from "../../state/notifications"
import { useUiPreferences } from "../../state/ui-preferences"
import { useShallow } from "zustand/react/shallow"
import { stringifyError } from "../../state/teaching-actions"
import { teachingSelectionKey, useTeachingRuntime } from "../../state/teaching-runtime"
import {
  buildCommandAttachmentParts,
  buildPromptDraftFromUserMessage,
  buildPromptSubmissionParts,
} from "./chat-prompt-helpers"
import { useDirectoryChatState } from "./use-directory-chat-state"
import { useChatSync } from "./use-chat-sync"
import { useChatConfig } from "./use-chat-config"
import { useTeachingWorkspace } from "./use-teaching-workspace"
import { useAutoScroll } from "./use-auto-scroll"
import { getRightSidebarDefaultWidth, RIGHT_SIDEBAR_EDITOR_MIN_WIDTH } from "./right-sidebar-layout"
import type { ResourceCardTarget } from "@/components/layout/chat-left-sidebar/resource-card-grid"
import { useQuestionSetSidebarActions } from "@/components/question-set/use-question-set-sidebar-actions"
import {
  DIRECTORY_CHAT_SHELL_VIEW,
  type DirectoryChatShellView,
} from "@/lib/directory-chat/directory-chat-shell-view"
import { bootstrapLearnerMemoryForNotebookBestEffort } from "@/lib/learner-memory"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import { useWorkspaceFilePanelStore } from "@/state/workspace-file-panel-store"

const SIDEBAR_MIN_WIDTH = 220
const READING_PREFETCH_BLOCKED_STATUSES = new Set<NonNullable<ResourceCardTarget["status"]>>([
  "preparing",
  "unsupported",
  "error",
])

const EMPTY_MENTIONABLE_AGENTS: MentionableAgent[] = []
const E2E_BACKEND_COMMAND_NAME = "e2e-backend-command"
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
  const closingDirectoryRef = useRef<string | undefined>(undefined)
  const previousDirectoryRef = useRef<string | undefined>(undefined)
  const [systemPromptRefreshToken, setSystemPromptRefreshToken] = useState(0)
  const [pendingSuggestionOverride, setPendingSuggestionOverride] = useState<
    | {
        label: string
        prompt: string
        focusGoalIds: string[]
      }
    | undefined
  >(undefined)
  const [isStartingInteractiveLesson, setIsStartingInteractiveLesson] = useState(false)
  const [createFileDialogOpen, setCreateFileDialogOpen] = useState(false)
  const [shellView, setShellView] = useState<DirectoryChatShellView>(
    DIRECTORY_CHAT_SHELL_VIEW.WORKSPACE,
  )

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

  const openProjects = useChatStore(useShallow((state) => state.openProjects))
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
  const pendingAutoFileOpen = useWorkspaceFilePanelStore((state) =>
    decodedDirectory ? state.pendingAutoOpenByDirectory[decodedDirectory] : undefined,
  )
  const consumePendingAutoFileOpen = useWorkspaceFilePanelStore(
    (state) => state.consumePendingAutoOpen,
  )
  const openQueuedWorkspaceFile = useWorkspaceFilePanelStore((state) => state.openFile)
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
    applyMessageRemoved: cs.applyMessageRemoved,
    applyPartUpdated: cs.applyPartUpdated,
    applyPartRemoved: cs.applyPartRemoved,
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

  function clearSubmittedPromptDrafts(submittedSessionID: string) {
    if (!decodedDirectory) return

    cs.clearPromptDraft(cs.promptKey)
    cs.clearPromptDraft(getPromptScopeKey(decodedDirectory))
    cs.clearPromptDraft(getPromptScopeKey(decodedDirectory, submittedSessionID))
  }

  function stagePromptText(value: string) {
    const nextDraft = createTextPromptDraft(value)
    cs.setPromptDraft(cs.promptKey, nextDraft)
  }

  const autoScroll = useAutoScroll({
    working: cs.isBusy,
    contentDep: cs.messages,
  })
  const snapToBottomForThreadSwitch = autoScroll.snapToBottomForThreadSwitch

  useEffect(() => {
    setPendingSuggestionOverride(undefined)
  }, [sessionKey])

  useEffect(() => {
    const previousDirectory = previousDirectoryRef.current
    previousDirectoryRef.current = decodedDirectory

    if (previousDirectory === undefined || previousDirectory === decodedDirectory) {
      return
    }

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
    if (!decodedDirectory || !pendingAutoFileOpen) {
      return
    }

    const pendingItem = consumePendingAutoFileOpen(decodedDirectory)
    if (pendingItem) {
      openQueuedWorkspaceFile(decodedDirectory, pendingItem)
    }
    setRightSidebarTab("files")
    setRightSidebarOpen(true)
  }, [
    consumePendingAutoFileOpen,
    decodedDirectory,
    openQueuedWorkspaceFile,
    pendingAutoFileOpen,
    setRightSidebarOpen,
    setRightSidebarTab,
  ])

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
    snapToBottomForThreadSwitch()
  }, [sessionID, snapToBottomForThreadSwitch])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    clearUnread(decodedDirectory, sessionID)
    useNotifications.getState().markSessionViewed(sessionID)
  }, [clearUnread, decodedDirectory, sessionID])

  const handleOpenCurrentDirectorySession = useCallback(
    (targetSessionID: string) => {
      if (!decodedDirectory) return

      void (async () => {
        try {
          await selectSession(decodedDirectory, targetSessionID)
          clearUnread(decodedDirectory, targetSessionID)
          useNotifications.getState().markSessionViewed(targetSessionID)
        } catch {
          // Store already captures and displays errors.
        }
      })()
    },
    [clearUnread, decodedDirectory],
  )

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

  function showWorkspace() {
    setShellView(DIRECTORY_CHAT_SHELL_VIEW.WORKSPACE)
  }

  function showLibrary() {
    setShellView(DIRECTORY_CHAT_SHELL_VIEW.LIBRARY)
  }

  function showSkills() {
    setShellView(DIRECTORY_CHAT_SHELL_VIEW.SKILLS)
  }

  async function onNewSession(targetDirectory = decodedDirectory) {
    if (!targetDirectory) return
    try {
      cs.setMainPaneTab("chat")
      showWorkspace()
      startNewSessionDraft(targetDirectory)
      seedDraftModelSelection(targetDirectory)
      requestPromptComposerFocus(targetDirectory)
      if (targetDirectory !== decodedDirectory) onSwitchDirectory(targetDirectory)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onSelectSession(targetDirectory: string, nextSessionID?: string) {
    if (!targetDirectory) return
    if (shellView !== DIRECTORY_CHAT_SHELL_VIEW.WORKSPACE) {
      showWorkspace()
    }
    // Always switch back to the chat pane when selecting a session.
    // The library/instructions shortcuts stay within WORKSPACE but change the
    // mainPaneTab, so we can't rely on the shellView guard alone.
    if (nextSessionID) {
      cs.setMainPaneTab("chat")
    }
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
      showWorkspace()
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
      cs.setMainPaneTab("chat")
      showWorkspace()
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

  async function onCreateNotebook(
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) {
    try {
      const nextDirectory = await createManagedNotebook(name)
      showWorkspace()
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      cs.setActiveDirectory(nextDirectory)
      startNewSessionDraft(nextDirectory)
      useUiPreferences.getState().setMainPaneTab("chat")
      seedDraftModelSelection(nextDirectory)
      if (nextDirectory !== decodedDirectory) {
        onSwitchDirectory(nextDirectory)
      }
      void bootstrapLearnerMemoryForNotebookBestEffort({
        directory: nextDirectory,
        enabled: enableLearnerMemory,
        autoExtract: enableAutoExtract,
      })
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
  }

  function openSettingsPanel() {
    navigate({ to: "/settings", search: { tab: "general" } })
  }

  function openResourceInReadingMode(targetDirectory: string, resource: ResourceCardTarget) {
    const openingFromLibrary = shellView === DIRECTORY_CHAT_SHELL_VIEW.LIBRARY
    const activeSessionID = useChatStore.getState().directories[targetDirectory]?.sessionID
    const linkedSessionID = resource.resourceID
      ? linkedSessionByResource[`${targetDirectory}::${resource.resourceID}`]
      : undefined

    if (openingFromLibrary) {
      showWorkspace()
      cs.setMainPaneTab("chat")
    }

    void queryClient.prefetchQuery(resourcesQueryOptions(targetDirectory))
    const canPrefetchReadingBlob =
      isSupportedReadingResourcePath(resource.path) &&
      (resource.status === undefined || !READING_PREFETCH_BLOCKED_STATUSES.has(resource.status))
    if (canPrefetchReadingBlob) {
      void queryClient.prefetchQuery(
        readingResourceBlobQueryOptions(targetDirectory, resource.path),
      )
    }

    void (async () => {
      if (linkedSessionID && linkedSessionID !== activeSessionID) {
        await selectSession(targetDirectory, linkedSessionID).catch(() => undefined)
      } else if (openingFromLibrary) {
        startNewSessionDraft(targetDirectory)
        seedDraftModelSelection(targetDirectory)
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
      if (shellView !== DIRECTORY_CHAT_SHELL_VIEW.WORKSPACE) {
        showWorkspace()
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

  function resolveUndoRestoreDraft(messageID?: string) {
    const revertMessageID = cs.sessionFamily.current?.revert?.messageID
    const targetUserMessage = messageID
      ? cs.messages.find((message) => message.info.role === "user" && message.info.id === messageID)
      : cs.messages.findLast(
          (message) =>
            message.info.role === "user" &&
            (revertMessageID === undefined || message.info.id < revertMessageID),
        )

    return buildPromptDraftFromUserMessage(targetUserMessage, decodedDirectory)
  }

  async function sendRuntimePrompt(input: {
    content: string
    attachments?: PromptComposerAttachment[]
    parts?: PromptComposerPart[]
    focusGoalIds?: string[]
  }) {
    if (!decodedDirectory) return false

    const rawAttachments = input.attachments ?? []
    const promptParts = [...(input.parts ?? [])]
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
      focusGoalIds: input.focusGoalIds,
      agent: currentAgentName,
      model: cs.effectiveModelSelection,
      ...(cs.effectiveModelInfo
        ? {
            modelRuntime: {
              providerID: cs.effectiveModelSelection?.providerID ?? "",
              modelID: cs.effectiveModelSelection?.modelID ?? "",
              contextWindow: cs.effectiveModelInfo.limit.context,
              ...(cs.effectiveModelInfo.limit.input !== undefined
                ? { inputWindow: cs.effectiveModelInfo.limit.input }
                : {}),
              outputWindow: cs.effectiveModelInfo.limit.output,
              ...(cs.effectiveModelInfo.capabilities.input.image ? { image: true } : {}),
            },
          }
        : {}),
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
              ...(activeReadingResource.cfi ? { cfi: activeReadingResource.cfi } : {}),
              ...(activeReadingResource.index !== undefined
                ? { index: activeReadingResource.index }
                : {}),
              ...(activeReadingResource.fraction !== undefined
                ? { fraction: activeReadingResource.fraction }
                : {}),
              ...(activeReadingResource.tocLabel
                ? { tocLabel: activeReadingResource.tocLabel }
                : {}),
              ...(activeReadingResource.pageLabel
                ? { pageLabel: activeReadingResource.pageLabel }
                : {}),
              ...(activeReadingResource.currentPassageText
                ? { currentPassageText: activeReadingResource.currentPassageText }
                : {}),
              ...(activeReadingResource.visibleStartText
                ? { visibleStartText: activeReadingResource.visibleStartText }
                : {}),
              ...(activeReadingResource.visibleEndText
                ? { visibleEndText: activeReadingResource.visibleEndText }
                : {}),
              ...(activeReadingResource.readingTrail &&
              activeReadingResource.readingTrail.length > 0
                ? { readingTrail: activeReadingResource.readingTrail }
                : {}),
              ...(activeReadingResource.annotationSummary &&
              activeReadingResource.annotationSummary.length > 0
                ? { annotationSummary: activeReadingResource.annotationSummary }
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

    clearSubmittedPromptDrafts(submittedSessionID)
    setSystemPromptRefreshToken((token) => token + 1)
    void syncTeachingRuntimeSelection({
      directory: decodedDirectory,
      sessionID: submittedSessionID,
      sessionKey: teachingSelectionKey(decodedDirectory, submittedSessionID),
    })
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

    autoScroll.forceScrollToBottom()

    const variant = selectedThinking !== "default" ? selectedThinking : undefined
    const slashCommand = parseSlashCommandInput(rawContent, slashCommandCandidates)

    if (slashCommand) {
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

      if (slashCommand.command.name === UNDO_SLASH_COMMAND_NAME) {
        const restoreDraft = resolveUndoRestoreDraft()
        cs.clearPromptDraft(cs.promptKey)
        try {
          await undoLastSessionMessage(decodedDirectory, {
            sessionID,
          })
          if (restoreDraft) {
            cs.setPromptDraft(cs.promptKey, restoreDraft)
          }
          setSystemPromptRefreshToken((token) => token + 1)
          void syncTeachingRuntimeSelection()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (slashCommand.command.name === QUIZ_SLASH_COMMAND_NAME) {
        cs.clearPromptDraft(cs.promptKey)
        try {
          const sent = await sendRuntimePrompt({
            content: buildQuizSlashPrompt(slashCommand.arguments),
            parts: buildQuizSlashPromptParts(promptParts, slashCommand.arguments),
            attachments: rawAttachments,
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
        const submittedSessionID = await sendCommand(
          decodedDirectory,
          slashCommand.command.name,
          slashCommand.arguments,
          {
            parts: attachmentParts,
            persona: cs.selectedPersona,
            agent: currentAgentName,
            model: cs.effectiveModelSelection,
            variant,
          },
        )
        setSystemPromptRefreshToken((token) => token + 1)
        void syncTeachingRuntimeSelection({
          directory: decodedDirectory,
          sessionID: submittedSessionID,
          sessionKey: teachingSelectionKey(decodedDirectory, submittedSessionID),
        })
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
      focusGoalIds: action.focusGoalIds,
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

  // Scroll handling is fully managed by useAutoScroll.

  function onPersonaChange(persona: string) {
    cs.setSessionPersona(cs.sessionKey, persona)

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
    selectedModel: cs.selectedModelKey,
    selectedModelAcceptsImages: cs.selectedModelAcceptsImages,
    pendingSteerLabel: pendingSuggestionOverride?.label,
    thinkingOptions: cs.thinkingOptions,
    selectedThinking,
    onPersonaChange,
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
      void onQuickChat()
    },
    onCreateNotebook,
    onNewSession: (targetDirectory) => {
      void onNewSession(targetDirectory)
    },
    onSelectSession: (targetDirectory, targetSessionID) => {
      void onSelectSession(targetDirectory, targetSessionID)
    },
    onPrefetchSession: (targetDirectory, targetSessionID) => {
      void prefetchSessionMessages(targetDirectory, targetSessionID).catch(() => undefined)
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
    shellView,
    onSelectLibrary: showLibrary,
    onSelectSkills: showSkills,
    mainPaneTab: cs.mainPaneTab,
    onMainPaneTabChange: (tab) => {
      showWorkspace()
      cs.setMainPaneTab(tab)
    },
    onOpenSettings: openSettingsPanel,
    showHeader: false,
    className: "w-full h-full",
  }

  const mainPaneProps: DirectoryChatMainPaneProps = {
    directory: decodedDirectory,
    chatState: cs,
    transcriptRef: autoScroll.scrollRef,
    transcriptContentRef: autoScroll.contentRef,
    userScrolled: autoScroll.userScrolled,
    onTranscriptScroll: autoScroll.handleScroll,
    onTranscriptWheel: autoScroll.handleWheel,
    onTranscriptKeyDown: autoScroll.handleKeyDown,
    onTranscriptPointerDown: autoScroll.handlePointerDown,
    onTranscriptTouchStart: autoScroll.handleTouchStart,
    onTranscriptTouchMove: autoScroll.handleTouchMove,
    onTranscriptTouchEnd: autoScroll.handleTouchEnd,
    onTranscriptTouchCancel: autoScroll.handleTouchCancel,
    onTranscriptInteraction: autoScroll.handleInteraction,
    onOpenSession: handleOpenCurrentDirectorySession,
    onRevertMessage: async ({ sessionID, messageID }) => {
      const restoreDraft = resolveUndoRestoreDraft(messageID)
      await undoLastSessionMessage(decodedDirectory, { sessionID, messageID })
      if (restoreDraft) {
        cs.setPromptDraft(cs.promptKey, restoreDraft)
      }
      setSystemPromptRefreshToken((token) => token + 1)
      void syncTeachingRuntimeSelection()
    },
    onRestoreRevertedMessages: async () => {
      if (!sessionID) return

      const draftSnapshot = readPromptSnapshot()

      try {
        await restoreRevertedSessionMessage(decodedDirectory, { sessionID })
        cs.clearPromptDraft(cs.promptKey)
        setSystemPromptRefreshToken((token) => token + 1)
        void syncTeachingRuntimeSelection()
      } catch {
        restorePromptSnapshot(draftSnapshot)
      }
    },
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
    onOpenResource: openResourceInReadingMode,
    onOpenQuestionSet: openQuestionSetFromLibrary,
    selectedPersonaDefaultSurface: cs.selectedPersonaDefaultSurface,
    shellView,
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
    chatTitle: cs.sessionTitle,
    projectName: getFilename(decodedDirectory),
    titlebarVariant:
      shellView === DIRECTORY_CHAT_SHELL_VIEW.SKILLS ||
      shellView === DIRECTORY_CHAT_SHELL_VIEW.LIBRARY
        ? "shell"
        : "chat",
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
