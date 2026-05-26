import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@buddy/ui/lib/utils"

const badgeVariants = cva(
  "h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 focus-visible:ring-[3px] aria-invalid:ring-border-critical-base/35 aria-invalid:border-border-critical-base overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default:
          "bg-surface-interactive-base text-text-on-interactive-base [a]:hover:bg-surface-interactive-hover",
        secondary:
          "border border-border-base bg-button-secondary-base text-text-strong [a]:hover:bg-button-secondary-hover",
        destructive:
          "bg-surface-critical-weak text-text-on-critical-weak [a]:hover:bg-surface-critical-base-hover [a]:hover:text-text-on-critical-base focus-visible:ring-border-critical-base/35",
        outline:
          "border-border-base text-text-base [a]:hover:bg-surface-weak [a]:hover:text-text-weak",
        ghost: "hover:bg-surface-weak hover:text-text-weak",
        link: "text-text-interactive-base underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
