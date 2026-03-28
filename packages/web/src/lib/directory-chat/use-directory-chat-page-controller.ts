import { useNavigate } from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type UIEvent,
} from "react"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import { RESOURCE_REFERENCE_PART_TYPE } from "@/components/prompt/prompt-types"
import type { PromptComposerAttachment, PromptComposerPart } from "@/components/prompt/prompt-types"
import { parseSlashCommandInput } from "@/components/prompt/slash-autocomplete"
import type { MentionableAgent } from "@/components/prompt/mention-autocomplete"
import type { DirectoryChatMainPane } from "@/components/directory-chat/directory-chat-main-pane"
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
  RESOURCE_SIDEBAR_TAB,
  type ResourceLocalSlashCommand,
} from "../resource-commands"
import { resolveTeachingPromptContext } from "../teaching-context"
import { pickProjectDirectory } from "../directory-picker"
import { decodeDirectory, encodeDirectory } from "../directory-token"
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
} from "../../state/chat-actions"
import { addResource, rebuildResource, removeResource } from "../../state/resource-actions"
import {
  clonePromptDraft,
  createTextPromptDraft,
  getPromptDraft,
  usePromptStore,
} from "../../state/prompt-store"
import { useChatStore } from "../../state/chat-store"
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

const BOTTOM_THRESHOLD_PX = 96
const SIDEBAR_MIN_WIDTH = 244
const EMPTY_MENTIONABLE_AGENTS: MentionableAgent[] = []

type DirectoryChatPageControllerProps = {
  directoryToken: string
}

type DirectoryChatShellProps = ComponentProps<typeof DirectoryChatShell>
type DirectoryChatMainPaneProps = ComponentProps<typeof DirectoryChatMainPane>
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
  const navigate = useNavigate()
  const transcriptRef = useRef<HTMLElement>(null)

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

  const decodedDirectory = useMemo(() => {
    try {
      return decodeDirectory(props.directoryToken)
    } catch {
      return ""
    }
  }, [props.directoryToken])

  const showDevSessionTrace = import.meta.env.DEV
  const showCapabilitiesSidebarTab = showDevSessionTrace
  const showSystemPromptSidebarTab = showDevSessionTrace

  const openProjects = useChatStore((state) => state.openProjects)
  const hasRegisteredProject = useMemo(
    () =>
      !!decodedDirectory && openProjects.filter((d) => d && d !== "/").includes(decodedDirectory),
    [decodedDirectory, openProjects],
  )

  const chatConfig = useChatConfig({ decodedDirectory, hasRegisteredProject })

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
    clearDirectoryError: cs.clearDirectoryError,
    setDirectoryError: cs.setDirectoryError,
    setStreamStatus: cs.setStreamStatus,
    setSystemPromptRefreshToken,
    refreshSlashCommands: chatConfig.refreshSlashCommands,
    refreshMcpStatus: chatConfig.refreshMcpStatus,
  })

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
      // Store error is handled elsewhere; keep UI non-blocking here.
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
        (await import("../../state/prompt-store")).getPromptScopeKey(
          targetDirectory,
          targetSessionID,
        ),
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
      cs.applySessionUpdated(targetDirectory, updated)
    } catch {
      // Action layers keep directory-level error state.
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

    setStickToBottom(true)

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
    if (cs.rightSidebarActiveTab === "diagrams") return

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
      if (!decodedDirectory) return
      cs.setSelectedModel(decodedDirectory, model)
    },
    onThinkingChange: setSelectedThinking,
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
      void onOpenProject()
    },
    onNewSession: (targetDirectory) => {
      void onNewSession(targetDirectory)
    },
    onSelectSession: (targetDirectory, targetSessionID) => {
      void onSelectSession(targetDirectory, targetSessionID)
    },
    onTogglePin: (targetDirectory, targetSessionID) =>
      cs.togglePinned(targetDirectory, targetSessionID),
    onToggleUnread: onToggleUnreadSession,
    onArchiveSession,
    onRenameSession,
    onReorderDirectories: (nextOrder) => {
      void reorderOpenProjects(nextOrder)
    },
    onCloseDirectory: (targetDirectory) => {
      void onCloseDirectory(targetDirectory)
    },
    onOpenCurriculum: openCurriculumPanel,
    onOpenSettings: openSettingsPanel,
    className: "w-full h-full",
  }

  const mainPaneProps: DirectoryChatMainPaneProps = {
    directory: decodedDirectory,
    chatState: cs,
    transcriptRef,
    onTranscriptScroll,
    onOpenSession: (targetSessionID) => {
      void onSelectSession(decodedDirectory, targetSessionID)
    },
    onNewSession: () => {
      void onNewSession()
    },
    onPermissionReply: async (reply) => {
      if (!cs.pendingPermissions[0]) return
      await onPermissionReply(cs.pendingPermissions[0].id, reply)
    },
    promptComposerProps,
  }

  const rightSidebarProps: DirectoryChatRightSidebarProps = {
    directory: decodedDirectory,
    chatState: cs,
    teachingWorkspace: teachingWs,
    showCapabilitiesTab: showCapabilitiesSidebarTab,
    showSystemPromptTab: showSystemPromptSidebarTab,
    resourcesRefreshToken,
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
