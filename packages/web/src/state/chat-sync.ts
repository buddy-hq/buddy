import type { GlobalEvent } from "./chat-types"
import { unstable_batchedUpdates } from "react-dom"
import { getBuddyClient } from "../lib/buddy-client"
import { CHAT_STREAM_GLOBAL_DIRECTORY, createChatStreamEventBuffer } from "./chat-stream-event-buffer"

type SyncHandlers = {
  directory?: string
  onOpen?: () => void
  onEvent: (event: GlobalEvent) => void
  onError?: (error: unknown) => void
  onStatus?: (status: "connecting" | "connected" | "error") => void
}

const FRAME_MS = 16
const STREAM_YIELD_MS = 8
const RECONNECT_DELAY_MS = 250
const MAX_RECONNECT_DELAY_MS = 10_000
const RECONNECT_BACKOFF_FACTOR = 2
const HEARTBEAT_TIMEOUT_MS = 15_000
const EVENT_STREAM_ACCEPT = "text/event-stream"
const EVENT_STREAM_CACHE_CONTROL = "no-cache"
const SDK_STREAM_DATA_KEY = "data"
const DOCUMENT_VISIBILITY_VISIBLE = "visible"

type UnknownRecord = Record<string, unknown>

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))

function findSseEventBoundary(buffer: string) {
  const match = /\r?\n\r?\n/.exec(buffer)
  if (!match) return undefined

  return {
    index: match.index,
    length: match[0].length,
  }
}

function parseSseEventChunk(chunk: string) {
  const payload: string[] = []

  for (const line of chunk.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue

    const separator = line.indexOf(":")
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? "" : line.slice(separator + 1)
    if (value.startsWith(" ")) {
      value = value.slice(1)
    }

    if (field === "data") {
      payload.push(value)
    }
  }

  if (payload.length === 0) return undefined
  return payload.join("\n")
}

export function consumeSseBuffer(buffer: string) {
  const messages: string[] = []
  let rest = buffer

  while (true) {
    const boundary = findSseEventBoundary(rest)
    if (!boundary) break

    const chunk = rest.slice(0, boundary.index)
    rest = rest.slice(boundary.index + boundary.length)

    const message = parseSseEventChunk(chunk)
    if (message !== undefined) {
      messages.push(message)
    }
  }

  return {
    messages,
    rest,
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isGlobalBusPayload(value: unknown): value is GlobalEvent["payload"] {
  return isRecord(value) && typeof value.type === "string" && isRecord(value.properties)
}

function isGlobalSyncPayload(value: unknown): value is GlobalEvent["payload"] {
  return isRecord(value) && value.type === "sync" && isRecord(value.syncEvent)
}

function isGlobalEventPayload(value: unknown): value is GlobalEvent["payload"] {
  return isGlobalBusPayload(value) || isGlobalSyncPayload(value)
}

function readOptionalString(record: UnknownRecord, key: string) {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function normalizeGlobalEvent(
  value: unknown,
  fallbackDirectory: string | undefined,
): GlobalEvent | undefined {
  if (!isRecord(value)) return undefined

  const sdkData = value[SDK_STREAM_DATA_KEY]
  if (sdkData !== undefined) {
    return normalizeGlobalEvent(sdkData, fallbackDirectory)
  }

  const payload = value.payload
  if (isGlobalEventPayload(payload)) {
    return {
      directory: readOptionalString(value, "directory"),
      payload,
    }
  }

  if (isGlobalEventPayload(value)) {
    return {
      directory: fallbackDirectory,
      payload: value,
    }
  }

  return undefined
}

function eventErrorInfo(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }
  return {
    message: String(error),
  }
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false
  if (!("name" in error)) return false
  return error.name === "AbortError"
}

export function startChatSync(handlers: SyncHandlers) {
  let disposed = false
  let opened = false
  let streamAbort: AbortController | undefined
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined
  let lastEventAt = Date.now()
  let lastFlushAt = 0
  let reconnectAttempt = 0
  let run: Promise<void> | undefined
  let streamErrorLogged = false
  const eventBuffer = createChatStreamEventBuffer()

  const reportStatus = (status: "connecting" | "connected" | "error") => {
    handlers.onStatus?.(status)
  }

  const closeStream = () => {
    if (!streamAbort) return
    streamAbort.abort()
    streamAbort = undefined
  }

  const clearHeartbeat = () => {
    if (heartbeatTimer === undefined) return
    globalThis.clearTimeout(heartbeatTimer)
    heartbeatTimer = undefined
  }

  const resetHeartbeat = () => {
    lastEventAt = Date.now()
    clearHeartbeat()
    heartbeatTimer = globalThis.setTimeout(() => {
      streamAbort?.abort()
    }, HEARTBEAT_TIMEOUT_MS)
  }

  const flush = () => {
    if (flushTimer !== undefined) {
      globalThis.clearTimeout(flushTimer)
      flushTimer = undefined
    }

    const events = eventBuffer.drain()
    if (events.length === 0) return

    lastFlushAt = Date.now()
    unstable_batchedUpdates(() => {
      for (const event of events) {
        handlers.onEvent(event)
      }
    })
  }

  const scheduleFlush = () => {
    if (flushTimer !== undefined) return
    const elapsed = Date.now() - lastFlushAt
    flushTimer = globalThis.setTimeout(flush, Math.max(0, FRAME_MS - elapsed))
  }

  const nextReconnectDelay = () => {
    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      RECONNECT_DELAY_MS * RECONNECT_BACKOFF_FACTOR ** reconnectAttempt,
    )
    reconnectAttempt += 1
    return delay
  }

  const markOpen = () => {
    if (!opened) {
      opened = true
      handlers.onOpen?.()
    }
    reportStatus("connected")
  }

  const handleStreamEvent = (event: GlobalEvent) => {
    eventBuffer.enqueue(event)
    scheduleFlush()
  }

  const logStreamError = (error: unknown) => {
    if (streamErrorLogged) return
    streamErrorLogged = true
    console.warn("[chat-sync] error", {
      directory: handlers.directory ?? CHAT_STREAM_GLOBAL_DIRECTORY,
      error: eventErrorInfo(error),
    })
  }

  const start = () => {
    if (run) return run

    run = (async () => {
      // oxlint-disable-next-line no-unmodified-loop-condition -- disposed is set by stop() which also aborts the current attempt
      while (!disposed) {
        reportStatus("connecting")

        const currentAbort = new AbortController()
        streamAbort = currentAbort
        let streamError: unknown
        let reportedFailure = false

        const reportFailure = (error: unknown) => {
          if (reportedFailure) return
          reportedFailure = true
          handlers.onError?.(error)
          reportStatus("error")
        }

        try {
          const events = await getBuddyClient(handlers.directory).event.stream(
            handlers.directory ? { directory: handlers.directory } : undefined,
            {
              headers: {
                accept: EVENT_STREAM_ACCEPT,
                "cache-control": EVENT_STREAM_CACHE_CONTROL,
              },
              signal: currentAbort.signal,
              sseMaxRetryAttempts: 0,
              onSseError(error: unknown) {
                if (currentAbort.signal.aborted || isAbortError(error)) return
                streamError = error
                logStreamError(error)
              },
            },
          )

          if (disposed || currentAbort.signal.aborted) break
          markOpen()
          streamErrorLogged = false
          resetHeartbeat()

          let yieldedAt = Date.now()

          const yieldToMainThread = async () => {
            if (Date.now() - yieldedAt < STREAM_YIELD_MS) return
            yieldedAt = Date.now()
            await wait(0)
          }

          for await (const event of events.stream) {
            if (disposed || currentAbort.signal.aborted) break
            reconnectAttempt = 0
            resetHeartbeat()
            const normalizedEvent = normalizeGlobalEvent(event, handlers.directory)
            if (!normalizedEvent) {
              console.warn("[chat-sync] invalid-event", { event })
              await yieldToMainThread()
              continue
            }
            if (normalizedEvent.payload.type === "sync") {
              await yieldToMainThread()
              continue
            }
            streamErrorLogged = false
            handleStreamEvent(normalizedEvent)
            await yieldToMainThread()
          }
        } catch (error) {
          if (!currentAbort.signal.aborted && !isAbortError(error)) {
            logStreamError(error)
            reportFailure(error)
          }
        } finally {
          if (streamAbort === currentAbort) {
            streamAbort = undefined
          }
          clearHeartbeat()
        }

        if (disposed) return

        if (streamError && !currentAbort.signal.aborted && !isAbortError(streamError)) {
          reportFailure(streamError)
        } else {
          reportStatus("connecting")
        }

        await wait(nextReconnectDelay())
      }
    })().finally(() => {
      run = undefined
      flush()
    })

    return run
  }

  const onVisibilityChange = () => {
    if (typeof document === "undefined") return
    if (document.visibilityState !== DOCUMENT_VISIBILITY_VISIBLE) return
    if (Date.now() - lastEventAt < HEARTBEAT_TIMEOUT_MS) return
    streamAbort?.abort()
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  void start()

  return {
    stop() {
      disposed = true
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange)
      }
      clearHeartbeat()
      closeStream()
      flush()
    },
  }
}
