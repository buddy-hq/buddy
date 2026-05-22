import { useShallow } from "zustand/react/shallow"
import { parseSubagentSession } from "@/lib/session-family"
import { useChatStore } from "@/state/chat-store"
import type { MessageWithParts } from "@/state/chat-types"
import type { ToolPartProps } from "../../registry"
import {
  buildHiddenStepsSummary,
  createHiddenStepsEntry,
  getGroupDominantIcon,
  hiddenStepsEntryIsActive,
} from "../../hidden-steps/entries"
import { groupAssistantParts, prioritizeReasoningParts } from "../../../utils/message-utils"
import type { SubagentCardStatus } from "./subagent-card"
import { readTaskAgent, readTaskSessionId } from "./task-utils"

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

export function buildSubagentActivityState(input: {
  messages: MessageWithParts[]
  toolIsActive: boolean
}) {
  const assistantItems = groupAssistantParts(
    input.messages
      .filter((message) => message.info.role === "assistant")
      .flatMap((message) => prioritizeReasoningParts(message.parts)),
    true,
  )

  const abstractedItems = assistantItems.filter(
    (item): item is Extract<(typeof assistantItems)[number], { type: "abstracted" }> =>
      item.type === "abstracted",
  )
  const allEntries = abstractedItems.flatMap((item) => item.parts.map(createHiddenStepsEntry))

  if (input.toolIsActive) {
    const currentItem = abstractedItems[abstractedItems.length - 1]
    if (!currentItem) {
      return {
        activityLine: undefined,
        activityIcon: undefined,
      }
    }

    const currentEntries = currentItem.parts.map(createHiddenStepsEntry)
    const currentContext = {
      followupStartedAt: currentItem.followupStartedAt,
    }
    const hasActiveEntry = currentEntries.some((entry) => hiddenStepsEntryIsActive(entry, currentContext))

    return {
      activityLine: hasActiveEntry
        ? buildHiddenStepsSummary(currentEntries, {
            isBusy: true,
            followupStartedAt: currentItem.followupStartedAt,
          })
        : undefined,
      activityIcon: getGroupDominantIcon(currentEntries) ?? getGroupDominantIcon(allEntries),
    }
  }

  return {
    activityLine:
      allEntries.length > 0
        ? buildHiddenStepsSummary(allEntries, {
            isBusy: false,
          })
        : undefined,
    activityIcon: getGroupDominantIcon(allEntries),
  }
}

export function useSubagentCardData(
  input: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">,
) {
  const childSessionID = readTaskSessionId(input.state.metadata)
  const configuredSubagent = readTaskAgent(input.state.input, input.state.metadata)
  const onOpenSession = input.onOpenSession
  const openChildSession =
    childSessionID && onOpenSession ? () => onOpenSession(childSessionID) : undefined

  // Use tool state as authoritative source for busy status — child session status
  // may lag behind the parent tool's completion.
  const toolIsActive = input.state.status === "pending" || input.state.status === "running"

  const { agentName, activityLine, activityIcon } = useChatStore(
    useShallow((store) => {
      const dirState = input.directory ? store.directories[input.directory] : undefined

      // Agent name: prefer parsed subagent name from session title, then input config.
      const childSession = dirState?.sessions.find((s) => s.id === childSessionID)
      const parsedSession = childSession ? parseSubagentSession(childSession) : undefined
      const rawName = parsedSession?.agent ?? configuredSubagent ?? undefined
      const agentName = rawName ? formatAgentName(rawName) : undefined

      // Build activity summary from ALL assistant messages in the child session so
      // earlier-turn tool usage isn't hidden when the last message is text-only.
      const childMessages = childSessionID
        ? (dirState?.messagesBySessionID?.[childSessionID] ?? [])
        : []
      const { activityLine, activityIcon } = buildSubagentActivityState({
        messages: childMessages,
        toolIsActive,
      })

      return { agentName, activityLine, activityIcon }
    }),
  )

  const status = toolStateToSubagentStatus(input.state.status)

  return {
    agentName,
    openChildSession,
    activityLine,
    activityIcon,
    activityActive: toolIsActive,
    status,
  }
}
