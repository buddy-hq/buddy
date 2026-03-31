import type { ToolState } from "../tools/registry"
import { CopyAction } from "../copy-action"
import { cn } from "@buddy/ui"

interface ToolOutputPanelProps {
  output: string
  status: ToolState["status"]
  copyLabel: string
}

export function ToolOutputPanel({ output, status, copyLabel }: ToolOutputPanelProps) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <pre
        className={cn(
          "max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-background-base px-3 py-2 text-xs text-text-weak",
          status === "error" &&
            "border-border-critical-base/40 bg-surface-critical-base/10 text-icon-critical-base",
        )}
      >
        {output}
      </pre>
      <div className="flex justify-start">
        <CopyAction value={output} label={copyLabel} />
      </div>
    </div>
  )
}
