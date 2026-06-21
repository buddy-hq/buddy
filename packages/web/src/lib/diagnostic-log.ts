import { getPlatform } from "@/context/platform"

const DIAGNOSTIC_LOG_STORAGE_FILE = "buddy.diagnostic-log.v1.dat"
const DIAGNOSTIC_LOG_ENABLED_KEY_PREFIX = "buddy.diagnostic-log.enabled."
const DIAGNOSTIC_LOG_CONSOLE_KEY = "buddy.diagnostic-log.console"
const DIAGNOSTIC_LOG_MAX_CHARS = 512_000

type DiagnosticDetails = Record<string, unknown>

type FlushableStorage = {
  flush: () => Promise<void> | void
}

let diagnosticSequence = 0
let writeChain: Promise<void> = Promise.resolve()

function hasFlush(storage: unknown): storage is FlushableStorage {
  return (
    typeof storage === "object" &&
    storage !== null &&
    "flush" in storage &&
    typeof storage.flush === "function"
  )
}

function normalizeDiagnosticValue(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (typeof value === "function") return "[function]"
  if (typeof value === "symbol") return value.toString()
  return value
}

function stringifyDiagnosticEntry(value: unknown): string {
  try {
    return JSON.stringify(value, normalizeDiagnosticValue)
  } catch (error) {
    return JSON.stringify({
      stringifyError: error instanceof Error ? error.message : String(error),
    })
  }
}

function trimLog(raw: string): string {
  if (raw.length <= DIAGNOSTIC_LOG_MAX_CHARS) return raw
  const trimmed = raw.slice(raw.length - DIAGNOSTIC_LOG_MAX_CHARS)
  const firstNewline = trimmed.indexOf("\n")
  return firstNewline === -1 ? trimmed : trimmed.slice(firstNewline + 1)
}

function shouldEchoDiagnosticsToConsole(): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(DIAGNOSTIC_LOG_CONSOLE_KEY) === "true"
}

export function isDiagnosticLogEnabled(channel: string): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(`${DIAGNOSTIC_LOG_ENABLED_KEY_PREFIX}${channel}`) === "true"
}

export function setDiagnosticLogEnabled(channel: string, enabled: boolean): void {
  if (typeof localStorage === "undefined") return
  const key = `${DIAGNOSTIC_LOG_ENABLED_KEY_PREFIX}${channel}`
  if (enabled) {
    localStorage.setItem(key, "true")
    return
  }
  localStorage.removeItem(key)
}

async function readCurrentLog(channel: string): Promise<string> {
  const platformStorage = getPlatform().storage?.(DIAGNOSTIC_LOG_STORAGE_FILE)
  if (platformStorage) {
    const value = await platformStorage.getItem(channel)
    return typeof value === "string" ? value : ""
  }

  if (typeof localStorage === "undefined") return ""
  return localStorage.getItem(channel) ?? ""
}

async function writeCurrentLog(channel: string, value: string): Promise<void> {
  const platformStorage = getPlatform().storage?.(DIAGNOSTIC_LOG_STORAGE_FILE)
  if (platformStorage) {
    await platformStorage.setItem(channel, value)
    if (hasFlush(platformStorage)) {
      await platformStorage.flush()
    }
    return
  }

  if (typeof localStorage === "undefined") return
  localStorage.setItem(channel, value)
}

export function diagnosticLog(input: {
  channel: string
  event: string
  details?: DiagnosticDetails
}): void {
  if (!isDiagnosticLogEnabled(input.channel)) return

  diagnosticSequence += 1
  const entry = stringifyDiagnosticEntry({
    ts: new Date().toISOString(),
    sequence: diagnosticSequence,
    channel: input.channel,
    event: input.event,
    details: input.details ?? {},
  })

  if (shouldEchoDiagnosticsToConsole()) {
    console.info(`[diagnostic:${input.channel}] ${input.event}`, input.details ?? {})
  }

  writeChain = writeChain
    .then(async () => {
      const current = await readCurrentLog(input.channel)
      const next = trimLog(current ? `${current}\n${entry}` : entry)
      await writeCurrentLog(input.channel, next)
    })
    .catch((error: unknown) => {
      if (shouldEchoDiagnosticsToConsole()) {
        console.warn(`[diagnostic:${input.channel}] write failed`, error)
      }
    })
}

export function clearDiagnosticLog(channel: string): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      await writeCurrentLog(channel, "")
    })
    .catch((error: unknown) => {
      if (shouldEchoDiagnosticsToConsole()) {
        console.warn(`[diagnostic:${channel}] clear failed`, error)
      }
    })
  return writeChain
}
