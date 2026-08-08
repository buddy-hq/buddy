import type { ReactNode } from "react"
import { ALargeSmall as ALargeSmallIcon } from "@/icons/app-icons"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"

type ReaderPreferencesPopoverProps = {
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReaderPreferencesPopover({
  children,
  open,
  onOpenChange,
}: ReaderPreferencesPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Reader preferences">
          <ALargeSmallIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="h-[min(40rem,75vh)] w-[22.5rem] p-0">
        {children}
      </PopoverContent>
    </Popover>
  )
}
