import type { ReactNode } from "react"
import { BookmarkIcon, IdeaIcon } from "@/icons/app-icons"
import { cn } from "@buddy/ui"
import { ReaderToolbarButton } from "./reader-toolbar-button"

type ReaderToolbarProps = {
  contents: ReactNode
  marks: ReactNode
  search: ReactNode
  title: ReactNode
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
  zoom,
  view,
  bookmarked,
  onToggleBookmark,
  onEnterFocus,
}: ReaderToolbarProps) {
  return (
    <header className="relative z-20 flex h-11 shrink-0 items-center gap-1 border-b border-border-weak-base px-2">
      {contents}
      {marks}
      {search}

      <div className="min-w-0 flex-1 px-2 text-center">{title}</div>

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
  )
}
