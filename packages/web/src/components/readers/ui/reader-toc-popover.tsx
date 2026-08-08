import { TableOfContents as TableOfContentsIcon } from "@/icons/app-icons"
import {
  Button,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@buddy/ui"
import type { ReaderNavigationItem } from "../reader-types"
import { READER_EMPTY_TOC_MESSAGE } from "./reader-ui-constants"
import { ReaderNavigationTree } from "./reader-navigation-tree"

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
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Table of contents">
          <TableOfContentsIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-80 p-0">
        <PopoverHeader className="border-b px-3 py-2.5">
          <PopoverTitle>Table of contents</PopoverTitle>
        </PopoverHeader>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto px-3 py-3">
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
        </div>
      </PopoverContent>
    </Popover>
  )
}
