import { realpathSync } from "node:fs"
import { resolve } from "node:path"

const CAPTURE_LIMIT = 512
const CAPTURE_STORE_KEY = "__buddySystemPromptCaptureStore__"

type CaptureStore = {
  bySession: Map<string, string>
  bySessionID: Map<string, string>
}

function captureStore(): CaptureStore {
  const globalStore = globalThis as typeof globalThis & {
    [CAPTURE_STORE_KEY]?: CaptureStore
  }
  if (!globalStore[CAPTURE_STORE_KEY]) {
    globalStore[CAPTURE_STORE_KEY] = {
      bySession: new Map<string, string>(),
      bySessionID: new Map<string, string>(),
    }
  }
  return globalStore[CAPTURE_STORE_KEY]
}

function normalizeDirectory(directory: string) {
  try {
    return realpathSync.native(directory)
  } catch {
    return resolve(directory)
  }
}

function key(directory: string, sessionID: string) {
  return `${normalizeDirectory(directory)}::${sessionID}`
}

function touch(key: string, value: string) {
  const store = captureStore()
  store.bySession.delete(key)
  store.bySession.set(key, value)
}

function touchSessionID(sessionID: string, value: string) {
  const store = captureStore()
  store.bySessionID.delete(sessionID)
  store.bySessionID.set(sessionID, value)
}

function pruneIfNeeded() {
  const store = captureStore()
  while (store.bySession.size > CAPTURE_LIMIT) {
    const oldest = store.bySession.keys().next().value as string | undefined
    if (!oldest) return
    store.bySession.delete(oldest)
  }

  while (store.bySessionID.size > CAPTURE_LIMIT) {
    const oldest = store.bySessionID.keys().next().value as string | undefined
    if (!oldest) return
    store.bySessionID.delete(oldest)
  }
}

export async function captureSessionSystemPrompt(input: {
  directory: string
  sessionID: string
  fullSystemPrompt: string
}) {
  const prompt = input.fullSystemPrompt.trim()
  if (!prompt) return
  const normalizedDirectory = normalizeDirectory(input.directory)
  touch(key(input.directory, input.sessionID), prompt)
  touchSessionID(input.sessionID, prompt)
  pruneIfNeeded()
  touch(key(normalizedDirectory, input.sessionID), prompt)
}

export async function readCapturedSessionSystemPrompt(input: {
  directory: string
  sessionID: string
}) {
  const entryKey = key(input.directory, input.sessionID)
  const store = captureStore()
  const value = store.bySession.get(entryKey)
  if (value) {
    touch(entryKey, value)
    touchSessionID(input.sessionID, value)
    return value
  }

  const sessionValue = store.bySessionID.get(input.sessionID)
  if (sessionValue) {
    touch(entryKey, sessionValue)
    touchSessionID(input.sessionID, sessionValue)
    return sessionValue
  }
  return undefined
}
