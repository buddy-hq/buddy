import { useMemo } from "react"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { isSessionWorking } from "@/state/session-status"
import { findRootSessionID, sessionFamilyIDs } from "./thread-helpers"
import type { DirectoryGroup, OrganizeMode, ShowMode, SortMode } from "./types"

type UseDirectoryGroupsProps = {
  directories: string[]
  sessionsByDirectory: Record<string, SessionInfo[]>
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  sessionStatusByDirectory: Record<string, Record<string, SessionStatusInfo>>
  currentDirectory: string
  activeSessionID?: string
  organizeMode: OrganizeMode
  showMode: ShowMode
  sortMode: SortMode
}

function getSortTimestamp(session: SessionInfo, sortMode: "created" | "updated") {
  return sortMode === "created"
    ? session.time.created
    : (session.time.updated ?? session.time.created)
}

export function useDirectoryGroups(props: UseDirectoryGroupsProps): DirectoryGroup[] {
  return useMemo(() => {
    const groups = props.directories
      .map((directory) => {
        const allSessions = props.sessionsByDirectory[directory] ?? []
        const pinnedSet = new Set(props.pinnedByDirectory[directory] ?? [])
        // Pinned root threads surface in the dedicated Pinned section instead, not inside their notebook.
        const sessions = allSessions.filter((session) => !session.parentID && !pinnedSet.has(session.id))
        const sessionsByID = new Map(allSessions.map((session) => [session.id, session]))
        const unreadMap = props.unreadByDirectory[directory] ?? {}
        const statusByID = props.sessionStatusByDirectory[directory] ?? {}
        // Hoist per-directory derived values outside the per-session filter loop.
        const activeRootID = findRootSessionID(allSessions, props.activeSessionID)

        const visibleSessions = sessions
          .filter((session) => {
            if (props.showMode !== "relevant") return true
            const familyIDs = sessionFamilyIDs(allSessions, session.id)
            const unread = familyIDs.some((id) => !!unreadMap[id])
            const pinned = familyIDs.some((id) => pinnedSet.has(id))
            const busy = familyIDs.some((id) =>
              isSessionWorking({
                info: sessionsByID.get(id),
                status: statusByID[id],
              }),
            )
            const active = directory === props.currentDirectory && session.id === activeRootID
            return unread || pinned || busy || active
          })
          .toSorted((a, b) => {
            const aPinned = pinnedSet.has(a.id)
            const bPinned = pinnedSet.has(b.id)
            if (aPinned !== bPinned) {
              return aPinned ? -1 : 1
            }
            return getSortTimestamp(b, props.sortMode) - getSortTimestamp(a, props.sortMode)
          })

        return {
          directory,
          sessions: visibleSessions,
        }
      })
      .filter((group) => group.sessions.length > 0 || props.showMode === "all")

    if (props.organizeMode === "chronological") {
      return groups.toSorted((a, b) => {
        const aTime = a.sessions[0] ? getSortTimestamp(a.sessions[0], props.sortMode) : 0
        const bTime = b.sessions[0] ? getSortTimestamp(b.sessions[0], props.sortMode) : 0
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
    props.organizeMode,
    props.showMode,
    props.sortMode,
  ])
}
