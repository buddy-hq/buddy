import * as React from "react"

import { cn } from "@buddy/ui/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border-base bg-input-base text-text-base focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 aria-invalid:ring-border-critical-base/35 aria-invalid:border-border-critical-base disabled:bg-input-disabled rounded-lg border px-2.5 py-2 text-base transition-colors focus-visible:ring-3 aria-invalid:ring-3 md:text-sm placeholder:text-text-weak flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
