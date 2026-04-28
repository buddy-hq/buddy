import { LibraryBigIcon, type LucideIcon } from "lucide-react"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Collapsible,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  FolderIcon,
  FileSlidersIcon,
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
  ZapIcon,
} from "@buddy/ui"
import { language } from "@/context/language"
import { collectSessionFamilyIDs } from "@/lib/session-family"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { isSessionWorking } from "@/state/session-status"
import type { NotebookMainPaneTab } from "@/state/ui-preferences"
import { getFilename } from "../sidebar-helpers"
import {
  buildSessionChildrenByParent,
  formatThreadAge,
  parseSubagentSession,
  ThreadStatusIndicator,
} from "./thread-helpers"
import type { DirectoryGroup, DropPosition, OrganizeMode } from "./types"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

type ChatLeftSidebarDirectoryListProps = {
  directoryGroups: DirectoryGroup[]
  currentDirectory: string
  libraryOpen?: boolean
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
  mainPaneTab?: NotebookMainPaneTab
  onMainPaneTabChange?: (directory: string, tab: NotebookMainPaneTab) => void
}

type DirectoryGroupSectionProps = {
  group: DirectoryGroup
  currentDirectory: string
  libraryOpen?: boolean
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
  onTogglePin: (sessionID: string) => void
  onToggleUnread: (sessionID: string, unread: boolean) => void
  onRequestArchive: (sessionID: string, title: string) => void
  onRequestRename: (sessionID: string, title: string) => void
  onLabelPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSectionRef: (element: HTMLElement | null) => void
  onOpenNotebook: () => void
  onCloseNotebook: () => void
  onNewSession: () => void
  mainPaneTab?: NotebookMainPaneTab
  onMainPaneTabChange?: (tab: NotebookMainPaneTab) => void
}

type MainPaneShortcut = {
  tab: Exclude<NotebookMainPaneTab, "chat">
  label: string
  Icon: LucideIcon
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
  onTogglePin: (sessionID: string) => void
  onToggleUnread: (sessionID: string, unread: boolean) => void
  onRequestRename: (sessionID: string, title: string) => void
  onRequestArchive: (sessionID: string, title: string) => void
  depth?: number
}

const COLLAPSED_COUNT = 5
const QUICK_CHAT_COLLAPSED_COUNT = 3
const THREAD_ROW_PADDING_LEFT_PX = 20
const THREAD_CHILD_INDENT_PX = 14
const THREAD_STATUS_OFFSET_PX = 6
// Width of the elbow guide; controls how far the horizontal branch extends before the text
const THREAD_GUIDE_ELBOW_WIDTH = 10
// Approximate half-height of a single thread row: py-1.5 (6+6px) + text-xs content (~18px) ≈ 30px total
const THREAD_ROW_HALF_HEIGHT_PX = 15
// Maximum number of subagent child rows visible before the "show more" button appears
const MAX_VISIBLE_SUBAGENTS = 5

const MAIN_PANE_SHORTCUTS: MainPaneShortcut[] = [
  {
    tab: "instructions",
    label: language.t("sidebar.mainPane.instructions"),
    Icon: FileSlidersIcon,
  },
  {
    tab: "library",
    label: language.t("sidebar.notebookLibrary"),
    Icon: LibraryBigIcon,
  },
]
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
    <div data-component="left-sidebar-directory-list" className="space-y-2 mt-1">
      {props.directoryGroups.map((group) => {
        const allSessions = props.sessionsByDirectory[group.directory] ?? []
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
            libraryOpen={props.libraryOpen}
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
            mainPaneTab={props.mainPaneTab}
            onMainPaneTabChange={(tab) => props.onMainPaneTabChange?.(group.directory, tab)}
          />
        )
      })}
    </div>
  )
}

function DirectoryGroupSection(props: DirectoryGroupSectionProps) {
  const directoryLabel = getFilename(props.group.directory)
  const isQuickChatGroup = isInboxDirectory(props.group.directory)
  const collapsedCount = isQuickChatGroup ? QUICK_CHAT_COLLAPSED_COUNT : COLLAPSED_COUNT
  const visibleSessions = props.expanded
    ? props.group.sessions
    : props.group.sessions.slice(0, collapsedCount)
  const hasMore = props.group.sessions.length > collapsedCount
  const canDrag = props.organizeMode === "project"
  const isCurrentDirectory = !props.libraryOpen && props.group.directory === props.currentDirectory
  const isDragging = props.draggedDirectory === props.group.directory
  const isDragOver =
    props.dragOverDirectory === props.group.directory &&
    props.draggedDirectory !== props.group.directory
  const childrenByParent = buildSessionChildrenByParent(props.allSessions)
  const sessionsByID = new Map(props.allSessions.map((session) => [session.id, session]))
  const activeMainPaneTab = isCurrentDirectory ? (props.mainPaneTab ?? "chat") : "chat"
  const allowActiveThreadHighlight = !props.libraryOpen && activeMainPaneTab === "chat"

  const activeSession = props.group.sessions.find((s) => s.id === props.activeSessionID)
  const isChatActive = isCurrentDirectory && allowActiveThreadHighlight && !!activeSession
  const shouldShowContent = !props.collapsed || isChatActive
  const sessionsToRender =
    props.collapsed && isChatActive && activeSession ? [activeSession] : visibleSessions

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
    <div
      className={`group/notebook-header relative flex items-center gap-1 rounded-lg px-2 pt-1 ${
        !props.collapsed
          ? "rounded-t-lg rounded-b-none bg-surface-raised-base pb-2.5"
          : "pb-1 data-[state=open]:bg-surface-raised-base-hover"
      }`}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-action="left-sidebar-directory-toggle"
          data-directory={props.group.directory}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-0 py-1 text-left text-xs font-light text-text-weaker hover:text-text-strong ${
            canDrag && !isQuickChatGroup ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onPointerDown={
            canDrag && !isQuickChatGroup ? (event) => props.onLabelPointerDown(event) : undefined
          }
        >
          {isQuickChatGroup ? (
            <ZapIcon className="size-3 shrink-0" />
          ) : (
            <span className="relative flex size-3 shrink-0">
              <FolderIcon
                className={`absolute inset-0 size-3 transition-opacity duration-200 ${
                  props.collapsed
                    ? "opacity-100 group-hover/notebook-header:opacity-0"
                    : "opacity-0"
                }`}
              />
              <ChevronRightIcon
                className={`absolute inset-0 size-3 transition-opacity duration-200 ${
                  props.collapsed
                    ? "opacity-0 group-hover/notebook-header:opacity-100"
                    : "opacity-0"
                }`}
              />
              <ChevronDownIcon
                className={`absolute inset-0 size-3 transition-opacity duration-200 ${
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

      <div
        className={`relative z-10 flex items-center gap-0.5 pl-1 bg-surface-raised-base shadow-[-6px_0_8px_-2px_var(--color-surface-raised-base)] transition-opacity focus-within:opacity-100 focus-within:pointer-events-auto group-data-[state=open]/notebook-header:opacity-100 group-data-[state=open]/notebook-header:pointer-events-auto ${
          !props.collapsed || isCurrentDirectory
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {!isQuickChatGroup &&
          props.mainPaneTab &&
          props.onMainPaneTabChange &&
          MAIN_PANE_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.Icon
            const isActive = activeMainPaneTab === shortcut.tab && isCurrentDirectory
            return (
              <Tooltip key={shortcut.tab} delayDuration={1000}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex h-6 min-w-0 items-center justify-center rounded-md transition-all duration-500 ease-out overflow-hidden ${
                      isActive
                        ? "w-6 bg-surface-raised-strong text-text-weaker hover:text-text-strong opacity-100 pointer-events-auto"
                        : !props.collapsed || isCurrentDirectory
                          ? "w-6 text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-strong opacity-100 pointer-events-auto"
                          : "w-0 opacity-0 px-0 pointer-events-none"
                    }`}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (props.mainPaneTab && props.onMainPaneTabChange) {
                        props.onMainPaneTabChange(shortcut.tab)
                      }
                    }}
                  >
                    <Icon className="size-3" strokeWidth={2} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                  {shortcut.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-action="left-sidebar-directory-new-thread"
              data-directory={props.group.directory}
              className={`group/new-thread inline-flex h-6 min-w-0 items-center justify-center rounded-md text-text-base transition-all duration-500 ease-out overflow-hidden hover:bg-surface-raised-base-hover hover:text-text-strong active:scale-[0.97] ${
                !props.collapsed || isCurrentDirectory
                  ? "w-6 opacity-100 pointer-events-auto"
                  : "w-0 opacity-0 px-0 pointer-events-none"
              }`}
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
                className="size-3 transition-transform duration-100 ease-out group-active/new-thread:-rotate-12 group-active/new-thread:scale-110"
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
        className={`group/directory relative ${
          isDragging ? "opacity-40" : ""
        } overflow-hidden rounded-lg bg-surface-raised-base shadow-sm border py-1 ${
          isCurrentDirectory ? "border-[var(--color-border-focus)]" : "border-transparent"
        } ${props.collapsed ? "mb-1.5" : "mb-3"}`}
      >
        {isDragOver && props.dragOverPosition === "before" ? (
          <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mb-1" />
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
                    style={{ paddingLeft: "20px" }}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setPopoverOpen(false)
                      props.onNewSession()
                    }}
                  >
                    <SquarePenIcon className="size-3.5 transition-transform duration-100 ease-out group-active/new-thread-btn:-rotate-12 group-active/new-thread-btn:scale-110" />
                    {language.t("sidebar.newThread")}
                  </button>
                </div>
                {props.group.sessions.length === 0 && (
                  <>
                    <div className="mx-3 my-0.5 h-px bg-border-weaker" />
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
          <div
            className="min-h-0 overflow-hidden"
            style={{
              minHeight:
                shouldShowContent && !isQuickChatGroup && !props.collapsed ? "7rem" : undefined,
            }}
          >
            <div className="space-y-0.5 p-[2px] -m-[2px] flex flex-col">
              {props.group.sessions.length === 0 ? (
                <button
                  type="button"
                  data-action="left-sidebar-directory-empty-new-thread"
                  className="flex flex-1 items-center justify-center gap-2 py-8 text-xs font-light text-text-weaker transition-all hover:bg-surface-raised-base-hover hover:text-text-base active:scale-[0.98]"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    props.onNewSession()
                  }}
                >
                  <SquarePenIcon className="size-3.5" />
                  {language.t("sidebar.newThread")}
                </button>
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
                    onTogglePin={props.onTogglePin}
                    onToggleUnread={props.onToggleUnread}
                    onRequestRename={props.onRequestRename}
                    onRequestArchive={props.onRequestArchive}
                  />
                ))
              )}
              {hasMore && (
                <div className="mx-2">
                  <button
                    type="button"
                    className="py-1 text-[10px] text-text-weaker hover:text-text-base"
                    style={{
                      paddingLeft: `${
                        isQuickChatGroup
                          ? THREAD_ROW_PADDING_LEFT_PX + THREAD_CHILD_INDENT_PX
                          : THREAD_ROW_PADDING_LEFT_PX
                      }px`,
                    }}
                    onClick={props.onToggleExpanded}
                  >
                    {props.expanded
                      ? language.t("sidebar.showLess")
                      : language.t("sidebar.showMore")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {isDragOver && props.dragOverPosition === "after" ? (
          <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mt-1" />
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
  const title = display.title || language.t("sidebar.untitledThread")
  const age = formatThreadAge(props.session.time.updated ?? props.session.time.created)
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
    <div className="mx-2 last:mb-1 group/sibling relative">
      {depth > 0 && (
        <>
          {/* Elbow: vertical from top to row-center, then turns right — connects this row to the branch above */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[1]"
            style={{
              left: `${leftPadding - THREAD_GUIDE_ELBOW_WIDTH}px`,
              top: 0,
              height: `${THREAD_ROW_HALF_HEIGHT_PX}px`,
              width: `${THREAD_GUIDE_ELBOW_WIDTH}px`,
              borderLeft: "1px solid var(--color-border-weaker-base)",
              borderBottom: "1px solid var(--color-border-weaker-base)",
            }}
          />
          {/* Continuation line: row-center to bottom — connects to the next sibling; hidden on the last sibling */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-[1] group-last/sibling:hidden"
            style={{
              left: `${leftPadding - THREAD_GUIDE_ELBOW_WIDTH}px`,
              top: `${THREAD_ROW_HALF_HEIGHT_PX}px`,
              bottom: 0,
              width: "1px",
              backgroundColor: "var(--color-border-weaker-base)",
            }}
          />
        </>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`group/thread relative rounded-lg data-[state=open]:bg-surface-raised-base-hover ${
              active
                ? depth > 0
                  ? "text-text-strong"
                  : "bg-surface-raised-strong shadow-sm text-text-strong"
                : familyActive
                  ? "bg-surface-raised-strong/40 text-text-base"
                  : depth > 0
                    ? ""
                    : "hover:bg-surface-raised-base-hover"
            }`}
          >
            <button
              type="button"
              data-action="left-sidebar-thread-select"
              data-directory={props.directory}
              data-session-id={props.session.id}
              data-active={active ? "true" : "false"}
              aria-expanded={canToggleChildren ? branchExpanded : undefined}
              className="relative w-full py-1.5 pr-2.5 text-left"
              style={{ paddingLeft: `${leftPadding}px` }}
              onClick={handleSelectSession}
            >
              <div
                className="absolute top-1/2 flex -translate-y-1/2 items-center justify-center"
                style={{ left: `${statusOffset}px` }}
              >
                {active ? <ThreadStatusIndicator status={threadStatus} /> : null}
              </div>
              <div className="relative flex min-w-0 items-center">
                {depth > 0 ? (
                  // Two-line layout for subagent rows: title on top, agent name below
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={`truncate text-xs font-light ${active ? "text-text-interactive-base" : ""}`}
                    >
                      {title}
                      {pinned ? <PinIcon className="ml-1 inline size-3 text-text-weaker" /> : null}
                    </span>
                    {display.agent ? (
                      <span
                        className={`truncate font-mono text-[10px] ${active ? "text-text-interactive-base" : ""}`}
                      >
                        {display.agent}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  // Single-line layout with hover overlay for root-level thread rows
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="truncate text-xs font-light">{title}</span>
                      {pinned ? <PinIcon className="size-3 shrink-0 text-text-weaker" /> : null}
                    </div>
                    <div
                      className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 pl-2 opacity-0 group-hover/thread:opacity-100 transition-opacity shadow-[-8px_0_10px_-2px_var(--color-surface-raised-base)] ${
                        active
                          ? "bg-surface-raised-strong"
                          : familyActive
                            ? "bg-surface-raised-strong"
                            : "bg-surface-raised-base-hover"
                      }`}
                    >
                      {display.agent ? (
                        <span
                          className={`max-w-16 truncate text-[11px] font-medium ${getSubagentToneClass(display.agent)}`}
                        >
                          {display.agent}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-text-weaker">{age}</span>
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
            <div className="mx-2 last:mb-1 group/sibling relative">
              {/* Elbow guide — same shape as subagent rows */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-[1]"
                style={{
                  left: `${THREAD_ROW_PADDING_LEFT_PX + (depth + 1) * THREAD_CHILD_INDENT_PX - THREAD_GUIDE_ELBOW_WIDTH}px`,
                  top: 0,
                  height: `${THREAD_ROW_HALF_HEIGHT_PX}px`,
                  width: `${THREAD_GUIDE_ELBOW_WIDTH}px`,
                  borderLeft: "1px solid var(--color-border-weaker-base)",
                  borderBottom: "1px solid var(--color-border-weaker-base)",
                }}
              />
              <button
                type="button"
                className="py-1 text-[10px] text-text-weaker hover:text-text-base"
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
