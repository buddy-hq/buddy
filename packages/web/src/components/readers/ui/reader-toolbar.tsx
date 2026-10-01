import type { ReactNode } from "react"
import { BookmarkIcon, IdeaIcon } from "@/icons/app-icons"
import { cn } from "@buddy/ui"
import { ReaderToolbarButton } from "./reader-toolbar-button"
import "./reader-toolbar.css"

type ReaderToolbarProps = {
  contents: ReactNode
  marks: ReactNode
  search: ReactNode
  title: ReactNode
  compactTitle?: boolean
  zoom?: ReactNode
  view: ReactNode
  bookmarked: boolean
  onToggleBookmark: () => void
  onEnterFocus: () => void
}

export function ReaderToolbar({
  contents,
  marks,
  search,
  title,
  compactTitle,
  zoom,
  view,
  bookmarked,
  onToggleBookmark,
  onEnterFocus,
}: ReaderToolbarProps) {
  return (
    <div className="reader-toolbar-container shrink-0">
      <header
        className={cn(
          "reader-toolbar relative z-20 flex h-11 items-center gap-1 border-b border-border-weak-base px-2",
          compactTitle && "reader-toolbar-compact",
        )}
      >
        {contents}
        {marks}
        {search}

        <div
          className={cn(
            "reader-toolbar-title min-w-0 flex-1 px-2 text-center",
            compactTitle && "shrink-0 flex-none px-0",
          )}
        >
          {title}
        </div>

        {zoom}
        <span className={cn("flex shrink-0 items-center gap-1", zoom && "ml-3")}>
          {view}
          <ReaderToolbarButton
            icon={BookmarkIcon}
            label={bookmarked ? "Remove bookmark" : "Bookmark here  ⌘D"}
            pressed={bookmarked}
            onClick={onToggleBookmark}
            className={bookmarked ? "text-text-base [&_svg]:fill-current" : undefined}
          />
        </span>
        <span className="ml-3">
          <ReaderToolbarButton icon={IdeaIcon} label="Focus  ⌘." onClick={onEnterFocus} />
        </span>
      </header>
    </div>
  )
}
