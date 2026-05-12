import { motion } from "motion/react"
import { CopyAction } from "../copy-action"
import { CONTENT_REVEAL_TRANSITION } from "../tools/tool-motion"
import { language } from "@/context/language"

type ToolErrorPanelProps = {
  error: string
  copyLabel?: string
}

/**
 * Consistent error display for all tool renderers.
 *
 * Renders as a red-bordered panel with animated height reveal and a copy button.
 * Every tool must use this component when `state.status === "error"`.
 */
export function ToolErrorPanel({ error, copyLabel }: ToolErrorPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={CONTENT_REVEAL_TRANSITION}
      className="mt-2 flex flex-col gap-2"
    >
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-icon-critical-base">
        {error}
      </pre>
      <div className="flex justify-start">
        <CopyAction value={error} label={copyLabel ?? language.t("chatTools.copyOutput")} />
      </div>
    </motion.div>
  )
}
