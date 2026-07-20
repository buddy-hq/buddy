import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { parseSubagentSession } from "@/lib/session-family"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import { useChatStore } from "@/state/chat-store"
import { isSessionStatusActive } from "@/state/session-status"
import { useTranscriptSessionMessages } from "@/state/transcript-repository"
import { readNonEmptyString, readString } from "../../types"
import type { ToolPartProps } from "../../registry"
import {
  activityEntryIsActive,
  createActivityEntry,
  resolveActivityHeader,
} from "../../activity-row/entries"
import type { SubagentCardStatus } from "./subagent-card"

/** Convert snake_case / kebab-case agent identifiers to Title Case display names. */
function formatAgentName(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

export function toolStateToSubagentStatus(
  status: ToolPartProps["state"]["status"],
): SubagentCardStatus {
  switch (status) {
    case "running":
      return "running"
    case "completed":
      return "completed"
    case "error":
      return "error"
    default:
      return "pending"
  }
}

export function useSubagentCardData(
  input: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">,
) {
  const childSessionID = readString(input.state.metadata.sessionId)
  const configuredSubagent = readString(input.state.input.subagent_type)
  const configuredTaskTitle = readNonEmptyString(input.state.input.description)
  const onOpenSession = input.onOpenSession
  const openChildSession =
    childSessionID && onOpenSession ? () => onOpenSession(childSessionID) : undefined

  const parentToolIsActive = input.state.status === "pending" || input.state.status === "running"
  const childMessages = useTranscriptSessionMessages(input.directory, childSessionID)

  const { agentName, taskTitle, childSessionStatus } = useChatStore(
    useShallow((store) => {
      const dirState = input.directory ? store.directories[input.directory] : undefined

      // Agent name: prefer parsed subagent name from session title, then input config.
      const childSession = dirState?.sessions.find((s) => s.id === childSessionID)
      const parsedSession = childSession ? parseSubagentSession(childSession) : undefined
      const rawName = parsedSession?.agent ?? configuredSubagent ?? undefined
      const agentName = rawName ? formatAgentName(rawName) : undefined
      const taskTitle = parsedSession?.title ?? configuredTaskTitle

      return {
        agentName,
        taskTitle,
        childSessionStatus: childSessionID
          ? dirState?.sessionStatusByID[childSessionID]
          : undefined,
      }
    }),
  )
  const latestChildAssistant = childMessages.findLast(
    (message) => message.info.role === "assistant",
  )
  const childSettled =
    !!latestChildAssistant &&
    isTerminalAssistantMessageInfo(latestChildAssistant.info) &&
    !isSessionStatusActive(childSessionStatus)
  const cardIsActiveForHeader = parentToolIsActive && !childSettled
  const allEntries = useMemo(
    () =>
      childMessages
        .filter((message) => message.info.role === "assistant")
        .flatMap((message) => message.parts.flatMap((part) => createActivityEntry(part) ?? [])),
    [childMessages],
  )
  const header = useMemo(
    () =>
      resolveActivityHeader({
        entries: allEntries,
        busy: cardIsActiveForHeader,
        current: cardIsActiveForHeader,
        zeroEntryLabel: "Working",
      }),
    [allEntries, cardIsActiveForHeader],
  )
  const childHasActiveTool = allEntries.some(activityEntryIsActive)

  const toolStatus = toolStateToSubagentStatus(input.state.status)
  const status =
    childSettled && (toolStatus === "pending" || toolStatus === "running")
      ? "completed"
      : toolStatus
  const cardIsActive = status === "pending" || status === "running"

  const activityLine = cardIsActive && !childHasActiveTool ? undefined : header.label
  const activityIcon = header.icon

  return {
    agentName,
    taskTitle,
    openChildSession,
    activityLine,
    activityContent: undefined,
    activityIcon,
    activityActive: cardIsActive,
    status,
  }
}
