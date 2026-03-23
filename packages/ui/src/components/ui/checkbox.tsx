import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-border-base bg-input-base data-checked:bg-surface-interactive-base data-checked:text-text-on-interactive-base dark:data-checked:bg-surface-interactive-base data-checked:border-border-interactive-base aria-invalid:aria-checked:border-border-interactive-base aria-invalid:border-border-critical-base dark:aria-invalid:border-border-critical-base/50 focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 aria-invalid:ring-border-critical-base/20 dark:aria-invalid:ring-border-critical-base/40 flex size-4 items-center justify-center rounded-[4px] border transition-colors group-has-disabled/field:opacity-50 focus-visible:ring-3 aria-invalid:ring-3 peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="[&>svg]:size-3.5 grid place-content-center text-current transition-none"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
