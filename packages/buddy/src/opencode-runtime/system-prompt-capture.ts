import fs from "node:fs/promises"
import { realpathSync } from "node:fs"
import path, { resolve } from "node:path"

const CAPTURE_LIMIT = 512
const CAPTURE_STORE_KEY = "__buddySystemPromptCaptureStore__"
const CAPTURE_DIRECTORY_NAME = "system-prompts"

type CaptureStore = {
  bySession: Map<string, string>
  bySessionID: Map<string, string>
}

type PromptCaptureRecord = {
  directory: string
  sessionID: string
  fullSystemPrompt: string
  capturedAt: string
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

function resolveStateHome() {
  const configured = process.env.XDG_STATE_HOME?.trim()
  if (configured && configured !== "undefined") {
    return configured
  }

  return path.resolve(process.cwd(), ".buddy-runtime/xdg/state")
}

function captureDirectory() {
  return path.join(resolveStateHome(), CAPTURE_DIRECTORY_NAME)
}

function captureFilePath(sessionID: string) {
  return path.join(captureDirectory(), `${encodeURIComponent(sessionID)}.json`)
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

async function writePromptCaptureRecord(record: PromptCaptureRecord) {
  await fs.mkdir(captureDirectory(), { recursive: true })
  const targetPath = captureFilePath(record.sessionID)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(record)}\n`, "utf8")
  await fs.rename(tempPath, targetPath)
}

async function readPromptCaptureRecord(sessionID: string) {
  const targetPath = captureFilePath(sessionID)
  const raw = await fs.readFile(targetPath, "utf8").catch(() => undefined)
  if (!raw) {
    return undefined
  }

  const parsed = JSON.parse(raw) as Partial<PromptCaptureRecord>
  if (
    typeof parsed.directory !== "string" ||
    typeof parsed.sessionID !== "string" ||
    typeof parsed.fullSystemPrompt !== "string" ||
    typeof parsed.capturedAt !== "string"
  ) {
    return undefined
  }

  return {
    directory: parsed.directory,
    sessionID: parsed.sessionID,
    fullSystemPrompt: parsed.fullSystemPrompt,
    capturedAt: parsed.capturedAt,
  } satisfies PromptCaptureRecord
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
  await writePromptCaptureRecord({
    directory: normalizedDirectory,
    sessionID: input.sessionID,
    fullSystemPrompt: prompt,
    capturedAt: new Date().toISOString(),
  })
}

export async function readCapturedSessionSystemPrompt(input: { directory: string; sessionID: string }) {
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

  const record = await readPromptCaptureRecord(input.sessionID)
  if (!record) {
    return undefined
  }

  const prompt = record.fullSystemPrompt.trim()
  if (!prompt) {
    return undefined
  }

  touch(entryKey, prompt)
  touchSessionID(input.sessionID, prompt)
  return prompt
}
