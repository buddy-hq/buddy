import { useChatStore } from "@/state/chat-store"

export async function copyToClipboard(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

// Uses Zustand escape hatch (getState) — not a hook, safe to call anywhere.
export function buildSessionTrace(input: { directory: string; sessionID?: string; streamStatus: string }) {
  const state = useChatStore.getState()
  const directoryState = state.directories[input.directory]
  const session = directoryState?.sessions.find((entry) => entry.id === input.sessionID)

  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      directory: input.directory,
      sessionID: input.sessionID,
      streamStatus: input.streamStatus,
      session,
      directoryState: directoryState
        ? {
            sessionTitle: directoryState.sessionTitle,
            sessionStatusByID: directoryState.sessionStatusByID,
            isBusy: directoryState.isBusy,
            isReady: directoryState.isReady,
            error: directoryState.error,
            pendingPermissions: directoryState.pendingPermissions,
            sessions: directoryState.sessions,
            messages: directoryState.messages,
          }
        : undefined,
      openProjects: state.openProjects,
      activeDirectory: state.activeDirectory,
      lastSessionByDirectory: state.lastSessionByDirectory,
    },
    null,
    2,
  )
}
