import { memo } from "react"
import { CopyAction } from "./copy-action"

interface AssistantErrorCardProps {
  message: string
  errorName?: string
}

export const AssistantErrorCard = memo(function AssistantErrorCard({
  message,
  errorName,
}: AssistantErrorCardProps) {
  const text = message.trim()
  if (!text) return null

  return (
    <div
      role="alert"
      aria-atomic="true"
      className="mt-3 w-full rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-icon-critical-base/85">
            Assistant error
          </div>
          {errorName ? (
            <div className="mt-1 text-xs text-icon-critical-base/75">{errorName}</div>
          ) : null}
          <div className="mt-2 whitespace-pre-wrap break-words text-sm text-icon-critical-base">
            {text}
          </div>
        </div>
        <div className="shrink-0">
          <CopyAction value={text} label="Copy error" />
        </div>
      </div>
    </div>
  )
})
