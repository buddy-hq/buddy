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
  ProviderCatalogState,
  SessionStatusInfo,
  SessionInfo,
} from "./chat-types"
import { appendPartDelta, upsertMessage, upsertPart } from "./chat-reducer"
import { IDLE_SESSION_STATUS, isSessionStatusActive, sessionStatusEquals } from "./session-status"

type StreamStatus = "idle" | "connecting" | "connected" | "error"

export type ActiveReadingResourceState = {
  resourceID?: string
  alias?: string
  name: string
  path: string
  status?: "preparing" | "ready" | "unsupported" | "error" | "stale" | "unprocessed"
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
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
  applyPartUpdated: (directory: string, part: MessagePart) => void
  applyPartDelta: (
    directory: string,
    input: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
  ) => void
  setPendingPermissions: (directory: string, requests: PermissionRequest[]) => void
  setProviders: (directory: string, input: ProviderCatalogState) => void
  setMcpStatus: (directory: string, input: McpStatusMap) => void
  applyPermissionAsked: (directory: string, request: PermissionRequest) => void
  applyPermissionReplied: (directory: string, requestID: string) => void
  setSelectedModel: (directory: string, model: string) => void
  setActiveReadingResource: (
    directory: string,
    resource: ActiveReadingResourceState | undefined,
  ) => void
  updateActiveReadingResourceLocation: (
    directory: string,
    input: Pick<ActiveReadingResourceState, "locationLabel" | "tocLabel" | "pageLabel">,
  ) => void
  linkReadingResourceSession: (directory: string, resourceID: string, sessionID: string) => void
  setEntryError: (error?: string) => void
  setStreamStatus: (status: StreamStatus) => void
  resetRuntimeState: () => void
}

function resourceSessionKey(directory: string, resourceID: string) {
  return `${directory}::${resourceID}`
}

const DEFAULT_TITLE = "New thread"
const CHAT_STORAGE_FILE = "buddy.chat.dat"
const CHAT_STORAGE_KEY = "buddy.chat.v4"

function normalizeProjectDirectory(input: string | undefined) {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed || trimmed === "/") return undefined
  return trimmed.replace(/\/+$/, "") || undefined
}

function emptyDirectoryState(): DirectoryChatState {
  return {
    isDraft: false,
    sessionTitle: DEFAULT_TITLE,
    sessions: [],
    sessionStatusByID: {},
    messages: [],
    pendingPermissions: [],
    providers: [],
    providerDefault: {},
    mcpStatus: {},
    isBusy: false,
    isReady: false,
  }
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

export const useChatStore = create<ChatStore>()(
  persist(
    immer((set, get) => ({
      openProjects: [] as string[],
      activeDirectory: undefined as string | undefined,
      pendingActiveDirectory: undefined as string | undefined,
      entryError: undefined as string | undefined,
      lastSessionByDirectory: {} as Record<string, string>,
      selectedModelByDirectory: {} as Record<string, string>,
      activeReadingResourceByDirectory: {} as Record<string, ActiveReadingResourceState>,
      linkedSessionByResource: {} as Record<string, string>,
      directories: {} as Record<string, DirectoryChatState>,
      streamStatus: "idle" as StreamStatus,
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
          ) as string[]

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

          state.openProjects = state.openProjects.filter((entry: string) => entry !== normalized)
          delete state.directories[normalized]
          delete state.lastSessionByDirectory[normalized]
          delete state.activeReadingResourceByDirectory[normalized]
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
          if (!state.directories[directory]) {
            state.directories[directory] = emptyDirectoryState()
          }
          state.directories[directory]!.isReady = ready
        })
      },
      setDirectoryError(directory, error) {
        set((state) => {
          if (!state.directories[directory]) {
            state.directories[directory] = emptyDirectoryState()
          }
          state.directories[directory]!.error = error
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
            current.sessionID && nextSessions.some((session) => session.id === current.sessionID)
              ? current.sessionID
              : undefined
          const persistedActiveSessionID =
            persistedSessionID && nextSessions.some((session) => session.id === persistedSessionID)
              ? persistedSessionID
              : undefined
          const activeSessionID = current.isDraft
            ? undefined
            : (currentSessionID ?? persistedActiveSessionID ?? nextSessions[0]?.id)
          const nextIsDraft = activeSessionID
            ? false
            : nextSessions.length === 0
              ? true
              : (current.isDraft ?? false)

          const activeInfo = activeSessionID
            ? nextSessions.find((session) => session.id === activeSessionID)
            : undefined
          const nextBusy = activeSessionID
            ? isSessionStatusActive(nextSessionStatusByID[activeSessionID])
            : false
          const switchedSession = activeSessionID !== current.sessionID

          state.directories[directory] = {
            ...current,
            isDraft: nextIsDraft,
            sessions: nextSessions,
            sessionID: activeSessionID,
            sessionTitle: activeInfo?.title ?? DEFAULT_TITLE,
            sessionStatusByID: nextSessionStatusByID,
            messages: switchedSession ? [] : current.messages,
            pendingPermissions: switchedSession
              ? current.pendingPermissions.filter(
                  (request: PermissionRequest) => request.sessionID === activeSessionID,
                )
              : current.pendingPermissions,
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
              pendingPermissions: [],
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
            sessionTitle: activeInfo?.title ?? current.sessionTitle,
            messages: switchedSession ? [] : current.messages,
            pendingPermissions: switchedSession
              ? current.pendingPermissions.filter(
                  (request: PermissionRequest) => request.sessionID === sessionID,
                )
              : current.pendingPermissions,
            isBusy: isSessionStatusActive(current.sessionStatusByID[sessionID]),
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
            sessionTitle: info.title || DEFAULT_TITLE,
            isBusy: isSessionStatusActive(current.sessionStatusByID[info.id]),
          }
        })
      },
      setMessages(directory, sessionID, messages) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          if (!current.sessionID || current.sessionID !== sessionID) {
            return
          }

          const nextMessages = Array.isArray(messages) ? messages : []
          const nextSessionID = current.sessionID
          const activeInfo = current.sessions.find(
            (session: SessionInfo) => session.id === nextSessionID,
          )
          const nextSessionStatusByID = {
            ...current.sessionStatusByID,
            [nextSessionID]: current.sessionStatusByID[nextSessionID] ?? IDLE_SESSION_STATUS,
          }
          const nextBusy = isSessionStatusActive(nextSessionStatusByID[nextSessionID])
          state.directories[directory] = {
            ...current,
            isDraft: false,
            sessionID: nextSessionID,
            sessionTitle: activeInfo?.title ?? current.sessionTitle,
            messages: nextMessages,
            isBusy: nextBusy,
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
              ? current.isDraft
                ? undefined
                : nextSessions[0]?.id
              : current.sessionID
          const switchedActiveSession = nextSessionID !== current.sessionID
          const nextSessionStatusByID = { ...current.sessionStatusByID }
          if (info.time.archived) {
            delete nextSessionStatusByID[info.id]
          }
          const nextActiveInfo = nextSessionID
            ? nextSessions.find((session) => session.id === nextSessionID)
            : undefined
          const nextBusy = nextSessionID
            ? isSessionStatusActive(nextSessionStatusByID[nextSessionID])
            : false

          state.directories[directory] = {
            ...current,
            isDraft: nextSessionID === undefined,
            sessions: nextSessions,
            sessionID: nextSessionID,
            sessionTitle: nextActiveInfo?.title ?? DEFAULT_TITLE,
            messages: switchedActiveSession ? [] : current.messages,
            pendingPermissions: switchedActiveSession
              ? current.pendingPermissions.filter(
                  (request: PermissionRequest) => request.sessionID === nextSessionID,
                )
              : current.pendingPermissions,
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
          if (sessionStatusEquals(existingStatus, status)) return
          state.directories[directory] = {
            ...current,
            sessionStatusByID: {
              ...current.sessionStatusByID,
              [sessionID]: status,
            },
            isBusy:
              current.sessionID === sessionID ? isSessionStatusActive(status) : current.isBusy,
          }
        })
      },
      applyMessageUpdated(directory, info) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          if (!current.sessionID || current.sessionID !== info.sessionID) {
            return
          }
          const messages = upsertMessage(current.messages, info)
          const nextBusy =
            current.sessionID !== undefined
              ? isSessionStatusActive(current.sessionStatusByID[current.sessionID])
              : current.isBusy
          state.directories[directory] = {
            ...current,
            isDraft: false,
            messages,
            isBusy: nextBusy,
          }
        })
      },
      applyPartUpdated(directory, part) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          if (!current.sessionID || current.sessionID !== part.sessionID) {
            return
          }
          const messages = upsertPart(current.messages, part)
          const nextBusy =
            current.sessionID !== undefined
              ? isSessionStatusActive(current.sessionStatusByID[current.sessionID])
              : current.isBusy
          state.directories[directory] = {
            ...current,
            isDraft: false,
            messages,
            isBusy: nextBusy,
          }
        })
      },
      applyPartDelta(directory, input) {
        set((state) => {
          const current = state.directories[directory] ?? emptyDirectoryState()
          if (!current.sessionID || current.sessionID !== input.sessionID) {
            return
          }
          const messages = appendPartDelta(current.messages, input)
          const nextBusy =
            current.sessionID !== undefined
              ? isSessionStatusActive(current.sessionStatusByID[current.sessionID])
              : current.isBusy
          state.directories[directory] = {
            ...current,
            isDraft: false,
            messages,
            isBusy: nextBusy,
          }
        })
      },
      setPendingPermissions(directory, requests) {
        set((state) => {
          if (!state.directories[directory]) {
            state.directories[directory] = emptyDirectoryState()
          }
          state.directories[directory]!.pendingPermissions = requests
        })
      },
      setProviders(directory, input) {
        set((state) => {
          if (!state.directories[directory]) {
            state.directories[directory] = emptyDirectoryState()
          }
          state.directories[directory]!.providers = input.providers
          state.directories[directory]!.providerDefault = input.default
        })
      },
      setMcpStatus(directory, input) {
        set((state) => {
          if (!state.directories[directory]) {
            state.directories[directory] = emptyDirectoryState()
          }
          state.directories[directory]!.mcpStatus = input
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
          state.openProjects = []
          state.activeDirectory = undefined
          state.pendingActiveDirectory = undefined
          state.entryError = undefined
          state.lastSessionByDirectory = {}
          state.selectedModelByDirectory = {}
          state.activeReadingResourceByDirectory = {}
          state.linkedSessionByResource = {}
          state.directories = {}
          state.streamStatus = "idle"
        })
      },
    })),
    {
      name: CHAT_STORAGE_KEY,
      storage: createPlatformJsonStorage(CHAT_STORAGE_FILE),
      merge(persistedState, currentState) {
        const persisted = (persistedState ?? {}) as Partial<ChatStore>
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
            Object.entries(state.activeReadingResourceByDirectory).filter(
              ([directory]) => !!normalizeProjectDirectory(directory),
            ),
          ),
          linkedSessionByResource: state.linkedSessionByResource,
        }
      },
    },
  ),
)
