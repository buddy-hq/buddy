import type { GlobalEvent } from "./chat-types"

export const CHAT_STREAM_GLOBAL_DIRECTORY = "global"
export const MESSAGE_PART_UPDATED_EVENT_TYPE = "message.part.updated"
export const MESSAGE_PART_DELTA_EVENT_TYPE = "message.part.delta"
export const STREAMING_PART_RAW_FIELD = "state.raw"
export const TOOL_PART_TYPE = "tool"
export const TOOL_STATE_PENDING_STATUS = "pending"
export const TOOL_STATE_RUNNING_STATUS = "running"

type UnknownRecord = Record<string, unknown>

type CoalescingInfo =
  | {
      kind: "part-update"
      key: string
    }
  | {
      kind: "part-delta"
      key: string
      field: string
      delta: string
    }

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(record: UnknownRecord, key: string) {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

export function eventPayloadProperties(event: GlobalEvent) {
  const payload = event.payload
  return "properties" in payload ? payload.properties : undefined
}

function directoryKey(event: GlobalEvent) {
  return event.directory ?? CHAT_STREAM_GLOBAL_DIRECTORY
}

function messagePartKey(input: {
  directory: string
  messageID: string
  partID: string
}) {
  return `${input.directory}:${input.messageID}:${input.partID}`
}

function readPartUpdateInfo(event: GlobalEvent) {
  if (event.payload.type !== MESSAGE_PART_UPDATED_EVENT_TYPE) return undefined
  const properties = eventPayloadProperties(event)
  if (!properties) return undefined
  const part = properties.part
  if (!isRecord(part)) return undefined

  const messageID = readString(part, "messageID")
  const partID = readString(part, "id")
  if (!messageID || !partID) return undefined

  return {
    directory: directoryKey(event),
    messageID,
    partID,
  }
}

function readPartDeltaInfo(event: GlobalEvent) {
  if (event.payload.type !== MESSAGE_PART_DELTA_EVENT_TYPE) return undefined
  const properties = eventPayloadProperties(event)
  if (!properties) return undefined

  const messageID = readString(properties, "messageID")
  const partID = readString(properties, "partID")
  const field = readString(properties, "field")
  const delta = readString(properties, "delta")
  if (!messageID || !partID || field === undefined || delta === undefined) return undefined

  return {
    directory: directoryKey(event),
    messageID,
    partID,
    field,
    delta,
  }
}

function coalescingInfo(event: GlobalEvent): CoalescingInfo | undefined {
  const update = readPartUpdateInfo(event)
  if (update) {
    return {
      kind: "part-update",
      key: messagePartKey(update),
    }
  }

  const delta = readPartDeltaInfo(event)
  if (delta) {
    return {
      kind: "part-delta",
      key: messagePartKey(delta),
      field: delta.field,
      delta: delta.delta,
    }
  }

  return undefined
}

function canCoalesceAdjacent(left: CoalescingInfo, right: CoalescingInfo) {
  if (left.kind !== right.kind) return false
  if (left.key !== right.key) return false
  if (left.kind === "part-delta" && right.kind === "part-delta") {
    return left.field === right.field
  }
  return true
}

function withMergedDelta(event: GlobalEvent, delta: string): GlobalEvent {
  const properties = eventPayloadProperties(event)
  return {
    ...event,
    payload: {
      ...event.payload,
      properties: properties ? { ...properties, delta } : { delta },
    },
  }
}

function coalesceAdjacent(left: GlobalEvent, right: GlobalEvent) {
  const leftInfo = coalescingInfo(left)
  const rightInfo = coalescingInfo(right)
  if (!leftInfo || !rightInfo) return undefined
  if (!canCoalesceAdjacent(leftInfo, rightInfo)) return undefined
  if (leftInfo.kind === "part-delta" && rightInfo.kind === "part-delta") {
    return withMergedDelta(right, leftInfo.delta + rightInfo.delta)
  }
  return right
}

function coalesceQueuedChatStreamEvents(events: GlobalEvent[]) {
  const output: GlobalEvent[] = []

  for (const event of events) {
    const previous = output[output.length - 1]
    const coalesced = previous ? coalesceAdjacent(previous, event) : undefined
    if (coalesced) {
      output[output.length - 1] = coalesced
      continue
    }
    output.push(event)
  }

  return output
}

export function bufferChatStreamEvents(events: GlobalEvent[]) {
  const buffer = createChatStreamEventBuffer()
  for (const event of events) {
    buffer.enqueue(event)
  }
  return buffer.drain()
}

export function createChatStreamEventBuffer() {
  let queue: GlobalEvent[] = []
  let buffer: GlobalEvent[] = []

  return {
    drain() {
      if (queue.length === 0) return []

      const events = queue
      queue = buffer
      buffer = events
      queue.length = 0
      const drained = coalesceQueuedChatStreamEvents(events)
      buffer.length = 0
      return drained
    },
    enqueue(event: GlobalEvent) {
      queue.push(event)
    },
  }
}
