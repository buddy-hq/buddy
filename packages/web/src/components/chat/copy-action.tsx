import { useState } from "react"
import { cn, CopyIcon, CheckIcon, Tooltip, TooltipContent, TooltipTrigger } from "@buddy/ui"

type CopyActionProps = {
  value: string
  label?: string
  /** Extra classes on the trigger (e.g. flush-left meta rows). */
  className?: string
  iconClassName?: string
}

export function CopyAction({ value, label, className, iconClassName }: CopyActionProps) {
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
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-weak hover:text-text-base",
          className,
        )}
        aria-label={copied ? "Copied" : (label ?? "Copy")}
      >
        {copied ? (
          <CheckIcon className={cn("h-4 w-4", iconClassName)} />
        ) : (
          <CopyIcon className={cn("h-4 w-4", iconClassName)} />
        )}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p>{copied ? "Copied" : (label ?? "Copy")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
