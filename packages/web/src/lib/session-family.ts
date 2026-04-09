import type { SessionInfo } from "@/state/chat-types"

export type SessionFamily = {
  current?: SessionInfo
  root?: SessionInfo
  family: SessionInfo[]
}

export type ParsedSubagentSession = {
  title?: string
  agent?: string
}

const SUBAGENT_TITLE_PATTERN = /\s+\(@([^()]+?) subagent\)$/u

export function getSessionFamily(sessions: SessionInfo[], activeSessionID?: string): SessionFamily {
  const current = activeSessionID
    ? sessions.find((session) => session.id === activeSessionID)
    : undefined
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
    .toSorted((left, right) => {
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

export function findRootSessionID(
  sessions: Pick<SessionInfo, "id" | "parentID">[],
  activeSessionID?: string,
) {
  if (!activeSessionID) return undefined

  const byID = new Map(sessions.map((session) => [session.id, session]))
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

export function sessionFamilyIDs(sessions: Pick<SessionInfo, "id" | "parentID">[], rootID: string) {
  const childrenByParent = buildSessionChildrenByParent(sessions)
  return collectSessionFamilyIDs(childrenByParent, rootID)
}

export function collectSessionFamilyIDs(childrenByParent: Map<string, string[]>, rootID: string) {
  const family = new Set<string>([rootID])
  const queue = [rootID]

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) continue

    const children = childrenByParent.get(current) ?? []
    for (const childID of children) {
      if (family.has(childID)) continue
      family.add(childID)
      queue.push(childID)
    }
  }

  return Array.from(family)
}

export function buildSessionChildrenByParent(sessions: Pick<SessionInfo, "id" | "parentID">[]) {
  const childrenByParent = new Map<string, string[]>()

  for (const session of sessions) {
    if (!session.parentID) continue

    const existing = childrenByParent.get(session.parentID)
    if (existing) {
      existing.push(session.id)
      continue
    }

    childrenByParent.set(session.parentID, [session.id])
  }

  return childrenByParent
}

export function parseSubagentSession(session: Pick<SessionInfo, "title">): ParsedSubagentSession {
  const title = session.title?.trim()
  if (!title) return {}

  const match = title.match(SUBAGENT_TITLE_PATTERN)
  if (!match) {
    return {
      title,
    }
  }

  const agent = match[1]?.trim()
  const cleanedTitle = title.replace(SUBAGENT_TITLE_PATTERN, "").trim()

  return {
    title: cleanedTitle || title,
    agent: agent || undefined,
  }
}
