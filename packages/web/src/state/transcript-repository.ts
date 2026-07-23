import { useEffect, useSyncExternalStore } from "react"
import {
  fetchSessionMessagesWithRetry,
  HISTORY_TRANSCRIPT_MESSAGE_LIMIT,
  INITIAL_TRANSCRIPT_MESSAGE_LIMIT,
  type SessionMessagesPage,
} from "./session-messages"
import type { MessageInfo, MessagePart, MessageWithParts } from "./chat-types"
import { upsertMessagePart } from "./chat-reducer"
import { STREAMING_PART_RAW_FIELD } from "./chat-stream-event-buffer"
import { reconcileTerminalAssistantParts } from "./chat-tool-parts"

// Category: query adapter / external normalized cache. This module owns server transcript
// snapshots so the monolithic chat Zustand store does not mirror message arrays.

export const TRANSCRIPT_CACHE_LIMIT = 40
export const TRANSCRIPT_FRESHNESS_MS = 15_000

const SESSION_KEY_SEPARATOR = "\u0000"
const EMPTY_MESSAGES: MessageWithParts[] = []
const EMPTY_MESSAGE_INFOS: MessageInfo[] = []
const EMPTY_PARTS: MessagePart[] = []
const EMPTY_META: TranscriptSessionMeta = {
  loading: false,
  complete: false,
  cursor: undefined,
  loaded: false,
  updatedAt: undefined,
}

type Listener = () => void

type TranscriptSessionMeta = {
  loading: boolean
  complete: boolean
  cursor: string | undefined
  loaded: boolean
  updatedAt: number | undefined
}

type TranscriptPageMode = "replace" | "prepend"

type TranscriptLoadState = {
  touchedMessages: Set<string>
  removedMessages: Set<string>
  retainedMessages: Set<string>
  touchedParts: Map<string, Set<string>>
  removedParts: Map<string, Set<string>>
  orphanParents: Set<string>
}

type TranscriptSessionRecord = {
  directory: string
  sessionID: string
  messageIDs: string[]
  messagesByID: Map<string, MessageInfo>
  partIDsByMessageID: Map<string, string[]>
  partsByID: Map<string, MessagePart>
  streamingFieldsByPartID: Map<string, Map<string, string>>
  orphanPartsByMessageID: Map<string, Map<string, MessagePart>>
  removedMessages: Set<string>
  removedPartsByMessageID: Map<string, Set<string>>
  loading: boolean
  complete: boolean
  cursor: string | undefined
  updatedAt: number | undefined
  messageSnapshot: MessageWithParts[] | undefined
  metaSnapshot: TranscriptSessionMeta | undefined
}

type LoadTranscriptInput = {
  force?: boolean
  limit?: number
  before?: string
  mode?: TranscriptPageMode
  shouldRetryMissing?: (error: unknown) => Promise<boolean>
}

type TranscriptSessionIdentity = {
  directory: string
  sessionID: string
}

const records = new Map<string, TranscriptSessionRecord>()
const recordKeyByMessageID = new Map<string, string>()
const recordKeyByPartID = new Map<string, string>()
const sessionListeners = new Map<string, Set<Listener>>()
const messageListeners = new Map<string, Set<Listener>>()
const partListeners = new Map<string, Set<Listener>>()
const messageSnapshotCache = new Map<string, { messageIDs: string[]; messages: MessageInfo[] }>()
const partsSnapshotCache = new Map<string, { partIDs: string[]; parts: MessagePart[] }>()
const activeLoads = new Map<string, TranscriptLoadState>()
const inFlightLoads = new Map<string, Promise<MessageWithParts[]>>()
const pinnedSessions = new Map<string, number>()
const runningSessions = new Set<string>()
const optimisticSessions = new Set<string>()
const pendingInputSessions = new Map<string, number>()
const pendingInputSessionByRequest = new Map<string, string>()
const seenSessions = new Set<string>()

function transcriptSessionKey(input: TranscriptSessionIdentity) {
  return `${input.directory}${SESSION_KEY_SEPARATOR}${input.sessionID}`
}

function indexRecordEntities(record: TranscriptSessionRecord) {
  const key = transcriptSessionKey(record)
  for (const messageID of record.messagesByID.keys()) {
    recordKeyByMessageID.set(messageID, key)
  }
  for (const partID of record.partsByID.keys()) {
    recordKeyByPartID.set(partID, key)
  }
}

function unindexRecordEntities(record: TranscriptSessionRecord) {
  const key = transcriptSessionKey(record)
  for (const messageID of record.messagesByID.keys()) {
    if (recordKeyByMessageID.get(messageID) === key) recordKeyByMessageID.delete(messageID)
  }
  for (const partID of record.partsByID.keys()) {
    if (recordKeyByPartID.get(partID) === key) recordKeyByPartID.delete(partID)
  }
}

function listenerSet(map: Map<string, Set<Listener>>, key: string) {
  const existing = map.get(key)
  if (existing) return existing
  const created = new Set<Listener>()
  map.set(key, created)
  return created
}

function subscribeToKey(map: Map<string, Set<Listener>>, key: string, listener: Listener) {
  const listeners = listenerSet(map, key)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      map.delete(key)
    }
  }
}

function emitKey(map: Map<string, Set<Listener>>, key: string) {
  const listeners = map.get(key)
  if (!listeners) return
  for (const listener of Array.from(listeners)) {
    listener()
  }
}

function emitSession(key: string) {
  emitKey(sessionListeners, key)
}

function emitMessage(messageID: string) {
  messageSnapshotCache.clear()
  emitKey(messageListeners, messageID)
}

function emitPart(partID: string) {
  partsSnapshotCache.clear()
  emitKey(partListeners, partID)
}

function emptyRecord(input: TranscriptSessionIdentity): TranscriptSessionRecord {
  return {
    directory: input.directory,
    sessionID: input.sessionID,
    messageIDs: [],
    messagesByID: new Map(),
    partIDsByMessageID: new Map(),
    partsByID: new Map(),
    streamingFieldsByPartID: new Map(),
    orphanPartsByMessageID: new Map(),
    removedMessages: new Set(),
    removedPartsByMessageID: new Map(),
    loading: false,
    complete: false,
    cursor: undefined,
    updatedAt: undefined,
    messageSnapshot: undefined,
    metaSnapshot: undefined,
  }
}

function getOrCreateRecord(input: TranscriptSessionIdentity) {
  const key = transcriptSessionKey(input)
  const existing = records.get(key)
  if (existing) {
    touchSession(key)
    return existing
  }

  const created = emptyRecord(input)
  records.set(key, created)
  touchSession(key)
  return created
}

function touchSession(key: string) {
  seenSessions.delete(key)
  seenSessions.add(key)
  evictStaleSessions()
}

function protectedSessionKeys() {
  return new Set([
    ...pinnedSessions.keys(),
    ...runningSessions,
    ...optimisticSessions,
    ...pendingInputSessions.keys(),
    ...activeLoads.keys(),
    ...inFlightLoads.keys(),
  ])
}

function evictStaleSessions() {
  if (records.size <= TRANSCRIPT_CACHE_LIMIT) return
  const protectedKeys = protectedSessionKeys()

  for (const key of Array.from(seenSessions)) {
    if (records.size <= TRANSCRIPT_CACHE_LIMIT) return
    if (protectedKeys.has(key)) continue
    const record = records.get(key)
    if (!record) continue
    unindexRecordEntities(record)
    records.delete(key)
    seenSessions.delete(key)
    activeLoads.delete(key)
    inFlightLoads.delete(key)
    pinnedSessions.delete(key)
    runningSessions.delete(key)
    optimisticSessions.delete(key)
    pendingInputSessions.delete(key)
    for (const [requestKey, sessionKey] of pendingInputSessionByRequest) {
      if (sessionKey === key) pendingInputSessionByRequest.delete(requestKey)
    }
    partsSnapshotCache.clear()
    for (const messageID of record.messageIDs) {
      emitMessage(messageID)
    }
    for (const partID of record.partsByID.keys()) {
      emitPart(partID)
    }
    emitSession(key)
  }
}

function invalidateSessionSnapshot(record: TranscriptSessionRecord) {
  record.messageSnapshot = undefined
  record.metaSnapshot = undefined
}

function invalidateMetaSnapshot(record: TranscriptSessionRecord) {
  record.metaSnapshot = undefined
}

function sortedMessageIDs(messages: Iterable<MessageInfo>) {
  return Array.from(messages)
    .toSorted((left, right) => compareMessages(left, right))
    .map((message) => message.id)
}

function sortedPartIDs(parts: Iterable<MessagePart>) {
  return Array.from(parts)
    .toSorted((left, right) => compareIDs(left.id, right.id))
    .map((part) => part.id)
}

function compareIDs(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareMessages(left: MessageInfo, right: MessageInfo) {
  const leftCreated = left.time.created
  const rightCreated = right.time.created
  if (leftCreated !== rightCreated) return leftCreated - rightCreated
  return compareIDs(left.id, right.id)
}

function existingMessages(record: TranscriptSessionRecord) {
  return readTranscriptMessages(record)
}

function replaceRecordMessages(record: TranscriptSessionRecord, messages: MessageWithParts[]) {
  const reconciledMessages = reconcileTerminalAssistantParts(messages)
  const previousPartsByID = record.partsByID
  unindexRecordEntities(record)
  const messagesByID = new Map<string, MessageInfo>()
  const partIDsByMessageID = new Map<string, string[]>()
  const partsByID = new Map<string, MessagePart>()

  for (const message of reconciledMessages) {
    messagesByID.set(message.info.id, message.info)
    partIDsByMessageID.set(message.info.id, sortedPartIDs(message.parts))
    for (const part of message.parts) {
      partsByID.set(part.id, part)
    }
  }

  record.messagesByID = messagesByID
  record.partIDsByMessageID = partIDsByMessageID
  record.partsByID = partsByID
  record.messageIDs = sortedMessageIDs(record.messagesByID.values())
  indexRecordEntities(record)
  for (const partID of Array.from(record.streamingFieldsByPartID.keys())) {
    if (partsByID.get(partID) !== previousPartsByID.get(partID)) {
      record.streamingFieldsByPartID.delete(partID)
    }
  }
  invalidateSessionSnapshot(record)
}

function removeRecordMessage(record: TranscriptSessionRecord, messageID: string) {
  const key = transcriptSessionKey(record)
  const partIDs = record.partIDsByMessageID.get(messageID) ?? []
  record.messagesByID.delete(messageID)
  if (recordKeyByMessageID.get(messageID) === key) recordKeyByMessageID.delete(messageID)
  record.partIDsByMessageID.delete(messageID)
  for (const partID of partIDs) {
    record.partsByID.delete(partID)
    if (recordKeyByPartID.get(partID) === key) recordKeyByPartID.delete(partID)
    record.streamingFieldsByPartID.delete(partID)
    emitPart(partID)
  }
  record.orphanPartsByMessageID.delete(messageID)
  record.removedMessages.add(messageID)
  record.removedPartsByMessageID.delete(messageID)
  record.messageIDs = record.messageIDs.filter((id) => id !== messageID)
  invalidateSessionSnapshot(record)
  emitMessage(messageID)
}

function removeRecordPart(
  record: TranscriptSessionRecord,
  input: { messageID: string; partID: string },
) {
  const key = transcriptSessionKey(record)
  record.partsByID.delete(input.partID)
  if (recordKeyByPartID.get(input.partID) === key) recordKeyByPartID.delete(input.partID)
  record.streamingFieldsByPartID.delete(input.partID)
  const partIDs = record.partIDsByMessageID.get(input.messageID) ?? []
  const nextPartIDs = partIDs.filter((id) => id !== input.partID)
  if (nextPartIDs.length === 0) {
    record.partIDsByMessageID.delete(input.messageID)
  } else {
    record.partIDsByMessageID.set(input.messageID, nextPartIDs)
  }
  const removedParts = record.removedPartsByMessageID.get(input.messageID) ?? new Set<string>()
  removedParts.add(input.partID)
  record.removedPartsByMessageID.set(input.messageID, removedParts)
  invalidateSessionSnapshot(record)
  emitPart(input.partID)
}

function orphanParts(record: TranscriptSessionRecord, messageID: string) {
  const existing = record.orphanPartsByMessageID.get(messageID)
  if (existing) return existing
  const created = new Map<string, MessagePart>()
  record.orphanPartsByMessageID.set(messageID, created)
  return created
}

function mergeOrphans(record: TranscriptSessionRecord, messageID: string, parts: MessagePart[]) {
  const orphaned = record.orphanPartsByMessageID.get(messageID)
  if (!orphaned) return parts
  const merged = new Map<string, MessagePart>()
  for (const part of parts) {
    merged.set(part.id, part)
  }
  for (const part of orphaned.values()) {
    merged.set(part.id, part)
  }
  record.orphanPartsByMessageID.delete(messageID)
  return Array.from(merged.values()).toSorted((left, right) => compareIDs(left.id, right.id))
}

function recordParts(record: TranscriptSessionRecord, messageID: string) {
  return (record.partIDsByMessageID.get(messageID) ?? []).flatMap((partID) => {
    const part = record.partsByID.get(partID)
    return part ? [part] : []
  })
}

function toolPresentationMetadata(part: MessagePart): unknown {
  if (!isRecord(part.metadata)) return undefined
  const buddy = part.metadata.buddy
  return isRecord(buddy) ? buddy.presentation : undefined
}

function toolStateStatus(part: MessagePart): unknown {
  return isRecord(part.state) ? part.state.status : undefined
}

function partStructureChanged(previous: MessagePart | undefined, next: MessagePart) {
  if (!previous) return true
  if (previous.type === "tool" && next.type === "tool") {
    return (
      previous.tool !== next.tool ||
      toolStateStatus(previous) !== toolStateStatus(next) ||
      JSON.stringify(toolPresentationMetadata(previous)) !==
        JSON.stringify(toolPresentationMetadata(next))
    )
  }
  return (
    previous.type !== next.type ||
    previous.tool !== next.tool ||
    partTimelineRenderable(previous) !== partTimelineRenderable(next)
  )
}

function partTimelineRenderable(part: MessagePart) {
  if (part.type !== "text" && part.type !== "reasoning") return true
  return typeof part.text === "string" && part.text.trim().length > 0
}

function upsertRecordPartSnapshot(record: TranscriptSessionRecord, part: MessagePart) {
  const key = transcriptSessionKey(record)
  const previousParts = recordParts(record, part.messageID)
  const previousByID = new Map(previousParts.map((current) => [current.id, current]))
  const nextParts = upsertMessagePart(previousParts, part)
  const nextIDs = new Set(nextParts.map((current) => current.id))
  let structural = previousParts.length !== nextParts.length

  for (const previous of previousParts) {
    if (nextIDs.has(previous.id)) continue
    record.partsByID.delete(previous.id)
    if (recordKeyByPartID.get(previous.id) === key) recordKeyByPartID.delete(previous.id)
    record.streamingFieldsByPartID.delete(previous.id)
    emitPart(previous.id)
  }
  for (const next of nextParts) {
    structural ||= partStructureChanged(previousByID.get(next.id), next)
    record.partsByID.set(next.id, next)
    recordKeyByPartID.set(next.id, key)
  }

  record.partIDsByMessageID.set(
    part.messageID,
    nextParts.map((current) => current.id),
  )
  record.streamingFieldsByPartID.delete(part.id)
  invalidateSessionSnapshot(record)
  emitPart(part.id)
  return structural
}

function reconcileRecordTerminalAssistantMessage(
  record: TranscriptSessionRecord,
  messageID: string,
  info: MessageInfo | undefined = record.messagesByID.get(messageID),
) {
  if (!info) return false

  const reconciled = reconcileTerminalAssistantParts([
    {
      info,
      parts: recordParts(record, messageID),
    },
  ])[0]
  if (!reconciled) return false

  let changed = false
  const previousInfo = record.messagesByID.get(messageID)
  if (previousInfo !== reconciled.info) {
    record.messagesByID.set(messageID, reconciled.info)
    recordKeyByMessageID.set(messageID, transcriptSessionKey(record))
    changed = true
    emitMessage(messageID)
  }

  for (const part of reconciled.parts) {
    if (record.partsByID.get(part.id) === part) continue
    record.partsByID.set(part.id, part)
    recordKeyByPartID.set(part.id, transcriptSessionKey(record))
    record.streamingFieldsByPartID.delete(part.id)
    changed = true
    emitPart(part.id)
  }

  if (changed) invalidateSessionSnapshot(record)
  return changed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function appendStreamingField(
  record: TranscriptSessionRecord,
  part: MessagePart,
  input: { field: string; delta: string },
) {
  const fields = record.streamingFieldsByPartID.get(part.id) ?? new Map<string, string>()
  const accumulated = fields.get(input.field)

  if (input.field === STREAMING_PART_RAW_FIELD) {
    const state = isRecord(part.state) ? part.state : undefined
    const current = accumulated ?? (typeof state?.raw === "string" ? state.raw : undefined)
    if (current === undefined) return undefined
    const next = current + input.delta
    fields.set(input.field, next)
    record.streamingFieldsByPartID.set(part.id, fields)
    return {
      ...part,
      state: {
        ...state,
        raw: next,
      },
    }
  }

  // Match OpenCode's event reducer: streamed fields are string fragments, so a
  // sparse part snapshot uses an empty base instead of dropping its first delta.
  const existing = accumulated ?? part[input.field]
  const currentValue = typeof existing === "string" ? existing : ""
  const next = currentValue + input.delta
  fields.set(input.field, next)
  record.streamingFieldsByPartID.set(part.id, fields)
  return {
    ...part,
    [input.field]: next,
  }
}

function recordTouchedMessage(key: string, messageID: string) {
  const load = activeLoads.get(key)
  if (!load) return
  load.touchedMessages.add(messageID)
  load.removedMessages.delete(messageID)
}

function recordRemovedMessage(key: string, messageID: string) {
  const load = activeLoads.get(key)
  if (!load) return
  load.touchedMessages.add(messageID)
  load.removedMessages.add(messageID)
  load.retainedMessages.delete(messageID)
  load.touchedParts.delete(messageID)
  load.removedParts.delete(messageID)
}

function recordTouchedPart(
  key: string,
  record: TranscriptSessionRecord,
  input: { messageID: string; partID: string },
) {
  const load = activeLoads.get(key)
  if (!load) return
  if (record.messagesByID.has(input.messageID)) {
    load.retainedMessages.add(input.messageID)
  } else {
    load.orphanParents.add(input.messageID)
  }
  const parts = load.touchedParts.get(input.messageID) ?? new Set<string>()
  parts.add(input.partID)
  load.touchedParts.set(input.messageID, parts)
  load.removedParts.get(input.messageID)?.delete(input.partID)
}

function recordRemovedPart(key: string, input: { messageID: string; partID: string }) {
  const load = activeLoads.get(key)
  if (!load) return
  const parts = load.touchedParts.get(input.messageID) ?? new Set<string>()
  parts.add(input.partID)
  load.touchedParts.set(input.messageID, parts)
  const removed = load.removedParts.get(input.messageID) ?? new Set<string>()
  removed.add(input.partID)
  load.removedParts.set(input.messageID, removed)
}

function loadStateRemovedPart(
  load: TranscriptLoadState | undefined,
  messageID: string,
  partID: string,
) {
  return load?.removedParts.get(messageID)?.has(partID) === true
}

function tombstoneRemovedPart(record: TranscriptSessionRecord, messageID: string, partID: string) {
  return record.removedPartsByMessageID.get(messageID)?.has(partID) === true
}

function shouldPreserveCurrentMessage(input: {
  mode: TranscriptPageMode
  pageComplete: boolean
  oldestFetched: MessageInfo | undefined
  message: MessageInfo
  load: TranscriptLoadState | undefined
}) {
  if (input.mode === "prepend") return true
  if (input.load?.retainedMessages.has(input.message.id)) return true
  if (input.load?.touchedMessages.has(input.message.id)) return true
  if (!input.pageComplete && input.oldestFetched) {
    return compareMessages(input.message, input.oldestFetched) < 0
  }
  return false
}

function applyTranscriptPage(
  record: TranscriptSessionRecord,
  page: SessionMessagesPage,
  input: {
    mode: TranscriptPageMode
    load: TranscriptLoadState | undefined
  },
) {
  const fetchedMessages = page.messages.map((message) => message.info)
  const fetchedByID = new Map<string, MessageInfo>()
  for (const message of fetchedMessages) {
    fetchedByID.set(message.id, message)
  }
  const fetchedPartsByMessageID = new Map<string, MessagePart[]>()
  for (const message of page.messages) {
    fetchedPartsByMessageID.set(message.info.id, message.parts)
  }
  const currentMessages = existingMessages(record)
  const currentByID = new Map<string, MessageWithParts>()
  for (const message of currentMessages) {
    currentByID.set(message.info.id, message)
  }
  const oldestFetched = fetchedMessages.toSorted((left, right) => compareMessages(left, right))[0]
  const nextMessageInfos = new Map<string, MessageInfo>()

  for (const message of fetchedMessages) {
    if (record.removedMessages.has(message.id) || input.load?.removedMessages.has(message.id)) {
      continue
    }
    const current = currentByID.get(message.id)
    nextMessageInfos.set(
      message.id,
      input.load?.touchedMessages.has(message.id) && current ? current.info : message,
    )
  }

  for (const current of currentMessages) {
    if (fetchedByID.has(current.info.id)) continue
    if (record.removedMessages.has(current.info.id)) continue
    if (input.load?.removedMessages.has(current.info.id)) continue
    if (
      shouldPreserveCurrentMessage({
        mode: input.mode,
        pageComplete: page.complete,
        oldestFetched,
        message: current.info,
        load: input.load,
      })
    ) {
      nextMessageInfos.set(current.info.id, current.info)
    }
  }

  const nextMessages = Array.from(nextMessageInfos.values()).toSorted((left, right) =>
    compareMessages(left, right),
  )
  const nextWithParts = nextMessages.map((message) => {
    const fetchedParts = fetchedPartsByMessageID.get(message.id)
    const current = currentByID.get(message.id)
    const currentPartByID = new Map<string, MessagePart>()
    for (const part of current?.parts ?? []) {
      currentPartByID.set(part.id, part)
    }
    const nextPartsByID = new Map<string, MessagePart>()

    if (fetchedParts) {
      for (const part of fetchedParts) {
        if (loadStateRemovedPart(input.load, message.id, part.id)) continue
        if (tombstoneRemovedPart(record, message.id, part.id)) continue
        const currentPart = currentPartByID.get(part.id)
        nextPartsByID.set(
          part.id,
          input.load?.touchedParts.get(message.id)?.has(part.id) && currentPart
            ? currentPart
            : part,
        )
      }
    } else {
      for (const part of current?.parts ?? []) {
        if (loadStateRemovedPart(input.load, message.id, part.id)) continue
        if (tombstoneRemovedPart(record, message.id, part.id)) continue
        nextPartsByID.set(part.id, part)
      }
    }

    for (const partID of input.load?.touchedParts.get(message.id) ?? []) {
      if (loadStateRemovedPart(input.load, message.id, partID)) {
        nextPartsByID.delete(partID)
        continue
      }
      const currentPart = currentPartByID.get(partID)
      if (currentPart) nextPartsByID.set(partID, currentPart)
    }

    return {
      info: message,
      parts: mergeOrphans(
        record,
        message.id,
        Array.from(nextPartsByID.values()).toSorted((left, right) => compareIDs(left.id, right.id)),
      ),
    }
  })

  replaceRecordMessages(record, nextWithParts)
  record.cursor = page.nextCursor
  record.complete = page.complete
  record.updatedAt = Date.now()
  invalidateSessionSnapshot(record)
}

function readTranscriptMessages(record: TranscriptSessionRecord) {
  if (record.messageSnapshot) return record.messageSnapshot
  const messages = record.messageIDs.flatMap((messageID) => {
    const info = record.messagesByID.get(messageID)
    if (!info) return []
    const parts = (record.partIDsByMessageID.get(messageID) ?? []).flatMap((partID) => {
      const part = record.partsByID.get(partID)
      return part ? [part] : []
    })
    return [{ info, parts }]
  })
  record.messageSnapshot = messages
  return messages
}

function readTranscriptMeta(record: TranscriptSessionRecord): TranscriptSessionMeta {
  if (record.metaSnapshot) return record.metaSnapshot
  const snapshot = {
    loading: record.loading,
    complete: record.complete,
    cursor: record.cursor,
    loaded: record.updatedAt !== undefined || record.messageIDs.length > 0,
    updatedAt: record.updatedAt,
  }
  record.metaSnapshot = snapshot
  return snapshot
}

export function getTranscriptMessages(
  directory: string | undefined,
  sessionID: string | undefined,
) {
  if (!directory || !sessionID) return EMPTY_MESSAGES
  return readTranscriptMessages(getOrCreateRecord({ directory, sessionID }))
}

export function getTranscriptMessage(messageID: string | undefined) {
  if (!messageID) return undefined
  const recordKey = recordKeyByMessageID.get(messageID)
  return recordKey ? records.get(recordKey)?.messagesByID.get(messageID) : undefined
}

export function getTranscriptPart(partID: string | undefined) {
  if (!partID) return undefined
  const recordKey = recordKeyByPartID.get(partID)
  return recordKey ? records.get(recordKey)?.partsByID.get(partID) : undefined
}

export function getTranscriptSessionMeta(
  directory: string | undefined,
  sessionID: string | undefined,
) {
  if (!directory || !sessionID) return EMPTY_META
  return readTranscriptMeta(getOrCreateRecord({ directory, sessionID }))
}

export function hasTranscriptMessages(
  directory: string | undefined,
  sessionID: string | undefined,
) {
  if (!directory || !sessionID) return false
  const record = records.get(transcriptSessionKey({ directory, sessionID }))
  return !!record && record.messageIDs.length > 0
}

export function setTranscriptSessionEmpty(directory: string, sessionID: string) {
  const key = transcriptSessionKey({ directory, sessionID })
  const record = getOrCreateRecord({ directory, sessionID })
  replaceRecordMessages(record, [])
  record.cursor = undefined
  record.complete = true
  record.loading = false
  record.updatedAt = Date.now()
  invalidateSessionSnapshot(record)
  emitSession(key)
}

export function applyTranscriptMessageUpdated(directory: string, info: MessageInfo) {
  const key = transcriptSessionKey({ directory, sessionID: info.sessionID })
  const record = getOrCreateRecord({ directory, sessionID: info.sessionID })
  record.removedMessages.delete(info.id)
  recordTouchedMessage(key, info.id)
  const existed = record.messagesByID.has(info.id)
  record.messagesByID.set(info.id, info)
  recordKeyByMessageID.set(info.id, key)
  if (!existed) {
    record.messageIDs = sortedMessageIDs(record.messagesByID.values())
    record.partIDsByMessageID.set(info.id, [])
  }
  const orphaned = record.orphanPartsByMessageID.get(info.id)
  if (orphaned) {
    record.orphanPartsByMessageID.delete(info.id)
    for (const part of orphaned.values()) {
      upsertRecordPartSnapshot(record, part)
    }
  }
  invalidateSessionSnapshot(record)
  emitMessage(info.id)
  reconcileRecordTerminalAssistantMessage(record, info.id)
  emitSession(key)
}

export function applyTranscriptMessageRemoved(
  directory: string,
  input: { sessionID: string; messageID: string },
) {
  const key = transcriptSessionKey({ directory, sessionID: input.sessionID })
  const record = getOrCreateRecord({ directory, sessionID: input.sessionID })
  recordRemovedMessage(key, input.messageID)
  removeRecordMessage(record, input.messageID)
  emitSession(key)
}

export function applyTranscriptPartUpdated(directory: string, part: MessagePart) {
  const key = transcriptSessionKey({ directory, sessionID: part.sessionID })
  const record = getOrCreateRecord({ directory, sessionID: part.sessionID })
  const messageExists = record.messagesByID.has(part.messageID)
  recordTouchedPart(key, record, { messageID: part.messageID, partID: part.id })

  if (!messageExists) {
    record.removedPartsByMessageID.get(part.messageID)?.delete(part.id)
    orphanParts(record, part.messageID).set(part.id, part)
    return
  }

  record.removedPartsByMessageID.get(part.messageID)?.delete(part.id)
  const structural = upsertRecordPartSnapshot(record, part)
  const reconciled = reconcileRecordTerminalAssistantMessage(record, part.messageID)
  if (structural || reconciled) emitSession(key)
}

export function applyTranscriptPartRemoved(
  directory: string,
  input: { sessionID: string; messageID: string; partID: string },
) {
  const key = transcriptSessionKey({ directory, sessionID: input.sessionID })
  const record = getOrCreateRecord({ directory, sessionID: input.sessionID })
  recordRemovedPart(key, input)
  if (record.messagesByID.has(input.messageID)) {
    removeRecordPart(record, input)
    emitSession(key)
    return
  }
  record.orphanPartsByMessageID.get(input.messageID)?.delete(input.partID)
}

export function applyTranscriptPartDelta(
  directory: string,
  input: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
) {
  const key = transcriptSessionKey({ directory, sessionID: input.sessionID })
  const record = getOrCreateRecord({ directory, sessionID: input.sessionID })
  const part = record.partsByID.get(input.partID)
  recordTouchedPart(key, record, input)
  if (!part) {
    const orphaned = record.orphanPartsByMessageID.get(input.messageID)
    const orphanedPart = orphaned?.get(input.partID)
    if (!orphaned || !orphanedPart) return
    const nextOrphanedPart = appendStreamingField(record, orphanedPart, input)
    if (!nextOrphanedPart) return
    orphaned.set(input.partID, nextOrphanedPart)
    return
  }
  const next = appendStreamingField(record, part, input)
  if (!next) return
  const structural = partTimelineRenderable(part) !== partTimelineRenderable(next)
  record.partsByID.set(input.partID, next)
  invalidateSessionSnapshot(record)
  emitPart(input.partID)
  const reconciled = reconcileRecordTerminalAssistantMessage(record, input.messageID)
  if (structural || reconciled) emitSession(key)
}

export function sealTranscriptAssistantMessages(
  directory: string,
  sessionID: string,
  completedAt: number,
) {
  const key = transcriptSessionKey({ directory, sessionID })
  const record = getOrCreateRecord({ directory, sessionID })
  let changed = false

  for (const [messageID, message] of record.messagesByID) {
    if (message.role !== "assistant") continue
    const sealed =
      typeof message.time.completed === "number"
        ? message
        : {
            ...message,
            time: {
              ...message.time,
              completed: completedAt,
            },
          }
    changed = reconcileRecordTerminalAssistantMessage(record, messageID, sealed) || changed
  }

  if (!changed) return
  invalidateSessionSnapshot(record)
  emitSession(key)
}

export function markTranscriptSessionRunning(
  directory: string,
  sessionID: string,
  running: boolean,
) {
  const key = transcriptSessionKey({ directory, sessionID })
  if (running) {
    runningSessions.add(key)
    return
  }
  runningSessions.delete(key)
  evictStaleSessions()
}

export function markTranscriptSessionOptimistic(
  directory: string,
  sessionID: string,
  optimistic: boolean,
) {
  const key = transcriptSessionKey({ directory, sessionID })
  if (optimistic) {
    optimisticSessions.add(key)
    return
  }
  optimisticSessions.delete(key)
  evictStaleSessions()
}

function pendingInputRequestKey(directory: string, requestID: string) {
  return `${directory}${SESSION_KEY_SEPARATOR}${requestID}`
}

export function addTranscriptPendingInput(
  directory: string,
  input: { requestID: string; sessionID: string },
) {
  const requestKey = pendingInputRequestKey(directory, input.requestID)
  if (pendingInputSessionByRequest.has(requestKey)) return
  const sessionKey = transcriptSessionKey({ directory, sessionID: input.sessionID })
  pendingInputSessionByRequest.set(requestKey, sessionKey)
  pendingInputSessions.set(sessionKey, (pendingInputSessions.get(sessionKey) ?? 0) + 1)
}

export function removeTranscriptPendingInput(directory: string, requestID: string) {
  const requestKey = pendingInputRequestKey(directory, requestID)
  const sessionKey = pendingInputSessionByRequest.get(requestKey)
  if (!sessionKey) return
  pendingInputSessionByRequest.delete(requestKey)
  const count = pendingInputSessions.get(sessionKey)
  if (!count || count === 1) {
    pendingInputSessions.delete(sessionKey)
  } else {
    pendingInputSessions.set(sessionKey, count - 1)
  }
  evictStaleSessions()
}

export function syncTranscriptPendingInputs(
  directory: string,
  inputs: ReadonlyArray<{ requestID: string; sessionID: string }>,
) {
  const nextByRequestKey = new Map(
    inputs.map((input) => [
      pendingInputRequestKey(directory, input.requestID),
      transcriptSessionKey({ directory, sessionID: input.sessionID }),
    ]),
  )
  const directoryPrefix = `${directory}${SESSION_KEY_SEPARATOR}`

  for (const [requestKey, sessionKey] of Array.from(pendingInputSessionByRequest)) {
    if (!requestKey.startsWith(directoryPrefix)) continue
    if (nextByRequestKey.get(requestKey) === sessionKey) {
      nextByRequestKey.delete(requestKey)
      continue
    }
    const requestID = requestKey.slice(directoryPrefix.length)
    removeTranscriptPendingInput(directory, requestID)
  }

  for (const [requestKey, sessionKey] of nextByRequestKey) {
    const requestID = requestKey.slice(directoryPrefix.length)
    const sessionID = sessionKey.slice(directoryPrefix.length)
    addTranscriptPendingInput(directory, { requestID, sessionID })
  }
}

export function pinTranscriptSession(directory: string, sessionID: string) {
  const key = transcriptSessionKey({ directory, sessionID })
  pinnedSessions.set(key, (pinnedSessions.get(key) ?? 0) + 1)
  touchSession(key)
  return () => {
    const count = pinnedSessions.get(key)
    if (!count || count === 1) {
      pinnedSessions.delete(key)
    } else {
      pinnedSessions.set(key, count - 1)
    }
    evictStaleSessions()
  }
}

function startLoad(record: TranscriptSessionRecord, key: string) {
  const load: TranscriptLoadState = {
    touchedMessages: new Set(),
    removedMessages: new Set(),
    retainedMessages: new Set(),
    touchedParts: new Map(),
    removedParts: new Map(),
    orphanParents: new Set(),
  }
  activeLoads.set(key, load)
  record.loading = true
  invalidateMetaSnapshot(record)
  emitSession(key)
  return load
}

function finishLoad(record: TranscriptSessionRecord, key: string, load: TranscriptLoadState) {
  if (activeLoads.get(key) === load) {
    activeLoads.delete(key)
  }
  record.loading = false
  invalidateMetaSnapshot(record)
  emitSession(key)
}

function pageStartsInsideAssistantTurn(page: SessionMessagesPage) {
  return page.messages[0]?.info.role === "assistant"
}

function shouldExtendInitialPageToUserBoundary(input: LoadTranscriptInput | undefined) {
  if (input?.before !== undefined) return false
  return (input?.mode ?? "replace") === "replace"
}

async function fetchInitialTranscriptPage(
  directory: string,
  sessionID: string,
  input: {
    limit: number
    shouldRetryMissing?: (error: unknown) => Promise<boolean>
  },
) {
  let page = await fetchSessionMessagesWithRetry(directory, sessionID, {
    limit: input.limit,
    shouldRetryMissing: input.shouldRetryMissing,
  })

  while (!page.complete && page.nextCursor && pageStartsInsideAssistantTurn(page)) {
    const older = await fetchSessionMessagesWithRetry(directory, sessionID, {
      limit: HISTORY_TRANSCRIPT_MESSAGE_LIMIT,
      before: page.nextCursor,
      shouldRetryMissing: input.shouldRetryMissing,
    })
    if (older.messages.length === 0) {
      return {
        messages: page.messages,
        nextCursor: older.nextCursor,
        complete: older.complete,
      }
    }
    page = {
      messages: [...older.messages, ...page.messages],
      nextCursor: older.nextCursor,
      complete: older.complete,
    }
  }

  return page
}

export async function loadTranscriptMessages(
  directory: string,
  sessionID: string,
  input?: LoadTranscriptInput,
) {
  const key = transcriptSessionKey({ directory, sessionID })
  const record = getOrCreateRecord({ directory, sessionID })
  const pending = inFlightLoads.get(key)
  if (pending) return pending

  const fresh =
    record.updatedAt !== undefined && Date.now() - record.updatedAt <= TRANSCRIPT_FRESHNESS_MS
  const requestedLimit = input?.limit ?? INITIAL_TRANSCRIPT_MESSAGE_LIMIT
  if (
    !input?.force &&
    fresh &&
    record.messageIDs.length >= requestedLimit &&
    (record.complete || input?.before === undefined)
  ) {
    return readTranscriptMessages(record)
  }

  const load = startLoad(record, key)
  const promise = (
    shouldExtendInitialPageToUserBoundary(input)
      ? fetchInitialTranscriptPage(directory, sessionID, {
          limit: requestedLimit,
          shouldRetryMissing: input?.shouldRetryMissing,
        })
      : fetchSessionMessagesWithRetry(directory, sessionID, {
          limit: requestedLimit,
          before: input?.before,
          shouldRetryMissing: input?.shouldRetryMissing,
        })
  )
    .then((page) => {
      applyTranscriptPage(record, page, {
        mode: input?.mode ?? "replace",
        load: activeLoads.get(key) === load ? load : undefined,
      })
      emitSession(key)
      return readTranscriptMessages(record)
    })
    .finally(() => {
      finishLoad(record, key, load)
      if (inFlightLoads.get(key) === promise) {
        inFlightLoads.delete(key)
      }
    })
  inFlightLoads.set(key, promise)
  return promise
}

export async function loadOlderTranscriptMessages(directory: string, sessionID: string) {
  const record = getOrCreateRecord({ directory, sessionID })
  if (record.loading || record.complete || !record.cursor) {
    return readTranscriptMessages(record)
  }
  return loadTranscriptMessages(directory, sessionID, {
    limit: HISTORY_TRANSCRIPT_MESSAGE_LIMIT,
    before: record.cursor,
    mode: "prepend",
    force: true,
  })
}

export function useTranscriptSessionMessages(
  directory: string | undefined,
  sessionID: string | undefined,
) {
  useEffect(() => {
    if (!directory || !sessionID) return undefined
    return pinTranscriptSession(directory, sessionID)
  }, [directory, sessionID])

  return useSyncExternalStore(
    (listener) =>
      directory && sessionID
        ? subscribeToKey(sessionListeners, transcriptSessionKey({ directory, sessionID }), listener)
        : () => undefined,
    () => getTranscriptMessages(directory, sessionID),
    () => EMPTY_MESSAGES,
  )
}

export function useTranscriptSessionMeta(
  directory: string | undefined,
  sessionID: string | undefined,
) {
  return useSyncExternalStore(
    (listener) =>
      directory && sessionID
        ? subscribeToKey(sessionListeners, transcriptSessionKey({ directory, sessionID }), listener)
        : () => undefined,
    () => getTranscriptSessionMeta(directory, sessionID),
    () => EMPTY_META,
  )
}

export function useTranscriptMessage(messageID: string | undefined) {
  return useSyncExternalStore(
    (listener) =>
      messageID ? subscribeToKey(messageListeners, messageID, listener) : () => undefined,
    () => getTranscriptMessage(messageID),
    () => undefined,
  )
}

function transcriptMessagesKey(messageIDs: readonly string[]) {
  return messageIDs.join(SESSION_KEY_SEPARATOR)
}

function getTranscriptMessageInfos(messageIDs: readonly string[]) {
  if (messageIDs.length === 0) return EMPTY_MESSAGE_INFOS
  const key = transcriptMessagesKey(messageIDs)
  const messages = messageIDs.flatMap((messageID) => {
    const message = getTranscriptMessage(messageID)
    return message ? [message] : []
  })
  const cached = messageSnapshotCache.get(key)
  if (
    cached &&
    cached.messageIDs.length === messageIDs.length &&
    cached.messageIDs.every((messageID, index) => messageID === messageIDs[index]) &&
    cached.messages.length === messages.length &&
    cached.messages.every((message, index) => message === messages[index])
  ) {
    return cached.messages
  }
  messageSnapshotCache.set(key, { messageIDs: [...messageIDs], messages })
  return messages
}

export function useTranscriptMessages(messageIDs: readonly string[]) {
  return useSyncExternalStore(
    (listener) => {
      const cleanups = messageIDs.map((messageID) =>
        subscribeToKey(messageListeners, messageID, listener),
      )
      return () => {
        for (const cleanup of cleanups) {
          cleanup()
        }
      }
    },
    () => getTranscriptMessageInfos(messageIDs),
    () => EMPTY_MESSAGE_INFOS,
  )
}

export function useTranscriptPart(partID: string | undefined) {
  return useSyncExternalStore(
    (listener) => (partID ? subscribeToKey(partListeners, partID, listener) : () => undefined),
    () => getTranscriptPart(partID),
    () => undefined,
  )
}

function transcriptPartsKey(partIDs: readonly string[]) {
  return partIDs.join(SESSION_KEY_SEPARATOR)
}

function getTranscriptParts(partIDs: readonly string[]) {
  if (partIDs.length === 0) return EMPTY_PARTS
  const key = transcriptPartsKey(partIDs)
  const parts = partIDs.flatMap((partID) => {
    const part = getTranscriptPart(partID)
    return part ? [part] : []
  })
  const cached = partsSnapshotCache.get(key)
  if (
    cached &&
    cached.partIDs.length === partIDs.length &&
    cached.partIDs.every((partID, index) => partID === partIDs[index]) &&
    cached.parts.length === parts.length &&
    cached.parts.every((part, index) => part === parts[index])
  ) {
    return cached.parts
  }
  partsSnapshotCache.set(key, { partIDs: [...partIDs], parts })
  return parts
}

export function useTranscriptParts(partIDs: readonly string[]) {
  return useSyncExternalStore(
    (listener) => {
      const cleanups = partIDs.map((partID) => subscribeToKey(partListeners, partID, listener))
      return () => {
        for (const cleanup of cleanups) {
          cleanup()
        }
      }
    },
    () => getTranscriptParts(partIDs),
    () => EMPTY_PARTS,
  )
}

export function resetTranscriptRepositoryForTests() {
  records.clear()
  recordKeyByMessageID.clear()
  recordKeyByPartID.clear()
  sessionListeners.clear()
  messageListeners.clear()
  partListeners.clear()
  messageSnapshotCache.clear()
  partsSnapshotCache.clear()
  activeLoads.clear()
  inFlightLoads.clear()
  pinnedSessions.clear()
  runningSessions.clear()
  optimisticSessions.clear()
  pendingInputSessions.clear()
  pendingInputSessionByRequest.clear()
  seenSessions.clear()
}
