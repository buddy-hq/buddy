import { motion } from "motion/react"
import { cn } from "@buddy/ui"
import { ToolOutputPanel } from "../../tool-output-panel"
import { ToolErrorPanel } from "../../tool-error-panel"
import type { ToolPartProps } from "../../registry"
import { useTaskCardHeader, TaskCardHeaderContent } from "./task-card-header"
import {
  TASK_CARD_TRANSITION,
  BUTTON_PRESS_SCALE,
  BUTTON_PRESS_DURATION,
  LOADING_PULSE_DURATION,
  LOADING_PULSE_EASE,
} from "../task-motion"

export function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const { displayAgent, openChildSession, isLoading } = useTaskCardHeader({
    state,
    onOpenSession,
    directory,
  })
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={TASK_CARD_TRANSITION}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-surface-raised-base p-3 text-left",
        openChildSession && state.status !== "error"
          ? "border-border-base hover:border-border-hover transition-colors"
          : "border-border-base",
      )}
    >
      {isLoading ? (
        <motion.div
          className="absolute inset-0 -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-surface-interactive-base/5 to-transparent"
            animate={{
              x: ["-100%", "200%"],
            }}
            transition={{
              duration: LOADING_PULSE_DURATION,
              repeat: Number.POSITIVE_INFINITY,
              ease: LOADING_PULSE_EASE,
            }}
          />
        </motion.div>
      ) : null}

      <TaskCardHeaderContent
        displayAgent={displayAgent}
        status={state.status}
        isLoading={isLoading}
        onOpenSession={openChildSession}
      />

      {state.status === "error" && showOutput ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={TASK_CARD_TRANSITION}
          className="mt-3 pt-3 border-t border-border-base/50"
        >
          <ToolErrorPanel error={output} />
        </motion.div>
      ) : null}
    </motion.div>
  )

  if (openChildSession && state.status !== "error") {
    return (
      <motion.button
        type="button"
        className="w-full text-left"
        onClick={openChildSession}
        whileTap={{ scale: BUTTON_PRESS_SCALE }}
        transition={{ duration: BUTTON_PRESS_DURATION, ease: [0.23, 1, 0.32, 1] }}
      >
        {cardContent}
      </motion.button>
    )
  }

  return cardContent
}
