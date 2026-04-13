import * as React from "react"
import { TableOfContents } from "lucide-react"
import { Button, Popover, PopoverContent, PopoverTrigger, ScrollArea } from "@buddy/ui"
import { FoliateTocTree } from "./foliate-toc-tree"
import type { FoliateReaderSnapshot } from "../foliate-reader-types"
import { TOC_EMPTY_MESSAGE } from "../foliate-reader-constants"

export interface FoliateTocPopoverProps {
  snapshot: FoliateReaderSnapshot | null
  tocLabel: string | undefined
  onSelectHref: (href: string) => void
}

export function FoliateTocPopover({ snapshot, tocLabel, onSelectHref }: FoliateTocPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Table of contents"
          className="shrink-0 text-text-weaker hover:text-text-base"
        >
          <TableOfContents className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[320px] max-h-[70vh] overflow-hidden p-0"
      >
        <ScrollArea className="h-full px-3 py-3">
          {snapshot?.toc?.length ? (
            <FoliateTocTree items={snapshot.toc} activeLabel={tocLabel} onSelect={onSelectHref} />
          ) : (
            <p className="px-1 py-4 text-[12px] text-text-weaker">{TOC_EMPTY_MESSAGE}</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}