import { Bot, PhoneCall } from "lucide-react"
import { language } from "@/context/language"
import { parseSubagentSession } from "@/lib/session-family"
import { useChatStore } from "@/state/chat-store"
import { readString } from "../../types"
import type { ToolPartProps } from "../../registry"
import { formatThreadAge } from "@/components/layout/chat-left-sidebar/thread-helpers"
import { ToolRow, ToolRowAction, ToolRowIcon, ToolRowSubject } from "../../tool-row"
import { TextShimmer } from "../../text-shimmer"

export function useTaskCardHeader(
  input: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">,
) {
  const childSessionID = readString(input.state.metadata.sessionId)
  const configuredSubagent = readString(input.state.input.subagent_type)
  const description = readString(input.state.input.description)?.trim()
  const onOpenSession = input.onOpenSession
  const openChildSession =
    childSessionID && onOpenSession ? () => onOpenSession(childSessionID) : undefined
  const childSession = useChatStore((store) => {
    if (!input.directory || !childSessionID) {
      return undefined
    }

    return store.directories[input.directory]?.sessions.find(
      (session) => session.id === childSessionID,
    )
  })
  const parsedSession = childSession ? parseSubagentSession(childSession) : undefined

  const isLoading = input.state.status === "pending" || input.state.status === "running"
  const displayTitle =
    isLoading && !parsedSession?.title
      ? language.t("chatTools.taskRunning", {
          agent: configuredSubagent || language.t("chatTools.agent"),
        })
      : parsedSession?.title ||
        description ||
        childSession?.title ||
        language.t("sidebar.untitledThread")

  const displayAgent = parsedSession?.agent || configuredSubagent
  const secondaryLine =
    description && parsedSession?.title && parsedSession.title !== description && !isLoading
      ? description
      : undefined
  const age = childSession
    ? formatThreadAge(childSession.time.updated ?? childSession.time.created)
    : undefined

  return {
    age,
    childSessionID,
    displayAgent,
    displayTitle,
    openChildSession,
    secondaryLine,
    isLoading,
  }
}

/**
 * Flat shimmer row shown while a subagent task is pending (not yet started).
 * No card chrome — appears inline like other tools, then the card
 * animates in once the subagent session is running.
 */
export function SubagentLoadingRow() {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-text-weaker" aria-hidden="true">
        <PhoneCall className="size-3.5" />
      </span>
      <TextShimmer
        text="Handing off to a specialist..."
        active={true}
        className="text-sm text-text-weak"
      />
    </div>
  )
}

export function TaskCardHeaderContent(props: {
  displayAgent?: string
  status: ToolPartProps["state"]["status"]
  onOpenSession?: () => void
}) {
  const isComplete = props.status === "completed"
  const isRunning = props.status === "running"
  const verb = isComplete ? "Used" : "Using"
  const agentName = props.displayAgent || "subagent"

  const agentLabel = isRunning ? (
    <TextShimmer text={agentName} active={true} className="text-xs text-text-weaker" />
  ) : (
    agentName
  )

  return (
    <ToolRow>
      <ToolRowIcon>
        <Bot className="size-3.5" />
      </ToolRowIcon>
      <ToolRowAction>{verb}</ToolRowAction>
      {props.onOpenSession ? (
        <button
          type="button"
          onClick={props.onOpenSession}
          className="min-w-0 flex-1 truncate text-left text-xs text-text-weaker transition-colors hover:text-text-interactive-base hover:underline"
        >
          {agentLabel}
        </button>
      ) : (
        <ToolRowSubject>{agentLabel}</ToolRowSubject>
      )}
    </ToolRow>
  )
}
