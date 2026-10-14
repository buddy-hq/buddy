import { Button } from "@buddy/ui"
import type { SubagentCompletion } from "@buddy/transcript-contract/subagent"

const OUTCOME_LABEL = { completed: "Completed", error: "Failed", cancelled: "Cancelled" } as const

export function SubagentCompletionRow(props: {
  completion: SubagentCompletion
  onOpenSession?: (sessionID: string) => void
}) {
  const onOpenSession = props.onOpenSession
  return (
    <div
      data-component="subagent-completion-row"
      data-outcome={props.completion.outcome}
      role="status"
      className="flex min-w-0 items-center gap-2 text-xs text-text-weak"
    >
      <span className="shrink-0">{OUTCOME_LABEL[props.completion.outcome]}</span>
      <Button
        variant="ghost"
        size="xs"
        className="min-w-0"
        disabled={!onOpenSession}
        onClick={() => onOpenSession?.(props.completion.childSessionID)}
      >
        <span className="truncate">{props.completion.description ?? "Delegated task"}</span>
      </Button>
    </div>
  )
}
