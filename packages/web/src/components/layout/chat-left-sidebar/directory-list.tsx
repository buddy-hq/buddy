import type { PointerEvent as ReactPointerEvent } from "react"
import {
  ArchiveIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderIcon,
  FolderOpenIcon,
  PinIcon,
  PencilIcon,
  SquarePenIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  XIcon,
} from "@buddy/ui"
import { language } from "@/context/language"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { isSessionStatusActive } from "@/state/session-status"
import { getFilename } from "../sidebar-helpers"
import { EllipsisHorizontalIcon } from "../sidebar-icons"
import {
  findRootSessionID,
  formatThreadAge,
  sessionFamilyIDs,
  threadStatusLabel,
  ThreadStatusIndicator,
} from "./thread-helpers"
import type { DirectoryGroup, DropPosition, OrganizeMode } from "./types"

type ChatLeftSidebarDirectoryListProps = {
  directoryGroups: DirectoryGroup[]
  currentDirectory: string
  activeSessionID?: string
  sessionsByDirectory: Record<string, SessionInfo[]>
  sessionStatusByDirectory: Record<string, Record<string, SessionStatusInfo>>
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  organizeMode: OrganizeMode
  expandedDirectories: Record<string, true>
  collapsedDirectories: Record<string, true>
  draggedDirectory?: string
  dragOverDirectory?: string
  dragOverPosition: DropPosition
  onToggleCollapsedDirectory: (directory: string, isOpen: boolean) => void
  onToggleExpandedDirectory: (directory: string) => void
  onSelectSession: (directory: string, sessionID?: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onRequestArchive: (directory: string, sessionID: string, title: string) => void
  onRequestRename: (directory: string, sessionID: string, title: string) => void
  onLabelPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, directory: string) => void
  onSectionRef: (directory: string) => (element: HTMLElement | null) => void
  onNewSession: (directory?: string) => void
  onCloseDirectory: (directory: string) => void
}

type DirectoryGroupSectionProps = {
  group: DirectoryGroup
  currentDirectory: string
  activeRootID?: string
  allSessions: SessionInfo[]
  sessionStatusByID: Record<string, SessionStatusInfo>
  pinnedSet: Set<string>
  unreadMap: Record<string, true>
  expanded: boolean
  collapsed: boolean
  draggedDirectory?: string
  dragOverDirectory?: string
  dragOverPosition: DropPosition
  organizeMode: OrganizeMode
  onToggleCollapsed: (isOpen: boolean) => void
  onToggleExpanded: () => void
  onSelectSession: (sessionID?: string) => void
  onTogglePin: (sessionID: string) => void
  onToggleUnread: (sessionID: string, unread: boolean) => void
  onRequestArchive: (sessionID: string, title: string) => void
  onRequestRename: (sessionID: string, title: string) => void
  onLabelPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSectionRef: (element: HTMLElement | null) => void
  onOpenNotebook: () => void
  onCloseNotebook: () => void
  onNewSession: () => void
}

type DirectoryThreadRowProps = {
  directory: string
  currentDirectory: string
  session: SessionInfo
  allSessions: SessionInfo[]
  activeRootID?: string
  sessionStatusByID: Record<string, SessionStatusInfo>
  pinnedSet: Set<string>
  unreadMap: Record<string, true>
  onSelect: () => void
  onTogglePin: () => void
  onToggleUnread: (unread: boolean) => void
  onRequestRename: () => void
  onRequestArchive: () => void
}

const COLLAPSED_COUNT = 9

export function ChatLeftSidebarDirectoryList(props: ChatLeftSidebarDirectoryListProps) {
  return (
    <div data-component="left-sidebar-directory-list" className="space-y-1 mt-1">
      {props.directoryGroups.map((group) => {
        const allSessions = props.sessionsByDirectory[group.directory] ?? []
        const activeRootID = findRootSessionID(allSessions, props.activeSessionID)
        const sessionStatusByID = props.sessionStatusByDirectory[group.directory] ?? {}
        const pinnedSet = new Set(props.pinnedByDirectory[group.directory] ?? [])
        const unreadMap = props.unreadByDirectory[group.directory] ?? {}
        const expanded = !!props.expandedDirectories[group.directory]
        const collapsed = !!props.collapsedDirectories[group.directory]

        return (
          <DirectoryGroupSection
            key={group.directory}
            group={group}
            currentDirectory={props.currentDirectory}
            activeRootID={activeRootID}
            allSessions={allSessions}
            sessionStatusByID={sessionStatusByID}
            pinnedSet={pinnedSet}
            unreadMap={unreadMap}
            expanded={expanded}
            collapsed={collapsed}
            draggedDirectory={props.draggedDirectory}
            dragOverDirectory={props.dragOverDirectory}
            dragOverPosition={props.dragOverPosition}
            organizeMode={props.organizeMode}
            onToggleCollapsed={(isOpen) =>
              props.onToggleCollapsedDirectory(group.directory, isOpen)
            }
            onToggleExpanded={() => props.onToggleExpandedDirectory(group.directory)}
            onSelectSession={(sessionID) => props.onSelectSession(group.directory, sessionID)}
            onTogglePin={(sessionID) => props.onTogglePin(group.directory, sessionID)}
            onToggleUnread={(sessionID, unread) =>
              props.onToggleUnread(group.directory, sessionID, unread)
            }
            onRequestArchive={(sessionID, title) =>
              props.onRequestArchive(group.directory, sessionID, title)
            }
            onRequestRename={(sessionID, title) =>
              props.onRequestRename(group.directory, sessionID, title)
            }
            onLabelPointerDown={(event) => props.onLabelPointerDown(event, group.directory)}
            onSectionRef={props.onSectionRef(group.directory)}
            onOpenNotebook={() => props.onSelectSession(group.directory)}
            onCloseNotebook={() => props.onCloseDirectory(group.directory)}
            onNewSession={() => props.onNewSession(group.directory)}
          />
        )
      })}
    </div>
  )
}

function DirectoryGroupSection(props: DirectoryGroupSectionProps) {
  const directoryLabel = getFilename(props.group.directory)
  const visibleSessions = props.expanded
    ? props.group.sessions
    : props.group.sessions.slice(0, COLLAPSED_COUNT)
  const hasMore = props.group.sessions.length > COLLAPSED_COUNT
  const canDrag = props.organizeMode === "project"
  const isCurrentDirectory = props.group.directory === props.currentDirectory
  const isDragging = props.draggedDirectory === props.group.directory
  const isDragOver =
    props.dragOverDirectory === props.group.directory &&
    props.draggedDirectory !== props.group.directory

  return (
    <Collapsible open={!props.collapsed} onOpenChange={props.onToggleCollapsed} asChild>
      <section
        data-component="left-sidebar-directory-group"
        data-directory={props.group.directory}
        data-current={isCurrentDirectory ? "true" : "false"}
        ref={props.onSectionRef}
        className={`space-y-1 relative transition-opacity duration-150 ${
          isDragging ? "opacity-40" : "opacity-100"
        }`}
      >
        {isDragOver && props.dragOverPosition === "before" ? (
          <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mb-1" />
        ) : null}
        <div className="group/directory flex items-center gap-1 rounded-xl px-0 py-0.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              data-action="left-sidebar-directory-toggle"
              data-directory={props.group.directory}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm text-text-weaker hover:text-text-base ${
                isCurrentDirectory ? "" : ""
              } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
              onPointerDown={canDrag ? (event) => props.onLabelPointerDown(event) : undefined}
            >
              {props.collapsed ? (
                <FolderIcon className="size-3.5 shrink-0" />
              ) : (
                <FolderOpenIcon className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{directoryLabel}</span>
            </button>
          </CollapsibleTrigger>

          <div className="flex items-center gap-0.5 pr-1 opacity-0 pointer-events-none transition-opacity group-hover/directory:opacity-100 group-hover/directory:pointer-events-auto group-focus-within/directory:opacity-100 group-focus-within/directory:pointer-events-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-action="left-sidebar-directory-menu"
                  data-directory={props.group.directory}
                  className="inline-flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                  aria-label={language.t("sidebar.optionsForDirectory", {
                    directoryLabel: directoryLabel,
                  })}
                >
                  <EllipsisHorizontalIcon className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  data-action="left-sidebar-directory-open"
                  onSelect={props.onOpenNotebook}
                >
                  <FolderIcon className="size-3.5 mr-2" />
                  {language.t("sidebar.openNotebook")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-action="left-sidebar-directory-close"
                  onSelect={props.onCloseNotebook}
                >
                  <XIcon className="size-3.5 mr-2" />
                  {language.t("sidebar.closeNotebook")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-action="left-sidebar-directory-new-thread"
                  data-directory={props.group.directory}
                  className="inline-flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                  aria-label={language.t("sidebar.startNewThreadIn", {
                    directoryLabel: directoryLabel,
                  })}
                  onClick={props.onNewSession}
                >
                  <SquarePenIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                {language.t("sidebar.startNewThreadIn", { directoryLabel: directoryLabel })}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <CollapsibleContent className="space-y-1 overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down p-[2px] -m-[2px]">
          {props.group.sessions.length === 0 ? (
            <p className="pl-6 text-sm text-text-weak py-1">{language.t("sidebar.noThreads")}</p>
          ) : (
            visibleSessions.map((session) => (
              <DirectoryThreadRow
                key={`${props.group.directory}:${session.id}`}
                directory={props.group.directory}
                currentDirectory={props.currentDirectory}
                session={session}
                allSessions={props.allSessions}
                activeRootID={props.activeRootID}
                sessionStatusByID={props.sessionStatusByID}
                pinnedSet={props.pinnedSet}
                unreadMap={props.unreadMap}
                onSelect={() => props.onSelectSession(session.id)}
                onTogglePin={() => props.onTogglePin(session.id)}
                onToggleUnread={(unread) => props.onToggleUnread(session.id, unread)}
                onRequestRename={() => props.onRequestRename(session.id, session.title)}
                onRequestArchive={() =>
                  props.onRequestArchive(
                    session.id,
                    session.title || language.t("sidebar.untitledThread"),
                  )
                }
              />
            ))
          )}
          {hasMore && !props.collapsed ? (
            <button
              type="button"
              className="ml-3 pl-6 py-1 text-xs text-text-weaker opacity-70 hover:opacity-100 hover:text-text-base"
              onClick={props.onToggleExpanded}
            >
              {props.expanded ? language.t("sidebar.showLess") : language.t("sidebar.showMore")}
            </button>
          ) : null}
        </CollapsibleContent>
        {isDragOver && props.dragOverPosition === "after" ? (
          <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mt-1" />
        ) : null}
      </section>
    </Collapsible>
  )
}

function DirectoryThreadRow(props: DirectoryThreadRowProps) {
  const familyIDs = sessionFamilyIDs(props.allSessions, props.session.id)
  const active =
    props.directory === props.currentDirectory && props.session.id === props.activeRootID
  const busy = familyIDs.some((id) => isSessionStatusActive(props.sessionStatusByID[id]))
  const pinned = familyIDs.some((id) => props.pinnedSet.has(id))
  const unread = familyIDs.some((id) => !!props.unreadMap[id])
  const threadStatus = busy ? "busy" : unread ? "unread" : "idle"

  return (
    <div
      className={`group/thread relative ml-2 rounded-lg ${
        active ? "bg-surface-raised-base-hover" : "hover:bg-surface-raised-base-hover"
      }`}
    >
      <button
        type="button"
        data-action="left-sidebar-thread-select"
        data-directory={props.directory}
        data-session-id={props.session.id}
        data-active={active ? "true" : "false"}
        onClick={props.onSelect}
        className="relative w-full py-2 pr-3 pl-5 text-left"
      >
        <div className="absolute top-1/2 left-1 flex -translate-y-1/2 items-center justify-center">
          <ThreadStatusIndicator status={threadStatus} />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="sr-only">{threadStatusLabel(threadStatus)}</span>
          <div className="flex min-w-0 items-center gap-1">
            <span
              className={`truncate text-xs ${
                unread
                  ? "font-medium text-text-strong"
                  : "text-text-weaker group-hover/thread:text-text-base"
              }`}
            >
              {props.session.title || language.t("sidebar.newThread")}
            </span>
            {pinned ? <PinIcon className="size-3 shrink-0 text-text-weaker" /> : null}
          </div>
          <span className="ml-auto shrink-0 text-[11px] text-text-weaker opacity-70 transition-opacity group-hover/thread:opacity-0 group-focus-within/thread:opacity-0">
            {formatThreadAge(props.session.time.updated)}
          </span>
        </div>
      </button>

      <div className="pointer-events-none absolute top-0 right-3 flex h-full items-center opacity-0 transition-opacity group-hover/thread:pointer-events-auto group-hover/thread:opacity-100 group-focus-within/thread:pointer-events-auto group-focus-within/thread:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-action="left-sidebar-thread-menu"
              data-directory={props.directory}
              data-session-id={props.session.id}
              className="inline-flex size-6 items-center justify-center rounded-md text-text-weak hover:bg-surface-weak/70 hover:text-text-base"
              aria-label={language.t("sidebar.threadOptions")}
              onClick={(event) => event.stopPropagation()}
            >
              <EllipsisHorizontalIcon className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem data-action="left-sidebar-thread-pin" onSelect={props.onTogglePin}>
              <PinIcon className="mr-2 size-3.5" />
              {pinned ? language.t("sidebar.unpinThread") : language.t("sidebar.pinThread")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-action="left-sidebar-thread-rename"
              onSelect={props.onRequestRename}
            >
              <PencilIcon className="mr-2 size-3.5" />
              {language.t("sidebar.renameThreadAction")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-action="left-sidebar-thread-archive"
              onSelect={props.onRequestArchive}
            >
              <ArchiveIcon className="mr-2 size-3.5" />
              {language.t("sidebar.archiveThreadAction")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-action="left-sidebar-thread-unread"
              onSelect={() => props.onToggleUnread(!unread)}
            >
              {unread ? language.t("sidebar.markAsRead") : language.t("sidebar.markAsUnread")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
