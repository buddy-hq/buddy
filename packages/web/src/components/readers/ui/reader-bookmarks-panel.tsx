import { BookmarkIcon, XIcon } from "@/icons/app-icons"
import { Button, ScrollArea } from "@buddy/ui"
import { formatReaderPositionAnchor } from "@buddy/reader-contract"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import type { ReaderBookmark, ReaderPositionAnchor } from "../reader-types"
import {
  READER_EMPTY_BOOKMARKS_MESSAGE,
  READER_VIRTUALIZE_ROW_THRESHOLD,
} from "./reader-ui-constants"

type ReaderBookmarksPanelProps = {
  bookmarks: ReaderBookmark[]
  currentBookmarkId?: string
  onToggleBookmark: () => void
  onGoToBookmark: (target: ReaderPositionAnchor) => void
  onDeleteBookmark: (bookmarkId: string) => void
  viewportRef: React.RefObject<HTMLDivElement>
}

export function ReaderBookmarksPanel({
  bookmarks,
  currentBookmarkId,
  onToggleBookmark,
  onGoToBookmark,
  onDeleteBookmark,
  viewportRef,
}: ReaderBookmarksPanelProps) {
  const renderBookmark = (bookmark: ReaderBookmark) => {
    const isCurrent = bookmark.id === currentBookmarkId
    return (
      <div
        data-current={isCurrent || undefined}
        className="group mb-0.5 flex items-center gap-1 rounded-md px-1 py-1.5 hover:bg-surface-base-hover data-[current=true]:bg-surface-interactive-weak"
      >
        <button
          type="button"
          onClick={() => onGoToBookmark(bookmark.anchor)}
          className="min-w-0 flex-1 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
        >
          <span className="block truncate text-sm font-medium text-text-base">
            {bookmark.label}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-text-weaker">
            {formatReaderPositionAnchor(bookmark.anchor)}
          </span>
        </button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => onDeleteBookmark(bookmark.id)}
          aria-label={`Delete bookmark ${bookmark.label}`}
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <XIcon />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-text-weaker">
          Bookmarks
        </span>
        <Button
          type="button"
          size="sm"
          variant={currentBookmarkId ? "secondary" : "ghost"}
          onClick={onToggleBookmark}
        >
          <BookmarkIcon data-icon="inline-start" />
          {currentBookmarkId ? "Remove" : "Add here"}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 py-2" viewportRef={viewportRef}>
        {bookmarks.length === 0 ? (
          <p className="px-1 py-4 text-sm text-text-weaker">
            {READER_EMPTY_BOOKMARKS_MESSAGE}
          </p>
        ) : bookmarks.length >= READER_VIRTUALIZE_ROW_THRESHOLD ? (
          <VirtualizedRows
            items={bookmarks}
            getItemKey={(item) => item.id}
            estimateSize={() => 56}
            getScrollElement={() => viewportRef.current}
            overscan={8}
            measure
            renderItem={renderBookmark}
          />
        ) : (
          <div>{bookmarks.map((bookmark) => <div key={bookmark.id}>{renderBookmark(bookmark)}</div>)}</div>
        )}
      </ScrollArea>
    </div>
  )
}
