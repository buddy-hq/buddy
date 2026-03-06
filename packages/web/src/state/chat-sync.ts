import type { GlobalEvent } from "./chat-types"
import { getPlatform } from "../context/platform"
import { apiFetch, createEventStreamUrl } from "../lib/api-client"
import { getServerConnection } from "../context/server"

type SyncHandlers = {
  directory?: string
  onOpen?: () => void
  onEvent: (event: GlobalEvent) => void
  onError?: (error: unknown) => void
  onStatus?: (status: "connecting" | "connected" | "error") => void
}

const FRAME_MS = 16

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

function eventKey(event: GlobalEvent) {
  const directory = event.directory ?? "global"
  const payload = event.payload

  if (payload.type === "session.status") {
    return `${directory}:session.status:${String(payload.properties.sessionID ?? "")}`
  }

  if (payload.type === "message.part.updated") {
    const part = payload.properties.part as { messageID?: string; id?: string } | undefined
    if (!part?.messageID || !part.id) return undefined
    return `${directory}:message.part.updated:${part.messageID}:${part.id}`
  }

  return undefined
}

export function startChatSync(handlers: SyncHandlers) {
  let source: EventSource | undefined
  let streamAbort: AbortController | undefined
  let reconnectTimer: number | undefined
  let attempt = 0
  let disposed = false
  let opened = false
  let queue: Array<GlobalEvent | undefined> = []
  const coalesced = new Map<string, number>()
  const staleDeltas = new Set<string>()
  let flushTimer: number | undefined

  const deltaKey = (directory: string, messageID: string, partID: string) => `${directory}:${messageID}:${partID}`

  const clearReconnect = () => {
    if (reconnectTimer === undefined) return
    window.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const closeSource = () => {
    if (!source) return
    source.close()
    source = undefined
  }

  const closeStream = () => {
    if (!streamAbort) return
    streamAbort.abort()
    streamAbort = undefined
  }

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
      if (skip && event.payload.type === "message.part.delta") {
        const props = event.payload.properties
        if (
          skip.has(
            deltaKey(
              event.directory ?? "global",
              String(props.messageID ?? ""),
              String(props.partID ?? ""),
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
    handlers.onStatus?.("connecting")
    closeSource()
    closeStream()
    clearReconnect()
    const search = new URLSearchParams()
    if (handlers.directory) {
      search.set("directory", handlers.directory)
    }
    const endpoint = search.size > 0 ? `/api/event?${search.toString()}` : "/api/event"
    const server = getServerConnection()
    const requiresAuthenticatedStream = !!server.username && !!server.password
    const requiresFetchStream = getPlatform().platform === "desktop" || requiresAuthenticatedStream

    const handleParsedEvent = (message: string) => {
      try {
        const event = JSON.parse(message) as GlobalEvent
        const payloadType = event.payload?.type ?? "unknown"
        if (payloadType === "session.status" || payloadType === "message.updated") {
          console.info("[chat-sync] event", {
            directory: event.directory ?? "global",
            type: payloadType,
            sessionID: String(event.payload?.properties?.sessionID ?? ""),
          })
        }
        const key = eventKey(event)
        if (key) {
          const existing = coalesced.get(key)
          if (existing !== undefined) {
            queue[existing] = event
            if (payloadType === "message.part.updated") {
              const part = event.payload.properties.part as { messageID?: string; id?: string } | undefined
              if (part?.messageID && part.id) {
                staleDeltas.add(deltaKey(event.directory ?? "global", part.messageID, part.id))
              }
            }
            return
          }
          coalesced.set(key, queue.length)
        }
        queue.push(event)
        scheduleFlush()
      } catch (error) {
        handlers.onError?.(error)
      }
    }

    const scheduleReconnect = (notifyError = true) => {
      if (disposed) return
      attempt += 1
      const delay = Math.min(10_000, 500 * attempt)
      reconnectTimer = window.setTimeout(() => {
        connect()
      }, delay)
      handlers.onStatus?.("error")
      if (notifyError) {
        handlers.onError?.(new Error(`Event stream disconnected (attempt ${attempt})`))
      }
    }

    if (requiresFetchStream) {
      streamAbort = new AbortController()

      void (async () => {
        try {
          const response = await apiFetch(endpoint, {
            directory: handlers.directory,
            headers: {
              accept: "text/event-stream",
              "cache-control": "no-cache",
            },
            signal: streamAbort.signal,
          })

          if (!response.ok || !response.body) {
            throw new Error(`Event stream request failed (${response.status})`)
          }

          attempt = 0
          if (!opened) {
            opened = true
            handlers.onOpen?.()
          }
          handlers.onStatus?.("connected")

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (!disposed) {
            const result = await reader.read()
            if (result.done) {
              buffer += decoder.decode()
              break
            }

            buffer += decoder.decode(result.value, { stream: true })
            const parsed = consumeSseBuffer(buffer)
            buffer = parsed.rest

            for (const message of parsed.messages) {
              handleParsedEvent(message)
            }
          }

          const parsed = consumeSseBuffer(buffer)
          for (const message of parsed.messages) {
            handleParsedEvent(message)
          }
        } catch (error) {
          if (disposed) return
          console.warn("[chat-sync] error", { attempt: attempt + 1 })
          scheduleReconnect(true)
          return
        } finally {
          closeStream()
        }

        if (!disposed) {
          console.warn("[chat-sync] error", { attempt: attempt + 1 })
          scheduleReconnect(false)
        }
      })()

      return
    }

    source = new EventSource(createEventStreamUrl(endpoint))

    source.onopen = () => {
      attempt = 0
      console.info("[chat-sync] open")
      if (!opened) {
        opened = true
        handlers.onOpen?.()
      }
      handlers.onStatus?.("connected")
    }

    source.onmessage = (messageEvent) => {
      handleParsedEvent(messageEvent.data)
    }

    source.onerror = () => {
      console.warn("[chat-sync] error", { attempt: attempt + 1 })
      closeSource()
      scheduleReconnect(true)
    }
  }

  connect()

  return {
    stop() {
      disposed = true
      clearReconnect()
      closeSource()
      closeStream()
      flush()
    },
  }
}
