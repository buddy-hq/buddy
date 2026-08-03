import type { ComponentProps, ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, SquarePenIcon, toast } from "@buddy/ui"
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
import { ChatLeftSidebarDirectoryList } from "./chat-left-sidebar/directory-list"
import { ChatLeftSidebarPinnedList } from "./chat-left-sidebar/pinned-list"
import {
  SIDEBAR_ROW_LEADING_GAP_PX,
  SIDEBAR_ROW_PADDING_LEFT_PX,
} from "./chat-left-sidebar/row-geometry"
import { GetStartedChats } from "./chat-left-sidebar/get-started-chats"
import { ChatLeftSidebarToolbar } from "./chat-left-sidebar/toolbar"
import { useDirectoryGroups } from "./chat-left-sidebar/use-directory-groups"
import { useDirectoryReordering } from "./chat-left-sidebar/use-directory-reordering"
import type {
  ArchiveState,
  DeleteState,
  OrganizeMode,
  RenameState,
  ShowMode,
  SortMode,
} from "./chat-left-sidebar/types"
import { SettingsIcon } from "./sidebar-icons"
import { getFilename } from "./sidebar-helpers"
import { ensureTeacherStandards, shouldAutoSetupTeacherStandards } from "@/lib/teacher-standards"
import { disconnectObsidianVault, obsidianVaultQueryKeys } from "@/state/obsidian-vault-query"
import { invalidateSkillsCatalogQuery } from "@/state/skills-catalog-query"

type ChatLeftSidebarProps = {
  directories: string[]
  currentDirectory: string
  sessionsByDirectory: Record<string, SessionInfo[]>
  activeSessionID?: string
  sessionStatusByDirectory: Record<string, Record<string, SessionStatusInfo>>
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  onOpenDirectory: () => void
  onOpenExistingFolder?: () => void | Promise<void>
  onQuickChat?: () => void | Promise<void>
  onStartGetStartedChat?: (chat: GetStartedChat) => Promise<void> | void
  onCreateNotebook?: (
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) => void | Promise<void>
  onNewSession: (directory?: string) => void
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
  const getStartedFlow = useGetStartedFlow(props.currentDirectory)
  const teacherStandardsAutoSetupComplete = useUiPreferences(
    (state) => state.teacherStandardsAutoSetupComplete,
  )
  const setTeacherStandardsAutoSetupComplete = useUiPreferences(
    (state) => state.setTeacherStandardsAutoSetupComplete,
  )
  const collapsedDirectories = useUiPreferences((state) => state.collapsedChatSidebarDirectories)
  const setChatSidebarDirectoryOpen = useUiPreferences((state) => state.setChatSidebarDirectoryOpen)
  const uiPreferencesHydrated = useUiPreferencesHydrated()
  const onStartGetStartedChat = props.onStartGetStartedChat
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
      .catch((error: unknown) => {
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
      if (typeof v === "boolean") setIsFullscreen(v)
    })
    const handler = (e: Event) => {
      if (e instanceof CustomEvent && typeof e.detail?.isFullscreen === "boolean") {
        setIsFullscreen(e.detail.isFullscreen as boolean)
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

  const orderedDirectoryGroups = useMemo(() => {
    const inboxGroup = directoryGroups.find(
      (group) => getFilename(group.directory).toLowerCase() === "inbox",
    )
    const notebookGroups = directoryGroups.filter(
      (group) => getFilename(group.directory).toLowerCase() !== "inbox",
    )
    return inboxGroup ? [inboxGroup, ...notebookGroups] : notebookGroups
  }, [directoryGroups])

  const {
    draggedDirectory,
    dragOverDirectory,
    dragOverPosition,
    handleLabelPointerDown,
    sectionRefCallback,
  } = useDirectoryReordering({
    directoryGroups,
    onReorderDirectories: props.onReorderDirectories,
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
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-1.5 pt-2 pb-3">
          {props.children}
        </div>
      ) : (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-1.5 pb-3">
          {getStartedFlow.isActive && onStartGetStartedChat ? (
            <GetStartedChats
              chats={getStartedFlow.chats}
              onStart={onStartGetStartedChat}
              onDismiss={getStartedFlow.dismiss}
            />
          ) : null}

          <div data-component="left-sidebar-action-area" className="mb-2 px-1.5">
            <button
              type="button"
              data-action="left-sidebar-new-chat"
              className="group/new-chat flex w-full items-center rounded-lg pr-2 py-1.5 text-left text-sm font-light text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
              style={{
                paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px`,
                gap: `${SIDEBAR_ROW_LEADING_GAP_PX}px`,
              }}
              onClick={() => props.onNewSession()}
            >
              <SquarePenIcon
                className="size-3.5 shrink-0 transition-transform duration-100 ease-out group-active/new-chat:scale-110"
                strokeWidth={2}
              />
              <span className="truncate">{language.t("sidebar.newChat")}</span>
            </button>
          </div>

          <ChatLeftSidebarPinnedList
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
            directoryGroups={orderedDirectoryGroups}
            currentDirectory={props.currentDirectory}
            activeSessionID={props.activeSessionID}
            sessionsByDirectory={props.sessionsByDirectory}
            sessionStatusByDirectory={props.sessionStatusByDirectory}
            pinnedByDirectory={props.pinnedByDirectory}
            unreadByDirectory={props.unreadByDirectory}
            organizeMode={organizeMode}
            expandedDirectories={expandedDirectories}
            collapsedDirectories={collapsedDirectories}
            draggedDirectory={draggedDirectory}
            dragOverDirectory={dragOverDirectory}
            dragOverPosition={dragOverPosition}
            onToggleCollapsedDirectory={setChatSidebarDirectoryOpen}
            onToggleExpandedDirectory={(directory) => {
              setExpandedDirectories((current) => toggleDirectoryPresence(current, directory))
            }}
            onSelectSession={(directory, sessionID) => {
              void props.onSelectSession(directory, sessionID)
            }}
            onPrefetchSession={props.onPrefetchSession}
            onTogglePin={props.onTogglePin}
            onToggleUnread={props.onToggleUnread}
            onRequestArchive={handleRequestArchive}
            onRequestDelete={handleRequestDelete}
            onRequestRename={handleRequestRename}
            onLabelPointerDown={handleLabelPointerDown}
            onSectionRef={sectionRefCallback}
            onNewSession={(directory) => {
              props.onNewSession(directory)
            }}
            onOpenNotebookSettings={setNotebookSettingsDirectory}
            onDisconnectObsidianVault={(directory) => {
              disconnectObsidianMutation.mutate(directory)
            }}
            disconnectingObsidianDirectory={
              disconnectObsidianMutation.isPending
                ? disconnectObsidianMutation.variables
                : undefined
            }
            onCloseDirectory={props.onCloseDirectory}
          />
        </div>
      )}

      {props.footer !== null && (
        <footer className="px-1.5 py-2">
          {props.footer !== undefined ? (
            props.footer
          ) : (
            <Button
              data-action="left-sidebar-open-settings"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
              onClick={props.onOpenSettings}
            >
              <SettingsIcon className="size-3.5" />
              Settings
            </Button>
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
