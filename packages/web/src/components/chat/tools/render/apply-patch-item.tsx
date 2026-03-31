import { useState } from "react"
import { motion } from "motion/react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  ChevronRightIcon,
} from "@buddy/ui"
import { language } from "@/context/language"

interface ApplyPatchFileItemProps {
  file: {
    relativePath: string
    type: "add" | "update" | "delete" | "move"
    before: string
    after: string
    additions: number
    deletions: number
  }
}

export function ApplyPatchFileItem({ file }: ApplyPatchFileItemProps) {
  const [open, setOpen] = useState(file.type !== "delete")

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border-base bg-background-base"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-base">{file.relativePath}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-text-weak">
              <span className="text-text-interactive-base">+{file.additions}</span>
              <span className="text-icon-critical-base">-{file.deletions}</span>
              <span className="capitalize">{file.type}</span>
            </div>
          </div>
          <motion.div
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
          >
            <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-weak" />
          </motion.div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 border-t border-border-base p-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-text-weak">
              {language.t("chatTools.before")}
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-weak">
              {file.before || language.t("chatTools.empty")}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-text-weak">
              {language.t("chatTools.after")}
            </div>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-weak">
              {file.after || language.t("chatTools.empty")}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
