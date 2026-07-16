import type { ComponentProps } from "react"
import { cn } from "@buddy/ui/lib/utils"
import { SHADCN_HUGEICONS_STROKE_WIDTH } from "@buddy/ui/lib/icon-defaults"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({
  className,
  strokeWidth = SHADCN_HUGEICONS_STROKE_WIDTH,
  ...props
}: Omit<ComponentProps<typeof HugeiconsIcon>, "icon">) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      role="status"
      aria-label="Loading"
      strokeWidth={strokeWidth}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
