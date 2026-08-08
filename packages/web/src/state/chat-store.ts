import { create, type Mutate, type StoreApi, type UseBoundStore } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import type { ReaderTrailEntry } from "@buddy/reader-contract"
import { createPlatformJsonStorage } from "../context/platform"
import type {
  DirectoryChatState,
  McpStatusMap,
  PermissionRequest,
  QuestionRequest,
  ProviderCatalogState,
  SessionStatusInfo,
  SessionInfo,
} from "./chat-types"
import { IDLE_SESSION_STATUS, isSessionWorking, sessionStatusEquals } from "./session-status"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import {
  READING_TRAIL_MAX_ENTRIES,
  readActiveReadingResourceRecord,
  readerTrailEntriesEqual,
  stripTransientActiveReadingResourceFields,
  type ActiveReadingLocationUpdate,
  type ActiveReadingResourceState,
  type AnnotationSummaryEntry,
} from "./active-reading-state"

export type { ActiveReadingResourceState } from "./active-reading-state"

type StreamStatus = "idle" | "connecting" | "connected" | "error"

type LastOpenedReadingResource = {
  objectID?: string
  name: string
  path: string
}

export type OpenProjectsRecoveryState = {
  needed: boolean
}

export type ChatStore = {
  openProjects: string[]
  openProjectsRecovery?: OpenProjectsRecoveryState
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
  setOpenProjectsRecovery: (recovery?: OpenProjectsRecoveryState) => void
  closeProject: (directory: string) => void
  setActiveDirectory: (directory: string) => void
  setDirectoryReady: (directory: string, ready: boolean) => void
  setDirectoryError: (directory: string, error?: string) => void
  clearDirectoryError: (directory: string) => void
  setSessions: (directory: string, sessions: SessionInfo[]) => void
  applySessionsDeleted: (directory: string, sessionIDs: readonly string[]) => void
  setActiveSession: (directory: string, sessionID?: string) => void
  startSessionDraft: (directory: string) => void
  setSessionInfo: (directory: string, info: SessionInfo) => void
  clearLoadingSession: (directory: string, sessionID: string) => void
  applySessionUpdated: (directory: string, info: SessionInfo) => void
  applySessionStatus: (directory: string, sessionID: string, status: SessionStatusInfo) => void
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
    input: ActiveReadingLocationUpdate,
  ) => void
  linkReadingResourceSession: (directory: string, objectID: string, sessionID: string) => void
  appendReadingTrailEntry: (
    directory: string,
    entry: ReaderTrailEntry,
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
  | "openProjectsRecovery"
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

export function resourceSessionKey(directory: string, objectID: string) {
  return `${directory}::${objectID}`
}

const DEFAULT_TITLE = "New chat"
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
  return canonicalProjectDirectory(input)
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
    (value.objectID === undefined || typeof value.objectID === "string")
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
    pendingPermissions: [],
    pendingQuestions: [],
    providers: [],
    providerDefault: {},
    mcpStatus: {},
    isBusy: false,
    isReady: false,
    loadingSessionID: undefined,
  }
}

function createChatStoreStateFields(): ChatStoreStateFields {
  return {
    openProjects: [],
    openProjectsRecovery: undefined,
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
}) {
  if (!input.sessionID) return false

  return isSessionWorking({
    info: findSessionInfo(input.sessions, input.sessionID),
    status: input.sessionStatusByID[input.sessionID],
  })
}

function shouldPreserveMissingActiveSession(
  state: DirectoryChatState,
  sessionID: string | undefined,
) {
  if (!sessionID) return false
  return state.isBusy
}

type ChatStoreHook = UseBoundStore<
  Mutate<
    StoreApi<ChatStore>,
    [["zustand/persist", PersistedChatStoreState], ["zustand/immer", never]]
  >
>

export const useChatStore: ChatStoreHook = create<ChatStore>()(
  persist<ChatStore, [], [["zustand/immer", never]], PersistedChatStoreState>(
    immer((set, get) => ({
      ...createChatStoreStateFields(),
      ensureOpenProject(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          if (!state.openProjects.includes(normalized)) {
            state.openProjects.unshift(normalized)
          }
          state.openProjectsRecovery = undefined
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
          state.openProjectsRecovery = undefined
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
      setOpenProjectsRecovery(recovery) {
        set((state) => {
          state.openProjectsRecovery = recovery
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
          const nextBusy = resolveActiveSessionBusy({
            sessionID: activeSessionID,
            sessions: nextSessions,
            sessionStatusByID: nextSessionStatusByID,
          })

          state.directories[directory] = {
            ...current,
            isDraft: nextIsDraft,
            sessions: nextSessions,
            sessionID: activeSessionID,
            sessionTitle: activeInfo?.title ?? DEFAULT_TITLE,
            sessionStatusByID: nextSessionStatusByID,
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
      applySessionsDeleted(directory, sessionIDs) {
        set((state) => {
          const current = state.directories[directory]
          if (!current || sessionIDs.length === 0) return

          const deletedSessionIDs = new Set(sessionIDs)
          const nextSessions = current.sessions.filter(
            (session) => !deletedSessionIDs.has(session.id),
          )
          const activeSessionDeleted =
            current.sessionID !== undefined && deletedSessionIDs.has(current.sessionID)
          const nextSessionID = activeSessionDeleted ? nextSessions[0]?.id : current.sessionID
          const nextActiveInfo = findSessionInfo(nextSessions, nextSessionID)
          const nextSessionStatusByID: Record<string, SessionStatusInfo> = {}
          for (const [sessionID, status] of Object.entries(current.sessionStatusByID)) {
            if (!deletedSessionIDs.has(sessionID)) {
              nextSessionStatusByID[sessionID] = status
            }
          }

          state.directories[directory] = {
            ...current,
            isDraft: nextSessionID === undefined,
            sessions: nextSessions,
            sessionID: nextSessionID,
            loadingSessionID:
              activeSessionDeleted ||
              (current.loadingSessionID !== undefined &&
                deletedSessionIDs.has(current.loadingSessionID))
                ? undefined
                : current.loadingSessionID,
            sessionTitle:
              nextActiveInfo?.title ??
              (nextSessionID === current.sessionID ? current.sessionTitle : DEFAULT_TITLE),
            sessionStatusByID: nextSessionStatusByID,
            pendingPermissions: current.pendingPermissions.filter(
              (request) => !deletedSessionIDs.has(request.sessionID),
            ),
            pendingQuestions: current.pendingQuestions.filter(
              (request) => !deletedSessionIDs.has(request.sessionID),
            ),
            isBusy: resolveActiveSessionBusy({
              sessionID: nextSessionID,
              sessions: nextSessions,
              sessionStatusByID: nextSessionStatusByID,
            }),
          }

          if (nextSessionID) {
            state.lastSessionByDirectory[directory] = nextSessionID
          } else if (
            state.lastSessionByDirectory[directory] !== undefined &&
            deletedSessionIDs.has(state.lastSessionByDirectory[directory])
          ) {
            delete state.lastSessionByDirectory[directory]
          }

          const directoryResourceKeyPrefix = resourceSessionKey(directory, "")
          state.linkedSessionByResource = Object.fromEntries(
            Object.entries(state.linkedSessionByResource).filter(
              ([key, sessionID]) =>
                !key.startsWith(directoryResourceKeyPrefix) || !deletedSessionIDs.has(sessionID),
            ),
          )
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
              loadingSessionID: undefined,
              sessionTitle: DEFAULT_TITLE,
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
          state.directories[directory] = {
            ...current,
            isDraft: false,
            sessionID,
            loadingSessionID: undefined,
            sessionTitle: activeInfo?.title ?? current.sessionTitle,
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
          state.directories[directory] = {
            ...current,
            isDraft: false,
            sessions: nextSessions,
            sessionID: info.id,
            loadingSessionID: undefined,
            sessionTitle: info.title || DEFAULT_TITLE,
            isBusy: resolveActiveSessionBusy({
              sessionID: info.id,
              sessions: nextSessions,
              sessionStatusByID: current.sessionStatusByID,
            }),
          }
        })
      },
      clearLoadingSession(directory, sessionID) {
        set((state) => {
          const current = state.directories[directory]
          if (!current || current.loadingSessionID !== sessionID) {
            return
          }
          state.directories[directory] = {
            ...current,
            loadingSessionID: undefined,
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
          const nextLoadingSessionID = switchedActiveSession ? undefined : current.loadingSessionID
          const nextBusy = resolveActiveSessionBusy({
            sessionID: nextSessionID,
            sessions: nextSessions,
            sessionStatusByID: nextSessionStatusByID,
          })

          state.directories[directory] = {
            ...current,
            isDraft: nextSessionID === undefined,
            sessions: nextSessions,
            sessionID: nextSessionID,
            loadingSessionID: nextLoadingSessionID,
            sessionTitle: nextActiveInfo?.title ?? DEFAULT_TITLE,
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
          if (sessionStatusEquals(existingStatus, status)) {
            return
          }
          const nextSessionStatusByID = {
            ...current.sessionStatusByID,
            [sessionID]: status,
          }
          const isActiveSession = current.sessionID === sessionID
          state.directories[directory] = {
            ...current,
            sessionStatusByID: nextSessionStatusByID,
            isBusy: isActiveSession
              ? resolveActiveSessionBusy({
                  sessionID,
                  sessions: current.sessions,
                  sessionStatusByID: nextSessionStatusByID,
                })
              : current.isBusy,
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
        const { currentPassageText, ...location } = input

        set((state) => {
          const current = state.activeReadingResourceByDirectory[normalized]
          if (!current) return
          state.activeReadingResourceByDirectory[normalized] = {
            ...current,
            location,
            currentPassageText,
          }
        })
      },
      linkReadingResourceSession(directory, objectID, sessionID) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return
        if (!objectID.trim()) return
        if (!sessionID.trim()) return

        set((state) => {
          state.linkedSessionByResource[resourceSessionKey(normalized, objectID)] = sessionID
        })
      },
      appendReadingTrailEntry(directory, entry) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return
        if (!entry.label) return

        set((state) => {
          const current = state.activeReadingResourceByDirectory[normalized]
          if (!current) return
          const trail = current.readingTrail ?? []
          const last = trail[trail.length - 1]
          if (readerTrailEntriesEqual(last, entry)) return
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
          state.openProjectsRecovery = defaults.openProjectsRecovery
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
