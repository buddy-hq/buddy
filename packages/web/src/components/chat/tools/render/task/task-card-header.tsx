import { useShallow } from "zustand/react/shallow"
import { parseSubagentSession } from "@/lib/session-family"
import { isTerminalAssistantMessageInfo } from "@/state/chat-tool-parts"
import { useChatStore } from "@/state/chat-store"
import { isSessionStatusActive } from "@/state/session-status"
import { readNonEmptyString, readString } from "../../types"
import type { ToolPartProps } from "../../registry"
import {
  createHiddenStepsEntry,
  hiddenStepsEntryIsActive,
  resolveHiddenStepsHeader,
} from "../../hidden-steps/entries"
import { useFileToolHeaderDisplay } from "../../hidden-steps/use-file-tool-header-display"
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

  const {
    agentName,
    taskTitle,
    headerLabel,
    headerIcon,
    throttleFileTools,
    fileName,
    headerVerb,
    childHasActiveTool,
    childSettled,
  } = useChatStore(
    useShallow((store) => {
      const dirState = input.directory ? store.directories[input.directory] : undefined

      // Agent name: prefer parsed subagent name from session title, then input config.
      const childSession = dirState?.sessions.find((s) => s.id === childSessionID)
      const parsedSession = childSession ? parseSubagentSession(childSession) : undefined
      const rawName = parsedSession?.agent ?? configuredSubagent ?? undefined
      const agentName = rawName ? formatAgentName(rawName) : undefined
      const taskTitle = parsedSession?.title ?? configuredTaskTitle

      // Build activity summary from ALL assistant messages in the child session so
      // earlier-turn tool usage isn't hidden when the last message is text-only.
      const childMessages = childSessionID
        ? (dirState?.messagesBySessionID?.[childSessionID] ?? [])
        : []
      const latestChildAssistant = childMessages.findLast(
        (message) => message.info.role === "assistant",
      )
      const childSettled =
        !!latestChildAssistant &&
        isTerminalAssistantMessageInfo(latestChildAssistant.info) &&
        !isSessionStatusActive(
          childSessionID ? dirState?.sessionStatusByID[childSessionID] : undefined,
        )
      const cardIsActive = parentToolIsActive && !childSettled
      const allEntries = childMessages
        .filter((m) => m.info.role === "assistant")
        .flatMap((m) => m.parts.map(createHiddenStepsEntry))
      const header = resolveHiddenStepsHeader(allEntries, cardIsActive)
      const childHasActiveTool = allEntries.some(hiddenStepsEntryIsActive)

      return {
        agentName,
        taskTitle,
        headerLabel: header.label,
        headerIcon: header.icon,
        throttleFileTools: header.throttleFileTools,
        fileName: header.fileName,
        headerVerb: header.verb,
        childHasActiveTool,
        childSettled,
      }
    }),
  )

  const toolStatus = toolStateToSubagentStatus(input.state.status)
  const status =
    childSettled && (toolStatus === "pending" || toolStatus === "running")
      ? "completed"
      : toolStatus
  const cardIsActive = status === "pending" || status === "running"

  const displayHeader = useFileToolHeaderDisplay({
    label: headerLabel,
    icon: headerIcon,
    throttleFileTools,
    fileName,
    verb: headerVerb,
    isBusy: cardIsActive,
  })

  const activityLine = cardIsActive && !childHasActiveTool ? undefined : displayHeader.label
  const activityIcon = displayHeader.icon

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
