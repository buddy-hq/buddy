import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  readWorkspaceFileWatcherUpdatePayload,
  type WorkspaceFileWatcherEventKind,
} from "@buddy/opencode-adapter/file-watcher"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { startChatSync } from "@/state/chat-sync"
import {
  readBenchClientActionEvent,
  readBenchClientLeaseEvent,
  type BenchClientActionV1,
} from "@/lib/directory-workspace-client-actions"
import type { BenchClientLease } from "@/lib/directory-workspace-lifecycle"
import { resyncDirectory, resyncDirectoryAfterReconnect } from "@/state/chat-actions"
import { isAbortLikeError } from "@/state/chat-error"
import { useUiPreferences } from "@/state/ui-preferences"
import { useChatStore } from "@/state/chat-store"
import {
  addTranscriptPendingInput,
  getTranscriptMessages,
  markTranscriptSessionOptimistic,
  markTranscriptSessionRunning,
  removeTranscriptPendingInput,
  sealTranscriptAssistantMessages,
  syncTranscriptPendingInputs,
} from "@/state/transcript-repository"
import { useNotifications } from "@/state/notifications"
import { useNotificationPreferences } from "@/state/notification-preferences"
import { getModelSelectionScopeKey, useModelSelectionStore } from "@/state/model-selection-store"
import { IDLE_SESSION_STATUS, normalizeSessionStatusValue } from "@/state/session-status"
import {
  removeDirectoryPermissionQueryData,
  removeDirectoryQuestionQueryData,
  setDirectoryPermissionsQueryData,
  setDirectoryQuestionsQueryData,
  setDirectorySessionsQueryData,
  upsertDirectoryPermissionQueryData,
  upsertDirectoryQuestionQueryData,
  upsertDirectorySessionQueryData,
} from "@/state/directory-chat-query"
import { readSessionErrorMessage } from "./chat-prompt-helpers"
import type {
  GlobalEvent,
  MessageInfo,
  MessagePart,
  PermissionRequest,
  QuestionRequest,
  SessionStatusInfo,
  SessionInfo,
} from "@/state/chat-types"
import type { EventStreamData } from "@buddy/sdk/types"
import { encodeDirectory } from "../directory-token"

const DOCUMENT_VISIBILITY_VISIBLE = "visible"
const PERMISSION_NOTIFICATION_COOLDOWN_MS = 15_000
const NOTIFICATION_PREVIEW_MAX_LENGTH = 360
const DEFAULT_SESSION_TITLE = "New thread"
const GLOBAL_NOTIFICATION_SESSION = "global"

function sessionHref(directory: string, sessionID: string) {
  return `/${encodeDirectory(directory)}/chat?session=${encodeURIComponent(sessionID)}`
}

function directoryHref(directory: string) {
  return `/${encodeDirectory(directory)}/chat`
}

function sessionDescription(directory: string, sessionID: string) {
  const directoryState = useChatStore.getState().directories[directory]
  const session = directoryState?.sessions.find((item) => item.id === sessionID)
  return session?.title || directoryState?.sessionTitle || DEFAULT_SESSION_TITLE
}

function sessionInfo(directory: string, sessionID: string | undefined) {
  if (!sessionID) return undefined
  return useChatStore
    .getState()
    .directories[directory]?.sessions.find((session) => session.id === sessionID)
}

function isParentSession(directory: string, sessionID: string | undefined) {
  const session = sessionInfo(directory, sessionID)
  return !!session && !session.parentID
}

function isViewedInCurrentSession(directory: string, sessionID: string | undefined) {
  if (!sessionID) return false
  const store = useChatStore.getState()
  return (
    store.activeDirectory === directory && store.directories[directory]?.sessionID === sessionID
  )
}

function normalizeNotificationText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function truncateNotificationText(text: string) {
  if (text.length <= NOTIFICATION_PREVIEW_MAX_LENGTH) return text
  return `${text.slice(0, NOTIFICATION_PREVIEW_MAX_LENGTH).trimEnd()}...`
}

function readLatestAssistantResponsePreview(directory: string, sessionID: string) {
  const messages = getTranscriptMessages(directory, sessionID)

  for (const message of messages.toReversed()) {
    if (message.info.role !== "assistant") continue
    const text = message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => String(part.text))
      .join("\n\n")
    const normalized = normalizeNotificationText(text)
    if (normalized) return truncateNotificationText(normalized)
  }

  return undefined
}

function appendTurnCompleteNotification(directory: string, sessionID: string) {
  const viewed = isViewedInCurrentSession(directory, sessionID)
  useNotifications.getState().append({
    directory,
    session: sessionID,
    time: Date.now(),
    type: "turn-complete",
    viewed,
  })
  if (!viewed) {
    useUiPreferences.getState().markUnread(directory, sessionID)
  }
}

function appendErrorNotification(directory: string, sessionID: string | undefined, error: unknown) {
  const viewed = isViewedInCurrentSession(directory, sessionID)
  const notificationSession = sessionID ?? GLOBAL_NOTIFICATION_SESSION
  useNotifications.getState().append({
    directory,
    session: notificationSession,
    time: Date.now(),
    type: "error",
    error,
    viewed,
  })
  if (!viewed && sessionID) {
    useUiPreferences.getState().markUnread(directory, sessionID)
  }
}

type UseChatSyncProps = {
  decodedDirectory: string
  hasRegisteredProject: boolean
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
    delta: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
  ) => void
  applyPermissionAsked: (directory: string, request: PermissionRequest) => void
  applyPermissionReplied: (directory: string, requestID: string) => void
  applyQuestionAsked: (directory: string, request: QuestionRequest) => void
  applyQuestionResolved: (directory: string, requestID: string) => void
  clearDirectoryError: (directory: string) => void
  setDirectoryError: (directory: string, error: string) => void
  setStreamStatus: (status: "idle" | "connecting" | "connected" | "error") => void
  refreshSlashCommands: () => void
  refreshMcpStatus: () => void
  getBenchEventStreamLeaseQuery?: () => Partial<NonNullable<EventStreamData["query"]>>
  onBenchClientLease?: (lease: BenchClientLease) => void
  onBenchClientAction?: (action: BenchClientActionV1) => void | Promise<void>
  onAgentTurnComplete?: () => void | Promise<void>
  onWorkspaceFileChanged?: (input: {
    path: string
    event: WorkspaceFileWatcherEventKind
  }) => void | Promise<void>
}

export function useChatSync(props: UseChatSyncProps) {
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const {
    decodedDirectory,
    hasRegisteredProject,
    applyMessageUpdated,
    applyMessageRemoved,
    applyPartDelta,
    applyPartUpdated,
    applyPartRemoved,
    applyPermissionAsked,
    applyPermissionReplied,
    applyQuestionAsked,
    applyQuestionResolved,
    applySessionStatus,
    applySessionUpdated,
    clearDirectoryError,
    refreshMcpStatus,
    refreshSlashCommands,
    setDirectoryError,
    setStreamStatus,
    getBenchEventStreamLeaseQuery,
    onBenchClientLease,
    onBenchClientAction,
    onAgentTurnComplete,
    onWorkspaceFileChanged,
  } = props

  // ── SSE sync ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return
    const workingSessions = new Set<string>()
    const attentionNotificationAt = new Map<string, number>()

    const syncDirectoryQueriesFromStore = (directory: string) => {
      const directoryState = useChatStore.getState().directories[directory]
      setDirectorySessionsQueryData(queryClient, directory, directoryState?.sessions ?? [])
      setDirectoryPermissionsQueryData(
        queryClient,
        directory,
        directoryState?.pendingPermissions ?? [],
      )
      setDirectoryQuestionsQueryData(queryClient, directory, directoryState?.pendingQuestions ?? [])
      syncTranscriptPendingInputs(directory, [
        ...(directoryState?.pendingPermissions ?? []).map((request) => ({
          requestID: request.id,
          sessionID: request.sessionID,
        })),
        ...(directoryState?.pendingQuestions ?? []).map((request) => ({
          requestID: request.id,
          sessionID: request.sessionID,
        })),
      ])
    }

    const resyncQueryBackedDirectory = (directory: string) =>
      resyncDirectory(directory)
        .then(() => {
          syncDirectoryQueriesFromStore(directory)
        })
        .catch(() => undefined)

    let hasConnected = false
    let shouldRecoverOnReconnect = false

    const sync = startChatSync({
      directory: decodedDirectory,
      eventQuery: getBenchEventStreamLeaseQuery,
      onStatus(status) {
        setStreamStatus(status)
        if (status === "connected") {
          if (hasConnected && shouldRecoverOnReconnect && decodedDirectory !== "/") {
            shouldRecoverOnReconnect = false
            void resyncDirectoryAfterReconnect(decodedDirectory)
              .then(() => {
                syncDirectoryQueriesFromStore(decodedDirectory)
              })
              .catch(() => undefined)
          }
          hasConnected = true
          return
        }

        if (hasConnected && (status === "connecting" || status === "error")) {
          shouldRecoverOnReconnect = true
        }
      },
      onEvent(event: GlobalEvent) {
        const directory = event.directory
        if (!directory || directory === "global") {
          return
        }

        const payload = event.payload
        const benchLease = readBenchClientLeaseEvent(payload)
        if (benchLease) {
          onBenchClientLease?.(benchLease)
          return
        }
        const benchAction = readBenchClientActionEvent(payload)
        if (benchAction) {
          void onBenchClientAction?.(benchAction)
          return
        }
        const watcherUpdate = readWorkspaceFileWatcherUpdatePayload(payload)
        if (watcherUpdate?.relativePath) {
          void onWorkspaceFileChanged?.({
            path: watcherUpdate.relativePath,
            event: watcherUpdate.event,
          })
          return
        }
        if (!("properties" in payload)) {
          return
        }

        if (payload.type === "server.connected" || payload.type === "server.heartbeat") {
          return
        }

        const properties = payload.properties

        if (payload.type === "session.created" || payload.type === "session.updated") {
          const sessionInfo = properties.info as SessionInfo
          applySessionUpdated(directory, sessionInfo)
          upsertDirectorySessionQueryData(queryClient, directory, sessionInfo)
          return
        }

        if (payload.type === "session.status") {
          const normalizedStatus = normalizeSessionStatusValue(properties.status)
          const statusSessionID = String(properties.sessionID ?? "")
          if (normalizedStatus.type === "idle") {
            if (statusSessionID) {
              sealTranscriptAssistantMessages(directory, statusSessionID, Date.now())
            }
            if (
              statusSessionID &&
              workingSessions.delete(statusSessionID) &&
              isParentSession(directory, statusSessionID)
            ) {
              void onAgentTurnComplete?.()
              appendTurnCompleteNotification(directory, statusSessionID)
              const notificationPreferences = useNotificationPreferences.getState().preferences
              if (notificationPreferences.agent) {
                const title = sessionDescription(directory, statusSessionID)
                const description =
                  readLatestAssistantResponsePreview(directory, statusSessionID) ??
                  language.t("notification.session.responseReady.fallbackDescription")
                void platform.notify(title, description, sessionHref(directory, statusSessionID))
              }
            }
          } else if (statusSessionID) {
            workingSessions.add(statusSessionID)
          }
          if (statusSessionID) {
            markTranscriptSessionRunning(
              directory,
              statusSessionID,
              normalizedStatus.type !== "idle",
            )
          }
          applySessionStatus(directory, statusSessionID, normalizedStatus)
          const activeSessionID = useChatStore.getState().directories[directory]?.sessionID
          if (normalizedStatus.type === "busy" && statusSessionID === activeSessionID) {
            clearDirectoryError(directory)
          }
          return
        }

        if (payload.type === "session.error") {
          const erroredSessionID =
            typeof properties.sessionID === "string" && properties.sessionID
              ? properties.sessionID
              : undefined
          if (erroredSessionID && !isParentSession(directory, erroredSessionID)) {
            return
          }
          if (erroredSessionID) {
            markTranscriptSessionRunning(directory, erroredSessionID, false)
            applySessionStatus(directory, erroredSessionID, IDLE_SESSION_STATUS)
          }
          if (isAbortLikeError(properties.error)) {
            clearDirectoryError(directory)
            return
          }
          const message = readSessionErrorMessage(properties.error)
          setDirectoryError(directory, message)
          appendErrorNotification(directory, erroredSessionID, properties.error)
          const notificationPreferences = useNotificationPreferences.getState().preferences
          if (notificationPreferences.errors) {
            const href = erroredSessionID
              ? sessionHref(directory, erroredSessionID)
              : directoryHref(directory)
            void platform.notify(language.t("notification.session.error.title"), message, href)
          }
          return
        }

        if (payload.type === "server.instance.disposed") {
          // Instance disposal is part of the normal backend lifecycle. Refresh the
          // notebook state without flashing a transient inline error during navigation.
          void resyncQueryBackedDirectory(directory)
          return
        }

        if (payload.type === "message.updated") {
          const info = properties.info as MessageInfo
          if (info.role === "user" && info.sessionID) {
            markTranscriptSessionOptimistic(directory, info.sessionID, false)
          }
          applyMessageUpdated(directory, info)
          if (info.role === "user" && info.sessionID) {
            useModelSelectionStore
              .getState()
              .restoreSessionSelection(getModelSelectionScopeKey(directory, info.sessionID), {
                agent: info.agent,
                model: `${info.model.providerID}/${info.model.modelID}`,
                variant: info.model.variant ?? null,
                messageCreatedAt: info.time.created,
              })
          }
          if (
            info.role === "assistant" &&
            !info.error &&
            (!!info.finish || !!info.time.completed)
          ) {
            clearDirectoryError(directory)
          }
          const activeSessionID = useChatStore.getState().directories[directory]?.sessionID
          if (info.role === "assistant" && info.sessionID && info.sessionID !== activeSessionID) {
            useUiPreferences.getState().markUnread(directory, info.sessionID)
          }
          return
        }

        if (payload.type === "message.removed") {
          applyMessageRemoved(directory, {
            sessionID: String(properties.sessionID ?? ""),
            messageID: String(properties.messageID ?? ""),
          })
          return
        }

        if (payload.type === "message.part.updated") {
          applyPartUpdated(directory, properties.part as MessagePart)
          return
        }

        if (payload.type === "message.part.removed") {
          applyPartRemoved(directory, {
            sessionID: String(properties.sessionID ?? ""),
            messageID: String(properties.messageID ?? ""),
            partID: String(properties.partID ?? ""),
          })
          return
        }

        if (payload.type === "message.part.delta") {
          applyPartDelta(directory, {
            sessionID: String(properties.sessionID ?? ""),
            messageID: String(properties.messageID ?? ""),
            partID: String(properties.partID ?? ""),
            field: String(properties.field ?? ""),
            delta: String(properties.delta ?? ""),
          })
          return
        }

        if (payload.type === "permission.asked") {
          const permissionRequest = properties as PermissionRequest
          addTranscriptPendingInput(directory, {
            requestID: permissionRequest.id,
            sessionID: permissionRequest.sessionID,
          })
          applyPermissionAsked(directory, permissionRequest)
          upsertDirectoryPermissionQueryData(queryClient, directory, permissionRequest)
          const notificationPreferences = useNotificationPreferences.getState().preferences
          if (notificationPreferences.permissions) {
            const sessionID = permissionRequest.sessionID
            const key = `permission:${directory}:${sessionID}`
            const now = Date.now()
            const lastAlertAt = attentionNotificationAt.get(key) ?? 0
            if (now - lastAlertAt > PERMISSION_NOTIFICATION_COOLDOWN_MS) {
              attentionNotificationAt.set(key, now)
              void platform.notify(
                language.t("notification.permission.title"),
                sessionDescription(directory, sessionID),
                sessionHref(directory, sessionID),
              )
            }
          }
          return
        }

        if (payload.type === "permission.replied") {
          const requestID = String(properties.requestID ?? "")
          removeTranscriptPendingInput(directory, requestID)
          applyPermissionReplied(directory, requestID)
          removeDirectoryPermissionQueryData(queryClient, directory, requestID)
          return
        }

        if (payload.type === "question.asked") {
          const questionRequest = properties as QuestionRequest
          addTranscriptPendingInput(directory, {
            requestID: questionRequest.id,
            sessionID: questionRequest.sessionID,
          })
          applyQuestionAsked(directory, questionRequest)
          upsertDirectoryQuestionQueryData(queryClient, directory, questionRequest)
          const notificationPreferences = useNotificationPreferences.getState().preferences
          if (notificationPreferences.permissions) {
            const sessionID = questionRequest.sessionID
            const key = `question:${directory}:${sessionID}`
            const now = Date.now()
            const lastAlertAt = attentionNotificationAt.get(key) ?? 0
            if (now - lastAlertAt > PERMISSION_NOTIFICATION_COOLDOWN_MS) {
              attentionNotificationAt.set(key, now)
              void platform.notify(
                language.t("notification.question.title"),
                sessionDescription(directory, sessionID),
                sessionHref(directory, sessionID),
              )
            }
          }
          return
        }

        if (payload.type === "question.replied" || payload.type === "question.rejected") {
          const requestID = String(properties.requestID ?? "")
          removeTranscriptPendingInput(directory, requestID)
          applyQuestionResolved(directory, requestID)
          removeDirectoryQuestionQueryData(queryClient, directory, requestID)
        }
      },
    })

    return () => {
      sync.stop()
      setStreamStatus("idle")
    }
  }, [
    decodedDirectory,
    hasRegisteredProject,
    applyMessageUpdated,
    applyMessageRemoved,
    applyPartDelta,
    applyPartUpdated,
    applyPartRemoved,
    applyPermissionAsked,
    applyPermissionReplied,
    applyQuestionAsked,
    applyQuestionResolved,
    applySessionStatus,
    applySessionUpdated,
    clearDirectoryError,
    platform,
    queryClient,
    setDirectoryError,
    setStreamStatus,
    getBenchEventStreamLeaseQuery,
    onBenchClientLease,
    onBenchClientAction,
    onAgentTurnComplete,
    onWorkspaceFileChanged,
  ])

  // ── Foreground refresh hooks ────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    const refresh = () => {
      refreshSlashCommands()
      refreshMcpStatus()
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState !== DOCUMENT_VISIBILITY_VISIBLE) return
      refresh()
    }
    const onFocus = () => refreshWhenVisible()
    const onVisibility = () => {
      refreshWhenVisible()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [decodedDirectory, hasRegisteredProject, refreshMcpStatus, refreshSlashCommands])
}
