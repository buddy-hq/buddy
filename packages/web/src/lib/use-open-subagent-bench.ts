import { useCallback } from "react"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { useNotifications } from "@/state/notifications"
import { useUiPreferences } from "@/state/ui-preferences"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { SessionInfoEventSchema } from "@/lib/directory-chat/chat-event-schemas"
import { useChatStore } from "@/state/chat-store"

export async function loadSubagentBenchSession(directory: string, sessionID: string) {
  const session = SessionInfoEventSchema.parse(requireBuddyData(await getBuddyClient(directory).session.get({ sessionID })))
  useChatStore.getState().applySessionUpdated(directory, session)
  return session
}

export type OpenSubagentBench = (directory: string, sessionID: string) => Promise<boolean>

export function useOpenSubagentBench(): OpenSubagentBench {
  const openBench = useOpenBench()

  return useCallback(
    async (directory: string, sessionID: string) => {
      const result = await openBench({
        directory,
        target: { type: "session", sessionID },
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      })
      if (result.outcome !== "committed") return false

      useUiPreferences.getState().clearUnread(directory, sessionID)
      useNotifications.getState().markSessionViewed(sessionID)
      return true
    },
    [openBench],
  )
}
