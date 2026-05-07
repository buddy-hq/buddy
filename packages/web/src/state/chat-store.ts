import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "../context/platform"
import type {
  DirectoryChatState,
  MessageInfo,
  MessagePart,
  MessageWithParts,
  McpStatusMap,
  PermissionRequest,
  QuestionRequest,
  ProviderCatalogState,
  SessionStatusInfo,
  SessionInfo,
} from "./chat-types"
import {
  appendPartDelta,
  removeMessage,
  removePart,
  upsertMessage,
  upsertPart,
} from "./chat-reducer"
import { IDLE_SESSION_STATUS, isSessionWorking, sessionStatusEquals } from "./session-status"

type StreamStatus = "idle" | "connecting" | "connected" | "error"

type ReadingTrailEntry = {
  tocLabel: string
  cfi?: string
  fraction?: number
}

type AnnotationSummaryEntry = {
  text: string
  tocLabel?: string
  note?: string
}

const READING_TRAIL_MAX_ENTRIES = 20

export type ActiveReadingResourceState = {
  resourceID?: string
  alias?: string
  name: string
  path: string
  status?: "preparing" | "ready" | "unsupported" | "error" | "stale" | "unprocessed"
  cfi?: string
  index?: number
  fraction?: number
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
  currentPassageText?: string
  visibleStartText?: string
  visibleEndText?: string
  readingTrail?: ReadingTrailEntry[]
  annotationSummary?: AnnotationSummaryEntry[]
}

type LastOpenedReadingResource = {
  resourceID?: string
  name: string
  path: string
}

type ChatStore = {
  openProjects: string[]
  activeDirectory?: string
  pendingActiveDirectory?: string
  entryError?: string
  lastSessionByDirectory: Record<string, string>
  selectedModelByDirectory: Record<string, string>
  activeReadingResourceByDirectory: Record<string, ActiveReadingResourceState>
  linkedSessionByResource: Record<string, string>
  lastOpenedReadingResourceByDirectory: Record<string, LastOpenedReadingResource>
  directories: Record<string, DirectoryChatState>
  streamStatus: StreamStatus
  ensureOpenProject: (directory: string) => void
  setOpenProjects: (directories: string[]) => void
  closeProject: (directory: string) => void
  setActiveDirectory: (directory: string) => void
  setDirectoryReady: (directory: string, ready: boolean) => void
  setDirectoryError: (directory: string, error?: string) => void
  clearDirectoryError: (directory: string) => void
  setSessions: (directory: string, sessions: SessionInfo[]) => void
  setActiveSession: (directory: string, sessionID?: string) => void
  startSessionDraft: (directory: string) => void
  setSessionInfo: (directory: string, info: SessionInfo) => void
  setMessages: (directory: string, sessionID: string, messages: MessageWithParts[]) => void
  applySessionUpdated: (directory: string, info: SessionInfo) => void
  applySessionStatus: (directory: string, sessionID: string, status: SessionStatusInfo) => void
  applyMessageUpdated: (directory: string, info: MessageInfo) => void
  applyMessageRemoved: (directory: string, input: { sessionID: string; messageID: string }) => void
  applyPartUpdated: (directory: string, part: MessagePart) => void
  applyPartRemoved: (
    directory: string,
    input: { sessionID: string; messageID: string; partID: string },
  ) => void
  applyPartDelta: (
    directory: string,
    input: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
  ) => void
  setPendingPermissions: (directory: string, requests: PermissionRequest[]) => void
  setPendingQuestions: (directory: string, requests: QuestionRequest[]) => void
  setProviders: (directory: string, input: ProviderCatalogState) => void
  setMcpStatus: (directory: string, input: McpStatusMap) => void
  applyPermissionAsked: (directory: string, request: PermissionRequest) => void
  applyPermissionReplied: (directory: string, requestID: string) => void
  applyQuestionAsked: (directory: string, request: QuestionRequest) => void
  applyQuestionResolved: (directory: string, requestID: string) => void
  setSelectedModel: (directory: string, model: string) => void
  setActiveReadingResource: (
    directory: string,
    resource: ActiveReadingResourceState | undefined,
  ) => void
  updateActiveReadingResourceLocation: (
    directory: string,
    input: Pick<
      ActiveReadingResourceState,
      | "cfi"
      | "index"
      | "fraction"
      | "locationLabel"
      | "tocLabel"
      | "pageLabel"
      | "currentPassageText"
    >,
  ) => void
  linkReadingResourceSession: (directory: string, resourceID: string, sessionID: string) => void
  appendReadingTrailEntry: (
    directory: string,
    entry: { tocLabel: string; cfi?: string; fraction?: number },
  ) => void
  setActiveReadingAnnotationSummary: (directory: string, summary: AnnotationSummaryEntry[]) => void
  setLastOpenedReadingResource: (
    directory: string,
    resource: LastOpenedReadingResource | undefined,
  ) => void
  setEntryError: (error?: string) => void
  setStreamStatus: (status: StreamStatus) => void
  resetRuntimeState: () => void
}

type ChatStoreStateFields = Pick<
  ChatStore,
  | "openProjects"
  | "activeDirectory"
  | "pendingActiveDirectory"
  | "entryError"
  | "lastSessionByDirectory"
  | "selectedModelByDirectory"
  | "activeReadingResourceByDirectory"
  | "linkedSessionByResource"
  | "lastOpenedReadingResourceByDirectory"
  | "directories"
  | "streamStatus"
>

function resourceSessionKey(directory: string, resourceID: string) {
  return `${directory}::${resourceID}`
}

const DEFAULT_TITLE = "New thread"
const CHAT_STORAGE_FILE = "buddy.chat.dat"
const CHAT_STORAGE_KEY = "buddy.chat.v4"
const STREAM_STATUS_IDLE: StreamStatus = "idle"

type PersistedChatStoreState = {
  activeDirectory?: string
  lastSessionByDirectory?: Record<string, string>
  activeReadingResourceByDirectory?: Record<string, ActiveReadingResourceState>
  linkedSessionByResource?: Record<string, string>
  lastOpenedReadingResourceByDirectory?: Record<string, LastOpenedReadingResource>
}

function normalizeProjectDirectory(input: string | undefined) {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed || trimmed === "/") return undefined
  return trimmed.replace(/\/+$/, "") || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry
    }
  }
  return result
}

function isLastOpenedReadingResource(value: unknown): value is LastOpenedReadingResource {
  if (!isRecord(value)) return false
  return (
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    (value.resourceID === undefined || typeof value.resourceID === "string")
  )
}

function readLastOpenedReadingResourceRecord(
  value: unknown,
): Record<string, LastOpenedReadingResource> | undefined {
  if (!isRecord(value)) return undefined
  const result: Record<string, LastOpenedReadingResource> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isLastOpenedReadingResource(entry)) {
      result[key] = entry
    }
  }
  return result
}

function isActiveReadingResourceState(value: unknown): value is ActiveReadingResourceState {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    (value.resourceID === undefined || typeof value.resourceID === "string") &&
    (value.alias === undefined || typeof value.alias === "string") &&
    (value.status === undefined ||
      value.status === "preparing" ||
      value.status === "ready" ||
      value.status === "unsupported" ||
      value.status === "error" ||
      value.status === "stale" ||
      value.status === "unprocessed") &&
    (value.cfi === undefined || typeof value.cfi === "string") &&
    (value.index === undefined || typeof value.index === "number") &&
    (value.fraction === undefined || typeof value.fraction === "number") &&
    (value.locationLabel === undefined || typeof value.locationLabel === "string") &&
    (value.tocLabel === undefined || typeof value.tocLabel === "string") &&
    (value.pageLabel === undefined || typeof value.pageLabel === "string") &&
    (value.currentPassageText === undefined || typeof value.currentPassageText === "string") &&
    (value.visibleStartText === undefined || typeof value.visibleStartText === "string") &&
    (value.visibleEndText === undefined || typeof value.visibleEndText === "string") &&
    (value.readingTrail === undefined || Array.isArray(value.readingTrail)) &&
    (value.annotationSummary === undefined || Array.isArray(value.annotationSummary))
  )
}

function stripTransientActiveReadingResourceFields(
  value: ActiveReadingResourceState,
): ActiveReadingResourceState {
  const {
    currentPassageText: _currentPassageText,
    visibleStartText: _visibleStartText,
    visibleEndText: _visibleEndText,
    readingTrail: _readingTrail,
    annotationSummary: _annotationSummary,
    ...persisted
  } = value
  return persisted
}

function readActiveReadingResourceRecord(
  value: unknown,
): Record<string, ActiveReadingResourceState> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const result: Record<string, ActiveReadingResourceState> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isActiveReadingResourceState(entry)) {
      result[key] = stripTransientActiveReadingResourceFields(entry)
    }
  }
  return result
}

function readPersistedChatStoreState(value: unknown): PersistedChatStoreState {
  if (!isRecord(value)) {
    return {}
  }

  return {
    activeDirectory: typeof value.activeDirectory === "string" ? value.activeDirectory : undefined,
    lastSessionByDirectory: readStringRecord(value.lastSessionByDirectory),
    activeReadingResourceByDirectory: readActiveReadingResourceRecord(
      value.activeReadingResourceByDirectory,
    ),
    linkedSessionByResource: readStringRecord(value.linkedSessionByResource),
    lastOpenedReadingResourceByDirectory: readLastOpenedReadingResourceRecord(
      value.lastOpenedReadingResourceByDirectory,
    ),
  }
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0
}

function emptyDirectoryState(): DirectoryChatState {
  return {
    isDraft: false,
    sessionTitle: DEFAULT_TITLE,
    sessions: [],
    sessionStatusByID: {},
    messages: [],
    messagesBySessionID: {},
    orphanPartsByMessageID: {},
    pendingPermissions: [],
    pendingQuestions: [],
    providers: [],
    providerDefault: {},
    mcpStatus: {},
    isBusy: false,
    isReady: false,
  }
}

function createChatStoreStateFields(): ChatStoreStateFields {
  return {
    openProjects: [],
    activeDirectory: undefined,
    pendingActiveDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    selectedModelByDirectory: {},
    activeReadingResourceByDirectory: {},
    linkedSessionByResource: {},
    lastOpenedReadingResourceByDirectory: {},
    directories: {},
    streamStatus: STREAM_STATUS_IDLE,
  }
}

function ensureDirectoryState(
  directories: Record<string, DirectoryChatState>,
  directory: string,
): DirectoryChatState {
  const existing = directories[directory]
  if (existing) {
    return existing
  }

  const created = emptyDirectoryState()
  directories[directory] = created
  return created
}

function hasDraftSelection(state: DirectoryChatState | undefined) {
  if (!state) return false
  return state.sessionID === undefined && (state.isReady || state.isDraft === true)
}

function sortSessions(sessions: SessionInfo[]) {
  return sessions
    .filter((session) => !session.time.archived)
    .slice()
    .toSorted((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
}

function upsertSession(sessions: SessionInfo[], incoming: SessionInfo) {
  if (incoming.time.archived) {
    return sortSessions(sessions.filter((session) => session.id !== incoming.id))
  }

  const index = sessions.findIndex((session) => session.id === incoming.id)
  if (index === -1) {
    return sortSessions([...sessions, incoming])
  }

  const next = sessions.slice()
  next[index] = incoming
  return sortSessions(next)
}

function findSessionInfo(sessions: SessionInfo[], sessionID: string | undefined) {
  if (!sessionID) return undefined
  return sessions.find((session) => session.id === sessionID)
}

function resolveActiveSessionBusy(input: {
  sessionID: string | undefined
  sessions: SessionInfo[]
  sessionStatusByID: Record<string, SessionStatusInfo>
  messages?: MessageWithParts[]
}) {
  if (!input.sessionID) return false

  return isSessionWorking({
    info: findSessionInfo(input.sessions, input.sessionID),
    status: input.sessionStatusByID[input.sessionID],
    messages: input.messages,
  })
}

function sessionMessages(state: DirectoryChatState, sessionID: string | undefined) {
  if (!sessionID) return []
  return (
    state.messagesBySessionID?.[sessionID] ?? (state.sessionID === sessionID ? state.messages : [])
  )
}

function nextMessagesBySession(
  state: DirectoryChatState,
  sessionID: string,
  messages: MessageWithParts[],
) {
  return {
    ...state.messagesBySessionID,
    [sessionID]: messages,
  }
}

function mergeLiveSessionMessages(
  currentMessages: MessageWithParts[],
  incomingMessages: MessageWithParts[],
) {
  if (currentMessages.length === 0) {
    return incomingMessages
  }

  let nextMessages = incomingMessages
  for (const currentMessage of currentMessages) {
    nextMessages = upsertMessage(nextMessages, currentMessage.info)
    for (const currentPart of currentMessage.parts) {
      nextMessages = upsertPart(nextMessages, currentPart)
    }
  }
  return nextMessages
}

function shouldPreserveMissingActiveSession(
  state: DirectoryChatState,
  sessionID: string | undefined,
) {
  if (!sessionID) return false
  return state.isBusy
}

function upsertOrphanPart(parts: MessagePart[], incoming: MessagePart) {
  const index = parts.findIndex((part) => part.id === incoming.id)
  if (index === -1) {
    const insertIndex = parts.findIndex((part) => part.id > incoming.id)
    if (insertIndex === -1) {
      return [...parts, incoming]
    }
    return [...parts.slice(0, insertIndex), incoming, ...parts.slice(insertIndex)]
  }

  const next = [...parts]
  next[index] = incoming
  return next
}

function appendOrphanPartDelta(
  parts: MessagePart[],
  input: { partID: string; field: string; delta: string },
) {
  const index = parts.findIndex((part) => part.id === input.partID)
  if (index === -1) {
    return parts
  }

  const currentFieldValue = parts[index]?.[input.field]
  if (typeof currentFieldValue !== "string") {
    return parts
  }

  const next = [...parts]
  next[index] = {
    ...next[index],
    [input.field]: currentFieldValue + input.delta,
  }
  return next
}

function removeOrphanPart(parts: MessagePart[], partID: string) {
  const index = parts.findIndex((part) => part.id === partID)
  if (index === -1) {
    return parts
  }

  const next = [...parts]
  next.splice(index, 1)
  return next
}

function nextOrphanPartsByMessage(
  state: DirectoryChatState,
  messageID: string,
  parts: MessagePart[] | undefined,
) {
  const next = { ...state.orphanPartsByMessageID }
  if (!parts || parts.length === 0) {
    delete next[messageID]
    return next
  }

  next[messageID] = parts
  return next
}

function mergeOrphanPartsIntoMessages(
  messages: MessageWithParts[],
  orphanPartsByMessageID: Record<string, MessagePart[]>,
) {
  let nextMessages = messages
  let nextOrphanPartsByMessageID = orphanPartsByMessageID
  let changed = false

  for (const message of messages) {
    const orphanParts = nextOrphanPartsByMessageID[message.info.id]
    if (!orphanParts || orphanParts.length === 0) {
      continue
    }

    changed = true
    for (const part of orphanParts) {
      nextMessages = upsertPart(nextMessages, part)
    }
    if (nextOrphanPartsByMessageID === orphanPartsByMessageID) {
      nextOrphanPartsByMessageID = { ...orphanPartsByMessageID }
    }
    delete nextOrphanPartsByMessageID[message.info.id]
  }

  return changed
    ? { messages: nextMessages, orphanPartsByMessageID: nextOrphanPartsByMessageID }
    : { messages, orphanPartsByMessageID }
}

function pruneOrphanPartsForSession(
  orphanPartsByMessageID: Record<string, MessagePart[]>,
  sessionID: string,
) {
  const next = Object.fromEntries(
    Object.entries(orphanPartsByMessageID).filter(([, parts]) => parts[0]?.sessionID !== sessionID),
  )
  return next
}

function sealCompletedAssistantMessages(messages: MessageWithParts[], completedAt: number) {
  let changed = false

  const nextMessages = messages.map((message) => {
    if (message.info.role !== "assistant" || typeof message.info.time.completed === "number") {
      return message
    }

    changed = true
    return {
      ...message,
      info: {
        ...message.info,
        time: {
          ...message.info.time,
          completed: completedAt,
        },
      },
    }
  })

  return changed ? nextMessages : messages
}

export const useChatStore = create<ChatStore>()(
  persist(
    immer((set, get) => ({
      ...createChatStoreStateFields(),
      ensureOpenProject(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          if (!state.openProjects.includes(normalized)) {
            state.openProjects.unshift(normalized)
          }
          if (!state.directories[normalized]) {
            state.directories[normalized] = emptyDirectoryState()
          }
        })
      },
      setOpenProjects(directories) {
        set((state) => {
          const unique = Array.from(
            new Set(
              directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean),
            ),
          ).filter(isNonEmptyString)

          const preferredActiveDirectory = state.pendingActiveDirectory ?? state.activeDirectory
          const nextActiveDirectory =
            preferredActiveDirectory && unique.includes(preferredActiveDirectory)
              ? preferredActiveDirectory
              : unique[0]

          state.openProjects = unique
          state.activeDirectory = nextActiveDirectory ?? undefined
          state.pendingActiveDirectory = undefined
          state.lastSessionByDirectory = Object.fromEntries(
            Object.entries(state.lastSessionByDirectory).filter(([directory]) =>
              unique.includes(directory),
            ),
          )
          state.activeReadingResourceByDirectory = Object.fromEntries(
            Object.entries(state.activeReadingResourceByDirectory).filter(([directory]) =>
              unique.includes(directory),
            ),
          )
          state.linkedSessionByResource = Object.fromEntries(
            Object.entries(state.linkedSessionByResource).filter(([key]) =>
              unique.some((directory) => key.startsWith(`${directory}::`)),
            ),
          )
          for (const directory of unique) {
            if (!state.directories[directory]) {
              state.directories[directory] = emptyDirectoryState()
            }
          }
          for (const directory of Object.keys(state.directories)) {
            if (!unique.includes(directory)) {
              delete state.directories[directory]
            }
          }
        })
      },
      closeProject(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          if (
            !state.openProjects.includes(normalized) &&
            !(normalized in state.directories) &&
            !(normalized in state.lastSessionByDirectory) &&
            state.activeDirectory !== normalized
          ) {
            return
          }

          state.openProjects = state.openProjects.filter((entry) => entry !== normalized)
          delete state.directories[normalized]
          delete state.lastSessionByDirectory[normalized]
          delete state.activeReadingResourceByDirectory[normalized]
          delete state.lastOpenedReadingResourceByDirectory[normalized]
          state.linkedSessionByResource = Object.fromEntries(
            Object.entries(state.linkedSessionByResource).filter(
              ([key]) => !key.startsWith(`${normalized}::`),
            ),
          )

          if (state.pendingActiveDirectory === normalized) {
            state.pendingActiveDirectory = undefined
          }
          if (state.activeDirectory === normalized) {
            state.activeDirectory = state.openProjects[0] ?? undefined
          }
        })
      },
      setActiveDirectory(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          state.activeDirectory = normalized
          state.pendingActiveDirectory = undefined
          if (!state.directories[normalized]) {
            state.directories[normalized] = emptyDirectoryState()
          }
        })
      },
      setDirectoryReady(directory, ready) {
        set((state) => {
          const current = ensureDirectoryState(state.directories, directory)
          current.isReady = ready
        })
      },
      setDirectoryError(directory, error) {
        set((state) => {
          const current = ensureDirectoryState(state.directories, directory)
          current.error = error
        })
      },
      clearDirectoryError(directory) {
        get().setDirectoryError(directory, undefined)
      },
      setSessions(directory, sessions) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const sortedSessions = sortSessions(sessions)
          const nextSessions = sortedSessions
          const nextSessionStatusByID: Record<string, SessionStatusInfo> = {}
          for (const session of nextSessions) {
            nextSessionStatusByID[session.id] =
              current.sessionStatusByID[session.id] ?? IDLE_SESSION_STATUS
          }
          const persistedSessionID = state.lastSessionByDirectory[directory]
          const currentSessionID =
            current.sessionID &&
            (nextSessions.some((session) => session.id === current.sessionID) ||
              shouldPreserveMissingActiveSession(current, current.sessionID))
              ? current.sessionID
              : undefined
          if (
            currentSessionID &&
            !nextSessionStatusByID[currentSessionID] &&
            current.sessionStatusByID[currentSessionID]
          ) {
            nextSessionStatusByID[currentSessionID] = current.sessionStatusByID[currentSessionID]
          }
          const persistedActiveSessionID =
            persistedSessionID && nextSessions.some((session) => session.id === persistedSessionID)
              ? persistedSessionID
              : undefined
          const activeSessionID =
            currentSessionID ??
            (hasDraftSelection(current)
              ? undefined
              : (persistedActiveSessionID ?? nextSessions[0]?.id))
          const nextIsDraft = activeSessionID === undefined

          const activeInfo = activeSessionID
            ? nextSessions.find((session) => session.id === activeSessionID)
            : undefined
          const switchedSession = activeSessionID !== current.sessionID
          const nextMessages = sessionMessages(current, activeSessionID)
          const nextBusy = resolveActiveSessionBusy({
            sessionID: activeSessionID,
            sessions: nextSessions,
            sessionStatusByID: nextSessionStatusByID,
            messages: nextMessages,
          })

          state.directories[directory] = {
            ...current,
            isDraft: nextIsDraft,
            sessions: nextSessions,
            sessionID: activeSessionID,
            sessionTitle: activeInfo?.title ?? DEFAULT_TITLE,
            sessionStatusByID: nextSessionStatusByID,
            messages: nextMessages,
            messagesBySessionID: current.messagesBySessionID ?? {},
            orphanPartsByMessageID: current.orphanPartsByMessageID ?? {},
            pendingPermissions: switchedSession
              ? current.pendingPermissions.filter(
                  (request: PermissionRequest) => request.sessionID === activeSessionID,
                )
              : current.pendingPermissions,
            pendingQuestions: current.pendingQuestions,
            isBusy: nextBusy,
          }

          if (activeSessionID) {
            state.lastSessionByDirectory[directory] = activeSessionID
          } else if (nextSessions.length === 0) {
            delete state.lastSessionByDirectory[directory]
          }
        })
      },
      setActiveSession(directory, sessionID) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          if (!sessionID) {
            state.directories[directory] = {
              ...current,
              isDraft: true,
              sessionID: undefined,
              sessionTitle: DEFAULT_TITLE,
              messages: [],
              messagesBySessionID: current.messagesBySessionID ?? {},
              orphanPartsByMessageID: current.orphanPartsByMessageID ?? {},
              pendingPermissions: [],
              pendingQuestions: current.pendingQuestions,
              isBusy: false,
            }
            return
          }

          const activeInfo = current.sessions.find(
            (session: SessionInfo) => session.id === sessionID,
          )
          const switchedSession = current.sessionID !== sessionID
          const nextMessages = sessionMessages(current, sessionID)
          state.directories[directory] = {
            ...current,
            isDraft: false,
            sessionID,
            sessionTitle: activeInfo?.title ?? current.sessionTitle,
            messages: nextMessages,
            messagesBySessionID: current.messagesBySessionID ?? {},
            orphanPartsByMessageID: current.orphanPartsByMessageID ?? {},
            pendingPermissions: switchedSession
              ? current.pendingPermissions.filter(
                  (request: PermissionRequest) => request.sessionID === sessionID,
                )
              : current.pendingPermissions,
            pendingQuestions: current.pendingQuestions,
            isBusy: resolveActiveSessionBusy({
              sessionID,
              sessions: current.sessions,
              sessionStatusByID: current.sessionStatusByID,
              messages: nextMessages,
            }),
          }
          state.lastSessionByDirectory[directory] = sessionID
        })
      },
      startSessionDraft(directory) {
        get().setActiveSession(directory, undefined)
      },
      setSessionInfo(directory, info) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const nextSessions = upsertSession(current.sessions, info)
          state.lastSessionByDirectory[directory] = info.id
          const nextMessages = sessionMessages(current, info.id)
          state.directories[directory] = {
            ...current,
            isDraft: false,
            sessions: nextSessions,
            sessionID: info.id,
            sessionTitle: info.title || DEFAULT_TITLE,
            messages: nextMessages,
            messagesBySessionID: current.messagesBySessionID ?? {},
            orphanPartsByMessageID: current.orphanPartsByMessageID ?? {},
            isBusy: resolveActiveSessionBusy({
              sessionID: info.id,
              sessions: nextSessions,
              sessionStatusByID: current.sessionStatusByID,
              messages: nextMessages,
            }),
          }
        })
      },
      setMessages(directory, sessionID, messages) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const incomingMessages = Array.isArray(messages) ? messages : []
          const nextSessionID = current.sessionID
          const isActiveSession = nextSessionID === sessionID
          const incomingWithOrphans = mergeOrphanPartsIntoMessages(
            incomingMessages,
            current.orphanPartsByMessageID ?? {},
          )
          const currentWithOrphans =
            isActiveSession && current.isBusy
              ? mergeOrphanPartsIntoMessages(
                  sessionMessages(current, sessionID),
                  incomingWithOrphans.orphanPartsByMessageID,
                )
              : undefined
          const nextMessages =
            isActiveSession && current.isBusy
              ? mergeLiveSessionMessages(
                  currentWithOrphans?.messages ?? sessionMessages(current, sessionID),
                  incomingWithOrphans.messages,
                )
              : incomingWithOrphans.messages
          const activeInfo = current.sessions.find(
            (session: SessionInfo) => session.id === nextSessionID,
          )
          const nextSessionStatusByID = {
            ...current.sessionStatusByID,
            [sessionID]: current.sessionStatusByID[sessionID] ?? IDLE_SESSION_STATUS,
          }
          state.directories[directory] = {
            ...current,
            isDraft: isActiveSession ? false : current.isDraft,
            sessionID: nextSessionID,
            sessionTitle: activeInfo?.title ?? current.sessionTitle,
            messages: isActiveSession ? nextMessages : current.messages,
            messagesBySessionID: nextMessagesBySession(current, sessionID, nextMessages),
            orphanPartsByMessageID:
              currentWithOrphans?.orphanPartsByMessageID ??
              incomingWithOrphans.orphanPartsByMessageID,
            isBusy: isActiveSession
              ? resolveActiveSessionBusy({
                  sessionID,
                  sessions: current.sessions,
                  sessionStatusByID: nextSessionStatusByID,
                  messages: nextMessages,
                })
              : current.isBusy,
            sessionStatusByID: nextSessionStatusByID,
          }
        })
      },
      applySessionUpdated(directory, info) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const nextSessions = upsertSession(current.sessions, info)
          const nextSessionID =
            current.sessionID === info.id && info.time.archived
              ? nextSessions[0]?.id
              : current.sessionID
          const switchedActiveSession = nextSessionID !== current.sessionID
          const nextSessionStatusByID = { ...current.sessionStatusByID }
          if (info.time.archived) {
            delete nextSessionStatusByID[info.id]
          }
          const nextActiveInfo = nextSessionID
            ? nextSessions.find((session) => session.id === nextSessionID)
            : undefined
          const nextMessages = switchedActiveSession
            ? sessionMessages(current, nextSessionID)
            : current.messages
          const nextBusy = resolveActiveSessionBusy({
            sessionID: nextSessionID,
            sessions: nextSessions,
            sessionStatusByID: nextSessionStatusByID,
            messages: nextMessages,
          })

          state.directories[directory] = {
            ...current,
            isDraft: nextSessionID === undefined,
            sessions: nextSessions,
            sessionID: nextSessionID,
            sessionTitle: nextActiveInfo?.title ?? DEFAULT_TITLE,
            messages: nextMessages,
            messagesBySessionID: info.time.archived
              ? Object.fromEntries(
                  Object.entries(current.messagesBySessionID ?? {}).filter(
                    ([messageSessionID]) => messageSessionID !== info.id,
                  ),
                )
              : (current.messagesBySessionID ?? {}),
            orphanPartsByMessageID: info.time.archived
              ? pruneOrphanPartsForSession(current.orphanPartsByMessageID ?? {}, info.id)
              : (current.orphanPartsByMessageID ?? {}),
            pendingPermissions: switchedActiveSession
              ? current.pendingPermissions.filter(
                  (request: PermissionRequest) => request.sessionID === nextSessionID,
                )
              : current.pendingPermissions,
            pendingQuestions: current.pendingQuestions,
            isBusy: nextBusy,
            sessionStatusByID: nextSessionStatusByID,
          }

          if (nextSessionID) {
            state.lastSessionByDirectory[directory] = nextSessionID
          }
        })
      },
      applySessionStatus(directory, sessionID, status) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const existingStatus = current.sessionStatusByID[sessionID] ?? IDLE_SESSION_STATUS
          const currentSessionMessages = sessionMessages(current, sessionID)
          const nextTargetMessages =
            status.type === "idle"
              ? sealCompletedAssistantMessages(currentSessionMessages, Date.now())
              : currentSessionMessages
          const targetMessagesChanged = nextTargetMessages !== currentSessionMessages
          if (sessionStatusEquals(existingStatus, status) && !targetMessagesChanged) {
            return
          }
          const nextSessionStatusByID = {
            ...current.sessionStatusByID,
            [sessionID]: status,
          }
          const isActiveSession = current.sessionID === sessionID
          state.directories[directory] = {
            ...current,
            messages: isActiveSession ? nextTargetMessages : current.messages,
            messagesBySessionID: targetMessagesChanged
              ? nextMessagesBySession(current, sessionID, nextTargetMessages)
              : (current.messagesBySessionID ?? {}),
            sessionStatusByID: nextSessionStatusByID,
            isBusy: isActiveSession
              ? resolveActiveSessionBusy({
                  sessionID,
                  sessions: current.sessions,
                  sessionStatusByID: nextSessionStatusByID,
                  messages: nextTargetMessages,
                })
              : current.isBusy,
          }
        })
      },
      applyMessageUpdated(directory, info) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const merged = mergeOrphanPartsIntoMessages(
            upsertMessage(sessionMessages(current, info.sessionID), info),
            current.orphanPartsByMessageID ?? {},
          )
          const messages = merged.messages
          const isActiveSession = current.sessionID === info.sessionID
          const nextBusy = resolveActiveSessionBusy({
            sessionID: info.sessionID,
            sessions: current.sessions,
            sessionStatusByID: current.sessionStatusByID,
            messages,
          })
          state.directories[directory] = {
            ...current,
            isDraft: isActiveSession ? false : current.isDraft,
            messages: isActiveSession ? messages : current.messages,
            messagesBySessionID: nextMessagesBySession(current, info.sessionID, messages),
            orphanPartsByMessageID: merged.orphanPartsByMessageID,
            isBusy: isActiveSession ? nextBusy : current.isBusy,
          }
        })
      },
      applyMessageRemoved(directory, input) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const messages = removeMessage(sessionMessages(current, input.sessionID), input.messageID)
          const isActiveSession = current.sessionID === input.sessionID
          const nextBusy = resolveActiveSessionBusy({
            sessionID: input.sessionID,
            sessions: current.sessions,
            sessionStatusByID: current.sessionStatusByID,
            messages,
          })
          state.directories[directory] = {
            ...current,
            isDraft: isActiveSession ? false : current.isDraft,
            messages: isActiveSession ? messages : current.messages,
            messagesBySessionID: nextMessagesBySession(current, input.sessionID, messages),
            orphanPartsByMessageID: nextOrphanPartsByMessage(current, input.messageID, undefined),
            isBusy: isActiveSession ? nextBusy : current.isBusy,
          }
        })
      },
      applyPartUpdated(directory, part) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const currentMessages = sessionMessages(current, part.sessionID)
          const targetExists = currentMessages.some((message) => message.info.id === part.messageID)
          const messages = targetExists ? upsertPart(currentMessages, part) : currentMessages
          const isActiveSession = current.sessionID === part.sessionID
          const nextBusy = resolveActiveSessionBusy({
            sessionID: part.sessionID,
            sessions: current.sessions,
            sessionStatusByID: current.sessionStatusByID,
            messages,
          })
          state.directories[directory] = {
            ...current,
            isDraft: isActiveSession ? false : current.isDraft,
            messages: isActiveSession ? messages : current.messages,
            messagesBySessionID: nextMessagesBySession(current, part.sessionID, messages),
            orphanPartsByMessageID: targetExists
              ? (current.orphanPartsByMessageID ?? {})
              : nextOrphanPartsByMessage(
                  current,
                  part.messageID,
                  upsertOrphanPart(current.orphanPartsByMessageID?.[part.messageID] ?? [], part),
                ),
            isBusy: isActiveSession ? nextBusy : current.isBusy,
          }
        })
      },
      applyPartRemoved(directory, input) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const currentMessages = sessionMessages(current, input.sessionID)
          const targetExists = currentMessages.some(
            (message) => message.info.id === input.messageID,
          )
          const messages = targetExists
            ? removePart(currentMessages, {
                messageID: input.messageID,
                partID: input.partID,
              })
            : currentMessages
          const isActiveSession = current.sessionID === input.sessionID
          const nextBusy = resolveActiveSessionBusy({
            sessionID: input.sessionID,
            sessions: current.sessions,
            sessionStatusByID: current.sessionStatusByID,
            messages,
          })
          state.directories[directory] = {
            ...current,
            isDraft: isActiveSession ? false : current.isDraft,
            messages: isActiveSession ? messages : current.messages,
            messagesBySessionID: nextMessagesBySession(current, input.sessionID, messages),
            orphanPartsByMessageID: targetExists
              ? (current.orphanPartsByMessageID ?? {})
              : nextOrphanPartsByMessage(
                  current,
                  input.messageID,
                  removeOrphanPart(
                    current.orphanPartsByMessageID?.[input.messageID] ?? [],
                    input.partID,
                  ),
                ),
            isBusy: isActiveSession ? nextBusy : current.isBusy,
          }
        })
      },
      applyPartDelta(directory, input) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const currentMessages = sessionMessages(current, input.sessionID)
          const targetExists = currentMessages.some(
            (message) => message.info.id === input.messageID,
          )
          const messages = targetExists ? appendPartDelta(currentMessages, input) : currentMessages
          const isActiveSession = current.sessionID === input.sessionID
          const nextBusy = resolveActiveSessionBusy({
            sessionID: input.sessionID,
            sessions: current.sessions,
            sessionStatusByID: current.sessionStatusByID,
            messages,
          })
          state.directories[directory] = {
            ...current,
            isDraft: isActiveSession ? false : current.isDraft,
            messages: isActiveSession ? messages : current.messages,
            messagesBySessionID: nextMessagesBySession(current, input.sessionID, messages),
            orphanPartsByMessageID: targetExists
              ? (current.orphanPartsByMessageID ?? {})
              : nextOrphanPartsByMessage(
                  current,
                  input.messageID,
                  appendOrphanPartDelta(
                    current.orphanPartsByMessageID?.[input.messageID] ?? [],
                    input,
                  ),
                ),
            isBusy: isActiveSession ? nextBusy : current.isBusy,
          }
        })
      },
      setPendingPermissions(directory, requests) {
        set((state) => {
          const current = ensureDirectoryState(state.directories, directory)
          current.pendingPermissions = requests
        })
      },
      setPendingQuestions(directory, requests) {
        set((state) => {
          const current = ensureDirectoryState(state.directories, directory)
          current.pendingQuestions = requests
        })
      },
      setProviders(directory, input) {
        set((state) => {
          const current = ensureDirectoryState(state.directories, directory)
          current.providers = input.providers
          current.providerDefault = input.default
        })
      },
      setMcpStatus(directory, input) {
        set((state) => {
          const current = ensureDirectoryState(state.directories, directory)
          current.mcpStatus = input
        })
      },
      applyPermissionAsked(directory, request) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const existingIndex = current.pendingPermissions.findIndex(
            (item: PermissionRequest) => item.id === request.id,
          )
          const nextPending =
            existingIndex === -1
              ? [...current.pendingPermissions, request]
              : current.pendingPermissions.map((item: PermissionRequest, index: number) =>
                  index === existingIndex ? request : item,
                )
          state.directories[directory] = {
            ...current,
            pendingPermissions: nextPending,
          }
        })
      },
      applyPermissionReplied(directory, requestID) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          state.directories[directory] = {
            ...current,
            pendingPermissions: current.pendingPermissions.filter(
              (item: PermissionRequest) => item.id !== requestID,
            ),
          }
        })
      },
      applyQuestionAsked(directory, request) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          const existingIndex = current.pendingQuestions.findIndex(
            (item: QuestionRequest) => item.id === request.id,
          )
          const nextPending =
            existingIndex === -1
              ? [...current.pendingQuestions, request]
              : current.pendingQuestions.map((item: QuestionRequest, index: number) =>
                  index === existingIndex ? request : item,
                )
          state.directories[directory] = {
            ...current,
            pendingQuestions: nextPending,
          }
        })
      },
      applyQuestionResolved(directory, requestID) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          state.directories[directory] = {
            ...current,
            pendingQuestions: current.pendingQuestions.filter(
              (item: QuestionRequest) => item.id !== requestID,
            ),
          }
        })
      },
      setSelectedModel(directory, model) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        const nextModel = model.trim() || "auto"
        set((state) => {
          state.selectedModelByDirectory[normalized] = nextModel
        })
      },
      setActiveReadingResource(directory, resource) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          if (resource) {
            state.activeReadingResourceByDirectory[normalized] = resource
            return
          }
          delete state.activeReadingResourceByDirectory[normalized]
        })
      },
      updateActiveReadingResourceLocation(directory, input) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          const current = state.activeReadingResourceByDirectory[normalized]
          if (!current) return
          state.activeReadingResourceByDirectory[normalized] = {
            ...current,
            ...input,
          }
        })
      },
      linkReadingResourceSession(directory, resourceID, sessionID) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return
        if (!resourceID.trim()) return
        if (!sessionID.trim()) return

        set((state) => {
          state.linkedSessionByResource[resourceSessionKey(normalized, resourceID)] = sessionID
        })
      },
      appendReadingTrailEntry(directory, entry) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return
        if (!entry.tocLabel) return

        set((state) => {
          const current = state.activeReadingResourceByDirectory[normalized]
          if (!current) return
          const trail = current.readingTrail ?? []
          const last = trail[trail.length - 1]
          if (last?.tocLabel === entry.tocLabel && last?.fraction === entry.fraction) {
            return
          }
          const boundedTrail = [...trail, entry].slice(-READING_TRAIL_MAX_ENTRIES)
          state.activeReadingResourceByDirectory[normalized] = {
            ...current,
            readingTrail: boundedTrail,
          }
        })
      },
      setActiveReadingAnnotationSummary(directory, summary) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          const current = state.activeReadingResourceByDirectory[normalized]
          if (!current) return
          state.activeReadingResourceByDirectory[normalized] = {
            ...current,
            annotationSummary: summary,
          }
        })
      },
      setLastOpenedReadingResource(directory, resource) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          if (resource) {
            state.lastOpenedReadingResourceByDirectory[normalized] = resource
            return
          }
          delete state.lastOpenedReadingResourceByDirectory[normalized]
        })
      },
      setEntryError(error) {
        set((state) => {
          state.entryError = error
        })
      },
      setStreamStatus(status) {
        set((state) => {
          if (state.streamStatus !== status) {
            state.streamStatus = status
          }
        })
      },
      resetRuntimeState() {
        set((state) => {
          const defaults = createChatStoreStateFields()
          state.openProjects = defaults.openProjects
          state.activeDirectory = defaults.activeDirectory
          state.pendingActiveDirectory = defaults.pendingActiveDirectory
          state.entryError = defaults.entryError
          state.directories = defaults.directories
          state.streamStatus = defaults.streamStatus
        })
      },
    })),
    {
      name: CHAT_STORAGE_KEY,
      storage: createPlatformJsonStorage(CHAT_STORAGE_FILE),
      merge(persistedState, currentState) {
        const persisted = readPersistedChatStoreState(persistedState)
        const pendingActiveDirectory = normalizeProjectDirectory(persisted.activeDirectory)

        return {
          ...currentState,
          activeDirectory: undefined,
          pendingActiveDirectory,
          lastSessionByDirectory: Object.fromEntries(
            Object.entries(persisted.lastSessionByDirectory ?? {}).filter(
              ([directory]) => !!normalizeProjectDirectory(directory),
            ),
          ),
          activeReadingResourceByDirectory: Object.fromEntries(
            Object.entries(persisted.activeReadingResourceByDirectory ?? {}).filter(
              ([directory]) => !!normalizeProjectDirectory(directory),
            ),
          ),
          linkedSessionByResource: Object.fromEntries(
            Object.entries(persisted.linkedSessionByResource ?? {}),
          ),
          lastOpenedReadingResourceByDirectory: Object.fromEntries(
            Object.entries(persisted.lastOpenedReadingResourceByDirectory ?? {}).filter(
              ([directory]) => !!normalizeProjectDirectory(directory),
            ),
          ),
        }
      },
      partialize(state) {
        const activeDirectory = normalizeProjectDirectory(state.activeDirectory)
        return {
          activeDirectory,
          lastSessionByDirectory: Object.fromEntries(
            Object.entries(state.lastSessionByDirectory).filter(
              ([directory]) => !!normalizeProjectDirectory(directory),
            ),
          ),
          activeReadingResourceByDirectory: Object.fromEntries(
            Object.entries(state.activeReadingResourceByDirectory)
              .filter(([directory]) => !!normalizeProjectDirectory(directory))
              .map(([directory, resource]) => [
                directory,
                stripTransientActiveReadingResourceFields(resource),
              ]),
          ),
          linkedSessionByResource: state.linkedSessionByResource,
          lastOpenedReadingResourceByDirectory: Object.fromEntries(
            Object.entries(state.lastOpenedReadingResourceByDirectory).filter(
              ([directory]) => !!normalizeProjectDirectory(directory),
            ),
          ),
        }
      },
    },
  ),
)
