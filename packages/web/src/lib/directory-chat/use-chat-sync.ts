import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { startChatSync } from "@/state/chat-sync"
import { resyncDirectory } from "@/state/chat-actions"
import { isAbortLikeError } from "@/state/chat-error"
import { useUiPreferences } from "@/state/ui-preferences"
import { useChatStore } from "@/state/chat-store"
import { getModelSelectionScopeKey, useModelSelectionStore } from "@/state/model-selection-store"
import { IDLE_SESSION_STATUS, normalizeSessionStatusValue } from "@/state/session-status"
import {
  removeDirectoryPermissionQueryData,
  setDirectoryPermissionsQueryData,
  setDirectorySessionsQueryData,
  upsertDirectoryPermissionQueryData,
  upsertDirectorySessionQueryData,
} from "@/state/directory-chat-query"
import { readSessionErrorMessage } from "./chat-prompt-helpers"
import type {
  GlobalEvent,
  MessageInfo,
  MessagePart,
  PermissionRequest,
  SessionStatusInfo,
  SessionInfo,
} from "@/state/chat-types"

const DOCUMENT_VISIBILITY_VISIBLE = "visible"

type UseChatSyncProps = {
  decodedDirectory: string
  hasRegisteredProject: boolean
  applySessionUpdated: (directory: string, info: SessionInfo) => void
  applySessionStatus: (directory: string, sessionID: string, status: SessionStatusInfo) => void
  applyMessageUpdated: (directory: string, info: MessageInfo) => void
  applyPartUpdated: (directory: string, part: MessagePart) => void
  applyPartDelta: (
    directory: string,
    delta: { sessionID: string; messageID: string; partID: string; field: string; delta: string },
  ) => void
  applyPermissionAsked: (directory: string, request: PermissionRequest) => void
  applyPermissionReplied: (directory: string, requestID: string) => void
  clearDirectoryError: (directory: string) => void
  setDirectoryError: (directory: string, error: string) => void
  setStreamStatus: (status: "idle" | "connecting" | "connected" | "error") => void
  setSystemPromptRefreshToken: (updater: (current: number) => number) => void
  refreshSlashCommands: () => void
  refreshMcpStatus: () => void
}

export function useChatSync(props: UseChatSyncProps) {
  const queryClient = useQueryClient()
  const {
    decodedDirectory,
    hasRegisteredProject,
    applyMessageUpdated,
    applyPartDelta,
    applyPartUpdated,
    applyPermissionAsked,
    applyPermissionReplied,
    applySessionStatus,
    applySessionUpdated,
    clearDirectoryError,
    refreshMcpStatus,
    refreshSlashCommands,
    setDirectoryError,
    setStreamStatus,
    setSystemPromptRefreshToken,
  } = props

  // ── SSE sync ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    const syncDirectoryQueriesFromStore = (directory: string) => {
      const directoryState = useChatStore.getState().directories[directory]
      setDirectorySessionsQueryData(queryClient, directory, directoryState?.sessions ?? [])
      setDirectoryPermissionsQueryData(
        queryClient,
        directory,
        directoryState?.pendingPermissions ?? [],
      )
    }

    const resyncQueryBackedDirectory = (directory: string) =>
      resyncDirectory(directory)
        .then(() => {
          syncDirectoryQueriesFromStore(directory)
        })
        .catch(() => undefined)

    const sync = startChatSync({
      directory: decodedDirectory,
      onStatus(status) {
        setStreamStatus(status)
      },
      onOpen() {
        if (!decodedDirectory || decodedDirectory === "/") return
        void resyncQueryBackedDirectory(decodedDirectory)
      },
      onEvent(event: GlobalEvent) {
        const directory = event.directory
        if (!directory || directory === "global") {
          if (event.payload.type === "server.connected") {
            if (!decodedDirectory || decodedDirectory === "/") return
            void resyncQueryBackedDirectory(decodedDirectory)
          }
          return
        }

        const payload = event.payload
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
          applySessionStatus(directory, statusSessionID, normalizedStatus)
          const activeSessionID = useChatStore.getState().directories[directory]?.sessionID
          if (normalizedStatus.type === "busy" && statusSessionID === activeSessionID) {
            clearDirectoryError(directory)
          }
          if (
            normalizedStatus.type === "idle" &&
            statusSessionID &&
            statusSessionID === activeSessionID
          ) {
            setSystemPromptRefreshToken((token) => token + 1)
          }
          return
        }

        if (payload.type === "session.error") {
          const erroredSessionID =
            typeof properties.sessionID === "string" && properties.sessionID
              ? properties.sessionID
              : undefined
          if (erroredSessionID) {
            applySessionStatus(directory, erroredSessionID, IDLE_SESSION_STATUS)
          }
          if (isAbortLikeError(properties.error)) {
            clearDirectoryError(directory)
            return
          }
          setDirectoryError(directory, readSessionErrorMessage(properties.error))
          return
        }

        if (payload.type === "server.instance.disposed") {
          setDirectoryError(directory, "Buddy backend restarted. Reconnecting notebook state.")
          void resyncQueryBackedDirectory(directory)
          return
        }

        if (payload.type === "message.updated") {
          const info = properties.info as MessageInfo
          applyMessageUpdated(directory, info)
          if (info.role === "user" && info.sessionID) {
            useModelSelectionStore
              .getState()
              .restoreSessionSelection(getModelSelectionScopeKey(directory, info.sessionID), {
                agent: info.agent,
                model: `${info.model.providerID}/${info.model.modelID}`,
                variant: info.variant ?? null,
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

        if (payload.type === "message.part.updated") {
          applyPartUpdated(directory, properties.part as MessagePart)
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
          applyPermissionAsked(directory, permissionRequest)
          upsertDirectoryPermissionQueryData(queryClient, directory, permissionRequest)
          return
        }

        if (payload.type === "permission.replied") {
          applyPermissionReplied(directory, String(properties.requestID ?? ""))
          removeDirectoryPermissionQueryData(
            queryClient,
            directory,
            String(properties.requestID ?? ""),
          )
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
    applyPartDelta,
    applyPartUpdated,
    applyPermissionAsked,
    applyPermissionReplied,
    applySessionStatus,
    applySessionUpdated,
    clearDirectoryError,
    queryClient,
    setDirectoryError,
    setStreamStatus,
    setSystemPromptRefreshToken,
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
