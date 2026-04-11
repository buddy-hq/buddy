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
      className="absolute z-20 -translate-x-1/2 -translate-y-full pb-1.5"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {/* Pill-shaped floating toolbar */}
      <div className="flex items-center gap-0 overflow-hidden border border-border-base/60 bg-surface-raised-base/98 shadow-lg backdrop-blur-sm">
        <ActionButton onClick={() => onCopyText(text)} label="Copy text">
          <CopyIcon className="size-3.5" />
          <span>Copy</span>
        </ActionButton>
        <div className="h-4 w-px bg-border-base/40" />
        <ActionButton onClick={onHighlight} label="Highlight">
          <HighlighterIcon className="size-3.5" />
          <span>Highlight</span>
        </ActionButton>
        <div className="h-4 w-px bg-border-base/40" />
        <ActionButton onClick={onOpenAnnotationDialog} label="Add note">
          <PencilLineIcon className="size-3.5" />
          <span>Note</span>
        </ActionButton>
        <div className="h-4 w-px bg-border-base/40" />
        <ActionButton onClick={() => onSearch(text)} label="Search selection">
          <SearchIcon className="size-3.5" />
          <span>Search</span>
        </ActionButton>
        <div className="h-4 w-px bg-border-base/40" />
        <ActionButton onClick={onClose} label="Dismiss">
          <XIcon className="size-3.5" />
        </ActionButton>
      </div>
      {/* Caret */}
      <div className="flex justify-center">
        <div className="size-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border-base/60" />
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
      className="flex items-center gap-1 px-2.5 py-2 text-[11px] text-text-weak transition-colors hover:bg-surface-weak/60 hover:text-text-base"
    >
      {children}
    </button>
  )
}
