import type { BuddyGlobalEvent } from "./types"

const EVENT_STREAM_CONTENT_TYPE = "text/event-stream"
const EVENT_STREAM_CACHE_CONTROL = "no-cache"
const EVENT_STREAM_CONNECTION = "keep-alive"
const EVENT_STREAM_HEARTBEAT_MS = 15_000
const SSE_DATA_PREFIX = "data: "
const SSE_FRAME_SUFFIX = "\n\n"
const SERVER_CONNECTED_EVENT = "server.connected"
const SERVER_HEARTBEAT_EVENT = "server.heartbeat"

type PiEventSubscriber = {
  directory: string
  emit: (event: BuddyGlobalEvent) => void
}

const subscribers = new Set<PiEventSubscriber>()

function sseFrame(event: BuddyGlobalEvent) {
  return `${SSE_DATA_PREFIX}${JSON.stringify(event)}${SSE_FRAME_SUFFIX}`
}

function controlEvent(directory: string, type: string): BuddyGlobalEvent {
  return {
    directory,
    payload: {
      type,
      properties: {},
    },
  }
}

export function publishPiEvent(event: BuddyGlobalEvent) {
  for (const subscriber of subscribers) {
    if (subscriber.directory === event.directory) {
      subscriber.emit(event)
    }
  }
}

export function piEventStream(directory: string) {
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let activeSubscriber: PiEventSubscriber | undefined

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscriber: PiEventSubscriber = {
        directory,
        emit(event) {
          controller.enqueue(encoder.encode(sseFrame(event)))
        },
      }
      activeSubscriber = subscriber
      subscribers.add(subscriber)
      subscriber.emit(controlEvent(directory, SERVER_CONNECTED_EVENT))

      heartbeat = setInterval(() => {
        subscriber.emit(controlEvent(directory, SERVER_HEARTBEAT_EVENT))
      }, EVENT_STREAM_HEARTBEAT_MS)
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat)
      }
      if (activeSubscriber) {
        subscribers.delete(activeSubscriber)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": EVENT_STREAM_CONTENT_TYPE,
      "cache-control": EVENT_STREAM_CACHE_CONTROL,
      connection: EVENT_STREAM_CONNECTION,
    },
  })
}
