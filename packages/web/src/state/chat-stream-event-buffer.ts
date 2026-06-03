import type { GlobalEvent } from "./chat-types"

export const CHAT_STREAM_GLOBAL_DIRECTORY = "global"
export const MESSAGE_PART_UPDATED_EVENT_TYPE = "message.part.updated"
export const MESSAGE_PART_DELTA_EVENT_TYPE = "message.part.delta"
export const SESSION_STATUS_EVENT_TYPE = "session.status"
export const STREAMING_PART_RAW_FIELD = "state.raw"
export const TOOL_PART_TYPE = "tool"
export const TOOL_STATE_PENDING_STATUS = "pending"
export const TOOL_STATE_RUNNING_STATUS = "running"

type UnknownRecord = Record<string, unknown>

type MessagePartReference = {
  directory: string
  messageID: string
  partID: string
}

type MessagePartUpdateInfo = MessagePartReference & {
  part: UnknownRecord
}

type MessagePartDeltaInfo = MessagePartReference & {
  field: string
  delta: string
}

type QueuedChatStreamEvent = {
  active: boolean
  event: GlobalEvent
}

type RawDeltaAccumulator = {
  expectedRaw: string
  hasBase: boolean
}

type RawMergeResult = {
  applied: boolean
  event: GlobalEvent
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

function messagePartKey(input: MessagePartReference) {
  return `${input.directory}:${input.messageID}:${input.partID}`
}

function readMessagePartUpdateInfo(event: GlobalEvent): MessagePartUpdateInfo | undefined {
  if (event.payload.type !== MESSAGE_PART_UPDATED_EVENT_TYPE) return undefined
  const properties = eventPayloadProperties(event)
  if (!properties) return undefined

  const part = properties.part
  if (!isRecord(part)) return undefined

  const messageID = readString(part, "messageID")
  const partID = readString(part, "id")
  if (!messageID || !partID) return undefined

  return {
    directory: event.directory ?? CHAT_STREAM_GLOBAL_DIRECTORY,
    messageID,
    partID,
    part,
  }
}

function readMessagePartDeltaInfo(event: GlobalEvent): MessagePartDeltaInfo | undefined {
  if (event.payload.type !== MESSAGE_PART_DELTA_EVENT_TYPE) return undefined
  const properties = eventPayloadProperties(event)
  if (!properties) return undefined

  const messageID = readString(properties, "messageID")
  const partID = readString(properties, "partID")
  const field = readString(properties, "field")
  const delta = readString(properties, "delta")
  if (!messageID || !partID || field === undefined || delta === undefined) return undefined

  return {
    directory: event.directory ?? CHAT_STREAM_GLOBAL_DIRECTORY,
    messageID,
    partID,
    field,
    delta,
  }
}

function eventKey(event: GlobalEvent) {
  const directory = event.directory ?? CHAT_STREAM_GLOBAL_DIRECTORY
  const payload = event.payload
  const properties = eventPayloadProperties(event)
  if (!properties) return undefined

  if (payload.type === SESSION_STATUS_EVENT_TYPE) {
    return `${directory}:${SESSION_STATUS_EVENT_TYPE}:${String(properties.sessionID ?? "")}`
  }

  const part = readMessagePartUpdateInfo(event)
  if (part) {
    return `${directory}:${MESSAGE_PART_UPDATED_EVENT_TYPE}:${part.messageID}:${part.partID}`
  }

  return undefined
}

function readPartState(part: UnknownRecord) {
  const state = part.state
  return isRecord(state) ? state : undefined
}

function readPartStateRaw(part: UnknownRecord) {
  const state = readPartState(part)
  return state ? readString(state, "raw") : undefined
}

function isStreamingToolState(state: UnknownRecord) {
  const status = readString(state, "status")
  return status === TOOL_STATE_PENDING_STATUS || status === TOOL_STATE_RUNNING_STATUS
}

function reconcileRawSnapshot(snapshotRaw: string, expectedRaw: string) {
  if (snapshotRaw === expectedRaw) return snapshotRaw
  if (expectedRaw.startsWith(snapshotRaw)) return expectedRaw
  if (snapshotRaw.startsWith(expectedRaw)) return snapshotRaw
  return undefined
}

function withPartStateRaw(
  event: GlobalEvent,
  part: UnknownRecord,
  state: UnknownRecord,
  raw: string,
) {
  return {
    ...event,
    payload: {
      ...event.payload,
      properties: {
        ...eventPayloadProperties(event),
        part: {
          ...part,
          state: {
            ...state,
            raw,
          },
        },
      },
    },
  }
}

function applyRawDeltaAccumulator(
  event: GlobalEvent,
  accumulator: RawDeltaAccumulator,
): RawMergeResult {
  const info = readMessagePartUpdateInfo(event)
  if (!info) {
    return { applied: false, event }
  }
  if (readString(info.part, "type") !== TOOL_PART_TYPE) {
    return { applied: false, event }
  }

  const state = readPartState(info.part)
  if (!state || !isStreamingToolState(state)) {
    return { applied: false, event }
  }

  const snapshotRaw = readString(state, "raw")
  if (snapshotRaw !== undefined) {
    const mergedRaw = reconcileRawSnapshot(snapshotRaw, accumulator.expectedRaw)
    if (mergedRaw === undefined) {
      return { applied: false, event }
    }
    return {
      applied: true,
      event: withPartStateRaw(event, info.part, state, mergedRaw),
    }
  }

  if (!accumulator.hasBase) {
    return { applied: false, event }
  }

  return {
    applied: true,
    event: withPartStateRaw(event, info.part, state, accumulator.expectedRaw),
  }
}

function latestActivePartUpdateIndexes(entries: QueuedChatStreamEvent[]) {
  const updates = new Map<string, number>()

  for (const [index, entry] of entries.entries()) {
    if (!entry.active) continue
    const part = readMessagePartUpdateInfo(entry.event)
    if (!part) continue
    updates.set(messagePartKey(part), index)
  }

  return updates
}

function collectRawDeltasForLaterUpdates(
  entries: QueuedChatStreamEvent[],
  latestUpdateIndexes: Map<string, number>,
) {
  const latestRawByPart = new Map<string, string>()
  const rawDeltas = new Map<string, RawDeltaAccumulator>()

  for (const [index, entry] of entries.entries()) {
    const updatedPart = readMessagePartUpdateInfo(entry.event)
    if (updatedPart) {
      const raw = readPartStateRaw(updatedPart.part)
      if (raw !== undefined) {
        latestRawByPart.set(messagePartKey(updatedPart), raw)
      }
    }

    if (!entry.active) continue
    const delta = readMessagePartDeltaInfo(entry.event)
    if (!delta || delta.field !== STREAMING_PART_RAW_FIELD) continue

    const key = messagePartKey(delta)
    const updateIndex = latestUpdateIndexes.get(key)
    if (updateIndex === undefined || updateIndex <= index) continue

    const existing = rawDeltas.get(key)
    if (existing) {
      rawDeltas.set(key, {
        ...existing,
        expectedRaw: existing.expectedRaw + delta.delta,
      })
      continue
    }

    const baseRaw = latestRawByPart.get(key)
    rawDeltas.set(key, {
      expectedRaw: `${baseRaw ?? ""}${delta.delta}`,
      hasBase: baseRaw !== undefined,
    })
  }

  return rawDeltas
}

function buildTransformedPartUpdates(input: {
  entries: QueuedChatStreamEvent[]
  rawDeltas: Map<string, RawDeltaAccumulator>
}) {
  const transformed = new Map<number, GlobalEvent>()
  const mergedRawDeltaKeys = new Set<string>()

  for (const [index, entry] of input.entries.entries()) {
    if (!entry.active) continue
    const part = readMessagePartUpdateInfo(entry.event)
    if (!part) continue

    const key = messagePartKey(part)
    const accumulator = input.rawDeltas.get(key)
    if (!accumulator) continue

    const merged = applyRawDeltaAccumulator(entry.event, accumulator)
    if (!merged.applied) continue

    transformed.set(index, merged.event)
    mergedRawDeltaKeys.add(key)
  }

  return {
    mergedRawDeltaKeys,
    transformed,
  }
}

function coalesceQueuedChatStreamEvents(entries: QueuedChatStreamEvent[]) {
  const latestUpdateIndexes = latestActivePartUpdateIndexes(entries)
  const rawDeltas = collectRawDeltasForLaterUpdates(entries, latestUpdateIndexes)
  const { mergedRawDeltaKeys, transformed } = buildTransformedPartUpdates({
    entries,
    rawDeltas,
  })
  const events: GlobalEvent[] = []

  for (const [index, entry] of entries.entries()) {
    if (!entry.active) continue

    const delta = readMessagePartDeltaInfo(entry.event)
    if (delta) {
      const key = messagePartKey(delta)
      const updateIndex = latestUpdateIndexes.get(key)
      const hasLaterUpdate = updateIndex !== undefined && updateIndex > index

      if (hasLaterUpdate) {
        if (delta.field !== STREAMING_PART_RAW_FIELD || mergedRawDeltaKeys.has(key)) {
          continue
        }
      }
    }

    events.push(transformed.get(index) ?? entry.event)
  }

  return events
}

export function bufferChatStreamEvents(events: GlobalEvent[]) {
  const buffer = createChatStreamEventBuffer()
  for (const event of events) {
    buffer.enqueue(event)
  }
  return buffer.drain()
}

export function createChatStreamEventBuffer() {
  let queue: QueuedChatStreamEvent[] = []
  let buffer: QueuedChatStreamEvent[] = []
  const coalesced = new Map<string, number>()

  return {
    drain() {
      if (queue.length === 0) return []

      const events = queue
      queue = buffer
      buffer = events
      queue.length = 0
      coalesced.clear()
      const drained = coalesceQueuedChatStreamEvents(events)
      buffer.length = 0
      return drained
    },
    enqueue(event: GlobalEvent) {
      const key = eventKey(event)
      if (key) {
        const existing = coalesced.get(key)
        if (existing !== undefined) {
          const entry = queue[existing]
          if (entry) {
            entry.active = false
          }
        }
        coalesced.set(key, queue.length)
      }

      queue.push({
        active: true,
        event,
      })
    },
  }
}
