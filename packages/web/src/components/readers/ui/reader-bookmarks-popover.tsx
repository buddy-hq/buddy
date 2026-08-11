import { useRef } from "react"
import { BookmarkIcon } from "@/icons/app-icons"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import type { ReaderBookmark, ReaderPositionAnchor } from "../reader-types"
import { ReaderBookmarksPanel } from "./reader-bookmarks-panel"

type ReaderBookmarksPopoverProps = {
  bookmarks: ReaderBookmark[]
  currentBookmarkId?: string
  onToggleBookmark: () => void
  onGoToBookmark: (target: ReaderPositionAnchor) => void
  onDeleteBookmark: (bookmarkId: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReaderBookmarksPopover({
  bookmarks,
  currentBookmarkId,
  onToggleBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  open,
  onOpenChange,
}: ReaderBookmarksPopoverProps) {
  const viewportRef = useRef<HTMLDivElement>(null)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={currentBookmarkId ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label="Bookmarks"
        >
          <BookmarkIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="h-[min(28rem,70vh)] w-80 p-0"
      >
        <ReaderBookmarksPanel
          bookmarks={bookmarks}
          currentBookmarkId={currentBookmarkId}
          onToggleBookmark={onToggleBookmark}
          onGoToBookmark={onGoToBookmark}
          onDeleteBookmark={onDeleteBookmark}
          viewportRef={viewportRef}
        />
      </PopoverContent>
    </Popover>
  )
}
