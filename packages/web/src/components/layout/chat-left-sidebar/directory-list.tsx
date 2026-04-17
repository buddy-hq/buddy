import { useState, type PointerEvent as ReactPointerEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { LayoutTemplateIcon, PlusIcon, type LucideIcon } from "lucide-react"
import {
  ArchiveIcon,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  FolderIcon,
  FolderOpenIcon,
  MailIcon,
  MailOpenIcon,
  PinIcon,
  PencilIcon,
  SquarePenIcon,
  FileSlidersIcon,
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
import { BookOpenIcon, ChevronDownIcon, ChevronRightIcon, HelpIcon } from "../sidebar-icons"
import {
  buildSessionChildrenByParent,
  formatThreadAge,
  parseSubagentSession,
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
  mainPaneTab?: NotebookMainPaneTab
  onMainPaneTabChange?: (directory: string, tab: NotebookMainPaneTab) => void
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
const NOTEBOOK_OPEN_MIN_HEIGHT_CLASS = "min-h-[7rem]"
const MAIN_PANE_SHORTCUT_ROW_CLASS =
  "grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-white/50 dark:bg-black/50 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl w-fit"
const MAIN_PANE_SHORTCUT_BUTTON_BASE_CLASS =
  "flex h-7 w-full items-center justify-center rounded-lg border-0 bg-transparent text-text-weak transition-all duration-160 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
const MAIN_PANE_SHORTCUT_BUTTON_ACTIVE_CLASS = "text-text-strong"
const MAIN_PANE_SHORTCUT_BUTTON_INACTIVE_CLASS =
  "text-text-weak hover:bg-surface-raised-base-hover hover:text-text-base"

const MAIN_PANE_SHORTCUTS: MainPaneShortcut[] = [
  {
    tab: "resources",
    label: language.t("sidebar.mainPane.resources"),
    Icon: BookOpenIcon,
  },
  {
    tab: "diagrams",
    label: language.t("sidebar.mainPane.diagrams"),
    Icon: LayoutTemplateIcon,
  },
  {
    tab: "instructions",
    label: language.t("sidebar.mainPane.instructions"),
    Icon: FileSlidersIcon,
  },
  {
    tab: "question-set",
    label: language.t("sidebar.mainPane.questionSet"),
    Icon: HelpIcon,
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
  const isCurrentDirectory = props.group.directory === props.currentDirectory
  const isDragging = props.draggedDirectory === props.group.directory
  const isDragOver =
    props.dragOverDirectory === props.group.directory &&
    props.draggedDirectory !== props.group.directory
  const childrenByParent = buildSessionChildrenByParent(props.allSessions)
  const sessionsByID = new Map(props.allSessions.map((session) => [session.id, session]))
  const activeMainPaneTab = isCurrentDirectory ? (props.mainPaneTab ?? "chat") : "chat"
  const allowActiveThreadHighlight = activeMainPaneTab === "chat"

  return (
    <Collapsible open={!props.collapsed} onOpenChange={props.onToggleCollapsed} asChild>
      <section
        data-component="left-sidebar-directory-group"
        data-directory={props.group.directory}
        data-current={isCurrentDirectory ? "true" : "false"}
        ref={props.onSectionRef}
        className={`group/directory relative transition-opacity duration-150 ${
          isDragging ? "opacity-40" : "opacity-100"
        } ${
          !isQuickChatGroup
            ? props.collapsed
              ? "mb-0.5"
              : "mb-3 overflow-hidden rounded-lg bg-surface-raised-base shadow-sm"
            : "space-y-1"
        }`}
      >
        {isDragOver && props.dragOverPosition === "before" ? (
          <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mb-1" />
        ) : null}

        {isQuickChatGroup ? (
          <div className="group/section-header mb-1">
            <CollapsibleTrigger asChild>
              <div
                className={`flex cursor-pointer select-none items-center justify-between px-2 transition-colors duration-160 group-hover/section-header:text-text-strong ${
                  isCurrentDirectory ? "text-text-base" : "text-text-weaker"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <ZapIcon className="size-3.5 shrink-0" />
                  <p className="text-xs">{language.t("sidebar.quickChat")}</p>
                  <ChevronDownIcon
                    className={`size-3 transition-transform duration-160 ${
                      props.collapsed ? "-rotate-90 opacity-40" : "rotate-0 opacity-0"
                    }`}
                  />
                </div>
                <Button
                  type="button"
                  data-action="left-sidebar-quick-chat"
                  variant="ghost"
                  size="icon-xs"
                  className={`${
                    props.collapsed ? "invisible" : "visible"
                  } text-text-weak group-hover/section-header:visible hover:bg-surface-raised-base-hover hover:text-text-strong`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    props.onNewSession()
                  }}
                  aria-label={language.t("sidebar.quickChat")}
                  title={language.t("sidebar.quickChat")}
                >
                  <SquarePenIcon className="size-3.5" />
                </Button>
              </div>
            </CollapsibleTrigger>
          </div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`group/notebook-header relative flex items-center gap-1 rounded-lg px-2 py-1 ${
                  !props.collapsed
                    ? "rounded-t-lg rounded-b-none bg-surface-raised-strong"
                    : "data-[state=open]:bg-surface-raised-base-hover"
                }`}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    data-action="left-sidebar-directory-toggle"
                    data-directory={props.group.directory}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-0 py-1 text-left text-sm hover:text-text-strong ${
                      isCurrentDirectory ? "text-text-base" : "text-text-weaker"
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

                <div
                  className={`relative z-10 flex items-center gap-0.5 pl-1 transition-opacity group-focus-within/directory:opacity-100 group-data-[state=open]/notebook-header:opacity-100 ${
                    !props.collapsed ? "opacity-100" : "opacity-0 group-hover/directory:opacity-100"
                  }`}
                >
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
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          props.onNewSession()
                        }}
                      >
                        <PlusIcon className="size-4" strokeWidth={2} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                      {language.t("sidebar.startNewThreadIn", { directoryLabel: directoryLabel })}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
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

        <AnimatePresence initial={false}>
          {!props.collapsed && (
            <CollapsibleContent
              forceMount
              asChild
              className="space-y-1 overflow-hidden p-[2px] -m-[2px]"
            >
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className={!isQuickChatGroup ? `${NOTEBOOK_OPEN_MIN_HEIGHT_CLASS} pb-1` : ""}
              >
                {props.mainPaneTab && props.onMainPaneTabChange ? (
                  <div
                    className={
                      !isQuickChatGroup
                        ? "pb-3 pt-4 flex justify-center"
                        : "mb-2 flex justify-center"
                    }
                  >
                    <div className={MAIN_PANE_SHORTCUT_ROW_CLASS}>
                      {MAIN_PANE_SHORTCUTS.map((shortcut) => {
                        const isActive = activeMainPaneTab === shortcut.tab
                        const Icon = shortcut.Icon
                        return (
                          <Button
                            key={shortcut.tab}
                            type="button"
                            data-action={`left-sidebar-main-pane-${shortcut.tab}`}
                            variant="ghost"
                            size="sm"
                            className={`relative ${MAIN_PANE_SHORTCUT_BUTTON_BASE_CLASS} ${
                              isActive
                                ? MAIN_PANE_SHORTCUT_BUTTON_ACTIVE_CLASS
                                : MAIN_PANE_SHORTCUT_BUTTON_INACTIVE_CLASS
                            } group/shortcut`}
                            title={shortcut.label}
                            onClick={() => {
                              props.onMainPaneTabChange?.(isActive ? "chat" : shortcut.tab)
                            }}
                          >
                            {isActive && (
                              <motion.div
                                layoutId={`main-pane-tab-${props.group.directory}`}
                                className="absolute inset-0 z-0 rounded-lg bg-surface-raised-strong border border-surface-border-strong shadow-sm"
                                transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                              />
                            )}
                            <Icon className="relative z-10 size-[14px]" />
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {props.group.sessions.length === 0 ? (
                  <p className="pl-6 text-sm text-text-weak py-1">
                    {language.t("sidebar.noThreads")}
                  </p>
                ) : (
                  visibleSessions.map((session) => (
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
                  <button
                    type="button"
                    className={`mx-2 py-1 text-xs text-text-weaker hover:text-text-base ${
                      isQuickChatGroup ? "pl-6" : "pl-5"
                    }`}
                    onClick={props.onToggleExpanded}
                  >
                    {props.expanded
                      ? language.t("sidebar.showLess")
                      : language.t("sidebar.showMore")}
                  </button>
                )}
              </motion.div>
            </CollapsibleContent>
          )}
        </AnimatePresence>
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
  const unread = familyIDs.some((id) => !!props.unreadMap[id])
  const threadStatus = busy ? "busy" : unread ? "unread" : "idle"
  const childSessions = (props.childrenByParent.get(props.session.id) ?? [])
    .map((sessionID) => props.sessionsByID.get(sessionID))
    .filter(isSessionInfo)
  const display = parseSubagentSession(props.session)
  const title = display.title || language.t("sidebar.untitledThread")
  const age = formatThreadAge(props.session.time.updated ?? props.session.time.created)
  const leftPadding = THREAD_ROW_PADDING_LEFT_PX + depth * THREAD_CHILD_INDENT_PX
  const statusOffset = THREAD_STATUS_OFFSET_PX + depth * THREAD_CHILD_INDENT_PX
  const canToggleChildren = display.agent !== undefined && childSessions.length > 0
  const [childrenOpen, setChildrenOpen] = useState(true)
  const childrenVisible =
    childSessions.length > 0 && familyActive && (!canToggleChildren || childrenOpen)
  const branchExpanded = canToggleChildren && childrenVisible

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
    <div className="mx-2">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`group/thread relative rounded-lg data-[state=open]:bg-surface-raised-base-hover ${
              active
                ? "bg-surface-raised-strong shadow-sm text-text-strong"
                : familyActive
                  ? "bg-surface-raised-strong/40 text-text-base"
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
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  {canToggleChildren ? (
                    <motion.div
                      animate={{ rotate: branchExpanded ? 90 : 0 }}
                      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    >
                      <ChevronRightIcon className="size-3 shrink-0 text-text-weaker" />
                    </motion.div>
                  ) : null}
                  <span className="truncate text-xs font-normal">{title}</span>
                  {pinned ? <PinIcon className="size-3 shrink-0 text-text-weaker" /> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {display.agent ? (
                    <span
                      className={`max-w-28 truncate text-[11px] font-medium ${getSubagentToneClass(display.agent)}`}
                    >
                      {display.agent}
                    </span>
                  ) : null}
                  <span className="text-[11px] text-text-weaker">{age}</span>
                </div>
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

      <AnimatePresence initial={false}>
        {childrenVisible ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-[2px] overflow-hidden pt-0.5"
          >
            {childSessions.map((childSession) => (
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
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
