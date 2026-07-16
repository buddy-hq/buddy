// Instructions + library icons live in desktop-titlebar.tsx; sidebar header shortcuts disabled.
// import {
//   SlidersHorizontalIcon,
//   SquareLibraryIcon,
//   ScrollTextIcon,
//   type AppIcon,
// } from "@/icons/app-icons"
import { SlidersHorizontalIcon } from "@/icons/app-icons"
import { useQuery } from "@tanstack/react-query"
import {
  ArchiveIcon,
  BookOpenIcon,
  Button,
  ChevronRightIcon,
  Collapsible,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  MailIcon,
  MailOpenIcon,
  PencilIcon,
  PinIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SquarePenIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  XIcon,
  BotIcon,
  MessagesSquareIcon,
  BookIcon,
} from "@buddy/ui"
import { language } from "@/context/language"
import obsidianIconUrl from "@/assets/obsidian-icon.svg"
import { formatSessionTitle } from "@/lib/session-title"
import { collectSessionFamilyIDs } from "@/lib/session-family"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { isSessionWorking } from "@/state/session-status"
import { obsidianVaultProfileQueryOptions } from "@/state/obsidian-vault-query"
import { getFilename } from "../sidebar-helpers"
import {
  buildSessionChildrenByParent,
  // formatThreadAge,
  parseSubagentSession,
  ThreadStatusIndicator,
} from "./thread-helpers"
import type { DirectoryGroup, DropPosition, OrganizeMode } from "./types"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

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
  onPrefetchSession?: (directory: string, sessionID: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onRequestArchive: (directory: string, sessionID: string, title: string) => void
  onRequestRename: (directory: string, sessionID: string, title: string) => void
  onLabelPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, directory: string) => void
  onSectionRef: (directory: string) => (element: HTMLElement | null) => void
  onNewSession: (directory?: string) => void
  onOpenNotebookSettings: (directory: string) => void
  onCloseDirectory: (directory: string) => void
}

type DirectoryGroupSectionProps = {
  group: DirectoryGroup
  currentDirectory: string
  activeSessionID?: string
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
  onPrefetchSession?: (sessionID: string) => void
  onTogglePin: (sessionID: string) => void
  onToggleUnread: (sessionID: string, unread: boolean) => void
  onRequestArchive: (sessionID: string, title: string) => void
  onRequestRename: (sessionID: string, title: string) => void
  onLabelPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSectionRef: (element: HTMLElement | null) => void
  onOpenNotebook: () => void
  onOpenNotebookSettings: () => void
  onCloseNotebook: () => void
  onNewSession: () => void
}

type DirectoryThreadRowProps = {
  directory: string
  currentDirectory: string
  allowActiveThreadHighlight?: boolean
  session: SessionInfo
  activeSessionID?: string
  childrenByParent: Map<string, string[]>
  sessionsByID: Map<string, SessionInfo>
  sessionStatusByID: Record<string, SessionStatusInfo>
  pinnedSet: Set<string>
  unreadMap: Record<string, true>
  onSelectSession: (sessionID: string) => void
  onPrefetchSession?: (sessionID: string) => void
  onTogglePin: (sessionID: string) => void
  onToggleUnread: (sessionID: string, unread: boolean) => void
  onRequestRename: (sessionID: string, title: string) => void
  onRequestArchive: (sessionID: string, title: string) => void
  depth?: number
}

const COLLAPSED_COUNT = 10
const QUICK_CHAT_COLLAPSED_COUNT = 3
// Keep thread title inset in sync with notebook header (list px-1.5 + button px-1 + icon + gap-2).
const NOTEBOOK_HEADER_BUTTON_PADDING_X_PX = 4
const NOTEBOOK_HEADER_ICON_SIZE_PX = 14
const NOTEBOOK_HEADER_ICON_GAP_PX = 8
const THREAD_ROW_PADDING_LEFT_PX =
  NOTEBOOK_HEADER_BUTTON_PADDING_X_PX + NOTEBOOK_HEADER_ICON_SIZE_PX + NOTEBOOK_HEADER_ICON_GAP_PX
const THREAD_CHILD_INDENT_PX = 10
const THREAD_STATUS_OFFSET_PX = 6
// Maximum number of subagent child rows visible before the "show more" button appears
const MAX_VISIBLE_SUBAGENTS = 5
const SESSION_PREFETCH_HOVER_DELAY_MS = 120

const SUBAGENT_TONE_CLASSES = [
  "text-text-interactive-base",
  "text-text-success-base",
  "text-icon-warning-base",
] as const

function isInboxDirectory(directory: string) {
  return getFilename(directory).toLowerCase() === "inbox"
}

function getSubagentToneClass(agent: string) {
  let hash = 0

  for (const character of agent) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return SUBAGENT_TONE_CLASSES[hash % SUBAGENT_TONE_CLASSES.length]
}

function isSessionInfo(value: SessionInfo | undefined): value is SessionInfo {
  return value !== undefined
}

// ---------------------------------------------------------------------------
// Notebook library popover
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

export function ChatLeftSidebarDirectoryList(props: ChatLeftSidebarDirectoryListProps) {
  return (
    <div data-component="left-sidebar-directory-list" className="space-y-0.5 mt-2">
      {props.directoryGroups.map((group) => {
        const allSessions = props.sessionsByDirectory[group.directory] ?? []
        const sessionStatusByID = props.sessionStatusByDirectory[group.directory] ?? {}
        const pinnedSet = new Set(props.pinnedByDirectory[group.directory] ?? [])
        const unreadMap = props.unreadByDirectory[group.directory] ?? {}
        const expanded = !!props.expandedDirectories[group.directory]
        const collapsed = !!props.collapsedDirectories[group.directory]

        return (
          <div key={group.directory}>
            <DirectoryGroupSection
              group={group}
              currentDirectory={props.currentDirectory}
              activeSessionID={props.activeSessionID}
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
              onPrefetchSession={(sessionID) =>
                props.onPrefetchSession?.(group.directory, sessionID)
              }
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
              onOpenNotebookSettings={() => props.onOpenNotebookSettings(group.directory)}
              onCloseNotebook={() => props.onCloseDirectory(group.directory)}
              onNewSession={() => props.onNewSession(group.directory)}
            />
          </div>
        )
      })}
    </div>
  )
}

function DirectoryGroupSection(props: DirectoryGroupSectionProps) {
  const directoryLabel = getFilename(props.group.directory)
  const isQuickChatGroup = isInboxDirectory(props.group.directory)
  const obsidianProfileQuery = useQuery({
    ...obsidianVaultProfileQueryOptions(props.group.directory),
    enabled: !isQuickChatGroup,
  })
  const isObsidianVault = obsidianProfileQuery.data?.compatible === true
  const collapsedCount = isQuickChatGroup ? QUICK_CHAT_COLLAPSED_COUNT : COLLAPSED_COUNT
  const visibleSessions = props.expanded
    ? props.group.sessions
    : props.group.sessions.slice(0, collapsedCount)
  const hasMore = props.group.sessions.length > collapsedCount
  const canDrag = props.organizeMode === "project"
  const isCurrentDirectory = props.group.directory === props.currentDirectory
  const isDragging = props.draggedDirectory === props.group.directory
  const isDragOver =
    props.dragOverDirectory === props.group.directory &&
    props.draggedDirectory !== props.group.directory
  const childrenByParent = buildSessionChildrenByParent(props.allSessions)
  const sessionsByID = new Map(props.allSessions.map((session) => [session.id, session]))
  const allowActiveThreadHighlight = true

  const shouldShowContent = !props.collapsed
  const sessionsToRender = visibleSessions

  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverTimeoutRef = useRef<any>(null)
  const popoverOpenTimeoutRef = useRef<any>(null)
  const justCollapsedRef = useRef(false)

  const handleMouseEnter = () => {
    if (props.collapsed && !justCollapsedRef.current) {
      clearTimeout(popoverTimeoutRef.current)
      if (!popoverOpen) {
        popoverOpenTimeoutRef.current = setTimeout(() => {
          setPopoverOpen(true)
        }, 250)
      }
    }
  }

  const handleMouseLeave = () => {
    justCollapsedRef.current = false
    clearTimeout(popoverOpenTimeoutRef.current)
    popoverTimeoutRef.current = setTimeout(() => {
      setPopoverOpen(false)
    }, 150)
  }

  const headerNode = (
    <div className={`group/notebook-header relative flex items-center gap-1 px-1.5 pt-0.5 pb-0.5`}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-action="left-sidebar-directory-toggle"
          data-directory={props.group.directory}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-light text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong cursor-pointer`}
          onPointerDown={
            canDrag && !isQuickChatGroup ? (event) => props.onLabelPointerDown(event) : undefined
          }
        >
          {isQuickChatGroup ? (
            <MessagesSquareIcon className="size-3.5 shrink-0" />
          ) : isObsidianVault ? (
            <span className="relative flex size-3.5 shrink-0">
              <img
                src={obsidianIconUrl}
                alt=""
                aria-hidden="true"
                data-component="left-sidebar-obsidian-vault-icon"
                className={`absolute inset-0 size-3.5 rounded-[3px] transition-opacity duration-200 ${
                  props.collapsed
                    ? "opacity-100 group-hover/notebook-header:opacity-0"
                    : "opacity-100"
                }`}
              />
              <ChevronRightIcon
                className={`absolute inset-0 size-3.5 transition-opacity duration-200 ${
                  props.collapsed
                    ? "opacity-0 group-hover/notebook-header:opacity-100"
                    : "opacity-0"
                }`}
              />
            </span>
          ) : (
            <span className="relative flex size-3.5 shrink-0">
              <BookIcon
                className={`absolute inset-0 size-3.5 transition-opacity duration-200 ${
                  props.collapsed
                    ? "opacity-100 group-hover/notebook-header:opacity-0"
                    : "opacity-0"
                }`}
              />
              <ChevronRightIcon
                className={`absolute inset-0 size-3.5 transition-opacity duration-200 ${
                  props.collapsed
                    ? "opacity-0 group-hover/notebook-header:opacity-100"
                    : "opacity-0"
                }`}
              />
              <BookOpenIcon
                className={`absolute inset-0 size-3.5 transition-opacity duration-200 ${
                  !props.collapsed ? "opacity-100" : "opacity-0"
                }`}
              />
            </span>
          )}
          <span className="truncate">
            {isQuickChatGroup ? language.t("sidebar.quickChat") : directoryLabel}
          </span>
        </button>
      </CollapsibleTrigger>

      <div className="relative z-10 flex items-center gap-0.5 pl-1 opacity-0 pointer-events-none transition-opacity group-hover/directory:opacity-100 group-hover/directory:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-action="left-sidebar-directory-new-thread"
              data-directory={props.group.directory}
              className="group/new-thread inline-flex h-6 w-6 items-center justify-center rounded-md text-text-base transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.97]"
              aria-label={language.t("sidebar.startNewThreadIn", {
                directoryLabel: isQuickChatGroup ? language.t("sidebar.quickChat") : directoryLabel,
              })}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                props.onNewSession()
              }}
            >
              <SquarePenIcon
                className="size-3.5 transition-transform duration-100 ease-out group-active/new-thread:scale-110"
                strokeWidth={2}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
            {language.t("sidebar.startNewThreadIn", {
              directoryLabel: isQuickChatGroup ? language.t("sidebar.quickChat") : directoryLabel,
            })}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )

  return (
    <Collapsible
      open={!props.collapsed}
      onOpenChange={(open) => {
        if (!open) justCollapsedRef.current = true
        props.onToggleCollapsed(open)
      }}
      asChild
    >
      <section
        data-component="left-sidebar-directory-group"
        data-directory={props.group.directory}
        data-current={isCurrentDirectory ? "true" : "false"}
        ref={props.onSectionRef}
        className={`group/directory relative ${isDragging ? "opacity-40" : ""} ${
          isCurrentDirectory ? "" : ""
        }`}
      >
        {isDragOver && props.dragOverPosition === "before" ? (
          <div className="mx-1.5 mb-1 h-0.5 rounded-full bg-surface-interactive-base/70" />
        ) : null}

        <Popover
          open={popoverOpen}
          onOpenChange={(open) => {
            if (open && justCollapsedRef.current) return
            setPopoverOpen(open)
          }}
        >
          {isQuickChatGroup ? (
            <PopoverTrigger asChild>
              <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                {headerNode}
              </div>
            </PopoverTrigger>
          ) : (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <PopoverTrigger asChild>
                  <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {headerNode}
                  </div>
                </PopoverTrigger>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem
                  data-action="left-sidebar-directory-settings"
                  onSelect={props.onOpenNotebookSettings}
                >
                  <SlidersHorizontalIcon className="mr-2 size-3.5" />
                  {language.t("sidebar.notebookSettings")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  data-action="left-sidebar-directory-close"
                  onSelect={props.onCloseNotebook}
                >
                  <XIcon className="mr-2 size-3.5" />
                  {language.t("sidebar.closeNotebook")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )}

          {props.collapsed && (
            <PopoverContent
              side="right"
              align="start"
              sideOffset={12}
              className="p-1 max-h-[60vh] overflow-y-auto scrollbar-hover"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <div className="flex flex-col">
                <div className="mx-2 mt-1 mb-1">
                  <button
                    type="button"
                    className="group/new-thread-btn flex w-full items-center gap-2 rounded-lg py-1.5 pr-2.5 text-xs font-light text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-base transition active:scale-[0.97]"
                    style={{ paddingLeft: `${THREAD_ROW_PADDING_LEFT_PX}px` }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setPopoverOpen(false)
                      props.onNewSession()
                    }}
                  >
                    <SquarePenIcon className="size-3.5 transition-transform duration-100 ease-out group-active/new-thread-btn:scale-110" />
                    {language.t("sidebar.newThread")}
                  </button>
                </div>
                {props.group.sessions.length === 0 && (
                  <>
                    <div className="mx-3 my-0.5 h-px bg-border-weaker-base" />
                    <p className="py-3 text-center text-[11px] text-text-weakest">
                      {language.t("sidebar.noThreads")}
                    </p>
                  </>
                )}
                {props.group.sessions.map((session) => (
                  <DirectoryThreadRow
                    key={`popover:${props.group.directory}:${session.id}`}
                    directory={props.group.directory}
                    currentDirectory={props.currentDirectory}
                    session={session}
                    activeSessionID={props.activeSessionID}
                    allowActiveThreadHighlight={allowActiveThreadHighlight}
                    childrenByParent={childrenByParent}
                    sessionsByID={sessionsByID}
                    sessionStatusByID={props.sessionStatusByID}
                    pinnedSet={props.pinnedSet}
                    unreadMap={props.unreadMap}
                    onSelectSession={(id) => {
                      setPopoverOpen(false)
                      props.onSelectSession(id)
                    }}
                    onPrefetchSession={props.onPrefetchSession}
                    onTogglePin={props.onTogglePin}
                    onToggleUnread={props.onToggleUnread}
                    onRequestRename={props.onRequestRename}
                    onRequestArchive={props.onRequestArchive}
                  />
                ))}
              </div>
            </PopoverContent>
          )}
        </Popover>

        <div
          className="grid"
          style={{
            gridTemplateRows: shouldShowContent ? "1fr" : "0fr",
            opacity: shouldShowContent ? 1 : 0,
            transition:
              "grid-template-rows 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            pointerEvents: shouldShowContent ? undefined : "none",
          }}
          aria-hidden={shouldShowContent ? undefined : true}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col space-y-0.5 px-1.5">
              {props.group.sessions.length === 0 ? (
                <div className="flex justify-center py-6">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-action="left-sidebar-directory-empty-new-thread"
                    className="gap-1.5 text-xs font-light text-text-weaker hover:text-text-base"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      props.onNewSession()
                    }}
                  >
                    <SquarePenIcon className="size-3.5" />
                    {language.t("sidebar.newThread")}
                  </Button>
                </div>
              ) : (
                sessionsToRender.map((session) => (
                  <DirectoryThreadRow
                    key={`${props.group.directory}:${session.id}`}
                    directory={props.group.directory}
                    currentDirectory={props.currentDirectory}
                    session={session}
                    activeSessionID={props.activeSessionID}
                    allowActiveThreadHighlight={allowActiveThreadHighlight}
                    childrenByParent={childrenByParent}
                    sessionsByID={sessionsByID}
                    sessionStatusByID={props.sessionStatusByID}
                    pinnedSet={props.pinnedSet}
                    unreadMap={props.unreadMap}
                    onSelectSession={props.onSelectSession}
                    onPrefetchSession={props.onPrefetchSession}
                    onTogglePin={props.onTogglePin}
                    onToggleUnread={props.onToggleUnread}
                    onRequestRename={props.onRequestRename}
                    onRequestArchive={props.onRequestArchive}
                  />
                ))
              )}
              {hasMore ? (
                <div className="group/sibling relative last:mb-1">
                  <button
                    type="button"
                    className="relative w-full py-1 pr-2.5 text-left text-[10px] text-text-weaker hover:text-text-base"
                    style={{ paddingLeft: `${THREAD_ROW_PADDING_LEFT_PX}px` }}
                    onClick={props.onToggleExpanded}
                  >
                    {props.expanded
                      ? language.t("sidebar.showLess")
                      : language.t("sidebar.showMore")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {isDragOver && props.dragOverPosition === "after" ? (
          <div className="mx-1.5 mt-1 h-0.5 rounded-full bg-surface-interactive-base/70" />
        ) : null}
      </section>
    </Collapsible>
  )
}

export function DirectoryThreadRow(props: DirectoryThreadRowProps) {
  const depth = props.depth ?? 0
  const familyIDs = collectSessionFamilyIDs(props.childrenByParent, props.session.id)
  const allowActiveThreadHighlight = props.allowActiveThreadHighlight ?? true
  const active =
    allowActiveThreadHighlight &&
    props.directory === props.currentDirectory &&
    props.session.id === props.activeSessionID
  const familyActive =
    allowActiveThreadHighlight &&
    props.directory === props.currentDirectory &&
    !!props.activeSessionID &&
    familyIDs.includes(props.activeSessionID)
  const busy = familyIDs.some((id) =>
    isSessionWorking({
      info: props.sessionsByID.get(id),
      status: props.sessionStatusByID[id],
    }),
  )
  const pinned = familyIDs.some((id) => props.pinnedSet.has(id))
  const unread = !!props.unreadMap[props.session.id]
  const threadStatus = busy ? "busy" : unread ? "unread" : "idle"
  const childSessions = (props.childrenByParent.get(props.session.id) ?? [])
    .map((sessionID) => props.sessionsByID.get(sessionID))
    .filter(isSessionInfo)
  const display = parseSubagentSession(props.session)
  const title = formatSessionTitle(display.title || language.t("sidebar.untitledThread"))
  // const age = formatThreadAge(props.session.time.updated ?? props.session.time.created)
  const leftPadding = THREAD_ROW_PADDING_LEFT_PX + depth * THREAD_CHILD_INDENT_PX
  const statusOffset = THREAD_STATUS_OFFSET_PX + depth * THREAD_CHILD_INDENT_PX
  const canToggleChildren = childSessions.length > 0
  const [childrenOpen, setChildrenOpen] = useState(false)
  // Auto-open children when this session's family becomes active; stays open until user collapses
  useEffect(() => {
    if (familyActive && canToggleChildren) setChildrenOpen(true)
  }, [familyActive, canToggleChildren])
  const childrenVisible = childSessions.length > 0 && childrenOpen
  // childrenMounted: stays true through the closing animation so CSS grid collapse can play.
  // childrenExpanded: the actual CSS animation state — deliberately lags one RAF behind mount so
  // the browser paints the 0fr collapsed state before transitioning to 1fr (fixes instant-open bug
  // when navigating from one thread to another with subagents).
  const [childrenMounted, setChildrenMounted] = useState(false)
  const [childrenExpanded, setChildrenExpanded] = useState(false)
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (childrenVisible) {
      setChildrenMounted(true)
      const raf = requestAnimationFrame(() => setChildrenExpanded(true))
      return () => cancelAnimationFrame(raf)
    } else {
      setChildrenExpanded(false)
      // childrenMounted is cleared in onTransitionEnd after the grid collapses
    }
  }, [childrenVisible])
  const branchExpanded = canToggleChildren && childrenVisible
  const [showAllChildren, setShowAllChildren] = useState(false)
  const hiddenChildCount = Math.max(0, childSessions.length - MAX_VISIBLE_SUBAGENTS)
  const visibleChildSessions = showAllChildren
    ? childSessions
    : childSessions.slice(0, MAX_VISIBLE_SUBAGENTS)

  useEffect(
    () => () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current)
      }
    },
    [],
  )

  function handlePrefetchIntent() {
    if (!props.onPrefetchSession || active) return
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current)
    }
    prefetchTimeoutRef.current = setTimeout(() => {
      prefetchTimeoutRef.current = undefined
      props.onPrefetchSession?.(props.session.id)
    }, SESSION_PREFETCH_HOVER_DELAY_MS)
  }

  function cancelPrefetchIntent() {
    if (!prefetchTimeoutRef.current) return
    clearTimeout(prefetchTimeoutRef.current)
    prefetchTimeoutRef.current = undefined
  }

  function handleSelectSession() {
    if (canToggleChildren && active) {
      setChildrenOpen((current) => !current)
      return
    }

    if (canToggleChildren) {
      setChildrenOpen(true)
    }

    props.onSelectSession(props.session.id)
  }

  return (
    <div className="group/sibling relative last:mb-1">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`group/thread relative rounded-lg data-[state=open]:bg-surface-raised-base-hover ${
              active
                ? "bg-surface-raised-strong text-text-strong"
                : familyActive
                  ? "bg-surface-raised-strong/40 text-text-base"
                  : "text-text-weak hover:bg-surface-raised-base-hover"
            }`}
          >
            <button
              type="button"
              data-action="left-sidebar-thread-select"
              data-directory={props.directory}
              data-session-id={props.session.id}
              data-active={active ? "true" : "false"}
              aria-expanded={canToggleChildren ? branchExpanded : undefined}
              className="relative w-full py-1 pr-2.5 text-left"
              style={{ paddingLeft: `${leftPadding}px` }}
              onClick={handleSelectSession}
              onPointerEnter={(event) => {
                if (event.pointerType === "touch") return
                handlePrefetchIntent()
              }}
              onPointerLeave={cancelPrefetchIntent}
              onFocus={handlePrefetchIntent}
              onBlur={cancelPrefetchIntent}
            >
              <div
                className="absolute top-1/2 flex -translate-y-1/2 items-center justify-center"
                style={{ left: `${statusOffset}px` }}
              >
                {threadStatus !== "idle" ? <ThreadStatusIndicator status={threadStatus} /> : null}
              </div>
              <div className="relative flex min-w-0 items-center">
                {depth > 0 ? (
                  // Subagent child row: title only, agent name omitted to reduce noise
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <BotIcon
                      className={`size-3 shrink-0 ${active ? "text-text-interactive-base" : "text-text-weaker"}`}
                    />
                    <span
                      className={`truncate text-xs font-light ${active ? "text-text-interactive-base" : "text-text-weaker"}`}
                    >
                      {title}
                    </span>
                    {pinned ? <PinIcon className="size-2.5 shrink-0 text-text-weaker" /> : null}
                  </div>
                ) : (
                  // Single-line layout with hover overlay for root-level thread rows
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-xs font-light">{title}</span>
                      {pinned ? <PinIcon className="size-3 shrink-0 text-text-weaker" /> : null}
                    </div>
                    <div
                      className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 pl-6 pr-0.5 opacity-0 group-hover/thread:opacity-100 transition-opacity ${
                        active
                          ? "bg-gradient-to-r from-transparent to-[var(--color-surface-raised-strong)]"
                          : familyActive
                            ? "bg-gradient-to-r from-transparent to-[var(--color-surface-raised-strong)]"
                            : "bg-gradient-to-r from-transparent to-[var(--color-surface-raised-base)]"
                      }`}
                    >
                      {display.agent ? (
                        <span
                          className={`max-w-16 truncate text-[11px] font-medium ${getSubagentToneClass(display.agent)}`}
                        >
                          {display.agent}
                        </span>
                      ) : null}
                      {/* <span className="text-[11px] text-text-weaker">{age}</span> */}
                    </div>
                  </>
                )}
              </div>
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem
            data-action="left-sidebar-thread-pin"
            onSelect={() => props.onTogglePin(props.session.id)}
          >
            <PinIcon className="mr-2 size-3.5" />
            {pinned ? language.t("sidebar.unpinThread") : language.t("sidebar.pinThread")}
          </ContextMenuItem>
          <ContextMenuItem
            data-action="left-sidebar-thread-rename"
            onSelect={() => props.onRequestRename(props.session.id, props.session.title)}
          >
            <PencilIcon className="mr-2 size-3.5" />
            {language.t("sidebar.renameThreadAction")}
          </ContextMenuItem>
          <ContextMenuItem
            data-action="left-sidebar-thread-archive"
            onSelect={() =>
              props.onRequestArchive(
                props.session.id,
                props.session.title || language.t("sidebar.untitledThread"),
              )
            }
          >
            <ArchiveIcon className="mr-2 size-3.5" />
            {language.t("sidebar.archiveThreadAction")}
          </ContextMenuItem>
          <ContextMenuItem
            data-action="left-sidebar-thread-unread"
            onSelect={() => props.onToggleUnread(props.session.id, !unread)}
          >
            {unread ? (
              <>
                <MailOpenIcon className="mr-2 size-3.5" />
                {language.t("sidebar.markAsRead")}
              </>
            ) : (
              <>
                <MailIcon className="mr-2 size-3.5" />
                {language.t("sidebar.markAsUnread")}
              </>
            )}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div
        className="grid"
        style={{
          gridTemplateRows: childrenExpanded ? "1fr" : "0fr",
          opacity: childrenExpanded ? 1 : 0,
          transition:
            "grid-template-rows 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
          pointerEvents: childrenExpanded ? undefined : "none",
        }}
        aria-hidden={childrenExpanded ? undefined : true}
        onTransitionEnd={(e) => {
          if (e.propertyName === "grid-template-rows" && !childrenExpanded) {
            setChildrenMounted(false)
          }
        }}
      >
        <div className="min-h-0 overflow-hidden pt-0.5">
          {childrenMounted
            ? visibleChildSessions.map((childSession) => (
                <DirectoryThreadRow
                  key={`${props.directory}:${childSession.id}`}
                  directory={props.directory}
                  currentDirectory={props.currentDirectory}
                  session={childSession}
                  activeSessionID={props.activeSessionID}
                  allowActiveThreadHighlight={allowActiveThreadHighlight}
                  childrenByParent={props.childrenByParent}
                  sessionsByID={props.sessionsByID}
                  sessionStatusByID={props.sessionStatusByID}
                  pinnedSet={props.pinnedSet}
                  unreadMap={props.unreadMap}
                  onSelectSession={props.onSelectSession}
                  onTogglePin={props.onTogglePin}
                  onToggleUnread={props.onToggleUnread}
                  onRequestRename={props.onRequestRename}
                  onRequestArchive={props.onRequestArchive}
                  depth={depth + 1}
                />
              ))
            : null}
          {childrenMounted && hiddenChildCount > 0 ? (
            <div className="group/sibling relative last:mb-1">
              <button
                type="button"
                className="relative w-full py-1 pr-2.5 text-left text-[10px] text-text-weaker hover:text-text-base"
                style={{
                  paddingLeft: `${THREAD_ROW_PADDING_LEFT_PX + (depth + 1) * THREAD_CHILD_INDENT_PX}px`,
                }}
                onClick={() => setShowAllChildren((v) => !v)}
              >
                {showAllChildren ? language.t("sidebar.showLess") : language.t("sidebar.showMore")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
