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
 * - `error`: red XCircleIcon with pop-in spring
 */
export function ToolStatusIndicator({ status }: { status: ToolState["status"] }) {
  const isError = status === "error"

  return (
    <AnimatePresence mode="wait">
      {isError ? (
        <motion.span
          key="error"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
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
