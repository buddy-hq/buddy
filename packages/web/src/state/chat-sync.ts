import type { GlobalEvent } from "./chat-types"
import { getBuddyClient } from "../lib/buddy-client"

type SyncHandlers = {
  directory?: string
  onOpen?: () => void
  onEvent: (event: GlobalEvent) => void
  onError?: (error: unknown) => void
  onStatus?: (status: "connecting" | "connected" | "error") => void
}

const FRAME_MS = 16
const STREAM_YIELD_MS = 8
const EVENT_STREAM_ACCEPT = "text/event-stream"
const EVENT_STREAM_CACHE_CONTROL = "no-cache"
const GLOBAL_DIRECTORY = "global"
const SDK_STREAM_DATA_KEY = "data"

type UnknownRecord = Record<string, unknown>

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

function eventPayloadProperties(event: GlobalEvent) {
  const payload = event.payload
  return "properties" in payload ? payload.properties : undefined
}

function isMessagePartReference(value: unknown): value is { messageID: string; id: string } {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.messageID === "string" && typeof value.id === "string"
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

function eventKey(event: GlobalEvent) {
  const directory = event.directory ?? GLOBAL_DIRECTORY
  const payload = event.payload
  const properties = eventPayloadProperties(event)
  if (!properties) return undefined

  if (payload.type === "session.status") {
    return `${directory}:session.status:${String(properties.sessionID ?? "")}`
  }

  if (payload.type === "message.part.updated") {
    const part = properties.part
    if (!isMessagePartReference(part)) return undefined
    return `${directory}:message.part.updated:${part.messageID}:${part.id}`
  }

  return undefined
}

function deltaKey(directory: string, messageID: string, partID: string) {
  return `${directory}:${messageID}:${partID}`
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false
  if (!("name" in error)) return false
  return error.name === "AbortError"
}

export function startChatSync(handlers: SyncHandlers) {
  let streamAbort: AbortController | undefined
  let reconnectTimer: number | undefined
  let attempt = 0
  let disposed = false
  let opened = false
  let connectionID = 0
  let queue: Array<GlobalEvent | undefined> = []
  const coalesced = new Map<string, number>()
  const staleDeltas = new Set<string>()
  let flushTimer: number | undefined

  const reportStatus = (status: "connecting" | "connected" | "error") => {
    handlers.onStatus?.(status)
  }

  const clearReconnect = () => {
    if (reconnectTimer === undefined) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const closeStream = () => {
    if (!streamAbort) return
    streamAbort.abort()
    streamAbort = undefined
  }

  const isCurrentConnection = (id: number, abort: AbortController) =>
    !disposed && streamAbort === abort && connectionID === id

  const flush = () => {
    if (flushTimer !== undefined) {
      window.clearTimeout(flushTimer)
      flushTimer = undefined
    }

    if (queue.length === 0) return
    const events = queue
    const skip = staleDeltas.size > 0 ? new Set(staleDeltas) : undefined
    queue = []
    coalesced.clear()
    staleDeltas.clear()

    for (const event of events) {
      if (!event) continue
      const properties = eventPayloadProperties(event)
      if (skip && event.payload.type === "message.part.delta" && properties) {
        if (
          skip.has(
            deltaKey(
              event.directory ?? GLOBAL_DIRECTORY,
              String(properties.messageID ?? ""),
              String(properties.partID ?? ""),
            ),
          )
        ) {
          continue
        }
      }
      handlers.onEvent(event)
    }
  }

  const scheduleFlush = () => {
    if (flushTimer !== undefined) return
    flushTimer = window.setTimeout(flush, FRAME_MS)
  }

  const connect = () => {
    if (disposed) return
    console.info("[chat-sync] connect")
    reportStatus("connecting")
    closeStream()
    clearReconnect()

    const markOpen = () => {
      attempt = 0
      console.info("[chat-sync] open")
      if (!opened) {
        opened = true
        handlers.onOpen?.()
      }
      reportStatus("connected")
    }

    const handleStreamEvent = (event: GlobalEvent) => {
      const payloadType = event.payload?.type ?? "unknown"
      const properties = eventPayloadProperties(event)
      if (payloadType === "session.status" || payloadType === "message.updated") {
        console.info("[chat-sync] event", {
          directory: event.directory ?? GLOBAL_DIRECTORY,
          type: payloadType,
          sessionID: String(properties?.sessionID ?? ""),
        })
      }
      const key = eventKey(event)
      if (key) {
        const existing = coalesced.get(key)
        if (existing !== undefined) {
          queue[existing] = event
          if (payloadType === "message.part.updated" && properties) {
            const part = properties.part
            if (isMessagePartReference(part)) {
              staleDeltas.add(
                deltaKey(event.directory ?? GLOBAL_DIRECTORY, part.messageID, part.id),
              )
            }
          }
          return
        }
        coalesced.set(key, queue.length)
      }
      queue.push(event)
      scheduleFlush()
    }

    const scheduleReconnect = (
      notifyError = true,
      status: "connecting" | "connected" | "error" = "error",
    ) => {
      if (disposed) return
      attempt += 1
      const delay = Math.min(10_000, 500 * attempt)
      reconnectTimer = window.setTimeout(() => {
        connect()
      }, delay)
      reportStatus(status)
      if (notifyError) {
        handlers.onError?.(new Error(`Event stream disconnected (attempt ${attempt})`))
      }
    }

    const currentConnectionID = connectionID + 1
    connectionID = currentConnectionID
    const currentAbort = new AbortController()
    streamAbort = currentAbort

    void (async () => {
      let streamError: unknown

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
            onSseError(error) {
              if (!currentAbort.signal.aborted && !isAbortError(error)) {
                streamError = error
              }
            },
          },
        )

        if (!isCurrentConnection(currentConnectionID, currentAbort)) return
        markOpen()

        let yieldedAt = Date.now()

        const yieldToMainThread = async () => {
          if (Date.now() - yieldedAt < STREAM_YIELD_MS) return
          yieldedAt = Date.now()
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        }

        for await (const event of events.stream) {
          if (!isCurrentConnection(currentConnectionID, currentAbort)) break
          const normalizedEvent = normalizeGlobalEvent(event, handlers.directory)
          if (!normalizedEvent) {
            console.warn("[chat-sync] invalid-event", { event })
            await yieldToMainThread()
            continue
          }
          handleStreamEvent(normalizedEvent)
          await yieldToMainThread()
        }
      } catch (error) {
        if (!isCurrentConnection(currentConnectionID, currentAbort) || isAbortError(error)) return
        console.warn("[chat-sync] error", { attempt: attempt + 1, error: eventErrorInfo(error) })
        handlers.onError?.(error)
        scheduleReconnect(true)
        return
      }

      if (!isCurrentConnection(currentConnectionID, currentAbort)) return
      if (streamError) {
        console.warn("[chat-sync] error", {
          attempt: attempt + 1,
          error: eventErrorInfo(streamError),
        })
        scheduleReconnect(true)
        return
      }
      console.info("[chat-sync] disconnected", { attempt: attempt + 1 })
      scheduleReconnect(false, "connecting")
    })()
  }

  connect()

  return {
    stop() {
      disposed = true
      clearReconnect()
      closeStream()
      flush()
    },
  }
}
