import type { SessionInfo } from "@/state/chat-types"

export type SessionFamily = {
  current?: SessionInfo
  root?: SessionInfo
  family: SessionInfo[]
}

export function getSessionFamily(sessions: SessionInfo[], activeSessionID?: string): SessionFamily {
  const current = activeSessionID ? sessions.find((session) => session.id === activeSessionID) : undefined
  if (!current) {
    return {
      current: undefined,
      root: undefined,
      family: [],
    }
  }

  const byID = new Map(sessions.map((session) => [session.id, session]))
  const visited = new Set<string>()
  let root = current

  while (root.parentID) {
    if (visited.has(root.id)) break
    visited.add(root.id)
    const parent = byID.get(root.parentID)
    if (!parent) break
    root = parent
  }

  const rootID = root.id
  const familyIDs = new Set<string>([rootID])
  let expanded = true

  while (expanded) {
    expanded = false
    for (const session of sessions) {
      if (!session.parentID) continue
      if (!familyIDs.has(session.parentID)) continue
      if (familyIDs.has(session.id)) continue
      familyIDs.add(session.id)
      expanded = true
    }
  }

  const depth = (session: SessionInfo) => {
    let count = 0
    let cursor: SessionInfo | undefined = session
    const seen = new Set<string>()

    while (cursor?.parentID && cursor.id !== rootID) {
      if (seen.has(cursor.id)) break
      seen.add(cursor.id)
      const parent = byID.get(cursor.parentID)
      if (!parent) break
      count += 1
      cursor = parent
    }

    return count
  }

  const family = sessions
    .filter((session) => familyIDs.has(session.id))
    .sort((left, right) => {
      const leftRank = depth(left)
      const rightRank = depth(right)
      if (leftRank !== rightRank) return leftRank - rightRank
      return left.time.created - right.time.created
    })

  return {
    current,
    root,
    family,
  }
}
