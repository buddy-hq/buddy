import type { ReactNode } from "react"
import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@buddy/ui"
import { language } from "@/context/language"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { ChatLeftSidebarDialogs, NotebookCreationDialog } from "./chat-left-sidebar/dialogs"
import {
  ChatLeftSidebarDirectoryList,
  DirectoryThreadRow,
} from "./chat-left-sidebar/directory-list"
import { ChatLeftSidebarToolbar } from "./chat-left-sidebar/toolbar"
import { useDirectoryGroups } from "./chat-left-sidebar/use-directory-groups"
import { useDirectoryReordering } from "./chat-left-sidebar/use-directory-reordering"
import { findRootSessionID } from "./chat-left-sidebar/thread-helpers"
import type {
  ArchiveState,
  OrganizeMode,
  RenameState,
  ShowMode,
  SortMode,
} from "./chat-left-sidebar/types"
import { ChevronDownIcon, SettingsIcon, SquarePenIcon } from "./sidebar-icons"
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
  onCreateNotebook?: (name: string) => void | Promise<void>
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
  const [notebookCreationOpen, setNotebookCreationOpen] = useState(false)
  const [notebookName, setNotebookName] = useState("")
  const [notebookSaving, setNotebookSaving] = useState(false)
  const [inboxExpanded, setInboxExpanded] = useState(false)
  const [inboxCollapsed, setInboxCollapsed] = useState(false)

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

  const inboxGroup = directoryGroups.find((g) => getFilename(g.directory).toLowerCase() === "inbox")
  const notebookGroups = directoryGroups.filter(
    (g) => getFilename(g.directory).toLowerCase() !== "inbox",
  )

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
      await props.onCreateNotebook(name)
      setNotebookCreationOpen(false)
      setNotebookName("")
    } catch {
      // Parent-level handlers own error surfacing.
    } finally {
      setNotebookSaving(false)
    }
  }

  return (
    <aside
      data-component="chat-left-sidebar"
      className={`shrink-0 border-r border-border-weaker-base bg-background-base text-text-base flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
    >
      {props.children ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">
          {props.children}
        </div>
      ) : (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-3">
          {inboxGroup && (
            <Collapsible
              open={!inboxCollapsed}
              onOpenChange={(open) => setInboxCollapsed(!open)}
              asChild
            >
              <div className="group/section-header mb-4">
                <CollapsibleTrigger asChild>
                  <div className="mb-1 flex cursor-pointer select-none items-center justify-between px-2 text-text-weak group-hover/section-header:text-text-base transition-colors duration-160">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs">
                        {language.t("sidebar.quickChat")}
                      </p>
                      <motion.div
                        animate={{
                          rotate: inboxCollapsed ? -90 : 0,
                          opacity: inboxCollapsed ? 0.4 : 0,
                        }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <ChevronDownIcon className="size-3" />
                      </motion.div>
                    </div>
                    <Button
                      type="button"
                      data-action="left-sidebar-quick-chat"
                      variant="ghost"
                      size="icon-xs"
                      className="invisible group-hover/section-header:visible text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (props.onQuickChat) {
                          void props.onQuickChat()
                          return
                        }
                        props.onNewSession(props.currentDirectory)
                      }}
                      aria-label={language.t("sidebar.quickChat")}
                      title={language.t("sidebar.quickChat")}
                    >
                      <SquarePenIcon className="size-3.5" />
                    </Button>
                  </div>
                </CollapsibleTrigger>
                <AnimatePresence initial={false}>
                  {!inboxCollapsed && (
                    <CollapsibleContent
                      forceMount
                      asChild
                      className="space-y-[2px] overflow-hidden"
                    >
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                      >
                        {inboxGroup.sessions.length === 0 ? (
                          <p className="pl-6 pr-6 text-sm text-text-weak py-1">
                            {language.t("sidebar.noThreads")}
                          </p>
                        ) : (
                          (inboxExpanded
                            ? inboxGroup.sessions
                            : inboxGroup.sessions.slice(0, 3)
                          ).map((session) => (
                            <DirectoryThreadRow
                              key={`${inboxGroup.directory}:${session.id}`}
                              directory={inboxGroup.directory}
                              currentDirectory={props.currentDirectory}
                              session={session}
                              allSessions={props.sessionsByDirectory[inboxGroup.directory] ?? []}
                              activeRootID={findRootSessionID(
                                props.sessionsByDirectory[inboxGroup.directory] ?? [],
                                props.activeSessionID,
                              )}
                              sessionStatusByID={
                                props.sessionStatusByDirectory[inboxGroup.directory] ?? {}
                              }
                              pinnedSet={
                                new Set(props.pinnedByDirectory[inboxGroup.directory] ?? [])
                              }
                              unreadMap={props.unreadByDirectory[inboxGroup.directory] ?? {}}
                              onSelect={() =>
                                props.onSelectSession(inboxGroup.directory, session.id)
                              }
                              onTogglePin={() =>
                                props.onTogglePin(inboxGroup.directory, session.id)
                              }
                              onToggleUnread={(unread) =>
                                props.onToggleUnread(inboxGroup.directory, session.id, unread)
                              }
                              onRequestRename={() => {
                                setRenameState({
                                  directory: inboxGroup.directory,
                                  sessionID: session.id,
                                  title: session.title,
                                })
                              }}
                              onRequestArchive={() => {
                                setArchiveState({
                                  directory: inboxGroup.directory,
                                  sessionID: session.id,
                                  title: session.title,
                                })
                              }}
                            />
                          ))
                        )}
                        {inboxGroup.sessions.length > 3 && (
                          <button
                            type="button"
                            className="ml-2 pl-6 py-1 text-xs text-text-weaker hover:text-text-base transition-all active:scale-95"
                            onClick={() => setInboxExpanded(!inboxExpanded)}
                          >
                            {inboxExpanded
                              ? language.t("sidebar.showLess")
                              : language.t("sidebar.showMore")}
                          </button>
                        )}
                      </motion.div>
                    </CollapsibleContent>
                  )}
                </AnimatePresence>
              </div>
            </Collapsible>
          )}

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
            directoryGroups={notebookGroups}
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
            className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
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
      />
    </aside>
  )
}
