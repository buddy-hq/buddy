import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"
import type {
  DirectoryChatState,
  MessageInfo,
  MessagePart,
  MessageWithParts,
  McpStatusMap,
  PermissionRequest,
  ProviderCatalogState,
  SessionInfo,
} from "./chat-types"
import { appendPartDelta, inferBusyFromMessages, upsertMessage, upsertPart } from "./chat-reducer"

type StreamStatus = "idle" | "connecting" | "connected" | "error"

type ChatStore = {
  projects: string[]
  activeDirectory?: string
  lastSessionByDirectory: Record<string, string>
  directories: Record<string, DirectoryChatState>
  streamStatus: StreamStatus
  ensureProject: (directory: string) => void
  setProjects: (directories: string[]) => void
  removeProject: (directory: string) => void
  setActiveDirectory: (directory: string) => void
  setDirectoryReady: (directory: string, ready: boolean) => void
  setDirectoryError: (directory: string, error?: string) => void
  clearDirectoryError: (directory: string) => void
  setSessions: (directory: string, sessions: SessionInfo[]) => void
  setActiveSession: (directory: string, sessionID: string) => void
  setSessionInfo: (directory: string, info: SessionInfo) => void
  setMessages: (directory: string, sessionID: string, messages: MessageWithParts[]) => void
  applySessionUpdated: (directory: string, info: SessionInfo) => void
  applySessionStatus: (directory: string, sessionID: string, status: "busy" | "idle") => void
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
  setStreamStatus: (status: StreamStatus) => void
}

const DEFAULT_TITLE = "New chat"

function normalizeProjectDirectory(input: string | undefined) {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed || trimmed === "/") return undefined
  return trimmed.replace(/\/+$/, "") || undefined
}

function emptyDirectoryState(): DirectoryChatState {
  return {
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

function ensureDirectoryState(store: ChatStore, directory: string) {
  return store.directories[directory] ?? emptyDirectoryState()
}

function sortSessions(sessions: SessionInfo[]) {
  return sessions
    .filter((session) => !session.time.archived)
    .slice()
    .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
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
    (set, get) => ({
      projects: [],
      activeDirectory: undefined,
      lastSessionByDirectory: {},
      directories: {},
      streamStatus: "idle",
      ensureProject(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          const projects = state.projects.includes(normalized)
            ? state.projects
            : [...state.projects, normalized]
          return {
            projects,
            directories: {
              ...state.directories,
              [normalized]: ensureDirectoryState(state as ChatStore, normalized),
            },
          }
        })
      },
      setProjects(directories) {
        set((state) => {
          const unique = Array.from(
            new Set(directories.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
          ) as string[]
          const projects = unique
          const nextLastSession = Object.fromEntries(
            Object.entries(state.lastSessionByDirectory).filter(([directory]) => projects.includes(directory)),
          )
          const nextActiveDirectory =
            state.activeDirectory && projects.includes(state.activeDirectory)
              ? state.activeDirectory
              : projects[0]

          return {
            projects,
            activeDirectory: nextActiveDirectory,
            lastSessionByDirectory: nextLastSession,
            directories: {
              ...state.directories,
              ...Object.fromEntries(
                projects.map((directory) => [directory, state.directories[directory] ?? emptyDirectoryState()]),
              ),
            },
          }
        })
      },
      removeProject(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => {
          const projects = state.projects.filter((entry) => entry !== normalized)
          const directories = { ...state.directories }
          delete directories[normalized]

          const nextLastSession = { ...state.lastSessionByDirectory }
          delete nextLastSession[normalized]

          const nextActive =
            state.activeDirectory === normalized
              ? projects[0]
              : state.activeDirectory

          return {
            projects,
            directories,
            activeDirectory: nextActive,
            lastSessionByDirectory: nextLastSession,
          }
        })
      },
      setActiveDirectory(directory) {
        const normalized = normalizeProjectDirectory(directory)
        if (!normalized) return

        set((state) => ({
          activeDirectory: normalized,
          directories: {
            ...state.directories,
            [normalized]: ensureDirectoryState(state as ChatStore, normalized),
          },
        }))
      },
      setDirectoryReady(directory, ready) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              isReady: ready,
            },
          },
        }))
      },
      setDirectoryError(directory, error) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              error,
            },
          },
        }))
      },
      clearDirectoryError(directory) {
        const state = get()
        state.setDirectoryError(directory, undefined)
      },
      setSessions(directory, sessions) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const sortedSessions = sortSessions(sessions)
          const activeSessionID =
            current.sessionID && sortedSessions.some((session) => session.id === current.sessionID)
              ? current.sessionID
              : sortedSessions[0]?.id

          const activeInfo = activeSessionID
            ? sortedSessions.find((session) => session.id === activeSessionID)
            : undefined

          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessions: sortedSessions,
                sessionID: activeSessionID,
                sessionTitle: activeInfo?.title ?? DEFAULT_TITLE,
              },
            },
            lastSessionByDirectory: activeSessionID
              ? {
                  ...state.lastSessionByDirectory,
                  [directory]: activeSessionID,
                }
              : state.lastSessionByDirectory,
          }
        })
      },
      setActiveSession(directory, sessionID) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const activeInfo = current.sessions.find((session) => session.id === sessionID)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessionID,
                sessionTitle: activeInfo?.title ?? current.sessionTitle,
                isBusy: current.sessionStatusByID[sessionID] === "busy",
              },
            },
            lastSessionByDirectory: {
              ...state.lastSessionByDirectory,
              [directory]: sessionID,
            },
          }
        })
      },
      setSessionInfo(directory, info) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const nextSessions = upsertSession(current.sessions, info)
          return {
            lastSessionByDirectory: {
              ...state.lastSessionByDirectory,
              [directory]: info.id,
            },
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessions: nextSessions,
                sessionID: info.id,
                sessionTitle: info.title || DEFAULT_TITLE,
                isBusy: current.sessionStatusByID[info.id] === "busy",
              },
            },
          }
        })
      },
      setMessages(directory, sessionID, messages) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== sessionID) {
            return state
          }

          const nextSessionID = current.sessionID ?? sessionID
          const activeInfo = current.sessions.find((session) => session.id === nextSessionID)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessionID: nextSessionID,
                sessionTitle: activeInfo?.title ?? current.sessionTitle,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [nextSessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      applySessionUpdated(directory, info) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const nextSessions = upsertSession(current.sessions, info)
          const nextSessionID =
            current.sessionID === info.id && info.time.archived
              ? nextSessions[0]?.id
              : current.sessionID
          const switchedActiveSession = nextSessionID !== current.sessionID
          const nextSessionStatusByID = {
            ...current.sessionStatusByID,
          }
          if (info.time.archived) {
            delete nextSessionStatusByID[info.id]
          }
          const nextActiveInfo = nextSessionID
            ? nextSessions.find((session) => session.id === nextSessionID)
            : undefined
          const nextBusy = nextSessionID ? nextSessionStatusByID[nextSessionID] === "busy" : false
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessions: nextSessions,
                sessionID: nextSessionID,
                sessionTitle: nextActiveInfo?.title ?? DEFAULT_TITLE,
                messages: switchedActiveSession ? [] : current.messages,
                pendingPermissions: switchedActiveSession
                  ? current.pendingPermissions.filter((request) => request.sessionID === nextSessionID)
                  : current.pendingPermissions,
                isBusy: nextBusy,
                sessionStatusByID: nextSessionStatusByID,
              },
            },
            lastSessionByDirectory: nextSessionID
              ? {
                  ...state.lastSessionByDirectory,
                  [directory]: nextSessionID,
                }
              : state.lastSessionByDirectory,
          }
        })
      },
      applySessionStatus(directory, sessionID, status) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [sessionID]: status,
                },
                isBusy: current.sessionID === sessionID ? status === "busy" : current.isBusy,
              },
            },
          }
        })
      },
      applyMessageUpdated(directory, info) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== info.sessionID) {
            return state
          }
          const messages = upsertMessage(current.messages, info)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [info.sessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      applyPartUpdated(directory, part) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== part.sessionID) {
            return state
          }
          const messages = upsertPart(current.messages, part)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [part.sessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      applyPartDelta(directory, input) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          if (current.sessionID && current.sessionID !== input.sessionID) {
            return state
          }
          const messages = appendPartDelta(current.messages, input)
          const inferredBusy = inferBusyFromMessages(messages)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                messages,
                isBusy: inferredBusy,
                sessionStatusByID: {
                  ...current.sessionStatusByID,
                  [input.sessionID]: inferredBusy ? "busy" : "idle",
                },
              },
            },
          }
        })
      },
      setPendingPermissions(directory, requests) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              pendingPermissions: requests,
            },
          },
        }))
      },
      setProviders(directory, input) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              providers: input.providers,
              providerDefault: input.default,
            },
          },
        }))
      },
      setMcpStatus(directory, input) {
        set((state) => ({
          directories: {
            ...state.directories,
            [directory]: {
              ...ensureDirectoryState(state as ChatStore, directory),
              mcpStatus: input,
            },
          },
        }))
      },
      applyPermissionAsked(directory, request) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          const existingIndex = current.pendingPermissions.findIndex((item) => item.id === request.id)
          const nextPending =
            existingIndex === -1
              ? [...current.pendingPermissions, request]
              : current.pendingPermissions.map((item, index) => (index === existingIndex ? request : item))

          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                pendingPermissions: nextPending,
              },
            },
          }
        })
      },
      applyPermissionReplied(directory, requestID) {
        set((state) => {
          const current = ensureDirectoryState(state as ChatStore, directory)
          return {
            directories: {
              ...state.directories,
              [directory]: {
                ...current,
                pendingPermissions: current.pendingPermissions.filter((item) => item.id !== requestID),
              },
            },
          }
        })
      },
      setStreamStatus(status) {
        set({ streamStatus: status })
      },
    }),
    {
      name: "buddy.chat.v2",
      storage: createPlatformJsonStorage("buddy.chat.dat"),
      merge(persistedState, currentState) {
        const persisted = (persistedState ?? {}) as Partial<ChatStore>
        const projects = Array.from(
          new Set(
            (persisted.projects ?? [])
              .map((directory) => normalizeProjectDirectory(directory))
              .filter(Boolean),
          ),
        ) as string[]
        const activeDirectory = normalizeProjectDirectory(persisted.activeDirectory)
        const lastSessionByDirectory = Object.fromEntries(
          Object.entries(persisted.lastSessionByDirectory ?? {}).filter(([directory]) => projects.includes(directory)),
        )

        return {
          ...currentState,
          ...persisted,
          projects,
          activeDirectory: activeDirectory && projects.includes(activeDirectory) ? activeDirectory : projects[0],
          lastSessionByDirectory,
        }
      },
      partialize(state) {
        const projects = Array.from(
          new Set(state.projects.map((directory) => normalizeProjectDirectory(directory)).filter(Boolean)),
        ) as string[]
        const activeDirectory = normalizeProjectDirectory(state.activeDirectory)
        return {
          projects,
          activeDirectory: activeDirectory && projects.includes(activeDirectory) ? activeDirectory : projects[0],
          lastSessionByDirectory: Object.fromEntries(
            Object.entries(state.lastSessionByDirectory).filter(([directory]) => projects.includes(directory)),
          ),
        }
      },
    },
  ),
)
