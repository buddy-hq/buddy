import { language } from "@/context/language"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { DirectoryThreadRow } from "./directory-list"
import { SIDEBAR_ROW_PADDING_LEFT_PX } from "./row-geometry"
import { buildSessionChildrenByParent } from "./thread-helpers"

type ChatLeftSidebarPinnedListProps = {
  directories: string[]
  sessionsByDirectory: Record<string, SessionInfo[]>
  sessionStatusByDirectory: Record<string, Record<string, SessionStatusInfo>>
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  activeSessionID?: string
  currentDirectory: string
  onSelectSession: (directory: string, sessionID: string) => void
  onPrefetchSession?: (directory: string, sessionID: string) => void
  onTogglePin: (directory: string, sessionID: string) => void
  onToggleUnread: (directory: string, sessionID: string, unread: boolean) => void
  onRequestRename: (directory: string, sessionID: string, title: string) => void
  onRequestArchive: (directory: string, sessionID: string, title: string) => void
  onRequestDelete: (directory: string, sessionID: string, title: string) => void
}

/**
 * Everything a pinned row needs from its directory, built once per directory rather
 * than once per row — these were previously rebuilt inside the render loop, which
 * cost O(pinned × sessions) per render and handed a fresh identity to every child.
 */
type PinnedDirectoryContext = {
  childrenByParent: Map<string, string[]>
  sessionsByID: Map<string, SessionInfo>
  pinnedSet: Set<string>
  unreadMap: Record<string, true>
  sessionStatusByID: Record<string, SessionStatusInfo>
}

type PinnedEntry = {
  directory: string
  session: SessionInfo
  context: PinnedDirectoryContext
}

function getSortTimestamp(session: SessionInfo) {
  return session.time.updated ?? session.time.created
}

function collectPinnedEntries(props: ChatLeftSidebarPinnedListProps): PinnedEntry[] {
  const entries: PinnedEntry[] = []

  for (const directory of props.directories) {
    const pinnedIDs = props.pinnedByDirectory[directory] ?? []
    if (pinnedIDs.length === 0) continue

    const allSessions = props.sessionsByDirectory[directory] ?? []
    const context: PinnedDirectoryContext = {
      childrenByParent: buildSessionChildrenByParent(allSessions),
      sessionsByID: new Map(allSessions.map((session) => [session.id, session])),
      pinnedSet: new Set(pinnedIDs),
      unreadMap: props.unreadByDirectory[directory] ?? {},
      sessionStatusByID: props.sessionStatusByDirectory[directory] ?? {},
    }

    for (const sessionID of pinnedIDs) {
      const session = context.sessionsByID.get(sessionID)
      if (session) entries.push({ directory, session, context })
    }
  }

  return entries.toSorted((a, b) => getSortTimestamp(b.session) - getSortTimestamp(a.session))
}

export function ChatLeftSidebarPinnedList(props: ChatLeftSidebarPinnedListProps) {
  const entries = collectPinnedEntries(props)

  if (entries.length === 0) return null

  return (
    <section data-component="left-sidebar-pinned-list" className="mb-2 space-y-0.5 px-1.5">
      <p
        className="pt-1 pb-1 text-[13px] font-normal tracking-wide text-icon-base"
        style={{ paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px` }}
      >
        {language.t("sidebar.pinned")}
      </p>
      <div className="flex flex-col space-y-0.5">
        {entries.map((entry) => {
          return (
            <DirectoryThreadRow
              key={`pinned:${entry.directory}:${entry.session.id}`}
              directory={entry.directory}
              currentDirectory={props.currentDirectory}
              session={entry.session}
              activeSessionID={props.activeSessionID}
              childrenByParent={entry.context.childrenByParent}
              sessionsByID={entry.context.sessionsByID}
              sessionStatusByID={entry.context.sessionStatusByID}
              pinnedSet={entry.context.pinnedSet}
              unreadMap={entry.context.unreadMap}
              hidePinBadge
              onSelectSession={(sessionID) => props.onSelectSession(entry.directory, sessionID)}
              onPrefetchSession={
                props.onPrefetchSession
                  ? (sessionID) => props.onPrefetchSession?.(entry.directory, sessionID)
                  : undefined
              }
              onTogglePin={(sessionID) => props.onTogglePin(entry.directory, sessionID)}
              onToggleUnread={(sessionID, unread) =>
                props.onToggleUnread(entry.directory, sessionID, unread)
              }
              onRequestRename={(sessionID, title) =>
                props.onRequestRename(entry.directory, sessionID, title)
              }
              onRequestArchive={(sessionID, title) =>
                props.onRequestArchive(entry.directory, sessionID, title)
              }
              onRequestDelete={(sessionID, title) =>
                props.onRequestDelete(entry.directory, sessionID, title)
              }
            />
          )
        })}
      </div>
    </section>
  )
}
