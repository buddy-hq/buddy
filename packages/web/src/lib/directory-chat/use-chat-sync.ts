import { useEffect } from "react"
import { startChatSync } from "@/state/chat-sync"
import { resyncDirectory } from "@/state/chat-actions"
import { useUiPreferences } from "@/state/ui-preferences"
import { useChatStore } from "@/state/chat-store"
import { readSessionErrorMessage } from "./chat-prompt-helpers"
import type {
  GlobalEvent,
  MessageInfo,
  MessagePart,
  PermissionRequest,
  SessionInfo,
} from "@/state/chat-types"

type UseChatSyncProps = {
  decodedDirectory: string
  hasRegisteredProject: boolean
  applySessionUpdated: (directory: string, info: SessionInfo) => void
  applySessionStatus: (directory: string, sessionID: string, status: "busy" | "idle") => void
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

    const sync = startChatSync({
      directory: decodedDirectory,
      onStatus(status) {
        setStreamStatus(status)
      },
      onOpen() {
        if (!decodedDirectory || decodedDirectory === "/") return
        void resyncDirectory(decodedDirectory)
      },
      onEvent(event: GlobalEvent) {
        const directory = event.directory
        if (!directory || directory === "global") {
          if (event.payload.type === "server.connected") {
            if (!decodedDirectory || decodedDirectory === "/") return
            void resyncDirectory(decodedDirectory)
          }
          return
        }

        const payload = event.payload
        const properties = payload.properties

        if (payload.type === "session.created" || payload.type === "session.updated") {
          applySessionUpdated(directory, properties.info as SessionInfo)
          return
        }

        if (payload.type === "session.status") {
          const rawStatus = properties.status
          const statusType =
            typeof rawStatus === "string"
              ? rawStatus
              : rawStatus && typeof rawStatus === "object" && "type" in rawStatus
                ? String((rawStatus as { type?: unknown }).type ?? "idle")
                : "idle"
          const normalizedStatus = statusType === "busy" || statusType === "retry" ? "busy" : "idle"
          const statusSessionID = String(properties.sessionID ?? "")
          applySessionStatus(directory, statusSessionID, normalizedStatus)
          const activeSessionID = useChatStore.getState().directories[directory]?.sessionID
          if (
            normalizedStatus === "idle" &&
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
            applySessionStatus(directory, erroredSessionID, "idle")
          }
          setDirectoryError(directory, readSessionErrorMessage(properties.error))
          return
        }

        if (payload.type === "server.instance.disposed") {
          setDirectoryError(directory, "Buddy backend restarted. Reconnecting notebook state.")
          void resyncDirectory(directory).catch(() => undefined)
          return
        }

        if (payload.type === "message.updated") {
          const info = properties.info as MessageInfo
          applyMessageUpdated(directory, info)
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
          applyPermissionAsked(directory, properties as PermissionRequest)
          return
        }

        if (payload.type === "permission.replied") {
          applyPermissionReplied(directory, String(properties.requestID ?? ""))
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
    setDirectoryError,
    setStreamStatus,
    setSystemPromptRefreshToken,
  ])

  // ── Background refresh interval ─────────────────────────────────────────────
  useEffect(() => {
    if (!decodedDirectory || !hasRegisteredProject) return

    const refresh = () => {
      refreshSlashCommands()
      refreshMcpStatus()
    }
    const interval = window.setInterval(refresh, 30_000)
    const onFocus = () => refresh()
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      refresh()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [decodedDirectory, hasRegisteredProject, refreshMcpStatus, refreshSlashCommands])
}
