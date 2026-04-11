import { PinIcon, XIcon } from "lucide-react"
import { Button, ScrollArea } from "@buddy/ui"
import { BOOKMARKS_EMPTY_MESSAGE, VIRTUALIZE_ROW_THRESHOLD } from "../foliate-reader-constants"
import type { ReaderBookmark } from "../foliate-reader-types"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"

export interface FoliateBookmarksPanelProps {
  bookmarks: ReaderBookmark[]
  currentBookmark: ReaderBookmark | undefined
  onToggleBookmark: () => void
  onGoToBookmark: (value: string) => void
  onDeleteBookmark: (value: string) => void
  bookmarkViewportRef: React.RefObject<HTMLDivElement>
}

export function FoliateBookmarksPanel({
  bookmarks,
  currentBookmark,
  onToggleBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  bookmarkViewportRef,
}: FoliateBookmarksPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header with toggle */}
      <div className="flex items-center justify-between border-b border-border-base/40 px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-weaker">
          Bookmarks
        </span>
        <Button
          size="sm"
          variant={currentBookmark ? "secondary" : "ghost"}
          onClick={onToggleBookmark}
          className="h-7 gap-1.5 text-[11px]"
        >
          <PinIcon className="size-3" />
          {currentBookmark ? "Remove" : "Add here"}
        </Button>
      </div>

      <ScrollArea className="h-full px-3 py-2" viewportRef={bookmarkViewportRef}>
        {bookmarks.length === 0 ? (
          <p className="px-1 py-4 text-[12px] text-text-weaker">{BOOKMARKS_EMPTY_MESSAGE}</p>
        ) : bookmarks.length >= VIRTUALIZE_ROW_THRESHOLD ? (
          <VirtualizedRows
            items={bookmarks}
            getItemKey={(item) => item.value}
            estimateSize={() => 52}
            getScrollElement={() => bookmarkViewportRef.current}
            overscan={8}
            measure
            renderItem={(bookmark) => (
              <div className="group mb-0.5 flex items-center gap-1 rounded px-1 py-1.5 transition-colors hover:bg-surface-weak/60">
                <button
                  type="button"
                  onClick={() => onGoToBookmark(bookmark.value)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[12px] font-medium text-text-base">
                    {bookmark.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-text-weaker">
                    {bookmark.value}
                  </div>
                </button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onDeleteBookmark(bookmark.value)}
                  className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            )}
          />
        ) : (
          <div>
            {bookmarks.map((bookmark) => (
              <div
                key={bookmark.value}
                className="group mb-0.5 flex items-center gap-1 rounded px-1 py-1.5 transition-colors hover:bg-surface-weak/60"
              >
                <button
                  type="button"
                  onClick={() => onGoToBookmark(bookmark.value)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-[12px] font-medium text-text-base">
                    {bookmark.label}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-text-weaker">
                    {bookmark.value}
                  </div>
                </button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onDeleteBookmark(bookmark.value)}
                  className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
