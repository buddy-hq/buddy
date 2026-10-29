import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import type { SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { useChatStore } from "@/state/chat-store"
import { useTranscriptSessionMessages } from "@/state/transcript-repository"
import { deriveRunningSubagents, subagentCompletions } from "./running-subagents"

const NO_SESSIONS: readonly SessionInfo[] = []
const NO_STATUSES: Readonly<Record<string, SessionStatusInfo>> = {}

export function useRunningSubagents(
  directory: string | undefined,
  ownerSessionID: string | undefined,
) {
  const messages = useTranscriptSessionMessages(directory, ownerSessionID)
  const { sessions, sessionStatusByID } = useChatStore(
    useShallow((store) => {
      const state = directory ? store.directories[directory] : undefined
      return {
        sessions: state?.sessions ?? NO_SESSIONS,
        sessionStatusByID: state?.sessionStatusByID ?? NO_STATUSES,
      }
    }),
  )
  const running = useMemo(
    () =>
      ownerSessionID
        ? deriveRunningSubagents({ ownerSessionID, messages, sessions, sessionStatusByID })
        : [],
    [messages, ownerSessionID, sessionStatusByID, sessions],
  )
  return { running, completions: subagentCompletions(messages) }
}

export async function stopSubagent(directory: string, childSessionID: string) {
  return requireBuddyData(
    await getBuddyClient(directory).session.abort({ sessionID: childSessionID }),
  )
}

export async function continueSubagentsInBackground(directory: string, ownerSessionID: string) {
  const result = await getBuddyClient(directory).session.background({ sessionID: ownerSessionID })
  if (!result.response || !result.response.ok || result.error !== undefined) {
    throw new Error(buddyResultMessage(result))
  }
}
