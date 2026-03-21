import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TeachingSessionState } from '../../shared/teaching-session-state'

const RUNTIME_STATE_LIMIT = 512
const runtimeState = new Map<string, TeachingSessionState>()

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

function touchStateEntry(key: string, state: TeachingSessionState) {
  runtimeState.delete(key)
  runtimeState.set(key, state)
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
  const state = runtimeState.get(key)
  if (!state) return undefined
  touchStateEntry(key, state)
  return state
}

export function writeTeachingSessionState(directory: string, state: TeachingSessionState) {
  touchStateEntry(sessionKey(directory, state.sessionId), state)
  evictOldestEntriesIfNeeded()
}

export function deleteTeachingSessionState(directory: string, sessionId: string) {
  runtimeState.delete(sessionKey(directory, sessionId))
}
