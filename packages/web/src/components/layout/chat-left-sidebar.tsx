import type { CSSProperties } from "react"
import { useMemo, useState } from "react"
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
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  PinIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
  SettingsIcon,
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
  onOpenCurriculum: () => void
  onOpenSkills: () => void
  onOpenSettings: () => void
  activeFooterItem?: "skills" | "settings"
  className?: string
  style?: CSSProperties
}

type RenameState = {
  directory: string
  sessionID: string
  title: string
}

type OrganizeMode = "project" | "chronological"
type SortMode = "created" | "updated"
type ShowMode = "all" | "relevant"

function formatThreadAge(timestamp: number) {
  const elapsed = Date.now() - timestamp

  if (elapsed < 60_000) return "now"
  if (elapsed < 3_600_000) return `${Math.round(elapsed / 60_000)}m`
  if (elapsed < 86_400_000) return `${Math.round(elapsed / 3_600_000)}h`
  if (elapsed < 2_592_000_000) return `${Math.round(elapsed / 86_400_000)}d`
  return `${Math.round(elapsed / 2_592_000_000)}mo`
}

function sessionFamilyIDs(allSessions: SessionInfo[], rootID: string) {
  const family = new Set<string>([rootID])
  let expanded = true

  while (expanded) {
    expanded = false
    for (const session of allSessions) {
      if (!session.parentID) continue
      if (!family.has(session.parentID)) continue
      if (family.has(session.id)) continue
      family.add(session.id)
      expanded = true
    }
  }

  return Array.from(family)
}

function findRootSessionID(allSessions: SessionInfo[], activeSessionID?: string) {
  if (!activeSessionID) return undefined

  const byID = new Map(allSessions.map((session) => [session.id, session]))
  let current = byID.get(activeSessionID)
  const visited = new Set<string>()

  while (current?.parentID) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    const parent = byID.get(current.parentID)
    if (!parent) break
    current = parent
  }

  return current?.id
}

export function ChatLeftSidebar(props: ChatLeftSidebarProps) {
  const [renameState, setRenameState] = useState<RenameState | undefined>(undefined)
  const [renameSaving, setRenameSaving] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, true>>({})
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, true>>({})
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>("project")
  const [sortMode, setSortMode] = useState<SortMode>("updated")
  const [showMode, setShowMode] = useState<ShowMode>("all")
  const COLLAPSED_COUNT = 9

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

  const directoryGroups = useMemo(() => {
    const getSortTimestamp = (session: SessionInfo) =>
      sortMode === "created" ? session.time.created : (session.time.updated ?? session.time.created)

    const isRelevantSession = (directory: string, session: SessionInfo) => {
      const allSessions = props.sessionsByDirectory[directory] ?? []
      const familyIDs = sessionFamilyIDs(allSessions, session.id)
      const unreadMap = props.unreadByDirectory[directory] ?? {}
      const pinnedIDs = new Set(props.pinnedByDirectory[directory] ?? [])
      const statusByID = props.sessionStatusByDirectory[directory] ?? {}
      const activeRootID = findRootSessionID(allSessions, props.activeSessionID)
      const unread = familyIDs.some((id) => !!unreadMap[id])
      const pinned = familyIDs.some((id) => pinnedIDs.has(id))
      const busy = familyIDs.some((id) => statusByID[id] === "busy")
      const active = directory === props.currentDirectory && session.id === activeRootID
      return unread || pinned || busy || active
    }

    const groups = props.directories
      .map((directory) => {
        const sessions = (props.sessionsByDirectory[directory] ?? []).filter((session) => !session.parentID)
        const pinnedSet = new Set(props.pinnedByDirectory[directory] ?? [])
        const visibleSessions = sessions
          .filter((session) => (showMode === "relevant" ? isRelevantSession(directory, session) : true))
          .sort((a, b) => {
            const aPinned = pinnedSet.has(a.id)
            const bPinned = pinnedSet.has(b.id)
            if (aPinned !== bPinned) {
              return aPinned ? -1 : 1
            }
            return getSortTimestamp(b) - getSortTimestamp(a)
          })

        return {
          directory,
          sessions: visibleSessions,
        }
      })
      .filter((group) => group.sessions.length > 0 || showMode === "all")

    if (organizeMode === "chronological") {
      return groups.sort((a, b) => {
        const aTime = a.sessions[0] ? getSortTimestamp(a.sessions[0]) : 0
        const bTime = b.sessions[0] ? getSortTimestamp(b.sessions[0]) : 0
        return bTime - aTime
      })
    }

    return groups
  }, [
    props.directories,
    props.sessionsByDirectory,
    props.pinnedByDirectory,
    props.unreadByDirectory,
    props.sessionStatusByDirectory,
    props.currentDirectory,
    props.activeSessionID,
    organizeMode,
    showMode,
    sortMode,
  ])

  return (
    <aside
      className={`shrink-0 border-r border-border/60 bg-[#0b0b0d] text-foreground flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
      style={props.style}
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-3">
        <div className="mb-2 flex items-center justify-between px-1 text-muted-foreground">
          <p className="text-[13px] font-medium">Threads</p>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:bg-[#151821] hover:text-foreground"
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
                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#1a1d24] hover:text-foreground"
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
                  <DropdownMenuRadioItem value="chronological">Chronological list</DropdownMenuRadioItem>
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
            const visibleSessions = expanded ? group.sessions : group.sessions.slice(0, COLLAPSED_COUNT)
            const hasMore = group.sessions.length > COLLAPSED_COUNT

            return (
              <section key={group.directory} className="space-y-1">
                <div
                  className={`group/directory flex items-center gap-1 rounded-xl px-1 py-0.5 ${
                    isCurrentDirectory ? "bg-[#111318]" : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-sm ${
                      isCurrentDirectory ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
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
                      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={`truncate ${isCurrentDirectory ? "font-medium" : ""}`}>{directoryLabel}</span>
                  </button>

                  <div className="flex items-center gap-0.5 pr-1 opacity-0 pointer-events-none transition-opacity group-hover/directory:opacity-100 group-hover/directory:pointer-events-auto group-focus-within/directory:opacity-100 group-focus-within/directory:pointer-events-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#1a1d24] hover:text-foreground"
                          aria-label={`Options for ${directoryLabel}`}
                        >
                          <EllipsisHorizontalIcon className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => props.onSelectSession(group.directory)}>
                          <FolderIcon className="size-3.5 mr-2" />
                          Open workspace
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#1a1d24] hover:text-foreground"
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
                  <p className="pl-6 text-sm text-muted-foreground/60">No threads</p>
                ) : collapsed ? null : (
                  visibleSessions.map((session) => {
                    const familyIDs = sessionFamilyIDs(allSessions, session.id)
                    const active = group.directory === props.currentDirectory && session.id === activeRootID
                    const busy = familyIDs.some((id) => sessionStatusByID[id] === "busy")
                    const pinned = familyIDs.some((id) => pinnedSet.has(id))
                    const unread = familyIDs.some((id) => !!unreadMap[id])

                    return (
                      <div
                        key={`${group.directory}:${session.id}`}
                        className={`group/thread relative ml-3 rounded-xl ${
                          active ? "bg-[#121419] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]" : "hover:bg-[#101217]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => props.onSelectSession(group.directory, session.id)}
                          className="w-full px-3 py-2 text-left"
                        >
                          <div className="flex min-w-0 items-center gap-2 pr-8">
                            <span
                              className={`inline-block size-1.5 shrink-0 rounded-full ${
                                busy ? "bg-amber-500" : unread ? "bg-sky-500" : "bg-emerald-500"
                              }`}
                            />
                            <div className="flex min-w-0 items-center gap-1">
                              <span
                                className={`truncate text-xs ${
                                  active || unread ? "font-medium text-foreground" : "text-foreground/90"
                                }`}
                              >
                                {session.title || "New thread"}
                              </span>
                              {pinned ? <PinIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
                            </div>
                            <span
                              className={`ml-auto shrink-0 text-[12px] ${
                                busy ? "text-amber-400" : "text-muted-foreground"
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
                                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
                                  void props.onArchiveSession(group.directory, session.id)
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

                {hasMore ? (
                  <button
                    type="button"
                    className="ml-6 text-sm text-muted-foreground/80 hover:text-foreground"
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
              </section>
            )
          })}
        </div>
      </div>

      <footer className="border-t border-border/40 px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className={`mb-1 h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-foreground hover:bg-[#121419] hover:text-foreground ${
            props.activeFooterItem === "skills" ? "bg-[#121419]" : ""
          }`}
          onClick={props.onOpenSkills}
        >
          <SparklesIcon className="size-3.5" />
          Skills
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 w-full justify-start rounded-lg px-2 text-sm font-medium text-foreground hover:bg-[#121419] hover:text-foreground ${
            props.activeFooterItem === "settings" ? "bg-[#121419]" : ""
          }`}
          onClick={props.onOpenSettings}
        >
          <SettingsIcon className="size-3.5" />
          Settings
        </Button>
      </footer>

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
            <Button disabled={renameSaving || !renameState?.title.trim()} onClick={() => void submitRename()}>
              {renameSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
