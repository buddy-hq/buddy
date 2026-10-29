import { useSubagentCardData, type SubagentCardInput } from "./task-card-header"
import { SubagentCard } from "./subagent-card"

export function TaskToolCard({ subagent, state, onOpenSession, directory }: SubagentCardInput) {
  const { taskTitle, openChildSession, activityLine, activityContent, status, result } =
    useSubagentCardData({ subagent, state, onOpenSession, directory })
  const error = status === "error" ? result : undefined

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
