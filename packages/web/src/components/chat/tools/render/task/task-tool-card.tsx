import type { ToolPartProps } from "../../registry"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"

export function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const { taskTitle, openChildSession, activityLine, activityContent, status } =
    useSubagentCardData({ state, onOpenSession, directory })
  const error = state.status === "error" ? state.output || state.error || "" : undefined

  return (
    <SubagentCard
      taskTitle={taskTitle}
      status={status}
      onOpenSession={openChildSession}
      activityLine={activityLine}
      activityContent={activityContent}
      error={error}
    />
  )
}
