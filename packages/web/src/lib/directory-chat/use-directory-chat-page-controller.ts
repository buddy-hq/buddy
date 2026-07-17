import { useLocation, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { useDirectoryWorkspace } from "@/components/directory-chat/directory-workspace-context"
import { getFilename } from "@/components/layout/sidebar-helpers"
import {
  PROMPT_PART_TYPE_TEXT,
  RESOURCE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import { requestPromptComposerFocus } from "@/components/prompt/prompt-composer-focus"
import type { PromptComposerAttachment, PromptComposerPart } from "@/components/prompt/prompt-types"
import {
  COMPACT_SLASH_COMMAND_ALIASES,
  COMPACT_SLASH_COMMAND_NAME,
  FORK_SLASH_COMMAND_ALIASES,
  FORK_SLASH_COMMAND_NAME,
  buildQuizSlashPromptParts,
  buildQuizSlashPrompt,
  isHiddenSlashCommandName,
  parseSlashCommandInput,
  QUIZ_SLASH_COMMAND_NAME,
  REDO_SLASH_COMMAND_NAME,
  SUBMITTED_BUILTIN_SLASH_COMMAND_NAMES,
  UNDO_SLASH_COMMAND_NAME,
} from "@/components/prompt/slash-autocomplete"
import type {
  MentionableAgent,
  MentionableReference,
} from "@/components/prompt/mention-autocomplete"
import type { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
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
  abortPrompt,
  closeOpenProject,
  ensureDirectorySession,
  findWorkspaceFiles,
  loadMessages,
  prefetchSessionMessages,
  createManagedNotebook,
  compactSession,
  forkSession,
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
  startNewSession,
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
  RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
  type ResourceOpenOptions,
  type ResourceReadingTarget,
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
import { invalidateObsidianWatcherCaches } from "../../state/obsidian-vault-query"
import {
  clonePromptDraft,
  getPromptDraft,
  getPromptScopeKey,
  normalizePromptDraft,
  usePromptStore,
  type PromptDraftState,
} from "../../state/prompt-store"
import { getModelSelectionScopeKey } from "../../state/model-selection-store"
import { useChatStore } from "../../state/chat-store"
import { useNotifications } from "../../state/notifications"
import type { PermissionReply } from "../../state/permission-types"
import { useShallow } from "zustand/react/shallow"
import { stringifyError } from "../../state/teaching-actions"
import { teachingSelectionKey, useTeachingRuntime } from "../../state/teaching-runtime"
import {
  buildCommandAttachmentParts,
  buildPromptDraftFromUserMessage,
  buildPromptImageEditIntent,
  buildPromptPreviewParts,
  buildPromptSubmissionParts,
} from "./chat-prompt-helpers"
import { useDirectoryChatState } from "./use-directory-chat-state"
import { useChatSync } from "./use-chat-sync"
import { DirectoryWorkspaceClientActionLedger } from "@/lib/directory-workspace-client-actions"
import { useChatConfig } from "./use-chat-config"
import { useTeachingWorkspace } from "./use-teaching-workspace"
import { useAutoScroll } from "./use-auto-scroll"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  readBenchOpenPolicyStateFromLocation,
  useOpenBench,
} from "@/lib/bench-navigation"
import { WORKSPACE_VISIBILITY_EXPANDED } from "@/state/directory-workspace-store"
import { bootstrapLearnerMemoryForNotebookBestEffort } from "@/lib/learner-memory"
import { FOLLOWUP_BEHAVIOR_QUEUE, useChatSettings } from "@/state/chat-settings"
import { language } from "@/context/language"
import type { GetStartedChat } from "@/lib/get-started-chats"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { useStrictModeDeferredDisposal } from "@/lib/use-strict-mode-deferred-disposal"
import { useOpenSettings } from "@/lib/settings-navigation"
import { referenceListQueryOptions } from "@/state/reference-query"

const SIDEBAR_MIN_WIDTH = 220
const READING_PREFETCH_BLOCKED_STATUSES = new Set<NonNullable<ResourceReadingTarget["status"]>>([
  "preparing",
  "unsupported",
  "error",
])

const EMPTY_MENTIONABLE_AGENTS: MentionableAgent[] = []
const EMPTY_MENTIONABLE_REFERENCES: MentionableReference[] = []
const E2E_BACKEND_COMMAND_NAME = "e2e-backend-command"
const COMPACT_SESSION_MISSING_MODEL_ERROR = "Select a model before compacting this session."
const COMPACT_SESSION_MISSING_SESSION_ERROR = "Start a session before compacting it."
const QUEUED_FOLLOWUP_PREVIEW_MAX_LENGTH = 80
const QUEUED_FOLLOWUP_ID_PREFIX = "queued-followup"
let queuedFollowupSequence = 0

type SubmittedPromptDraft = Omit<PromptDraftState, "updatedAt">
type QueuedFollowupKind = "queue" | "steer"

type QueuedFollowupDraft = {
  id: string
  sessionID: string
  kind: QueuedFollowupKind
  label: string
  draft: SubmittedPromptDraft
  focusGoalIds?: string[]
}

function createQueuedFollowupID() {
  const randomID = globalThis.crypto?.randomUUID?.()
  if (randomID) return `${QUEUED_FOLLOWUP_ID_PREFIX}-${randomID}`

  queuedFollowupSequence += 1
  return `${QUEUED_FOLLOWUP_ID_PREFIX}-${Date.now()}-${queuedFollowupSequence}`
}

function cloneSubmittedPromptDraft(draft: SubmittedPromptDraft): SubmittedPromptDraft {
  const cloned = clonePromptDraft(normalizePromptDraft(draft))
  return {
    value: cloned.value,
    parts: cloned.parts,
    attachments: cloned.attachments,
    cursor: cloned.cursor,
  }
}

function truncateQueuedFollowupPreview(text: string) {
  if (text.length <= QUEUED_FOLLOWUP_PREVIEW_MAX_LENGTH) return text
  return `${text.slice(0, QUEUED_FOLLOWUP_PREVIEW_MAX_LENGTH - 3)}...`
}

function queuedFollowupLabel(draft: SubmittedPromptDraft) {
  const directText = draft.value.trim().replace(/\s+/g, " ")
  if (directText) return truncateQueuedFollowupPreview(directText)

  const textPart = draft.parts.find(
    (part) => part.type === PROMPT_PART_TYPE_TEXT && part.text.trim().length > 0,
  )
  if (textPart?.type === PROMPT_PART_TYPE_TEXT) {
    return truncateQueuedFollowupPreview(textPart.text.trim().replace(/\s+/g, " "))
  }

  const firstAttachment = draft.attachments[0]
  if (firstAttachment) return firstAttachment.filename

  return language.t("chat.followupDock.untitled")
}

type DirectoryChatPageControllerProps = {
  directoryToken: string
}

type DirectoryChatShellProps = ComponentProps<typeof DirectoryChatShell>
type DirectoryChatMainPaneProps = ComponentProps<typeof DirectoryChatConversationPane>

type ReadyDirectoryChatPageControllerState = {
  status: "ready"
  leftSidebarProps: ComponentProps<typeof ChatLeftSidebar>
  mainPaneProps: DirectoryChatMainPaneProps
  shellProps: Omit<
    DirectoryChatShellProps,
    "leftSidebar" | "contentLayout" | "rightWorkspaceOpen" | "onRightWorkspaceToggle"
  >
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
  const openSettings = useOpenSettings()
  const location = useLocation()
  const workspace = useDirectoryWorkspace()
  const closingDirectoryRef = useRef<string | undefined>(undefined)
  const previousDirectoryRef = useRef<string | undefined>(undefined)
  const benchActionLedgerDiagnosticRef = useRef<{
    decodedDirectory: string
    sessionID: string | undefined
  }>({
    decodedDirectory: "",
    sessionID: undefined,
  })
  const [pendingSuggestionOverride, setPendingSuggestionOverride] = useState<
    | {
        label: string
        prompt: string
        focusGoalIds: string[]
      }
    | undefined
  >(undefined)
  const [queuedFollowupsBySession, setQueuedFollowupsBySession] = useState<
    Record<string, QueuedFollowupDraft[]>
  >({})
  const [sendingQueuedFollowupID, setSendingQueuedFollowupID] = useState<string | undefined>(
    undefined,
  )
  const followupBehavior = useChatSettings((state) => state.followupBehavior)
  const activeSessionIDRef = useRef<string | undefined>(undefined)

  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(props.directoryToken)
    } catch {
      return ""
    }
  }, [props.directoryToken])

  const openProjects = useChatStore(useShallow((state) => state.openProjects))
  const activeReadingResource = useChatStore((state) =>
    decodedDirectory ? state.activeReadingResourceByDirectory[decodedDirectory] : undefined,
  )
  const linkedSessionByResource = useChatStore((state) => state.linkedSessionByResource)
  const linkReadingResourceSession = useChatStore((state) => state.linkReadingResourceSession)
  const openBenchRoute = useOpenBench()
  const hasRegisteredProject = useMemo(
    () =>
      !!decodedDirectory && openProjects.filter((d) => d && d !== "/").includes(decodedDirectory),
    [decodedDirectory, openProjects],
  )
  const benchPolicyStateForPrompt = useMemo(
    () =>
      decodedDirectory
        ? readBenchOpenPolicyStateFromLocation({
            directory: decodedDirectory,
            pathname: location.pathname,
            search: location.search,
          })
        : { status: "closed" as const },
    [decodedDirectory, location.pathname, location.search],
  )

  const chatConfig = useChatConfig({ decodedDirectory, hasRegisteredProject })

  const cs = useDirectoryChatState({
    decodedDirectory,
    agentCatalog: chatConfig.agentCatalog,
    defaultAgent: chatConfig.defaultAgent,
    configuredModel: chatConfig.configuredModel,
    autoCompactionEnabled: chatConfig.autoCompactionEnabled,
    personaCatalog: chatConfig.personaCatalog,
  })
  const referenceQuery = useQuery({
    ...referenceListQueryOptions(decodedDirectory),
    enabled: decodedDirectory.length > 0 && hasRegisteredProject,
  })
  const mentionableReferences = useMemo(() => {
    const references = referenceQuery.data?.data
    if (!references) return EMPTY_MENTIONABLE_REFERENCES
    return references
      .filter((reference) => reference.hidden !== true)
      .map((reference) => ({
        name: reference.name,
        path: reference.path,
        description:
          reference.description ??
          (reference.source.type === "git" ? reference.source.repository : reference.source.path),
      }))
  }, [referenceQuery.data?.data])
  const {
    clearUnread,
    migrateWorkspaceDraft,
    currentAgentName,
    selectedThinking,
    sessionID,
    sessionKey,
    setActiveDirectory,
    pushRecentModelKey,
    setSelectedAgent,
    setSelectedModel,
    setSelectedVariant,
    validOpenProjects,
  } = cs
  activeSessionIDRef.current = sessionID
  benchActionLedgerDiagnosticRef.current = {
    decodedDirectory,
    sessionID,
  }
  const benchActionLedger = useMemo(
    () =>
      new DirectoryWorkspaceClientActionLedger({
        directory: decodedDirectory,
        controller: workspace.controller,
        lifecycle: workspace.lifecycle,
        getActiveSessionID: () => activeSessionIDRef.current,
      }),
    [decodedDirectory, workspace.controller, workspace.lifecycle],
  )

  useStrictModeDeferredDisposal({
    ownerKey: benchActionLedger,
    eventPrefix: "directory-chat-page-controller-ledger",
    logEvent: logBenchToggleStep,
    getDiagnostics: () => benchActionLedgerDiagnosticRef.current,
    dispose: () => benchActionLedger.dispose(),
  })

  useEffect(() => {
    void benchActionLedger.drainPendingSessionActions()
  }, [benchActionLedger, sessionID])

  const getBenchEventStreamLeaseQuery = useCallback(
    () => workspace.lifecycle.beginEventStreamLease(),
    [workspace.lifecycle],
  )
  const onBenchClientLease = useCallback(
    (lease: Parameters<typeof workspace.lifecycle.acceptLease>[0]) => {
      workspace.lifecycle.acceptLease(lease)
      void benchActionLedger.drainPendingSessionActions()
    },
    [benchActionLedger, workspace.lifecycle],
  )
  const onBenchClientAction = useCallback(
    (action: Parameters<DirectoryWorkspaceClientActionLedger["handle"]>[0]) =>
      benchActionLedger.handle(action),
    [benchActionLedger],
  )
  const onAgentTurnComplete = useCallback(
    () =>
      workspace.lifecycle.synchronizeCurrentWorkspaceFile({
        reason: "turn-complete",
      }),
    [workspace.lifecycle],
  )
  const onWorkspaceFileChanged = useCallback(
    async (input: { path: string; event: "add" | "change" | "unlink" }) => {
      await Promise.all([
        workspace.lifecycle.synchronizeWorkspaceFile({
          path: input.path,
          reason: "watcher",
        }),
        invalidateObsidianWatcherCaches(queryClient, {
          directory: decodedDirectory,
          path: input.path,
          event: input.event,
        }),
      ])
    },
    [decodedDirectory, queryClient, workspace.lifecycle],
  )
  const visibleReadingResource =
    benchPolicyStateForPrompt.status === "open" &&
    benchPolicyStateForPrompt.mode === BENCH_CHAT_LAYOUT_DOCKED &&
    workspace.projection.dockedState.visibility !== WORKSPACE_VISIBILITY_EXPANDED
      ? undefined
      : activeReadingResource
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
    candidates.set(FORK_SLASH_COMMAND_NAME, {
      name: FORK_SLASH_COMMAND_NAME,
      aliases: [...FORK_SLASH_COMMAND_ALIASES],
    })
    if (import.meta.env.VITE_BUDDY_E2E === "1") {
      candidates.set(E2E_BACKEND_COMMAND_NAME, { name: E2E_BACKEND_COMMAND_NAME })
    }
    for (const command of RESOURCE_LOCAL_SLASH_COMMANDS) {
      candidates.set(command.name, { name: command.name })
    }
    for (const command of slashCommands) {
      if (isHiddenSlashCommandName(command.name)) continue
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
    refreshSlashCommands: chatConfig.refreshSlashCommands,
    refreshMcpStatus: chatConfig.refreshMcpStatus,
    getBenchEventStreamLeaseQuery,
    onBenchClientLease,
    onBenchClientAction,
    onAgentTurnComplete,
    onWorkspaceFileChanged,
  })

  type PromptSnapshot = ReturnType<typeof clonePromptDraft> & {
    key: string
  }

  function createPromptSnapshot(draft: Omit<PromptDraftState, "updatedAt">) {
    return {
      key: cs.promptKey,
      ...clonePromptDraft(normalizePromptDraft(draft)),
    } satisfies PromptSnapshot
  }

  function readPromptSnapshot() {
    return createPromptSnapshot(getPromptDraft(usePromptStore.getState(), cs.promptKey))
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

  const clearSubmittedPromptDrafts = useCallback(
    (submittedSessionID: string) => {
      if (!decodedDirectory) return

      cs.clearPromptDraft(cs.promptKey)
      cs.clearPromptDraft(getPromptScopeKey(decodedDirectory))
      cs.clearPromptDraft(getPromptScopeKey(decodedDirectory, submittedSessionID))
    },
    [cs, decodedDirectory],
  )

  const autoScroll = useAutoScroll()

  useEffect(() => {
    setPendingSuggestionOverride(undefined)
  }, [sessionKey])

  useEffect(() => {
    const previousDirectory = previousDirectoryRef.current
    previousDirectoryRef.current = decodedDirectory

    if (previousDirectory === undefined || previousDirectory === decodedDirectory) {
      return
    }

    setPendingSuggestionOverride(undefined)
  }, [decodedDirectory])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    migrateWorkspaceDraft(decodedDirectory, sessionID)
    useTeachingRuntime.getState().migrateWorkspaceSelection(decodedDirectory, sessionID)
  }, [decodedDirectory, migrateWorkspaceDraft, sessionID])

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
    const carryVariantKey = selectedThinking === "default" ? null : selectedThinking
    setSelectedAgent(scopeKey, undefined)
    setSelectedModel(scopeKey, carryModelKey)
    setSelectedVariant(scopeKey, carryVariantKey)
  }

  async function onNewSession(targetDirectory = decodedDirectory) {
    if (!targetDirectory) return
    try {
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

  async function onPermissionReply(requestID: string, reply: PermissionReply) {
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

  const reportCurrentDirectoryError = useCallback(
    (error: unknown) => {
      if (!decodedDirectory) return
      cs.setDirectoryError(decodedDirectory, stringifyError(error))
    },
    [cs, decodedDirectory],
  )

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

  async function onCreateNotebook(
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) {
    try {
      const nextDirectory = await createManagedNotebook(name)
      setOpenProjectsQueryData(queryClient, useChatStore.getState().openProjects)
      cs.setActiveDirectory(nextDirectory)
      startNewSessionDraft(nextDirectory)
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

  function openSourcesDrawer() {
    if (decodedDirectory) {
      void invalidateResourcesQueries(queryClient, decodedDirectory)
      void workspace.controller.execute({ type: "open-drawer", drawer: "sources" })
    }
  }

  function openSettingsPanel() {
    openSettings("general")
  }

  const openResourceInReadingMode = useCallback(
    async (
      targetDirectory: string,
      resource: ResourceReadingTarget,
      options?: ResourceOpenOptions,
    ) => {
      const activeSessionID = useChatStore.getState().directories[targetDirectory]?.sessionID
      const preferCurrentSession =
        options?.sessionPreference === RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT
      const linkedSessionID = resource.objectID
        ? linkedSessionByResource[`${targetDirectory}::${resource.objectID}`]
        : undefined

      if (preferCurrentSession && activeSessionID && resource.objectID) {
        linkReadingResourceSession(targetDirectory, resource.objectID, activeSessionID)
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

      if (!preferCurrentSession && linkedSessionID && linkedSessionID !== activeSessionID) {
        await selectSession(targetDirectory, linkedSessionID).catch(() => undefined)
      }

      return openBenchRoute({
        directory: targetDirectory,
        target: resource.objectID
          ? {
              type: "object",
              ref: {
                kind: "resource",
                objectID: resource.objectID,
                revisionID: null,
                itemID: null,
              },
              viewID: "reader",
            }
          : { type: "workspace-file", path: resource.path, viewer: "file" },
        mode: BENCH_CHAT_LAYOUT_DOCKED,
        autoOpen: null,
      })
    },
    [linkReadingResourceSession, linkedSessionByResource, queryClient, openBenchRoute],
  )

  async function handleResourceCommand(
    command: ResourceLocalSlashCommand,
    input: { rawAttachments: PromptComposerAttachment[] },
  ) {
    if (command.type === RESOURCE_COMMAND_PANEL) {
      openSourcesDrawer()
      return true
    }

    if (command.type === RESOURCE_COMMAND_ADD) {
      await addResource(decodedDirectory, {
        sourcePath: command.path,
        ...(command.alias ? { alias: command.alias } : {}),
      })
      openSourcesDrawer()
      return true
    }

    if (command.type === RESOURCE_COMMAND_REBUILD || command.type === RESOURCE_COMMAND_REMOVE) {
      if (command.type === RESOURCE_COMMAND_REBUILD) {
        await rebuildResource(decodedDirectory, { resourceKey: command.key })
      } else {
        await removeResource(decodedDirectory, { resourceKey: command.key })
      }
      openSourcesDrawer()
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

  const sendRuntimePrompt = useCallback(
    async (input: {
      content: string
      attachments?: PromptComposerAttachment[]
      parts?: PromptComposerPart[]
      focusGoalIds?: string[]
      clearDrafts?: boolean
      includeActiveContext?: boolean
      persona?: string
      targetSessionID?: string
      optimistic?: boolean
    }) => {
      if (!decodedDirectory) return false

      const rawAttachments = input.attachments ?? []
      const promptParts = [...(input.parts ?? [])]
      const content = input.content.trim()
      const hasStructuredPromptParts = promptParts.some(
        (part) => part.type !== PROMPT_PART_TYPE_TEXT,
      )
      const promptPartsForSubmission = hasStructuredPromptParts ? promptParts : []
      const submissionParts = buildPromptSubmissionParts(promptPartsForSubmission, rawAttachments)
      const optimisticParts = buildPromptPreviewParts(promptPartsForSubmission, rawAttachments)
      const imageEdit = buildPromptImageEditIntent(rawAttachments)
      const contentForSubmission = hasStructuredPromptParts ? "" : content

      if (!contentForSubmission && submissionParts.length === 0) return false

      const includeActiveContext = input.includeActiveContext ?? true

      if (includeActiveContext && cs.selectedPersonaSupportsEditor && cs.isInteractiveMode) {
        const ready = await teachingWs.flushTeachingWorkspace()
        if (!ready) return false
      }

      const variant = selectedThinking !== "default" ? selectedThinking : undefined
      const activeWorkspace =
        includeActiveContext && cs.sessionKey
          ? useTeachingRuntime.getState().workspaceBySession[cs.sessionKey]
          : undefined
      const teachingContext = includeActiveContext
        ? await resolveTeachingPromptContext({
            workspace: activeWorkspace,
            pendingWorkspace: cs.sessionKey
              ? teachingWs.workspaceProbeBySessionRef.current.get(cs.sessionKey)
              : undefined,
          })
        : undefined

      const submittedSessionID = await sendPrompt(decodedDirectory, contentForSubmission, {
        sessionID: input.targetSessionID,
        parts: submissionParts,
        optimisticParts,
        ...(imageEdit ? { imageEdit } : {}),
        persona: input.persona ?? cs.selectedPersona,
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
        ...(teachingContext ? { teaching: teachingContext } : {}),
        optimistic: input.optimistic,
        ...(includeActiveContext
          ? {
              beforePostPrompt: ({ sessionID }: { sessionID: string }) =>
                workspace.lifecycle.flushContextBeforePrompt({
                  sessionID,
                }),
            }
          : {}),
        ...(includeActiveContext && visibleReadingResource
          ? {
              reading: {
                ...(visibleReadingResource.objectID
                  ? { resourceKey: visibleReadingResource.objectID }
                  : {}),
                title: visibleReadingResource.name,
                path: visibleReadingResource.path,
                ...(visibleReadingResource.locationLabel
                  ? { locationLabel: visibleReadingResource.locationLabel }
                  : {}),
                ...(visibleReadingResource.cfi ? { cfi: visibleReadingResource.cfi } : {}),
                ...(visibleReadingResource.index !== undefined
                  ? { index: visibleReadingResource.index }
                  : {}),
                ...(visibleReadingResource.fraction !== undefined
                  ? { fraction: visibleReadingResource.fraction }
                  : {}),
                ...(visibleReadingResource.tocLabel
                  ? { tocLabel: visibleReadingResource.tocLabel }
                  : {}),
                ...(visibleReadingResource.pageLabel
                  ? { pageLabel: visibleReadingResource.pageLabel }
                  : {}),
                ...(visibleReadingResource.currentPassageText
                  ? { currentPassageText: visibleReadingResource.currentPassageText }
                  : {}),
                ...(visibleReadingResource.visibleStartText
                  ? { visibleStartText: visibleReadingResource.visibleStartText }
                  : {}),
                ...(visibleReadingResource.visibleEndText
                  ? { visibleEndText: visibleReadingResource.visibleEndText }
                  : {}),
                ...(visibleReadingResource.readingTrail &&
                visibleReadingResource.readingTrail.length > 0
                  ? { readingTrail: visibleReadingResource.readingTrail }
                  : {}),
                ...(visibleReadingResource.annotationSummary &&
                visibleReadingResource.annotationSummary.length > 0
                  ? { annotationSummary: visibleReadingResource.annotationSummary }
                  : {}),
              },
            }
          : {}),
      })

      if (includeActiveContext && visibleReadingResource?.objectID) {
        linkReadingResourceSession(
          decodedDirectory,
          visibleReadingResource.objectID,
          submittedSessionID,
        )
      }

      if (input.clearDrafts ?? true) {
        clearSubmittedPromptDrafts(submittedSessionID)
      }
      void syncTeachingRuntimeSelection({
        directory: decodedDirectory,
        sessionID: submittedSessionID,
        sessionKey: teachingSelectionKey(decodedDirectory, submittedSessionID),
      })
      return true
    },
    [
      visibleReadingResource,
      clearSubmittedPromptDrafts,
      currentAgentName,
      decodedDirectory,
      linkReadingResourceSession,
      selectedThinking,
      syncTeachingRuntimeSelection,
      teachingWs,
      workspace.lifecycle,
      cs,
    ],
  )

  async function onStartGetStartedChat(chat: GetStartedChat) {
    try {
      const nextSession = await startNewSession(decodedDirectory)
      const defaultPersona = cs.primaryPersonaOptions[0]?.id ?? cs.selectedPersona
      await sendRuntimePrompt({
        content: chat.prompt,
        includeActiveContext: false,
        persona: defaultPersona,
        targetSessionID: nextSession.id,
      })
    } catch {
      // sendRuntimePrompt owns the session error state.
    }
  }

  function enqueueFollowup(
    draft: SubmittedPromptDraft,
    kind: QueuedFollowupKind,
    focusGoalIds?: string[],
  ) {
    if (!sessionID) return undefined

    const queuedDraft = cloneSubmittedPromptDraft(draft)
    const item: QueuedFollowupDraft = {
      id: createQueuedFollowupID(),
      sessionID,
      kind,
      label: queuedFollowupLabel(queuedDraft),
      draft: queuedDraft,
      ...(focusGoalIds && focusGoalIds.length > 0 ? { focusGoalIds: [...focusGoalIds] } : {}),
    }

    setQueuedFollowupsBySession((current) => ({
      ...current,
      [sessionID]: [...(current[sessionID] ?? []), item],
    }))
    return item
  }

  const removeQueuedFollowup = useCallback((targetSessionID: string, queuedFollowupID: string) => {
    setQueuedFollowupsBySession((current) => {
      const remaining = (current[targetSessionID] ?? []).filter(
        (item) => item.id !== queuedFollowupID,
      )
      if (remaining.length === 0) {
        const { [targetSessionID]: _removed, ...rest } = current
        return rest
      }
      return {
        ...current,
        [targetSessionID]: remaining,
      }
    })
  }, [])

  const sendFollowupItem = useCallback(
    async (targetSessionID: string, queuedFollowup: QueuedFollowupDraft) => {
      if (sendingQueuedFollowupID) return

      setSendingQueuedFollowupID(queuedFollowup.id)
      try {
        const sent = await sendRuntimePrompt({
          content: queuedFollowup.draft.value,
          parts: queuedFollowup.draft.parts,
          attachments: queuedFollowup.draft.attachments,
          focusGoalIds: queuedFollowup.focusGoalIds,
          clearDrafts: false,
          targetSessionID,
          optimistic: !cs.isBusy,
        })
        if (sent) {
          removeQueuedFollowup(targetSessionID, queuedFollowup.id)
        }
      } catch (error) {
        reportCurrentDirectoryError(error)
      } finally {
        setSendingQueuedFollowupID(undefined)
      }
    },
    [
      removeQueuedFollowup,
      reportCurrentDirectoryError,
      cs.isBusy,
      sendRuntimePrompt,
      sendingQueuedFollowupID,
    ],
  )

  const sendQueuedFollowup = useCallback(
    async (targetSessionID: string, queuedFollowupID: string) => {
      const queuedFollowup = queuedFollowupsBySession[targetSessionID]?.find(
        (item) => item.id === queuedFollowupID,
      )
      if (!queuedFollowup) return

      await sendFollowupItem(targetSessionID, queuedFollowup)
    },
    [queuedFollowupsBySession, sendFollowupItem],
  )

  function editQueuedFollowup(targetSessionID: string, queuedFollowupID: string) {
    const queuedFollowup = queuedFollowupsBySession[targetSessionID]?.find(
      (item) => item.id === queuedFollowupID,
    )
    if (!queuedFollowup) return

    removeQueuedFollowup(targetSessionID, queuedFollowupID)
    cs.setPromptDraft(cs.promptKey, queuedFollowup.draft)
    requestPromptComposerFocus(decodedDirectory)
  }

  useEffect(() => {
    if (!decodedDirectory || !sessionID || cs.isBusy || sendingQueuedFollowupID) return
    const nextQueuedFollowup = queuedFollowupsBySession[sessionID]?.[0]
    if (!nextQueuedFollowup) return

    void sendQueuedFollowup(sessionID, nextQueuedFollowup.id)
  }, [
    cs.isBusy,
    decodedDirectory,
    queuedFollowupsBySession,
    sendQueuedFollowup,
    sendingQueuedFollowupID,
    sessionID,
  ])

  async function onSend(draft: Omit<PromptDraftState, "updatedAt">) {
    if (!decodedDirectory) return
    const draftSnapshot = createPromptSnapshot(draft)
    const rawContent = draft.value
    const promptParts = draft.parts
    const rawAttachments = draft.attachments
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
        openSettings("mcps")
        return
      }

      if (slashCommand.command.name === UNDO_SLASH_COMMAND_NAME) {
        cs.clearPromptDraft(cs.promptKey)
        try {
          const result = await undoLastSessionMessage(decodedDirectory, {
            sessionID,
          })
          const restoreDraft = buildPromptDraftFromUserMessage(result.message, decodedDirectory)
          if (restoreDraft) {
            cs.setPromptDraft(cs.promptKey, restoreDraft)
          }
          void syncTeachingRuntimeSelection()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (slashCommand.command.name === REDO_SLASH_COMMAND_NAME) {
        cs.clearPromptDraft(cs.promptKey)
        try {
          const result = await restoreRevertedSessionMessage(decodedDirectory, {
            sessionID,
          })
          const restoreDraft = buildPromptDraftFromUserMessage(result.message, decodedDirectory)
          if (restoreDraft) {
            cs.setPromptDraft(cs.promptKey, restoreDraft)
          }
          void syncTeachingRuntimeSelection()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (slashCommand.command.name === FORK_SLASH_COMMAND_NAME) {
        cs.clearPromptDraft(cs.promptKey)
        try {
          const forkedSession = await forkSession(decodedDirectory, {
            sessionID,
          })
          void syncTeachingRuntimeSelection({
            directory: decodedDirectory,
            sessionID: forkedSession.id,
            sessionKey: teachingSelectionKey(decodedDirectory, forkedSession.id),
          })
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
          void syncTeachingRuntimeSelection()
        } catch {
          restorePromptSnapshot(draftSnapshot)
        }
        return
      }

      if (slashCommand.command.name === COMPACT_SLASH_COMMAND_NAME) {
        if (!cs.effectiveModelSelection) {
          cs.setDirectoryError(decodedDirectory, COMPACT_SESSION_MISSING_MODEL_ERROR)
          restorePromptSnapshot(draftSnapshot)
          return
        }

        if (!sessionID) {
          cs.setDirectoryError(decodedDirectory, COMPACT_SESSION_MISSING_SESSION_ERROR)
          restorePromptSnapshot(draftSnapshot)
          return
        }

        cs.clearPromptDraft(cs.promptKey)
        try {
          await compactSession(decodedDirectory, sessionID, {
            providerID: cs.effectiveModelSelection.providerID,
            modelID: cs.effectiveModelSelection.modelID,
          })
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

    if (cs.isBusy) {
      const queuedFollowup = enqueueFollowup(
        draft,
        followupBehavior === FOLLOWUP_BEHAVIOR_QUEUE ? "queue" : "steer",
        pendingSuggestionOverride?.focusGoalIds,
      )
      if (!queuedFollowup) {
        restorePromptSnapshot(draftSnapshot)
        return
      }
      cs.clearPromptDraft(cs.promptKey)
      setPendingSuggestionOverride(undefined)
      if (queuedFollowup.kind === "steer") {
        void sendFollowupItem(queuedFollowup.sessionID, queuedFollowup)
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

  async function onAbort() {
    if (!decodedDirectory) return
    await abortPrompt(decodedDirectory)
  }

  // Scroll handling is fully managed by useAutoScroll.

  if (!decodedDirectory) return { status: "invalid" }
  if (!hasRegisteredProject) return { status: "opening" }

  const promptComposerProps = {
    directory: decodedDirectory,
    sessionID: cs.sessionID,
    isBusy: cs.isBusy,
    mentionableAgents: EMPTY_MENTIONABLE_AGENTS,
    mentionableReferences,
    slashCommands,
    modelOptions: cs.modelOptions,
    selectedModel: cs.selectedModelKey,
    selectedModelAcceptsImages: cs.selectedModelAcceptsImages,
    pendingSteerLabel: pendingSuggestionOverride?.label,
    thinkingOptions: cs.thinkingOptions,
    selectedThinking,
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
    onOpenSettings: openSettingsPanel,
    onOpenMcpDialog: () => {
      openSettings("mcps")
    },
    onSearchFiles: onSearchMentionFiles,
    onRefreshSlashCommands: chatConfig.refreshSlashCommands,
    onSubmit: (draft) => {
      void onSend(draft)
    },
  } satisfies DirectoryChatMainPaneProps["promptComposerProps"]

  const queuedFollowups = sessionID
    ? (queuedFollowupsBySession[sessionID] ?? []).map((item) => {
        if (item.kind !== "steer") {
          return {
            id: item.id,
            label: item.label,
          }
        }

        return {
          id: item.id,
          label: item.label,
          description: language.t("chat.followupDock.steeringDescription"),
          sendDisabled: cs.isBusy,
          sendLabel: language.t("chat.followupDock.steeringAction"),
        }
      })
    : []

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
    onStartGetStartedChat,
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
    onOpenSettings: openSettingsPanel,
    onOpenMcpSettings: () => {
      openSettings("mcps")
    },
    showHeader: false,
    className: "w-full h-full",
  }

  const mainPaneProps: DirectoryChatMainPaneProps = {
    directory: decodedDirectory,
    chatState: cs,
    transcriptRef: autoScroll.scrollRef,
    showJumpToLatest: autoScroll.showJumpToLatest,
    onJumpToLatest: autoScroll.forceScrollToBottom,
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
      const result = await undoLastSessionMessage(decodedDirectory, { sessionID, messageID })
      const restoreDraft = buildPromptDraftFromUserMessage(result.message, decodedDirectory)
      if (restoreDraft) {
        cs.setPromptDraft(cs.promptKey, restoreDraft)
      }
      void syncTeachingRuntimeSelection()
    },
    onForkMessage: async ({ sessionID, messageID }) => {
      const forkedSession = await forkSession(decodedDirectory, {
        sessionID,
        ...(messageID ? { messageID } : {}),
      })
      void syncTeachingRuntimeSelection({
        directory: decodedDirectory,
        sessionID: forkedSession.id,
        sessionKey: teachingSelectionKey(decodedDirectory, forkedSession.id),
      })
    },
    onRestoreRevertedMessages: async () => {
      if (!sessionID) return

      const draftSnapshot = readPromptSnapshot()

      try {
        const result = await restoreRevertedSessionMessage(decodedDirectory, { sessionID })
        const restoreDraft = buildPromptDraftFromUserMessage(result.message, decodedDirectory)
        if (restoreDraft) {
          cs.setPromptDraft(cs.promptKey, restoreDraft)
        } else {
          cs.clearPromptDraft(cs.promptKey)
        }
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
    queuedFollowups,
    sendingQueuedFollowupID,
    onSendQueuedFollowup: (queuedFollowupID) => {
      if (!sessionID) return
      void sendQueuedFollowup(sessionID, queuedFollowupID)
    },
    onEditQueuedFollowup: (queuedFollowupID) => {
      if (!sessionID) return
      editQueuedFollowup(sessionID, queuedFollowupID)
    },
    onOpenResource: openResourceInReadingMode,
    directories: cs.sidebarDirectories,
    onSelectNotebook: (targetDirectory) => {
      void onNewSession(targetDirectory)
    },
    onStartGetStartedChat,
  }

  const shellProps: ReadyDirectoryChatPageControllerState["shellProps"] = {
    chatTitle: cs.sessionTitle,
    projectName: getFilename(decodedDirectory),
    isTurnActive: cs.isTurnActive,
    titlebarVariant: "chat",
    leftSidebarOpen: cs.leftSidebarOpen,
    leftSidebarDisplayWidth: cs.leftSidebarDisplayWidth,
    leftSidebarWidth: cs.leftSidebarWidth,
    leftSidebarMinWidth: SIDEBAR_MIN_WIDTH,
    leftSidebarMaxWidth: cs.leftSidebarMaxWidth,
    onLeftSidebarResize: cs.setLeftSidebarWidth,
    onLeftSidebarCollapse: () => cs.setLeftSidebarOpen(false),
  }

  return {
    status: "ready",
    leftSidebarProps,
    mainPaneProps,
    shellProps,
  }
}
