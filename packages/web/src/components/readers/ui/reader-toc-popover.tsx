import { TableOfContents as TableOfContentsIcon } from "@/icons/app-icons"
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from "@buddy/ui"
import type { ReaderNavigationItem } from "../reader-types"
import { READER_EMPTY_TOC_MESSAGE } from "./reader-ui-constants"
import { ReaderNavigationTree } from "./reader-navigation-tree"
import { ReaderPanelHeader } from "./reader-panel"
import { ReaderToolbarButton } from "./reader-toolbar-button"

type ReaderTocPopoverProps = {
  items: ReaderNavigationItem[]
  activeItemId?: string
  activeLabel?: string
  onSelect: (navigationId: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReaderTocPopover({
  items,
  activeItemId,
  activeLabel,
  onSelect,
  open,
  onOpenChange,
}: ReaderTocPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ReaderToolbarButton icon={TableOfContentsIcon} label="Contents" active={Boolean(open)} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="flex h-[min(28rem,70vh)] w-[280px] flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-0 shadow-xl"
      >
        <ReaderPanelHeader title="Contents" onClose={() => onOpenChange?.(false)} />
        <ScrollArea className="min-h-0 flex-1 px-3 py-3">
          {items.length > 0 ? (
            <ReaderNavigationTree
              items={items}
              activeItemId={activeItemId}
              activeLabel={activeLabel}
              onSelect={onSelect}
            />
          ) : (
            <p className="px-1 py-4 text-sm text-text-weaker">{READER_EMPTY_TOC_MESSAGE}</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
