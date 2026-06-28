import { AnimatePresence, motion } from "motion/react"
import { XCircleIcon } from "lucide-react"
import { language } from "@/context/language"
import { MOTION_SNAPPY } from "./tool-motion"
import type { ToolState } from "./registry"

/**
 * Unified status indicator for all tool renderers.
 *
 * - `pending` / `running`: nothing — the TextShimmer on the title is the indicator
 * - `completed`: nothing — absence of shimmer is sufficient
 * - `error`: red XCircleIcon, animated only when a mounted tool enters the error state
 */
export function ToolStatusIndicator({ status }: { status: ToolState["status"] }) {
  const isError = status === "error"

  return (
    <AnimatePresence initial={false}>
      {isError ? (
        <motion.span
          key="error"
          initial={{ opacity: 0, transform: "scale(0.96)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          exit={{ opacity: 0, transform: "scale(0.96)" }}
          transition={MOTION_SNAPPY}
          className="inline-flex shrink-0"
          title={language.t("chatTools.status.error")}
        >
          <XCircleIcon className="size-3 text-icon-critical-base" />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}
