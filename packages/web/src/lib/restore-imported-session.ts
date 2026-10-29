import { selectActiveChatSession } from "@/lib/active-chat-transition-coordinator"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import { selectSession, takeAwaitedImportedSession } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { SessionInfo } from "@/state/chat-types"

export async function restoreAwaitedImportedSession(
  directory: string,
  sessions: readonly SessionInfo[],
  select: {
    readonly active: (
      directory: string,
      sessionID: string,
    ) => ReturnType<typeof selectActiveChatSession> | void | Promise<void>
    readonly inactive: (
      directory: string,
      sessionID: string,
    ) => ReturnType<typeof selectSession> | void | Promise<void>
  } = {
    active: (directory, sessionID) => selectActiveChatSession({ directory, sessionID }),
    inactive: selectSession,
  },
): Promise<void> {
  const sessionID = takeAwaitedImportedSession(directory, sessions)
  if (sessionID === undefined) return

  if (
    canonicalProjectDirectory(useChatStore.getState().activeDirectory) ===
    canonicalProjectDirectory(directory)
  ) {
    await select.active(directory, sessionID)
  } else {
    await select.inactive(directory, sessionID)
  }
}
