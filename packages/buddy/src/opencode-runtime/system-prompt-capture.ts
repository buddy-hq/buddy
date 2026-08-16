import { realpathSync } from "node:fs"
import { resolve } from "node:path"

const CAPTURE_LIMIT = 512
const CAPTURE_STORE_KEY = "__buddySystemPromptCaptureStore__"

type TCaptureStore = {
  bySession: Map<string, string>
  bySessionID: Map<string, string>
}

function captureStore(): TCaptureStore {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, CAPTURE_STORE_KEY)
  const raw = descriptor?.value
  if (raw instanceof Object && !Array.isArray(raw) && "bySession" in raw && "bySessionID" in raw) {
    const bySession = raw.bySession
    const bySessionID = raw.bySessionID
    if (bySession instanceof Map && bySessionID instanceof Map) {
      return { bySession, bySessionID }
    }
  }

  const created: TCaptureStore = {
    bySession: new Map<string, string>(),
    bySessionID: new Map<string, string>(),
  }
  Object.defineProperty(globalThis, CAPTURE_STORE_KEY, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: created,
  })
  return created
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
    const oldest = store.bySession.keys().next()
    if (oldest.done) return
    store.bySession.delete(oldest.value)
  }

  while (store.bySessionID.size > CAPTURE_LIMIT) {
    const oldest = store.bySessionID.keys().next()
    if (oldest.done) return
    store.bySessionID.delete(oldest.value)
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
