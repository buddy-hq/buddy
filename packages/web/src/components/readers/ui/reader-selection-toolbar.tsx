import type { ReactNode } from "react"
import { CopyIcon, HighlighterIcon, PencilLineIcon, SearchIcon, XIcon } from "@/icons/app-icons"
import { Button } from "@buddy/ui"
import type { ReaderSelectionToolbarViewModel } from "../reader-types"
import {
  ReaderFloatingOverlay,
  READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY,
} from "./reader-floating-overlay"

export type ReaderSelectionToolbarState = ReaderSelectionToolbarViewModel

type ReaderSelectionToolbarProps = {
  selectionAction: ReaderSelectionToolbarState | null
  anchorRoot: HTMLElement | null
  onCopyText: (text: string) => void
  onHighlight: () => void
  onOpenAnnotationDialog: () => void
  onSearch: (text: string) => void
  onClose: () => void
}

export function ReaderSelectionToolbar({
  selectionAction,
  anchorRoot,
  onCopyText,
  onHighlight,
  onOpenAnnotationDialog,
  onSearch,
  onClose,
}: ReaderSelectionToolbarProps) {
  if (!selectionAction) return null

  const { text, x, y } = selectionAction

  return (
    <ReaderFloatingOverlay
      anchorRoot={anchorRoot}
      dataComponent="reader-selection-toolbar"
      className="-translate-x-1/2 -translate-y-full pb-2"
      x={x}
      y={y}
    >
      <div className="relative flex flex-col items-center">
        <div
          role="toolbar"
          aria-label="Selection actions"
          className="flex select-none items-center gap-0.5 rounded-full border bg-surface-raised-base p-1 shadow-lg"
        >
          <ActionButton onClick={() => onCopyText(text)} label="Copy text">
            <CopyIcon data-icon="inline-start" />
            <span className="font-medium">Copy</span>
          </ActionButton>

          <ActionButton onClick={onHighlight} label="Highlight">
            <HighlighterIcon data-icon="inline-start" />
            <span className="font-medium">Highlight</span>
          </ActionButton>

          <ActionButton onClick={onOpenAnnotationDialog} label="Add note">
            <PencilLineIcon data-icon="inline-start" />
            <span className="font-medium">Note</span>
          </ActionButton>

          <ActionButton onClick={() => onSearch(text)} label="Search selection">
            <SearchIcon data-icon="inline-start" />
            <span className="font-medium">Search</span>
          </ActionButton>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Dismiss"
            className="rounded-full"
          >
            <XIcon />
          </Button>
        </div>

        <div
          aria-hidden="true"
          className="absolute top-full h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-border-base/60"
          style={{
            left: `calc(50% + var(${READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY}, 0px))`,
          }}
        />
      </div>
    </ReaderFloatingOverlay>
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={label}
      className="rounded-full"
    >
      {children}
    </Button>
  )
}
