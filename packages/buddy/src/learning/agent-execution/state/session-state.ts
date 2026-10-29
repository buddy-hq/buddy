import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import type { TeachingSessionState } from "../../shared/teaching-session-state"

const RUNTIME_STATE_LIMIT = 512
type RuntimeStateEntry = {
  directory: string
  state: TeachingSessionState
}

const runtimeState = new Map<string, RuntimeStateEntry>()
const compactionCounts = new Map<string, number>()

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

function evictOldestEntriesIfNeeded<T>(entries: Map<string, T>) {
  while (entries.size > RUNTIME_STATE_LIMIT) {
    const oldest = entries.keys().next()
    if (oldest.done) return
    entries.delete(oldest.value)
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
  evictOldestEntriesIfNeeded(runtimeState)
}

export function listTeachingSessionStateEntries(): RuntimeStateEntry[] {
  return [...runtimeState.values()]
}

export function teachingSessionCompactionCount(sessionId: string): number {
  const count = compactionCounts.get(sessionId)
  if (count === undefined) return 0
  compactionCounts.delete(sessionId)
  compactionCounts.set(sessionId, count)
  return count
}

export function recordTeachingSessionCompaction(sessionId: string) {
  const count = teachingSessionCompactionCount(sessionId)
  compactionCounts.set(sessionId, count + 1)
  evictOldestEntriesIfNeeded(compactionCounts)
}

export function withoutTeachingContextDelivery(state: TeachingSessionState): TeachingSessionState {
  return {
    ...state,
    lastDeliveredTeachingTurnContextDigest: undefined,
    lastDeliveredReadingTurnContextDigest: undefined,
    lastDeliveredBenchTurnContextDigest: undefined,
    lastDeliveredLearnerContextDigest: undefined,
    lastDeliveredLearnerContextItems: undefined,
    lastDeliveredLearnerContextMessageId: undefined,
  }
}

export function deleteTeachingSessionState(directory: string, sessionId: string) {
  runtimeState.delete(sessionKey(directory, sessionId))
}

export function clearAllTeachingSessionState() {
  runtimeState.clear()
  compactionCounts.clear()
}
