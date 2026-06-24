import type { ToolPartProps } from "../../registry"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"

export function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const {
    agentName,
    taskTitle,
    openChildSession,
    activityLine,
    activityContent,
    activityIcon,
    activityActive,
    status,
  } = useSubagentCardData({ state, onOpenSession, directory })
  const error = state.status === "error" ? state.output || state.error || "" : undefined

  return (
    <SubagentCard
      agentName={agentName}
      taskTitle={taskTitle}
      status={status}
      onOpenSession={openChildSession}
      activityLine={activityLine}
      activityContent={activityContent}
      activityIcon={activityIcon}
      activityActive={activityActive}
      error={error}
    />
  )
}
