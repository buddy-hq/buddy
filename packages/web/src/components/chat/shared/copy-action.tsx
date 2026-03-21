import { useState } from "react"
import { CopyIcon, CheckIcon, Tooltip, TooltipContent, TooltipTrigger } from "@buddy/ui"

interface CopyActionProps {
  value: string
  label?: string
}

export function CopyAction({ value, label }: CopyActionProps) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    if (!value) return
    if (!("clipboard" in navigator)) return

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          void onCopy()
        }}
        onMouseDown={(e) => e.preventDefault()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={copied ? "Copied" : (label ?? "Copy")}
      >
        {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p>{copied ? "Copied" : (label ?? "Copy")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
