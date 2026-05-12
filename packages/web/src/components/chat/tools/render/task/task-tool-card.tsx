import { motion } from "motion/react"
import { ToolErrorPanel } from "../../tool-error-panel"
import type { ToolPartProps } from "../../registry"
import { useTaskCardHeader, TaskCardHeaderContent, SubagentLoadingRow } from "./task-card-header"
import { TASK_CARD_TRANSITION } from "../task-motion"

export function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const { displayAgent, openChildSession } = useTaskCardHeader({
    state,
    onOpenSession,
    directory,
  })
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0
  const isPending = state.status === "pending"

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={TASK_CARD_TRANSITION}
      className="flex flex-col gap-1.5"
    >
      {isPending ? (
        <SubagentLoadingRow />
      ) : (
        <TaskCardHeaderContent
          displayAgent={displayAgent}
          status={state.status}
          onOpenSession={state.status !== "error" ? openChildSession : undefined}
        />
      )}
      {state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
    </motion.div>
  )
}
