import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@buddy/ui/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 focus-visible:ring-[3px] aria-invalid:ring-border-critical-base/20 dark:aria-invalid:ring-border-critical-base/40 aria-invalid:border-border-critical-base",
  {
    variants: {
      variant: {
        default:
          "bg-surface-interactive-base text-text-on-interactive-base hover:bg-surface-interactive-base/90",
        destructive:
          "bg-surface-critical-base text-text-on-critical-base hover:bg-surface-critical-base/90 focus-visible:ring-border-critical-base/20 dark:focus-visible:ring-border-critical-base/40 dark:bg-surface-critical-base/60",
        outline:
          "border border-border-base bg-background-base shadow-xs hover:bg-surface-base-hover hover:text-text-strong",
        secondary:
          "border border-border-base bg-button-secondary-base text-text-strong shadow-xs hover:bg-button-secondary-hover",
        ghost: "hover:bg-surface-base-hover hover:text-text-strong",
        link: "text-text-interactive-base underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
