import type { ToolPartProps } from "../../registry"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"

const TASK_RESULT_RE = /<task_result>([\s\S]*?)<\/task_result>/

function extractTaskResult(output: string): string | undefined {
  const match = TASK_RESULT_RE.exec(output)
  const result = match?.[1]?.trim()
  return result || undefined
}

export function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const { agentName, openChildSession, activityLine, activityIcon, activityActive, status } =
    useSubagentCardData({ state, onOpenSession, directory })
  const error = state.status === "error" ? state.output || state.error || "" : undefined
  const taskResult =
    state.status === "completed" && state.output ? extractTaskResult(state.output) : undefined

  return (
    <SubagentCard
      agentName={agentName}
      status={status}
      onOpenSession={openChildSession}
      activityLine={activityLine}
      activityIcon={activityIcon}
      activityActive={activityActive}
      error={error}
    >
      {taskResult ? <p className="px-1 py-0.5 text-sm text-text-base">{taskResult}</p> : null}
    </SubagentCard>
  )
}
