import { getPlatform } from "@/context/platform"
import { parseTJsonObject, parseTJsonText, parseTString } from "@/components/chat/tools/types"

const DIAGNOSTIC_LOG_STORAGE_FILE = "buddy.diagnostic-log.v1.dat"
const DIAGNOSTIC_LOG_ENABLED_KEY_PREFIX = "buddy.diagnostic-log.enabled."
const DIAGNOSTIC_LOG_CONSOLE_KEY = "buddy.diagnostic-log.console"
const DIAGNOSTIC_LOG_MAX_CHARS = 512_000

type TFlushableStorage = {
  flush: () => Promise<void> | void
}

const CALLABLE_TAGS = new Set([
  "[object Function]",
  "[object AsyncFunction]",
  "[object GeneratorFunction]",
])

let diagnosticSequence = 0
let writeChain: Promise<void> = Promise.resolve()

function isCallable<TValue>(value: TValue): boolean {
  return CALLABLE_TAGS.has(Object.prototype.toString.call(value))
}

function hasDomLocalStorage(): boolean {
  try {
    return globalThis.localStorage !== undefined
  } catch {
    return false
  }
}

function hasFlush<TStorage>(storage: TStorage): storage is TStorage & TFlushableStorage {
  if (storage === null || storage === undefined) return false
  const candidate = Object(storage)
  if (!("flush" in candidate)) return false
  return isCallable(candidate.flush)
}

function stringifyIfBigInt<TValue>(value: TValue): string | undefined {
  try {
    if (Object.getPrototypeOf(value) !== BigInt.prototype) return undefined
    return `${value}`
  } catch {
    return undefined
  }
}

function stringifyIfSymbol<TValue>(value: TValue): string | undefined {
  try {
    if (Object.getPrototypeOf(value) !== Symbol.prototype) return undefined
    return `${value}`
  } catch {
    return undefined
  }
}

function normalizeDiagnosticValue<TValue>(key: string, value: TValue) {
  if (key === "pngBase64") {
    const text = parseTString(value)
    if (text !== undefined) return `[redacted ${text.length} characters]`
  }
  const bigintText = stringifyIfBigInt(value)
  if (bigintText !== undefined) return bigintText
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (isCallable(value)) return "[function]"
  const symbolText = stringifyIfSymbol(value)
  if (symbolText !== undefined) return symbolText
  return value
}

function stringifyDiagnosticEntry<TValue>(value: TValue): string {
  try {
    return JSON.stringify(value, normalizeDiagnosticValue)
  } catch (error) {
    return JSON.stringify({
      stringifyError: error instanceof Error ? error.message : `${error}`,
    })
  }
}

function normalizedDiagnosticDetailsFromEntry(entry: string) {
  const parsed = parseTJsonText(entry)
  const record = parseTJsonObject(parsed)
  const details = record ? parseTJsonObject(record.details) : undefined
  if (details) return details
  return { diagnosticEntry: parsed === undefined ? entry : parsed }
}

function trimLog(raw: string): string {
  if (raw.length <= DIAGNOSTIC_LOG_MAX_CHARS) return raw
  const trimmed = raw.slice(raw.length - DIAGNOSTIC_LOG_MAX_CHARS)
  const firstNewline = trimmed.indexOf("\n")
  return firstNewline === -1 ? trimmed : trimmed.slice(firstNewline + 1)
}

function shouldEchoDiagnosticsToConsole(): boolean {
  if (!hasDomLocalStorage()) return false
  return localStorage.getItem(DIAGNOSTIC_LOG_CONSOLE_KEY) === "true"
}

export function isDiagnosticLogEnabled(channel: string): boolean {
  if (!hasDomLocalStorage()) return false
  return localStorage.getItem(`${DIAGNOSTIC_LOG_ENABLED_KEY_PREFIX}${channel}`) === "true"
}

export function setDiagnosticLogEnabled(channel: string, enabled: boolean): void {
  if (!hasDomLocalStorage()) return
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
    return parseTString(value) ?? ""
  }

  if (!hasDomLocalStorage()) return ""
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

  if (!hasDomLocalStorage()) return
  localStorage.setItem(channel, value)
}

export function diagnosticLog<TDetails>(input: {
  channel: string
  event: string
  details?: TDetails
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
    console.info(
      `[diagnostic:${input.channel}] ${input.event}`,
      normalizedDiagnosticDetailsFromEntry(entry),
    )
  }

  writeChain = writeChain
    .then(async () => {
      const current = await readCurrentLog(input.channel)
      const next = trimLog(current ? `${current}\n${entry}` : entry)
      await writeCurrentLog(input.channel, next)
    })
    .catch((error) => {
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
    .catch((error) => {
      if (shouldEchoDiagnosticsToConsole()) {
        console.warn(`[diagnostic:${channel}] clear failed`, error)
      }
    })
  return writeChain
}
