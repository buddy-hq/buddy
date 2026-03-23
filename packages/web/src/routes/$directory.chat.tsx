import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react"
import { Button } from "@buddy/ui"
import { ChatEmptyState } from "@/components/chat/chat-empty-state"
import { SessionContextUsage } from "@/components/chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/chat/permission-dock"
import { SystemPromptPanel } from "@/components/debug/system-prompt-panel"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { ChatRightSidebar } from "@/components/layout/chat-right-sidebar"
import { ResizeHandle } from "@/components/layout/resize-handle"
import { ResourcesPanel } from "@/components/resources/resources-panel"
import { AgentsMdPanel } from "@/components/agents/agents-md-panel"
import { TeachingEditorPanel } from "@/components/teaching/teaching-editor-panel"
import { MathFigurePanel } from "@/components/teaching/math-figure-panel"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import { usePlatform } from "@/context/platform"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import { RESOURCE_REFERENCE_PART_TYPE } from "@/components/prompt/prompt-types"
import type { PromptComposerAttachment, PromptComposerPart } from "@/components/prompt/prompt-types"
import { parseSlashCommandInput } from "@/components/prompt/slash-autocomplete"
import type { MentionableAgent } from "@/components/prompt/mention-autocomplete"
import {
  isResourceLocalSlashCommandName,
  parseResourceLocalSlashCommand,
  RESOURCE_COMMAND_ADD,
  RESOURCE_COMMAND_PANEL,
  RESOURCE_COMMAND_REMOVE,
  RESOURCE_COMMAND_REBUILD,
  RESOURCE_COMMAND_USE,
  RESOURCE_LOCAL_SLASH_COMMANDS,
  RESOURCE_SIDEBAR_TAB,
  type ResourceLocalSlashCommand,
} from "../lib/resource-commands"
import {
  ChevronRightIcon,
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
} from "@/components/layout/sidebar-icons"
import { Loader2Icon } from "lucide-react"
import { resolveTeachingPromptContext } from "../lib/teaching-context"
import { pickProjectDirectory } from "../lib/directory-picker"
import { decodeDirectory, encodeDirectory } from "../lib/directory-token"
import {
  type LearnerCurriculumView,
  abortPrompt,
  bootstrapOpenProjects,
  closeOpenProject,
  ensureDirectorySession,
  findWorkspaceFiles,
  loadMessages,
  loadPermissions,
  loadSessions,
  loadTeachingSessionState,
  openProject,
  reorderOpenProjects,
  replyPermission,
  selectSession,
  sendCommand,
  sendPrompt,
  startNewSession,
  updateSession,
} from "../state/chat-actions"
import { addResource, rebuildResource, removeResource } from "../state/resource-actions"
import {
  clonePromptDraft,
  createTextPromptDraft,
  getPromptDraft,
  usePromptStore,
} from "../state/prompt-store"
import { useChatStore } from "../state/chat-store"
import { stringifyError } from "../state/teaching-actions"
import {
  TEACHING_LANGUAGE_OPTIONS,
  intentFromSelection,
  useTeachingRuntime,
  type TeachingLanguage,
  type TeachingIntent,
} from "../state/teaching-runtime"
import {
  buildCommandAttachmentParts,
  buildPromptSubmissionParts,
} from "../lib/directory-chat/chat-prompt-helpers"
import { buildSessionTrace, copyToClipboard } from "../lib/directory-chat/chat-debug-helpers"
import { useDirectoryChatState } from "../lib/directory-chat/use-directory-chat-state"
import { useChatSync } from "../lib/directory-chat/use-chat-sync"
import { useChatConfig } from "../lib/directory-chat/use-chat-config"
import { useTeachingWorkspace } from "../lib/directory-chat/use-teaching-workspace"

export const Route = createFileRoute("/$directory/chat")({
  component: DirectoryChatPage,
})

const BOTTOM_THRESHOLD_PX = 96
const SIDEBAR_MIN_WIDTH = 244
const EMPTY_MENTIONABLE_AGENTS: MentionableAgent[] = []

function DirectoryChatPage() {
  const params = Route.useParams()
  const navigate = useNavigate()
  const platform = usePlatform()
  const transcriptRef = useRef<HTMLElement | null>(null)

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [stickToBottom, setStickToBottom] = useState(true)
  const [selectedThinking, setSelectedThinking] = useState("default")
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

  // ── Decoded directory ───────────────────────────────────────────────────────
  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(params.directory)
    } catch {
      return ""
    }
  }, [params.directory])

  const showDevSessionTrace = import.meta.env.DEV
  const showCapabilitiesSidebarTab = showDevSessionTrace
  const showSystemPromptSidebarTab = showDevSessionTrace

  // ── Derive hasRegisteredProject before hooks that need it ──────────────────
  const _openProjects = useChatStore((state) => state.openProjects)
  const hasRegisteredProject = useMemo(
    () =>
      !!decodedDirectory && _openProjects.filter((d) => d && d !== "/").includes(decodedDirectory),
    [decodedDirectory, _openProjects],
  )

  // ── Composer config (personas, slash commands, default intent/model) ─────────
  const chatConfig = useChatConfig({ decodedDirectory, hasRegisteredProject })

  // ── All Zustand selectors and derived state ──────────────────────────────────
  const cs = useDirectoryChatState({
    decodedDirectory,
    configuredModel: chatConfig.configuredModel,
    personaCatalog: chatConfig.personaCatalog,
    defaultPersona: chatConfig.defaultPersona,
    defaultIntent: chatConfig.defaultIntent,
    selectedThinking,
    showSystemPromptSidebarTab,
    showCapabilitiesSidebarTab,
  })
  const {
    clearUnread,
    migrateWorkspaceDraft,
    modelOptions,
    selectedModelKey,
    sessionID,
    sessionKey,
    setActiveDirectory,
    setSelectedModel,
    thinkingOptions,
    validOpenProjects,
  } = cs

  const { slashCommands } = chatConfig
  const slashCommandCandidates = useMemo(
    () => [
      ...RESOURCE_LOCAL_SLASH_COMMANDS.map((command) => ({
        name: command.name,
      })),
      ...slashCommands,
    ],
    [slashCommands],
  )

  // ── Teaching workspace ───────────────────────────────────────────────────────
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

  // ── SSE sync + refresh interval ───────────────────────────────────────────
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
    clearDirectoryError: cs.clearDirectoryError,
    setDirectoryError: cs.setDirectoryError,
    setStreamStatus: cs.setStreamStatus,
    setSystemPromptRefreshToken,
    refreshSlashCommands: chatConfig.refreshSlashCommands,
    refreshMcpStatus: chatConfig.refreshMcpStatus,
  })

  // ── Prompt store helpers ────────────────────────────────────────────────────
  function readPromptSnapshot() {
    return clonePromptDraft(getPromptDraft(usePromptStore.getState(), cs.promptKey))
  }

  function restorePromptSnapshot(snapshot: ReturnType<typeof readPromptSnapshot>) {
    cs.setPromptDraft(cs.promptKey, {
      value: snapshot.value,
      parts: snapshot.parts,
      attachments: snapshot.attachments,
      cursor: snapshot.cursor,
    })
  }

  function stagePromptText(value: string) {
    const nextDraft = createTextPromptDraft(value)
    cs.setPromptDraft(cs.promptKey, nextDraft)
  }

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setPendingSuggestionOverride(undefined)
  }, [sessionKey])

  useEffect(() => {
    if (!decodedDirectory || !sessionID) return
    migrateWorkspaceDraft(decodedDirectory, sessionID)
  }, [decodedDirectory, migrateWorkspaceDraft, sessionID])

  useEffect(() => {
    void bootstrapOpenProjects().catch(() => undefined)
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
        navigate({ to: "/chat", replace: true })
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
        navigate({ to: "/chat", replace: true })
      })
  }, [decodedDirectory, navigate, setActiveDirectory, validOpenProjects])

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
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" })
  }, [cs.messages, cs.isBusy, stickToBottom])

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

  // ── Teaching runtime sync ───────────────────────────────────────────────────
  const syncTeachingRuntimeSelection = useCallback(
    async (input?: { directory?: string; sessionID?: string; sessionKey?: string }) => {
      const activeDirectory = input?.directory ?? decodedDirectory
      const activeSessionID = input?.sessionID ?? sessionID
      const activeSessionKey = input?.sessionKey ?? sessionKey
      if (!activeDirectory || !activeSessionID || !activeSessionKey) return

      try {
        const runtime = await loadTeachingSessionState(activeDirectory, activeSessionID)
        if (!runtime) return
        const teaching = useTeachingRuntime.getState()
        teaching.setSessionPersona(activeSessionKey, runtime.persona)
        teaching.setSessionIntent(activeSessionKey, runtime.intent ?? "auto")
      } catch {
        // Ignore sessions without Buddy teaching state yet.
      }
    },
    [decodedDirectory, sessionID, sessionKey],
  )

  useEffect(() => {
    void syncTeachingRuntimeSelection()
  }, [syncTeachingRuntimeSelection])

  // ── Session / navigation handlers ───────────────────────────────────────────
  function onSwitchDirectory(nextDirectory: string) {
    if (!nextDirectory) return
    navigate({
      to: "/$directory/chat",
      params: { directory: encodeDirectory(nextDirectory) },
    })
  }

  async function onNewSession(targetDirectory = decodedDirectory) {
    if (!targetDirectory) return
    try {
      await startNewSession(targetDirectory)
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
      await selectSession(targetDirectory, nextSessionID)
      cs.clearUnread(targetDirectory, nextSessionID)
      if (targetDirectory !== decodedDirectory) onSwitchDirectory(targetDirectory)
    } catch {
      // Store already captures and displays errors.
    }
  }

  async function onPermissionReply(requestID: string, reply: "once" | "always" | "reject") {
    if (!decodedDirectory) return
    try {
      await replyPermission({ directory: decodedDirectory, requestID, reply })
    } catch {
      // store error is handled by action callers elsewhere; keep UI non-blocking here
    }
  }

  async function onOpenProject() {
    if (!decodedDirectory) return
    try {
      const picked = await pickProjectDirectory()
      if (!picked) return
      const nextDirectory = await openProject(picked)
      cs.setActiveDirectory(nextDirectory)
      onSwitchDirectory(nextDirectory)
    } catch (error) {
      cs.setDirectoryError(decodedDirectory, stringifyError(error))
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
        (await import("../state/prompt-store")).getPromptScopeKey(targetDirectory, targetSessionID),
      )
      cs.clearDirectorySessionState(targetDirectory, targetSessionID)
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
        cs.clearUnread(targetDirectory, activeSessionID)
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
      cs.applySessionUpdated(targetDirectory, updated)
    } catch {
      // action layers keep directory-level error state
    }
  }

  async function onCloseDirectory(targetDirectory: string) {
    const closedDirectory = await closeOpenProject(targetDirectory)
    if (!closedDirectory) return
    if (closedDirectory !== decodedDirectory) return

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

  // ── Panel helpers ────────────────────────────────────────────────────────────
  function openCurriculumPanel() {
    cs.setRightSidebarTab("curriculum")
    cs.setRightSidebarOpen(true)
  }

  function openResourcesPanel() {
    cs.setRightSidebarTab(RESOURCE_SIDEBAR_TAB)
    cs.setRightSidebarOpen(true)
  }

  function refreshResourcesPanel() {
    setResourcesRefreshToken((current) => current + 1)
  }

  function openSettingsPanel() {
    navigate({ to: "/settings", search: { tab: "instructions" } })
  }

  function onToggleRightSidebar() {
    if (cs.rightSidebarOpen) {
      cs.setRightSidebarOpen(false)
      return
    }
    if (cs.rightSidebarActiveTab === "editor" && cs.rightSidebarWidth < 360) {
      cs.setRightSidebarWidth(640)
    }
    cs.setRightSidebarOpen(true)
  }

  // ── Resource command handler ─────────────────────────────────────────────────
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

  // ── Search files for @mention ────────────────────────────────────────────────
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

  // ── Prompt submission ────────────────────────────────────────────────────────
  async function sendRuntimePrompt(input: {
    content: string
    attachments?: PromptComposerAttachment[]
    parts?: PromptComposerPart[]
    intent?: TeachingIntent
    focusGoalIds?: string[]
  }) {
    if (!decodedDirectory) return false

    const rawAttachments = input.attachments ?? []
    const promptParts = input.parts ?? []
    const content = input.content.trim()
    if (!content && rawAttachments.length === 0 && promptParts.length === 0) return false

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

    await sendPrompt(decodedDirectory, promptParts.length > 0 ? "" : content, {
      parts: buildPromptSubmissionParts(promptParts, rawAttachments),
      persona: cs.selectedPersona,
      intent: input.intent ?? intentFromSelection(cs.storedIntent),
      focusGoalIds: input.focusGoalIds,
      model: cs.effectiveModelSelection,
      variant,
      teaching: teachingContext,
    })
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

    const variant = selectedThinking !== "default" ? selectedThinking : undefined
    const slashCommand = parseSlashCommandInput(rawContent, slashCommandCandidates)

    if (slashCommand) {
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
          intent: intentFromSelection(cs.storedIntent),
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

    const canSendImmediately =
      !!decodedDirectory &&
      !!cs.sessionKey &&
      !cs.isBusy &&
      cs.draftState.value.trim().length === 0 &&
      cs.draftState.attachments.length === 0

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
    const distanceFromBottom = node.scrollHeight - (node.scrollTop + node.clientHeight)
    setStickToBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
  }

  function onPersonaChange(persona: string) {
    if (!cs.sessionKey) return
    cs.teachingRuntime.setSessionPersona(cs.sessionKey, persona)

    const nextPersona = cs.primaryPersonaOptions.find((option) => option.id === persona)
    if (!nextPersona) return

    if (cs.rightSidebarActiveTab === "capabilities" && showCapabilitiesSidebarTab) return
    if (cs.rightSidebarActiveTab === RESOURCE_SIDEBAR_TAB) return
    if (cs.rightSidebarActiveTab === "agents-md") return

    if (nextPersona.surfaces.includes("editor") && cs.teachingWorkspace) {
      cs.setRightSidebarTab("editor")
      if (cs.rightSidebarWidth < 360) cs.setRightSidebarWidth(640)
      cs.setRightSidebarOpen(true)
      return
    }

    if (!nextPersona.surfaces.includes(cs.selectedSurfaceTab)) {
      cs.setRightSidebarTab(nextPersona.defaultSurface)
    }
  }

  function onIntentChange(intent: TeachingIntent) {
    if (!cs.sessionKey) return
    cs.teachingRuntime.setSessionIntent(cs.sessionKey, intent)
  }

  function onTeachingCreateFile() {
    if (!decodedDirectory || !cs.sessionID || !cs.sessionKey) return
    setCreateFileDialogOpen(true)
  }

  // ── Early returns ────────────────────────────────────────────────────────────
  if (!decodedDirectory) {
    return <div className="p-6">Invalid notebook identifier in URL.</div>
  }

  if (!hasRegisteredProject) {
    return <div className="p-6">Opening notebook...</div>
  }

  const showHeaderSidebarToggle = !(platform.platform === "desktop" && platform.os === "macos")

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full overflow-hidden bg-surface-raised-base">
      <div className="h-full w-full flex min-w-0">
        {/* Left sidebar */}
        <div
          className={`relative shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
            cs.leftSidebarOpen ? "" : "pointer-events-none"
          }`}
          style={{
            width: `${cs.leftSidebarOpen ? cs.leftSidebarDisplayWidth : 0}px`,
          }}
        >
          <div
            className={`h-full transition-opacity duration-200 ease-out ${
              cs.leftSidebarOpen ? "opacity-100" : "opacity-0"
            }`}
            style={{ width: `${cs.leftSidebarDisplayWidth}px` }}
          >
            <ChatLeftSidebar
              directories={cs.sidebarDirectories}
              currentDirectory={decodedDirectory}
              sessionsByDirectory={cs.sessionsByDirectory}
              activeSessionID={cs.sessionID}
              sessionStatusByDirectory={cs.sessionStatusByDirectory}
              pinnedByDirectory={cs.pinnedByDirectory}
              unreadByDirectory={cs.unreadByDirectory}
              onOpenDirectory={() => {
                void onOpenProject()
              }}
              onNewSession={(targetDirectory) => {
                void onNewSession(targetDirectory)
              }}
              onSelectSession={(targetDirectory, targetSessionID) => {
                void onSelectSession(targetDirectory, targetSessionID)
              }}
              onTogglePin={(targetDirectory, targetSessionID) =>
                cs.togglePinned(targetDirectory, targetSessionID)
              }
              onToggleUnread={onToggleUnreadSession}
              onArchiveSession={onArchiveSession}
              onRenameSession={onRenameSession}
              onReorderDirectories={(nextOrder) => {
                void reorderOpenProjects(nextOrder)
              }}
              onCloseDirectory={(targetDirectory) => {
                void onCloseDirectory(targetDirectory)
              }}
              onOpenCurriculum={openCurriculumPanel}
              onOpenSettings={openSettingsPanel}
              className="w-full h-full"
            />
          </div>
          {cs.leftSidebarOpen ? (
            <ResizeHandle
              direction="horizontal"
              size={cs.leftSidebarWidth}
              min={SIDEBAR_MIN_WIDTH}
              max={cs.leftSidebarMaxWidth}
              collapseThreshold={SIDEBAR_MIN_WIDTH}
              onResize={cs.setLeftSidebarWidth}
              onCollapse={() => cs.setLeftSidebarOpen(false)}
            />
          ) : null}
        </div>

        {/* Main */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-background-base/20">
          <header className="border-b px-3 py-2">
            <div className="mx-auto flex w-full max-w-full items-center justify-between gap-2 md:max-w-200 2xl:max-w-[1000px]">
              <div className="min-w-0 flex items-center gap-1.5">
                {showHeaderSidebarToggle ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => cs.setLeftSidebarOpen(!cs.leftSidebarOpen)}
                    title={cs.leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
                  >
                    {cs.leftSidebarOpen ? (
                      <LayoutLeftPartialIcon className="size-3.5" />
                    ) : (
                      <LayoutLeftIcon className="size-3.5" />
                    )}
                  </Button>
                ) : null}
                {cs.parentSession ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      void onSelectSession(decodedDirectory, cs.parentSession!.id)
                    }}
                    title={`Back to ${cs.parentSession.title || "parent thread"}`}
                  >
                    <ChevronRightIcon className="size-3.5 rotate-180" />
                  </Button>
                ) : null}
                <div className="min-w-0">
                  <h1 className="text-sm md:text-base font-medium text-text-strong truncate">
                    {cs.sessionTitle}
                  </h1>
                  <p className="text-xs text-text-weak truncate">
                    local: {getFilename(decodedDirectory)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <SessionContextUsage messages={cs.messages} providers={cs.providers} />
                <Button
                  variant={cs.hasMcpError ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => navigate({ to: "/settings", search: { tab: "mcps" } })}
                  title="View and manage MCPs"
                >
                  {cs.mcpEntries.length > 0
                    ? cs.hasMcpError
                      ? "MCP error"
                      : `MCP ${cs.connectedMcpCount}/${cs.mcpEntries.length}`
                    : "MCP"}
                </Button>
                {showHeaderSidebarToggle ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onToggleRightSidebar}
                    title={cs.rightSidebarOpen ? "Collapse right panel" : "Expand right panel"}
                  >
                    {cs.rightSidebarOpen ? (
                      <LayoutRightPartialIcon className="size-3.5" />
                    ) : (
                      <LayoutRightIcon className="size-3.5" />
                    )}
                  </Button>
                ) : null}
                {showDevSessionTrace && cs.sessionID ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void copyToClipboard(
                        buildSessionTrace({
                          directory: decodedDirectory,
                          sessionID: cs.sessionID!,
                          streamStatus: cs.streamStatus,
                        }),
                      )
                    }}
                  >
                    Copy Trace
                  </Button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex min-h-0 flex-1 flex-col">
              <section
                ref={transcriptRef}
                onScroll={onTranscriptScroll}
                className="flex-1 min-h-0 overflow-y-auto"
              >
                <div
                  className={`mx-auto w-full max-w-full px-4 py-4 space-y-4 md:max-w-200 2xl:max-w-[1000px] ${
                    cs.messages.length === 0 && cs.isReady ? "h-full" : ""
                  }`}
                >
                  {!cs.isReady ? (
                    <p className="text-sm text-text-weak">Loading conversation history...</p>
                  ) : cs.messages.length === 0 ? (
                    <div className="h-full flex flex-col">
                      <ChatEmptyState directoryLabel={getFilename(decodedDirectory)} />
                    </div>
                  ) : (
                    <ChatTranscript
                      messages={cs.messages}
                      providers={cs.providers}
                      isBusy={cs.isBusy}
                      onOpenSession={(targetSessionID) => {
                        void onSelectSession(decodedDirectory, targetSessionID)
                      }}
                    />
                  )}
                </div>
              </section>

              {cs.error ? (
                <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200 2xl:max-w-[1000px]">
                  <div className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
                    {cs.error}
                  </div>
                </div>
              ) : null}

              {cs.pendingPermissions.length > 0 ? (
                <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200 2xl:max-w-[1000px]">
                  <PermissionDock
                    request={cs.pendingPermissions[0]!}
                    pendingCount={Math.max(0, cs.pendingPermissions.length - 1)}
                    onReply={async (reply) => {
                      await onPermissionReply(cs.pendingPermissions[0]!.id, reply)
                    }}
                  />
                </div>
              ) : null}

              <div className="mx-auto w-full max-w-full px-4 md:max-w-200 2xl:max-w-[1000px]">
                <PromptComposer
                  className="mb-4"
                  directory={decodedDirectory}
                  sessionID={cs.sessionID}
                  isBusy={cs.isBusy}
                  personaOptions={cs.primaryPersonaOptions.map((persona) => ({
                    name: persona.id,
                    label: persona.label,
                  }))}
                  mentionableAgents={EMPTY_MENTIONABLE_AGENTS}
                  slashCommands={slashCommands}
                  modelOptions={cs.modelOptions}
                  selectedPersona={cs.selectedPersona}
                  selectedIntent={cs.storedIntent}
                  selectedModel={cs.selectedModelKey}
                  pendingSteerLabel={pendingSuggestionOverride?.label}
                  thinkingOptions={cs.thinkingOptions}
                  selectedThinking={selectedThinking}
                  onPersonaChange={onPersonaChange}
                  onIntentChange={onIntentChange}
                  onClearPendingSteer={() => {
                    setPendingSuggestionOverride(undefined)
                  }}
                  onModelChange={(model) => {
                    if (!decodedDirectory) return
                    cs.setSelectedModel(decodedDirectory, model)
                  }}
                  onThinkingChange={setSelectedThinking}
                  onAbort={() => {
                    void onAbort()
                  }}
                  onNewSession={() => {
                    void onNewSession()
                  }}
                  onOpenMcpDialog={() => {
                    navigate({ to: "/settings", search: { tab: "mcps" } })
                  }}
                  onSearchFiles={onSearchMentionFiles}
                  onRefreshSlashCommands={chatConfig.refreshSlashCommands}
                  onSubmit={() => {
                    void onSend()
                  }}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Right sidebar */}
        <div
          className={`relative shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
            cs.rightSidebarOpen ? "" : "pointer-events-none"
          }`}
          style={{
            width: `${cs.rightSidebarOpen ? cs.rightSidebarDisplayWidth : 0}px`,
          }}
        >
          <div
            className={`h-full transition-opacity duration-200 ease-out ${
              cs.rightSidebarOpen ? "opacity-100" : "opacity-0"
            }`}
            style={{ width: `${cs.rightSidebarDisplayWidth}px` }}
          >
            <ChatRightSidebar
              directory={decodedDirectory}
              activeTab={cs.rightSidebarActiveTab}
              onTabChange={cs.setRightSidebarTab}
              surfaces={cs.selectedPersonaSurfaces}
              showCapabilitiesTab={showCapabilitiesSidebarTab}
              showSystemPromptTab={showSystemPromptSidebarTab}
              resourcesPanel={
                <ResourcesPanel directory={decodedDirectory} refreshToken={resourcesRefreshToken} />
              }
              agentsPanel={<AgentsMdPanel directory={decodedDirectory} />}
              systemPromptPanel={
                showSystemPromptSidebarTab ? (
                  <SystemPromptPanel
                    directory={decodedDirectory}
                    sessionID={cs.sessionID}
                    refreshToken={systemPromptRefreshToken}
                  />
                ) : undefined
              }
              sessionID={cs.sessionID}
              persona={cs.selectedPersona}
              intent={intentFromSelection(cs.storedIntent)}
              onRunAction={(action) => {
                void onRunCurriculumAction(action)
              }}
              editorPanel={
                cs.selectedPersonaSupportsEditor ? (
                  cs.isInteractiveMode ? (
                    cs.teachingWorkspace ? (
                      <TeachingEditorPanel
                        className="h-full min-h-0 flex-1 border-t-0 bg-transparent lg:border-l-0"
                        workspace={cs.teachingWorkspace}
                        isBusy={cs.isBusy}
                        onCodeChange={teachingWs.onTeachingCodeChange}
                        onSelectFile={(relativePath) => {
                          void teachingWs.onTeachingSelectFile(relativePath)
                        }}
                        onCreateFile={() => {
                          onTeachingCreateFile()
                        }}
                        onSelectionChange={teachingWs.onTeachingSelectionChange}
                        onLanguageChange={teachingWs.onTeachingLanguageChange}
                        onCheckpoint={() => {
                          void teachingWs.onTeachingCheckpoint()
                        }}
                        onRestoreAccepted={() => {
                          void teachingWs.onTeachingRestoreAccepted()
                        }}
                        onLoadExternalChanges={teachingWs.onLoadExternalChanges}
                        onForceOverwrite={teachingWs.onForceOverwrite}
                      />
                    ) : (
                      <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-sm text-text-weak">
                        Preparing lesson workspace...
                      </section>
                    )
                  ) : (
                    <section className="flex min-h-0 flex-1 flex-col justify-center gap-4 px-6 py-8">
                      <div className="space-y-2">
                        <h2 className="text-sm font-medium">Interactive Lesson</h2>
                        <p className="text-sm text-text-weak">
                          Start an interactive session to create a tracked workspace with files,
                          checkpoints, and server-backed editor diagnostics.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-text-weak" htmlFor="interactive-language">
                          Language
                        </label>
                        <select
                          id="interactive-language"
                          className="h-8 rounded-md border bg-background-base px-2 text-xs"
                          value={cs.preferredLanguage}
                          onChange={(event) =>
                            teachingWs.onTeachingPreferredLanguageChange(
                              event.target.value as TeachingLanguage,
                            )
                          }
                          disabled={!cs.sessionKey || cs.isBusy}
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
                            void teachingWs.onStartInteractiveLesson({
                              sessionID: cs.sessionID ?? "",
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
                          }}
                          disabled={!cs.sessionKey || cs.isBusy || isStartingInteractiveLesson}
                        >
                          {isStartingInteractiveLesson ? (
                            <>
                              <Loader2Icon className="mr-2 size-4 animate-spin" />
                              Starting...
                            </>
                          ) : (
                            "Start Interactive Lesson"
                          )}
                        </Button>
                      </div>

                      <div className="rounded-lg border border-border-base/70 bg-background-base p-3 text-xs text-text-weak">
                        Current workspace:{" "}
                        {isStartingInteractiveLesson ? "starting..." : "not started"}
                        <br />
                        Selected persona: {cs.selectedPersona}
                      </div>
                    </section>
                  )
                ) : undefined
              }
              figurePanel={
                cs.selectedPersonaSupportsFigure ? (
                  <MathFigurePanel className="h-full min-h-0 flex-1" />
                ) : undefined
              }
              onClose={() => cs.setRightSidebarOpen(false)}
              className="w-full h-full"
            />
          </div>
          {cs.rightSidebarOpen ? (
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={cs.rightSidebarDisplayWidth}
              min={cs.rightSidebarMinWidth}
              max={cs.rightSidebarMaxWidth}
              collapseThreshold={160}
              onResize={cs.setRightSidebarWidth}
              onCollapse={() => cs.setRightSidebarOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <CreateTeachingFileDialog
        open={createFileDialogOpen}
        onOpenChange={setCreateFileDialogOpen}
        onConfirm={(path) => void teachingWs.onCreateTeachingFileConfirm(path)}
      />
    </div>
  )
}
