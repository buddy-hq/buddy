import type { ReactNode } from "react"
import { useState } from "react"
import { Button } from "@buddy/ui"
import type { SessionInfo } from "@/state/chat-types"
import { ChatLeftSidebarDialogs } from "./chat-left-sidebar/dialogs"
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

type ChatLeftSidebarProps = {
  directories: string[]
  currentDirectory: string
  sessionsByDirectory: Record<string, SessionInfo[]>
  activeSessionID?: string
  sessionStatusByDirectory: Record<string, Record<string, "busy" | "idle">>
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  onOpenDirectory: () => void
  onNewSession: (directory?: string) => void
  onSelectSession: (directory: string, sessionID?: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onArchiveSession: (directory: string, sessionID: string) => Promise<void>
  onRenameSession: (directory: string, sessionID: string, title: string) => Promise<void>
  onReorderDirectories: (newOrder: string[]) => void
  onCloseDirectory: (directory: string) => void
  onOpenCurriculum: () => void
  onOpenSettings: () => void
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

export function ChatLeftSidebar(props: ChatLeftSidebarProps) {
  const [archiveState, setArchiveState] = useState<ArchiveState | undefined>(undefined)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [renameState, setRenameState] = useState<RenameState | undefined>(undefined)
  const [renameSaving, setRenameSaving] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, true>>({})
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, true>>({})
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>("project")
  const [sortMode, setSortMode] = useState<SortMode>("updated")
  const [showMode, setShowMode] = useState<ShowMode>("all")

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

  return (
    <aside
      data-component="chat-left-sidebar"
      className={`shrink-0 border-r border-border-base bg-surface-raised-base text-text-base flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
    >
      {props.children ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">{props.children}</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-3">
          <ChatLeftSidebarToolbar
            currentDirectory={props.currentDirectory}
            organizeMode={organizeMode}
            sortMode={sortMode}
            showMode={showMode}
            onNewSession={props.onNewSession}
            onOpenDirectory={props.onOpenDirectory}
            onOrganizeModeChange={setOrganizeMode}
            onSortModeChange={setSortMode}
            onShowModeChange={setShowMode}
          />

          <ChatLeftSidebarDirectoryList
            directoryGroups={directoryGroups}
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
            onToggleCollapsedDirectory={(directory, isOpen) => {
              setCollapsedDirectories((current) =>
                setDirectoryCollapsedState(current, directory, isOpen),
              )
            }}
            onToggleExpandedDirectory={(directory) => {
              setExpandedDirectories((current) => toggleDirectoryPresence(current, directory))
            }}
            onSelectSession={props.onSelectSession}
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
            onNewSession={props.onNewSession}
            onCloseDirectory={props.onCloseDirectory}
          />
        </div>
      )}

      <footer className="border-t border-border-base/40 px-2 py-2">
        {props.footer !== undefined ? (
          props.footer
        ) : (
          <Button
            data-action="left-sidebar-open-settings"
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-strong"
            onClick={props.onOpenSettings}
          >
            <SettingsIcon className="size-3.5" />
            Settings
          </Button>
        )}
      </footer>

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
    </aside>
  )
}
