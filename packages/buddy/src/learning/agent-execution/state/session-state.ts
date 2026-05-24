import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import type { TeachingSessionState } from "../../shared/teaching-session-state"

const RUNTIME_STATE_LIMIT = 512
type RuntimeStateEntry = {
  directory: string
  state: TeachingSessionState
}

const runtimeState = new Map<string, RuntimeStateEntry>()

function normalizeDirectory(directory: string) {
  try {
    return realpathSync.native(directory)
  } catch {
    return resolve(directory)
  }
}

function sessionKey(directory: string, sessionId: string) {
  return `${normalizeDirectory(directory)}::${sessionId}`
}

function touchStateEntry(key: string, entry: RuntimeStateEntry) {
  runtimeState.delete(key)
  runtimeState.set(key, entry)
}

function evictOldestEntriesIfNeeded() {
  while (runtimeState.size > RUNTIME_STATE_LIMIT) {
    const oldest = runtimeState.keys().next().value as string | undefined
    if (!oldest) return
    runtimeState.delete(oldest)
  }
}

export function readTeachingSessionState(
  directory: string,
  sessionId: string,
): TeachingSessionState | undefined {
  const key = sessionKey(directory, sessionId)
  const entry = runtimeState.get(key)
  if (!entry) return undefined
  touchStateEntry(key, entry)
  return entry.state
}

export function writeTeachingSessionState(directory: string, state: TeachingSessionState) {
  touchStateEntry(sessionKey(directory, state.sessionId), {
    directory: normalizeDirectory(directory),
    state,
  })
  evictOldestEntriesIfNeeded()
}

export function listTeachingSessionStateEntries(): RuntimeStateEntry[] {
  return [...runtimeState.values()]
}

export function deleteTeachingSessionState(directory: string, sessionId: string) {
  runtimeState.delete(sessionKey(directory, sessionId))
}

export function clearAllTeachingSessionState() {
  runtimeState.clear()
}
