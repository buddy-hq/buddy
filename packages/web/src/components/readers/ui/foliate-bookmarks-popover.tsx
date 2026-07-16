import * as React from "react"
import { PinIcon } from "@/icons/app-icons"
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@buddy/ui"
import { FoliateBookmarksPanel } from "./foliate-bookmarks-panel"
import type { ReaderBookmark } from "../foliate-reader-types"

export interface FoliateBookmarksPopoverProps {
  bookmarks: ReaderBookmark[]
  currentBookmark: ReaderBookmark | undefined
  onToggleBookmark: () => void
  onGoToBookmark: (value: string) => void
  onDeleteBookmark: (value: string) => void
}

export function FoliateBookmarksPopover({
  bookmarks,
  currentBookmark,
  onToggleBookmark,
  onGoToBookmark,
  onDeleteBookmark,
}: FoliateBookmarksPopoverProps) {
  const bookmarkViewportRef = React.useRef<HTMLDivElement>(null)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Bookmarks"
          className={cn(
            "shrink-0 transition-colors",
            currentBookmark
              ? "text-text-interactive-base"
              : "text-text-weaker hover:text-text-base",
          )}
        >
          <PinIcon className={cn("size-4", currentBookmark && "fill-current")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[320px] max-h-[70vh] overflow-hidden p-0"
      >
        <FoliateBookmarksPanel
          bookmarks={bookmarks}
          currentBookmark={currentBookmark}
          onToggleBookmark={onToggleBookmark}
          onGoToBookmark={onGoToBookmark}
          onDeleteBookmark={onDeleteBookmark}
          bookmarkViewportRef={bookmarkViewportRef}
        />
      </PopoverContent>
    </Popover>
  )
}
