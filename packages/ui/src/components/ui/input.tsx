import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-text-base placeholder:text-text-weak selection:bg-surface-interactive-base selection:text-text-on-interactive-base bg-input-base border-border-base h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-border-critical-base/20 dark:aria-invalid:ring-border-critical-base/40 aria-invalid:border-border-critical-base",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
