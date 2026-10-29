import path from "node:path"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { readWorkspaceFileWatcherUpdatePayload } from "@buddy/transcript-contract/file-watcher"
import type { Events } from "@buddy/agent-runtime/events"
import { parseTJsonObject, parseTString } from "./parse"

function noop() {}

const MaxQueuedEvents = 4096
const MaxQueuedBytes = 4 * 1024 * 1024
const MaxAccountedFrameBytes = 256 * 1024
const MaxQueuedRealBytes = 64 * 1024 * 1024

export type TBuddyEventStreamMultiplexer<TEvent> = {
  initialEvents?: readonly TEvent[]
  subscribe(listener: (event: TEvent) => void): () => void
}

export function containedWorkspaceRelativePath(
  directory: string,
  absolutePath: string,
): string | undefined {
  const windows =
    /^[a-zA-Z]:[\\/]/u.test(directory) ||
    /^[a-zA-Z]:[\\/]/u.test(absolutePath) ||
    directory.startsWith("\\\\")
  const paths = windows ? path.win32 : path.posix
  if (!paths.isAbsolute(absolutePath)) return undefined
  const relative = paths.relative(directory, absolutePath)
  if (
    !relative ||
    relative === "." ||
    relative === ".." ||
    relative.startsWith(`..${paths.sep}`) ||
    paths.isAbsolute(relative)
  )
    return undefined
  return relative.replaceAll(paths.sep, "/")
}

export function normalizeBuddyStreamEvent<TValue>(
  value: TValue,
  directory: string,
): BuddyEvent | undefined {
  const record = parseTJsonObject(value)
  const payload = parseTJsonObject(record?.payload)
  const properties = parseTJsonObject(payload?.properties)
  const type = parseTString(payload?.type)
  const eventDirectory = parseTString(record?.directory) ?? directory
  if (!type || !properties || eventDirectory !== directory) return undefined
  const event: BuddyEvent = { directory: eventDirectory, payload: { type, properties } }
  const watcher = readWorkspaceFileWatcherUpdatePayload(event.payload)
  if (!watcher) return event
  const relativePath = containedWorkspaceRelativePath(directory, watcher.absolutePath)
  return relativePath
    ? { ...event, payload: { ...event.payload, properties: { ...properties, relativePath } } }
    : undefined
}

export function createBuddyEventStreamResponse<TEvent>(input: {
  readonly events: Pick<Events, "stream">
  readonly directory: string
  readonly signal?: AbortSignal
  readonly buddyEvents?: TBuddyEventStreamMultiplexer<TEvent>
  readonly globalEvents?: TBuddyEventStreamMultiplexer<unknown>
}): Response {
  const abort = new AbortController()
  const encoder = new TextEncoder()
  const queue: { frame: Uint8Array; accounted: number }[] = []
  let queuedBytes = 0
  let queuedRealBytes = 0
  let ended = false
  let closed = false
  let cleanup: () => void = noop

  let drain: () => void = noop
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const flush = () => {
        if (closed) return
        while (queue.length > 0 && (controller.desiredSize ?? 0) > 0) {
          const next = queue.shift()
          if (!next) break
          queuedBytes -= next.accounted
          queuedRealBytes -= next.frame.byteLength
          controller.enqueue(next.frame)
        }
        if (!closed && ended && queue.length === 0) {
          closed = true
          cleanup()
          controller.close()
        }
      }
      const fail = (error: Error) => {
        if (closed) return
        closed = true
        queue.length = 0
        queuedBytes = 0
        queuedRealBytes = 0
        cleanup()
        controller.error(error)
      }
      const push = <TValue>(value: TValue) => {
        if (closed) return
        const event = normalizeBuddyStreamEvent(value, input.directory)
        if (!event) return
        const frame = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        const accounted = Math.min(frame.byteLength, MaxAccountedFrameBytes)
        if (
          queue.length >= MaxQueuedEvents ||
          queuedBytes + accounted > MaxQueuedBytes ||
          (queue.length > 0 && queuedRealBytes + frame.byteLength > MaxQueuedRealBytes)
        ) {
          fail(new Error("Transcript event consumer fell behind"))
          return
        }
        queue.push({ frame, accounted })
        queuedBytes += accounted
        queuedRealBytes += frame.byteLength
        flush()
      }
      const global = input.globalEvents ?? { subscribe: () => noop, initialEvents: [] }
      const unsubscribeGlobal = global.subscribe(push)
      const unsubscribeBuddy = input.buddyEvents?.subscribe(push)
      const heartbeat = setInterval(
        () =>
          push({
            directory: input.directory,
            payload: { type: "server.heartbeat", properties: {} },
          }),
        5000,
      )
      const onAbort = () => {
        if (closed) return
        closed = true
        cleanup()
        controller.close()
      }
      cleanup = () => {
        abort.abort()
        clearInterval(heartbeat)
        unsubscribeGlobal()
        unsubscribeBuddy?.()
        input.signal?.removeEventListener("abort", onAbort)
      }
      input.signal?.addEventListener("abort", onAbort, { once: true })
      if (input.signal?.aborted) {
        onAbort()
        return
      }
      for (const event of input.buddyEvents?.initialEvents ?? []) push(event)
      for (const event of global.initialEvents ?? []) push(event)
      void (async () => {
        try {
          for await (const event of input.events.stream({
            directory: input.directory,
            signal: abort.signal,
          })) {
            push(event)
            if (closed) break
          }
          ended = true
          flush()
        } catch (error) {
          if (!abort.signal.aborted)
            fail(
              error instanceof Error
                ? error
                : new Error("Transcript event stream failed", { cause: error }),
            )
        }
      })()
      drain = flush
    },
    pull() {
      drain()
    },
    cancel() {
      if (closed) return
      closed = true
      queue.length = 0
      queuedBytes = 0
      queuedRealBytes = 0
      cleanup()
    },
  })
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  })
}
