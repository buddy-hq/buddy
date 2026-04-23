import { ToolStatusIndicator } from "../../tool-header"
import { language } from "@/context/language"
import { parseSubagentSession } from "@/lib/session-family"
import { useChatStore } from "@/state/chat-store"
import { readString } from "../../types"
import type { ToolPartProps } from "../../registry"
import { formatThreadAge } from "@/components/layout/chat-left-sidebar/thread-helpers"

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

export function TaskCardHeaderContent(props: {
  displayAgent?: string
  status: ToolPartProps["state"]["status"]
  isLoading?: boolean
  onOpenSession?: () => void
}) {
  const isComplete = props.status === "completed"
  const verb = isComplete ? "Used" : "Using"

  const text = (
    <span className="text-xs font-medium text-text-base">
      {verb} {props.displayAgent || "subagent"}
    </span>
  )

  const clickableText = props.onOpenSession ? (
    <button
      type="button"
      onClick={props.onOpenSession}
      className="text-xs font-medium text-text-base transition-colors hover:text-text-interactive-base hover:underline"
    >
      {verb} {props.displayAgent || "subagent"}
    </button>
  ) : (
    text
  )

  return (
    <div className="flex items-center justify-between">
      {clickableText}
      {(props.status === "pending" || props.status === "running") && (
        <ToolStatusIndicator status={props.status} />
      )}
    </div>
  )
}
