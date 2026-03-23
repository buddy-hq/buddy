import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { useCallback, useRef, useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@buddy/ui"
import type { SessionInfo } from "@/state/chat-types"
import { getFilename } from "./sidebar-helpers"
import {
  findRootSessionID,
  formatThreadAge,
  sessionFamilyIDs,
  threadStatusLabel,
  ThreadStatusIndicator,
} from "./chat-left-sidebar/thread-helpers"
import { useDirectoryGroups } from "./chat-left-sidebar/use-directory-groups"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  PinIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
  SettingsIcon,
  XIcon,
} from "./sidebar-icons"

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

type RenameState = {
  directory: string
  sessionID: string
  title: string
}

type ArchiveState = {
  directory: string
  sessionID: string
  title: string
}

type OrganizeMode = "project" | "chronological"
type SortMode = "created" | "updated"
type ShowMode = "all" | "relevant"

const COLLAPSED_COUNT = 9

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
  const [draggedDirectory, setDraggedDirectory] = useState<string | undefined>(undefined)
  const [dragOverDirectory, setDragOverDirectory] = useState<string | undefined>(undefined)
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after">("after")
  const sectionRefsMap = useRef<Map<string, HTMLElement>>(new Map())

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

  const sectionRefCallback = useCallback(
    (directory: string) => (element: HTMLElement | null) => {
      if (element) {
        sectionRefsMap.current.set(directory, element)
      } else {
        sectionRefsMap.current.delete(directory)
      }
    },
    [],
  )

  function findDropTarget(
    clientY: number,
    draggedDir: string,
  ): { directory: string; position: "before" | "after" } | undefined {
    const groups = directoryGroups
    for (const group of groups) {
      if (group.directory === draggedDir) continue
      const el = sectionRefsMap.current.get(group.directory)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const midpoint = rect.top + rect.height / 2
        return {
          directory: group.directory,
          position: clientY < midpoint ? "before" : "after",
        }
      }
    }
    return undefined
  }

  function commitReorder(sourceDir: string, targetDir: string, position: "before" | "after") {
    const currentOrder = directoryGroups.map((g) => g.directory)
    if (!currentOrder.includes(sourceDir) || !currentOrder.includes(targetDir)) return
    const without = currentOrder.filter((d) => d !== sourceDir)
    const targetIndex = without.indexOf(targetDir)
    if (targetIndex === -1) return
    const insertAt = position === "before" ? targetIndex : targetIndex + 1
    const next = [...without.slice(0, insertAt), sourceDir, ...without.slice(insertAt)]
    props.onReorderDirectories(next)
  }

  function handleLabelPointerDown(event: ReactPointerEvent<HTMLButtonElement>, directory: string) {
    if (event.button !== 0) return

    const startY = event.clientY
    let isDragging = false
    const controller = new AbortController()

    function onPointerMove(e: globalThis.PointerEvent) {
      const deltaY = Math.abs(e.clientY - startY)
      if (!isDragging && deltaY > 3) {
        isDragging = true
        setDraggedDirectory(directory)
      }

      if (isDragging) {
        e.preventDefault()
        const target = findDropTarget(e.clientY, directory)
        if (target) {
          setDragOverDirectory(target.directory)
          setDragOverPosition(target.position)
        } else {
          setDragOverDirectory(undefined)
        }
      }
    }

    function onPointerUp(e: globalThis.PointerEvent) {
      if (isDragging) {
        const target = findDropTarget(e.clientY, directory)
        if (target) {
          commitReorder(directory, target.directory, target.position)
        }
      }

      controller.abort()
      setDraggedDirectory(undefined)
      setDragOverDirectory(undefined)
    }

    document.addEventListener("pointermove", onPointerMove, {
      signal: controller.signal,
    })
    document.addEventListener("pointerup", onPointerUp, {
      signal: controller.signal,
    })
  }

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

  return (
    <aside
      className={`shrink-0 border-r border-border-base bg-surface-raised-base text-text-base flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
    >
      {props.children ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">{props.children}</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">
          <div className="mb-3 px-1">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
              onClick={() => props.onNewSession(props.currentDirectory)}
              disabled={!props.currentDirectory}
            >
              <SquarePenIcon className="size-3.5 mr-2" />
              New thread
            </Button>
          </div>

          <div className="mb-2 flex items-center justify-between px-1 text-text-weak">
            <p className="text-[13px] font-medium">Threads</p>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
                    aria-label="Add notebook"
                    title="Add notebook"
                    onClick={props.onOpenDirectory}
                  >
                    <FolderPlusIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                  Add notebook
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                    aria-label="Organize threads"
                    title="Organize threads"
                  >
                    <SlidersHorizontalIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="w-56 min-w-56">
                  <DropdownMenuLabel>Organize</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={organizeMode}
                    onValueChange={(value) => {
                      if (value === "project" || value === "chronological") {
                        setOrganizeMode(value)
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="project">By notebook</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="chronological">
                      Chronological list
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={sortMode}
                    onValueChange={(value) => {
                      if (value === "created" || value === "updated") {
                        setSortMode(value)
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="created">Created</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="updated">Updated</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Show</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={showMode}
                    onValueChange={(value) => {
                      if (value === "all" || value === "relevant") {
                        setShowMode(value)
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="all">All threads</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="relevant">Relevant</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-5">
            {directoryGroups.map((group) => {
              const isCurrentDirectory = group.directory === props.currentDirectory
              const directoryLabel = getFilename(group.directory)
              const allSessions = props.sessionsByDirectory[group.directory] ?? []
              const activeRootID = findRootSessionID(allSessions, props.activeSessionID)
              const unreadMap = props.unreadByDirectory[group.directory] ?? {}
              const pinnedSet = new Set(props.pinnedByDirectory[group.directory] ?? [])
              const sessionStatusByID = props.sessionStatusByDirectory[group.directory] ?? {}
              const expanded = !!expandedDirectories[group.directory]
              const collapsed = !!collapsedDirectories[group.directory]
              const visibleSessions = expanded
                ? group.sessions
                : group.sessions.slice(0, COLLAPSED_COUNT)
              const hasMore = group.sessions.length > COLLAPSED_COUNT
              const isDragging = draggedDirectory === group.directory
              const isDragOver =
                dragOverDirectory === group.directory && draggedDirectory !== group.directory
              const canDrag = organizeMode === "project"

              return (
                <section
                  key={group.directory}
                  ref={sectionRefCallback(group.directory)}
                  className={`space-y-1 relative transition-opacity duration-150 ${
                    isDragging ? "opacity-40" : "opacity-100"
                  }`}
                >
                  {isDragOver && dragOverPosition === "before" ? (
                    <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mb-1" />
                  ) : null}
                  <div className="group/directory flex items-center gap-1 rounded-xl px-1 py-0.5">
                    <button
                      type="button"
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-sm ${
                        isCurrentDirectory
                          ? "text-text-strong"
                          : "text-text-weak hover:text-text-base"
                      } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
                      onPointerDown={
                        canDrag ? (e) => handleLabelPointerDown(e, group.directory) : undefined
                      }
                      onClick={() => {
                        setCollapsedDirectories((current) => {
                          const next = { ...current }
                          if (next[group.directory]) {
                            delete next[group.directory]
                          } else {
                            next[group.directory] = true
                          }
                          return next
                        })
                      }}
                    >
                      {collapsed ? (
                        <ChevronRightIcon className="size-3.5 shrink-0 text-text-weak" />
                      ) : (
                        <ChevronDownIcon className="size-3.5 shrink-0 text-text-weak" />
                      )}
                      <span className={`truncate ${isCurrentDirectory ? "font-medium" : ""}`}>
                        {directoryLabel}
                      </span>
                    </button>

                    <div className="flex items-center gap-0.5 pr-1 opacity-0 pointer-events-none transition-opacity group-hover/directory:opacity-100 group-hover/directory:pointer-events-auto group-focus-within/directory:opacity-100 group-focus-within/directory:pointer-events-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                            aria-label={`Options for ${directoryLabel}`}
                          >
                            <EllipsisHorizontalIcon className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => props.onSelectSession(group.directory)}>
                            <FolderIcon className="size-3.5 mr-2" />
                            Open notebook
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => props.onCloseDirectory(group.directory)}
                          >
                            <XIcon className="size-3.5 mr-2" />
                            Close notebook
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                            aria-label={`Start new thread in ${directoryLabel}`}
                            onClick={() => props.onNewSession(group.directory)}
                          >
                            <SquarePenIcon className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                          {`Start new thread in ${directoryLabel}`}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {group.sessions.length === 0 ? (
                    <p className="pl-6 text-sm text-text-weak">No threads</p>
                  ) : collapsed ? null : (
                    visibleSessions.map((session) => {
                      const familyIDs = sessionFamilyIDs(allSessions, session.id)
                      const active =
                        group.directory === props.currentDirectory && session.id === activeRootID
                      const busy = familyIDs.some((id) => sessionStatusByID[id] === "busy")
                      const pinned = familyIDs.some((id) => pinnedSet.has(id))
                      const unread = familyIDs.some((id) => !!unreadMap[id])
                      const threadStatus = busy ? "busy" : unread ? "unread" : "idle"

                      return (
                        <div
                          key={`${group.directory}:${session.id}`}
                          className={`group/thread relative ml-3 rounded-xl ${
                            active
                              ? "bg-[color:color-mix(in_oklab,var(--surface-raised-base-hover)_58%,var(--surface-raised-base)_42%)] ring-1 ring-border-base"
                              : "hover:bg-surface-raised-base-hover"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => props.onSelectSession(group.directory, session.id)}
                            className="w-full px-3 py-2 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-2 pr-8">
                              <ThreadStatusIndicator status={threadStatus} />
                              <span className="sr-only">{threadStatusLabel(threadStatus)}</span>
                              <div className="flex min-w-0 items-center gap-1">
                                <span
                                  className={`truncate text-xs ${
                                    active || unread
                                      ? "font-medium text-text-strong"
                                      : "text-text-weak"
                                  }`}
                                >
                                  {session.title || "New thread"}
                                </span>
                                {pinned ? (
                                  <PinIcon className="size-3 shrink-0 text-text-weak" />
                                ) : null}
                              </div>
                              <span
                                className={`ml-auto shrink-0 text-[12px] ${
                                  busy ? "text-icon-warning-base" : "text-text-weak"
                                }`}
                              >
                                {busy ? "live" : formatThreadAge(session.time.updated)}
                              </span>
                            </div>
                          </button>

                          <div className="absolute right-1 top-1.5 opacity-0 pointer-events-none transition-opacity group-hover/thread:opacity-100 group-hover/thread:pointer-events-auto group-focus-within/thread:opacity-100 group-focus-within/thread:pointer-events-auto">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex size-6 items-center justify-center rounded-md text-text-weak hover:bg-surface-weak/70 hover:text-text-base"
                                  aria-label="Thread options"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <EllipsisHorizontalIcon className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    props.onTogglePin(group.directory, session.id)
                                  }}
                                >
                                  <PinIcon className="size-3.5 mr-2" />
                                  {pinned ? "Unpin thread" : "Pin thread"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setRenameState({
                                      directory: group.directory,
                                      sessionID: session.id,
                                      title: session.title,
                                    })
                                  }}
                                >
                                  <PencilIcon className="size-3.5 mr-2" />
                                  Rename thread
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setArchiveState({
                                      directory: group.directory,
                                      sessionID: session.id,
                                      title: session.title || "Untitled thread",
                                    })
                                  }}
                                >
                                  <ArchiveIcon className="size-3.5 mr-2" />
                                  Archive thread
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => {
                                    props.onToggleUnread(group.directory, session.id, !unread)
                                  }}
                                >
                                  {unread ? "Mark as read" : "Mark as unread"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      )
                    })
                  )}

                  {hasMore && !collapsed ? (
                    <button
                      type="button"
                      className="ml-6 text-sm text-text-weak hover:text-text-base"
                      onClick={() =>
                        setExpandedDirectories((current) => {
                          const next = { ...current }
                          if (next[group.directory]) {
                            delete next[group.directory]
                          } else {
                            next[group.directory] = true
                          }
                          return next
                        })
                      }
                    >
                      {expanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                  {isDragOver && dragOverPosition === "after" ? (
                    <div className="h-0.5 rounded-full bg-surface-interactive-base/70 mx-2 mt-1" />
                  ) : null}
                </section>
              )
            })}
          </div>
        </div>
      )}

      <footer className="border-t border-border-base/40 px-3 py-2">
        {props.footer !== undefined ? (
          props.footer
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
            onClick={props.onOpenSettings}
          >
            <SettingsIcon className="size-3.5" />
            Settings
          </Button>
        )}
      </footer>

      <Dialog
        open={!!archiveState}
        onOpenChange={(open) => {
          if (!open && !archiveSaving) setArchiveState(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive thread?</DialogTitle>
            <DialogDescription>
              {archiveState
                ? `Archive "${archiveState.title}" and remove it from the active thread list?`
                : "Archive this thread and remove it from the active thread list?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveState(undefined)}
              disabled={archiveSaving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitArchive()}
              disabled={archiveSaving}
            >
              {archiveSaving ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameState}
        onOpenChange={(open) => {
          if (!open) setRenameState(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>Use a short, meaningful title.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameState?.title ?? ""}
            onChange={(event) =>
              setRenameState((current) =>
                current
                  ? {
                      ...current,
                      title: event.target.value,
                    }
                  : current,
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void submitRename()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameState(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={renameSaving || !renameState?.title.trim()}
              onClick={() => void submitRename()}
            >
              {renameSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
