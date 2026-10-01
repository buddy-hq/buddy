import type { ComponentProps, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  SquarePenIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@buddy/ui"
import { parseTBoolean, parseTJsonObject } from "@/components/chat/tools/types"
import { FolderAddIcon, Globe, NoteAddIcon, PresentationIcon } from "@/icons/app-icons"
import { useChatJumpShortcuts, useShortcutCommand } from "@/lib/use-shortcut-command"
import { useRubberBandOverscroll } from "@/lib/use-rubber-band-overscroll"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { globalConfigQueryOptions } from "@/state/global-config-query"
import type { GetStartedChat } from "@/lib/get-started-chats"
import {
  loadNotebookLearnerMemoryDefaults,
  resolveNotebookLearnerMemorySelection,
} from "@/state/learner-memory-settings"
import { readPersonalization } from "@/state/project-config-readers"
import { useGetStartedFlow } from "@/state/use-get-started-flow"
import { useUiPreferences, useUiPreferencesHydrated } from "@/state/ui-preferences"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
  experimentalFeaturesQueryOptions,
} from "@/state/experimental-features-query"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import {
  ChatLeftSidebarDialogs,
  NotebookCreationDialog,
  NotebookSettingsDialog,
  ObsidianVaultConnectionDialog,
} from "./chat-left-sidebar/dialogs"
import { DESKTOP_TITLEBAR_HEIGHT_PX } from "./desktop-titlebar-inset"
import {
  ChatLeftSidebarDirectoryList,
  SIDEBAR_COLLAPSED_CHAT_COUNT,
  visibleDirectorySessions,
} from "./chat-left-sidebar/directory-list"
import { ChatLeftSidebarPinnedList, collectPinnedSessions } from "./chat-left-sidebar/pinned-list"
import { ChatLeftSidebarRecentsList } from "./chat-left-sidebar/recents-list"
import { stepSidebarChat, type SidebarChat } from "./chat-left-sidebar/chat-navigation"
import { findRootSessionID } from "./chat-left-sidebar/thread-helpers"
import { GetStartedChats } from "./chat-left-sidebar/get-started-chats"
import { ChatLeftSidebarToolbar } from "./chat-left-sidebar/toolbar"
import { useDirectoryGroups } from "./chat-left-sidebar/use-directory-groups"
import {
  mergeDirectoryOrder,
  useDirectoryReordering,
} from "./chat-left-sidebar/use-directory-reordering"
import type {
  ArchiveState,
  DeleteState,
  OrganizeMode,
  RenameState,
  ShowMode,
  SortMode,
} from "./chat-left-sidebar/types"
import { SettingsIcon } from "./sidebar-icons"
import { UpdateStatusButton } from "@/components/updates/update-status-button"
import { getFilename } from "./sidebar-helpers"
import { ensureTeacherStandards, shouldAutoSetupTeacherStandards } from "@/lib/teacher-standards"
import { disconnectObsidianVault, obsidianVaultQueryKeys } from "@/state/obsidian-vault-query"
import { invalidateSkillsCatalogQuery } from "@/state/skills-catalog-query"

type ChatLeftSidebarProps = {
  directories: string[]
  currentDirectory: string
  selectedModel?: string
  sessionsByDirectory: Record<string, SessionInfo[]>
  activeSessionID?: string
  sessionStatusByDirectory: Record<string, Record<string, SessionStatusInfo>>
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  onOpenDirectory: () => void
  onOpenExistingFolder?: () => void | Promise<void>
  onQuickChat?: () => void | Promise<void>
  onStageGetStartedChat?: (chat: GetStartedChat) => Promise<boolean> | boolean
  onCreateNotebook?: (
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) => void | Promise<void>
  onNewSession: (directory?: string) => void | Promise<void>
  onNewNote?: () => void
  /** Creates a board on the Bench of the chat that is already open. Absent where no chat is. */
  onNewBoard?: () => void
  /** Opens a blank browser tab on this notebook's Bench. Absent where there is no in-app browser. */
  onNewBrowserTab?: () => void
  /** Resolves false when the transition was blocked or failed and the active chat did not change. */
  onSelectSession: (directory: string, sessionID?: string) => Promise<boolean>
  onPrefetchSession?: (directory: string, sessionID: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onArchiveSession: (directory: string, sessionID: string) => Promise<void>
  onDeleteSession: (directory: string, sessionID: string) => Promise<boolean>
  onRenameSession: (directory: string, sessionID: string, title: string) => Promise<void>
  onReorderDirectories: (newOrder: string[]) => void
  onCloseDirectory: (directory: string) => void
  onOpenSettings: () => void
  onOpenMcpSettings: () => void
  obsidianConnectionPrompt?: Omit<ComponentProps<typeof ObsidianVaultConnectionDialog>, "open">
  showHeader?: boolean
  footer?: ReactNode
  children?: ReactNode
  className?: string
}

const SIDEBAR_ACTION_TOOLTIP_DELAY_MS = 500

/** The sidebar's scrolling lists, with elastic overscroll at both ends. */
function SidebarScrollArea(props: { className: string; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useRubberBandOverscroll(scrollRef)

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div ref={scrollRef} className={`scrollbar-hover h-full overflow-y-auto ${props.className}`}>
        {props.children}
      </div>
    </div>
  )
}

/**
 * One icon tile in the action row above the chat lists; its name lives in the tooltip, below
 * the tile — above it would slide under the macOS traffic lights.
 */
function SidebarActionTile(props: {
  action: string
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-action={props.action}
          aria-label={props.label}
          className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg bg-surface-raised-base-hover text-icon-base transition-[background-color,color,transform] duration-100 ease-out hover:bg-surface-raised-strong hover:text-text-strong active:scale-[0.97]"
          onClick={props.onClick}
        >
          {props.children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="px-2 py-1 text-[11px]">
        {props.label}
      </TooltipContent>
    </Tooltip>
  )
}

function toggleDirectoryPresence(current: Record<string, true>, directory: string) {
  const next = { ...current }
  if (next[directory]) {
    delete next[directory]
  } else {
    next[directory] = true
  }
  return next
}

export function ChatLeftSidebar(props: ChatLeftSidebarProps) {
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const isMacDesktop = platform.platform === "desktop" && platform.os === "macos"
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [archiveState, setArchiveState] = useState<ArchiveState | undefined>(undefined)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [deleteState, setDeleteState] = useState<DeleteState | undefined>(undefined)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [renameState, setRenameState] = useState<RenameState | undefined>(undefined)
  const [renameSaving, setRenameSaving] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, true>>({})
  const [pinnedExpanded, setPinnedExpanded] = useState(false)
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>("project")
  const [sortMode, setSortMode] = useState<SortMode>("updated")
  const [showMode, setShowMode] = useState<ShowMode>("all")
  const [notebookCreationOpen, setNotebookCreationOpen] = useState(false)
  const [notebookName, setNotebookName] = useState("")
  const [notebookSaving, setNotebookSaving] = useState(false)
  const [notebookSettingsDirectory, setNotebookSettingsDirectory] = useState<string>()
  const [learnerMemoryEnabled, setLearnerMemoryEnabled] = useState(true)
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true)
  const globalConfigQuery = useQuery(globalConfigQueryOptions())
  const experimentalFeaturesQuery = useQuery(experimentalFeaturesQueryOptions())
  const learnerMemoryExperimentEnabled = experimentalFeatureIsEnabled(
    experimentalFeaturesQuery.data,
    EXPERIMENTAL_FEATURE_ID.learnerMemory,
  )
  const learnerMemoryDefaults = useMemo(
    () => resolveNotebookLearnerMemorySelection(globalConfigQuery.data ?? {}, {}),
    [globalConfigQuery.data],
  )
  const primaryUse = readPersonalization(globalConfigQuery.data ?? {}).primaryUse
  const getStartedFlow = useGetStartedFlow(props.currentDirectory, props.selectedModel)
  const teacherStandardsAutoSetupComplete = useUiPreferences(
    (state) => state.teacherStandardsAutoSetupComplete,
  )
  const setTeacherStandardsAutoSetupComplete = useUiPreferences(
    (state) => state.setTeacherStandardsAutoSetupComplete,
  )
  const collapsedDirectories = useUiPreferences((state) => state.collapsedChatSidebarDirectories)
  const setChatSidebarDirectoryOpen = useUiPreferences((state) => state.setChatSidebarDirectoryOpen)
  const pinnedDirectories = useUiPreferences((state) => state.pinnedDirectories)
  const togglePinnedDirectory = useUiPreferences((state) => state.togglePinnedDirectory)
  const setPinnedDirectories = useUiPreferences((state) => state.setPinnedDirectories)
  const uiPreferencesHydrated = useUiPreferencesHydrated()
  const onStageGetStartedChat = props.onStageGetStartedChat

  async function handleStageGetStartedChat(chat: GetStartedChat) {
    if (!onStageGetStartedChat) return
    await onStageGetStartedChat(chat)
  }

  function handleDismissGetStartedChats() {
    getStartedFlow.dismiss()
    toast(language.t("chat.emptyState.getStartedDismissed"))
  }

  const disconnectObsidianMutation = useMutation({
    mutationFn: disconnectObsidianVault,
    onSuccess: async (profile, directory) => {
      queryClient.setQueryData(obsidianVaultQueryKeys.profile(directory), profile)
      queryClient.removeQueries({
        queryKey: obsidianVaultQueryKeys.linkScope(directory),
      })
      await invalidateSkillsCatalogQuery(queryClient, directory)
      toast.success(language.t("sidebar.obsidianDisconnected"))
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : language.t("sidebar.obsidianDisconnectFailed"),
      )
    },
  })

  useEffect(() => {
    if (!uiPreferencesHydrated) return

    if (primaryUse === "learn") {
      if (teacherStandardsAutoSetupComplete) {
        setTeacherStandardsAutoSetupComplete(false)
      }
      return
    }
    if (
      !shouldAutoSetupTeacherStandards({
        preferencesHydrated: uiPreferencesHydrated,
        primaryUse,
        setupComplete: teacherStandardsAutoSetupComplete,
      })
    ) {
      return
    }

    void ensureTeacherStandards({
      platform: platform.platform,
      queryClient,
    })
      .then((status) => {
        if (status) {
          setTeacherStandardsAutoSetupComplete(true)
        }
      })
      .catch((error) => {
        console.warn("Could not enable Standards for Teaching Buddy:", error)
      })
  }, [
    platform.platform,
    primaryUse,
    queryClient,
    setTeacherStandardsAutoSetupComplete,
    teacherStandardsAutoSetupComplete,
    uiPreferencesHydrated,
  ])

  useEffect(() => {
    if (!isMacDesktop) return
    void platform.getIsFullscreen?.().then((v) => {
      const nextIsFullscreen = parseTBoolean(v)
      if (nextIsFullscreen !== undefined) setIsFullscreen(nextIsFullscreen)
    })
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return
      const nextIsFullscreen = parseTBoolean(parseTJsonObject(e.detail)?.isFullscreen)
      if (nextIsFullscreen !== undefined) {
        setIsFullscreen(nextIsFullscreen)
      }
    }
    window.addEventListener("buddy:fullscreen-changed", handler)
    return () => window.removeEventListener("buddy:fullscreen-changed", handler)
  }, [isMacDesktop, platform])

  const directoryGroups = useDirectoryGroups({
    directories: props.directories,
    sessionsByDirectory: props.sessionsByDirectory,
    pinnedByDirectory: props.pinnedByDirectory,
    unreadByDirectory: props.unreadByDirectory,
    sessionStatusByDirectory: props.sessionStatusByDirectory,
    currentDirectory: props.currentDirectory,
    activeSessionID: props.activeSessionID,
    organizeMode,
    showMode,
    sortMode,
  })

  // Pinned notebooks leave the Notebooks list for the Pinned section, in their pinned order. A
  // pinned notebook stays listed even when "Show relevant" leaves none of its chats.
  const { pinnedDirectoryGroups, unpinnedDirectoryGroups } = useMemo(() => {
    const openDirectories = new Set(props.directories)
    const groupsByDirectory = new Map(directoryGroups.map((group) => [group.directory, group]))
    const pinnedGroups = pinnedDirectories
      .filter((directory) => openDirectories.has(directory))
      .map((directory) => groupsByDirectory.get(directory) ?? { directory, sessions: [] })
    const pinnedSet = new Set(pinnedGroups.map((group) => group.directory))
    return {
      pinnedDirectoryGroups: pinnedGroups,
      unpinnedDirectoryGroups: directoryGroups.filter((group) => !pinnedSet.has(group.directory)),
    }
  }, [directoryGroups, pinnedDirectories, props.directories])

  const orderedDirectoryGroups = useMemo(() => {
    const inboxGroup = unpinnedDirectoryGroups.find(
      (group) => getFilename(group.directory).toLowerCase() === "inbox",
    )
    const notebookGroups = unpinnedDirectoryGroups.filter(
      (group) => getFilename(group.directory).toLowerCase() !== "inbox",
    )
    return inboxGroup ? [inboxGroup, ...notebookGroups] : notebookGroups
  }, [unpinnedDirectoryGroups])

  // Chat shortcuts follow the lists top to bottom: pinned chats, pinned notebooks, then each other
  // notebook's rows. Rows in a collapsed notebook or behind "show more" keep their place but are
  // stepped over.
  const sidebarChats = useMemo((): SidebarChat[] => {
    if (props.children) return []
    const chats: SidebarChat[] = collectPinnedSessions({
      directories: props.directories,
      sessionsByDirectory: props.sessionsByDirectory,
      pinnedByDirectory: props.pinnedByDirectory,
    }).map((entry, index) => ({
      directory: entry.directory,
      sessionID: entry.session.id,
      visible: pinnedExpanded || index < SIDEBAR_COLLAPSED_CHAT_COUNT,
    }))
    for (const group of [...pinnedDirectoryGroups, ...orderedDirectoryGroups]) {
      const shownSessions = collapsedDirectories[group.directory]
        ? []
        : visibleDirectorySessions(group, !!expandedDirectories[group.directory])
      const shownIDs = new Set(shownSessions.map((session) => session.id))
      for (const session of group.sessions) {
        chats.push({
          directory: group.directory,
          sessionID: session.id,
          visible: shownIDs.has(session.id),
        })
      }
    }
    return chats
  }, [
    collapsedDirectories,
    expandedDirectories,
    orderedDirectoryGroups,
    pinnedDirectoryGroups,
    pinnedExpanded,
    props.children,
    props.directories,
    props.pinnedByDirectory,
    props.sessionsByDirectory,
  ])

  const visibleChats = useMemo(() => sidebarChats.filter((chat) => chat.visible), [sidebarChats])
  // Where no chat rows are shown (the settings sidebar, no chats yet), the keys stay with the page.
  const chatShortcutsEnabled = visibleChats.length > 0

  const selectSidebarSession = props.onSelectSession
  const openChat = useCallback(
    (chat: SidebarChat | undefined) => {
      if (chat) void selectSidebarSession(chat.directory, chat.sessionID)
    },
    [selectSidebarSession],
  )
  const openChatAt = useCallback(
    (index: number) => openChat(visibleChats[index]),
    [openChat, visibleChats],
  )
  const stepChat = useCallback(
    (step: 1 | -1) => {
      const currentSessions = props.sessionsByDirectory[props.currentDirectory] ?? []
      openChat(
        stepSidebarChat({
          chats: sidebarChats,
          directory: props.currentDirectory,
          activeSessionID: props.activeSessionID,
          activeRootSessionID: findRootSessionID(currentSessions, props.activeSessionID),
          step,
        }),
      )
    },
    [
      openChat,
      props.activeSessionID,
      props.currentDirectory,
      props.sessionsByDirectory,
      sidebarChats,
    ],
  )
  const openPreviousChat = useCallback(() => stepChat(-1), [stepChat])
  const openNextChat = useCallback(() => stepChat(1), [stepChat])
  useShortcutCommand("chat.new", () => props.onNewSession())
  useShortcutCommand("chat.previous", openPreviousChat, { enabled: chatShortcutsEnabled })
  useShortcutCommand("chat.next", openNextChat, { enabled: chatShortcutsEnabled })
  useChatJumpShortcuts(openChatAt, { count: visibleChats.length })

  const {
    draggedDirectory,
    dragOverDirectory,
    dragOverPosition,
    handleLabelPointerDown,
    sectionRefCallback,
  } = useDirectoryReordering({
    directoryGroups: unpinnedDirectoryGroups,
    onReorderDirectories: (nextOrder) =>
      props.onReorderDirectories(mergeDirectoryOrder(props.directories, nextOrder)),
  })
  const pinnedReordering = useDirectoryReordering({
    directoryGroups: pinnedDirectoryGroups,
    onReorderDirectories: (nextOrder) =>
      setPinnedDirectories(mergeDirectoryOrder(pinnedDirectories, nextOrder)),
  })

  async function submitRename() {
    if (!renameState) return
    const nextTitle = renameState.title.trim()
    if (!nextTitle) return

    setRenameSaving(true)
    try {
      await props.onRenameSession(renameState.directory, renameState.sessionID, nextTitle)
      setRenameState(undefined)
    } finally {
      setRenameSaving(false)
    }
  }

  async function submitArchive() {
    if (!archiveState) return

    setArchiveSaving(true)
    try {
      await props.onArchiveSession(archiveState.directory, archiveState.sessionID)
      setArchiveState(undefined)
    } finally {
      setArchiveSaving(false)
    }
  }

  async function submitDelete() {
    if (!deleteState) return

    setDeleteSaving(true)
    try {
      const deleted = await props.onDeleteSession(deleteState.directory, deleteState.sessionID)
      if (deleted) {
        setDeleteState(undefined)
      }
    } finally {
      setDeleteSaving(false)
    }
  }

  async function submitNotebookCreation() {
    const name = notebookName.trim()
    if (!name || !props.onCreateNotebook) return

    setNotebookSaving(true)
    try {
      await props.onCreateNotebook(name, learnerMemoryEnabled, autoExtractEnabled)
      setNotebookCreationOpen(false)
      setNotebookName("")
      void resetNotebookCreationDefaults()
    } catch {
      // Parent-level handlers own error surfacing.
    } finally {
      setNotebookSaving(false)
    }
  }

  async function resetNotebookCreationDefaults() {
    try {
      const defaults = await loadNotebookLearnerMemoryDefaults(queryClient)
      setLearnerMemoryEnabled(defaults.enabled)
      setAutoExtractEnabled(defaults.autoExtract)
      return
    } catch {
      if (!globalConfigQuery.data) {
        return
      }
    }

    setLearnerMemoryEnabled(learnerMemoryDefaults.enabled)
    setAutoExtractEnabled(learnerMemoryDefaults.autoExtract)
  }

  async function openNotebookCreationDialog() {
    await resetNotebookCreationDefaults()
    setNotebookCreationOpen(true)
  }

  function handleRequestArchive(directory: string, sessionID: string, title: string) {
    setArchiveState({ directory, sessionID, title })
  }

  function handleRequestDelete(directory: string, sessionID: string, title: string) {
    setDeleteState({ directory, sessionID, title })
  }

  function handleRequestRename(directory: string, sessionID: string, title: string) {
    setRenameState({ directory, sessionID, title })
  }

  // What the pinned and unpinned notebook lists share; each adds its own groups and drag state.
  const directoryListProps = {
    currentDirectory: props.currentDirectory,
    activeSessionID: props.activeSessionID,
    sessionsByDirectory: props.sessionsByDirectory,
    sessionStatusByDirectory: props.sessionStatusByDirectory,
    pinnedByDirectory: props.pinnedByDirectory,
    unreadByDirectory: props.unreadByDirectory,
    expandedDirectories,
    collapsedDirectories,
    onToggleCollapsedDirectory: setChatSidebarDirectoryOpen,
    onToggleExpandedDirectory: (directory: string) => {
      setExpandedDirectories((current) => toggleDirectoryPresence(current, directory))
    },
    onSelectSession: (directory: string, sessionID?: string) => {
      void props.onSelectSession(directory, sessionID)
    },
    onPrefetchSession: props.onPrefetchSession,
    onTogglePin: props.onTogglePin,
    onTogglePinDirectory: togglePinnedDirectory,
    onToggleUnread: props.onToggleUnread,
    onRequestArchive: handleRequestArchive,
    onRequestDelete: handleRequestDelete,
    onRequestRename: handleRequestRename,
    onNewSession: (directory?: string) => {
      props.onNewSession(directory)
    },
    onOpenNotebookSettings: setNotebookSettingsDirectory,
    onDisconnectObsidianVault: (directory: string) => {
      disconnectObsidianMutation.mutate(directory)
    },
    disconnectingObsidianDirectory: disconnectObsidianMutation.isPending
      ? disconnectObsidianMutation.variables
      : undefined,
    onCloseDirectory: props.onCloseDirectory,
  } satisfies Partial<ComponentProps<typeof ChatLeftSidebarDirectoryList>>

  return (
    <aside
      data-component="chat-left-sidebar"
      className={`group/sidebar shrink-0 border-r border-border-weaker-base bg-surface-raised-base text-text-base flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
    >
      {props.showHeader !== false ? (
        <header
          className={`flex shrink-0 items-center justify-end px-2 ${
            isMacDesktop && !isFullscreen ? "pl-[72px]" : ""
          }`}
          style={{ height: DESKTOP_TITLEBAR_HEIGHT_PX }}
        />
      ) : null}
      {props.children ? (
        <SidebarScrollArea className="px-1.5 pt-2 pb-3">{props.children}</SidebarScrollArea>
      ) : (
        <>
          {/*
           * The tile row stays put while the lists scroll under it, and sits outside the
           * scroller so its stable scrollbar gutter doesn't leave the right edge 10px further
           * in than the left. The whitespace under it is `pb-4` plus the next section label's
           * own `pt-1` — 20px, a step more than the 14px top inset so the row reads as its
           * own group.
           */}
          <TooltipProvider delayDuration={SIDEBAR_ACTION_TOOLTIP_DELAY_MS}>
            <div
              data-component="left-sidebar-action-area"
              className="flex shrink-0 gap-1.5 px-3 pt-3.5 pb-4"
            >
              {props.onNewNote ? (
                <SidebarActionTile
                  action="left-sidebar-new-note"
                  label={language.t("sidebar.newNote")}
                  onClick={props.onNewNote}
                >
                  <NoteAddIcon className="size-4" />
                </SidebarActionTile>
              ) : null}
              {props.onNewBoard ? (
                <SidebarActionTile
                  action="left-sidebar-new-board"
                  label={language.t("sidebar.newBoard")}
                  onClick={props.onNewBoard}
                >
                  <PresentationIcon className="size-4" />
                </SidebarActionTile>
              ) : null}
              {props.onNewBrowserTab ? (
                <SidebarActionTile
                  action="left-sidebar-new-browser-tab"
                  label={language.t("sidebar.newBrowserTab")}
                  onClick={props.onNewBrowserTab}
                >
                  <Globe className="size-4" />
                </SidebarActionTile>
              ) : null}
              <SidebarActionTile
                action="left-sidebar-new-notebook"
                label={language.t("sidebar.newNotebook")}
                onClick={() => {
                  void openNotebookCreationDialog()
                }}
              >
                <FolderAddIcon className="size-4" />
              </SidebarActionTile>
              <SidebarActionTile
                action="left-sidebar-new-chat"
                label={language.t("sidebar.newChat")}
                onClick={() => props.onNewSession()}
              >
                <SquarePenIcon className="size-4" strokeWidth={2} />
              </SidebarActionTile>
            </div>
          </TooltipProvider>

          <SidebarScrollArea className="px-1.5 pb-3">
            {getStartedFlow.isActive && onStageGetStartedChat ? (
              <GetStartedChats
                chats={getStartedFlow.chats}
                onStage={handleStageGetStartedChat}
                onDismiss={handleDismissGetStartedChats}
              />
            ) : null}

            <ChatLeftSidebarPinnedList
              directories={props.directories}
              notebooks={
                pinnedDirectoryGroups.length > 0 ? (
                  // Pinned notebooks keep the order they were pinned or dragged into, whatever the
                  // Notebooks list is organized by.
                  <ChatLeftSidebarDirectoryList
                    {...directoryListProps}
                    pinned
                    directoryGroups={pinnedDirectoryGroups}
                    organizeMode="project"
                    draggedDirectory={pinnedReordering.draggedDirectory}
                    dragOverDirectory={pinnedReordering.dragOverDirectory}
                    dragOverPosition={pinnedReordering.dragOverPosition}
                    onLabelPointerDown={pinnedReordering.handleLabelPointerDown}
                    onSectionRef={pinnedReordering.sectionRefCallback}
                  />
                ) : undefined
              }
              expanded={pinnedExpanded}
              onToggleExpanded={() => setPinnedExpanded((current) => !current)}
              sessionsByDirectory={props.sessionsByDirectory}
              sessionStatusByDirectory={props.sessionStatusByDirectory}
              pinnedByDirectory={props.pinnedByDirectory}
              unreadByDirectory={props.unreadByDirectory}
              activeSessionID={props.activeSessionID}
              currentDirectory={props.currentDirectory}
              onSelectSession={props.onSelectSession}
              onPrefetchSession={props.onPrefetchSession}
              onTogglePin={props.onTogglePin}
              onToggleUnread={props.onToggleUnread}
              onRequestRename={handleRequestRename}
              onRequestArchive={handleRequestArchive}
              onRequestDelete={handleRequestDelete}
            />

            <ChatLeftSidebarRecentsList
              directories={props.directories}
              sessionsByDirectory={props.sessionsByDirectory}
              sessionStatusByDirectory={props.sessionStatusByDirectory}
              pinnedByDirectory={props.pinnedByDirectory}
              unreadByDirectory={props.unreadByDirectory}
              activeSessionID={props.activeSessionID}
              currentDirectory={props.currentDirectory}
              onSelectSession={props.onSelectSession}
              onPrefetchSession={props.onPrefetchSession}
              onTogglePin={props.onTogglePin}
              onToggleUnread={props.onToggleUnread}
              onRequestRename={handleRequestRename}
              onRequestArchive={handleRequestArchive}
              onRequestDelete={handleRequestDelete}
            />

            <ChatLeftSidebarToolbar
              organizeMode={organizeMode}
              sortMode={sortMode}
              showMode={showMode}
              onRequestCreateNotebook={() => {
                void openNotebookCreationDialog()
              }}
              onOrganizeModeChange={setOrganizeMode}
              onSortModeChange={setSortMode}
              onShowModeChange={setShowMode}
            />

            <ChatLeftSidebarDirectoryList
              {...directoryListProps}
              directoryGroups={orderedDirectoryGroups}
              organizeMode={organizeMode}
              draggedDirectory={draggedDirectory}
              dragOverDirectory={dragOverDirectory}
              dragOverPosition={dragOverPosition}
              onLabelPointerDown={handleLabelPointerDown}
              onSectionRef={sectionRefCallback}
            />
          </SidebarScrollArea>
        </>
      )}

      {props.footer !== null && (
        <footer className="px-1.5 py-2">
          {props.footer !== undefined ? (
            props.footer
          ) : (
            <div className="flex items-center gap-1">
              <Button
                data-action="left-sidebar-open-settings"
                variant="ghost"
                size="sm"
                className="h-9 min-w-0 flex-1 justify-start rounded-lg px-2 text-sm font-medium text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
                onClick={props.onOpenSettings}
              >
                <SettingsIcon className="size-3.5" />
                Settings
              </Button>
              <UpdateStatusButton />
            </div>
          )}
        </footer>
      )}

      <ChatLeftSidebarDialogs
        archiveState={archiveState}
        archiveSaving={archiveSaving}
        deleteState={deleteState}
        deleteSaving={deleteSaving}
        renameState={renameState}
        renameSaving={renameSaving}
        onArchiveCancel={() => setArchiveState(undefined)}
        onArchiveConfirm={() => void submitArchive()}
        onDeleteCancel={() => setDeleteState(undefined)}
        onDeleteConfirm={() => void submitDelete()}
        onRenameCancel={() => setRenameState(undefined)}
        onRenameConfirm={() => void submitRename()}
        onRenameTitleChange={(title) => {
          setRenameState((current) => (current ? { ...current, title } : current))
        }}
      />

      <NotebookCreationDialog
        open={notebookCreationOpen}
        busy={notebookSaving}
        notebookName={notebookName}
        title={language.t("sidebar.newNotebookDialogTitle")}
        confirmLabel={language.t("sidebar.createNotebook")}
        placeholder={language.t("sidebar.newNotebookPlaceholder")}
        onOpenChange={(open) => {
          setNotebookCreationOpen(open)
          if (!open) {
            setNotebookName("")
            void resetNotebookCreationDefaults()
          }
        }}
        onNotebookNameChange={setNotebookName}
        onCreate={() => {
          void submitNotebookCreation()
        }}
        onOpenExistingFolder={() => {
          setNotebookCreationOpen(false)
          if (props.onOpenExistingFolder) {
            void props.onOpenExistingFolder()
          } else {
            props.onOpenDirectory()
          }
        }}
        enableLearnerMemory={learnerMemoryExperimentEnabled ? learnerMemoryEnabled : undefined}
        onLearnerMemoryChange={setLearnerMemoryEnabled}
        enableAutoExtract={learnerMemoryExperimentEnabled ? autoExtractEnabled : undefined}
        onAutoExtractChange={setAutoExtractEnabled}
      />

      <NotebookSettingsDialog
        open={notebookSettingsDirectory !== undefined}
        directory={notebookSettingsDirectory ?? ""}
        notebookName={notebookSettingsDirectory ? getFilename(notebookSettingsDirectory) : ""}
        onOpenChange={(open) => {
          if (!open) {
            setNotebookSettingsDirectory(undefined)
          }
        }}
        onOpenMcpSettings={() => {
          setNotebookSettingsDirectory(undefined)
          props.onOpenMcpSettings()
        }}
      />

      {props.obsidianConnectionPrompt ? (
        <ObsidianVaultConnectionDialog open {...props.obsidianConnectionPrompt} />
      ) : null}
    </aside>
  )
}
