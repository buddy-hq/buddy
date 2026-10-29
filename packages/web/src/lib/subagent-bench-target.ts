import type { BenchSessionTarget } from "@/lib/bench-navigation"
import type { SessionInfo } from "@/state/chat-types"

export type SubagentBenchSelection = {
  ownerSessionID: string
  target: BenchSessionTarget
}

type OpenOwnedSubagentBenchInput = {
  directory: string
  sessionID: string
  sessions: readonly Pick<SessionInfo, "id" | "parentID">[]
  activeDirectory: string
  activeSessionID: string | undefined
  selectSession: (directory: string, sessionID: string) => Promise<boolean>
  openSubagentBench: (directory: string, sessionID: string) => Promise<boolean>
  loadSession?: (directory: string, sessionID: string) => Promise<Pick<SessionInfo, "id" | "parentID">>
}

export function subagentBenchSelection(
  sessions: readonly Pick<SessionInfo, "id" | "parentID">[],
  sessionID: string,
): SubagentBenchSelection | undefined {
  const session = sessions.find((candidate) => candidate.id === sessionID)
  if (!session?.parentID) return undefined

  const sessionsByID = new Map(sessions.map((candidate) => [candidate.id, candidate]))
  const visited = new Set([sessionID])
  let ownerSessionID = session.parentID

  while (true) {
    if (visited.has(ownerSessionID)) return undefined
    visited.add(ownerSessionID)
    const parent = sessionsByID.get(ownerSessionID)
    if (!parent) return undefined
    if (!parent.parentID) break
    ownerSessionID = parent.parentID
  }

  return {
    ownerSessionID,
    target: { type: "session", sessionID },
  }
}

/** Returns `undefined` when the selected session is a root chat rather than a subagent. */
export async function openOwnedSubagentBench(
  input: OpenOwnedSubagentBenchInput,
): Promise<boolean | undefined> {
  const sessions = new Map(input.sessions.map((session) => [session.id, session]))
  let sessionID: string | undefined = input.sessionID
  const visited = new Set<string>()
  while (sessionID) {
    if (visited.has(sessionID)) return false
    visited.add(sessionID)
    let session = sessions.get(sessionID)
    if (!session && input.loadSession) {
      try {
        session = await input.loadSession(input.directory, sessionID)
        if (session.id !== sessionID) return false
        sessions.set(session.id, session)
      } catch { return false }
    }
    if (!session) return sessionID === input.sessionID ? undefined : false
    sessionID = session.parentID
  }
  const selection = subagentBenchSelection([...sessions.values()], input.sessionID)
  if (!selection) return sessions.get(input.sessionID)?.parentID ? false : undefined

  const ownerAlreadyActive =
    input.directory === input.activeDirectory && input.activeSessionID === selection.ownerSessionID
  if (!ownerAlreadyActive) {
    const selected = await input.selectSession(input.directory, selection.ownerSessionID)
    if (!selected) return false
  }

  return input.openSubagentBench(input.directory, selection.target.sessionID)
}
