import type { ReactNode } from "react"
import { CopyIcon, HighlighterIcon, PencilLineIcon, SearchIcon, XIcon } from "lucide-react"
import type { ReaderSelectionToolbarState } from "../foliate-reader-types"

type FoliateSelectionToolbarProps = {
  selectionAction: ReaderSelectionToolbarState | null
  onCopyText: (text: string) => void
  onHighlight: () => void
  onOpenAnnotationDialog: () => void
  onSearch: (text: string) => void
  onClose: () => void
}

export function FoliateSelectionToolbar({
  selectionAction,
  onCopyText,
  onHighlight,
  onOpenAnnotationDialog,
  onSearch,
  onClose,
}: FoliateSelectionToolbarProps) {
  if (!selectionAction) return null

  const { text, x, y } = selectionAction

  return (
    <div
      className="absolute z-40 -translate-x-1/2 -translate-y-full pb-2"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-150 origin-bottom">
        <div className="flex select-none items-center gap-0.5 rounded-full border border-border-base bg-surface-raised-base/95 p-1 shadow-lg backdrop-blur-md">
          <ActionButton onClick={() => onCopyText(text)} label="Copy text">
            <CopyIcon className="size-3.5" />
            <span className="font-medium">Copy</span>
          </ActionButton>

          <div className="mx-0.5 h-4 w-px bg-border-base/60" />

          <ActionButton onClick={onHighlight} label="Highlight">
            <HighlighterIcon className="size-3.5" />
            <span className="font-medium">Highlight</span>
          </ActionButton>

          <div className="mx-0.5 h-4 w-px bg-border-base/60" />

          <ActionButton onClick={onOpenAnnotationDialog} label="Add note">
            <PencilLineIcon className="size-3.5" />
            <span className="font-medium">Note</span>
          </ActionButton>

          <div className="mx-0.5 h-4 w-px bg-border-base/60" />

          <ActionButton onClick={() => onSearch(text)} label="Search selection">
            <SearchIcon className="size-3.5" />
            <span className="font-medium">Search</span>
          </ActionButton>

          <div className="mx-0.5 h-4 w-px bg-border-base/60" />

          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="flex size-7 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-weak hover:text-text-base"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        {/* Caret */}
        <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-border-base/60" />
      </div>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] text-text-weak transition-colors hover:bg-surface-weak hover:text-text-base"
    >
      {children}
    </button>
  )
}
