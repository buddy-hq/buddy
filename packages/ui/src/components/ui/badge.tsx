import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 focus-visible:ring-[3px] aria-invalid:ring-border-critical-base/20 dark:aria-invalid:ring-border-critical-base/40 aria-invalid:border-border-critical-base overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default:
          "bg-surface-interactive-base text-text-on-interactive-base [a]:hover:bg-surface-interactive-base/80",
        secondary:
          "border border-border-base bg-button-secondary-base text-text-strong [a]:hover:bg-button-secondary-hover",
        destructive:
          "bg-surface-critical-base/10 [a]:hover:bg-surface-critical-base/20 focus-visible:ring-border-critical-base/20 dark:focus-visible:ring-border-critical-base/40 text-icon-critical-base dark:bg-surface-critical-base/20",
        outline:
          "border-border-base text-text-base [a]:hover:bg-surface-weak [a]:hover:text-text-weak",
        ghost: "hover:bg-surface-weak hover:text-text-weak dark:hover:bg-surface-weak/50",
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
