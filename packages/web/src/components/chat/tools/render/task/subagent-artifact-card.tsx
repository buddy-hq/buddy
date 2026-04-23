import { motion, AnimatePresence } from "motion/react"
import { cn } from "@buddy/ui"
import { ToolErrorPanel } from "../../tool-error-panel"
import type { ToolPartProps } from "../../registry"
import { TaskCardHeaderContent } from "./task-card-header"
import { TASK_CARD_TRANSITION } from "../task-motion"

export function SubagentArtifactCard(props: {
  state: ToolPartProps["state"]
  displayAgent?: string
  isLoading: boolean
  openChildSession?: () => void
  taskResultOutput?: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TASK_CARD_TRANSITION}
      className="w-full rounded-lg border border-border-base bg-surface-raised-base text-left overflow-hidden"
    >
      <div
        className={cn("p-3", props.state.status === "completed" && "border-b border-border-base")}
      >
        <TaskCardHeaderContent
          displayAgent={props.displayAgent}
          status={props.state.status}
          isLoading={props.isLoading}
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
            className="flex flex-col gap-3 p-3"
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
          className="border-t border-border-base p-3"
        >
          <ToolErrorPanel error={props.taskResultOutput} />
        </motion.div>
      ) : null}
    </motion.div>
  )
}
