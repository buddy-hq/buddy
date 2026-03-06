import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import type { TeachingSessionState } from "./types.js"

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

function evictOldestIfNeeded() {
  while (runtimeState.size > RUNTIME_STATE_LIMIT) {
    const oldest = runtimeState.keys().next().value as string | undefined
    if (!oldest) return
    runtimeState.delete(oldest)
  }
}

export function readTeachingSessionState(directory: string, sessionId: string): TeachingSessionState | undefined {
  const key = sessionKey(directory, sessionId)
  const state = runtimeState.get(key)
  if (!state) return undefined
  runtimeState.delete(key)
  runtimeState.set(key, state)
  return state
}

export function writeTeachingSessionState(directory: string, state: TeachingSessionState) {
  runtimeState.set(sessionKey(directory, state.sessionId), state)
  evictOldestIfNeeded()
}

export function deleteTeachingSessionState(directory: string, sessionId: string) {
  runtimeState.delete(sessionKey(directory, sessionId))
}
