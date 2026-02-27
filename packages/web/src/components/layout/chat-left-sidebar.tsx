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
  DropdownMenuTrigger,
  Input,
} from "@buddy/ui"
import type { SessionInfo } from "@/state/chat-types"
import { getFilename } from "./sidebar-helpers"
import {
  ArchiveIcon,
  BookOpenIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
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
  onNewSession: () => void
  onSelectSession: (directory: string, sessionID?: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onArchiveSession: (directory: string, sessionID: string) => Promise<void>
  onRenameSession: (directory: string, sessionID: string, title: string) => Promise<void>
  onOpenCurriculum: () => void
  onOpenSettings: () => void
  className?: string
  style?: CSSProperties
}

type RenameState = {
  directory: string
  sessionID: string
  title: string
}

export function ChatLeftSidebar(props: ChatLeftSidebarProps) {
  const [renameState, setRenameState] = useState<RenameState | undefined>(undefined)
  const [renameSaving, setRenameSaving] = useState(false)
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, true>>({})
  const [collapsedDirectories, setCollapsedDirectories] = useState<Record<string, true>>({})
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
    return props.directories
      .map((directory) => {
        const sessions = props.sessionsByDirectory[directory] ?? []
        const pinnedSet = new Set(props.pinnedByDirectory[directory] ?? [])

        const pinned: SessionInfo[] = []
        const rest: SessionInfo[] = []

        for (const session of sessions) {
          if (pinnedSet.has(session.id)) {
            pinned.push(session)
            continue
          }
          rest.push(session)
        }

        return {
          directory,
          sessions: [...pinned, ...rest],
        }
      })
      .filter((group) => group.directory === props.currentDirectory || group.sessions.length > 0)
  }, [props.directories, props.sessionsByDirectory, props.pinnedByDirectory])

  return (
    <aside
      className={`shrink-0 border-r border-border/60 bg-[#0b0b0d] text-foreground flex flex-col min-h-0 ${
        props.className ?? ""
      }`}
      style={props.style}
    >
      <header className="px-3 pt-3 pb-2 space-y-1.5">
        <Button variant="ghost" size="sm" className="w-full justify-start h-9" onClick={props.onNewSession}>
          <PlusIcon className="size-3.5 mr-2" />
          New thread
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start h-9" onClick={props.onOpenCurriculum}>
          <BookOpenIcon className="size-3.5 mr-2" />
          Curriculum
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        <div className="mb-2 flex items-center justify-between px-1 text-muted-foreground">
          <p className="text-[13px] font-medium">Threads</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={props.onOpenDirectory} title="Open notebook">
              <FolderIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {directoryGroups.map((group) => {
            const isCurrentDirectory = group.directory === props.currentDirectory
            const unreadMap = props.unreadByDirectory[group.directory] ?? {}
            const pinnedSet = new Set(props.pinnedByDirectory[group.directory] ?? [])
            const sessionStatusByID = props.sessionStatusByDirectory[group.directory] ?? {}
            const expanded = !!expandedDirectories[group.directory]
            const collapsed = !!collapsedDirectories[group.directory]
            const visibleSessions = expanded ? group.sessions : group.sessions.slice(0, COLLAPSED_COUNT)
            const hasMore = group.sessions.length > COLLAPSED_COUNT

            return (
              <section key={group.directory} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    className={`truncate text-left text-sm ${
                      isCurrentDirectory ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                    onClick={() => {
                      if (isCurrentDirectory) {
                        setCollapsedDirectories((current) => {
                          const next = { ...current }
                          if (next[group.directory]) {
                            delete next[group.directory]
                          } else {
                            next[group.directory] = true
                          }
                          return next
                        })
                        return
                      }

                      setCollapsedDirectories((current) => {
                        if (!current[group.directory]) return current
                        const next = { ...current }
                        delete next[group.directory]
                        return next
                      })
                      props.onSelectSession(group.directory, group.sessions[0]?.id)
                    }}
                    onDoubleClick={() => {
                      if (!isCurrentDirectory) return
                      props.onSelectSession(group.directory)
                      setCollapsedDirectories((current) => {
                        const next = { ...current }
                        delete next[group.directory]
                        return next
                      })
                    }}
                  >
                    {getFilename(group.directory)}
                  </button>
                </div>

                {group.sessions.length === 0
                  ? (
                      <p className="pl-8 text-sm text-muted-foreground/70">No threads</p>
                    )
                  : collapsed
                    ? null
                    : visibleSessions.map((session) => {
                        const active =
                          group.directory === props.currentDirectory && session.id === props.activeSessionID
                        const busy = sessionStatusByID[session.id] === "busy"
                        const pinned = pinnedSet.has(session.id)
                        const unread = !!unreadMap[session.id]

                        return (
                          <div
                            key={`${group.directory}:${session.id}`}
                            className={`group/thread relative ml-6 rounded-xl ${
                              active ? "bg-[#1a1c21]" : "hover:bg-[#13161b]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => props.onSelectSession(group.directory, session.id)}
                              className="w-full px-3 py-2 text-left"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-8">
                                <span
                                  className={`inline-block size-1.5 rounded-full shrink-0 ${
                                    busy ? "bg-amber-500" : unread ? "bg-sky-500" : "bg-emerald-500"
                                  }`}
                                />
                                <span className="text-sm truncate">{session.title || "New thread"}</span>
                                {pinned ? <PinIcon className="size-3 shrink-0 text-muted-foreground" /> : null}
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
                      })}

                {hasMore ? (
                  <button
                    type="button"
                    className="ml-8 text-sm text-muted-foreground hover:text-foreground"
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

      <footer className="border-t border-border/50 px-3 py-2 space-y-1">
        <Button variant="ghost" size="sm" className="w-full justify-start h-9" onClick={props.onOpenSettings}>
          <SettingsIcon className="size-3.5 mr-2" />
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
