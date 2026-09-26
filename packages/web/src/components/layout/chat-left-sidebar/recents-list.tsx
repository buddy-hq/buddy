import { language } from "@/context/language"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { DirectoryThreadRow, SIDEBAR_COLLAPSED_CHAT_COUNT } from "./directory-list"
import { SIDEBAR_ROW_PADDING_LEFT_PX } from "./row-geometry"
import { buildSessionChildrenByParent } from "./thread-helpers"

type ChatLeftSidebarRecentsListProps = {
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

type TRecentDirectoryContext = {
  childrenByParent: Map<string, string[]>
  sessionsByID: Map<string, SessionInfo>
  pinnedSet: Set<string>
  unreadMap: Record<string, true>
  sessionStatusByID: Record<string, SessionStatusInfo>
}

type TRecentEntry = {
  directory: string
  session: SessionInfo
  context: TRecentDirectoryContext
}

function getSortTimestamp(session: SessionInfo) {
  return session.time.updated ?? session.time.created
}

/** The most recently updated root chats across notebooks. Pinned chats already have their own section. */
function collectRecentEntries(props: ChatLeftSidebarRecentsListProps): TRecentEntry[] {
  const candidates: Array<{ directory: string; session: SessionInfo }> = []

  for (const directory of props.directories) {
    const pinnedSet = new Set(props.pinnedByDirectory[directory] ?? [])
    for (const session of props.sessionsByDirectory[directory] ?? []) {
      if (session.parentID || pinnedSet.has(session.id)) continue
      candidates.push({ directory, session })
    }
  }

  const contexts = new Map<string, TRecentDirectoryContext>()

  return candidates
    .toSorted((a, b) => getSortTimestamp(b.session) - getSortTimestamp(a.session))
    .slice(0, SIDEBAR_COLLAPSED_CHAT_COUNT)
    .map(({ directory, session }) => {
      const existing = contexts.get(directory)
      if (existing) return { directory, session, context: existing }

      const allSessions = props.sessionsByDirectory[directory] ?? []
      const context: TRecentDirectoryContext = {
        childrenByParent: buildSessionChildrenByParent(allSessions),
        sessionsByID: new Map(allSessions.map((entry) => [entry.id, entry])),
        pinnedSet: new Set(props.pinnedByDirectory[directory] ?? []),
        unreadMap: props.unreadByDirectory[directory] ?? {},
        sessionStatusByID: props.sessionStatusByDirectory[directory] ?? {},
      }
      contexts.set(directory, context)
      return { directory, session, context }
    })
}

export function ChatLeftSidebarRecentsList(props: ChatLeftSidebarRecentsListProps) {
  const entries = collectRecentEntries(props)

  if (entries.length === 0) return null

  return (
    <section data-component="left-sidebar-recents-list" className="mb-2 space-y-0.5 px-1.5">
      <p
        className="pt-1 pb-1 text-[13px] font-normal tracking-wide text-icon-base"
        style={{ paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px` }}
      >
        {language.t("sidebar.recents")}
      </p>
      <div className="flex flex-col space-y-0.5">
        {entries.map((entry) => (
          <DirectoryThreadRow
            key={`recent:${entry.directory}:${entry.session.id}`}
            directory={entry.directory}
            currentDirectory={props.currentDirectory}
            session={entry.session}
            activeSessionID={props.activeSessionID}
            childrenByParent={entry.context.childrenByParent}
            sessionsByID={entry.context.sessionsByID}
            sessionStatusByID={entry.context.sessionStatusByID}
            pinnedSet={entry.context.pinnedSet}
            unreadMap={entry.context.unreadMap}
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
        ))}
      </div>
    </section>
  )
}
