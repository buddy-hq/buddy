import type { ReactNode } from "react"
import { ALargeSmall as ALargeSmallIcon } from "@/icons/app-icons"
import { Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import { ReaderPanelHeader } from "./reader-panel"
import { ReaderToolbarButton } from "./reader-toolbar-button"

type ReaderPreferencesPopoverProps = {
  children: ReactNode
  label?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReaderPreferencesPopover({
  children,
  label = "Text size & view",
  open,
  onOpenChange,
}: ReaderPreferencesPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ReaderToolbarButton
          icon={ALargeSmallIcon}
          label={label}
          active={Boolean(open)}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[330px] flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-0 shadow-xl"
      >
        <ReaderPanelHeader title="View" onClose={() => onOpenChange?.(false)} />
        <div className="min-h-0 flex-1">{children}</div>
      </PopoverContent>
    </Popover>
  )
}
