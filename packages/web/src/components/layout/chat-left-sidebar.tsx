import type { ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LibraryBigIcon, SparklesIcon } from "lucide-react"
import { Button } from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  DIRECTORY_CHAT_SHELL_VIEW,
  type DirectoryChatShellView,
} from "@/lib/directory-chat/directory-chat-shell-view"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import type { NotebookMainPaneTab } from "@/state/ui-preferences"
import { ChatLeftSidebarDialogs, NotebookCreationDialog } from "./chat-left-sidebar/dialogs"
import { ChatLeftSidebarDirectoryList } from "./chat-left-sidebar/directory-list"
import { ChatLeftSidebarToolbar } from "./chat-left-sidebar/toolbar"
import { useDirectoryGroups } from "./chat-left-sidebar/use-directory-groups"
import { useDirectoryReordering } from "./chat-left-sidebar/use-directory-reordering"
import type {
  ArchiveState,
  OrganizeMode,
  RenameState,
  ShowMode,
  SortMode,
} from "./chat-left-sidebar/types"
import { SettingsIcon } from "./sidebar-icons"
import { getFilename } from "./sidebar-helpers"

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
  onCreateNotebook?: (
    name: string,
    enableLearnerMemory?: boolean,
    enableAutoExtract?: boolean,
  ) => void | Promise<void>
  onNewSession: (directory?: string) => void
  onSelectSession: (directory: string, sessionID?: string) => void
  onPrefetchSession?: (directory: string, sessionID: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onArchiveSession: (directory: string, sessionID: string) => Promise<void>
  onRenameSession: (directory: string, sessionID: string, title: string) => Promise<void>
  onReorderDirectories: (newOrder: string[]) => void
  onCloseDirectory: (directory: string) => void
  onOpenCurriculum: () => void
  shellView?: DirectoryChatShellView
  onSelectLibrary?: () => void
  onSelectSkills?: () => void
  mainPaneTab?: NotebookMainPaneTab
  onMainPaneTabChange?: (tab: NotebookMainPaneTab) => void
  onOpenSettings: () => void
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

function setDirectoryCollapsedState(
  current: Record<string, true>,
  directory: string,
  isOpen: boolean,
) {
  const next = { ...current }
  if (isOpen) {
    delete next[directory]
  } else {
    next[directory] = true
  }
  return next
}

function resolveExpandedDirectory(input: {
  directoryGroups: ReturnType<typeof useDirectoryGroups>
  currentDirectory: string
}) {
  if (input.directoryGroups.some((group) => group.directory === input.currentDirectory)) {
    return input.currentDirectory
  }
  return input.directoryGroups[0]?.directory
}

function buildCollapsedDirectories(
  directoryGroups: ReturnType<typeof useDirectoryGroups>,
  expandedDirectory: string,
) {
  return Object.fromEntries(
    directoryGroups
      .map((group) => group.directory)
      .filter((directory) => directory !== expandedDirectory)
      .map((directory) => [directory, true] as const),
  )
}

export function ChatLeftSidebar(props: ChatLeftSidebarProps) {
  const platform = usePlatform()
  const isMacDesktop = platform.platform === "desktop" && platform.os === "macos"
  const [isFullscreen, setIsFullscreen] = useState(false)
  const libraryOpen = props.shellView === DIRECTORY_CHAT_SHELL_VIEW.LIBRARY
  const skillsOpen = props.shellView === DIRECTORY_CHAT_SHELL_VIEW.SKILLS
  const [archiveState, setArchiveState] = useState<ArchiveState | undefined>(undefined)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [renameState, setRenameState] = useState<RenameState | undefined>(undefined)
  const [renameSaving, setRenameSaving] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, true>>({})
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, true>>({})
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>("project")
  const [sortMode, setSortMode] = useState<SortMode>("updated")
  const [showMode, setShowMode] = useState<ShowMode>("all")
  const [notebookCreationOpen, setNotebookCreationOpen] = useState(false)
  const [notebookName, setNotebookName] = useState("")
  const [notebookSaving, setNotebookSaving] = useState(false)
  const [learnerMemoryEnabled, setLearnerMemoryEnabled] = useState(true)
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true)
  const hasInitializedCollapsedDirectoriesRef = useRef(false)

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

  const orderedDirectoryGroupsRef = useRef(orderedDirectoryGroups)
  orderedDirectoryGroupsRef.current = orderedDirectoryGroups

  useEffect(() => {
    if (props.currentDirectory) {
      setCollapsedDirectories((current) =>
        setDirectoryCollapsedState(current, props.currentDirectory, true),
      )
    }
  }, [props.currentDirectory])

  if (!hasInitializedCollapsedDirectoriesRef.current && orderedDirectoryGroups.length > 0) {
    const expandedDirectory = resolveExpandedDirectory({
      directoryGroups: orderedDirectoryGroups,
      currentDirectory: props.currentDirectory,
    })
    if (!expandedDirectory) {
      hasInitializedCollapsedDirectoriesRef.current = true
    } else {
      setCollapsedDirectories(buildCollapsedDirectories(orderedDirectoryGroups, expandedDirectory))
      hasInitializedCollapsedDirectoriesRef.current = true
    }
  }

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

  async function submitNotebookCreation() {
    const name = notebookName.trim()
    if (!name || !props.onCreateNotebook) return

    setNotebookSaving(true)
    try {
      await props.onCreateNotebook(name, learnerMemoryEnabled, autoExtractEnabled)
      setNotebookCreationOpen(false)
      setNotebookName("")
      setLearnerMemoryEnabled(true)
      setAutoExtractEnabled(true)
    } catch {
      // Parent-level handlers own error surfacing.
    } finally {
      setNotebookSaving(false)
    }
  }

  return (
    <aside
      data-component="chat-left-sidebar"
      className={`shrink-0 border-r border-border-weaker-base bg-surface-raised-base text-text-base flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
    >
      {props.showHeader !== false ? (
        <header
          className={`flex h-[52px] shrink-0 items-center justify-end px-2 ${
            isMacDesktop && !isFullscreen ? "pl-[72px]" : ""
          }`}
        />
      ) : null}
      {props.children ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-1.5 pt-2 pb-3">
          {props.children}
        </div>
      ) : (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-1.5 pt-2 pb-3">
          <div className="mb-3 space-y-1">
            <Button
              data-action="left-sidebar-toggle-skills"
              variant="ghost"
              size="sm"
              className={`h-8 w-full justify-start rounded-lg px-2 text-sm font-medium ${
                skillsOpen
                  ? "bg-surface-raised-strong text-text-strong"
                  : "text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
              }`}
              onClick={() => props.onSelectSkills?.()}
            >
              <SparklesIcon className="size-3.5" />
              {language.t("sidebar.skills")}
            </Button>
            <Button
              data-action="left-sidebar-toggle-library"
              variant="ghost"
              size="sm"
              className={`h-8 w-full justify-start rounded-lg px-2 text-sm font-medium ${
                libraryOpen
                  ? "bg-surface-raised-strong text-text-strong"
                  : "text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
              }`}
              onClick={() => props.onSelectLibrary?.()}
            >
              <LibraryBigIcon className="size-3.5" />
              {language.t("sidebar.library")}
            </Button>
          </div>

          <ChatLeftSidebarToolbar
            organizeMode={organizeMode}
            sortMode={sortMode}
            showMode={showMode}
            onRequestCreateNotebook={() => {
              setNotebookCreationOpen(true)
            }}
            onOrganizeModeChange={setOrganizeMode}
            onSortModeChange={setSortMode}
            onShowModeChange={setShowMode}
          />

          <ChatLeftSidebarDirectoryList
            directoryGroups={orderedDirectoryGroups}
            currentDirectory={props.currentDirectory}
            shellView={props.shellView}
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
            onToggleCollapsedDirectory={(directory, isOpen) => {
              setCollapsedDirectories((current) =>
                setDirectoryCollapsedState(current, directory, isOpen),
              )
            }}
            onToggleExpandedDirectory={(directory) => {
              setExpandedDirectories((current) => toggleDirectoryPresence(current, directory))
            }}
            onSelectSession={(directory, sessionID) => {
              props.onSelectSession(directory, sessionID)
            }}
            onPrefetchSession={props.onPrefetchSession}
            onTogglePin={props.onTogglePin}
            onToggleUnread={props.onToggleUnread}
            onRequestArchive={(directory, sessionID, title) => {
              setArchiveState({
                directory,
                sessionID,
                title,
              })
            }}
            onRequestRename={(directory, sessionID, title) => {
              setRenameState({
                directory,
                sessionID,
                title,
              })
            }}
            onLabelPointerDown={handleLabelPointerDown}
            onSectionRef={sectionRefCallback}
            onNewSession={(directory) => {
              const targetDirectory = directory ?? props.currentDirectory
              if (targetDirectory) {
                setCollapsedDirectories((current) =>
                  setDirectoryCollapsedState(current, targetDirectory, true),
                )
              }
              props.onNewSession(directory)
            }}
            onCloseDirectory={props.onCloseDirectory}
            mainPaneTab={props.mainPaneTab}
            onMainPaneTabChange={(directory, tab) => {
              setCollapsedDirectories((current) =>
                setDirectoryCollapsedState(current, directory, true),
              )
              props.onSelectSession(directory)
              props.onMainPaneTabChange?.(tab)
            }}
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
        renameState={renameState}
        renameSaving={renameSaving}
        onArchiveCancel={() => setArchiveState(undefined)}
        onArchiveConfirm={() => void submitArchive()}
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
        description={language.t("sidebar.newNotebookDialogDescription")}
        confirmLabel={language.t("sidebar.createNotebook")}
        placeholder={language.t("sidebar.newNotebookPlaceholder")}
        onOpenChange={(open) => {
          setNotebookCreationOpen(open)
          if (!open) {
            setNotebookName("")
            setLearnerMemoryEnabled(true)
            setAutoExtractEnabled(true)
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
        enableLearnerMemory={learnerMemoryEnabled}
        onLearnerMemoryChange={setLearnerMemoryEnabled}
        enableAutoExtract={autoExtractEnabled}
        onAutoExtractChange={setAutoExtractEnabled}
      />
    </aside>
  )
}
