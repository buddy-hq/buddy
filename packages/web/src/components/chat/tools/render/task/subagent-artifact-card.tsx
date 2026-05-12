import { motion, AnimatePresence } from "motion/react"
import { cn } from "@buddy/ui"
import { ToolErrorPanel } from "../../tool-error-panel"
import type { ToolPartProps } from "../../registry"
import { TaskCardHeaderContent, SubagentLoadingRow } from "./task-card-header"
import { TASK_CARD_TRANSITION } from "../task-motion"

export function SubagentArtifactCard(props: {
  state: ToolPartProps["state"]
  displayAgent?: string
  openChildSession?: () => void
  taskResultOutput?: string
  children: React.ReactNode
}) {
  const isPending = props.state.status === "pending"

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isPending ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TASK_CARD_TRANSITION}
        >
          <SubagentLoadingRow />
        </motion.div>
      ) : (
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={TASK_CARD_TRANSITION}
          className="w-full overflow-hidden rounded-lg border border-border-weak-base bg-surface-base text-left"
        >
          <div
            className={cn(
              "p-2",
              props.state.status === "completed" && "border-b border-border-weak-base",
            )}
          >
            <TaskCardHeaderContent
              displayAgent={props.displayAgent}
              status={props.state.status}
              onOpenSession={props.openChildSession}
            />
          </div>

          <AnimatePresence mode="wait">
            {props.state.status === "completed" ? (
              <motion.div
                key="completed"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={TASK_CARD_TRANSITION}
                className="flex flex-col gap-2 p-2"
              >
                {props.children}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {props.state.status === "error" && props.taskResultOutput ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={TASK_CARD_TRANSITION}
              className="border-t border-border-weak-base p-2"
            >
              <ToolErrorPanel error={props.taskResultOutput} />
            </motion.div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
