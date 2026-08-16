import type { GlobalEvent } from "./chat-types"
import { unstable_batchedUpdates } from "react-dom"
import { getBuddyClient } from "../lib/buddy-client"
import type { EventStreamData } from "@buddy/sdk/types"
import {
  CHAT_STREAM_GLOBAL_DIRECTORY,
  createChatStreamEventBuffer,
} from "./chat-stream-event-buffer"

type SyncHandlers = {
  directory?: string
  eventQuery?: () => Partial<NonNullable<EventStreamData["query"]>>
  onOpen?: () => void
  onEvent: (event: GlobalEvent) => void
  onError?: (error: unknown) => void
  onStatus?: (status: "connecting" | "connected" | "error") => void
  onBufferActivity?: (activity: ChatSyncBufferActivity) => void
}

export type ChatSyncBufferActivity =
  | {
      phase: "flush"
      queuedEvents: number
      appliedEvents: number
    }
  | {
      phase: "session-fence"
      sessionID: string
      discardedEvents: number
    }
  | {
      phase: "session-resume"
      sessionID: string
      discardedEvents: number
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

type ChatSyncSessionFence = {
  fenceSession: (sessionID: string) => () => void
}

const chatSyncSessionFencesByDirectory = new Map<string, Set<ChatSyncSessionFence>>()

type UnknownRecord = Record<string, unknown>

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))

export function createStreamYieldScheduler(input?: {
  now?: () => number
  yieldToMainThread?: () => Promise<void>
}) {
  const now = input?.now ?? Date.now
  const yieldToMainThread = input?.yieldToMainThread ?? (() => wait(0))
  let yieldedAt = now()

  return async () => {
    if (now() - yieldedAt < STREAM_YIELD_MS) return false
    await yieldToMainThread()
    yieldedAt = now()
    return true
  }
}

function registerChatSyncSessionFence(
  directory: string | undefined,
  control: ChatSyncSessionFence,
) {
  if (!directory) return () => undefined
  const controls = chatSyncSessionFencesByDirectory.get(directory)
  if (controls) {
    controls.add(control)
  } else {
    chatSyncSessionFencesByDirectory.set(directory, new Set([control]))
  }

  return () => {
    const current = chatSyncSessionFencesByDirectory.get(directory)
    if (!current) return
    current.delete(control)
    if (current.size === 0) {
      chatSyncSessionFencesByDirectory.delete(directory)
    }
  }
}

export function fenceChatSyncSession(directory: string, sessionID: string) {
  const controls = chatSyncSessionFencesByDirectory.get(directory)
  if (!controls) return () => undefined
  const releaseControls = Array.from(controls, (control) => control.fenceSession(sessionID))
  let released = false

  return () => {
    if (released) return
    released = true
    for (const release of releaseControls) {
      release()
    }
  }
}

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

function fencedSessionID(event: GlobalEvent) {
  const payload = event.payload
  if (!("properties" in payload)) return undefined
  const properties = payload.properties

  if (payload.type === "message.updated") {
    const info = properties.info
    return isRecord(info) ? readOptionalString(info, "sessionID") : undefined
  }

  if (payload.type === "message.part.updated") {
    const part = properties.part
    return isRecord(part) ? readOptionalString(part, "sessionID") : undefined
  }

  if (
    payload.type === "message.removed" ||
    payload.type === "message.part.removed" ||
    payload.type === "message.part.delta" ||
    payload.type === "session.status"
  ) {
    return readOptionalString(properties, "sessionID")
  }

  return undefined
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
  const sessionFences = new Map<
    string,
    { count: number; discardedEvents: number; reportedDiscardedEvents: number }
  >()

  const reportStatus = (status: "connecting" | "connected" | "error") => {
    handlers.onStatus?.(status)
  }

  const closeStream = () => {
    if (!streamAbort) return
    streamAbort.abort()
    streamAbort = undefined
  }

  const clearScheduledFlush = () => {
    if (flushTimer === undefined) return
    globalThis.clearTimeout(flushTimer)
    flushTimer = undefined
  }

  const fenceSession = (sessionID: string) => {
    const currentFence = sessionFences.get(sessionID)
    if (currentFence) {
      currentFence.count += 1
    } else {
      const discardedEvents = eventBuffer.discardWhere(
        (event) => fencedSessionID(event) === sessionID,
      )
      sessionFences.set(sessionID, {
        count: 1,
        discardedEvents,
        reportedDiscardedEvents: discardedEvents,
      })
      handlers.onBufferActivity?.({
        phase: "session-fence",
        sessionID,
        discardedEvents,
      })
    }

    let released = false
    return () => {
      if (released) return
      released = true
      const fence = sessionFences.get(sessionID)
      if (!fence) return
      fence.count = Math.max(0, fence.count - 1)
      if (fence.count !== 0) return
      sessionFences.delete(sessionID)
      handlers.onBufferActivity?.({
        phase: "session-resume",
        sessionID,
        discardedEvents: fence.discardedEvents - fence.reportedDiscardedEvents,
      })
    }
  }

  const unregisterSessionFence = registerChatSyncSessionFence(handlers.directory, {
    fenceSession,
  })

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
    clearScheduledFlush()

    const queuedEvents = eventBuffer.size()
    const events = eventBuffer.drain()
    if (events.length === 0) return

    handlers.onBufferActivity?.({
      phase: "flush",
      queuedEvents,
      appliedEvents: events.length,
    })

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
    const sessionID = fencedSessionID(event)
    if (sessionID) {
      const fence = sessionFences.get(sessionID)
      if (fence) {
        fence.discardedEvents += 1
        return
      }
    }
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
          const query = Object.assign(
            {},
            handlers.directory ? { directory: handlers.directory } : undefined,
            handlers.eventQuery?.(),
          )
          const events = await getBuddyClient(handlers.directory).event.stream(
            Object.keys(query).length > 0 ? query : undefined,
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

          const yieldToMainThread = createStreamYieldScheduler()

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
      unregisterSessionFence()
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange)
      }
      clearHeartbeat()
      closeStream()
      sessionFences.clear()
      eventBuffer.clear()
      flush()
    },
  }
}
