import { language } from "@/context/language"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { DirectoryThreadRow } from "./directory-list"
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
}

// Flush-left inset for Pinned rows — 8px row padding (text starts at 8px, matching Pinned header px-2) with no indentation.
const PINNED_ROW_PADDING_LEFT_PX = 8

type PinnedEntry = {
  directory: string
  session: SessionInfo
  allSessions: SessionInfo[]
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
    const sessionsByID = new Map(allSessions.map((session) => [session.id, session]))

    for (const sessionID of pinnedIDs) {
      const session = sessionsByID.get(sessionID)
      if (session) entries.push({ directory, session, allSessions })
    }
  }

  return entries.toSorted((a, b) => getSortTimestamp(b.session) - getSortTimestamp(a.session))
}

export function ChatLeftSidebarPinnedList(props: ChatLeftSidebarPinnedListProps) {
  const entries = collectPinnedEntries(props)

  if (entries.length === 0) return null

  return (
    <section data-component="left-sidebar-pinned-list" className="mb-2 space-y-0.5">
      <p className="px-2 pt-1 pb-1 text-[13px] font-normal tracking-wide text-icon-base">
        {language.t("sidebar.pinned")}
      </p>
      <div className="flex flex-col space-y-0.5 px-0">
        {entries.map((entry) => {
          const childrenByParent = buildSessionChildrenByParent(entry.allSessions)
          const sessionsByID = new Map(entry.allSessions.map((session) => [session.id, session]))
          const pinnedSet = new Set(props.pinnedByDirectory[entry.directory] ?? [])
          const unreadMap = props.unreadByDirectory[entry.directory] ?? {}
          const sessionStatusByID = props.sessionStatusByDirectory[entry.directory] ?? {}

          return (
            <DirectoryThreadRow
              key={`pinned:${entry.directory}:${entry.session.id}`}
              directory={entry.directory}
              currentDirectory={props.currentDirectory}
              session={entry.session}
              activeSessionID={props.activeSessionID}
              childrenByParent={childrenByParent}
              sessionsByID={sessionsByID}
              sessionStatusByID={sessionStatusByID}
              pinnedSet={pinnedSet}
              unreadMap={unreadMap}
              hidePinBadge
              basePaddingLeftPx={PINNED_ROW_PADDING_LEFT_PX}
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
            />
          )
        })}
      </div>
    </section>
  )
}
