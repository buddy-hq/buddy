import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import type { SubagentPresentation } from "@buddy/transcript-contract/subagent"
import { completionForSubagent, completionSettlesSubagent, subagentRunStatus } from "@/lib/running-subagents"
import { useChatStore } from "@/state/chat-store"
import { isSessionStatusActive } from "@/state/session-status"
import { useTranscriptSessionMessages } from "@/state/transcript-repository"
import { readNonEmptyString } from "../../types"
import type { ToolPartProps } from "../../registry"
import { activityEntryIsActive, createActivityEntry, resolveActivityHeader } from "../../activity-row/entries"
import type { SubagentCardStatus } from "./subagent-card"

export type SubagentCardInput = Pick<ToolPartProps, "state" | "onOpenSession" | "directory"> & {
  subagent?: SubagentPresentation
}

function toolStateToSubagentStatus(status: ToolPartProps["state"]["status"]): SubagentCardStatus {
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

export function useSubagentCardData(input: SubagentCardInput) {
  const subagent = input.subagent
  const childSessionID = subagent?.childSessionID
  const ownerMessages = useTranscriptSessionMessages(input.directory, subagent?.ownerSessionID)
  const childMessages = useTranscriptSessionMessages(input.directory, childSessionID)
  const { childTitle, childSessionStatus } = useChatStore(useShallow((store) => {
    const directoryState = input.directory ? store.directories[input.directory] : undefined
    return {
      childTitle: childSessionID ? directoryState?.sessions.find((session) => session.id === childSessionID)?.title : undefined,
      childSessionStatus: childSessionID ? directoryState?.sessionStatusByID[childSessionID] : undefined,
    }
  }))
  const completion = subagent ? completionForSubagent(ownerMessages, subagent) : undefined
  const status: SubagentCardStatus = subagent
    ? subagentRunStatus(subagent, completion, isSessionStatusActive(childSessionStatus), completionSettlesSubagent(ownerMessages, subagent))
    : toolStateToSubagentStatus(input.state.status)
  const taskTitle = subagent?.description ?? readNonEmptyString(input.state.summary?.subject) ?? (childTitle || undefined)
  const onOpenSession = input.onOpenSession
  const openChildSession = childSessionID && onOpenSession ? () => onOpenSession(childSessionID) : undefined
  const cardIsActive = status === "pending" || status === "running"
  const allEntries = useMemo(
    () => childMessages
      .filter((message) => message.info.role === "assistant")
      .flatMap((message) => message.parts.flatMap((part) => createActivityEntry(part) ?? [])),
    [childMessages],
  )
  const header = useMemo(
    () => resolveActivityHeader({ entries: allEntries, busy: cardIsActive, current: cardIsActive, zeroEntryLabel: "Working" }),
    [allEntries, cardIsActive],
  )
  const childHasActiveTool = allEntries.some(activityEntryIsActive)
  const workerFinished = status === "completed" || status === "error" || status === "cancelled"

  return {
    taskTitle,
    childSessionID,
    openChildSession,
    status,
    activityLine: status === "waiting" || (cardIsActive && !childHasActiveTool) ? undefined : header.label,
    activityContent: undefined,
    result: workerFinished ? (completion?.result ?? subagent?.result ?? input.state.error) : undefined,
    workerFinished,
  }
}
